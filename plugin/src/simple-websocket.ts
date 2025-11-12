/**
 * Simple WebSocket server implementation using Node.js http module
 * This avoids issues with the 'ws' package in Obsidian's Electron environment
 */

import { createHash } from 'crypto';

export interface WebSocketMessage {
	data: string;
}

export class SimpleWebSocket {
	private socket: any;
	public onmessage?: (msg: WebSocketMessage) => void;
	public onclose?: () => void;
	public onerror?: (err: Error) => void;

	constructor(socket: any) {
		this.socket = socket;

		socket.on('data', (buffer: Buffer) => {
			try {
				const message = this.decodeFrame(buffer);
				if (message && this.onmessage) {
					this.onmessage({ data: message });
				}
			} catch (err) {
				if (this.onerror) {
					this.onerror(err as Error);
				}
			}
		});

		socket.on('close', () => {
			if (this.onclose) {
				this.onclose();
			}
		});

		socket.on('error', (err: Error) => {
			if (this.onerror) {
				this.onerror(err);
			}
		});
	}

	send(data: string): void {
		const frame = this.encodeFrame(data);
		this.socket.write(frame);
	}

	close(): void {
		this.socket.end();
	}

	private decodeFrame(buffer: Buffer): string | null {
		// Simple WebSocket frame decoding
		const firstByte = buffer.readUInt8(0);
		const isFinalFrame = Boolean((firstByte >>> 7) & 0x1);
		const opcode = firstByte & 0xf;

		// Text frame
		if (opcode !== 0x1) return null;

		const secondByte = buffer.readUInt8(1);
		const isMasked = Boolean((secondByte >>> 7) & 0x1);
		let currentOffset = 2;
		let payloadLength = secondByte & 0x7f;

		if (payloadLength === 126) {
			payloadLength = buffer.readUInt16BE(currentOffset);
			currentOffset += 2;
		} else if (payloadLength === 127) {
			payloadLength = buffer.readUInt32BE(currentOffset + 4);
			currentOffset += 8;
		}

		let maskingKey: Buffer | null = null;
		if (isMasked) {
			maskingKey = buffer.slice(currentOffset, currentOffset + 4);
			currentOffset += 4;
		}

		const data = buffer.slice(currentOffset, currentOffset + payloadLength);

		if (maskingKey) {
			for (let i = 0; i < data.length; i++) {
				data[i] ^= maskingKey[i % 4];
			}
		}

		return data.toString('utf8');
	}

	private encodeFrame(data: string): Buffer {
		const payload = Buffer.from(data, 'utf8');
		const payloadLength = payload.length;

		let frame: Buffer;
		let offset = 0;

		if (payloadLength < 126) {
			frame = Buffer.allocUnsafe(2 + payloadLength);
			frame.writeUInt8(0x81, offset++); // FIN + text frame
			frame.writeUInt8(payloadLength, offset++);
		} else if (payloadLength < 65536) {
			frame = Buffer.allocUnsafe(4 + payloadLength);
			frame.writeUInt8(0x81, offset++);
			frame.writeUInt8(126, offset++);
			frame.writeUInt16BE(payloadLength, offset);
			offset += 2;
		} else {
			frame = Buffer.allocUnsafe(10 + payloadLength);
			frame.writeUInt8(0x81, offset++);
			frame.writeUInt8(127, offset++);
			frame.writeUInt32BE(0, offset);
			frame.writeUInt32BE(payloadLength, offset + 4);
			offset += 8;
		}

		payload.copy(frame, offset);
		return frame;
	}
}

export class SimpleWebSocketServer {
	private server: any;
	public onconnection?: (ws: SimpleWebSocket, req: any) => void;
	public onerror?: (err: Error) => void;

	constructor(httpServer: any) {
		this.server = httpServer;

		this.server.on('upgrade', (req: any, socket: any, head: Buffer) => {
			this.handleUpgrade(req, socket, head);
		});
	}

	private handleUpgrade(req: any, socket: any, head: Buffer): void {
		try {
			const key = req.headers['sec-websocket-key'];
			const acceptKey = this.generateAcceptKey(key);

			const responseHeaders = [
				'HTTP/1.1 101 Switching Protocols',
				'Upgrade: websocket',
				'Connection: Upgrade',
				`Sec-WebSocket-Accept: ${acceptKey}`,
				'',
				''
			].join('\r\n');

			socket.write(responseHeaders);

			const ws = new SimpleWebSocket(socket);

			if (this.onconnection) {
				this.onconnection(ws, req);
			}
		} catch (err) {
			if (this.onerror) {
				this.onerror(err as Error);
			}
			socket.end();
		}
	}

	private generateAcceptKey(key: string): string {
		const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
		const hash = createHash('sha1');
		hash.update(key + GUID);
		return hash.digest('base64');
	}

	close(): void {
		// Server close is handled by HTTP server
	}
}
