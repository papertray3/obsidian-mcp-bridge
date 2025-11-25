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

# Track pending requests to distinguish broadcasts from responses
pending_requests = set()

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


def _is_ws_closed() -> bool:
    """Robustly detect if the websocket connection is closed across websockets versions."""
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

            # This is a broadcast notification - handle it in the background listener
            # (it will be picked up by the broadcast listener task)

    except websockets.exceptions.ConnectionClosed:
        pending_requests.discard(request_id)
        # Try to reconnect once
        await connect_to_plugin()
        return await call_plugin(method, params)

    except Exception as e:
        pending_requests.discard(request_id)
        raise Exception(f"Plugin call failed: {str(e)}")


# === MCP Tool Definitions ===

@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools"""
    return [
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
            name="list_plugins",
            description="List installed Obsidian plugins and their status",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
        Tool(
            name="get_plugin_info",
            description="Get details about a specific plugin, including manifest and available API methods",
            inputSchema={
                "type": "object",
                "properties": {
                    "plugin_id": {
                        "type": "string",
                        "description": "Plugin identifier (e.g., dataview)"
                    }
                },
                "required": ["plugin_id"]
            }
        ),
        Tool(
            name="dataview_query",
            description="Execute a Dataview query and return rendered markdown output",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Dataview query text"
                    },
                    "context_path": {
                        "type": "string",
                        "description": "Optional path to use as query context"
                    }
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="search_vault",
            description="Search markdown filenames/paths for a query string",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search term"
                    },
                    "folder": {
                        "type": "string",
                        "description": "Optional folder to scope search within"
                    }
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="render_note_dg_compiled",
            description="Render a note using Digital Garden's compiler with caching. Returns metadata about cached file (path, hash, size) instead of full HTML content. Use this for large notes that exceed MCP size limits. Requires Digital Garden plugin to be installed and enabled.",
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
            name="run_dataview_block",
            description="Execute a Dataview or DataviewJS query block and return the rendered result. Useful for extracting specific tables or data from notes without rendering entire dashboards. Requires Dataview plugin to be installed and enabled.",
            inputSchema={
                "type": "object",
                "properties": {
                    "filepath": {
                        "type": "string",
                        "description": "Optional: Path to the note file to use as execution context (for this.file, dv.current(), etc.)"
                    },
                    "flavor": {
                        "type": "string",
                        "enum": ["dataview", "dataviewjs"],
                        "description": "Type of query: 'dataview' for DQL queries, 'dataviewjs' for JavaScript code"
                    },
                    "source": {
                        "type": "string",
                        "description": "The query or script source code (without the ```dataview wrapper)"
                    },
                    "input": {
                        "description": "Optional: Input data to pass to DataviewJS scripts (available as 'input' variable)"
                    }
                },
                "required": ["flavor", "source"]
            }
        ),
        Tool(
            name="extract_dataview_blocks",
            description="Extract all Dataview and DataviewJS blocks from a note. Returns list of blocks with their source code, type, and line numbers. Useful for discovering what queries are in a note before executing them.",
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
        if name == "get_note_raw":
            result = await call_plugin("get_note_raw", {"filepath": arguments["filepath"]})
            return [TextContent(type="text", text=result)]

        elif name == "list_vault_files":
            folder = arguments.get("folder", "")
            result = await call_plugin("list_vault_files", {"folder": folder})
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

        elif name == "list_plugins":
            result = await call_plugin("list_plugins", {})
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

        elif name == "get_plugin_info":
            plugin_id = arguments.get("plugin_id") or arguments.get("pluginId")
            if not plugin_id:
                raise ValueError("get_plugin_info requires plugin_id")
            result = await call_plugin("get_plugin_info", {"pluginId": plugin_id})
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

        elif name == "dataview_query":
            query = arguments.get("query")
            if not query:
                raise ValueError("dataview_query requires query text")
            context_path = arguments.get("context_path") or arguments.get("contextPath") or ""
            result = await call_plugin("dataview_query", {
                "query": query,
                "context": context_path
            })
            return [TextContent(type="text", text=result)]

        elif name == "search_vault":
            query = arguments.get("query")
            if not query:
                raise ValueError("search_vault requires query text")
            folder = arguments.get("folder") or ""
            result = await call_plugin("search_vault", {
                "query": query,
                "folder": folder
            })
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

        elif name == "render_note_dg_compiled":
            filepath = arguments.get("filepath")
            if not filepath:
                raise ValueError("render_note_dg_compiled requires filepath")
            result = await call_plugin("render_note_dg_compiled", {"filepath": filepath})
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

        elif name == "run_dataview_block":
            flavor = arguments.get("flavor")
            source = arguments.get("source")
            if not flavor:
                raise ValueError("run_dataview_block requires flavor (dataview or dataviewjs)")
            if not source:
                raise ValueError("run_dataview_block requires source (the query/script)")

            result = await call_plugin("run_dataview_block", {
                "filepath": arguments.get("filepath", ""),
                "flavor": flavor,
                "source": source,
                "input": arguments.get("input")
            })
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

        elif name == "extract_dataview_blocks":
            filepath = arguments.get("filepath")
            if not filepath:
                raise ValueError("extract_dataview_blocks requires filepath")
            result = await call_plugin("extract_dataview_blocks", {"filepath": filepath})
            return [TextContent(type="text", text=json.dumps(result, indent=2))]

        elif name == "ping":
            result = await call_plugin("ping", {})
            return [TextContent(type="text", text=json.dumps(result))]

        else:
            raise ValueError(f"Unknown tool: {name}")

    except Exception as e:
        return [TextContent(type="text", text=f"Error: {str(e)}")]


async def broadcast_listener():
    """Background task that listens for broadcast notifications from the vault"""
    print("Starting broadcast listener...", file=sys.stderr)

    while True:
        try:
            await ensure_connection()

            # Listen for messages
            message_str = await ws_connection.recv()
            message = json.loads(message_str)

            # Check if this is a broadcast (not a response to our request)
            # Broadcasts won't have an 'id' field or will have id not in pending_requests
            message_id = message.get("id")
            if message_id is None or message_id not in pending_requests:
                # This is a broadcast notification from the vault
                print(f"Broadcast received: {message}", file=sys.stderr)

                # Forward to AI client as a notification
                await app.request_context.session.send_notification(
                    "vault/notification",
                    message
                )

        except websockets.exceptions.ConnectionClosed:
            print("WebSocket closed in broadcast listener, reconnecting...", file=sys.stderr)
            await asyncio.sleep(1)
            await connect_to_plugin()

        except Exception as e:
            print(f"Error in broadcast listener: {e}", file=sys.stderr)
            await asyncio.sleep(1)


async def main():
    """Main entry point"""
    # Connect to plugin
    await connect_to_plugin()

    # Run stdio server
    async with stdio_server() as (read_stream, write_stream):
        # Create a task for the broadcast listener
        listener_task = asyncio.create_task(broadcast_listener())

        try:
            await app.run(
                read_stream,
                write_stream,
                app.create_initialization_options()
            )
        finally:
            listener_task.cancel()
            try:
                await listener_task
            except asyncio.CancelledError:
                pass


if __name__ == "__main__":
    asyncio.run(main())
