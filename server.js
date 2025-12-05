const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let botConfig = {
    token: process.env.DISCORD_TOKEN || '',
    generalRole: process.env.GENERAL_PERMS_ROLE_ID || '',
    modRole: process.env.MODERATION_PERMS_ROLE_ID || '',
    musicRole: process.env.MUSIC_PERMS_ROLE_ID || '',
    verifiedRole: process.env.VERIFIED_ROLE_ID || '',
    ownerId: process.env.OWNER_ID || '',
    prefix: process.env.PREFIX || '!',
    status: 'online',
    activityType: 'PLAYING',
    activityText: '!help'
};

let musicConfig = {
    host: 'localhost',
    port: 2333,
    password: 'youshallnotpass'
};

let botClient = null;
let botConnected = false;

app.post('/api/verify-token', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.json({ valid: false, error: 'No token provided' });
    }

    try {
        const response = await fetch('https://discord.com/api/v10/users/@me', {
            headers: {
                'Authorization': `Bot ${token}`
            }
        });

        if (response.status === 200) {
            const data = await response.json();
            return res.json({
                valid: true,
                id: data.id,
                username: data.username,
                discriminator: data.discriminator || '0',
                avatar: data.avatar
            });
        } else if (response.status === 401) {
            return res.json({ valid: false, error: 'Invalid token' });
        } else {
            return res.json({ valid: false, error: `API Error: ${response.status}` });
        }
    } catch (error) {
        return res.json({ valid: false, error: error.message });
    }
});

app.post('/api/connect', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.json({ success: false, error: 'No token provided' });
    }

    try {
        botConfig.token = token;
        
        if (botClient) {
            try {
                await botClient.destroy();
            } catch (e) {}
        }

        const { Client, GatewayIntentBits, Partials } = require('discord.js');
        
        botClient = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMembers
            ],
            partials: [Partials.Message, Partials.Channel]
        });

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30000);
            
            botClient.once('ready', () => {
                clearTimeout(timeout);
                botConnected = true;
                resolve();
            });

            botClient.once('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            botClient.login(token).catch(reject);
        });

        const guildCount = botClient.guilds.cache.size;
        
        return res.json({ 
            success: true, 
            guilds: guildCount,
            username: botClient.user.username
        });

    } catch (error) {
        botConnected = false;
        return res.json({ success: false, error: error.message });
    }
});

app.post('/api/status', (req, res) => {
    const { status } = req.body;
    
    if (!botClient || !botConnected) {
        return res.json({ success: false, error: 'Bot not connected' });
    }

    const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
    if (!validStatuses.includes(status)) {
        return res.json({ success: false, error: 'Invalid status' });
    }

    try {
        botClient.user.setStatus(status);
        botConfig.status = status;
        return res.json({ success: true });
    } catch (error) {
        return res.json({ success: false, error: error.message });
    }
});

app.post('/api/activity', (req, res) => {
    const { type, text, url } = req.body;
    
    if (!botClient || !botConnected) {
        return res.json({ success: false, error: 'Bot not connected' });
    }

    const { ActivityType } = require('discord.js');
    
    const activityTypes = {
        'PLAYING': ActivityType.Playing,
        'STREAMING': ActivityType.Streaming,
        'LISTENING': ActivityType.Listening,
        'WATCHING': ActivityType.Watching,
        'COMPETING': ActivityType.Competing
    };

    if (!activityTypes[type]) {
        return res.json({ success: false, error: 'Invalid activity type' });
    }

    try {
        const activityOptions = {
            name: text || 'Discord Bot',
            type: activityTypes[type]
        };

        if (type === 'STREAMING' && url) {
            activityOptions.url = url;
        }

        botClient.user.setActivity(activityOptions);
        botConfig.activityType = type;
        botConfig.activityText = text;
        
        return res.json({ success: true });
    } catch (error) {
        return res.json({ success: false, error: error.message });
    }
});

app.post('/api/config', (req, res) => {
    const { generalRole, modRole, musicRole, verifiedRole, ownerId, prefix } = req.body;
    
    botConfig.generalRole = generalRole || '';
    botConfig.modRole = modRole || '';
    botConfig.musicRole = musicRole || '';
    botConfig.verifiedRole = verifiedRole || '';
    botConfig.ownerId = ownerId || '';
    botConfig.prefix = prefix || '!';
    
    return res.json({ success: true, config: botConfig });
});

app.post('/api/music-config', (req, res) => {
    const { host, port, password } = req.body;
    
    musicConfig.host = host || 'localhost';
    musicConfig.port = port || 2333;
    musicConfig.password = password || 'youshallnotpass';
    
    return res.json({ success: true, config: musicConfig });
});

app.get('/api/status', (req, res) => {
    res.json({
        connected: botConnected,
        config: {
            ...botConfig,
            token: botConfig.token ? '***HIDDEN***' : ''
        },
        musicConfig
    });
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Configuration panel running at http://0.0.0.0:${PORT}`);
});
