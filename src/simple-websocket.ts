/**
 * Simple WebSocket server implementation using Node.js http module
 * This avoids issues with the 'ws' package in Obsidian's Electron environment
 */

import { createHash } from 'crypto';

export interface WebSocketMessage {
	data: string;
}

interface ParsedFrame {
	isFinalFrame: boolean;
	opcode: number;
	isMasked: boolean;
	payload: Buffer;
	/** Total bytes this frame occupied in the source buffer, so the caller can advance past it. */
	frameLength: number;
}

const OPCODE_CONTINUATION = 0x0;
const OPCODE_TEXT = 0x1;
const OPCODE_BINARY = 0x2;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;
const OPCODE_PONG = 0xa;

export class SimpleWebSocket {
	private socket: any;
	// TCP is a byte stream, not a message stream: a single 'data' event may contain part of
	// a frame, or several frames back to back. Everything not yet consumed is buffered here.
	private buffer: Buffer = Buffer.alloc(0);
	// Accumulates payloads for a message split across continuation frames (FIN=0 ... FIN=1).
	private fragmentedPayloads: Buffer[] | null = null;
	public onmessage?: (msg: WebSocketMessage) => void;
	public onclose?: () => void;
	public onerror?: (err: Error) => void;

	constructor(socket: any) {
		this.socket = socket;

		socket.on('data', (chunk: Buffer) => {
			this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
			this.processBuffer();
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
		this.socket.write(this.encodeFrame(OPCODE_TEXT, Buffer.from(data, 'utf8')));
	}

	close(): void {
		try {
			this.socket.write(this.encodeFrame(OPCODE_CLOSE, Buffer.alloc(0)));
		} catch {
			// Socket may already be half-closed (e.g. we're reacting to a close frame
			// the peer just sent) - falling through to end() below is enough.
		}
		this.socket.end();
	}

	/** Parses and dispatches as many complete frames as are currently buffered. */
	private processBuffer(): void {
		while (true) {
			const frame = this.tryParseFrame(this.buffer);
			if (!frame) return; // Incomplete frame - wait for more data.

			this.buffer = this.buffer.subarray(frame.frameLength);

			try {
				this.handleFrame(frame);
			} catch (err) {
				if (this.onerror) this.onerror(err as Error);
				return;
			}
		}
	}

	private handleFrame(frame: ParsedFrame): void {
		const { isFinalFrame, opcode, payload, isMasked } = frame;

		// RFC 6455 §5.1: a client MUST mask every frame it sends; a server receiving an
		// unmasked frame MUST close the connection.
		if (!isMasked) {
			if (this.onerror) {
				this.onerror(new Error('Protocol violation: received unmasked frame from client'));
			}
			this.socket.end();
			return;
		}

		switch (opcode) {
			case OPCODE_CONTINUATION:
				if (!this.fragmentedPayloads) {
					throw new Error('Protocol violation: continuation frame with no preceding fragment');
				}
				this.fragmentedPayloads.push(payload);
				if (isFinalFrame) this.completeFragmentedMessage();
				return;

			case OPCODE_TEXT:
				if (!isFinalFrame) {
					this.fragmentedPayloads = [payload];
					return;
				}
				this.emitMessage(payload);
				return;

			case OPCODE_CLOSE:
				// Echo a close frame back and tear down the connection (RFC 6455 §7.1.5/§5.5.1).
				this.close();
				return;

			case OPCODE_PING:
				// RFC 6455 §5.5.2: must reply with a Pong carrying the same payload.
				this.socket.write(this.encodeFrame(OPCODE_PONG, payload));
				return;

			case OPCODE_PONG:
				return; // Nothing to do - we don't currently send pings ourselves.

			case OPCODE_BINARY:
			default:
				// This bridge's protocol is JSON-over-text only; binary frames and any
				// opcode we don't recognize are surfaced but otherwise ignored rather
				// than mis-decoded as UTF-8 text.
				if (this.onerror) {
					this.onerror(new Error(`Unsupported WebSocket opcode: 0x${opcode.toString(16)}`));
				}
				return;
		}
	}

	private completeFragmentedMessage(): void {
		const full = Buffer.concat(this.fragmentedPayloads!);
		this.fragmentedPayloads = null;
		this.emitMessage(full);
	}

	private emitMessage(payload: Buffer): void {
		if (this.onmessage) {
			this.onmessage({ data: payload.toString('utf8') });
		}
	}

	/** Returns null if `buffer` doesn't yet contain a complete frame. */
	private tryParseFrame(buffer: Buffer): ParsedFrame | null {
		if (buffer.length < 2) return null;

		const firstByte = buffer.readUInt8(0);
		const isFinalFrame = Boolean((firstByte >>> 7) & 0x1);
		const opcode = firstByte & 0xf;

		const secondByte = buffer.readUInt8(1);
		const isMasked = Boolean((secondByte >>> 7) & 0x1);
		let payloadLength = secondByte & 0x7f;
		let offset = 2;

		if (payloadLength === 126) {
			if (buffer.length < offset + 2) return null;
			payloadLength = buffer.readUInt16BE(offset);
			offset += 2;
		} else if (payloadLength === 127) {
			if (buffer.length < offset + 8) return null;
			// Only the low 32 bits are read - messages over 4GB aren't realistic for this
			// bridge (small JSON-RPC-style payloads), so the high 32 bits are ignored.
			payloadLength = buffer.readUInt32BE(offset + 4);
			offset += 8;
		}

		let maskingKey: Buffer | null = null;
		if (isMasked) {
			if (buffer.length < offset + 4) return null;
			maskingKey = buffer.subarray(offset, offset + 4);
			offset += 4;
		}

		if (buffer.length < offset + payloadLength) return null; // Incomplete - wait for more data.

		// Copy out of the shared buffer before unmasking in place.
		const payload = Buffer.from(buffer.subarray(offset, offset + payloadLength));
		if (maskingKey) {
			for (let i = 0; i < payload.length; i++) {
				payload[i] ^= maskingKey[i % 4];
			}
		}

		return { isFinalFrame, opcode, isMasked, payload, frameLength: offset + payloadLength };
	}

	private encodeFrame(opcode: number, payload: Buffer): Buffer {
		const payloadLength = payload.length;

		let frame: Buffer;
		let offset = 0;

		if (payloadLength < 126) {
			frame = Buffer.allocUnsafe(2 + payloadLength);
			frame.writeUInt8(0x80 | opcode, offset++); // FIN + opcode; server frames are never masked.
			frame.writeUInt8(payloadLength, offset++);
		} else if (payloadLength < 65536) {
			frame = Buffer.allocUnsafe(4 + payloadLength);
			frame.writeUInt8(0x80 | opcode, offset++);
			frame.writeUInt8(126, offset++);
			frame.writeUInt16BE(payloadLength, offset);
			offset += 2;
		} else {
			frame = Buffer.allocUnsafe(10 + payloadLength);
			frame.writeUInt8(0x80 | opcode, offset++);
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
			if (!key) {
				socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
				socket.end();
				return;
			}

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
