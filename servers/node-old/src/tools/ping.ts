/**
 * Ping tool - Connection health check
 */

import type { ObsidianWebSocketClient } from '../websocket-client.js';

export async function handlePing(
  client: ObsidianWebSocketClient,
  _args: Record<string, unknown>
): Promise<string> {
  const result = await client.call('ping', {});
  return JSON.stringify(result);
}

export const pingToolDefinition = {
  name: 'ping',
  description: 'Check if connection to Obsidian plugin is working',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  }
};
