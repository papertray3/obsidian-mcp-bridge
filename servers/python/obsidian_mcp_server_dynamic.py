#!/usr/bin/env python3
"""
Obsidian MCP Server - Dynamic Tool Discovery
Connects to Obsidian MCP Bridge plugin via WebSocket and dynamically discovers tools
"""

import os
import sys
import json
import asyncio
import websockets
from pathlib import Path
from typing import Any, Optional

try:
    from websockets.protocol import State as WebSocketState
except ImportError:
    WebSocketState = None

# Import MCP SDK
try:
    from mcp.server import Server, NotificationOptions
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent
except ImportError:
    print("Error: MCP SDK not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

# Configuration from environment
OBSIDIAN_HOST = os.getenv('OBSIDIAN_HOST', 'localhost')
OBSIDIAN_PORT = os.getenv('OBSIDIAN_PORT', '27125')
OBSIDIAN_USE_SSL = os.getenv('OBSIDIAN_USE_SSL', 'false').lower() == 'true'
OBSIDIAN_API_KEY = os.getenv('OBSIDIAN_MCP_KEY', '')

# Build WebSocket URL
protocol = 'wss' if OBSIDIAN_USE_SSL else 'ws'
OBSIDIAN_WS_URL = f"{protocol}://{OBSIDIAN_HOST}:{OBSIDIAN_PORT}"

# Global WebSocket connection
ws_connection: Optional[websockets.WebSocketClientProtocol] = None

# Track pending requests
pending_requests = set()

# Cached tool definitions
cached_tools: Optional[list[Tool]] = None

# Create MCP server
app = Server("obsidian-direct")


async def connect_to_plugin():
    """Connect to Obsidian MCP Bridge plugin"""
    global ws_connection

    if not OBSIDIAN_API_KEY:
        print("Warning: OBSIDIAN_MCP_KEY not set. Authentication may fail.", file=sys.stderr)

    try:
        ssl_context = None

        ws_connection = await websockets.connect(
            OBSIDIAN_WS_URL,
            ssl=ssl_context,
            ping_interval=20,
            ping_timeout=10
        )

        print(f"Connected to Obsidian MCP Bridge at {OBSIDIAN_WS_URL}", file=sys.stderr)

    except Exception as e:
        print(f"Failed to connect to Obsidian plugin: {e}", file=sys.stderr)
        # Don't exit - will try to use file fallback


def _is_ws_closed() -> bool:
    """Robustly detect if the websocket connection is closed"""
    if not ws_connection:
        return True

    closed_attr = getattr(ws_connection, "closed", None)
    if isinstance(closed_attr, bool):
        return closed_attr

    state = getattr(ws_connection, "state", None)
    if WebSocketState is not None and state is not None:
        try:
            return state == WebSocketState.CLOSED
        except Exception:
            pass

    return False


async def ensure_connection():
    """Ensure WebSocket connection is alive"""
    if _is_ws_closed():
        await connect_to_plugin()


async def call_plugin(method: str, params: dict) -> Any:
    """Send request to Obsidian plugin via WebSocket"""
    await ensure_connection()

    # Build request with unique ID
    request_id = f"{method}_{id(params)}"
    request = {
        "auth": OBSIDIAN_API_KEY,
        "method": method,
        "params": params,
        "id": request_id
    }

    try:
        # Track this request
        pending_requests.add(request_id)

        # Send request
        await ws_connection.send(json.dumps(request))

        # Wait for response with matching ID
        while True:
            response_str = await ws_connection.recv()
            response = json.loads(response_str)

            # Check if this is our response
            if response.get("id") == request_id:
                pending_requests.discard(request_id)

                # Handle errors
                if "error" in response:
                    raise Exception(response["error"])

                # Return result
                return response.get("result")

    except websockets.exceptions.ConnectionClosed:
        pending_requests.discard(request_id)
        # Try to reconnect once
        await connect_to_plugin()
        return await call_plugin(method, params)

    except Exception as e:
        pending_requests.discard(request_id)
        raise Exception(f"Plugin call failed: {str(e)}")


def load_tools_from_config() -> list[Tool]:
    """
    Load tool definitions from mcp-config.json
    Tries multiple path candidates relative to this script
    """
    # Get script directory
    script_dir = Path(__file__).parent

    # Try multiple path candidates (server runs from servers/python/)
    candidates = [
        script_dir / ".." / ".." / "mcp-bridge" / "generated" / "mcp-config.json",
        script_dir / ".." / ".." / ".." / "mcp-bridge" / "generated" / "mcp-config.json",
        script_dir / ".." / "mcp-bridge" / "generated" / "mcp-config.json",
    ]

    for candidate in candidates:
        try:
            config_path = candidate.resolve()
            if config_path.exists():
                print(f"Loading tools from {config_path}", file=sys.stderr)
                with open(config_path, 'r') as f:
                    data = json.load(f)
                    if data and isinstance(data.get('tools'), list):
                        # Convert JSON tool definitions to MCP Tool objects
                        tools = []
                        for tool_def in data['tools']:
                            tools.append(Tool(
                                name=tool_def['name'],
                                description=tool_def['description'],
                                inputSchema=tool_def['inputSchema']
                            ))
                        print(f"Loaded {len(tools)} tools from config file", file=sys.stderr)
                        return tools
        except Exception as e:
            print(f"Failed to load from {candidate}: {e}", file=sys.stderr)
            continue

    print("No mcp-config.json found in any candidate location", file=sys.stderr)
    return []


async def discover_tools() -> list[Tool]:
    """
    Dynamically discover tools from plugin or config file
    Priority:
    1. Query plugin via tools/list
    2. Read from mcp-config.json
    3. Return empty list
    """
    global cached_tools

    # Return cached if available
    if cached_tools is not None:
        return cached_tools

    # Try to get from plugin first
    try:
        if not _is_ws_closed():
            result = await call_plugin("tools/list", {})
            if result and isinstance(result.get('tools'), list):
                # Convert to MCP Tool objects
                tools = []
                for tool_def in result['tools']:
                    tools.append(Tool(
                        name=tool_def['name'],
                        description=tool_def['description'],
                        inputSchema=tool_def['inputSchema']
                    ))
                print(f"Discovered {len(tools)} tools from plugin", file=sys.stderr)
                cached_tools = tools
                return tools
    except Exception as e:
        print(f"Failed to query plugin for tools: {e}", file=sys.stderr)

    # Fall back to config file
    print("Falling back to mcp-config.json", file=sys.stderr)
    tools = load_tools_from_config()
    cached_tools = tools
    return tools


@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools (dynamically discovered)"""
    return await discover_tools()


@app.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """Handle tool calls by forwarding to plugin"""
    try:
        # Ensure we're connected
        await ensure_connection()

        # Forward all tool calls to plugin
        result = await call_plugin(name, arguments)

        # Format result as text
        if isinstance(result, str):
            return [TextContent(type="text", text=result)]
        else:
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

    except Exception as e:
        error_msg = f"Error calling tool '{name}': {str(e)}"
        print(error_msg, file=sys.stderr)
        return [TextContent(type="text", text=error_msg)]


async def main():
    """Main entry point"""
    print("Obsidian MCP Server (Python - Dynamic) starting...", file=sys.stderr)
    print(f"WebSocket URL: {OBSIDIAN_WS_URL}", file=sys.stderr)

    # Try to connect to plugin
    try:
        await connect_to_plugin()
    except Exception as e:
        print(f"Initial connection failed, will use file fallback: {e}", file=sys.stderr)

    # Pre-load tools for faster first request
    tools = await discover_tools()
    print(f"Ready with {len(tools)} tools", file=sys.stderr)

    # Run MCP server
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="obsidian-direct",
                server_version="2.0.0",
                capabilities=app.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                )
            )
        )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down...", file=sys.stderr)
    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
