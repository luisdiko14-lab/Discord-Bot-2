# Discord Bot Configuration Panel

## Overview

This project is a Discord bot with an integrated web-based configuration panel. It provides general commands, moderation tools, music playback functionality via Lavalink/erela.js, and a user-friendly web interface for managing bot settings, status, and permissions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Application Structure

The application uses a dual-file architecture:

**Primary Entry Point (`server.js`)**
- Combines Express web server with Discord bot functionality
- Serves the configuration panel on port 5000
- Manages real-time bot configuration through REST API endpoints
- Handles bot lifecycle (connection, disconnection, status updates)

**Standalone Bot (`index.js`)**
- Legacy Discord bot implementation
- Contains full bot logic but is not used when running with the config panel
- Maintained for reference or standalone deployment scenarios

**Rationale**: The integrated approach in `server.js` allows dynamic bot management without restarts, while `index.js` provides a fallback for traditional deployment.

### Frontend Architecture

**Technology Stack**: Vanilla JavaScript, HTML5, CSS3

**Structure**:
- `public/index.html` - Configuration UI with sections for token management, status, activity, roles, and music
- `public/script.js` - Client-side API communication and state management
- `public/styles.css` - Modern UI with gradient backgrounds, glassmorphism effects, and responsive design

**Key Features**:
- Token verification before connection
- Real-time status updates
- Visual status indicators (online/idle/DND/invisible)
- Activity type selection (Playing/Streaming/Listening/Watching/Competing)
- Role-based permission configuration
- Lavalink server settings management

**Design Decision**: Vanilla JavaScript was chosen over frameworks to minimize dependencies and maintain simplicity for a configuration panel with limited interactivity requirements.

### Backend Architecture

**Framework**: Express.js v5

**API Structure**:
- RESTful endpoints for bot configuration
- CORS enabled for cross-origin requests
- Body parser middleware for JSON payloads
- Static file serving for the configuration panel

**Bot Framework**: Discord.js v14

**Key Components**:
- Slash command registration and handling
- Event-driven architecture for Discord events
- Permission-based command execution using role IDs
- Cooldown system for command rate limiting
- Embed builders for rich message formatting

**Configuration Management**:
- In-memory configuration objects (`botConfig`, `musicConfig`)
- Dynamic configuration updates without bot restarts
- Environment variable support via dotenv for traditional deployments

**Rationale**: Express provides a lightweight HTTP layer for the config panel, while Discord.js v14 offers modern Discord API support with slash commands and improved performance.

### Music System Architecture

**Technology**: erela.js v2.4.0 (Lavalink client)

**Design**:
- Delegates audio processing to external Lavalink server
- Reduces bot resource consumption by offloading encoding/decoding
- Supports YouTube playback via ytdl-core
- Queue management system for playlists
- Volume control and playback state management

**Configuration**:
- Lavalink host, port, and password configurable via web panel
- Default settings: localhost:2333 with password "youshallnotpass"

**Rationale**: Lavalink provides superior audio quality and performance compared to native Discord.js voice, especially for music-focused bots handling multiple guilds.

### Permission System

**Role-Based Access Control**:
- General commands role ID
- Moderation commands role ID
- Music commands role ID
- Verified role ID (for verification system)

**Anti-Nuke Protection**:
- Allowed role whitelist
- User ID whitelist for sensitive operations
- Owner ID for administrative commands

**Implementation**: Permission checks occur before command execution, validating user roles against configured role IDs.

**Rationale**: Role-based permissions provide granular control over command access while maintaining flexibility for different server structures.

### Command Architecture

**Command Types**:
1. **General**: Ping, verification setup
2. **Moderation**: Lockdown/unlockdown channels
3. **Music**: Play, skip, stop, pause, resume, queue, volume, nowplaying

**Command Registration**:
- Slash commands built with SlashCommandBuilder
- Registered via Discord REST API
- Guild-specific or global registration support

**Execution Flow**:
1. Permission validation
2. Cooldown enforcement
3. Command logic execution
4. Error handling with user feedback

### Verification System

**Functionality**:
- Button-based verification in designated channels
- Automatic role assignment upon verification
- Embed messages with custom styling

**Implementation**: Uses Discord.js ActionRowBuilder and ButtonBuilder for interactive components, with interaction handlers for button clicks.

## External Dependencies

### Third-Party Services

**Lavalink Server** (External)
- Purpose: Audio processing and streaming
- Configuration: Host, port, password
- Requirement: Must be deployed separately
- Default: localhost:2333

### NPM Packages

**Discord Integration**:
- `discord.js` v14.18.0 - Discord API client library
- Provides: Gateway connection, slash commands, embeds, buttons, permissions

**Music Functionality**:
- `erela.js` v2.4.0 - Lavalink client for music playback
- `ytdl-core` v4.11.5 - YouTube video information and streaming

**Web Server**:
- `express` v5.2.1 - HTTP server framework
- `cors` v2.8.5 - Cross-origin resource sharing
- `body-parser` v2.2.1 - Request body parsing middleware

**Utilities**:
- `dotenv` v16.5.0 - Environment variable management
- `node-fetch` v2.7.0 - HTTP requests (polyfill for older Node versions)

### Environment Variables

**Optional Configuration**:
- `DISCORD_TOKEN` - Bot authentication token
- `PREFIX` - Command prefix (default: !)
- `OWNER_ID` - Bot owner user ID
- `COOLDOWN_SECONDS` - Command cooldown (default: 5)
- `GENERAL_PERMS_ROLE_ID` - General commands role
- `MUSIC_PERMS_ROLE_ID` - Music commands role
- `MODERATION_PERMS_ROLE_ID` - Moderation commands role
- `VERIFIED_ROLE_ID` - Verification role
- `ALLOWED_ROLE_1_ID` - Anti-nuke allowed role
- `ALLOWED_USERS_LIST` - Comma-separated anti-nuke user IDs
- `PANEL_PASSWORD` - Web panel authentication (default: admin123)

**Note**: The web panel allows runtime configuration, making environment variables optional for most deployments.