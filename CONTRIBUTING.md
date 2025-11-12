# Contributing to Obsidian MCP Bridge

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites
- Node.js 16+ (for building the plugin)
- Python 3.9+ (for the MCP server)
- Obsidian (for testing)
- Git

### Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/obsidian-mcp-bridge.git
   cd obsidian-mcp-bridge
   ```

2. **Set up the plugin:**
   ```bash
   cd plugin
   npm install
   npm run dev  # Watch mode for development
   ```

3. **Set up the MCP server:**
   ```bash
   cd mcp-server
   pip install -r requirements.txt
   ```

4. **Install in Obsidian:**
   - Symlink or copy `plugin/` to your vault's `.obsidian/plugins/obsidian-mcp-bridge/`
   - Enable the plugin in Obsidian

## Project Structure

```
obsidian-mcp-bridge/
├── plugin/                    # Obsidian plugin (TypeScript)
│   ├── src/
│   │   ├── main.ts           # Plugin entry point
│   │   ├── settings.ts       # Settings UI
│   │   ├── websocket-server.ts
│   │   ├── simple-websocket.ts  # Custom WebSocket implementation
│   │   └── handlers/         # Request handlers
│   ├── manifest.json
│   └── package.json
├── mcp-server/               # Python MCP server
│   ├── obsidian_mcp_server.py
│   ├── requirements.txt
│   └── README.md
├── docs/                     # Documentation
│   └── setup.md
└── README.md
```

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/yourusername/obsidian-mcp-bridge/issues)
2. If not, create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Obsidian version
   - Plugin version
   - Console logs (if applicable)

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the feature and use case
3. Explain why it would be valuable
4. Consider implementation approach (optional)

### Pull Requests

1. **Fork the repository**

2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes:**
   - Follow existing code style
   - Add comments for complex logic
   - Update documentation if needed
   - Test your changes thoroughly

4. **Commit with clear messages:**
   ```bash
   git commit -m "Add feature: brief description"
   ```

5. **Push and create PR:**
   ```bash
   git push origin feature/your-feature-name
   ```

## Coding Standards

### TypeScript (Plugin)

- Use TypeScript strict mode
- Add type annotations for public APIs
- Use async/await for asynchronous operations
- Follow existing naming conventions:
  - Classes: `PascalCase`
  - Functions/methods: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`

### Python (MCP Server)

- Follow PEP 8 style guide
- Use type hints for function signatures
- Add docstrings for public functions
- Use async/await for MCP operations

### Documentation

- Update README.md for user-facing changes
- Update CHANGELOG.md following Keep a Changelog format
- Add inline comments for complex logic
- Update docs/ for setup/usage changes

## Testing

### Plugin Testing

1. Build the plugin:
   ```bash
   cd plugin
   npm run build
   ```

2. Test in Obsidian:
   - Enable plugin
   - Check console for errors
   - Test WebSocket connection
   - Verify functionality

### MCP Server Testing

1. Run connection test:
   ```bash
   python test_connection.py
   ```

2. Test with AI client (Claude Code, Codex)

## Adding New Tools

To add a new MCP tool:

1. **Add handler in plugin** (`plugin/src/handlers/`):
   ```typescript
   export async function myNewTool(plugin: MCPBridgePlugin, params: any): Promise<any> {
       // Implementation
   }
   ```

2. **Register in main.ts:**
   ```typescript
   case 'my_new_tool':
       return await myNewTool(this, params.myParam);
   ```

3. **Add to Python MCP server:**
   ```python
   @app.tool()
   async def my_new_tool(myParam: str) -> str:
       return await call_plugin("my_new_tool", {"myParam": myParam})
   ```

4. **Update documentation:**
   - Add to README.md features list
   - Document in mcp-server/README.md
   - Add example usage

## Release Process

1. Update version in:
   - `plugin/manifest.json`
   - `plugin/package.json`
   - `CHANGELOG.md`

2. Build plugin:
   ```bash
   cd plugin
   npm run build
   ```

3. Create GitHub release with:
   - Tag: `v0.x.0`
   - Release notes from CHANGELOG.md
   - Attach `main.js` and `manifest.json`

4. Submit to Obsidian Community Plugins (when ready)

## Communication

- GitHub Issues for bugs and features
- Discussions for questions and ideas
- Be respectful and constructive
- Follow Obsidian community guidelines

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to open an issue with the `question` label or start a discussion!
