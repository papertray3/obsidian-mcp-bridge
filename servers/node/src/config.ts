/**
 * Configuration loading from environment variables
 */

import { config as loadEnv } from 'dotenv';
import { logger } from './logger.js';

// Load .env file if present
loadEnv();

export interface ServerConfig {
  obsidianHost: string;
  obsidianPort: string;
  obsidianUseSSL: boolean;
  obsidianApiKey: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function loadConfig(): ServerConfig {
  const config: ServerConfig = {
    obsidianHost: process.env.OBSIDIAN_HOST || 'localhost',
    obsidianPort: process.env.OBSIDIAN_PORT || '27125',
    obsidianUseSSL: (process.env.OBSIDIAN_USE_SSL || 'false').toLowerCase() === 'true',
    obsidianApiKey: process.env.OBSIDIAN_MCP_KEY || '',
    logLevel: (process.env.LOG_LEVEL as ServerConfig['logLevel']) || 'info'
  };

  // Validate required config
  if (!config.obsidianApiKey) {
    logger.warn('OBSIDIAN_MCP_KEY not set. Authentication may fail.');
  }

  // Set logger level
  logger.setLevel(config.logLevel);

  logger.debug('Configuration loaded:', {
    host: config.obsidianHost,
    port: config.obsidianPort,
    useSSL: config.obsidianUseSSL,
    logLevel: config.logLevel,
    apiKeySet: !!config.obsidianApiKey
  });

  return config;
}

export function getWebSocketURL(config: ServerConfig): string {
  const protocol = config.obsidianUseSSL ? 'wss' : 'ws';
  return `${protocol}://${config.obsidianHost}:${config.obsidianPort}`;
}
