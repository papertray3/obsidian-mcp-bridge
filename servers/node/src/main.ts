#!/usr/bin/env node
/**
 * Obsidian MCP Server - Node/TypeScript implementation
 * Direct API access to Obsidian via WebSocket bridge
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig, getWebSocketURL } from './config.js';
import { logger } from './logger.js';
import { ObsidianWebSocketClient } from './websocket-client.js';
import fs from 'fs';
import path from 'path';

// Import tools with error handling
let toolHandlers: Record<string, any> = {};
let allToolDefinitions: Tool[] = [];

try {
  const toolsModule = await import('./tools/index.js');
  toolHandlers = toolsModule.toolHandlers;
  allToolDefinitions = (toolsModule.allToolDefinitions || []) as Tool[];
  logger.info(`Loaded ${allToolDefinitions.length} tool definitions`);
} catch (toolsError) {
  logger.error('Failed to load tools module:', toolsError);
  logger.warn('Continuing with empty tool list');
  toolHandlers = {};
  allToolDefinitions = [];
}

async function main() {
  // Load configuration
  const config = loadConfig();
  const wsUrl = getWebSocketURL(config);

  logger.info('Obsidian MCP Server (Node) starting...');
  logger.info(`WebSocket URL: ${wsUrl}`);

  // Create MCP server FIRST before connecting to Obsidian
  // This allows the MCP handshake to complete while connecting in background
  const server = new Server(
    {
      name: 'obsidian-direct',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Create WebSocket client (will connect later)
  const wsClient = new ObsidianWebSocketClient(config, wsUrl);

  // Define handlers BEFORE starting transport
  const listToolsHandler = async () => {
    logger.info('Handling ListTools request');

    // Try to get authoritative list from running plugin first
    try {
      if (!wsClient.isConnected()) {
        try {
          await wsClient.connect();
        } catch (connErr) {
          logger.debug('Could not connect to plugin for tools/list, will try file fallback');
          // fall through to file fallback
        }
      }

      if (wsClient.isConnected()) {
        try {
          const resp = await wsClient.call('tools/list', {});
          if (resp && typeof resp === 'object' && Array.isArray((resp as any).tools)) {
            logger.debug(`Retrieved ${((resp as any).tools).length} tools from plugin`);
            return { tools: (resp as any).tools };
          }
          logger.warn('tools/list returned unexpected shape, falling back to file/local list');
        } catch (callErr) {
          logger.warn('tools/list call failed, falling back to file/local list:', callErr);
        }
      }
    } catch (error) {
      logger.error('Unexpected error while fetching tools from plugin:', error);
    }

    // File fallback: read generated mcp-config.json produced by the plugin's tool-registry
    try {
      // Resolve path relative to plugin root (servers/node runs from plugin servers dir)
      const generatedPathCandidates = [
        path.resolve(process.cwd(), '..', '..', 'mcp-bridge', 'generated', 'mcp-config.json'),
        path.resolve(process.cwd(), '..', '..', '..', 'mcp-bridge', 'generated', 'mcp-config.json'),
        path.resolve(process.cwd(), '..', 'mcp-bridge', 'generated', 'mcp-config.json')
      ];

      for (const candidate of generatedPathCandidates) {
        if (fs.existsSync(candidate)) {
          logger.debug(`Using generated tool config at ${candidate}`);
          const data = JSON.parse(fs.readFileSync(candidate, 'utf8'));
          if (data && Array.isArray(data.tools)) {
            return { tools: data.tools };
          }
        }
      }
    } catch (fileErr) {
      logger.warn('Failed to read generated mcp-config.json:', fileErr);
    }

    // Fallback to baked-in local definitions
    logger.info('Falling back to local in-server tool definitions');
    return { tools: allToolDefinitions as any[] };
  };

  const callToolHandler = async (request: { params: { name: string; arguments?: Record<string, unknown> } }) => {
    const { name, arguments: args } = request.params;

    logger.info(`Tool called: ${name}`);
    console.error(`[DIRECT] Tool called: ${name}`);

    try {
      // If not connected to Obsidian, try to connect now
      if (!wsClient.isConnected()) {
        console.error(`[DIRECT] Not connected, attempting connection`);
        try {
          await wsClient.connect();
        } catch (connectError) {
          logger.error('Failed to connect to Obsidian:', connectError);
          return {
            content: [
              {
                type: 'text',
                text: `Error: Not connected to Obsidian. ${connectError instanceof Error ? connectError.message : 'Unknown error'}`
              }
            ],
            isError: true
          };
        }
      }

      // First try a local handler
      const localHandler = toolHandlers[name];
      console.error(`[DIRECT] Checking local handler for ${name}: ${localHandler ? 'found' : 'not found'}`);
      if (localHandler) {
        try {
          const result = await localHandler(wsClient, args || {});
          return { content: [{ type: 'text', text: result }] };
        } catch (toolError) {
          const errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
          logger.error(`Local tool ${name} failed:`, errorMessage);
          return { content: [{ type: 'text', text: `Error: ${errorMessage}` }], isError: true };
        }
      }

      // Forward to plugin if no local handler
      console.error(`[DIRECT] Forwarding to plugin: ${name}`);
      try {
        if (!wsClient.isConnected()) {
          await wsClient.connect();
        }

        const pluginResult = await wsClient.call(name, args || {});
        console.error(`[DIRECT] Got plugin result, type: ${typeof pluginResult}`);
        logger.info(`[${name}] Raw plugin result type: ${typeof pluginResult}`);
        
        if (typeof pluginResult === 'object' && pluginResult !== null) {
          console.error(`[DIRECT] Result is object with keys: ${Object.keys(pluginResult as any).slice(0, 3)}`);
          logger.info(`[${name}] Plugin result keys:`, Object.keys(pluginResult as any).slice(0, 5));
        }
        
        // Ensure result is properly formatted as a string
        let textContent: string;
        if (typeof pluginResult === 'string') {
          console.error(`[DIRECT] Result is string, length: ${pluginResult.length}`);
          logger.info(`[${name}] Result is already a string, length: ${pluginResult.length}`);
          textContent = pluginResult;
        } else if (pluginResult && typeof pluginResult === 'object') {
          console.error(`[DIRECT] Result is object, stringifying...`);
          logger.info(`[${name}] Result is an object, stringifying...`);
          textContent = JSON.stringify(pluginResult, null, 2);
          console.error(`[DIRECT] Stringified length: ${textContent.length}`);
          logger.info(`[${name}] Stringified result length: ${textContent.length}, first 100 chars: ${textContent.substring(0, 100)}`);
        } else {
          console.error(`[DIRECT] Result is ${typeof pluginResult}, converting to string`);
          logger.info(`[${name}] Result is ${typeof pluginResult}, converting to string`);
          textContent = String(pluginResult);
        }
        
        console.error(`[DIRECT] Final text content type: ${typeof textContent}`);
        logger.info(`[${name}] Final text content type: ${typeof textContent}`);
        
        const finalResponse = { 
          content: [{ 
            type: 'text' as const, 
            text: textContent 
          }] 
        };
        
        console.error(`[DIRECT] About to return response with text type: ${typeof finalResponse.content[0]?.text}`);
        logger.info(`[${name}] About to return response with text type: ${typeof finalResponse.content[0]?.text}`);
        
        return finalResponse;
      } catch (pluginError) {
        const errorMessage = pluginError instanceof Error ? pluginError.message : String(pluginError);
        console.error(`[DIRECT] Plugin error: ${errorMessage}`);
        logger.error(`Plugin-executed tool ${name} failed:`, errorMessage);
        return { content: [{ type: 'text', text: `Error: ${errorMessage}` }], isError: true };
      }
    } catch (outerError) {
      const errorMessage = outerError instanceof Error ? outerError.message : String(outerError);
      console.error(`[DIRECT] Outer catch: ${errorMessage}`);
      logger.error(`Outer error in callToolHandler:`, errorMessage);
      return { content: [{ type: 'text', text: `Error: ${errorMessage}` }], isError: true };
    }
  };

  // Set handlers on the server (using type assertion for SDK compatibility)
  try {
    logger.info('Setting request handlers...');
    (server as any).setRequestHandler(ListToolsRequestSchema, listToolsHandler);
    (server as any).setRequestHandler(CallToolRequestSchema, callToolHandler);
    logger.info('Request handlers set successfully');
  } catch (handlerError) {
    logger.error('Failed to set request handlers:', handlerError);
    throw handlerError;
  }

  // Set up graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    try {
      await wsClient.close();
    } catch (e) {
      logger.error('Error closing WebSocket:', e);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Connect server to transport (this automatically starts the transport)
  const transport = new StdioServerTransport();
  
  try {
    logger.info('Connecting server to transport...');
    await (server as any).connect(transport);
    logger.info('Server connected to transport - MCP ready on stdio');
  } catch (connectError) {
    logger.error('Failed to connect server to transport:', connectError);
    throw connectError;
  }

  logger.info('MCP Server ready on stdio');

  // Try to connect to Obsidian asynchronously (don't block MCP startup)
  (async () => {
    try {
      logger.info('Attempting to connect to Obsidian...');
      await wsClient.connect();
      logger.info('Successfully connected to Obsidian');
    } catch (error) {
      logger.error('Failed to connect to Obsidian during startup:', error);
      logger.info('Tools will attempt to connect on first use');
    }
  })();
}

// Run main
main().catch((error) => {
  logger.error('Fatal error in main:', error);
  if (error instanceof Error) {
    logger.error('Stack:', error.stack);
  }
  // Write to stderr as well so Codex sees the error
  console.error('FATAL ERROR:', error);
  process.exit(1);
});
