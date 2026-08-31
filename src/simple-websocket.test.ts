import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { SimpleWebSocket, SimpleWebSocketServer } from './simple-websocket';

const OPCODE_CONTINUATION = 0x0;
const OPCODE_TEXT = 0x1;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;
const OPCODE_PONG = 0xa;

/** Builds a client->server frame. Client frames must always be masked per RFC 6455 §5.1. */
function buildClientFrame(opcode: number, payload: Buffer, opts: { fin?: boolean; masked?: boolean } = {}): Buffer {
	const fin = opts.fin ?? true;
	const masked = opts.masked ?? true;
	const payloadLength = payload.length;

	const parts: Buffer[] = [];
	const firstByte = (fin ? 0x80 : 0x00) | opcode;

	if (payloadLength < 126) {
		parts.push(Buffer.from([firstByte, (masked ? 0x80 : 0) | payloadLength]));
	} else if (payloadLength < 65536) {
		const header = Buffer.alloc(4);
		header.writeUInt8(firstByte, 0);
		header.writeUInt8((masked ? 0x80 : 0) | 126, 1);
		header.writeUInt16BE(payloadLength, 2);
		parts.push(header);
	} else {
		const header = Buffer.alloc(10);
		header.writeUInt8(firstByte, 0);
		header.writeUInt8((masked ? 0x80 : 0) | 127, 1);
		header.writeUInt32BE(0, 2);
		header.writeUInt32BE(payloadLength, 6);
		parts.push(header);
	}

	if (masked) {
		const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);
		const maskedPayload = Buffer.from(payload);
		for (let i = 0; i < maskedPayload.length; i++) {
			maskedPayload[i] ^= maskKey[i % 4];
		}
		parts.push(maskKey, maskedPayload);
	} else {
		parts.push(payload);
	}

	return Buffer.concat(parts);
}

function textFrame(text: string, opts?: { fin?: boolean; masked?: boolean }): Buffer {
	return buildClientFrame(OPCODE_TEXT, Buffer.from(text, 'utf8'), opts);
}

/** Decodes a server->client frame (server frames are always unmasked). */
function decodeServerFrame(buffer: Buffer): { opcode: number; fin: boolean; payload: Buffer } {
	const firstByte = buffer.readUInt8(0);
	const fin = Boolean((firstByte >>> 7) & 0x1);
	const opcode = firstByte & 0xf;
	const secondByte = buffer.readUInt8(1);
	let payloadLength = secondByte & 0x7f;
	let offset = 2;
	if (payloadLength === 126) {
		payloadLength = buffer.readUInt16BE(offset);
		offset += 2;
	} else if (payloadLength === 127) {
		payloadLength = buffer.readUInt32BE(offset + 4);
		offset += 8;
	}
	return { opcode, fin, payload: buffer.subarray(offset, offset + payloadLength) };
}

/** A minimal fake net.Socket: an EventEmitter with write()/end() spies. */
function makeFakeSocket() {
	const emitter = new EventEmitter() as EventEmitter & { write: any; end: any };
	emitter.write = vi.fn();
	emitter.end = vi.fn();
	return emitter;
}

describe('SimpleWebSocket frame handling', () => {
	let socket: ReturnType<typeof makeFakeSocket>;
	let ws: SimpleWebSocket;
	let messages: string[];

	beforeEach(() => {
		socket = makeFakeSocket();
		ws = new SimpleWebSocket(socket);
		messages = [];
		ws.onmessage = (msg) => messages.push(msg.data);
	});

	it('decodes a single complete masked text frame', () => {
		socket.emit('data', textFrame('hello'));
		expect(messages).toEqual(['hello']);
	});

	it('reassembles a frame split across multiple TCP data events', () => {
		const frame = textFrame('a longer message that spans packets');
		const split = Math.floor(frame.length / 2);

		socket.emit('data', frame.subarray(0, split));
		expect(messages).toEqual([]); // nothing yet - frame is incomplete

		socket.emit('data', frame.subarray(split));
		expect(messages).toEqual(['a longer message that spans packets']);
	});

	it('processes multiple frames delivered in a single TCP data event', () => {
		const combined = Buffer.concat([textFrame('first'), textFrame('second')]);
		socket.emit('data', combined);
		expect(messages).toEqual(['first', 'second']);
	});

	it('reassembles a message fragmented across continuation frames', () => {
		socket.emit('data', textFrame('Hello, ', { fin: false }));
		expect(messages).toEqual([]); // not complete yet

		socket.emit('data', buildClientFrame(OPCODE_CONTINUATION, Buffer.from('world!', 'utf8'), { fin: true }));
		expect(messages).toEqual(['Hello, world!']);
	});

	it('encodes payloads at each length boundary correctly (send -> decode)', () => {
		for (const size of [10, 125, 126, 500, 65535, 65536]) {
			socket.write.mockClear();
			const payload = 'x'.repeat(size);
			ws.send(payload);
			const sent = socket.write.mock.calls[0][0] as Buffer;
			const decoded = decodeServerFrame(sent);
			expect(decoded.opcode).toBe(OPCODE_TEXT);
			expect(decoded.fin).toBe(true);
			expect(decoded.payload.toString('utf8')).toBe(payload);
			// RFC 6455 §5.1: the server MUST NOT mask frames it sends.
			expect(sent.readUInt8(1) & 0x80).toBe(0);
		}
	});

	it('responds to a Ping with a Pong carrying the same payload', () => {
		const pingPayload = Buffer.from('ping-data', 'utf8');
		socket.emit('data', buildClientFrame(OPCODE_PING, pingPayload));

		expect(socket.write).toHaveBeenCalledOnce();
		const decoded = decodeServerFrame(socket.write.mock.calls[0][0] as Buffer);
		expect(decoded.opcode).toBe(OPCODE_PONG);
		expect(decoded.payload).toEqual(pingPayload);
	});

	it('echoes a Close frame and ends the socket when the client closes', () => {
		socket.emit('data', buildClientFrame(OPCODE_CLOSE, Buffer.alloc(0)));

		const closeCall = socket.write.mock.calls.find(
			(call: any[]) => decodeServerFrame(call[0]).opcode === OPCODE_CLOSE
		);
		expect(closeCall).toBeDefined();
		expect(socket.end).toHaveBeenCalledOnce();
	});

	it('closes the connection on an unmasked frame from the client (protocol violation)', () => {
		const onerror = vi.fn();
		ws.onerror = onerror;

		socket.emit('data', textFrame('sneaky', { masked: false }));

		expect(onerror).toHaveBeenCalledOnce();
		expect(socket.end).toHaveBeenCalledOnce();
		expect(messages).toEqual([]);
	});

	it('surfaces onclose/onerror from the underlying socket', () => {
		const onclose = vi.fn();
		const onerror = vi.fn();
		ws.onclose = onclose;
		ws.onerror = onerror;

		socket.emit('close');
		socket.emit('error', new Error('boom'));

		expect(onclose).toHaveBeenCalledOnce();
		expect(onerror).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
	});
});

describe('SimpleWebSocketServer handshake', () => {
	it('computes Sec-WebSocket-Accept per the RFC 6455 §1.3 example', () => {
		// This is the canonical worked example from the spec itself.
		const clientKey = 'dGhlIHNhbXBsZSBub25jZQ==';
		const expectedAccept = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';

		const httpServer = new EventEmitter();
		const server = new SimpleWebSocketServer(httpServer);

		const socket = makeFakeSocket();
		httpServer.emit('upgrade', { headers: { 'sec-websocket-key': clientKey } }, socket, Buffer.alloc(0));

		expect(socket.write).toHaveBeenCalled();
		const response = socket.write.mock.calls[0][0] as string;
		expect(response).toContain('HTTP/1.1 101 Switching Protocols');
		expect(response).toContain(`Sec-WebSocket-Accept: ${expectedAccept}`);
	});

	it('rejects an upgrade request missing Sec-WebSocket-Key', () => {
		const httpServer = new EventEmitter();
		new SimpleWebSocketServer(httpServer);

		const socket = makeFakeSocket();
		httpServer.emit('upgrade', { headers: {} }, socket, Buffer.alloc(0));

		expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('400 Bad Request'));
		expect(socket.end).toHaveBeenCalledOnce();
	});

	it('invokes onconnection with a usable SimpleWebSocket', () => {
		const httpServer = new EventEmitter();
		const server = new SimpleWebSocketServer(httpServer);
		const onconnection = vi.fn();
		server.onconnection = onconnection;

		const socket = makeFakeSocket();
		httpServer.emit('upgrade', { headers: { 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' } }, socket, Buffer.alloc(0));

		expect(onconnection).toHaveBeenCalledOnce();
		expect(onconnection.mock.calls[0][0]).toBeInstanceOf(SimpleWebSocket);
	});
});
