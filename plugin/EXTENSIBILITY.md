# MCP Bridge Extensibility Architecture

**Version:** 2.0.0-minimal
**Status:** Phase 1 (YAML + Script Registry)

This document describes how to extend the MCP Bridge plugin with custom tools without modifying the plugin code.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [File Structure](#file-structure)
- [YAML Schema Format](#yaml-schema-format)
- [Handler Scripts](#handler-scripts)
- [Adding Custom Tools](#adding-custom-tools)
- [Built-in vs User Tools](#built-in-vs-user-tools)
- [Security & Sandboxing](#security--sandboxing)
- [Examples](#examples)
- [Future: Auto-Generation (Phase 2)](#future-auto-generation-phase-2)

---

## Overview

The MCP Bridge plugin uses a **YAML-driven tool registry** as the single source of truth for all available tools. This allows users to:

- ✅ Add custom tools without modifying plugin code
- ✅ Write handler scripts in JavaScript
- ✅ Access the full Obsidian API from handlers
- ✅ Keep WebSocket server and MCP server configs in sync
- ✅ Hot-reload tools when files change

**Design Philosophy:**

- **YAML as Schema:** Single source of truth for tool definitions
- **Scripts as Implementation:** Separate handler logic from schema
- **Plugin as Platform:** Core plugin loads and orchestrates user tools
- **Zero Plugin Recompilation:** Add tools by editing files, not code

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Bridge Plugin                     │
│  ┌────────────────────────────────────────────────────┐ │
│  │          Tool Registry (tools.yaml)                │ │
│  │  • Reads YAML at startup                           │ │
│  │  • Watches for changes (hot-reload)                │ │
│  │  • Validates schemas                               │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │          Handler Loader                            │ │
│  │  • Loads builtin handlers (in plugin)             │ │
│  │  • Loads user handlers (from vault)               │ │
│  │  • Sandboxes scripts                              │ │
│  └────────────────────────────────────────────────────┘ │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │          WebSocket Server                          │ │
│  │  • Serves tools via JSON-RPC                      │ │
│  │  • Routes requests to handlers                    │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
                  WebSocket Connection
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    MCP Server                            │
│  • Reads generated config                               │
│  • Exposes tools to AI assistants                       │
│  • Forwards requests to WebSocket                       │
└─────────────────────────────────────────────────────────┘
                          ↓
                    AI Assistant (Claude)
```

---

## File Structure

```
YourVault/
└── .obsidian/
    └── plugins/
        └── mcp-bridge/
            ├── tools.yaml              # Master tool registry (user-editable)
            ├── handlers/
            │   ├── core/               # Built-in handlers (part of plugin)
            │   │   ├── search_files.js
            │   │   ├── get_note.js
            │   │   └── list_vault.js
            │   └── user/               # User-added handlers
            │       ├── my_tool.js
            │       └── analysis.js
            └── generated/
                ├── mcp-config.json     # Auto-generated MCP server config
                └── tool-registry.json  # Auto-generated registry cache
```

**Key Files:**

- **`tools.yaml`** - Single source of truth, defines all tools
- **`handlers/core/`** - Built-in handlers (shipped with plugin)
- **`handlers/user/`** - User-created handlers (you add these!)
- **`generated/`** - Auto-generated files (don't edit manually)

---

## YAML Schema Format

### Basic Structure

```yaml
version: 2.0

config:
  # Global settings
  auto_reload: true                # Watch for file changes
  sandbox_user_scripts: true       # Run user scripts in sandbox
  enable_auto_generation: false    # Phase 2: auto-gen from classes

tools:
  # Built-in tools (part of plugin)
  builtin:
    - name: search_files
      description: Search for files matching a pattern
      handler: builtin              # Special keyword for core handlers
      inputSchema:
        type: object
        properties:
          pattern:
            type: string
            description: Glob pattern (e.g., "*.md", "Notes/**/*.md")
        required: [pattern]

    - name: get_note_raw
      description: Get raw markdown content of a note
      handler: builtin
      inputSchema:
        type: object
        properties:
          filepath:
            type: string
            description: Path to note (relative to vault root)
        required: [filepath]

  # User-added custom tools
  user:
    - name: my_custom_tool
      description: A custom tool I created
      handler: user/my_tool.js       # Path relative to handlers/
      inputSchema:
        type: object
        properties:
          param1:
            type: string
            description: Description of parameter
          param2:
            type: number
            description: Another parameter
        required: [param1]
```

### Tool Definition Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ Yes | Unique identifier for the tool (snake_case recommended) |
| `description` | ✅ Yes | Clear description of what the tool does (used by AI) |
| `handler` | ✅ Yes | Either "builtin" or path to script (e.g., "user/my_tool.js") |
| `inputSchema` | ✅ Yes | JSON Schema for tool parameters |
| `outputSchema` | ❌ No | JSON Schema for return value (optional, for documentation) |
| `tags` | ❌ No | Array of tags for organization |
| `category` | ❌ No | Category for grouping (e.g., "notes", "search", "analysis") |

### Input Schema Format

Uses standard JSON Schema (same as MCP protocol):

```yaml
inputSchema:
  type: object
  properties:
    # String parameter
    filepath:
      type: string
      description: Path to the file

    # Number parameter
    limit:
      type: number
      description: Maximum number of results
      default: 10

    # Boolean parameter
    includeArchived:
      type: boolean
      description: Include archived notes
      default: false

    # Array parameter
    tags:
      type: array
      items:
        type: string
      description: List of tags to filter by

    # Object parameter
    options:
      type: object
      properties:
        caseSensitive:
          type: boolean
        maxDepth:
          type: number

  required: [filepath]  # List of required parameters
```

---

## Handler Scripts

### Handler Format

Every handler script must export an object with an `execute` function:

```javascript
// handlers/user/my_tool.js

module.exports = {
  /**
   * Execute the tool
   *
   * @param {Object} params - Parameters from YAML inputSchema
   * @param {Object} context - Obsidian API context
   * @returns {Promise<any>} - Result returned to AI assistant
   */
  async execute(params, context) {
    // Your implementation here

    return {
      // Return data
    };
  }
};
```

### Context Object

The `context` parameter provides access to Obsidian APIs:

```javascript
const context = {
  app: this.app,                    // Obsidian App instance
  vault: this.app.vault,            // Vault API (read/write files)
  workspace: this.app.workspace,    // Workspace API (UI, tabs, etc.)
  metadataCache: this.app.metadataCache,  // Metadata cache (frontmatter, links)
  fileManager: this.app.fileManager,      // File operations

  // Access to other plugins (if installed)
  plugins: {
    dataview: this.app.plugins.plugins['dataview'],
    metadataMenu: this.app.plugins.plugins['metadata-menu'],
    // ... etc.
  },

  // Utility functions
  utils: {
    sanitizePath: (path) => { /* ... */ },
    formatDate: (date) => { /* ... */ },
  }
};
```

### Example: Simple Handler

```javascript
// handlers/user/count_words.js

module.exports = {
  async execute(params, context) {
    const { filepath } = params;
    const { vault } = context;

    // Read file
    const file = vault.getAbstractFileByPath(filepath);
    if (!file) {
      throw new Error(`File not found: ${filepath}`);
    }

    const content = await vault.read(file);

    // Count words
    const words = content.split(/\s+/).filter(w => w.length > 0);

    return {
      filepath: filepath,
      wordCount: words.length,
      characterCount: content.length
    };
  }
};
```

### Example: Using Other Plugins

```javascript
// handlers/user/query_dataview.js

module.exports = {
  async execute(params, context) {
    const { query } = params;
    const { plugins, app } = context;

    // Check if Dataview is installed
    if (!plugins.dataview) {
      throw new Error('Dataview plugin not installed');
    }

    const dv = plugins.dataview.api;

    // Execute query
    const results = await dv.query(query);

    return {
      success: true,
      results: results.values
    };
  }
};
```

### Example: Creating a Note

```javascript
// handlers/user/create_note.js

module.exports = {
  async execute(params, context) {
    const { path, content, frontmatter } = params;
    const { vault } = context;

    // Build frontmatter
    let fullContent = '';
    if (frontmatter) {
      fullContent += '---\n';
      for (const [key, value] of Object.entries(frontmatter)) {
        fullContent += `${key}: ${value}\n`;
      }
      fullContent += '---\n\n';
    }
    fullContent += content;

    // Create file
    await vault.create(path, fullContent);

    return {
      success: true,
      path: path
    };
  }
};
```

---

## Adding Custom Tools

### Step-by-Step Guide

**1. Create a handler script:**

```bash
# Create the handlers/user directory if it doesn't exist
mkdir -p .obsidian/plugins/mcp-bridge/handlers/user

# Create your handler
touch .obsidian/plugins/mcp-bridge/handlers/user/my_tool.js
```

**2. Write your handler:**

```javascript
// .obsidian/plugins/mcp-bridge/handlers/user/my_tool.js

module.exports = {
  async execute(params, context) {
    const { vault } = context;

    // Your logic here
    const files = vault.getMarkdownFiles();

    return {
      totalFiles: files.length
    };
  }
};
```

**3. Add tool definition to tools.yaml:**

```yaml
tools:
  user:
    - name: my_tool
      description: Counts all markdown files in vault
      handler: user/my_tool.js
      inputSchema:
        type: object
        properties: {}  # No parameters for this tool
```

**4. Reload the plugin:**

- If `auto_reload: true` in config, changes are detected automatically
- Otherwise, run command: "MCP Bridge: Reload Tool Registry"
- Or restart Obsidian

**5. Test your tool:**

The tool is now available to any MCP server connected to the bridge!

---

## Built-in vs User Tools

### Built-in Tools

Built-in tools are part of the plugin codebase and use `handler: builtin`:

```yaml
builtin:
  - name: search_files
    handler: builtin
    # ...
```

These are implemented in the plugin's TypeScript code and provide core functionality:

- `ping` - Connectivity test
- `search_files` - File search with glob patterns
- `get_note_raw` - Read note content
- `list_vault_files` - List all files in vault
- _(more to come in future versions)_

**When to use built-in:**
- Core functionality used by most users
- Requires deep plugin integration
- Performance-critical operations

### User Tools

User tools are custom handlers in the `handlers/user/` directory:

```yaml
user:
  - name: my_custom_tool
    handler: user/my_custom_tool.js
    # ...
```

**When to use user tools:**
- Custom workflows specific to your vault
- Integrations with other plugins
- Experimental features
- Personal automation scripts

---

## Security & Sandboxing

### Sandbox Mode

User scripts run in a **restricted sandbox** that:

✅ **Allows:**
- Access to Obsidian API (`app`, `vault`, `workspace`)
- Reading and writing files in the vault
- Accessing other plugins' APIs
- Executing async operations

❌ **Blocks:**
- File system access outside vault (`fs`, `path`, etc.)
- Network requests (`http`, `https`, `fetch`)
- Process spawning (`child_process`, `exec`)
- Require arbitrary modules (`require('anything')`)

### Trusted Mode (Advanced)

If you need full Node.js access (e.g., for external APIs), you can disable sandboxing:

```yaml
config:
  sandbox_user_scripts: false  # ⚠️ Use with caution!
```

⚠️ **Warning:** Disabling sandbox allows scripts full system access. Only do this if you trust all scripts in `handlers/user/`.

### Best Practices

1. **Review scripts before adding them** - Don't blindly copy/paste code
2. **Keep sandbox enabled** - Unless you specifically need external access
3. **Version control your handlers** - Track changes to user scripts
4. **Test with non-critical vaults first** - Before using in production
5. **Use plugin APIs when possible** - Instead of direct file system access

---

## Examples

### Example 1: Vault Statistics

**YAML definition:**

```yaml
user:
  - name: get_vault_stats
    description: Get comprehensive vault statistics
    handler: user/vault_stats.js
    inputSchema:
      type: object
      properties:
        includeArchived:
          type: boolean
          description: Include archived notes in statistics
          default: false
```

**Handler:**

```javascript
// handlers/user/vault_stats.js

module.exports = {
  async execute(params, context) {
    const { includeArchived = false } = params;
    const { vault, metadataCache } = context;

    const files = vault.getMarkdownFiles();
    let totalWords = 0;
    let totalLinks = 0;
    let totalTags = new Set();

    for (const file of files) {
      // Skip archived if needed
      if (!includeArchived && file.path.includes('Archive')) {
        continue;
      }

      // Read content
      const content = await vault.read(file);
      const words = content.split(/\s+/).filter(w => w.length > 0);
      totalWords += words.length;

      // Get metadata
      const cache = metadataCache.getFileCache(file);
      if (cache) {
        totalLinks += (cache.links || []).length;
        (cache.tags || []).forEach(tag => totalTags.add(tag.tag));
      }
    }

    return {
      totalNotes: files.length,
      totalWords: totalWords,
      totalLinks: totalLinks,
      uniqueTags: totalTags.size,
      tags: Array.from(totalTags)
    };
  }
};
```

### Example 2: Find Orphaned Notes

**YAML definition:**

```yaml
user:
  - name: find_orphaned_notes
    description: Find notes with no incoming or outgoing links
    handler: user/find_orphans.js
    inputSchema:
      type: object
      properties:
        folder:
          type: string
          description: Optional folder to search within
```

**Handler:**

```javascript
// handlers/user/find_orphans.js

module.exports = {
  async execute(params, context) {
    const { folder = '' } = params;
    const { vault, metadataCache } = context;

    const files = vault.getMarkdownFiles();
    const linkMap = new Map();

    // Build link graph
    for (const file of files) {
      if (folder && !file.path.startsWith(folder)) continue;

      const cache = metadataCache.getFileCache(file);
      const outgoingLinks = (cache?.links || []).map(l => l.link);
      linkMap.set(file.path, {
        outgoing: outgoingLinks,
        incoming: []
      });
    }

    // Populate incoming links
    for (const [sourcePath, data] of linkMap) {
      for (const targetPath of data.outgoing) {
        const target = linkMap.get(targetPath);
        if (target) {
          target.incoming.push(sourcePath);
        }
      }
    }

    // Find orphans (no incoming or outgoing)
    const orphans = [];
    for (const [path, data] of linkMap) {
      if (data.incoming.length === 0 && data.outgoing.length === 0) {
        orphans.push(path);
      }
    }

    return {
      orphanedNotes: orphans,
      count: orphans.length
    };
  }
};
```

### Example 3: Tag Manager

**YAML definition:**

```yaml
user:
  - name: bulk_update_tags
    description: Add or remove tags from multiple notes
    handler: user/tag_manager.js
    inputSchema:
      type: object
      properties:
        operation:
          type: string
          enum: [add, remove]
          description: Whether to add or remove tags
        tags:
          type: array
          items:
            type: string
          description: List of tags to add/remove
        filter:
          type: object
          properties:
            folder:
              type: string
            hasTag:
              type: string
      required: [operation, tags]
```

**Handler:**

```javascript
// handlers/user/tag_manager.js

module.exports = {
  async execute(params, context) {
    const { operation, tags, filter = {} } = params;
    const { vault, metadataCache, fileManager } = context;

    const files = vault.getMarkdownFiles();
    const updated = [];

    for (const file of files) {
      // Apply filters
      if (filter.folder && !file.path.startsWith(filter.folder)) {
        continue;
      }

      const cache = metadataCache.getFileCache(file);
      const existingTags = (cache?.tags || []).map(t => t.tag);

      if (filter.hasTag && !existingTags.includes(filter.hasTag)) {
        continue;
      }

      // Read content
      let content = await vault.read(file);

      // Modify tags (simple append/remove)
      if (operation === 'add') {
        for (const tag of tags) {
          if (!existingTags.includes(tag)) {
            content += `\n${tag}`;
          }
        }
      } else if (operation === 'remove') {
        for (const tag of tags) {
          content = content.replace(new RegExp(`\\s*${tag}`, 'g'), '');
        }
      }

      // Write back
      await vault.modify(file, content);
      updated.push(file.path);
    }

    return {
      updatedFiles: updated,
      count: updated.length
    };
  }
};
```

---

## Future: Auto-Generation (Phase 2)

**Coming soon:** Automatic tool generation from Metadata Menu classes.

### Planned Features

When `enable_auto_generation: true` in config:

```yaml
config:
  enable_auto_generation: true

tools:
  auto:
    # These will be auto-generated from Metadata Menu classes
    - name: create_book
      auto_generated: true
      source: metadata-menu:book
      # Schema extracted from class definition

    - name: create_project
      auto_generated: true
      source: metadata-menu:project
      # Schema extracted from class definition
```

**How it will work:**

1. Plugin watches Metadata Menu class definitions
2. When a class is created/updated, plugin auto-generates:
   - Tool schema in `tools.yaml`
   - Handler that creates notes with proper frontmatter
3. AI assistants can create notes without guessing frontmatter fields
4. Always in sync with your class definitions

**Example auto-generated tool:**

```yaml
auto:
  - name: create_book
    description: Create a new book note with proper frontmatter
    auto_generated: true
    source: metadata-menu:book
    inputSchema:
      type: object
      properties:
        path:
          type: string
          description: Path where note should be created
        title:
          type: string
          description: Book title
        author:
          type: string
          description: Book author
        isbn:
          type: string
          description: ISBN number
        rating:
          type: number
          description: Rating (1-5)
      required: [path, title]
```

This will be implemented in a future update. For now, you can create similar tools manually using the user handler pattern.

---

## Troubleshooting

### Tool not appearing in MCP server

1. Check YAML syntax: `npx js-yaml tools.yaml`
2. Verify handler path is correct
3. Check Obsidian console for errors
4. Reload plugin: "MCP Bridge: Reload Tool Registry"
5. Check generated config: `.obsidian/plugins/mcp-bridge/generated/mcp-config.json`

### Handler script errors

1. Check Obsidian Developer Console (Ctrl+Shift+I)
2. Verify `module.exports` format is correct
3. Ensure `execute` function is async
4. Check that context object is used correctly
5. Add console.log() for debugging

### Hot-reload not working

1. Verify `auto_reload: true` in tools.yaml config
2. Check file watcher is active (console logs)
3. Manually reload: "MCP Bridge: Reload Tool Registry"
4. Restart Obsidian if issues persist

### Sandbox restrictions

If you get "module not found" or "require is not defined":

1. Check if you're trying to use Node.js modules (not allowed in sandbox)
2. Use Obsidian APIs instead: `context.vault`, `context.app`, etc.
3. If you really need Node.js access, disable sandbox (see Security section)

---

## Contributing

Have a useful handler you want to share? Consider:

1. Creating a GitHub gist with your handler
2. Sharing in Obsidian community forums
3. Opening a PR to add it to the built-in tools (if generally useful)

---

## Related Documentation

- [MCP Protocol Primer](../docs/Cleanup%20and%20Improvements/MCP-Protocol-Primer.md)
- [Dynamic Tool Registry Implementation](../docs/Cleanup%20and%20Improvements/Dynamic-Tool-Registry-Implementation.md)
- [Communication Options Analysis](../docs/Cleanup%20and%20Improvements/Communication-Options-Analysis.md)

---

**Version History:**

- v2.0.0-minimal (2025-01-21): Initial extensibility architecture documentation
