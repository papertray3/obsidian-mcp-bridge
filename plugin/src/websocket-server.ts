import type MCPBridgePlugin from './main';
import { SimpleWebSocketServer, SimpleWebSocket } from './simple-websocket';

export interface MCPRequest {
	auth?: string;
	method: string;
	params: Record<string, any>;
	id?: string;
}

export interface MCPResponse {
	result?: any;
	error?: string;
	id?: string;
}

export class MCPWebSocketServer {
	private httpServer: any = null;
	private wsServer: SimpleWebSocketServer | null = null;
	private clients: Set<SimpleWebSocket> = new Set();
	private plugin: MCPBridgePlugin;

	constructor(plugin: MCPBridgePlugin) {
		this.plugin = plugin;
	}

	start(): void {
		if (this.httpServer) {
			console.warn('MCP Bridge: WebSocket server already running');
			return;
		}

		const { host, port } = this.plugin.settings;

		try {
			// Create HTTP server using Node.js built-in
			const http = require('http');
			this.httpServer = http.createServer();

			// Create our simple WebSocket server
			this.wsServer = new SimpleWebSocketServer(this.httpServer);

			this.wsServer.onconnection = (ws: SimpleWebSocket, req: any) => {
				console.log('MCP Bridge: Client connected');
				this.clients.add(ws);

				this.handleConnection(ws);

				ws.onclose = () => {
					this.clients.delete(ws);
					console.log('MCP Bridge: Client disconnected');
				};
			};

			this.wsServer.onerror = (error: Error) => {
				console.error('MCP Bridge: WebSocket server error:', error);
			};

			// Start HTTP server with better error handling
			this.httpServer.on('error', (err: any) => {
				console.error('MCP Bridge: HTTP server error:', err);
				if (err.code === 'EADDRINUSE') {
					console.error(`Port ${port} is already in use. Change port in settings.`);
				}
			});

			// Log immediately that we're trying to start
			console.log(`MCP Bridge: Attempting to start server on ${host}:${port}...`);

			this.httpServer.listen(port, host, () => {
				console.log(`MCP Bridge: ✅ WebSocket server listening on ${host}:${port}`);
			});

		} catch (error) {
			console.error('MCP Bridge: Failed to start WebSocket server:', error);
			console.error('MCP Bridge: Error details:', error);
			throw error;
		}
	}

	stop(): void {
		// Close all client connections
		for (const client of this.clients) {
			client.close();
		}
		this.clients.clear();

		if (this.httpServer) {
			this.httpServer.close(() => {
				console.log('MCP Bridge: WebSocket server stopped');
			});
			this.httpServer = null;
		}
	}

	isRunning(): boolean {
		return this.httpServer !== null;
	}

	private handleConnection(ws: SimpleWebSocket): void {
		ws.onmessage = async (msg) => {
			let request: MCPRequest | undefined;
			try {
				request = JSON.parse(msg.data) as MCPRequest;

				// Authenticate
				if (this.plugin.settings.requireAuth) {
					if (!request.auth || request.auth !== this.plugin.settings.apiKey) {
						const response: MCPResponse = {
							error: 'Unauthorized: Invalid API key',
							id: request.id
						};
						ws.send(JSON.stringify(response));
						return;
					}
				}

				// Handle request
				const result = await this.plugin.handleRequest(request);
				const response: MCPResponse = {
					result,
					id: request.id
				};
				ws.send(JSON.stringify(response));

			} catch (error) {
				console.error('MCP Bridge: Request handling error:', error);
				const response: MCPResponse = {
					error: error instanceof Error ? error.message : 'Unknown error',
					id: request?.id
				};
				ws.send(JSON.stringify(response));
			}
		};

		ws.onerror = (error: Error) => {
			console.error('MCP Bridge: WebSocket connection error:', error);
		};
	}

	/**
	 * Broadcast a message to all connected clients
	 * Used for real-time event notifications (e.g., job status updates)
	 */
	broadcast(message: any): void {
		const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
		console.log(`MCP Bridge: Broadcasting to ${this.clients.size} clients:`, messageStr);

		for (const client of this.clients) {
			try {
				client.send(messageStr);
			} catch (error) {
				console.error('MCP Bridge: Error broadcasting to client:', error);
			}
		}
	}
}
