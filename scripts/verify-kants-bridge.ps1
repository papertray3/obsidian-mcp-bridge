# KANTS MCP Bridge Verification Script
# Verifies that Obsidian, KANTS plugin, and MCP Bridge are running correctly

param(
    [string]$VaultPath = "C:\Users\sthat\OneDrive\Documents\Obsidian\dg-kants",
    [string]$BridgeHost = "localhost",
    [int]$BridgePort = 27125
)

Write-Host "=== KANTS System Verification ===" -ForegroundColor Cyan
Write-Host ""

# Check if Obsidian is running
Write-Host "[1/5] Checking Obsidian process..." -ForegroundColor Cyan
$obsidianProcess = Get-Process -Name Obsidian -ErrorAction SilentlyContinue
if ($obsidianProcess) {
    Write-Host "  ✓ Obsidian is running (PID: $($obsidianProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  ✗ Obsidian is NOT running" -ForegroundColor Red
    Write-Host "  → Start Obsidian or run: Start-ScheduledTask -TaskName 'KANTS Vault Auto-Open'" -ForegroundColor Yellow
    exit 1
}

# Check if vault exists
Write-Host ""
Write-Host "[2/5] Checking vault structure..." -ForegroundColor Cyan
if (Test-Path $VaultPath) {
    Write-Host "  ✓ Vault exists: $VaultPath" -ForegroundColor Green

    # Check for KANTS plugin
    $kantsPluginPath = Join-Path $VaultPath ".obsidian\plugins\kants"
    if (Test-Path $kantsPluginPath) {
        Write-Host "  ✓ KANTS plugin directory found" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ KANTS plugin directory not found at $kantsPluginPath" -ForegroundColor Yellow
    }

    # Check for MCP Bridge plugin
    $mcpBridgePath = Join-Path $VaultPath ".obsidian\plugins\obsidian-mcp-bridge"
    if (Test-Path $mcpBridgePath) {
        Write-Host "  ✓ MCP Bridge plugin directory found" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ MCP Bridge plugin directory not found at $mcpBridgePath" -ForegroundColor Yellow
    }

    # Check for Hopper file
    $hopperPath = Join-Path $VaultPath "Notes\Hopper\The Hopper.md"
    if (Test-Path $hopperPath) {
        Write-Host "  ✓ Hopper file exists" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Hopper file not found at $hopperPath" -ForegroundColor Yellow
    }

} else {
    Write-Host "  ✗ Vault not found: $VaultPath" -ForegroundColor Red
    exit 1
}

# Check MCP Bridge WebSocket server
Write-Host ""
Write-Host "[3/5] Testing MCP Bridge WebSocket connection..." -ForegroundColor Cyan
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $tcpClient.Connect($BridgeHost, $BridgePort)

    if ($tcpClient.Connected) {
        Write-Host "  ✓ MCP Bridge WebSocket server is reachable on ${BridgeHost}:${BridgePort}" -ForegroundColor Green
        $tcpClient.Close()
    } else {
        Write-Host "  ✗ Cannot connect to MCP Bridge" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ MCP Bridge is NOT running on ${BridgeHost}:${BridgePort}" -ForegroundColor Red
    Write-Host "  → Check that MCP Bridge plugin is enabled in Obsidian" -ForegroundColor Yellow
}

# Check scheduled task
Write-Host ""
Write-Host "[4/5] Checking auto-start configuration..." -ForegroundColor Cyan
$task = Get-ScheduledTask -TaskName "KANTS Vault Auto-Open" -ErrorAction SilentlyContinue
if ($task) {
    $taskState = $task.State
    Write-Host "  ✓ Auto-start task exists (State: $taskState)" -ForegroundColor Green

    if ($taskState -eq "Ready") {
        Write-Host "  ✓ Task is enabled and will run on startup" -ForegroundColor Green
    } elseif ($taskState -eq "Disabled") {
        Write-Host "  ⚠ Task is disabled - enable with: Enable-ScheduledTask -TaskName 'KANTS Vault Auto-Open'" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠ Auto-start task not found" -ForegroundColor Yellow
    Write-Host "  → Run: .\scripts\setup-kants-autostart.ps1" -ForegroundColor Yellow
}

# Summary and recommendations
Write-Host ""
Write-Host "[5/5] System Status Summary" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

if (!$obsidianProcess) { $allGood = $false }
if (!(Test-Path $mcpBridgePath)) { $allGood = $false }

if ($allGood) {
    Write-Host "=== Status: READY ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your KANTS orchestration system is ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Add tasks to Hopper → New Seeds section"
    Write-Host "  2. Wait for auto-harvest (idle timeout)"
    Write-Host "  3. Check Incubation/Jobs/ for created job files"
    Write-Host "  4. AI agents can connect via MCP Bridge"
    Write-Host ""
} else {
    Write-Host "=== Status: NEEDS ATTENTION ===" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Some components need configuration. Review the warnings above." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "=== Connection Info ===" -ForegroundColor Cyan
Write-Host "MCP Bridge WebSocket: ws://${BridgeHost}:${BridgePort}"
Write-Host "Vault Path: $VaultPath"
Write-Host ""

Write-Host "=== Useful Commands ===" -ForegroundColor Cyan
Write-Host "View Obsidian plugins:"
Write-Host "  Get-ChildItem '$VaultPath\.obsidian\plugins'"
Write-Host ""
Write-Host "Restart Obsidian:"
Write-Host "  Stop-Process -Name Obsidian; Start-ScheduledTask -TaskName 'KANTS Vault Auto-Open'"
Write-Host ""
Write-Host "View auto-start task:"
Write-Host "  Get-ScheduledTask -TaskName 'KANTS Vault Auto-Open' | Format-List *"
Write-Host ""
