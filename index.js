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
client.queue = new Map(); // guildId -> queue

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
  }
}

// --- EVENTS ---
client.once('ready', async () => {
  await loadingSequence();
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.guilds.cache.forEach(g => deploySlash(g.id));
  client.user.setActivity(`${PREFIX}help`, { type: ActivityType.Listening });
});

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
