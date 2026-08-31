import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPWebSocketServer, MCPRequest, MCPResponse } from './websocket-server';
import type { SimpleWebSocket, WebSocketMessage } from './simple-websocket';

/**
 * These tests exercise the server's message-handling logic directly by
 * invoking the private `handleConnection`/`clients` internals against a fake
 * socket, rather than opening a real TCP/WebSocket connection. That keeps
 * the tests fast and deterministic while still covering the real auth,
 * dispatch, and error-handling code paths (`start()`'s socket plumbing is a
 * separate, lower-value thing to test - see the eval's WebSocket-audit item).
 */
function makeFakePlugin(overrides: Partial<{ requireAuth: boolean; apiKey: string; handleRequest: any }> = {}) {
	const handleRequest = overrides.handleRequest ?? vi.fn(async (req: MCPRequest) => ({ ok: true, method: req.method }));
	return {
		settings: {
			requireAuth: overrides.requireAuth ?? true,
			apiKey: overrides.apiKey ?? 'secret-key',
		},
		handleRequest,
	};
}

function makeFakeSocket(): SimpleWebSocket & { sent: string[] } {
	const sent: string[] = [];
	return {
		sent,
		onmessage: undefined,
		onclose: undefined,
		onerror: undefined,
		send: vi.fn((data: string) => sent.push(data)),
		close: vi.fn(),
	} as unknown as SimpleWebSocket & { sent: string[] };
}

async function deliver(ws: SimpleWebSocket, message: WebSocketMessage): Promise<void> {
	await (ws.onmessage as (msg: WebSocketMessage) => Promise<void> | void)(message);
}

describe('MCPWebSocketServer', () => {
	let plugin: ReturnType<typeof makeFakePlugin>;
	let server: MCPWebSocketServer;

	beforeEach(() => {
		plugin = makeFakePlugin();
		server = new MCPWebSocketServer(plugin as any);
	});

	describe('message handling (via handleConnection)', () => {
		it('authenticates, dispatches to the plugin, and sends the result back', async () => {
			const ws = makeFakeSocket();
			(server as any).handleConnection(ws);

			const request: MCPRequest = { method: 'ping', params: {}, auth: 'secret-key', id: 'req-1' };
			await deliver(ws, { data: JSON.stringify(request) });

			expect(plugin.handleRequest).toHaveBeenCalledWith(request);
			const response: MCPResponse = JSON.parse(ws.sent[0]);
			expect(response).toEqual({ result: { ok: true, method: 'ping' }, id: 'req-1' });
		});

		it('rejects a request with a missing or wrong API key when auth is required', async () => {
			const ws = makeFakeSocket();
			(server as any).handleConnection(ws);

			const request: MCPRequest = { method: 'ping', params: {}, auth: 'wrong-key', id: 'req-2' };
			await deliver(ws, { data: JSON.stringify(request) });

			expect(plugin.handleRequest).not.toHaveBeenCalled();
			const response: MCPResponse = JSON.parse(ws.sent[0]);
			expect(response).toEqual({ error: 'Unauthorized: Invalid API key', id: 'req-2' });
		});

		it('allows requests without auth when requireAuth is disabled', async () => {
			plugin = makeFakePlugin({ requireAuth: false });
			server = new MCPWebSocketServer(plugin as any);
			const ws = makeFakeSocket();
			(server as any).handleConnection(ws);

			const request: MCPRequest = { method: 'ping', params: {}, id: 'req-3' };
			await deliver(ws, { data: JSON.stringify(request) });

			expect(plugin.handleRequest).toHaveBeenCalledWith(request);
			const response: MCPResponse = JSON.parse(ws.sent[0]);
			expect(response.result).toEqual({ ok: true, method: 'ping' });
		});

		it('returns an error response, keyed by request id, when the handler throws', async () => {
			plugin = makeFakePlugin({
				requireAuth: false,
				handleRequest: vi.fn(async () => {
					throw new Error('boom');
				}),
			});
			server = new MCPWebSocketServer(plugin as any);
			const ws = makeFakeSocket();
			(server as any).handleConnection(ws);

			const request: MCPRequest = { method: 'explode', params: {}, id: 'req-4' };
			await deliver(ws, { data: JSON.stringify(request) });

			const response: MCPResponse = JSON.parse(ws.sent[0]);
			expect(response).toEqual({ error: 'boom', id: 'req-4' });
		});

		it('returns an error response for malformed JSON without an id', async () => {
			const ws = makeFakeSocket();
			(server as any).handleConnection(ws);

			await deliver(ws, { data: '{ this is not json' });

			expect(plugin.handleRequest).not.toHaveBeenCalled();
			const response: MCPResponse = JSON.parse(ws.sent[0]);
			expect(response.id).toBeUndefined();
			expect(response.error).toBeTruthy();
		});
	});

	describe('broadcast', () => {
		it('sends the message to every connected client', () => {
			const ws1 = makeFakeSocket();
			const ws2 = makeFakeSocket();
			(server as any).clients.add(ws1);
			(server as any).clients.add(ws2);

			server.broadcast({ type: 'event', payload: 42 });

			expect(ws1.send).toHaveBeenCalledOnce();
			expect(ws2.send).toHaveBeenCalledOnce();
			expect(JSON.parse(ws1.sent[0])).toEqual({ type: 'event', payload: 42 });
		});

		it('does not let one failing client stop delivery to the others', () => {
			const failing = makeFakeSocket();
			(failing.send as any).mockImplementation(() => {
				throw new Error('socket closed');
			});
			const healthy = makeFakeSocket();
			(server as any).clients.add(failing);
			(server as any).clients.add(healthy);

			expect(() => server.broadcast({ type: 'event' })).not.toThrow();
			expect(healthy.send).toHaveBeenCalledOnce();
		});
	});

	describe('isRunning / stop', () => {
		it('reports not running before start and running once an http server is set', () => {
			expect(server.isRunning()).toBe(false);
			(server as any).httpServer = {};
			expect(server.isRunning()).toBe(true);
		});

		it('closes and clears all clients on stop', () => {
			const ws1 = makeFakeSocket();
			const ws2 = makeFakeSocket();
			(server as any).clients.add(ws1);
			(server as any).clients.add(ws2);

			server.stop();

			expect(ws1.close).toHaveBeenCalledOnce();
			expect(ws2.close).toHaveBeenCalledOnce();
			expect((server as any).clients.size).toBe(0);
		});
	});
});
