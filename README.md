# Obsidian MCP Bridge

**Unified monorepo for Obsidian MCP Bridge - Plugin, Servers, and Orchestrator**

Direct API access to Obsidian for AI clients via Model Context Protocol.

## 🎯 Overview

This monorepo contains all components of the Mycelium Bridge ecosystem:

- **Obsidian Plugin** - WebSocket server exposing vault APIs
- **MCP Servers** - Python & Node.js MCP protocol adapters
- **Orchestrator** - Multi-agent workflow coordination
- **Tool Registry** - Extensible YAML-driven tool system

### Key Features

✅ **Extensible Tool System** - Add tools via YAML without code changes
✅ **Auto-Discovery** - MCP servers automatically detect available tools
✅ **User-Scriptable** - Custom handlers in JavaScript/TypeScript
✅ **Plugin Integration** - Access Dataview, Metadata Menu, Smart Connections
✅ **Multi-Agent** - Orchestrator coordinates multiple AI agents
✅ **Monorepo Structure** - All components in one place for easy development

## 📦 Repository Structure

```
obsidian-mcp-bridge/              # ← Obsidian plugin root
├── manifest.json                 # Plugin manifest (required at root)
├── main.js                       # Compiled plugin (required at root)
├── package.json                  # Plugin dependencies
├── src/                          # Plugin source code
│   ├── main.ts
│   ├── settings.ts
│   ├── websocket-server.ts
│   └── tool-registry.ts
│
├── .mcp-bridge/                  # Tool registry
│   ├── tools.yaml               # Tool definitions
│   └── handlers/                # Tool handlers
│       ├── core/                # Built-in handlers
│       └── user/                # Custom user handlers
│
├── servers/                      # MCP Servers
│   ├── python-old/              # Python MCP server
│   │   ├── obsidian_mcp_server.py
│   │   └── obsidian_mcp_server_auto.py
│   │
│   └── node-old/                # Node.js MCP server
│       ├── src/
│       └── package.json
│
├── orchestrator/                 # Multi-agent orchestrator
│   ├── bin/mycelium.js          # CLI entry point
│   ├── src/                     # Orchestrator core
│   └── package.json
│
└── docs/                        # Documentation
```

**Why this structure?** The repository **IS** the plugin - `manifest.json` and `main.js` are at the root, so you can place the entire repo in `.obsidian/plugins/` for easy testing and development.

## Architecture

```
AI Client → MCP Server (Python/Node) → WebSocket → Obsidian Plugin → Obsidian APIs
                                                           ↓
                                                   YAML Tool Registry
                                                           ↓
                                                 User Handler Scripts
```

📖 **[Read the Extensibility Guide](EXTENSIBILITY-plugin.md)** for complete architecture documentation.

## 🚀 Quick Start

### Plugin Installation

**Method 1: Direct Copy (for production use)**
```bash
# Copy entire repo to plugins directory
cp -r /path/to/obsidian-mcp-bridge /path/to/vault/.obsidian/plugins/

# Or on Windows:
xcopy "C:\path\to\obsidian-mcp-bridge" ^
  "%USERPROFILE%\path\to\vault\.obsidian\plugins\obsidian-mcp-bridge" /E /I
```

**Method 2: Symlink (for development)**
```powershell
# Windows PowerShell
New-Item -ItemType SymbolicLink `
  -Path ".obsidian\plugins\obsidian-mcp-bridge" `
  -Target "C:\path\to\obsidian-mcp-bridge"

# Linux/macOS
ln -s /path/to/obsidian-mcp-bridge /path/to/vault/.obsidian/plugins/
```

**Why this works:** Since `manifest.json` and `main.js` are at the repository root, Obsidian recognizes the entire repo as a plugin.

Enable the plugin in **Obsidian Settings → Community Plugins**

### Building the Plugin

```bash
cd obsidian-mcp-bridge
npm install
npm run build    # Compiles TypeScript → main.js at root

# Development mode (auto-rebuild on changes)
npm run dev
```

### Configure MCP Server

**Python Server (recommended for auto-discovery):**
```bash
cd servers/python-old
pip install -r requirements.txt

# Set API key (get from plugin settings)
export OBSIDIAN_MCP_KEY="your-api-key-here"

# Run auto-discovery server
python obsidian_mcp_server_auto.py
```

**Node Server (alternative):**
```bash
cd servers/node-old
npm install
npm run build
npm start
```

### Connect AI Client

**Claude Code:**
```json
// ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
// %APPDATA%/Claude/claude_desktop_config.json (Windows)
{
  "mcpServers": {
    "obsidian": {
      "command": "python",
      "args": ["/absolute/path/to/obsidian-mcp-bridge/servers/python-old/obsidian_mcp_server_auto.py"],
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
name = "obsidian-bridge"
command = "python"
args = ["/absolute/path/to/obsidian-mcp-bridge/servers/python-old/obsidian_mcp_server_auto.py"]
env = { OBSIDIAN_MCP_KEY = "your-api-key-from-plugin-settings" }
```

> **Note:** Use absolute paths. The auto-discovery server (`_auto.py`) is recommended as it automatically detects all available tools from the plugin.

### Using the Orchestrator

The orchestrator enables multi-agent workflows:

```bash
cd orchestrator
npm install

# Initialize config in vault
node bin/mycelium.js init --vault "/path/to/vault"

# List available tools and roles
node bin/mycelium.js list

# Run a single job
node bin/mycelium.js run \
  --role general-assistant \
  --prompt "Write a summary of recent notes" \
  --output "summaries/recent.md"
```

See [orchestrator/README.md](orchestrator/README.md) for complete documentation.

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
