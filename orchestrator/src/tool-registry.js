/**
 * Tool Registry - Manages available tools and their configurations
 *
 * Provides lookup and validation for tools, profiles, and roles.
 */

class ToolRegistry {
  constructor(config) {
    this.tools = config.tools?.tools || {};
    this.profiles = config.profiles?.profiles || {};
    this.roles = config.roles?.roles || {};
  }

  /**
   * Get tool definition by name
   */
  getTool(name) {
    const tool = this.tools[name];
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return { ...tool, name };
  }

  /**
   * Get profile definition by name
   */
  getProfile(name) {
    const profile = this.profiles[name];
    if (!profile) {
      throw new Error(`Profile not found: ${name}`);
    }
    return { ...profile, name };
  }

  /**
   * Get role definition by name
   */
  getRole(name) {
    const role = this.roles[name];
    if (!role) {
      throw new Error(`Role not found: ${name}`);
    }
    return { ...role, name };
  }

  /**
   * Resolve full configuration for a role
   * Combines: Tool -> Profile -> Role -> Job overrides
   */
  resolveRoleConfig(roleName, jobOverrides = {}) {
    const role = this.getRole(roleName);
    const tool = this.getTool(role.tool);
    const profile = role.profile ? this.getProfile(role.profile) : {};

    // Layer the configuration
    return {
      // Tool base config
      tool: {
        name: tool.name,
        command: tool.command,
        args: [...tool.args],
        env: { ...tool.env },
        path_translation: tool.path_translation
      },

      // Profile parameters
      model: jobOverrides.model || role.defaults?.model || profile.model,
      temperature: jobOverrides.temperature ?? role.defaults?.temperature ?? profile.temperature,
      max_tokens: jobOverrides.max_tokens || role.defaults?.max_tokens || profile.max_tokens,

      // Role settings
      system_prompt: jobOverrides.system_prompt || role.system_prompt,

      // Additional overrides
      ...jobOverrides
    };
  }

  /**
   * List all available tools
   */
  listTools() {
    return Object.keys(this.tools);
  }

  /**
   * List all available profiles
   */
  listProfiles() {
    return Object.keys(this.profiles);
  }

  /**
   * List all available roles
   */
  listRoles() {
    return Object.keys(this.roles);
  }

  /**
   * Validate that a role configuration is complete
   */
  validateRole(roleName) {
    try {
      const role = this.getRole(roleName);
      const tool = this.getTool(role.tool);

      if (role.profile) {
        this.getProfile(role.profile);
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

module.exports = ToolRegistry;
