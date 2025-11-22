# MCP Server Auto-Discovery

**Automatically discover and expose all MCP Bridge tools without hardcoding**

## Overview

The auto-discovery MCP server (`obsidian_mcp_server_auto.py`) dynamically discovers available tools from the MCP Bridge WebSocket server using the `tools/list` endpoint. This eliminates the need to manually update the MCP server when tools are added or changed in the plugin.

## Benefits

✅ **No Hardcoding**: Tools are discovered at runtime
✅ **Always In Sync**: MCP server automatically reflects plugin tools
✅ **User Tools Included**: Custom user-added tools work automatically
✅ **Future-Proof**: New tools work without MCP server updates
✅ **Single Source of Truth**: `tools.yaml` defines everything

## Usage

### Installation

Same requirements as the original MCP server:

```bash
cd mcp-server
pip install -r requirements.txt
```

### Configuration

**For Claude Desktop:**

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "python",
      "args": ["/absolute/path/to/mcp-server/obsidian_mcp_server_auto.py"],
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key-from-plugin"
      }
    }
  }
}
```

**Environment Variables:**

```bash
OBSIDIAN_HOST=localhost        # Default: localhost
OBSIDIAN_PORT=27125           # Default: 27125
OBSIDIAN_USE_SSL=false        # Default: false
OBSIDIAN_MCP_KEY=<api-key>    # Required: Your API key
```

### Startup Process

When the auto-discovery server starts:

1. **Connect** to WebSocket server
   ```
   ✓ Connected to Obsidian MCP Bridge at ws://localhost:27125
   ```

2. **Discover Tools** via `tools/list`
   ```
   Discovering tools from MCP Bridge...
   ✓ Discovered 6 tools:
     - ping (other)
     - search_files (search)
     - get_note_raw (notes)
     - list_vault_files (notes)
     - run_dataview_block (dataview)
     - extract_dataview_blocks (dataview)
   ```

3. **Ready** to serve requests
   ```
   MCP server ready to accept connections
   ```

## How It Works

### 1. Tool Discovery

On startup, the server calls the `tools/list` endpoint:

```python
async def discover_tools():
    result = await call_plugin("tools/list", {})
    discovered_tools = result.get("tools", [])
```

This returns the tool registry from the plugin:

```json
{
  "tools": [
    {
      "name": "search_files",
      "description": "Search for files using glob patterns",
      "inputSchema": {
        "type": "object",
        "properties": {
          "pattern": {
            "type": "string",
            "description": "Glob pattern..."
          }
        },
        "required": ["pattern"]
      },
      "category": "search"
    },
    ...
  ]
}
```

### 2. Dynamic Registration

Tools are registered with the MCP framework:

```python
@app.list_tools()
async def list_tools() -> list[Tool]:
    """Return all discovered tools"""
    mcp_tools = []

    for tool in discovered_tools:
        mcp_tool = Tool(
            name=tool["name"],
            description=tool["description"],
            inputSchema=tool["inputSchema"]
        )
        mcp_tools.append(mcp_tool)

    return mcp_tools
```

### 3. Request Routing

When a tool is called, the request is forwarded to the WebSocket server:

```python
@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Call a tool by routing to the WebSocket server"""
    # Call the tool through the WebSocket
    result = await call_plugin(name, arguments)

    # Format and return response
    return [TextContent(type="text", text=json.dumps(result, indent=2))]
```

## Comparison: Original vs Auto-Discovery

### Original Server (`obsidian_mcp_server.py`)

**Pros:**
- Explicit tool definitions
- Can add server-side processing
- Custom error handling per tool

**Cons:**
- Must manually update when tools change
- Duplicates schema from plugin
- User tools not automatically available
- Out of sync with plugin

### Auto-Discovery Server (`obsidian_mcp_server_auto.py`)

**Pros:**
- ✅ Always in sync with plugin
- ✅ User tools work automatically
- ✅ No code changes when adding tools
- ✅ Single source of truth (tools.yaml)

**Cons:**
- ⚠️ Slightly slower startup (tool discovery)
- ⚠️ Less control over individual tools
- ⚠️ Requires `tools/list` endpoint

## Architecture

```
┌─────────────────────────────────────────────────┐
│            AI Assistant (Claude)                │
└───────────────────┬─────────────────────────────┘
                    │ stdio
                    │
┌───────────────────▼─────────────────────────────┐
│      MCP Server (Auto-Discovery)                │
│  ┌──────────────────────────────────────────┐  │
│  │  1. Connect to WebSocket                 │  │
│  │  2. Call tools/list                      │  │
│  │  3. Register discovered tools            │  │
│  │  4. Route requests to WebSocket          │  │
│  └──────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────┘
                    │ WebSocket
                    │
┌───────────────────▼─────────────────────────────┐
│           MCP Bridge Plugin                     │
│  ┌──────────────────────────────────────────┐  │
│  │  Tool Registry (tools.yaml)              │  │
│  │   • Builtin tools                        │  │
│  │   • User tools                           │  │
│  │   • Auto-generated tools (future)        │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Adding Tools

With auto-discovery, adding a tool is simple:

### 1. Add to tools.yaml

```yaml
tools:
  user:
    - name: my_custom_tool
      description: My custom functionality
      handler: user/my_custom_tool.js
      inputSchema:
        type: object
        properties:
          param1:
            type: string
        required: [param1]
```

### 2. Create handler script

```javascript
// handlers/user/my_custom_tool.js
module.exports = {
  async execute(params, context) {
    // Your implementation
    return { result: "..." };
  }
};
```

### 3. Reload tool registry

Use command: "MCP Bridge: Reload Tool Registry" or restart Obsidian.

### 4. Restart MCP server

The tool is automatically available!

```
Discovering tools from MCP Bridge...
✓ Discovered 7 tools:
  - my_custom_tool (custom)    ← Your new tool!
```

## Error Handling

### Connection Failures

```
✗ Failed to connect to Obsidian plugin: [Errno 61] Connection refused
```

**Solutions:**
1. Start Obsidian
2. Enable MCP Bridge plugin
3. Check host/port configuration

### Tool Discovery Failures

```
✗ Failed to discover tools: Unauthorized: Invalid API key
  Falling back to empty tool list
```

**Solutions:**
1. Check `OBSIDIAN_MCP_KEY` is set correctly
2. Copy API key from plugin settings
3. Restart MCP server with correct key

### Tool Execution Errors

```
Error calling search_files: Unknown method: search_files
```

**Solutions:**
1. Tool not in registry - check tools.yaml
2. Plugin not loaded - restart Obsidian
3. Handler error - check Obsidian console

## Debugging

### Enable Verbose Logging

The server logs to stderr, which you can capture:

```bash
python obsidian_mcp_server_auto.py 2>mcp_server.log
```

### Check Tool Discovery

Add debug output after discovery:

```python
async def discover_tools():
    # ... existing code ...

    # Debug: Print full tool definitions
    import json
    print(json.dumps(discovered_tools, indent=2), file=sys.stderr)
```

### Test Connection

Test the WebSocket connection independently:

```python
import asyncio
import websockets
import json

async def test():
    ws = await websockets.connect('ws://localhost:27125')

    # Send tools/list request
    await ws.send(json.dumps({
        "id": "test-1",
        "method": "tools/list",
        "params": {},
        "auth": "your-api-key"
    }))

    # Receive response
    response = await ws.recv()
    print(json.dumps(json.loads(response), indent=2))

    await ws.close()

asyncio.run(test())
```

## Migration Guide

### From Original to Auto-Discovery

**1. Update config:**

Change the Python file in your MCP server config:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "python",
      "args": ["/path/to/obsidian_mcp_server_auto.py"],  // Changed!
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key"
      }
    }
  }
}
```

**2. Restart Claude Desktop / MCP client**

**3. Test:**

Ask Claude: "List all available Obsidian tools"

You should see all tools from the plugin registry, including any user-added tools!

## Future Enhancements

### Tool Refresh

Periodically refresh tool list:

```python
async def refresh_tools_periodically():
    while True:
        await asyncio.sleep(60)  # Every minute
        await discover_tools()
```

### Selective Tool Exposure

Only expose certain categories:

```python
# Only expose search and notes tools
discovered_tools = [t for t in all_tools
                   if t.get('category') in ['search', 'notes']]
```

### Tool Caching

Cache discovered tools to speed up restarts:

```python
import pickle

def save_cache():
    with open('tool_cache.pkl', 'wb') as f:
        pickle.dump(discovered_tools, f)

def load_cache():
    with open('tool_cache.pkl', 'rb') as f:
        return pickle.load(f)
```

## Related Documentation

- [../plugin/EXTENSIBILITY.md](../plugin/EXTENSIBILITY.md) - Tool registry architecture
- [../plugin/TEST-HARNESS.md](../plugin/TEST-HARNESS.md) - HTML test harness
- [../README.md](../README.md) - Project overview

---

**Version:** 2.0.1
**Updated:** 2025-01-22
