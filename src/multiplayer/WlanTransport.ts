import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import {
  MultiplayerTransport,
  ConnectionStatus,
  RoomPlayer,
  GameCommand,
  GameEvent,
  NearbyWlanRoom,
} from './types';
import { devWarn } from '../services/ErrorMapper';
import { MPDiagnostics } from '../services/MultiplayerDiagnosticsService';

const BEACON_TTL_MS = 8000;
const DEFAULT_WLAN_PORT = 8088;

// Shared LAN registry for local simulation / loopback / processes on same machine
const GLOBAL_LAN_REGISTRY = new Map<string, { room: NearbyWlanRoom; timestamp: number }>();

export class WlanTransport implements MultiplayerTransport {
  private socket: WebSocket | null = null;
  private connectionStatus: ConnectionStatus = 'DISCONNECTED';
  private eventListeners: Set<(event: GameEvent | any) => void> = new Set();
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private roomCode: string = '';
  private localPlayer: RoomPlayer | null = null;
  private isHost: boolean = false;
  private connectedPeers: Map<string, RoomPlayer> = new Map();
  private advertisedRoom: NearbyWlanRoom | null = null;
  private beaconInterval: any = null;
  private nativeSubscriptions: any[] = [];
  private discoveredRemoteRooms: Map<string, NearbyWlanRoom> = new Map();

  constructor() {
    this.initNativeListener();
  }

  private initNativeListener() {
    try {
      const nativeMod = NativeModules.WlanNativeModule;
      if (nativeMod && Platform.OS === 'android') {
        const emitter = new NativeEventEmitter(nativeMod);

        // Discovery listener
        const subDiscovery = emitter.addListener('onWlanRoomDiscovered', (data: string) => {
          try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            if (parsed && parsed.code) {
              const nearby: NearbyWlanRoom = {
                code: parsed.code.toUpperCase(),
                hostName: parsed.hostName || 'HOST',
                hostPlayerId: parsed.hostPlayerId,
                playerCount: parsed.playerCount || 1,
                maxPlayers: parsed.maxPlayers || 10,
                deckType: parsed.deckType || 'NORMAL',
                status: parsed.status || 'WAITING',
                hostAddress: parsed.hostAddress,
                port: parsed.port || DEFAULT_WLAN_PORT,
                lastSeen: Date.now(),
              };
              this.discoveredRemoteRooms.set(nearby.code, nearby);
              MPDiagnostics.logDiscovery(nearby.code, nearby.hostPlayerId || 'HOST', nearby.hostAddress || 'N/A', nearby.port || DEFAULT_WLAN_PORT);
            }
          } catch (_) {}
        });
        this.nativeSubscriptions.push(subDiscovery);

        // Host WebSocket Server Incoming Messages
        const subServerMsg = emitter.addListener('onWlanServerMessage', (data: string) => {
          try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            const clientId = parsed.clientId;
            const msg = typeof parsed.message === 'string' ? JSON.parse(parsed.message) : parsed.message;

            this.handleHostIncomingMessage(clientId, msg);
          } catch (e) {
            devWarn('WlanTransport', 'Host server message parse error:', e);
          }
        });
        this.nativeSubscriptions.push(subServerMsg);

        // Host WebSocket Client Connection lifecycle
        const subClientConn = emitter.addListener('onWlanServerClientConnected', (data: string) => {
          try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            if (__DEV__) {
              console.log(`[WLAN_SERVER_CLIENT_CONNECTED] id=${parsed.clientId} addr=${parsed.address}`);
            }
          } catch (_) {}
        });
        this.nativeSubscriptions.push(subClientConn);

        const subClientDisconn = emitter.addListener('onWlanServerClientDisconnected', (data: string) => {
          try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            if (__DEV__) {
              console.log(`[WLAN_SERVER_CLIENT_DISCONNECTED] id=${parsed.clientId}`);
            }
          } catch (_) {}
        });
        this.nativeSubscriptions.push(subClientDisconn);
      }
    } catch (_) {}
  }

  private async handleHostIncomingMessage(clientId: string, msg: any) {
    if (!this.isHost || !msg) return;

    if (msg.type === 'JOIN_ROOM') {
      MPDiagnostics.logJoinReceived(msg.roomId, msg.playerId, msg.deviceId || '');

      if (msg.roomId !== this.roomCode) {
        MPDiagnostics.logJoinRejected(msg.roomId, msg.playerId, 'ROOM_CODE_MISMATCH');
        this.sendToNativeClient(clientId, {
          type: 'ROOM_JOIN_REJECTED',
          roomId: msg.roomId,
          reason: 'ROOM_CODE_MISMATCH',
        });
        return;
      }

      // Add joined peer
      const joinedPeer: RoomPlayer = {
        id: msg.playerId,
        name: msg.displayName || 'Player',
        avatar: msg.avatar || '👦🏻',
        isHost: false,
        isReady: false,
        isConnected: true,
        cardCount: 7,
        deviceId: msg.deviceId,
        controller: 'REMOTE_HUMAN',
      };
      this.connectedPeers.set(msg.playerId, joinedPeer);

      const allMembers = [this.localPlayer!, ...Array.from(this.connectedPeers.values())];
      MPDiagnostics.logJoinAccepted(this.roomCode, msg.playerId, allMembers);

      // Respond with JOIN_ACCEPTED
      this.sendToNativeClient(clientId, {
        type: 'ROOM_JOIN_ACCEPTED',
        roomId: this.roomCode,
        playerId: msg.playerId,
        members: allMembers,
      });

      // Notify host's MultiplayerSession
      this.notifyEvent({
        type: 'PLAYER_JOINED',
        player: joinedPeer,
      });

      // Broadcast updated member state
      this.broadcastToNativeClients({
        type: 'EVENT',
        event: {
          type: 'PLAYER_JOINED',
          player: joinedPeer,
        },
      });
      return;
    }

    if (msg.type === 'PING') {
      MPDiagnostics.logCommandReceived(this.roomCode, msg.senderPlayerId, 'ping', 'PING');
      MPDiagnostics.logWlanPingRx(msg.senderPlayerId, this.localPlayer?.id || 'HOST');
      // Respond with PONG
      MPDiagnostics.logWlanPongTx(this.localPlayer?.id || 'HOST', msg.senderPlayerId);
      this.sendToNativeClient(clientId, {
        type: 'PONG',
        roomId: this.roomCode,
        senderPlayerId: this.localPlayer?.id || 'HOST',
        timestamp: msg.timestamp,
      });
      return;
    }

    if (msg.type === 'PONG') {
      MPDiagnostics.recordPongReceived();
      MPDiagnostics.logCommandReceived(this.roomCode, msg.senderPlayerId, 'pong', 'PONG');
      MPDiagnostics.logWlanPongRx(msg.senderPlayerId, this.localPlayer?.id || 'HOST');
      return;
    }

    if (msg.type === 'COMMAND') {
      const cmd = msg.command;
      if (cmd) {
        MPDiagnostics.logCommandReceived(this.roomCode, cmd.playerId, cmd.commandId, cmd.type);
        this.notifyEvent(cmd);
      }
      return;
    }

    if (msg.type === 'TEST_STATE') {
      MPDiagnostics.logStateReceived(this.roomCode, msg.revision);
      this.notifyEvent(msg);
      return;
    }
  }

  private sendToNativeClient(clientId: string, data: any) {
    try {
      const nativeMod = NativeModules.WlanNativeModule;
      if (nativeMod && nativeMod.sendToClient) {
        nativeMod.sendToClient(clientId, JSON.stringify(data));
      }
    } catch (e) {
      devWarn('WlanTransport', 'sendToNativeClient error:', e);
    }
  }

  private broadcastToNativeClients(data: any) {
    try {
      const nativeMod = NativeModules.WlanNativeModule;
      if (nativeMod && nativeMod.broadcastMessage) {
        nativeMod.broadcastMessage(JSON.stringify(data));
      }
    } catch (e) {
      devWarn('WlanTransport', 'broadcastToNativeClients error:', e);
    }
  }

  async startAdvertising(roomInfo: NearbyWlanRoom): Promise<void> {
    const code = roomInfo.code.toUpperCase().trim();
    this.advertisedRoom = {
      ...roomInfo,
      code,
      lastSeen: Date.now(),
      port: roomInfo.port || DEFAULT_WLAN_PORT,
    };

    MPDiagnostics.logCreate('WLAN', code, roomInfo.hostPlayerId || 'HOST', '');

    // 1. Register in local process registry
    GLOBAL_LAN_REGISTRY.set(code, {
      room: this.advertisedRoom,
      timestamp: Date.now(),
    });

    // 2. Start Native Android UDP broadcast and RFC 6455 WebSocket Server
    try {
      const nativeMod = NativeModules.WlanNativeModule;
      if (nativeMod) {
        // Start TCP/WebSocket Game Server
        if (nativeMod.startServer) {
          await nativeMod.startServer(DEFAULT_WLAN_PORT);
        }
        // Start UDP beacon broadcasting
        if (nativeMod.startAdvertising) {
          await nativeMod.startAdvertising(JSON.stringify(this.advertisedRoom));
        }
      }
    } catch (e) {
      devWarn('WlanTransport', 'Native advertising start notice:', e);
    }

    // 3. Periodic LAN heartbeat
    if (this.beaconInterval) clearInterval(this.beaconInterval);
    this.beaconInterval = setInterval(() => {
      if (this.advertisedRoom) {
        GLOBAL_LAN_REGISTRY.set(this.advertisedRoom.code, {
          room: this.advertisedRoom,
          timestamp: Date.now(),
        });
      }
    }, 2000);
  }

  async stopAdvertising(): Promise<void> {
    if (this.beaconInterval) {
      clearInterval(this.beaconInterval);
      this.beaconInterval = null;
    }
    if (this.advertisedRoom) {
      GLOBAL_LAN_REGISTRY.delete(this.advertisedRoom.code);
      this.advertisedRoom = null;
    }
    try {
      const nativeMod = NativeModules.WlanNativeModule;
      if (nativeMod) {
        if (nativeMod.stopAdvertising) await nativeMod.stopAdvertising();
        if (nativeMod.stopServer) await nativeMod.stopServer();
      }
    } catch (_) {}
  }

  async scanNearbyRooms(): Promise<NearbyWlanRoom[]> {
    const now = Date.now();
    const result: NearbyWlanRoom[] = [];
    const seenCodes = new Set<string>();

    MPDiagnostics.logDiscoveryStart('WLAN');

    // 1. Check Native Android discovery results
    try {
      const nativeMod = NativeModules.WlanNativeModule;
      if (nativeMod && nativeMod.startDiscovery) {
        nativeMod.startDiscovery().catch(() => {});
      }
      if (nativeMod && nativeMod.getDiscoveredRooms) {
        const nativeList: string[] = await nativeMod.getDiscoveredRooms();
        if (Array.isArray(nativeList)) {
          for (const raw of nativeList) {
            try {
              const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
              if (r && r.code) {
                const code = r.code.toUpperCase();
                seenCodes.add(code);
                result.push({
                  code,
                  hostName: r.hostName || 'HOST',
                  hostPlayerId: r.hostPlayerId,
                  playerCount: r.playerCount || 1,
                  maxPlayers: r.maxPlayers || 10,
                  deckType: r.deckType || 'NORMAL',
                  status: r.status || 'WAITING',
                  hostAddress: r.hostAddress,
                  port: r.port || DEFAULT_WLAN_PORT,
                  lastSeen: now,
                });
              }
            } catch (_) {}
          }
        }
      }
    } catch (_) {}

    // 2. Check cached listener discovered rooms
    for (const [code, r] of this.discoveredRemoteRooms.entries()) {
      if (now - (r.lastSeen || 0) < BEACON_TTL_MS) {
        if (!seenCodes.has(code)) {
          seenCodes.add(code);
          result.push(r);
        }
      } else {
        this.discoveredRemoteRooms.delete(code);
      }
    }

    // 3. Check shared local registry (for simulator / testing / processes on same machine)
    for (const [code, entry] of GLOBAL_LAN_REGISTRY.entries()) {
      if (now - entry.timestamp <= BEACON_TTL_MS) {
        if (!seenCodes.has(code)) {
          seenCodes.add(code);
          result.push(entry.room);
        }
      } else {
        GLOBAL_LAN_REGISTRY.delete(code);
      }
    }

    // Exclude this device's own advertised room from nearby remote rooms
    const remoteRooms = result.filter(r => !this.advertisedRoom || r.code !== this.advertisedRoom.code);

    return remoteRooms;
  }

  async connect(
    roomCode: string,
    player: RoomPlayer,
    options?: { hostAddress?: string; port?: number; deviceId?: string }
  ): Promise<boolean> {
    const formattedCode = roomCode.toUpperCase().trim();
    this.roomCode = formattedCode;
    this.localPlayer = player;
    this.isHost = Boolean(player.isHost);
    this.setConnectionStatus('CONNECTING');

    MPDiagnostics.logTransportStart('WLAN', 'CONNECTING');

    if (this.isHost) {
      // Host owns authoritative local game session & WebSocket Server
      this.connectedPeers.set(player.id, player);
      this.setConnectionStatus('CONNECTED');
      MPDiagnostics.logConnectSuccess('WLAN', formattedCode, 'WLAN_HOST_SERVER');
      return true;
    }

    // Client Connecting Flow (Device B)
    MPDiagnostics.logConnectStart('WLAN', formattedCode, options?.hostAddress, options?.port);

    // Resolve target host address
    let targetAddress = options?.hostAddress;
    let targetPort = options?.port || DEFAULT_WLAN_PORT;

    if (!targetAddress) {
      const nearbyRooms = await this.scanNearbyRooms();
      const targetRoom = nearbyRooms.find(r => r.code === formattedCode);
      if (targetRoom && targetRoom.hostAddress) {
        targetAddress = targetRoom.hostAddress;
        targetPort = targetRoom.port || DEFAULT_WLAN_PORT;
      } else if (formattedCode.includes(':')) {
        const parts = formattedCode.split(':');
        targetAddress = parts[0];
        targetPort = parseInt(parts[1], 10) || DEFAULT_WLAN_PORT;
      } else {
        const localEntry = GLOBAL_LAN_REGISTRY.get(formattedCode);
        if (localEntry && localEntry.room.hostAddress) {
          targetAddress = localEntry.room.hostAddress;
          targetPort = localEntry.room.port || DEFAULT_WLAN_PORT;
        }
      }
    }

    // Phase 16: If host cannot be found on network, fail definitively (DO NOT CONNECT TO 127.0.0.1)
    if (!targetAddress || targetAddress === '127.0.0.1') {
      devWarn('WlanTransport', `Host for WLAN room ${formattedCode} could not be resolved on local network.`);
      this.setConnectionStatus('DISCONNECTED');
      MPDiagnostics.logConnectFailure('WLAN', formattedCode, 'HOST_NOT_RESOLVED_ON_LAN', 'HOST_NOT_FOUND');
      return false;
    }

    const targetUrl = `ws://${targetAddress}:${targetPort}`;

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const finish = (success: boolean) => {
        if (resolved) return;
        resolved = true;
        if (success) {
          this.setConnectionStatus('CONNECTED');
          MPDiagnostics.logConnectSuccess('WLAN', formattedCode, targetUrl);
        } else {
          this.setConnectionStatus('DISCONNECTED');
          MPDiagnostics.logConnectFailure('WLAN', formattedCode, 'CONNECTION_FAILED', 'CONN_ERR');
        }
        resolve(success);
      };

      try {
        this.socket = new WebSocket(targetUrl);

        const connectionTimeout = setTimeout(() => {
          if (!resolved) {
            devWarn('WlanTransport', `Connection timeout to ${targetUrl}`);
            try { this.socket?.close(); } catch (_) {}
            finish(false);
          }
        }, 6000);

        this.socket.onopen = () => {
          clearTimeout(connectionTimeout);

          // Phase 13: Send JOIN_ROOM handshake
          const joinPayload = {
            type: 'JOIN_ROOM',
            roomId: formattedCode,
            playerId: player.id,
            displayName: player.name,
            avatar: player.avatar,
            deviceId: options?.deviceId || player.deviceId || '',
          };
          MPDiagnostics.logJoinSend(formattedCode, player.id, joinPayload.deviceId);
          this.socket?.send(JSON.stringify(joinPayload));
        };

        this.socket.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'ROOM_JOIN_ACCEPTED') {
              MPDiagnostics.logJoinAccepted(formattedCode, player.id, data.members || []);
              if (data.members) {
                this.notifyEvent({
                  type: 'ROOM_JOIN_ACCEPTED',
                  members: data.members,
                  roomId: formattedCode,
                  playerId: player.id,
                });
              }
              finish(true);
            } else if (data.type === 'ROOM_JOIN_REJECTED') {
              devWarn('WlanTransport', 'Host rejected room join:', data.reason);
              MPDiagnostics.logJoinRejected(formattedCode, player.id, data.reason || 'REJECTED');
              finish(false);
            } else if (data.type === 'PONG') {
              MPDiagnostics.recordPongReceived();
              MPDiagnostics.logCommandReceived(formattedCode, data.senderPlayerId, 'pong', 'PONG');
              MPDiagnostics.logWlanPongRx(data.senderPlayerId, player.id);
            } else if (data.type === 'PING') {
              // Respond to Host Ping
              MPDiagnostics.logCommandReceived(formattedCode, data.senderPlayerId, 'ping', 'PING');
              MPDiagnostics.logWlanPingRx(data.senderPlayerId, player.id);
              MPDiagnostics.logWlanPongTx(player.id, data.senderPlayerId);
              this.socket?.send(JSON.stringify({
                type: 'PONG',
                roomId: formattedCode,
                senderPlayerId: player.id,
                timestamp: data.timestamp,
              }));
            } else if (data.type === 'TEST_STATE') {
              MPDiagnostics.logStateReceived(formattedCode, data.revision);
              this.notifyEvent(data);
            } else if (data.event) {
              if (data.event.revision !== undefined) {
                MPDiagnostics.logStateReceived(formattedCode, data.event.revision);
              }
              this.notifyEvent(data.event as GameEvent);
            }
          } catch (err) {
            devWarn('WlanTransport', 'Message parse error:', err);
          }
        };

        this.socket.onerror = (err) => {
          clearTimeout(connectionTimeout);
          devWarn('WlanTransport', 'WebSocket error:', err);
          finish(false);
        };

        this.socket.onclose = () => {
          this.setConnectionStatus('DISCONNECTED');
          MPDiagnostics.logDisconnect('WLAN', formattedCode, player.id, 'SOCKET_CLOSED');
        };
      } catch (e) {
        devWarn('WlanTransport', 'Connection initialization exception:', e);
        finish(false);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.roomCode && this.localPlayer) {
      MPDiagnostics.logDisconnect('WLAN', this.roomCode, this.localPlayer.id, 'USER_DISCONNECT');
    }
    await this.stopAdvertising();
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {}
      this.socket = null;
    }
    this.connectedPeers.clear();
    this.setConnectionStatus('DISCONNECTED');
  }

  async sendCommand(command: GameCommand): Promise<void> {
    MPDiagnostics.logCommandSend(this.roomCode, command.playerId, command.commandId, command.type);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'COMMAND', command }));
    } else if (this.isHost) {
      // Local host processing
      this.notifyEvent(command);
    }
  }

  async broadcastEvent(event: GameEvent): Promise<void> {
    if ((event as any).revision !== undefined) {
      MPDiagnostics.logStateSend(this.roomCode, (event as any).revision);
    }

    if (this.isHost) {
      this.broadcastToNativeClients({ type: 'EVENT', event });
      this.notifyEvent(event);
    } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'EVENT', event }));
    }
  }

  // Phase 9: Transport Ping/Pong
  async sendPing(): Promise<void> {
    if (!this.localPlayer) return;
    MPDiagnostics.startPingMeasurement();
    const payload = {
      type: 'PING',
      roomId: this.roomCode,
      senderPlayerId: this.localPlayer.id,
      timestamp: Date.now(),
    };
    MPDiagnostics.logCommandSend(this.roomCode, this.localPlayer.id, 'ping', 'PING');
    MPDiagnostics.logWlanPingTx(this.localPlayer.id, this.isHost ? 'CLIENTS' : 'HOST');

    if (this.isHost) {
      this.broadcastToNativeClients(payload);
    } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  // Phase 10: Test State Sync
  async sendTestState(revision: number, testValue: string = 'HELLO'): Promise<void> {
    if (!this.localPlayer) return;
    const payload = {
      type: 'TEST_STATE',
      roomId: this.roomCode,
      revision,
      currentPlayerId: this.localPlayer.id,
      testValue,
    };
    MPDiagnostics.logStateSend(this.roomCode, revision);

    if (this.isHost) {
      this.broadcastToNativeClients(payload);
      this.notifyEvent(payload);
    } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  onEvent(callback: (event: GameEvent | any) => void): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  onConnectionChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.connectionStatus);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  private setConnectionStatus(status: ConnectionStatus) {
    this.connectionStatus = status;
    this.statusListeners.forEach(fn => fn(status));
  }

  private notifyEvent(event: GameEvent | any) {
    this.eventListeners.forEach(fn => {
      try {
        fn(event);
      } catch (err) {
        devWarn('WlanTransport', 'Event handler error:', err);
      }
    });
  }
}
