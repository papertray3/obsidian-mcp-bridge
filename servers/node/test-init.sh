#!/bin/bash
# Simple test to check if the MCP server initializes

export OBSIDIAN_MCP_KEY="test-key"
export OBSIDIAN_HOST="localhost"
export OBSIDIAN_PORT="27125"
export LOG_LEVEL="debug"

# Run server and timeout after 5 seconds
timeout 5s node ./dist/main.js <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0"}}}
EOF

echo "Exit code: $?"
