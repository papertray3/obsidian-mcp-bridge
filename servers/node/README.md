# Obsidian MCP Server (Node/TypeScript)

Node/TypeScript implementation of the Obsidian MCP server, replacing the Python version while maintaining identical API surface and behavior.

## Architecture

```
AI Client (Claude/Gemini/Codex)
    ↓ stdio (JSON-RPC MCP protocol)
Node MCP Server (this package)
    ↓ WebSocket
Obsidian MCP Bridge Plugin
    ↓ Direct in-process calls
Obsidian Runtime APIs
```

## Installation

### 1. Clone/Navigate to Repository

```bash
cd /path/to/obsidian-mcp-bridge/mcp-server-node
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build

```bash
npm run build
```

### 4. Configure

Copy `.env.example` to `.env` and configure:

```bash
# Copy template
cp .env.example .env

# Edit .env and set your API key
```

**Required settings in `.env`:**
```bash
OBSIDIAN_HOST=localhost
OBSIDIAN_PORT=27125
OBSIDIAN_MCP_KEY=your-api-key-from-plugin-settings
```

> **Get your API key:** Open Obsidian → Settings → MCP Bridge → Copy API Key

## Development

```bash
# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Usage

### As MCP Server

```bash
# After building
node dist/main.js
```

### In Claude Code Config

**Location:**
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

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

> **Path Examples:**
> - **Windows:** `"C:/Users/YourName/repos/obsidian-mcp-bridge/mcp-server-node/dist/main.js"`
> - **macOS/Linux:** `"/home/username/repos/obsidian-mcp-bridge/mcp-server-node/dist/main.js"`
> - **WSL:** `"/mnt/c/Users/YourName/repos/obsidian-mcp-bridge/mcp-server-node/dist/main.js"`

## Available Tools

- `ping` - Connection health check
- `get_note_raw` - Raw markdown content
- `list_vault_files` - List files in vault
- `list_plugins` - List installed plugins
- `get_plugin_info` - Plugin details and manifest
- `dataview_query` - Execute Dataview queries
- `search_vault` - Search vault files
- `render_note_dg_compiled` - Digital Garden compiled render with cache
- `run_dataview_block` - Execute individual Dataview blocks
- `extract_dataview_blocks` - Extract all Dataview blocks from note

## Project Structure

```
mcp-server-node/
├── src/
│   ├── main.ts              # Entry point & stdio MCP bootstrap
│   ├── config.ts            # Environment config loading
│   ├── logger.ts            # Logging utility
│   ├── websocket-client.ts  # WebSocket adapter for plugin connection
│   └── tools/               # MCP tool handlers
│       ├── index.ts
│       ├── ping.ts
│       ├── vault.ts         # list_vault_files, get_note_raw, search_vault
│       ├── plugins.ts       # list_plugins, get_plugin_info
│       ├── dataview.ts      # dataview_query, run_dataview_block, extract_dataview_blocks
│       └── render.ts        # render_note_dg_compiled
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Migration Status

This Node server provides 100% API parity with the Python MCP server (`mcp-server/obsidian_mcp_server.py`).

### Workstream Progress
- [x] Scaffolding (package.json, tsconfig, eslint, vitest)
- [ ] Config & logging utilities
- [ ] WebSocket adapter with reconnection
- [ ] Tool handlers (ping, list_vault_files, etc.)
- [ ] Integration tests
- [ ] Smoke test scripts (Windows, WSL)
- [ ] Binary packaging (pkg/nexe)
