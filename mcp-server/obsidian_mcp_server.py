#!/usr/bin/env python3
"""
Obsidian MCP Server - Direct API Access
Connects to Obsidian MCP Bridge plugin via WebSocket
"""

import os
import sys
import json
import asyncio
import websockets
from typing import Any, Optional

# Import MCP SDK
try:
    from mcp.server import Server
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

# Create MCP server
app = Server("obsidian-direct")


async def connect_to_plugin():
    """Connect to Obsidian MCP Bridge plugin"""
    global ws_connection

    if not OBSIDIAN_API_KEY:
        print("Warning: OBSIDIAN_MCP_KEY not set. Authentication may fail.", file=sys.stderr)

    try:
        # TODO: SSL context for remote connections (Phase 5+)
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
        sys.exit(1)


async def ensure_connection():
    """Ensure WebSocket connection is alive"""
    global ws_connection

    if not ws_connection or ws_connection.closed:
        await connect_to_plugin()


async def call_plugin(method: str, params: dict) -> Any:
    """Send request to Obsidian plugin via WebSocket"""
    await ensure_connection()

    # Build request
    request = {
        "auth": OBSIDIAN_API_KEY,
        "method": method,
        "params": params
    }

    try:
        # Send request
        await ws_connection.send(json.dumps(request))

        # Wait for response
        response_str = await ws_connection.recv()
        response = json.loads(response_str)

        # Handle errors
        if "error" in response:
            raise Exception(response["error"])

        # Return result
        return response.get("result")

    except websockets.exceptions.ConnectionClosed:
        # Try to reconnect once
        await connect_to_plugin()
        return await call_plugin(method, params)

    except Exception as e:
        raise Exception(f"Plugin call failed: {str(e)}")


# === MCP Tool Definitions ===

@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools"""
    return [
        Tool(
            name="render_note",
            description="Get fully-rendered HTML content of a note. Includes executed Dataview queries, plugin output, etc. Matches exactly what you see in Obsidian UI.",
            inputSchema={
                "type": "object",
                "properties": {
                    "filepath": {
                        "type": "string",
                        "description": "Path to the note file (relative to vault root)"
                    }
                },
                "required": ["filepath"]
            }
        ),
        Tool(
            name="get_note_raw",
            description="Get raw markdown content of a note (no rendering)",
            inputSchema={
                "type": "object",
                "properties": {
                    "filepath": {
                        "type": "string",
                        "description": "Path to the note file (relative to vault root)"
                    }
                },
                "required": ["filepath"]
            }
        ),
        Tool(
            name="list_vault_files",
            description="List all markdown files in vault or specific folder",
            inputSchema={
                "type": "object",
                "properties": {
                    "folder": {
                        "type": "string",
                        "description": "Optional: folder to list files from (relative to vault root)"
                    }
                }
            }
        ),
        Tool(
            name="ping",
            description="Check if connection to Obsidian plugin is working",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        )
    ]


@app.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent]:
    """Handle tool calls"""
    try:
        # Route to plugin
        if name == "render_note":
            result = await call_plugin("render_note", {"filepath": arguments["filepath"]})
            return [TextContent(type="text", text=result)]

        elif name == "get_note_raw":
            result = await call_plugin("get_note_raw", {"filepath": arguments["filepath"]})
            return [TextContent(type="text", text=result)]

        elif name == "list_vault_files":
            folder = arguments.get("folder", "")
            result = await call_plugin("list_vault_files", {"folder": folder})
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

        elif name == "ping":
            result = await call_plugin("ping", {})
            return [TextContent(type="text", text=json.dumps(result))]

        else:
            raise ValueError(f"Unknown tool: {name}")

    except Exception as e:
        return [TextContent(type="text", text=f"Error: {str(e)}")]


async def main():
    """Main entry point"""
    # Connect to plugin
    await connect_to_plugin()

    # Run stdio server
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
