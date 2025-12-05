// ============================================================================
//                               MEGA BOT INDEX.JS
//        General, Fun, Moderation, Music, Anti-Nuke & Verification
// ============================================================================

// --- DEPENDENCIES ---
require('dotenv').config();
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
const fetch = require('node-fetch');
const ytdl = require('ytdl-core');
const { Manager } = require('erela.js');

// --- CONFIGURATION ---
const PREFIX = process.env.PREFIX || '!';
const OWNER_ID = process.env.OWNER_ID;
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const COOLDOWN_SECONDS = parseInt(process.env.COOLDOWN_SECONDS) || 5;
const DEFAULT_COLOR = '#0099ff';

// Anti-nuke allow lists (IDs)
const ALLOWED_ROLE_1_ID = process.env.ALLOWED_ROLE_1_ID;
const ALLOWED_USERS_LIST = (process.env.ALLOWED_USERS_LIST || '').split(',');

// Permission-role IDs
const GENERAL_ROLE_ID = process.env.GENERAL_PERMS_ROLE_ID;
const MUSIC_ROLE_ID = process.env.MUSIC_PERMS_ROLE_ID;
const MOD_ROLE_ID = process.env.MODERATION_PERMS_ROLE_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;

if (!BOT_TOKEN) {
  console.error('❌ DISCORD_TOKEN missing');
  process.exit(1);
}

// --- CLIENT SETUP ---
const client = new Client({
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

// --- ERELA.JS MUSIC MANAGER ---
const LAVALINK_HOST = process.env.LAVALINK_HOST || 'localhost';
const LAVALINK_PORT = parseInt(process.env.LAVALINK_PORT) || 2333;
const LAVALINK_PASSWORD = process.env.LAVALINK_PASSWORD || 'youshallnotpass';

client.manager = new Manager({
  nodes: [{
    host: LAVALINK_HOST,
    port: LAVALINK_PORT,
    password: LAVALINK_PASSWORD,
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
.on('trackEnd', (player, track) => {
  console.log(`[Music] Track ended: ${track.title}`);
})
.on('queueEnd', player => {
  const channel = client.channels.cache.get(player.textChannel);
  if (channel) {
    channel.send({ embeds: [new EmbedBuilder().setColor('Grey').setDescription('Queue ended. Leaving voice channel.')] });
  }
  player.destroy();
});

function formatDuration(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// --- HELPERS ---
const sendEmbed = (channel, opts) => channel.send({ embeds: [new EmbedBuilder(opts)] });
const sendError = (channel, desc) => sendEmbed(channel, { color: 'Red', description: `❌ ${desc}` });
const applyCooldown = (userId, cmd) => {
  const key = `${userId}-${cmd}`;
  client.cooldowns.set(key, Date.now());
  setTimeout(() => client.cooldowns.delete(key), COOLDOWN_SECONDS * 1000);
};
const onCooldown = (userId, cmd) => {
  const key = `${userId}-${cmd}`;
  const last = client.cooldowns.get(key);
  return last && (Date.now() - last < COOLDOWN_SECONDS * 1000);
};
const isAllowed = userId =>
  ALLOWED_USERS_LIST.includes(userId) ||
  client.guilds.cache.some(g => g.roles.cache.get(ALLOWED_ROLE_1_ID)?.members.has(userId));

// --- LOADING SEQUENCE ---
async function loadingSequence() {
  console.log('🔄 Fast Launch Initiated...');
  const steps = ['Loading configs', 'Initializing client', 'Registering commands', 'Setting up events', 'Connecting to Discord'];
  for (const step of steps) {
    process.stdout.write(`→ ${step}...`);
    await new Promise(r => setTimeout(r, 300));
    process.stdout.write(' done\n');
  }
  console.log('✅ Fast Launch Complete!');
}

// --- SLASH SETUP ---
const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
const slashData = [];
const registerSlash = cmd => slashData.push(cmd.toJSON());
async function deploySlash(guildId) {
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, guildId),
    { body: slashData }
  );
}

// --- COMMAND DEFINITIONS ---
const commandsConfig = [
  // Ping
  { name: 'ping', role: GENERAL_ROLE_ID,
    slash: new SlashCommandBuilder().setName('ping').setDescription('Check latency') },
  // Verification
  { name: 'verification-setup', role: GENERAL_ROLE_ID,
    slash: new SlashCommandBuilder()
      .setName('verification-setup')
      .setDescription('Setup verification message')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
      .addBooleanOption(o => o.setName('custom').setDescription('Use custom text').setRequired(true))
      .addStringOption(o => o.setName('text').setDescription('Custom message'))
  },
  // Lockdown
  { name: 'lockdown', role: MOD_ROLE_ID,
    slash: new SlashCommandBuilder().setName('lockdown').setDescription('Lockdown this channel')
  },
  { name: 'unlockdown', role: MOD_ROLE_ID,
    slash: new SlashCommandBuilder().setName('unlockdown').setDescription('Lift lockdown')
  },
  // Music Commands
  { name: 'play', role: MUSIC_ROLE_ID,
    slash: new SlashCommandBuilder()
      .setName('play')
      .setDescription('Play a song from YouTube')
      .addStringOption(o => o.setName('query').setDescription('Song name or URL').setRequired(true))
  },
  { name: 'skip', role: MUSIC_ROLE_ID,
    slash: new SlashCommandBuilder().setName('skip').setDescription('Skip the current song')
  },
  { name: 'stop', role: MUSIC_ROLE_ID,
    slash: new SlashCommandBuilder().setName('stop').setDescription('Stop music and clear queue')
  },
  { name: 'pause', role: MUSIC_ROLE_ID,
    slash: new SlashCommandBuilder().setName('pause').setDescription('Pause the current song')
  },
  { name: 'resume', role: MUSIC_ROLE_ID,
    slash: new SlashCommandBuilder().setName('resume').setDescription('Resume the paused song')
  },
  { name: 'queue', role: MUSIC_ROLE_ID,
    slash: new SlashCommandBuilder().setName('queue').setDescription('Show the music queue')
  },
  { name: 'volume', role: MUSIC_ROLE_ID,
    slash: new SlashCommandBuilder()
      .setName('volume')
      .setDescription('Set the volume')
      .addIntegerOption(o => o.setName('level').setDescription('Volume level (0-100)').setRequired(true))
  },
  { name: 'nowplaying', role: MUSIC_ROLE_ID,
    slash: new SlashCommandBuilder().setName('nowplaying').setDescription('Show currently playing song')
  }
];
commandsConfig.forEach(cmd => {
  registerSlash(cmd.slash);
  client.commands.set(cmd.name, cmd);
});

// --- EXECUTION LOGIC ---
async function execCommand(name, context, args = [], interaction = null) {
  const userId = interaction ? interaction.user.id : context.author.id;
  if (onCooldown(userId, name) && userId !== OWNER_ID) return;
  applyCooldown(userId, name);

  const cmd = client.commands.get(name);
  if (!cmd) return;
  const member = interaction ? interaction.member : context.member;

  // Permission check
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

// --- EVENTS ---
client.once('ready', async () => {
  await loadingSequence();
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.guilds.cache.forEach(g => deploySlash(g.id));
  client.user.setActivity(`${PREFIX}help`, { type: ActivityType.Listening });
  
  client.manager.init(client.user.id);
  console.log('[Music] Erela.js Manager initialized');
});

client.on('raw', d => client.manager.updateVoiceState(d));

client.on('guildCreate', guild => deploySlash(guild.id));

client.on('messageCreate', msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  const [name, ...args] = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  execCommand(name, msg, args);
});

client.on('interactionCreate', interaction => {
  if (interaction.isButton() && interaction.customId === 'verify') {
    interaction.reply({ content: '✅ Verified!', ephemeral: true });
    if (VERIFIED_ROLE_ID) interaction.member.roles.add(VERIFIED_ROLE_ID).catch(() => {});
    return;
  }
  if (!interaction.isCommand()) return;
  execCommand(interaction.commandName, interaction, [], interaction);
});

// Anti-nuke: re-create deleted roles/channels
client.on('roleDelete', async role => {
  const log = await role.guild.fetchAuditLogs({ type: 'ROLE_DELETE', limit: 1 });
  const executor = log.entries.first().executor.id;
  if (!isAllowed(executor)) role.guild.roles.create({ name: role.name, permissions: role.permissions }).catch(() => {});
});
client.on('channelDelete', async channel => {
  const log = await channel.guild.fetchAuditLogs({ type: 'CHANNEL_DELETE', limit: 1 });
  const executor = log.entries.first().executor.id;
  if (!isAllowed(executor)) channel.clone().catch(() => {});
});

// --- LOGIN ---
client.login(BOT_TOKEN);
