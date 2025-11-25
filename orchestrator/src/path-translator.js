/**
 * Path Translator - Handles Windows <-> WSL path conversions
 *
 * Primarily needed for tools that run in WSL (like codex) when
 * orchestrator is running on Windows.
 */

class PathTranslator {
  constructor(vaultPath) {
    this.vaultPath = vaultPath;
  }

  /**
   * Convert Windows path to WSL path
   * C:\Users\sthat\... -> /mnt/c/Users/sthat/...
   */
  toWSL(windowsPath) {
    if (!windowsPath) return windowsPath;

    return windowsPath
      .replace(/^([A-Z]):\\/, (_, drive) => `/mnt/${drive.toLowerCase()}/`)
      .replace(/\\/g, '/');
  }

  /**
   * Convert WSL path to Windows path
   * /mnt/c/Users/sthat/... -> C:\Users\sthat\...
   */
  toWindows(wslPath) {
    if (!wslPath) return wslPath;

    return wslPath
      .replace(/^\/mnt\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:\\`)
      .replace(/\//g, '\\');
  }

  /**
   * Translate path based on tool configuration
   */
  translateForTool(tool, path) {
    if (!tool.path_translation) {
      return path; // No translation needed
    }

    switch (tool.path_translation) {
      case 'windows_to_wsl':
        return this.toWSL(path);
      case 'wsl_to_windows':
        return this.toWindows(path);
      default:
        return path;
    }
  }

  /**
   * Get vault path translated for specific tool
   */
  getVaultPathForTool(tool) {
    return this.translateForTool(tool, this.vaultPath);
  }
}

module.exports = PathTranslator;
