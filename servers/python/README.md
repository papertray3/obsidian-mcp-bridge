# Obsidian MCP Server

Python MCP server that connects to Obsidian MCP Bridge plugin via WebSocket.

## Installation

```bash
pip install -r requirements.txt
```

## Configuration

Set environment variables:

```bash
# Required
export OBSIDIAN_MCP_KEY="your-api-key-from-plugin-settings"

# Optional (defaults shown)
export OBSIDIAN_HOST="localhost"
export OBSIDIAN_PORT="27125"
export OBSIDIAN_USE_SSL="false"
```

## Usage

### Standalone Testing

```bash
python obsidian_mcp_server.py
```

### With Claude Code

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "python",
      "args": ["C:/path/to/obsidian-mcp-bridge/servers/python-old/obsidian_mcp_server.py"],
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key-here"
      }
    }
  }
}
```

### With Codex

Add to `~/.codex/config.toml`:

```toml
[[servers]]
name = "obsidian-direct"
command = "python"
args = ["C:/path/to/obsidian-mcp-bridge/servers/python-old/obsidian_mcp_server.py"]
env = { OBSIDIAN_MCP_KEY = "your-api-key-here" }
```

## Available Tools

### render_note
Get fully-rendered HTML content of a note.
- Includes executed Dataview queries
- Includes plugin output
- Matches exactly what you see in Obsidian UI

**Parameters:**
- `filepath` (string): Path to note file relative to vault root

**Example:**
```json
{
  "name": "render_note",
  "arguments": {
    "filepath": "Notes/00_Sowing/Home.md"
  }
}
```

### get_note_raw
Get raw markdown content of a note (no rendering).

**Parameters:**
- `filepath` (string): Path to note file relative to vault root

### list_vault_files
List all markdown files in vault or specific folder.

**Parameters:**
- `folder` (string, optional): Folder to list files from

### list_plugins
List installed plugins, whether enabled or disabled.

**Returns:** Array of plugin summaries containing `id`, `name`, `version`, `author`, `description`, `enabled`, `hasApi`, and `dir`.

### get_plugin_info
Get detailed information about a specific plugin.

**Parameters:**
- `plugin_id` (string): Plugin identifier (e.g., `smart-connections`)

**Returns:**
- Manifest metadata
- Whether plugin is enabled / exposes an API
- Available API method names (best-effort)
- Commands registered by that plugin (IDs, names, hotkeys)

### dataview_query
Execute a Dataview query directly and return rendered markdown output (tables, lists, etc.).

**Parameters:**
- `query` (string): Dataview query text (same format as in notes)
- `context_path` (string, optional): File path to use as the query context (`this.file`)

### search_vault
Search markdown file names and paths for a substring.

**Parameters:**
- `query` (string): Text to match (case-insensitive)
- `folder` (string, optional): Restrict search to a folder prefix

**Returns:**
- Array of matches with `path`, `name`, `parent`, `matchType`, and detected `tags`

### ping
Check if connection to Obsidian plugin is working.

**Returns:**
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

## Troubleshooting

### Connection Refused
- Make sure Obsidian is running
- Make sure MCP Bridge plugin is enabled
- Check that WebSocket server is started (see plugin settings)

### Unauthorized Error
- Copy API key from plugin settings
- Set `OBSIDIAN_MCP_KEY` environment variable
- Restart MCP server

### Empty/Incomplete Rendering
- Wait 2-3 seconds after requesting render
- Check that Dataview plugin is installed and enabled
- Try opening the note manually in Obsidian first

## Development

### Testing Connection

```python
import asyncio
import websockets
import json

async def test():
    ws = await websockets.connect('ws://localhost:27125')

    request = {
        "auth": "your-api-key",
        "method": "ping",
        "params": {}
    }

    await ws.send(json.dumps(request))
    response = await ws.recv()
    print(response)

asyncio.run(test())
```

### Adding New Tools

1. Add tool definition to `list_tools()`
2. Add handler to `call_tool()`
3. Implement corresponding method in plugin
