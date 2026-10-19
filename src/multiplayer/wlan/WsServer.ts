/**
 * Minimal RFC 6455 WebSocket server that runs on top of any Node-style TCP
 * server (react-native-tcp-socket in the app, node:net in tests).
 *
 * Besides WebSocket upgrades it answers a plain `GET /uno-info` with the
 * room beacon JSON — that is what LAN discovery probes, so no UDP broadcast
 * (blocked on many Wi-Fi routers / needs extra permissions) is required.
 */
import { base64Encode, concatBytes, sha1, toBytes, utf8Decode, utf8Encode } from './bytes';

export interface RawSocket {
  on(event: string, cb: (...args: any[]) => void): unknown;
  write(data: Uint8Array): unknown;
  destroy(): unknown;
  setNoDelay?(noDelay?: boolean): unknown;
}

export interface RawServer {
  on(event: string, cb: (...args: any[]) => void): unknown;
  listen(options: { port: number; host?: string }, cb?: () => void): unknown;
  close(cb?: () => void): unknown;
}

export type RawServerFactory = () => RawServer;

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_HEADER_BYTES = 8 * 1024;
export const MAX_MESSAGE_BYTES = 1024 * 1024;

export interface WsServerOptions {
  createServer: RawServerFactory;
  /** Returns the JSON served for `GET /uno-info` (or null to answer 404). */
  getInfo?: () => unknown | null;
  pingIntervalMs?: number;
  idleTimeoutMs?: number;
}

export class WsConnection {
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private upgraded = false;
  private closed = false;
  private fragments: Uint8Array[] = [];
  private fragmentBytes = 0;
  private fragmentOpcode = 0;
  lastActivity = Date.now();

  onMessage: ((text: string) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(
    readonly id: string,
    private readonly socket: RawSocket,
    private readonly server: WsServer
  ) {
    socket.setNoDelay?.(true);
    socket.on('data', (d: unknown) => this.handleData(toBytes(d)));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }

  get isOpen(): boolean {
    return this.upgraded && !this.closed;
  }

  send(text: string): boolean {
    if (!this.isOpen) return false;
    this.writeFrame(0x1, utf8Encode(text));
    return true;
  }

  ping(): void {
    if (this.isOpen) this.writeFrame(0x9, new Uint8Array(0));
  }

  close(code = 1000): void {
    if (this.closed) return;
    if (this.upgraded) {
      this.writeFrame(0x8, Uint8Array.from([(code >> 8) & 255, code & 255]));
    }
    this.finish();
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.socket.destroy(); } catch (_) {}
    this.server._removeConnection(this);
    if (this.upgraded) this.onClose?.();
  }

  private writeFrame(opcode: number, payload: Uint8Array): void {
    const len = payload.length;
    let header: Uint8Array;
    if (len < 126) header = Uint8Array.from([0x80 | opcode, len]);
    else if (len < 65536) header = Uint8Array.from([0x80 | opcode, 126, len >> 8, len & 255]);
    else {
      header = new Uint8Array(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      new DataView(header.buffer).setUint32(6, len >>> 0);
    }
    try { this.socket.write(concatBytes(header, payload)); } catch (_) { this.finish(); }
  }

  private handleData(chunk: Uint8Array): void {
    if (this.closed) return;
    this.lastActivity = Date.now();
    this.buffer = concatBytes(this.buffer, chunk);
    if (!this.upgraded) {
      this.handleHttp();
      if (!this.upgraded) return;
    }
    this.parseFrames();
  }

  private handleHttp(): void {
    const buf = this.buffer;
    let end = -1;
    for (let i = 0; i + 3 < buf.length; i++) {
      if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) { end = i; break; }
    }
    if (end < 0) {
      if (buf.length > MAX_HEADER_BYTES) this.reject(431, 'Header too large');
      return;
    }
    const head = utf8Decode(buf.subarray(0, end));
    this.buffer = buf.subarray(end + 4);
    const lines = head.split('\r\n');
    const [method, path] = lines[0].split(' ');
    const headers: Record<string, string> = {};
    for (const l of lines.slice(1)) {
      const idx = l.indexOf(':');
      if (idx > 0) headers[l.slice(0, idx).trim().toLowerCase()] = l.slice(idx + 1).trim();
    }
    const wantsUpgrade = (headers['upgrade'] || '').toLowerCase() === 'websocket';

    if (method === 'GET' && !wantsUpgrade && (path === '/uno-info' || path?.startsWith('/uno-info?'))) {
      const info = this.server.getInfo();
      if (info == null) { this.reject(404, 'No room'); return; }
      const body = utf8Encode(JSON.stringify(info));
      const resp = utf8Encode(
        `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n`
      );
      try { this.socket.write(concatBytes(resp, body)); } catch (_) {}
      this.finish();
      return;
    }

    const key = headers['sec-websocket-key'];
    if (method !== 'GET' || !wantsUpgrade || !key || headers['sec-websocket-version'] !== '13') {
      this.reject(400, 'Bad Request');
      return;
    }
    const accept = base64Encode(sha1(utf8Encode(key + WS_GUID)));
    this.socket.write(
      utf8Encode(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
      )
    );
    this.upgraded = true;
    this.server._onUpgraded(this);
  }

  private reject(status: number, text: string): void {
    try {
      this.socket.write(utf8Encode(`HTTP/1.1 ${status} ${text}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`));
    } catch (_) {}
    this.finish();
  }

  private parseFrames(): void {
    for (;;) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = (b[2] << 8) | b[3];
        offset = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
        if (dv.getUint32(2) !== 0) { this.close(1009); return; }
        len = dv.getUint32(6);
        offset = 10;
      }
      if (!masked || len > MAX_MESSAGE_BYTES || (opcode >= 8 && (len > 125 || !fin))) {
        this.close(masked ? 1009 : 1002);
        return;
      }
      if (b.length < offset + 4 + len) return;
      const mask = b.subarray(offset, offset + 4);
      const payload = new Uint8Array(len);
      for (let i = 0; i < len; i++) payload[i] = b[offset + 4 + i] ^ mask[i & 3];
      this.buffer = b.subarray(offset + 4 + len);

      if (opcode === 0x8) { this.close(1000); return; }
      if (opcode === 0x9) { this.writeFrame(0xa, payload); continue; }
      if (opcode === 0xa) continue;

      if (opcode === 0x1 || opcode === 0x2) {
        if (this.fragments.length) { this.close(1002); return; }
        this.fragmentOpcode = opcode;
      } else if (opcode !== 0x0 || !this.fragments.length) {
        this.close(1002);
        return;
      }
      this.fragments.push(payload);
      this.fragmentBytes += len;
      if (this.fragmentBytes > MAX_MESSAGE_BYTES) { this.close(1009); return; }
      if (fin) {
        let whole: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
        for (const f of this.fragments) whole = concatBytes(whole, f);
        this.fragments = [];
        this.fragmentBytes = 0;
        if (this.fragmentOpcode === 0x1) {
          try { this.onMessage?.(utf8Decode(whole)); } catch (_) {}
        }
      }
    }
  }
}

export class WsServer {
  private server: RawServer | null = null;
  private connections = new Map<string, WsConnection>();
  private nextId = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private opts: WsServerOptions;

  onConnection: ((conn: WsConnection) => void) | null = null;

  constructor(opts: WsServerOptions) {
    this.opts = opts;
  }

  getInfo(): unknown | null {
    try { return this.opts.getInfo ? this.opts.getInfo() : null; } catch (_) { return null; }
  }

  listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.opts.createServer();
      this.server = server;
      let settled = false;
      server.on('connection', (socket: RawSocket) => {
        const conn = new WsConnection(`c${this.nextId++}`, socket, this);
        this.connections.set(conn.id, conn);
        // Connections that never complete the HTTP handshake are dropped quickly.
        setTimeout(() => { if (!conn.isOpen && this.connections.get(conn.id) === conn) conn.close(); }, 5000);
      });
      server.on('error', (err: unknown) => {
        if (!settled) { settled = true; reject(err instanceof Error ? err : new Error(String(err))); }
      });
      server.listen({ port, host: '0.0.0.0' }, () => {
        if (!settled) { settled = true; resolve(); }
      });
      const ping = this.opts.pingIntervalMs ?? 5000;
      const idle = this.opts.idleTimeoutMs ?? 15000;
      this.timer = setInterval(() => {
        const now = Date.now();
        for (const c of this.connections.values()) {
          if (!c.isOpen) continue;
          if (now - c.lastActivity > idle) c.close(1001);
          else c.ping();
        }
      }, ping);
    });
  }

  getConnection(id: string): WsConnection | undefined {
    return this.connections.get(id);
  }

  broadcast(text: string, exceptId?: string): void {
    for (const c of this.connections.values()) if (c.id !== exceptId) c.send(text);
  }

  async close(): Promise<void> {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const c of Array.from(this.connections.values())) c.close(1001);
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>(res => { try { s.close(() => res()); } catch (_) { res(); } });
  }

  /** @internal */
  _onUpgraded(conn: WsConnection): void {
    this.onConnection?.(conn);
  }

  /** @internal */
  _removeConnection(conn: WsConnection): void {
    this.connections.delete(conn.id);
  }
}
