/**
 * Config Loader - Loads vault-specific configuration from .obsidian/mycelium/
 *
 * Each vault has its own tool registry, profiles, and roles.
 */

const fs = require('fs');
const path = require('path');

class ConfigLoader {
  constructor(vaultPath) {
    this.vaultPath = vaultPath;
    this.configDir = path.join(vaultPath, '.obsidian', 'mycelium');
  }

  /**
   * Ensure config directory exists, create with defaults if not
   */
  async ensureConfig() {
    if (!fs.existsSync(this.configDir)) {
      console.log(`Initializing Mycelium config in vault...`);
      fs.mkdirSync(this.configDir, { recursive: true });

      // Create default tools.json
      await this.createDefaultTools();

      // Create default profiles.json
      await this.createDefaultProfiles();

      // Create default roles.json
      await this.createDefaultRoles();

      // Create default settings.json
      await this.createDefaultSettings();

      console.log(`✓ Created default configuration at: ${this.configDir}`);
      console.log(`  Customize tools: ${path.join(this.configDir, 'tools.json')}`);
    }
  }

  /**
   * Load configuration file
   */
  loadConfig(filename) {
    const configPath = path.join(this.configDir, filename);

    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse ${filename}: ${error.message}`);
    }
  }

  /**
   * Load all configurations
   */
  async loadAll() {
    await this.ensureConfig();

    return {
      tools: this.loadConfig('tools.json'),
      profiles: this.loadConfig('profiles.json'),
      roles: this.loadConfig('roles.json'),
      settings: this.loadConfig('settings.json')
    };
  }

  /**
   * Create default tools.json
   */
  async createDefaultTools() {
    const defaultTools = {
      tools: {
        codex: {
          command: 'wsl',
          args: ['--distribution', 'Ubuntu', '--', 'codex'],
          path_translation: 'windows_to_wsl',
          description: 'Codex CLI (WSL only)',
          env: {}
        },
        'claude-code': {
          command: 'claude-code',
          args: [],
          description: 'Claude Code CLI',
          env: {}
        }
      }
    };

    fs.writeFileSync(
      path.join(this.configDir, 'tools.json'),
      JSON.stringify(defaultTools, null, 2)
    );
  }

  /**
   * Create default profiles.json
   */
  async createDefaultProfiles() {
    const defaultProfiles = {
      profiles: {
        'fast-writer': {
          model: 'gpt-3.5-turbo',
          temperature: 0.8,
          max_tokens: 2000
        },
        'precise-editor': {
          model: 'gpt-4',
          temperature: 0.3,
          max_tokens: 4000
        },
        'creative-writer': {
          model: 'claude-sonnet-4.5',
          temperature: 0.9,
          max_tokens: 4000
        }
      }
    };

    fs.writeFileSync(
      path.join(this.configDir, 'profiles.json'),
      JSON.stringify(defaultProfiles, null, 2)
    );
  }

  /**
   * Create default roles.json
   */
  async createDefaultRoles() {
    const defaultRoles = {
      roles: {
        'noir-writer': {
          tool: 'codex',
          profile: 'creative-writer',
          system_prompt: 'You are a noir fiction writer with a gritty, atmospheric style.',
          defaults: {
            temperature: 0.9
          }
        },
        'fiction-editor': {
          tool: 'claude-code',
          profile: 'precise-editor',
          system_prompt: 'You are a professional fiction editor focused on consistency and polish.',
          defaults: {
            temperature: 0.3
          }
        },
        'general-assistant': {
          tool: 'claude-code',
          profile: 'fast-writer',
          system_prompt: 'You are a helpful AI assistant.'
        }
      }
    };

    fs.writeFileSync(
      path.join(this.configDir, 'roles.json'),
      JSON.stringify(defaultRoles, null, 2)
    );
  }

  /**
   * Create default settings.json
   */
  async createDefaultSettings() {
    const defaultSettings = {
      orchestrator: {
        max_concurrent_jobs: 5,
        job_timeout_ms: 600000,
        watch_patterns: ['**/*.md'],
        ignore_patterns: ['**/node_modules/**', '**/.git/**']
      },
      output: {
        default_path: 'Notes/Projects',
        save_transcripts: true,
        transcript_path: '_System/Transcripts'
      },
      websocket: {
        host: 'localhost',
        port: 3333,
        api_key: process.env.OBSIDIAN_MCP_KEY || ''
      }
    };

    fs.writeFileSync(
      path.join(this.configDir, 'settings.json'),
      JSON.stringify(defaultSettings, null, 2)
    );
  }
}

module.exports = ConfigLoader;
