#!/usr/bin/env python3
"""
Obsidian MCP Server - Auto-Discovery Version
Automatically discovers available tools from the MCP Bridge WebSocket server
"""

import os
import sys
import json
import asyncio
import websockets
from typing import Any, Optional, List, Dict

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

# Store discovered tools
discovered_tools: List[Dict[str, Any]] = []

# Create MCP server
app = Server("obsidian-auto-discovery")


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

        print(f"✓ Connected to Obsidian MCP Bridge at {OBSIDIAN_WS_URL}", file=sys.stderr)

    except Exception as e:
        print(f"✗ Failed to connect to Obsidian plugin: {e}", file=sys.stderr)
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
    request_id = f"{method}_{id(params)}_{asyncio.get_event_loop().time()}"
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

        # Wait for response with matching ID (with timeout)
        timeout = 30.0
        deadline = asyncio.get_event_loop().time() + timeout

        while asyncio.get_event_loop().time() < deadline:
            try:
                response_str = await asyncio.wait_for(
                    ws_connection.recv(),
                    timeout=max(0.1, deadline - asyncio.get_event_loop().time())
                )
                response = json.loads(response_str)

                # Check if this is our response
                if response.get("id") == request_id:
                    pending_requests.discard(request_id)

                    # Handle errors
                    if "error" in response:
                        raise Exception(response["error"])

                    # Return result
                    return response.get("result")

            except asyncio.TimeoutError:
                continue

        # Request timed out
        pending_requests.discard(request_id)
        raise Exception(f"Request timed out after {timeout}s")

    except websockets.exceptions.ConnectionClosed:
        pending_requests.discard(request_id)
        # Try to reconnect once
        await connect_to_plugin()
        return await call_plugin(method, params)

    except Exception as e:
        pending_requests.discard(request_id)
        raise Exception(f"Plugin call failed: {str(e)}")


async def discover_tools():
    """Discover available tools from the WebSocket server"""
    global discovered_tools

    try:
        print("Discovering tools from MCP Bridge...", file=sys.stderr)

        result = await call_plugin("tools/list", {})
        discovered_tools = result.get("tools", [])

        print(f"✓ Discovered {len(discovered_tools)} tools:", file=sys.stderr)
        for tool in discovered_tools:
            category = tool.get("category", "other")
            print(f"  - {tool['name']} ({category})", file=sys.stderr)

    except Exception as e:
        print(f"✗ Failed to discover tools: {e}", file=sys.stderr)
        print("  Falling back to empty tool list", file=sys.stderr)
        discovered_tools = []


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


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Call a tool by routing to the WebSocket server"""
    try:
        # Find the tool
        tool = next((t for t in discovered_tools if t["name"] == name), None)
        if not tool:
            raise Exception(f"Unknown tool: {name}")

        # Call the tool through the WebSocket
        result = await call_plugin(name, arguments)

        # Format response
        response_text = json.dumps(result, indent=2)

        return [
            TextContent(
                type="text",
                text=response_text
            )
        ]

    except Exception as e:
        error_msg = f"Error calling {name}: {str(e)}"
        print(error_msg, file=sys.stderr)
        return [
            TextContent(
                type="text",
                text=error_msg
            )
        ]


async def broadcast_listener():
    """Listen for broadcast notifications from the vault"""
    while True:
        try:
            await ensure_connection()

            message_str = await ws_connection.recv()
            message = json.loads(message_str)

            # Check if this is a broadcast (not a response to our request)
            message_id = message.get("id")
            if message_id is None or message_id not in pending_requests:
                # This is a broadcast notification from the vault
                print(f"Broadcast received: {message}", file=sys.stderr)

                # Forward to AI client as a notification
                if hasattr(app, 'request_context') and app.request_context:
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

    # Discover available tools
    await discover_tools()

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
