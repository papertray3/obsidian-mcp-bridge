# KANTS Vault Auto-Start Setup
# Configures Obsidian to start automatically with the dg-kants vault
# This enables the Hopper harvesting system to run continuously

param(
    [string]$VaultName = "dg-kants",
    [string]$ObsidianPath = "$env:LOCALAPPDATA\Obsidian\Obsidian.exe",
    [int]$StartupDelayMinutes = 1
)

Write-Host "=== KANTS Vault Auto-Start Setup ===" -ForegroundColor Cyan
Write-Host ""

# Verify Obsidian exists
if (!(Test-Path $ObsidianPath)) {
    Write-Host "ERROR: Obsidian not found at $ObsidianPath" -ForegroundColor Red
    Write-Host "Please specify the correct path with -ObsidianPath parameter" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found Obsidian: $ObsidianPath" -ForegroundColor Green

# Create scheduled task
Write-Host ""
Write-Host "Creating scheduled task 'KANTS Vault Auto-Open'..." -ForegroundColor Cyan

$action = New-ScheduledTaskAction `
    -Execute $ObsidianPath `
    -Argument "obsidian://open?vault=$VaultName"

$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = "PT${StartupDelayMinutes}M"  # Wait N minutes after boot

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5)

# Remove existing task if present
$existingTask = Get-ScheduledTask -TaskName "KANTS Vault Auto-Open" -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName "KANTS Vault Auto-Open" -Confirm:$false
}

# Register new task
Register-ScheduledTask `
    -TaskName "KANTS Vault Auto-Open" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Automatically opens the $VaultName Obsidian vault on system startup to enable Hopper harvesting and MCP Bridge access"

Write-Host "✓ Scheduled task created successfully" -ForegroundColor Green

# Display task info
Write-Host ""
Write-Host "=== Task Configuration ===" -ForegroundColor Cyan
Write-Host "Task Name: KANTS Vault Auto-Open"
Write-Host "Vault: $VaultName"
Write-Host "Startup Delay: $StartupDelayMinutes minute(s)"
Write-Host "Restart Policy: Up to 3 retries, 5-minute intervals"
Write-Host ""

# Test the task
Write-Host "=== Testing Task ===" -ForegroundColor Cyan
Write-Host "Starting Obsidian to verify configuration..." -ForegroundColor Yellow
Write-Host ""

Start-ScheduledTask -TaskName "KANTS Vault Auto-Open"
Start-Sleep -Seconds 3

$obsidianRunning = Get-Process -Name Obsidian -ErrorAction SilentlyContinue
if ($obsidianRunning) {
    Write-Host "✓ Obsidian started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "The vault should now be open. Please verify:" -ForegroundColor Cyan
    Write-Host "  1. Correct vault ($VaultName) is open"
    Write-Host "  2. KANTS plugin is enabled (Settings > Community Plugins)"
    Write-Host "  3. MCP Bridge plugin is enabled and running"
    Write-Host ""
    Write-Host "You can close Obsidian now - it will auto-start on next boot." -ForegroundColor Yellow
} else {
    Write-Host "⚠ Obsidian process not detected" -ForegroundColor Yellow
    Write-Host "The task was created, but manual verification is needed." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Verify KANTS plugin settings:"
Write-Host "   - Hopper file: Notes/Hopper/The Hopper.md"
Write-Host "   - Jobs folder: Notes/Hopper/Incubation/Jobs/"
Write-Host "   - Idle timeout: 10 minutes"
Write-Host "   - Auto-harvest: Enabled"
Write-Host ""
Write-Host "2. Verify MCP Bridge plugin settings:"
Write-Host "   - Copy API key for AI client configuration"
Write-Host "   - Confirm WebSocket server is running (port 27125)"
Write-Host ""
Write-Host "3. Test the Hopper workflow:"
Write-Host "   - Add a task to Hopper > New Seeds section"
Write-Host "   - Wait 10+ minutes (idle timeout)"
Write-Host "   - Check Incubation/Jobs/ for auto-created job file"
Write-Host ""
Write-Host "=== Management Commands ===" -ForegroundColor Cyan
Write-Host "View task status:"
Write-Host "  Get-ScheduledTask -TaskName 'KANTS Vault Auto-Open'"
Write-Host ""
Write-Host "Disable auto-start:"
Write-Host "  Disable-ScheduledTask -TaskName 'KANTS Vault Auto-Open'"
Write-Host ""
Write-Host "Re-enable auto-start:"
Write-Host "  Enable-ScheduledTask -TaskName 'KANTS Vault Auto-Open'"
Write-Host ""
Write-Host "Remove auto-start:"
Write-Host "  Unregister-ScheduledTask -TaskName 'KANTS Vault Auto-Open'"
Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
