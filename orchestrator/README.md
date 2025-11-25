# Mycelium Orchestrator

Multi-agent workflow orchestration for Obsidian vaults.

## Overview

The Mycelium Orchestrator enables you to run multiple AI agents with vault-specific tool configurations. Each vault can have its own set of tools, profiles, and roles, allowing you to orchestrate complex workflows with different AI agents.

## Installation

```bash
# Install dependencies
cd C:\Users\sthat\mycelium-orchestrator
npm install
```

## Setup

### 1. Initialize Config in Your Vault

```bash
node bin/mycelium.js init --vault "C:\Users\sthat\OneDrive\Documents\Obsidian\DigitalGarden"
```

This creates `.obsidian/mycelium/` in your vault with default configurations:
- `tools.json` - Tool definitions (codex, claude-code, etc.)
- `profiles.json` - Model profiles (fast-writer, precise-editor, etc.)
- `roles.json` - Agent roles (noir-writer, fiction-editor, etc.)
- `settings.json` - General orchestrator settings

### 2. Set Environment Variable (Optional)

```powershell
# PowerShell
$env:MYCELIUM_VAULT = "C:\Users\sthat\OneDrive\Documents\Obsidian\DigitalGarden"

# Or add to your PowerShell profile for persistence
Add-Content $PROFILE "`n`$env:MYCELIUM_VAULT = 'C:\Users\sthat\OneDrive\Documents\Obsidian\DigitalGarden'"
```

Then you can run commands without `--vault` flag:
```bash
node bin/mycelium.js list
```

## Usage

### List Available Tools and Roles

```bash
node bin/mycelium.js list --vault "C:\path\to\vault"

# Or with environment variable set:
node bin/mycelium.js list
```

### Test Role Configuration

```bash
node bin/mycelium.js test --role noir-writer --vault "C:\path\to\vault"
```

This shows the resolved configuration (tool + profile + role merged).

### Run a Single Job

```bash
node bin/mycelium.js run \
  --vault "C:\path\to\vault" \
  --role general-assistant \
  --prompt "Write a short story about a detective" \
  --output "Stories/detective-story.md"
```

## Configuration

### Tools (`tools.json`)

Define available tools and how to invoke them:

```json
{
  "tools": {
    "codex": {
      "command": "wsl",
      "args": ["--distribution", "Ubuntu", "--", "codex"],
      "path_translation": "windows_to_wsl",
      "description": "Codex CLI (WSL only)",
      "env": {}
    },
    "claude-code": {
      "command": "claude-code",
      "args": [],
      "description": "Claude Code CLI",
      "env": {}
    }
  }
}
```

**Path Translation:**
- `"windows_to_wsl"` - Converts `C:\Users\...` to `/mnt/c/Users/...`
- `"wsl_to_windows"` - Converts `/mnt/c/...` to `C:\...`
- Omit for no translation

### Profiles (`profiles.json`)

Define model parameter presets:

```json
{
  "profiles": {
    "creative-writer": {
      "model": "claude-sonnet-4.5",
      "temperature": 0.9,
      "max_tokens": 4000
    },
    "precise-editor": {
      "model": "gpt-4",
      "temperature": 0.3,
      "max_tokens": 4000
    }
  }
}
```

### Roles (`roles.json`)

Define agent roles combining tools, profiles, and prompts:

```json
{
  "roles": {
    "noir-writer": {
      "tool": "codex",
      "profile": "creative-writer",
      "system_prompt": "You are a noir fiction writer with a gritty, atmospheric style.",
      "defaults": {
        "temperature": 0.9
      }
    }
  }
}
```

## Architecture

### Layered Configuration

Configuration is resolved in layers:

1. **Tool** - Base command and environment
2. **Profile** - Model parameters (model, temperature, max_tokens)
3. **Role** - System prompt and role-specific defaults
4. **Job** - Job-specific overrides

Example resolution for `noir-writer` role:

```javascript
{
  tool: {
    name: "codex",
    command: "wsl",
    args: ["--distribution", "Ubuntu", "--", "codex"],
    path_translation: "windows_to_wsl"
  },
  model: "claude-sonnet-4.5",      // from profile
  temperature: 0.9,                 // from role defaults
  max_tokens: 4000,                 // from profile
  system_prompt: "You are a noir..." // from role
}
```

### Path Translation

For tools running in WSL (like codex), paths are automatically translated:

- **Windows**: `C:\Users\sthat\OneDrive\Documents\Obsidian\DigitalGarden`
- **WSL**: `/mnt/c/Users/sthat/OneDrive/Documents/Obsidian/DigitalGarden`

This happens transparently when `path_translation: "windows_to_wsl"` is set.

## Multiple Vaults

You can run separate orchestrator instances for different vaults:

**Vault 1 - DigitalGarden:**
```powershell
$env:MYCELIUM_VAULT = "C:\Users\sthat\OneDrive\Documents\Obsidian\DigitalGarden"
node bin/mycelium.js list
```

**Vault 2 - WorkVault:**
```powershell
$env:MYCELIUM_VAULT = "C:\Users\sthat\Documents\WorkVault"
node bin/mycelium.js list
```

Each vault has its own `.obsidian/mycelium/` configuration.

## Commands

### `init`
Initialize Mycelium configuration in a vault.

```bash
node bin/mycelium.js init --vault <path>
```

### `list`
List available tools, profiles, and roles.

```bash
node bin/mycelium.js list [--vault <path>] [--type <tools|profiles|roles|all>]
```

### `test`
Test a role configuration and see resolved settings.

```bash
node bin/mycelium.js test --role <role-name> [--vault <path>]
```

### `run`
Run a single job with specified role and prompt.

```bash
node bin/mycelium.js run \
  --role <role-name> \
  --prompt <text> \
  [--vault <path>] \
  [--output <path>]
```

## Project Structure

```
mycelium-orchestrator/
├── bin/
│   └── mycelium.js          # CLI entry point
├── src/
│   ├── config-loader.js     # Loads vault configs
│   ├── path-translator.js   # Windows ↔ WSL path translation
│   ├── tool-registry.js     # Manages tools/profiles/roles
│   └── agent-manager.js     # Spawns and manages agents
├── package.json
└── README.md
```

## Next Steps

- [ ] Implement job document parsing (frontmatter + markdown)
- [ ] Add workflow engine (dependency resolution)
- [ ] Implement trigger system
- [ ] Add channel-based messaging
- [ ] Build file watcher for automatic job detection

## Related Documentation

- [Document-Centric Workflow User Story](../DigitalGarden/Notes/Projects/Mycelium-Bridge/docs/Phase-II/Document-Centric-Workflow-User-Story.md)
- [Orchestrator Configuration System Plan](../DigitalGarden/Notes/Projects/Mycelium-Bridge/docs/Phase-II/Orchestrator-Configuration-System-Plan.md)
- [Packaging and Deployment Strategy](../DigitalGarden/Notes/Projects/Mycelium-Bridge/docs/Phase-II/Packaging-and-Deployment.md)

## License

MIT
