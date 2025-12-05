# Discord Bot with Configuration Panel

## Overview
A Discord bot with a web-based configuration panel for managing bot settings, status, and music functionality using erela.js.

## Project Structure
- `server.js` - Main entry point: Express server + Discord bot (integrated)
- `index.js` - Standalone bot file (legacy, not used with config panel)
- `public/` - Web configuration panel
  - `index.html` - Configuration UI
  - `styles.css` - Styling
  - `script.js` - Frontend logic

## Features

### Configuration Panel (Web UI)
- **Token Management**: Enter and verify Discord bot tokens
- **Bot Status**: Set online/idle/DND/invisible status
- **Activity Status**: Set Playing/Streaming/Listening/Watching/Competing with custom text
- **Role Configuration**: Configure role IDs for general, moderation, and music commands
- **Music Settings**: Configure Lavalink server connection (host, port, password)

### Bot Commands
- `/ping` - Check latency
- `/verification-setup` - Set up verification button in a channel
- `/lockdown` / `/unlockdown` - Lock/unlock channels

### Music Commands (erela.js)
- `/play <query>` - Play a song from YouTube
- `/skip` - Skip current song
- `/stop` - Stop and clear queue
- `/pause` / `/resume` - Pause/resume playback
- `/queue` - Show music queue
- `/volume <0-100>` - Set volume
- `/nowplaying` - Show current track

## Setup

1. Open the configuration panel at the webview URL
2. Enter your Discord bot token and click "Verify Token"
3. Click "Save & Connect" to start the bot
4. Configure role IDs for command permissions
5. Set up Lavalink server settings for music (requires external Lavalink server)

## Environment Variables (Optional)
- `PANEL_PASSWORD` - Password for panel authentication (default: admin123)

## Dependencies
- discord.js (v14)
- erela.js - Music player using Lavalink
- express - Web server
- node-fetch - API requests

## Notes
- Music functionality requires a running Lavalink server
- The configuration panel and bot run in the same process
- Configuration changes are applied dynamically to the running bot
