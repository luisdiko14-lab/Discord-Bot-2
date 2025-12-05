const API_BASE = '';
let currentToken = '';
let selectedStatus = 'online';
let selectedActivityType = 'PLAYING';

document.addEventListener('DOMContentLoaded', () => {
    loadSavedConfig();
    initEventListeners();
});

function initEventListeners() {
    document.getElementById('toggle-token').addEventListener('click', toggleTokenVisibility);
    document.getElementById('verify-token').addEventListener('click', verifyToken);
    document.getElementById('save-token').addEventListener('click', saveAndConnect);
    document.getElementById('update-activity').addEventListener('click', updateActivity);
    document.getElementById('save-roles').addEventListener('click', saveRoles);
    document.getElementById('save-music').addEventListener('click', saveMusicSettings);

    document.querySelectorAll('.status-option').forEach(option => {
        option.addEventListener('click', () => selectStatus(option.dataset.status));
    });

    document.querySelectorAll('.activity-btn').forEach(btn => {
        btn.addEventListener('click', () => selectActivityType(btn.dataset.type));
    });
}

function toggleTokenVisibility() {
    const tokenInput = document.getElementById('bot-token');
    const toggleBtn = document.getElementById('toggle-token');
    
    if (tokenInput.type === 'password') {
        tokenInput.type = 'text';
        toggleBtn.textContent = 'Hide';
    } else {
        tokenInput.type = 'password';
        toggleBtn.textContent = 'Show';
    }
}

async function verifyToken() {
    const token = document.getElementById('bot-token').value.trim();
    const resultBox = document.getElementById('token-result');
    const saveBtn = document.getElementById('save-token');
    
    if (!token) {
        showResult(resultBox, 'Please enter a bot token', false);
        return;
    }

    resultBox.classList.remove('hidden', 'success', 'error');
    resultBox.textContent = 'Verifying token...';

    try {
        const response = await fetch(`${API_BASE}/api/verify-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        const data = await response.json();

        if (data.valid) {
            currentToken = token;
            showResult(resultBox, `Token Valid! Bot: ${data.username}#${data.discriminator} (ID: ${data.id})`, true);
            saveBtn.disabled = false;
            
            document.getElementById('bot-info-section').classList.remove('hidden');
            document.getElementById('bot-username').textContent = `${data.username}#${data.discriminator}`;
            document.getElementById('bot-id').textContent = data.id;
            if (data.avatar) {
                document.getElementById('bot-avatar').src = `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`;
            }
        } else {
            showResult(resultBox, `Invalid Token: ${data.error || 'Unknown error'}`, false);
            saveBtn.disabled = true;
        }
    } catch (error) {
        showResult(resultBox, `Error: ${error.message}`, false);
        saveBtn.disabled = true;
    }
}

async function saveAndConnect() {
    const token = document.getElementById('bot-token').value.trim();
    const statusBadge = document.getElementById('bot-status');
    
    statusBadge.className = 'status-badge connecting';
    statusBadge.textContent = 'Connecting...';

    try {
        const response = await fetch(`${API_BASE}/api/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        const data = await response.json();

        if (data.success) {
            statusBadge.className = 'status-badge online';
            statusBadge.textContent = 'Online';
            showResult(document.getElementById('token-result'), 'Bot connected successfully!', true);
            
            if (data.guilds !== undefined) {
                document.getElementById('bot-guilds').textContent = data.guilds;
            }
        } else {
            statusBadge.className = 'status-badge offline';
            statusBadge.textContent = 'Offline';
            showResult(document.getElementById('token-result'), `Connection failed: ${data.error}`, false);
        }
    } catch (error) {
        statusBadge.className = 'status-badge offline';
        statusBadge.textContent = 'Offline';
        showResult(document.getElementById('token-result'), `Error: ${error.message}`, false);
    }
}

function selectStatus(status) {
    selectedStatus = status;
    document.querySelectorAll('.status-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.status === status);
    });
    
    updateBotStatus(status);
}

async function updateBotStatus(status) {
    try {
        await fetch(`${API_BASE}/api/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
    } catch (error) {
        console.error('Failed to update status:', error);
    }
}

function selectActivityType(type) {
    selectedActivityType = type;
    document.querySelectorAll('.activity-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    const streamingUrl = document.getElementById('streaming-url');
    if (type === 'STREAMING') {
        streamingUrl.classList.remove('hidden');
    } else {
        streamingUrl.classList.add('hidden');
    }
}

async function updateActivity() {
    const activityText = document.getElementById('activity-text').value.trim();
    const streamingUrl = document.getElementById('streaming-url').value.trim();

    try {
        const response = await fetch(`${API_BASE}/api/activity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: selectedActivityType,
                text: activityText,
                url: streamingUrl
            })
        });

        const data = await response.json();
        if (data.success) {
            alert('Activity updated successfully!');
        } else {
            alert(`Failed to update activity: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function saveRoles() {
    const config = {
        generalRole: document.getElementById('general-role').value.trim(),
        modRole: document.getElementById('mod-role').value.trim(),
        musicRole: document.getElementById('music-role').value.trim(),
        verifiedRole: document.getElementById('verified-role').value.trim(),
        ownerId: document.getElementById('owner-id').value.trim(),
        prefix: document.getElementById('prefix').value.trim() || '!'
    };

    try {
        const response = await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const data = await response.json();
        if (data.success) {
            localStorage.setItem('botConfig', JSON.stringify(config));
            alert('Configuration saved successfully!');
        } else {
            alert(`Failed to save configuration: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function saveMusicSettings() {
    const musicConfig = {
        host: document.getElementById('lavalink-host').value.trim() || 'localhost',
        port: parseInt(document.getElementById('lavalink-port').value) || 2333,
        password: document.getElementById('lavalink-password').value.trim() || 'youshallnotpass'
    };

    try {
        const response = await fetch(`${API_BASE}/api/music-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(musicConfig)
        });

        const data = await response.json();
        if (data.success) {
            localStorage.setItem('musicConfig', JSON.stringify(musicConfig));
            alert('Music settings saved successfully!');
        } else {
            alert(`Failed to save music settings: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

function loadSavedConfig() {
    const savedConfig = localStorage.getItem('botConfig');
    if (savedConfig) {
        const config = JSON.parse(savedConfig);
        document.getElementById('general-role').value = config.generalRole || '';
        document.getElementById('mod-role').value = config.modRole || '';
        document.getElementById('music-role').value = config.musicRole || '';
        document.getElementById('verified-role').value = config.verifiedRole || '';
        document.getElementById('owner-id').value = config.ownerId || '';
        document.getElementById('prefix').value = config.prefix || '!';
    }

    const savedMusicConfig = localStorage.getItem('musicConfig');
    if (savedMusicConfig) {
        const musicConfig = JSON.parse(savedMusicConfig);
        document.getElementById('lavalink-host').value = musicConfig.host || 'localhost';
        document.getElementById('lavalink-port').value = musicConfig.port || 2333;
        document.getElementById('lavalink-password').value = musicConfig.password || 'youshallnotpass';
    }

    document.querySelector('.activity-btn[data-type="PLAYING"]').classList.add('active');
    document.querySelector('.status-option[data-status="online"]').classList.add('active');
}

function showResult(element, message, isSuccess) {
    element.classList.remove('hidden', 'success', 'error');
    element.classList.add(isSuccess ? 'success' : 'error');
    element.textContent = message;
}
