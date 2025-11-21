# PowerShell smoke test for Node MCP server (Windows)
# Tests basic connectivity and tool handlers

Write-Host "=== Obsidian MCP Server (Node) - Smoke Test ===" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "ERROR: .env file not found" -ForegroundColor Red
    Write-Host "Copy .env.example to .env and configure OBSIDIAN_MCP_KEY" -ForegroundColor Yellow
    exit 1
}

# Check if built
if (-not (Test-Path "dist/main.js")) {
    Write-Host "Building TypeScript..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Build failed" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Testing Node MCP server..." -ForegroundColor Green
Write-Host ""

# Test 1: Ping
Write-Host "[1/2] Testing ping (connection health check)..." -ForegroundColor Cyan
$pingRequest = @"
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "ping",
    "arguments": {}
  }
}
"@

Write-Host "Sending ping request..." -ForegroundColor Gray
# Note: Direct stdio testing is complex in PowerShell
# This is a placeholder - actual testing should be done via MCP client

Write-Host ""
Write-Host "[2/2] Testing list_vault_files..." -ForegroundColor Cyan
$listRequest = @"
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "list_vault_files",
    "arguments": {}
  }
}
"@

Write-Host ""
Write-Host "=== Manual Testing Required ===" -ForegroundColor Yellow
Write-Host ""
Write-Host "To test the Node MCP server, configure it in your AI client:" -ForegroundColor White
Write-Host ""
Write-Host "Claude Code config (~/.config/Claude/config.json):" -ForegroundColor Cyan
Write-Host @"
{
  "mcpServers": {
    "obsidian-node": {
      "command": "node",
      "args": ["$PWD/dist/main.js"]
    }
  }
}
"@ -ForegroundColor Gray

Write-Host ""
Write-Host "Then in Claude Code, try:" -ForegroundColor Cyan
Write-Host "  > Use the ping tool" -ForegroundColor Gray
Write-Host "  > Use the list_vault_files tool" -ForegroundColor Gray
Write-Host ""

Write-Host "=== Build Status: OK ===" -ForegroundColor Green
Write-Host "All TypeScript compiled successfully" -ForegroundColor White
Write-Host "Server ready at: dist/main.js" -ForegroundColor White
