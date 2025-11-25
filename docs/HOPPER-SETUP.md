# KANTS Hopper Setup Guide

**Vault-Native Orchestration with Automatic Job Harvesting**

## Overview

The Hopper system represents a new paradigm for AI orchestration - instead of running external services, the orchestration happens **inside your Obsidian vault** via the KANTS plugin.

### Components

1. **The Hopper** - Brain-dump inbox for tasks (`Notes/Hopper/The Hopper.md`)
2. **KANTS Plugin** - Background harvester (monitors & auto-creates jobs)
3. **MCP Bridge Plugin** - WebSocket API for external AI access
4. **Obsidian** - The always-running "service"

### Philosophy

- **You** = Chaotic Rick (idea generator)
- **Hopper** = "Good enough" inbox (low friction)
- **Harvester** = Polite Morty (cleans up when you're not looking)

No buttons. No commands. Just automatic structure from chaos.

---

## Installation

### Prerequisites

- Obsidian installed
- dg-kants vault (or your KANTS-configured vault)
- KANTS plugin installed in vault
- MCP Bridge plugin installed in vault

### Step 1: Configure Auto-Start

Run the setup script to configure Obsidian to start automatically:

```powershell
cd C:\Users\sthat\Source\Repos\obsidian-mcp-bridge
.\scripts\setup-kants-autostart.ps1
```

**What it does:**
- Creates Windows Task Scheduler task
- Opens dg-kants vault on system startup
- Delays 1 minute after boot
- Restarts Obsidian if it crashes (up to 3 times)

**Options:**
```powershell
# Custom vault name
.\scripts\setup-kants-autostart.ps1 -VaultName "my-vault"

# Custom startup delay
.\scripts\setup-kants-autostart.ps1 -StartupDelayMinutes 2

# Custom Obsidian path
.\scripts\setup-kants-autostart.ps1 -ObsidianPath "C:\Custom\Path\Obsidian.exe"
```

### Step 2: Configure KANTS Plugin

Open Obsidian → Settings → KANTS:

```yaml
Hopper File: Notes/Hopper/The Hopper.md
Jobs Folder: Notes/Hopper/Incubation/Jobs/
Idle Timeout: 10 minutes
Check Interval: 5 minutes
Auto-Harvest: ✓ Enabled
```

### Step 3: Configure MCP Bridge Plugin

Open Obsidian → Settings → MCP Bridge:

1. **Copy the API Key** (you'll need this for AI clients)
2. **Verify settings:**
   - Host: `127.0.0.1` (localhost)
   - Port: `27125`
   - Require Auth: ✓ Enabled
3. **Test:** Click "Open Test Harness" button

### Step 4: Verify Setup

Run the verification script:

```powershell
.\scripts\verify-kants-bridge.ps1
```

**Should show:**
- ✓ Obsidian is running
- ✓ KANTS plugin directory found
- ✓ MCP Bridge plugin directory found
- ✓ Hopper file exists
- ✓ MCP Bridge WebSocket server is reachable
- ✓ Auto-start task exists

---

## How It Works

### The Hopper File Structure

```markdown
---
fileClass: hopper
title: The Hopper
lastHarvested: 2025-11-25T10:30:00
updated: 2025-11-25T12:15:00
---

# The Hopper

## New Seeds

- [ ] Build out AI job workflow
  - Need to handle status transitions
  - Should support multiple agents
- [ ] Add Dataview integration
- [ ] Test the harvesting system

## Harvested
(Auto-cleared after harvest)
```

### Harvesting Process

1. **You drop tasks** in `## New Seeds`
2. **KANTS plugin monitors** every 5 minutes
3. **Checks conditions:**
   - Is idle timeout reached? (10 min since last edit)
   - Has file been edited since last harvest?
4. **Auto-harvest:**
   - Parses task groups (task + indented sub-items)
   - Creates job file from template for each group
   - Clears `## New Seeds` section
   - Updates `lastHarvested` timestamp

### Job File Structure

Created in `Notes/Hopper/Incubation/Jobs/`:

```markdown
---
fileClass: job
job_id: "job-20251125-1"
project: mycelium-bridge
source: hopper
status: new
priority: 3
run_count: 0
logged: false
job_type: "qna-seed"
tags: [job, ai]
created: 2025-11-25T12:20:00
updated: 2025-11-25T12:20:00
---

# Build out AI job workflow

## Seed Task

- [ ] Build out AI job workflow
  - Need to handle status transitions
  - Should support multiple agents

## Context

(Auto-extracted from seed or manually added)

## Conversation

(AI interactions logged here)
```

### Status Pipeline

Jobs flow through these states:

1. **new** - Just harvested, not yet queued
2. **queued** - Ready for AI to pick up
3. **running** - AI actively working
4. **waiting_human** - Blocked, needs human input
5. **done** - Completed successfully
6. **archived** - Finished and archived

---

## AI Integration

### MCP Server Configuration

Configure your AI client to connect via MCP Bridge:

**Claude Code** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "python",
      "args": ["C:/path/to/obsidian-mcp-bridge/servers/python-old/obsidian_mcp_server_auto.py"],
      "env": {
        "OBSIDIAN_MCP_KEY": "your-api-key-from-plugin",
        "OBSIDIAN_HOST": "localhost",
        "OBSIDIAN_PORT": "27125"
      }
    }
  }
}
```

**Codex** (`~/.codex/config.toml`):
```toml
[[servers]]
name = "obsidian-kants"
command = "python"
args = ["/absolute/path/to/obsidian-mcp-bridge/servers/python-old/obsidian_mcp_server_auto.py"]
env = { OBSIDIAN_MCP_KEY = "your-api-key", OBSIDIAN_HOST = "localhost", OBSIDIAN_PORT = "27125" }
```

### AI Workflow

AI agents can now:

1. **Query jobs** via MCP tools:
   ```javascript
   // List new jobs
   search_files({ pattern: "Notes/Hopper/Incubation/Jobs/*.md" })

   // Read job content
   get_note_raw({ filepath: "Notes/Hopper/Incubation/Jobs/2025-11-25 Build workflow.md" })
   ```

2. **Update job metadata** using `create_note_from_fileclass` or direct edits

3. **Track progress** by updating `status`, `run_count`, and adding to `## Conversation`

4. **Create new jobs** programmatically if needed

---

## Workflow Example

### Day 1: Brain Dump

You open Hopper and dump ideas:

```markdown
## New Seeds

- [ ] Research better job status handling
  - Look at existing orchestration patterns
  - Consider state machines
- [ ] Add rate limiting to MCP Bridge
- [ ] Document the Hopper system
```

**Auto-harvest after 10 minutes of idle:**

3 job files created:
- `2025-11-25 Research better job status handling.md`
- `2025-11-25 Add rate limiting to MCP Bridge.md`
- `2025-11-25 Document the Hopper system.md`

### Day 2: AI Picks Up

Claude Code connects via MCP:

```
AI: I see you have 3 new jobs. Let me work on the documentation one.

[Updates job status to "running"]
[Writes documentation]
[Updates status to "done", increments run_count]
```

### Day 3: Review

You open `Incubation/Jobs/` and see:
- ✓ Documentation job: `status: done`
- ⏳ Research job: `status: running` (AI working)
- 📋 Rate limiting job: `status: new` (not started)

---

## Management

### Manual Commands

**View auto-start task:**
```powershell
Get-ScheduledTask -TaskName "KANTS Vault Auto-Open"
```

**Disable auto-start:**
```powershell
Disable-ScheduledTask -TaskName "KANTS Vault Auto-Open"
```

**Re-enable auto-start:**
```powershell
Enable-ScheduledTask -TaskName "KANTS Vault Auto-Open"
```

**Remove auto-start:**
```powershell
Unregister-ScheduledTask -TaskName "KANTS Vault Auto-Open"
```

**Restart Obsidian:**
```powershell
Stop-Process -Name Obsidian
Start-ScheduledTask -TaskName "KANTS Vault Auto-Open"
```

### Monitoring

**Check if everything is running:**
```powershell
.\scripts\verify-kants-bridge.ps1
```

**View Obsidian console logs:**
- In Obsidian: View → Toggle Developer Tools
- Console tab shows KANTS and MCP Bridge logs

**Check harvest activity:**
- Open The Hopper file
- Check `lastHarvested` timestamp in frontmatter
- Look for new files in `Incubation/Jobs/`

---

## Troubleshooting

### Harvesting Not Working

**Problem:** Seeds stay in Hopper, no jobs created

**Check:**
1. Is KANTS plugin enabled? (Settings → Community Plugins)
2. Is auto-harvest enabled in KANTS settings?
3. Has idle timeout passed? (Default: 10 minutes)
4. Check Obsidian console for errors

**Fix:**
- Reload KANTS plugin (Cmd/Ctrl+R)
- Verify Hopper file path in settings
- Check jobs folder exists

### MCP Bridge Not Reachable

**Problem:** AI clients can't connect

**Check:**
```powershell
.\scripts\verify-kants-bridge.ps1
```

**Fix:**
- Restart MCP Bridge plugin
- Check firewall isn't blocking port 27125
- Verify API key matches in client config
- Try test harness: Settings → MCP Bridge → Open Test Harness

### Obsidian Won't Auto-Start

**Problem:** Vault doesn't open on boot

**Check:**
```powershell
Get-ScheduledTask -TaskName "KANTS Vault Auto-Open" | Format-List *
```

**Fix:**
- Re-run setup script: `.\scripts\setup-kants-autostart.ps1`
- Check task is enabled: `Enable-ScheduledTask -TaskName "KANTS Vault Auto-Open"`
- Test manually: `Start-ScheduledTask -TaskName "KANTS Vault Auto-Open"`

---

## Advanced Configuration

### Custom Harvest Intervals

Edit KANTS plugin settings:
- **Check Interval:** How often to check Hopper (default: 5 minutes)
- **Idle Timeout:** How long to wait after last edit (default: 10 minutes)

### Multiple Hoppers

You can create multiple hopper files for different workflows:
- Main hopper for general tasks
- Project-specific hoppers
- Quick capture hopper (shorter timeout)

Each needs its own KANTS plugin instance or configuration.

### Job Templates

Customize job structure in `_kants/Admin/Templates/Hopper Job.md`:
- Add custom frontmatter fields
- Change body structure
- Add default sections

---

## Benefits Over External Orchestrator

✅ **No PM2/systemd needed** - Obsidian is the service
✅ **Vault-native** - Everything in one place
✅ **Simpler debugging** - Just reload plugins
✅ **Ambient operation** - No manual triggers
✅ **Crash recovery** - Task Scheduler handles it
✅ **Unified logs** - All in Obsidian console

---

## Related Documentation

- [MCP Bridge README](../README.md)
- [Hopper Concept (dg-kants vault)](C:/Users/sthat/OneDrive/Documents/Obsidian/dg-kants/Notes/Hopper/)
- [KANTS Plugin Documentation](C:/Users/sthat/OneDrive/Documents/Obsidian/dg-kants/_kants/)

---

**Version:** 1.0
**Last Updated:** 2025-11-25
