/**
 * LAN room discovery without UDP: every host runs the WsServer on a fixed
 * port that also answers `GET /uno-info`. A guest probes the hosts of its own
 * /24 subnet (plus any explicit address) and collects the rooms that answer.
 * Works on routers that block broadcast/multicast and needs no extra
 * permissions beyond normal networking.
 */
import { concatBytes, toBytes, utf8Decode, utf8Encode } from './bytes';
import type { RawSocket } from './WsServer';

export const WLAN_PROTOCOL = 'uno-party/1';
export const DEFAULT_WLAN_PORT = 8088;

export interface RoomBeacon {
  app: 'uno-party';
  protocol: string;
  code: string;
  hostName: string;
  hostPlayerId?: string;
  playerCount: number;
  maxPlayers: number;
  deckType: 'NORMAL' | 'NO_MERCY';
  status: 'WAITING' | 'PLAYING';
}

export interface DiscoveredRoom extends RoomBeacon {
  hostAddress: string;
  port: number;
  lastSeen: number;
}

export interface ClientSocket extends RawSocket {}
export type ConnectFn = (host: string, port: number, onConnect: () => void) => ClientSocket;

export function isValidIpv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  return !!m && m.slice(1).every(o => Number(o) <= 255);
}

/** All other host addresses of the /24 that `localIp` is in. */
export function subnetCandidates(localIp: string): string[] {
  if (!isValidIpv4(localIp)) return [];
  const prefix = localIp.split('.').slice(0, 3).join('.');
  const self = Number(localIp.split('.')[3]);
  const out: string[] = [];
  for (let i = 1; i <= 254; i++) if (i !== self) out.push(`${prefix}.${i}`);
  return out;
}

function parseBeacon(raw: string): RoomBeacon | null {
  try {
    const j = JSON.parse(raw);
    if (j && j.app === 'uno-party' && typeof j.code === 'string' && typeof j.protocol === 'string') return j as RoomBeacon;
  } catch (_) {}
  return null;
}

/** Ask one address whether an UNO PARTY room is hosted there. */
export function probeHost(connect: ConnectFn, host: string, port: number, timeoutMs = 600): Promise<DiscoveredRoom | null> {
  return new Promise(resolve => {
    let done = false;
    let sock: ClientSocket | null = null;
    let buf: Uint8Array = new Uint8Array(0);
    const finish = (room: DiscoveredRoom | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock?.destroy(); } catch (_) {}
      resolve(room);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const evaluate = () => {
      const text = utf8Decode(buf);
      const split = text.indexOf('\r\n\r\n');
      if (split < 0) return;
      if (!text.startsWith('HTTP/1.1 200')) return finish(null);
      const body = text.slice(split + 4);
      const m = /content-length:\s*(\d+)/i.exec(text.slice(0, split));
      if (m && utf8Encode(body).length < Number(m[1])) return; // body incomplete
      const beacon = parseBeacon(body);
      finish(beacon ? { ...beacon, hostAddress: host, port, lastSeen: Date.now() } : null);
    };
    try {
      sock = connect(host, port, () => {
        try { sock?.write(utf8Encode(`GET /uno-info HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`)); } catch (_) { finish(null); }
      });
      sock.on('data', (d: unknown) => { buf = concatBytes(buf, toBytes(d)); if (buf.length > 16384) finish(null); else evaluate(); });
      sock.on('error', () => finish(null));
      sock.on('close', () => { evaluate(); finish(null); });
    } catch (_) {
      finish(null);
    }
  });
}

export interface ScanOptions {
  port?: number;
  concurrency?: number;
  timeoutMs?: number;
  /** Called as soon as a room is found so the UI can show it immediately. */
  onFound?: (room: DiscoveredRoom) => void;
  isCancelled?: () => boolean;
}

export async function scanSubnet(connect: ConnectFn, localIp: string, opts: ScanOptions = {}): Promise<DiscoveredRoom[]> {
  const port = opts.port ?? DEFAULT_WLAN_PORT;
  const queue = subnetCandidates(localIp);
  const found: DiscoveredRoom[] = [];
  const workers = Array.from({ length: opts.concurrency ?? 48 }, async () => {
    while (queue.length && !opts.isCancelled?.()) {
      const host = queue.shift()!;
      const room = await probeHost(connect, host, port, opts.timeoutMs ?? 600);
      if (room) { found.push(room); opts.onFound?.(room); }
    }
  });
  await Promise.all(workers);
  return found;
}
