const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActivityType,
  EmbedBuilder,
  Collection,
  Partials,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder
} = require('discord.js');
const { Manager } = require('erela.js');

const app = express();
const PORT = 5000;
const DEFAULT_COLOR = '#0099ff';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let botConfig = {
    token: '',
    generalRole: '',
    modRole: '',
    musicRole: '',
    verifiedRole: '',
    ownerId: '',
    prefix: '!',
    status: 'online',
    activityType: 'PLAYING',
    activityText: '!help'
};

let musicConfig = {
    host: 'localhost',
    port: 2333,
    password: 'youshallnotpass'
};

let client = null;
let botConnected = false;

const ADMIN_PASSWORD = process.env.PANEL_PASSWORD || 'admin123';

function requireAuth(req, res, next) {
    const authHeader = req.headers['x-panel-auth'];
    if (authHeader === ADMIN_PASSWORD) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/verify-token', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.json({ valid: false, error: 'No token provided' });
    }

    const cleanToken = token.trim();
    
    if (!cleanToken || cleanToken.length < 50) {
        return res.json({ valid: false, error: 'Token format appears invalid' });
    }

    try {
        const response = await fetch('https://discord.com/api/v10/users/@me', {
            method: 'GET',
            headers: {
                'Authorization': `Bot ${cleanToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            return res.json({
                valid: true,
                id: data.id,
                username: data.username,
                discriminator: data.discriminator || '0',
                avatar: data.avatar,
                globalName: data.global_name
            });
        } else if (response.status === 401) {
            return res.json({ valid: false, error: 'Invalid token - please check your bot token' });
        } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            return res.json({ valid: false, error: `Discord API Error (${response.status}): ${errorText}` });
        }
    } catch (error) {
        console.error('Token verification error:', error);
        return res.json({ valid: false, error: `Network error: ${error.message}` });
    }
});

function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function initializeBot(token) {
    if (client) {
        try {
            await client.destroy();
        } catch (e) {}
    }

    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMembers
        ],
        partials: [Partials.Message, Partials.Channel]
    });

    client.commands = new Collection();
    client.cooldowns = new Collection();
    client.queue = new Map();

    client.manager = new Manager({
        nodes: [{
            host: musicConfig.host,
            port: musicConfig.port,
            password: musicConfig.password,
            secure: false
        }],
        autoPlay: true,
        send(id, payload) {
            const guild = client.guilds.cache.get(id);
            if (guild) guild.shard.send(payload);
        }
    })
    .on('nodeConnect', node => console.log(`[Music] Node "${node.options.host}" connected`))
    .on('nodeError', (node, error) => console.log(`[Music] Node "${node.options.host}" error: ${error.message}`))
    .on('nodeDisconnect', node => console.log(`[Music] Node "${node.options.host}" disconnected`))
    .on('trackStart', (player, track) => {
        const channel = client.channels.cache.get(player.textChannel);
        if (channel) {
            const embed = new EmbedBuilder()
                .setColor(DEFAULT_COLOR)
                .setTitle('Now Playing')
                .setDescription(`[${track.title}](${track.uri})`)
                .addFields(
                    { name: 'Duration', value: formatDuration(track.duration), inline: true },
                    { name: 'Requested by', value: track.requester?.toString() || 'Unknown', inline: true }
                );
            channel.send({ embeds: [embed] });
        }
    })
    .on('queueEnd', player => {
        const channel = client.channels.cache.get(player.textChannel);
        if (channel) {
            channel.send({ embeds: [new EmbedBuilder().setColor('Grey').setDescription('Queue ended. Leaving voice channel.')] });
        }
        player.destroy();
    });

    const slashData = [];
    const commandsConfig = [
        { name: 'ping', role: botConfig.generalRole,
            slash: new SlashCommandBuilder().setName('ping').setDescription('Check latency') },
        { name: 'verification-setup', role: botConfig.generalRole,
            slash: new SlashCommandBuilder()
                .setName('verification-setup')
                .setDescription('Setup verification message')
                .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
                .addBooleanOption(o => o.setName('custom').setDescription('Use custom text').setRequired(true))
                .addStringOption(o => o.setName('text').setDescription('Custom message'))
        },
        { name: 'lockdown', role: botConfig.modRole,
            slash: new SlashCommandBuilder().setName('lockdown').setDescription('Lockdown this channel')
        },
        { name: 'unlockdown', role: botConfig.modRole,
            slash: new SlashCommandBuilder().setName('unlockdown').setDescription('Lift lockdown')
        },
        { name: 'play', role: botConfig.musicRole,
            slash: new SlashCommandBuilder()
                .setName('play')
                .setDescription('Play a song from YouTube')
                .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true))
        },
        { name: 'skip', role: botConfig.musicRole,
            slash: new SlashCommandBuilder().setName('skip').setDescription('Skip the current song')
        },
        { name: 'stop', role: botConfig.musicRole,
            slash: new SlashCommandBuilder().setName('stop').setDescription('Stop music and clear queue')
        },
        { name: 'pause', role: botConfig.musicRole,
            slash: new SlashCommandBuilder().setName('pause').setDescription('Pause the current song')
        },
        { name: 'resume', role: botConfig.musicRole,
            slash: new SlashCommandBuilder().setName('resume').setDescription('Resume the paused song')
        },
        { name: 'queue', role: botConfig.musicRole,
            slash: new SlashCommandBuilder().setName('queue').setDescription('Show the music queue')
        },
        { name: 'volume', role: botConfig.musicRole,
            slash: new SlashCommandBuilder()
                .setName('volume')
                .setDescription('Set the volume')
                .addIntegerOption(o => o.setName('level').setDescription('Volume level (0-100)').setRequired(true))
        },
        { name: 'nowplaying', role: botConfig.musicRole,
            slash: new SlashCommandBuilder().setName('nowplaying').setDescription('Show currently playing song')
        }
    ];

    commandsConfig.forEach(cmd => {
        slashData.push(cmd.slash.toJSON());
        client.commands.set(cmd.name, cmd);
    });

    const rest = new REST({ version: '10' }).setToken(token);

    async function deploySlash(guildId) {
        try {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: slashData }
            );
        } catch (e) {
            console.error('Failed to deploy slash commands:', e);
        }
    }

    const sendError = (channel, desc) => channel.send({ embeds: [new EmbedBuilder().setColor('Red').setDescription(`❌ ${desc}`)] });

    const applyCooldown = (userId, cmd) => {
        const key = `${userId}-${cmd}`;
        client.cooldowns.set(key, Date.now());
        setTimeout(() => client.cooldowns.delete(key), 5000);
    };

    const onCooldown = (userId, cmd) => {
        const key = `${userId}-${cmd}`;
        const last = client.cooldowns.get(key);
        return last && (Date.now() - last < 5000);
    };

    async function execCommand(name, context, args = [], interaction = null) {
        const userId = interaction ? interaction.user.id : context.author.id;
        if (onCooldown(userId, name) && userId !== botConfig.ownerId) return;
        applyCooldown(userId, name);

        const cmd = client.commands.get(name);
        if (!cmd) return;
        const member = interaction ? interaction.member : context.member;

        if (cmd.role && !member.roles.cache.has(cmd.role)) {
            return interaction
                ? interaction.reply({ content: '❌ Missing role', ephemeral: true })
                : sendError(context.channel, 'Missing role');
        }

        switch (name) {
            case 'ping': {
                const start = Date.now();
                if (interaction) {
                    await interaction.reply('Pinging...');
                    interaction.editReply(`Pong! ${Date.now() - start}ms`);
                } else {
                    const m = await context.reply('Pinging...');
                    m.edit(`Pong! ${Date.now() - start}ms`);
                }
                break;
            }
            case 'verification-setup': {
                const channel = interaction
                    ? interaction.options.getChannel('channel')
                    : context.mentions.channels.first();
                const custom = interaction
                    ? interaction.options.getBoolean('custom')
                    : args[0] === 'true';
                const text = interaction
                    ? interaction.options.getString('text')
                    : args.slice(1).join(' ');

                if (!channel || channel.type !== 0) return sendError(context.channel, 'Invalid channel');
                const desc = custom && text ? text : 'Please verify to get access in the server!';
                const embed = new EmbedBuilder().setColor(DEFAULT_COLOR).setDescription(desc);
                const button = new ButtonBuilder().setCustomId('verify').setLabel('Verify').setStyle(ButtonStyle.Success);
                const row = new ActionRowBuilder().addComponents(button);
                await channel.send({ embeds: [embed], components: [row] });
                interaction ? interaction.reply({ content: 'Verification sent.', ephemeral: true }) : context.reply('Verification sent.');
                break;
            }
            case 'lockdown': {
                const channel = interaction ? interaction.channel : context.channel;
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: false, SendMessages: false });
                const msg = '🔒 Channel is now in lockdown.';
                interaction ? interaction.reply({ content: msg, ephemeral: true }) : context.reply(msg);
                break;
            }
            case 'unlockdown': {
                const channel = interaction ? interaction.channel : context.channel;
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { ViewChannel: true, SendMessages: true });
                const msg = '🔓 Channel lockdown lifted.';
                interaction ? interaction.reply({ content: msg, ephemeral: true }) : context.reply(msg);
                break;
            }
            case 'play': {
                const query = interaction ? interaction.options.getString('query') : args.join(' ');
                const voiceChannel = member.voice?.channel;
                
                if (!voiceChannel) {
                    const msg = 'You must be in a voice channel to play music!';
                    return interaction ? interaction.reply({ content: msg, ephemeral: true }) : sendError(context.channel, msg);
                }
                
                if (!query) {
                    const msg = 'Please provide a song name or URL.';
                    return interaction ? interaction.reply({ content: msg, ephemeral: true }) : sendError(context.channel, msg);
                }

                try {
                    if (interaction) await interaction.deferReply();
                    
                    let player = client.manager.players.get(context.guild?.id || interaction.guild.id);
                    
                    if (!player) {
                        player = client.manager.create({
                            guild: context.guild?.id || interaction.guild.id,
                            voiceChannel: voiceChannel.id,
                            textChannel: context.channel?.id || interaction.channel.id,
                            selfDeaf: true
                        });
                    }

                    if (player.state !== 'CONNECTED') player.connect();

                    const res = await client.manager.search(query, interaction?.user || context.author);

                    if (res.loadType === 'LOAD_FAILED' || res.loadType === 'NO_MATCHES') {
                        const msg = 'No results found for your query.';
                        return interaction ? interaction.editReply(msg) : context.reply(msg);
                    }

                    if (res.loadType === 'PLAYLIST_LOADED') {
                        for (const track of res.tracks) {
                            player.queue.add(track);
                        }
                        const msg = `Added **${res.tracks.length}** tracks from playlist **${res.playlist.name}**`;
                        interaction ? interaction.editReply(msg) : context.reply(msg);
                    } else {
                        player.queue.add(res.tracks[0]);
                        const msg = `Added **${res.tracks[0].title}** to the queue`;
                        interaction ? interaction.editReply(msg) : context.reply(msg);
                    }

                    if (!player.playing && !player.paused) player.play();
                } catch (error) {
                    console.error('[Music] Play error:', error);
                    const msg = 'An error occurred while trying to play music. Make sure Lavalink is running.';
                    interaction ? interaction.editReply(msg) : sendError(context.channel, msg);
                }
                break;
            }
            case 'skip': {
                const player = client.manager.players.get(context.guild?.id || interaction.guild.id);
                if (!player || !player.queue.current) {
                    const msg = 'No music is currently playing.';
                    return interaction ? interaction.reply({ content: msg, ephemeral: true }) : sendError(context.channel, msg);
                }
                player.stop();
                const msg = 'Skipped the current song.';
                interaction ? interaction.reply(msg) : context.reply(msg);
                break;
            }
            case 'stop': {
                const player = client.manager.players.get(context.guild?.id || interaction.guild.id);
                if (!player) {
                    const msg = 'No music is currently playing.';
                    return interaction ? interaction.reply({ content: msg, ephemeral: true }) : sendError(context.channel, msg);
                }
                player.destroy();
                const msg = 'Stopped the music and cleared the queue.';
                interaction ? interaction.reply(msg) : context.reply(msg);
                break;
            }
            case 'pause': {
                const player = client.manager.players.get(context.guild?.id || interaction.guild.id);
                if (!player || !player.queue.current) {
                    const msg = 'No music is currently playing.';
                    return interaction ? interaction.reply({ content: msg, ephemeral: true }) : sendError(context.channel, msg);
                }
                player.pause(true);
                const msg = 'Paused the music.';
                interaction ? interaction.reply(msg) : context.reply(msg);
                break;
            }
            case 'resume': {
                const player = client.manager.players.get(context.guild?.id || interaction.guild.id);
                if (!player) {
                    const msg = 'No music player found.';
                    return interaction ? interaction.reply({ content: msg, ephemeral: true }) : sendError(context.channel, msg);
                }
                player.pause(false);
                const msg = 'Resumed the music.';
                interaction ? interaction.reply(msg) : context.reply(msg);
                break;
            }
            case 'queue': {
                const player = client.manager.players.get(context.guild?.id || interaction.guild.id);
                if (!player || !player.queue.current) {
                    const msg = 'No music is currently playing.';
                    return interaction ? interaction.reply({ content: msg, ephemeral: true }) : sendError(context.channel, msg);
                }
                
                const queue = player.queue;
                const embed = new EmbedBuilder()
                    .setColor(DEFAULT_COLOR)
                    .setTitle('Music Queue')
                    .setDescription(
                        `**Now Playing:** ${queue.current.title}\n\n` +
                        (queue.length > 0 
                            ? queue.slice(0, 10).map((track, i) => `${i + 1}. ${track.title}`).join('\n') +
                                (queue.length > 10 ? `\n...and ${queue.length - 10} more` : '')
                            : 'No more songs in queue')
                    );
                
                interaction ? interaction.reply({ embeds: [embed] }) : context.channel.send({ embeds: [embed] });
                break;
            }
            case 'volume': {
                const level = interaction ? interaction.options.getInteger('level') : parseInt(args[0]);
                const player = client.manager.players.get(context.guild?.id || interaction.guild.id);
                
                if (!player) {
                    const msg = 'No music player found.';
                    return interaction ? interaction.reply({ content: msg, ephemeral: true }) : sendError(context.channel, msg);
                }
                
                if (isNaN(level) || level < 0 || level > 100) {
                    const msg = 'Volume must be between 0 and 100.';
                    return interaction ? interaction.reply({ content: msg, ephemeral: true }) : sendError(context.channel, msg);
                }
                
                player.setVolume(level);
                const msg = `Volume set to ${level}%`;
                interaction ? interaction.reply(msg) : context.reply(msg);
                break;
            }
            case 'nowplaying': {
                const player = client.manager.players.get(context.guild?.id || interaction.guild.id);
                if (!player || !player.queue.current) {
                    const msg = 'No music is currently playing.';
                    return interaction ? interaction.reply({ content: msg, ephemeral: true }) : sendError(context.channel, msg);
                }
                
                const track = player.queue.current;
                const embed = new EmbedBuilder()
                    .setColor(DEFAULT_COLOR)
                    .setTitle('Now Playing')
                    .setDescription(`[${track.title}](${track.uri})`)
                    .addFields(
                        { name: 'Duration', value: formatDuration(track.duration), inline: true },
                        { name: 'Volume', value: `${player.volume}%`, inline: true }
                    );
                
                interaction ? interaction.reply({ embeds: [embed] }) : context.channel.send({ embeds: [embed] });
                break;
            }
        }
    }

    client.once('ready', async () => {
        console.log(`✅ Logged in as ${client.user.tag}`);
        client.guilds.cache.forEach(g => deploySlash(g.id));
        
        client.user.setStatus(botConfig.status);
        
        const activityTypes = {
            'PLAYING': ActivityType.Playing,
            'STREAMING': ActivityType.Streaming,
            'LISTENING': ActivityType.Listening,
            'WATCHING': ActivityType.Watching,
            'COMPETING': ActivityType.Competing
        };
        
        client.user.setActivity(botConfig.activityText || '!help', { 
            type: activityTypes[botConfig.activityType] || ActivityType.Playing 
        });
        
        client.manager.init(client.user.id);
        console.log('[Music] Erela.js Manager initialized');
        botConnected = true;
    });

    client.on('raw', d => client.manager.updateVoiceState(d));
    client.on('guildCreate', guild => deploySlash(guild.id));

    client.on('messageCreate', msg => {
        if (msg.author.bot || !msg.guild || !msg.content.startsWith(botConfig.prefix)) return;
        const [name, ...args] = msg.content.slice(botConfig.prefix.length).trim().split(/\s+/);
        execCommand(name, msg, args);
    });

    client.on('interactionCreate', interaction => {
        if (interaction.isButton() && interaction.customId === 'verify') {
            interaction.reply({ content: '✅ Verified!', ephemeral: true });
            if (botConfig.verifiedRole) interaction.member.roles.add(botConfig.verifiedRole).catch(() => {});
            return;
        }
        if (!interaction.isCommand()) return;
        execCommand(interaction.commandName, interaction, [], interaction);
    });

    await client.login(token);
    return client;
}

app.post('/api/connect', async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
        return res.json({ success: false, error: 'No token provided' });
    }

    try {
        botConfig.token = token;
        
        await initializeBot(token);

        const guildCount = client.guilds.cache.size;
        
        return res.json({ 
            success: true, 
            guilds: guildCount,
            username: client.user.username
        });

    } catch (error) {
        botConnected = false;
        console.error('Bot connection error:', error);
        return res.json({ success: false, error: error.message });
    }
});

app.post('/api/status', (req, res) => {
    const { status } = req.body;
    
    if (!client || !botConnected) {
        return res.json({ success: false, error: 'Bot not connected' });
    }

    const validStatuses = ['online', 'idle', 'dnd', 'invisible'];
    if (!validStatuses.includes(status)) {
        return res.json({ success: false, error: 'Invalid status' });
    }

    try {
        client.user.setStatus(status);
        botConfig.status = status;
        return res.json({ success: true });
    } catch (error) {
        return res.json({ success: false, error: error.message });
    }
});

app.post('/api/activity', (req, res) => {
    const { type, text, url } = req.body;
    
    if (!client || !botConnected) {
        return res.json({ success: false, error: 'Bot not connected' });
    }

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
        const activityName = text || 'Discord Bot';
        
        if (type === 'STREAMING' && url) {
            client.user.setActivity(activityName, { 
                type: activityTypes[type],
                url: url
            });
        } else {
            client.user.setActivity(activityName, { 
                type: activityTypes[type]
            });
        }
        
        botConfig.activityType = type;
        botConfig.activityText = text;
        
        return res.json({ success: true });
    } catch (error) {
        console.error('Activity update error:', error);
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
    
    if (client && client.commands) {
        client.commands.forEach(cmd => {
            if (cmd.name === 'ping' || cmd.name === 'verification-setup') {
                cmd.role = botConfig.generalRole;
            } else if (cmd.name === 'lockdown' || cmd.name === 'unlockdown') {
                cmd.role = botConfig.modRole;
            } else if (['play', 'skip', 'stop', 'pause', 'resume', 'queue', 'volume', 'nowplaying'].includes(cmd.name)) {
                cmd.role = botConfig.musicRole;
            }
        });
    }
    
    return res.json({ success: true, config: botConfig });
});

app.post('/api/music-config', async (req, res) => {
    const { host, port, password } = req.body;
    
    musicConfig.host = host || 'localhost';
    musicConfig.port = port || 2333;
    musicConfig.password = password || 'youshallnotpass';
    
    if (client && client.manager && botConfig.token) {
        console.log('[Music] Reinitializing bot with new Lavalink settings...');
        try {
            await initializeBot(botConfig.token);
        } catch (e) {
            console.error('Failed to reinitialize with new music config:', e);
        }
    }
    
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
    console.log('Enter your bot token in the panel to connect.');
});
