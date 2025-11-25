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
import { toolHandlers, allToolDefinitions } from './tools/index.js';

async function main() {
  // Load configuration
  const config = loadConfig();
  const wsUrl = getWebSocketURL(config);

  logger.info('Obsidian MCP Server (Node) starting...');

  // Create WebSocket client
  const wsClient = new ObsidianWebSocketClient(config, wsUrl);

  // Connect to Obsidian plugin
  try {
    await wsClient.connect();
  } catch (error) {
    logger.error('Failed to connect to Obsidian plugin:', error);
    process.exit(1);
  }

  // Create MCP server
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

  // Set up broadcast handler to forward vault notifications to AI client
  wsClient.onBroadcast((message) => {
    logger.info('Broadcast received from vault, forwarding to AI client:', message);

    // Forward to AI client as a notification
    server.notification({
      method: 'notifications/message',
      params: {
        type: 'vault/notification',
        data: message
      }
    });
  });

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allToolDefinitions as Tool[]
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info(`Tool called: ${name}`);

    try {
      const handler = toolHandlers[name];
      if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const result = await handler(wsClient, args || {});

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool ${name} failed:`, errorMessage);

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  });

  // Set up graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await wsClient.close();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('MCP Server ready on stdio');
}

// Run main
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
