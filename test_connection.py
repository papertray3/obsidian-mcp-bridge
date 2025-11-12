#!/usr/bin/env python3
"""
Quick connection test for Obsidian MCP Bridge
Run this after enabling the plugin in Obsidian to verify WebSocket connection works
"""

import asyncio
import websockets
import json
import os
import sys

# Get API key from environment
API_KEY = os.getenv('OBSIDIAN_MCP_KEY', '')

async def test_connection():
    """Test connection to Obsidian plugin"""
    print("=" * 60)
    print("Obsidian MCP Bridge - Connection Test")
    print("=" * 60)
    print()

    # Check API key
    if not API_KEY:
        print("❌ Error: OBSIDIAN_MCP_KEY environment variable not set")
        print()
        print("To fix:")
        print("  Windows PowerShell:")
        print('    $env:OBSIDIAN_MCP_KEY = "your-api-key-here"')
        print()
        print("  Windows CMD:")
        print('    set OBSIDIAN_MCP_KEY=your-api-key-here')
        print()
        print("Get the API key from: Obsidian Settings → MCP Bridge")
        sys.exit(1)

    print(f"✓ API key found: {API_KEY[:8]}...")
    print()

    # Try to connect
    try:
        print("Connecting to ws://localhost:27125...")
        ws = await websockets.connect('ws://localhost:27125')
        print("✓ WebSocket connection established")
        print()

        # Test 1: Ping
        print("Test 1: Ping")
        print("-" * 40)
        request = {
            "auth": API_KEY,
            "method": "ping",
            "params": {}
        }

        await ws.send(json.dumps(request))
        response = await ws.recv()
        result = json.loads(response)

        if "error" in result:
            print(f"❌ Error: {result['error']}")
            if "Unauthorized" in result['error']:
                print()
                print("API key is incorrect. Please:")
                print("1. Open Obsidian Settings → MCP Bridge")
                print("2. Copy the API Key")
                print("3. Set OBSIDIAN_MCP_KEY environment variable")
            await ws.close()
            sys.exit(1)

        print(f"✓ Response: {json.dumps(result['result'], indent=2)}")
        print()

        # Test 2: List files
        print("Test 2: List vault files")
        print("-" * 40)
        request = {
            "auth": API_KEY,
            "method": "list_vault_files",
            "params": {"folder": ""}
        }

        await ws.send(json.dumps(request))
        response = await ws.recv()
        result = json.loads(response)

        if "error" in result:
            print(f"❌ Error: {result['error']}")
        else:
            files = result['result']
            print(f"✓ Found {len(files)} markdown files in vault")
            print(f"  First few: {files[:3]}")
        print()

        # Test 3: Get raw note (if Home.md exists)
        print("Test 3: Get raw note content")
        print("-" * 40)
        test_file = "Notes/00_Sowing/Home.md"
        request = {
            "auth": API_KEY,
            "method": "get_note_raw",
            "params": {"filepath": test_file}
        }

        await ws.send(json.dumps(request))
        response = await ws.recv()
        result = json.loads(response)

        if "error" in result:
            print(f"⚠ Note not found: {test_file}")
            print(f"  Error: {result['error']}")
        else:
            content = result['result']
            print(f"✓ Successfully read {test_file}")
            print(f"  Content length: {len(content)} characters")
            print(f"  First 100 chars: {content[:100]}...")
        print()

        # Test 4: Render note (the big test!)
        print("Test 4: Render note with Dataview")
        print("-" * 40)
        request = {
            "auth": API_KEY,
            "method": "render_note",
            "params": {"filepath": test_file}
        }

        print("Requesting render (this may take 2-3 seconds for Dataview)...")
        await ws.send(json.dumps(request))
        response = await ws.recv()
        result = json.loads(response)

        if "error" in result:
            print(f"❌ Error: {result['error']}")
        else:
            html = result['result']
            print(f"✓ Successfully rendered {test_file}")
            print(f"  HTML length: {len(html)} characters")

            # Check for Dataview indicators
            if 'data-tag-name' in html:
                print("  ✓ Dataview content detected!")
            else:
                print("  ⚠ No Dataview content found (note may not have Dataview queries)")

            if '<table' in html:
                print("  ✓ HTML tables found")

            print(f"  First 200 chars: {html[:200]}...")
        print()

        await ws.close()

        # Success!
        print("=" * 60)
        print("✅ All tests passed! Connection is working.")
        print("=" * 60)
        print()
        print("Next steps:")
        print("1. Configure Claude Code or Codex (see docs/setup.md)")
        print("2. Test end-to-end with AI client")
        print("3. Try rendering other notes in your vault")

    except ConnectionRefusedError:
        print("❌ Connection refused")
        print()
        print("Make sure:")
        print("  1. Obsidian is running")
        print("  2. MCP Bridge plugin is enabled")
        print("     (Settings → Community Plugins → MCP Bridge)")
        print("  3. WebSocket server is started")
        print("     (Check plugin status in settings)")
        sys.exit(1)

    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_connection())
