# Obsidian MCP Bridge

**Direct API access to Obsidian for AI clients via Model Context Protocol**

## Overview

This project enables AI assistants (Claude Code, Codex, etc.) to access your Obsidian vault with full fidelity:
- ✅ Rendered content (Dataview queries executed, not empty divs)
- ✅ Plugin output (Metadata Menu, Digital Garden, SmartConnections, etc.)
- ✅ Semantic search capabilities
- ✅ Direct API access (no code duplication)
- ✅ Future-proof (automatic updates when plugins change)

## Architecture

```
AI Client → MCP Server (Python) → WebSocket → Obsidian Plugin → Obsidian APIs
```

**Two components:**
1. **Obsidian Plugin** (`plugin/`) - Runs inside Obsidian, exposes APIs via WebSocket
2. **MCP Server** (`mcp-server/`) - Translates MCP protocol to WebSocket requests

## Quick Start

### 1. Install Obsidian Plugin

```bash
# Copy plugin to Obsidian plugins directory
cp -r plugin/ ~/.obsidian/plugins/obsidian-mcp-bridge/

# Or on Windows:
# xcopy plugin "C:\Users\YOUR_USER\AppData\Roaming\obsidian\plugins\obsidian-mcp-bridge\" /E /I
```

Enable the plugin in Obsidian Settings → Community Plugins

### 2. Configure MCP Server

```bash
# Install Python dependencies
cd mcp-server
pip install -r requirements.txt

# Set API key (get from plugin settings)
export OBSIDIAN_MCP_KEY="your-api-key-here"
```

### 3. Connect AI Client

**Claude Code:**
```json
// ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
// %APPDATA%/Claude/claude_desktop_config.json (Windows)
{
  "mcpServers": {
    "obsidian": {
      "command": "python",
      "args": ["C:/Users/sthat/Source/Repos/obsidian-mcp-bridge/mcp-server/obsidian_mcp_server.py"],
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key-from-plugin-settings"
      }
    }
  }
}
```

**Codex:**
```toml
# ~/.codex/config.toml
[[servers]]
name = "obsidian-direct"
command = "python"
args = ["C:/Users/sthat/Source/Repos/obsidian-mcp-bridge/mcp-server/obsidian_mcp_server.py"]
env = { OBSIDIAN_MCP_KEY = "your-api-key-from-plugin-settings" }
```

## Features

### Phase 1 (Current) - Proof of Concept
- [x] Basic plugin scaffold
- [x] WebSocket server
- [x] `render_note()` - Get fully-rendered HTML
- [x] API key authentication
- [x] Python MCP server

### Phase 2 (Planned) - Core Tools
- [ ] `list_plugins()` - Discover installed plugins
- [ ] `get_plugin_info()` - Plugin metadata and capabilities
- [ ] `dataview_query()` - Execute Dataview queries
- [ ] `search_vault()` - Simple text search
- [ ] `list_vault_files()` - File listing

### Phase 3 (Planned) - Plugin Ecosystem
- [ ] SmartConnections integration (semantic search)
- [ ] Digital Garden integration (preview publishing)
- [ ] Safe plugin method calling

### Phase 4 (Planned) - Production Ready
- [ ] Permission system (tiered operations)
- [ ] User approval modals
- [ ] Rate limiting
- [ ] Documentation
- [ ] Community plugin distribution

## Configuration

### Plugin Settings
- **Host:** `127.0.0.1` (localhost only by default)
- **Port:** `27125`
- **API Key:** Auto-generated (copy to MCP server config)
- **Enable Remote:** `false` (future capability)

### MCP Server Environment Variables
```bash
OBSIDIAN_HOST=localhost        # Plugin host
OBSIDIAN_PORT=27125            # Plugin port
OBSIDIAN_USE_SSL=false         # Use wss:// instead of ws://
OBSIDIAN_MCP_KEY=<api-key>     # API key from plugin settings
```

## Development

### Building the Plugin

```bash
cd plugin
npm install
npm run build

# Development mode (auto-rebuild)
npm run dev
```

### Testing

```bash
# Test WebSocket connection
cd plugin
npm test

# Test MCP server
cd mcp-server
pytest
```

## Security

### Current (Localhost Only)
- WebSocket binds to `127.0.0.1` only
- API key authentication
- No SSL needed (local traffic)

### Future (Remote Access)
- SSL/TLS certificates required
- Origin validation
- Configurable allowed origins
- Rate limiting

## Documentation

- **[Setup Guide](docs/setup.md)** - Detailed installation instructions
- **[Architecture](../_Admin/Chats/Obsidian-REST-API/Direct-API-Architecture.md)** - Full technical design
- **[API Reference](docs/api.md)** - Tool and method documentation

## Project Status

**Current Phase:** Phase 1 - Proof of Concept
**Last Updated:** 2025-01-11
**Status:** Active Development

See [Direct-API-Architecture.md](../_Admin/Chats/Obsidian-REST-API/Direct-API-Architecture.md) for complete implementation plan.

## Related Projects

- [obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api) - REST API approach (archived for this project)
- [obsidian-smart-connections](https://github.com/brianpetro/obsidian-smart-connections) - Semantic search inspiration
- [obsidian-digital-garden](https://github.com/oleeskild/obsidian-digital-garden) - Rendering reference

## License

MIT
