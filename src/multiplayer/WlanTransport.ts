import {
  MultiplayerTransport, ConnectionStatus, RoomPlayer, GameCommand, GameEvent, NearbyWlanRoom, MultiplayerRoom,
} from './types';
import { devWarn } from '../services/ErrorMapper';
import { MPDiagnostics } from '../services/MultiplayerDiagnosticsService';
import { WsServer, WsConnection } from './wlan/WsServer';
import {
  DEFAULT_WLAN_PORT, WLAN_PROTOCOL, RoomBeacon, DiscoveredRoom, scanSubnet, probeHost, isValidIpv4,
} from './wlan/LanDiscovery';
import { WlanPlatform, WebSocketLike, defaultWlanPlatform } from './wlan/platform';
import { GUEST_COMMAND_TYPES, sanitizeEventFor } from './wlan/sanitize';

export { DEFAULT_WLAN_PORT };

const JOIN_TIMEOUT_MS = 6000;
const GUEST_PING_MS = 4000;
const HOST_SILENCE_MS = 14000;
const RECONNECT_WINDOW_MS = 30000;
/** How long the host keeps a dropped player's seat during a running match. */
export const DISCONNECT_GRACE_MS = 30000;

export interface HostSnapshot {
  hostId: string;
  rules: MultiplayerRoom['rules'];
  maxPlayers: number;
  status: MultiplayerRoom['status'];
  players: RoomPlayer[];
}

interface GuestSeat {
  player: RoomPlayer;
  connId: string | null;
  token: string;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

const randomToken = () =>
  Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('');

const clip = (v: unknown, max: number, fallback: string) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;

export class WlanTransport implements MultiplayerTransport {
  private platform: WlanPlatform;
  private status: ConnectionStatus = 'DISCONNECTED';
  private eventListeners = new Set<(e: any) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private roomCode = '';
  private localPlayer: RoomPlayer | null = null;
  private isHost = false;

  // host
  private server: WsServer | null = null;
  private seats = new Map<string, GuestSeat>();
  private connToPlayer = new Map<string, string>();
  private advertised: NearbyWlanRoom | null = null;
  private roomStatus: 'WAITING' | 'PLAYING' = 'WAITING';
  private hostSnapshot: (() => HostSnapshot) | null = null;

  // guest
  private ws: WebSocketLike | null = null;
  private joinOpts: { hostAddress: string; port: number } | null = null;
  private token = '';
  private intentionalClose = false;
  private lastHostMsg = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnecting = false;

  // discovery
  private discovered = new Map<string, DiscoveredRoom>();

  private scanPort: number;

  constructor(platform: WlanPlatform = defaultWlanPlatform, opts: { port?: number } = {}) {
    this.platform = platform;
    this.scanPort = opts.port ?? DEFAULT_WLAN_PORT;
  }

  // ───────────────────────── host API ─────────────────────────

  /** Session gives the host transport read access to the authoritative room (for join validation). */
  setHostSnapshotProvider(fn: () => HostSnapshot): void {
    this.hostSnapshot = fn;
  }

  setRoomStatus(status: 'WAITING' | 'PLAYING'): void {
    this.roomStatus = status;
  }

  private beacon(): RoomBeacon | null {
    if (!this.advertised) return null;
    const snap = this.hostSnapshot?.();
    return {
      app: 'uno-party',
      protocol: WLAN_PROTOCOL,
      code: this.advertised.code,
      hostName: this.advertised.hostName,
      hostPlayerId: this.advertised.hostPlayerId,
      playerCount: snap ? snap.players.length : this.advertised.playerCount,
      maxPlayers: snap ? snap.maxPlayers : this.advertised.maxPlayers,
      deckType: snap?.rules.deckType || this.advertised.deckType,
      status: this.roomStatus,
    };
  }

  async startAdvertising(info: NearbyWlanRoom): Promise<void> {
    const code = info.code.toUpperCase().trim();
    this.advertised = { ...info, code, port: info.port || DEFAULT_WLAN_PORT };
    if (this.server) return; // already listening; beacon is read live
    const port = this.advertised.port!;
    const server = new WsServer({
      createServer: () => this.platform.createServer(),
      getInfo: () => this.beacon(),
    });
    server.onConnection = conn => this.onGuestConnection(conn);
    await server.listen(port);
    this.server = server;
    const ip = await this.platform.getLocalIp();
    this.advertised.hostAddress = ip || undefined;
    MPDiagnostics.logWlanHost(ip, port, code);
  }

  async stopAdvertising(): Promise<void> {
    this.advertised = null;
    const server = this.server;
    this.server = null;
    if (server) {
      server.broadcast(JSON.stringify({ type: 'ROOM_CLOSED', reason: 'HOST_CLOSED' }));
      await server.close();
    }
    for (const seat of this.seats.values()) if (seat.graceTimer) clearTimeout(seat.graceTimer);
    this.seats.clear();
    this.connToPlayer.clear();
  }

  private onGuestConnection(conn: WsConnection): void {
    conn.onMessage = text => {
      let msg: any;
      try { msg = JSON.parse(text); } catch (_) { return; }
      if (!msg || typeof msg !== 'object') return;
      this.handleGuestMessage(conn, msg);
    };
    conn.onClose = () => this.handleGuestClosed(conn);
  }

  private reject(conn: WsConnection, roomId: string, reason: string): void {
    conn.send(JSON.stringify({ type: 'ROOM_JOIN_REJECTED', roomId, reason }));
    setTimeout(() => conn.close(1000), 50);
  }

  private handleGuestMessage(conn: WsConnection, msg: any): void {
    const boundId = this.connToPlayer.get(conn.id);

    if (msg.type === 'JOIN_ROOM') {
      if (boundId) return; // already joined on this connection
      this.handleJoin(conn, msg);
      return;
    }
    if (!boundId) return; // everything else requires a completed join

    switch (msg.type) {
      case 'PING':
        conn.send(JSON.stringify({ type: 'PONG', roomId: this.roomCode, senderPlayerId: this.localPlayer?.id, timestamp: msg.timestamp }));
        return;
      case 'LEAVE':
        this.removeSeat(boundId, true);
        return;
      case 'COMMAND': {
        const cmd = msg.command;
        if (!cmd || typeof cmd !== 'object' || !GUEST_COMMAND_TYPES.has(cmd.type)) return;
        // Identity is the connection, never the payload.
        const bound = { ...cmd, playerId: boundId };
        if ('senderPlayerId' in cmd) bound.senderPlayerId = boundId;
        this.notify(bound);
        return;
      }
      case 'EVENT': {
        const ev = msg.event;
        if (!ev || typeof ev !== 'object') return;
        if (ev.type === 'PLAYER_READY') {
          const e = { type: 'PLAYER_READY', playerId: boundId, isReady: Boolean(ev.isReady) };
          this.notify(e);
          this.sendToGuests(e, boundId);
        }
        return;
      }
    }
  }

  private handleJoin(conn: WsConnection, msg: any): void {
    const roomId = String(msg.roomId || '').toUpperCase().trim();
    MPDiagnostics.logJoinReceived(roomId, String(msg.playerId), String(msg.deviceId || ''));
    if (roomId !== this.roomCode) return this.reject(conn, roomId, 'ROOM_CODE_MISMATCH');
    if (msg.protocol !== WLAN_PROTOCOL) return this.reject(conn, roomId, 'PROTOCOL_MISMATCH');
    const playerId = clip(msg.playerId, 64, '');
    if (!playerId || playerId === this.localPlayer?.id) return this.reject(conn, roomId, 'INVALID_PLAYER');

    const snap = this.hostSnapshot?.();
    const seat = this.seats.get(playerId);
    let reconnect = false;

    if (seat) {
      if (!msg.token || msg.token !== seat.token) return this.reject(conn, roomId, 'PLAYER_ID_IN_USE');
      reconnect = true;
      if (seat.connId) {
        // Replace a half-dead old connection (guest switched network, etc.).
        this.connToPlayer.delete(seat.connId);
        this.server?.getConnection(seat.connId)?.close(1000);
      }
      if (seat.graceTimer) { clearTimeout(seat.graceTimer); seat.graceTimer = null; }
    } else {
      if (snap && snap.status !== 'WAITING') return this.reject(conn, roomId, 'MATCH_STARTED');
      if (this.roomStatus !== 'WAITING') return this.reject(conn, roomId, 'MATCH_STARTED');
      if (snap && snap.players.length >= snap.maxPlayers) return this.reject(conn, roomId, 'ROOM_FULL');
    }

    const player: RoomPlayer = seat?.player ?? {
      id: playerId,
      name: clip(msg.displayName, 24, 'Player'),
      avatar: clip(msg.avatar, 8, '🙂'),
      isHost: false,
      isReady: false,
      isConnected: true,
      cardCount: 0,
      deviceId: clip(msg.deviceId, 64, ''),
      controller: 'REMOTE_HUMAN',
    };
    player.isConnected = true;
    const token = seat?.token ?? randomToken();
    this.seats.set(playerId, { player, connId: conn.id, token, graceTimer: null });
    this.connToPlayer.set(conn.id, playerId);

    const known = snap?.players ?? [this.localPlayer!];
    const members = known.some(p => p.id === playerId) ? known : [...known, player];
    conn.send(JSON.stringify({
      type: 'ROOM_JOIN_ACCEPTED',
      roomId: this.roomCode,
      playerId,
      token,
      members,
      hostId: snap?.hostId ?? this.localPlayer?.id,
      rules: snap?.rules,
      maxPlayers: snap?.maxPlayers,
      status: snap?.status ?? 'WAITING',
      reconnect,
    }));
    MPDiagnostics.logJoinAccepted(this.roomCode, playerId, members);

    this.notify(reconnect
      ? { type: 'PLAYER_RECONNECTED', playerId }
      : { type: 'PLAYER_JOINED', player: { ...player } });
  }

  private handleGuestClosed(conn: WsConnection): void {
    const playerId = this.connToPlayer.get(conn.id);
    this.connToPlayer.delete(conn.id);
    if (!playerId) return;
    const seat = this.seats.get(playerId);
    if (!seat || seat.connId !== conn.id) return; // superseded by a reconnect
    seat.connId = null;
    seat.player.isConnected = false;
    const grace = this.roomStatus === 'PLAYING' ? DISCONNECT_GRACE_MS : 0;
    if (grace === 0) { this.removeSeat(playerId, true); return; }
    const ev = { type: 'PLAYER_DISCONNECTED', playerId, graceMs: grace };
    this.notify(ev);
    this.sendToGuests(ev);
    seat.graceTimer = setTimeout(() => this.removeSeat(playerId, true), grace);
  }

  private removeSeat(playerId: string, announce: boolean): void {
    const seat = this.seats.get(playerId);
    if (!seat) return;
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    this.seats.delete(playerId);
    if (seat.connId) {
      this.connToPlayer.delete(seat.connId);
      this.server?.getConnection(seat.connId)?.close(1000);
    }
    if (!announce) return;
    const ev = { type: 'PLAYER_LEFT', playerId };
    this.notify(ev);
    this.sendToGuests(ev);
  }

  private sendToGuests(event: any, exceptPlayerId?: string): void {
    for (const [pid, seat] of this.seats) {
      if (pid === exceptPlayerId || !seat.connId) continue;
      const out = sanitizeEventFor(event, pid);
      if (out) this.server?.getConnection(seat.connId)?.send(JSON.stringify({ type: 'EVENT', event: out }));
    }
  }

  // ───────────────────────── discovery ─────────────────────────

  async scanNearbyRooms(): Promise<NearbyWlanRoom[]> {
    const ip = await this.platform.getLocalIp();
    MPDiagnostics.logDiscoveryStart('WLAN');
    const rooms: DiscoveredRoom[] = ip
      ? await scanSubnet(this.platform.connect, ip, { port: this.scanPort, onFound: r => this.discovered.set(r.code, r) })
      : [];
    const own = this.advertised?.code;
    const unique = new Map<string, DiscoveredRoom>();
    for (const r of rooms) if (!unique.has(r.code)) unique.set(r.code, r);
    return Array.from(unique.values()).filter(r => r.code !== own && r.protocol === WLAN_PROTOCOL).map(r => ({
      code: r.code,
      hostName: r.hostName,
      hostPlayerId: r.hostPlayerId,
      playerCount: r.playerCount,
      maxPlayers: r.maxPlayers,
      deckType: r.deckType,
      status: r.status,
      hostAddress: r.hostAddress,
      port: r.port,
      lastSeen: r.lastSeen,
    }));
  }

  /** Kept for API compatibility: discovery is on-demand (a subnet sweep), nothing runs in the background. */
  startBackgroundDiscovery(): void {}

  async getLocalIpAddress(): Promise<string> {
    return this.platform.getLocalIp();
  }

  // ───────────────────────── guest side ─────────────────────────

  async connect(
    roomCode: string,
    player: RoomPlayer,
    options?: { hostAddress?: string; port?: number; deviceId?: string }
  ): Promise<boolean> {
    const code = roomCode.toUpperCase().trim();
    this.roomCode = code;
    this.localPlayer = player;
    this.isHost = Boolean(player.isHost);
    this.intentionalClose = false;
    this.setStatus('CONNECTING');

    if (this.isHost) {
      this.setStatus('CONNECTED');
      return true;
    }

    let host = options?.hostAddress;
    let port = options?.port || DEFAULT_WLAN_PORT;
    if (!host) {
      const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/.exec(code);
      if (m && isValidIpv4(m[1])) {
        // Typed an IP: ask that host which room it runs.
        const room = await probeHost(this.platform.connect, m[1], m[2] ? Number(m[2]) : port, 1500);
        if (room) { host = room.hostAddress; port = room.port; this.roomCode = room.code; }
      } else {
        const cached = this.discovered.get(code);
        if (cached) { host = cached.hostAddress; port = cached.port; }
        else {
          const found = (await this.scanNearbyRooms()).find(r => r.code === code);
          if (found?.hostAddress) { host = found.hostAddress; port = found.port || port; }
        }
      }
    }
    if (!host) {
      MPDiagnostics.logConnectFailure('WLAN', code, 'HOST_NOT_RESOLVED_ON_LAN', 'HOST_NOT_FOUND');
      this.setStatus('DISCONNECTED');
      return false;
    }
    this.joinOpts = { hostAddress: host, port };
    MPDiagnostics.logConnectStart('WLAN', this.roomCode, host, port);
    const ok = await this.openAndJoin(options?.deviceId);
    this.setStatus(ok ? 'CONNECTED' : 'DISCONNECTED');
    if (ok) this.startGuestHeartbeat();
    return ok;
  }

  private openAndJoin(deviceId?: string): Promise<boolean> {
    const { hostAddress, port } = this.joinOpts!;
    const player = this.localPlayer!;
    return new Promise(resolve => {
      let settled = false;
      let ws: WebSocketLike;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!ok) { try { ws?.close(); } catch (_) {} if (this.ws === ws) this.ws = null; }
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), JOIN_TIMEOUT_MS);
      try {
        ws = this.platform.createWebSocket(`ws://${hostAddress}:${port}`);
      } catch (_) { clearTimeout(timer); resolve(false); return; }
      this.ws = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'JOIN_ROOM',
          protocol: WLAN_PROTOCOL,
          roomId: this.roomCode,
          playerId: player.id,
          displayName: player.name,
          avatar: player.avatar,
          deviceId: deviceId || player.deviceId || '',
          token: this.token || undefined,
        }));
      };
      ws.onmessage = e => {
        let data: any;
        try { data = JSON.parse(e.data); } catch (_) { return; }
        this.lastHostMsg = Date.now();
        if (!settled) {
          if (data.type === 'ROOM_JOIN_ACCEPTED') {
            this.token = data.token || '';
            this.acceptedInfo = data;
            this.notify({ ...data });
            finish(true);
          } else if (data.type === 'ROOM_JOIN_REJECTED') {
            this.lastRejectReason = data.reason || 'REJECTED';
            MPDiagnostics.logJoinRejected(this.roomCode, player.id, this.lastRejectReason);
            finish(false);
          }
          return;
        }
        this.handleHostMessage(data);
      };
      ws.onerror = () => finish(false);
      ws.onclose = () => {
        finish(false);
        if (this.ws === ws) this.onGuestSocketLost();
      };
    });
  }

  lastRejectReason = '';
  /** The host's last ROOM_JOIN_ACCEPTED payload (the join completes before the session has a room object). */
  acceptedInfo: any = null;

  private handleHostMessage(data: any): void {
    switch (data.type) {
      case 'EVENT':
        if (data.event) this.notify(data.event);
        return;
      case 'PING':
        this.ws?.send(JSON.stringify({ type: 'PONG', timestamp: data.timestamp }));
        return;
      case 'PONG':
        MPDiagnostics.recordPongReceived();
        return;
      case 'ROOM_CLOSED':
        this.intentionalClose = true; // host is gone for good: don't try to reconnect
        this.notify({ type: 'ROOM_CLOSED', reason: data.reason || 'HOST_CLOSED' });
        return;
      case 'ROOM_JOIN_ACCEPTED':
        this.notify({ ...data });
        return;
    }
  }

  private startGuestHeartbeat(): void {
    this.stopGuestHeartbeat();
    this.lastHostMsg = Date.now();
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== 1) return;
      if (Date.now() - this.lastHostMsg > HOST_SILENCE_MS) {
        try { this.ws.close(); } catch (_) {}
        this.onGuestSocketLost();
        return;
      }
      try { this.ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() })); } catch (_) {}
    }, GUEST_PING_MS);
  }

  private stopGuestHeartbeat(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private onGuestSocketLost(): void {
    if (this.intentionalClose || this.reconnecting || this.isHost) {
      if (this.intentionalClose) this.setStatus('DISCONNECTED');
      return;
    }
    this.ws = null;
    this.reconnecting = true;
    this.setStatus('RECONNECTING');
    const startedAt = Date.now();
    const attempt = async () => {
      while (!this.intentionalClose && Date.now() - startedAt < RECONNECT_WINDOW_MS) {
        const ok = await this.openAndJoin();
        if (ok) {
          this.reconnecting = false;
          this.startGuestHeartbeat();
          this.setStatus('CONNECTED');
          return;
        }
        if (this.lastRejectReason === 'PLAYER_ID_IN_USE' || this.lastRejectReason === 'MATCH_STARTED') break;
        await new Promise(r => setTimeout(r, 1500));
      }
      this.reconnecting = false;
      this.stopGuestHeartbeat();
      this.setStatus('DISCONNECTED');
      this.notify({ type: 'ROOM_CLOSED', reason: 'HOST_UNREACHABLE' });
    };
    attempt();
  }

  async disconnect(): Promise<void> {
    this.intentionalClose = true;
    this.stopGuestHeartbeat();
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'LEAVE' })); } catch (_) {}
      try { ws.close(); } catch (_) {}
    }
    await this.stopAdvertising();
    this.setStatus('DISCONNECTED');
  }

  // ───────────────────────── messaging ─────────────────────────

  async sendCommand(command: GameCommand): Promise<void> {
    if (this.isHost) { this.notify(command); return; }
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'COMMAND', command }));
    }
  }

  async broadcastEvent(event: GameEvent): Promise<void> {
    if (this.isHost) {
      this.sendToGuests(event);
      this.notify(event);
    } else if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'EVENT', event }));
    }
  }

  /** Host only: drop a guest (e.g. after a forfeit decision). */
  kick(playerId: string): void {
    this.removeSeat(playerId, false);
  }

  async sendPing(): Promise<void> {
    if (!this.localPlayer) return;
    MPDiagnostics.startPingMeasurement();
    if (this.isHost) {
      this.sendToGuests({ type: 'PING', roomId: this.roomCode, senderPlayerId: this.localPlayer.id, timestamp: Date.now() });
    } else if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
    }
  }

  async sendTestState(revision: number, testValue = 'HELLO'): Promise<void> {
    if (!this.localPlayer) return;
    const payload = { type: 'TEST_STATE', roomId: this.roomCode, revision, currentPlayerId: this.localPlayer.id, testValue };
    if (this.isHost) { this.sendToGuests(payload); this.notify(payload); }
    else await this.sendCommand({ ...payload, commandId: 'ts_' + Date.now() } as any);
  }

  // ───────────────────────── listeners ─────────────────────────

  onEvent(cb: (e: any) => void): () => void {
    this.eventListeners.add(cb);
    return () => { this.eventListeners.delete(cb); };
  }

  onConnectionChange(cb: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => { this.statusListeners.delete(cb); };
  }

  getConnectionStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(s: ConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach(fn => fn(s));
  }

  private notify(event: any): void {
    this.eventListeners.forEach(fn => {
      try { fn(event); } catch (err) { devWarn('WlanTransport', 'Event handler error:', err); }
    });
  }
}
