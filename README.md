# Obsidian MCP Bridge

**Direct API access to Obsidian for AI clients via Model Context Protocol**

## Overview

This project enables AI assistants (Claude Code, Codex, etc.) to access your Obsidian vault with full fidelity:
- ✅ Extensible tool system (add custom tools without plugin code changes)
- ✅ YAML-driven schema (single source of truth)
- ✅ User-scriptable handlers (JavaScript/TypeScript)
- ✅ Plugin output (Metadata Menu, Digital Garden, SmartConnections, etc.)
- ✅ Direct API access (no code duplication)
- ✅ Future-proof (automatic updates when plugins change)

## Architecture

```
AI Client → MCP Server (Python) → WebSocket → Obsidian Plugin → Obsidian APIs
                                                      ↓
                                              YAML Tool Registry
                                                      ↓
                                            User Handler Scripts
```

**Two components:**
1. **Obsidian Plugin** (`plugin/`) - Runs inside Obsidian, exposes APIs via WebSocket
2. **MCP Server** (`mcp-server/`) - Translates MCP protocol to WebSocket requests

**Key Innovation:** Tools are defined in a YAML file and implemented as user scripts, making the system fully extensible without requiring plugin modifications.

📖 **[Read the Extensibility Guide](plugin/EXTENSIBILITY.md)** for complete architecture documentation.

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
      "args": ["/absolute/path/to/obsidian-mcp-bridge/mcp-server/obsidian_mcp_server.py"],
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key-from-plugin-settings"
      }
    }
  }
}
```

> **Note:** Replace `/absolute/path/to/` with your actual repository location.
> - **Windows example:** `"C:/Users/YourName/repos/obsidian-mcp-bridge/mcp-server/obsidian_mcp_server.py"`
> - **macOS/Linux example:** `"/home/username/repos/obsidian-mcp-bridge/mcp-server/obsidian_mcp_server.py"`

**Node Server (Alternative):**
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/absolute/path/to/obsidian-mcp-bridge/mcp-server-node/dist/main.js"],
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
args = ["/absolute/path/to/obsidian-mcp-bridge/mcp-server/obsidian_mcp_server.py"]
env = { OBSIDIAN_MCP_KEY = "your-api-key-from-plugin-settings" }
```

> **Note:** Use absolute paths, not relative paths. Replace `/absolute/path/to/` with your actual repository location.

## Features

### Phase 1 (Complete) - Minimal WebSocket Server
- [x] Basic plugin scaffold
- [x] WebSocket server with authentication
- [x] Broadcast capability for real-time events
- [x] API key authentication
- [x] Python MCP server

### Phase 2 (Current) - Extensible Tool Registry
- [ ] YAML-driven tool registry (single source of truth)
- [ ] User-scriptable handlers (add tools without plugin code changes)
- [ ] Built-in core tools (file search, note reading, etc.)
- [ ] Hot-reload support (changes detected automatically)
- [ ] Sandboxed execution for user scripts

**📖 See [EXTENSIBILITY.md](plugin/EXTENSIBILITY.md) for complete architecture documentation**

### Phase 3 (Planned) - Auto-Generation
- [ ] Metadata Menu class integration
- [ ] Auto-generate tools from class definitions
- [ ] Template-based note creation
- [ ] Frontmatter schema enforcement

### Phase 4 (Planned) - Plugin Ecosystem
- [ ] SmartConnections integration (semantic search)
- [ ] Digital Garden integration (preview publishing)
- [ ] Plugin API for tool registration
- [ ] Community tool marketplace

## Extensibility

The MCP Bridge uses a **YAML-based tool registry** that allows users to add custom functionality without modifying the plugin code.

### Example: Adding a Custom Tool

**1. Create a handler script:**
```javascript
// .obsidian/plugins/mcp-bridge/handlers/user/my_tool.js
module.exports = {
  async execute(params, context) {
    const { vault } = context;
    const files = vault.getMarkdownFiles();
    return { totalFiles: files.length };
  }
};
```

**2. Add to tools.yaml:**
```yaml
tools:
  user:
    - name: count_notes
      description: Count total notes in vault
      handler: user/my_tool.js
      inputSchema:
        type: object
        properties: {}
```

**3. Plugin auto-reloads** - Tool is immediately available to AI assistants!

📖 **[Complete Extensibility Guide](plugin/EXTENSIBILITY.md)** with examples and best practices.

## Configuration

### Plugin Settings
- **Host:** `127.0.0.1` (localhost only by default)
- **Port:** `27125`
- **API Key:** Auto-generated (copy to MCP server config)
- **Require Auth:** `true` (API key required for all connections)

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
- User scripts run in sandbox (no fs, http, or process access)

### Sandboxing
User handler scripts have access to:
- ✅ Obsidian API (`app`, `vault`, `workspace`)
- ✅ Plugin APIs (Dataview, Metadata Menu, etc.)
- ❌ Node.js file system (`fs`, `path`)
- ❌ Network requests (`http`, `https`, `fetch`)
- ❌ Process spawning (`child_process`)

See [EXTENSIBILITY.md - Security](plugin/EXTENSIBILITY.md#security--sandboxing) for details.

## Documentation

- **[Extensibility Guide](plugin/EXTENSIBILITY.md)** - How to add custom tools
- **[Architecture](../_Admin/Chats/Obsidian-REST-API/Direct-API-Architecture.md)** - Full technical design
- **[API Reference](docs/api.md)** - Tool and method documentation

## Project Status

**Current Phase:** Phase 2 - Extensible Tool Registry (architecture designed, implementation starting)
**Last Updated:** 2025-01-21
**Status:** Active Development

See [EXTENSIBILITY.md](plugin/EXTENSIBILITY.md) for implementation roadmap.

## Related Projects

- [obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api) - REST API approach (archived for this project)
- [obsidian-smart-connections](https://github.com/brianpetro/obsidian-smart-connections) - Semantic search inspiration
- [obsidian-digital-garden](https://github.com/oleeskild/obsidian-digital-garden) - Rendering reference

## License

MIT
