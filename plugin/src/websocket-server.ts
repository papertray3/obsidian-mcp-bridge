import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type MCPBridgePlugin from './main';

export interface MCPRequest {
	auth?: string;
	method: string;
	params: Record<string, any>;
}

export interface MCPResponse {
	result?: any;
	error?: string;
}

export class MCPWebSocketServer {
	private wss: WebSocketServer | null = null;
	private plugin: MCPBridgePlugin;

	constructor(plugin: MCPBridgePlugin) {
		this.plugin = plugin;
	}

	start(): void {
		if (this.wss) {
			console.warn('MCP Bridge: WebSocket server already running');
			return;
		}

		const { host, port, enableSSL, certPath, keyPath } = this.plugin.settings;

		// TODO: SSL support (Phase 5+)
		const serverOptions: any = {
			host,
			port,
		};

		try {
			this.wss = new WebSocketServer(serverOptions);

			this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
				console.log('MCP Bridge: Client connected');

				// Check origin if remote access enabled
				if (this.plugin.settings.enableRemote) {
					const origin = req.headers.origin;
					if (!this.isOriginAllowed(origin)) {
						console.warn(`MCP Bridge: Origin not allowed: ${origin}`);
						ws.close(1008, 'Origin not allowed');
						return;
					}
				}

				this.handleConnection(ws);
			});

			this.wss.on('error', (error: Error) => {
				console.error('MCP Bridge: WebSocket server error:', error);
			});

			console.log(`MCP Bridge: WebSocket server listening on ${host}:${port}`);

		} catch (error) {
			console.error('MCP Bridge: Failed to start WebSocket server:', error);
			throw error;
		}
	}

	stop(): void {
		if (this.wss) {
			this.wss.close(() => {
				console.log('MCP Bridge: WebSocket server stopped');
			});
			this.wss = null;
		}
	}

	isRunning(): boolean {
		return this.wss !== null;
	}

	private handleConnection(ws: WebSocket): void {
		ws.on('message', async (data: Buffer) => {
			try {
				const request = JSON.parse(data.toString()) as MCPRequest;

				// Authenticate
				if (this.plugin.settings.requireAuth) {
					if (!request.auth || request.auth !== this.plugin.settings.apiKey) {
						const response: MCPResponse = {
							error: 'Unauthorized: Invalid API key'
						};
						ws.send(JSON.stringify(response));
						return;
					}
				}

				// Handle request
				const result = await this.plugin.handleRequest(request);
				const response: MCPResponse = { result };
				ws.send(JSON.stringify(response));

			} catch (error) {
				console.error('MCP Bridge: Request handling error:', error);
				const response: MCPResponse = {
					error: error instanceof Error ? error.message : 'Unknown error'
				};
				ws.send(JSON.stringify(response));
			}
		});

		ws.on('error', (error: Error) => {
			console.error('MCP Bridge: WebSocket connection error:', error);
		});

		ws.on('close', () => {
			console.log('MCP Bridge: Client disconnected');
		});
	}

	private isOriginAllowed(origin: string | undefined): boolean {
		if (!this.plugin.settings.enableRemote) {
			return true; // Localhost connections always allowed
		}

		if (!origin) {
			return false; // No origin header = reject
		}

		const { allowedOrigins } = this.plugin.settings;

		if (allowedOrigins.length === 0) {
			return false; // No origins configured = reject all
		}

		return allowedOrigins.includes(origin);
	}
}
