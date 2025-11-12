# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-11

### Added
- Initial release (Phase 1: Proof of Concept)
- Obsidian plugin with custom WebSocket server implementation
- Python MCP server with stdio transport
- API key authentication
- Core tools:
  - `render_note` - Get fully-rendered HTML with Dataview support
  - `get_note_raw` - Get raw markdown content
  - `list_vault_files` - List markdown files in vault
  - `ping` - Connection health check
- Settings UI with remote-ready configuration
- Comprehensive documentation

### Technical Notes
- Built custom WebSocket implementation to work in Obsidian's Electron environment
- Uses only Node.js built-in modules (http, crypto) for compatibility
- Localhost-only by default, with future remote access capability

## [Unreleased]

### Planned - Phase 2
- `list_plugins()` - Discover installed plugins
- `get_plugin_info()` - Plugin metadata and capabilities
- `dataview_query()` - Execute Dataview queries directly
- `search_vault()` - Text search across vault

### Planned - Phase 3
- SmartConnections integration
- Digital Garden integration
- Safe plugin method calling

### Planned - Phase 4
- Permission system (tiered operations)
- User approval modals
- Rate limiting
- Community plugin distribution
