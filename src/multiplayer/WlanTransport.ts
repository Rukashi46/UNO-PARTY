import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import {
  MultiplayerTransport,
  ConnectionStatus,
  RoomPlayer,
  GameCommand,
  GameEvent,
  NearbyWlanRoom,
} from './types';
import { devLog, devWarn } from '../services/ErrorMapper';

const BEACON_TTL_MS = 8000;
const DEFAULT_WLAN_PORT = 8088;

// Shared LAN registry for local simulation / loopback / processes on same machine
const GLOBAL_LAN_REGISTRY = new Map<string, { room: NearbyWlanRoom; timestamp: number }>();

export class WlanTransport implements MultiplayerTransport {
  private socket: WebSocket | null = null;
  private connectionStatus: ConnectionStatus = 'DISCONNECTED';
  private eventListeners: Set<(event: GameEvent) => void> = new Set();
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private roomCode: string = '';
  private localPlayer: RoomPlayer | null = null;
  private isHost: boolean = false;
  private connectedPeers: Map<string, RoomPlayer> = new Map();
  private advertisedRoom: NearbyWlanRoom | null = null;
  private beaconInterval: any = null;
  private nativeSubscription: any = null;
  private discoveredRemoteRooms: Map<string, NearbyWlanRoom> = new Map();

  constructor() {
    this.initNativeListener();
  }

  private initNativeListener() {
    try {
      const nativeMod = NativeModules.WlanNativeModule;
      if (nativeMod && Platform.OS === 'android') {
        const emitter = new NativeEventEmitter(nativeMod);
        this.nativeSubscription = emitter.addListener('onWlanRoomDiscovered', (data: string) => {
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
              if (__DEV__) {
                console.log(`[ROOM_DISCOVERY]\nroomId=${nearby.code}\nhost=${nearby.hostName}\nplayerCount=${nearby.playerCount}`);
              }
            }
          } catch (_) {}
        });
      }
    } catch (_) {}
  }

  async startAdvertising(roomInfo: NearbyWlanRoom): Promise<void> {
    this.advertisedRoom = {
      ...roomInfo,
      code: roomInfo.code.toUpperCase(),
      lastSeen: Date.now(),
      port: roomInfo.port || DEFAULT_WLAN_PORT,
    };

    if (__DEV__) {
      console.log(`[ROOM_CREATE]\ntransport=WLAN\nroomId=${roomInfo.code}\nhostPlayerId=${roomInfo.hostPlayerId || 'HOST'}`);
    }

    // 1. Register in local process registry
    GLOBAL_LAN_REGISTRY.set(roomInfo.code.toUpperCase(), {
      room: this.advertisedRoom,
      timestamp: Date.now(),
    });

    // 2. Start Native Android UDP broadcast if available
    try {
      const nativeMod = NativeModules.WlanNativeModule;
      if (nativeMod && nativeMod.startAdvertising) {
        await nativeMod.startAdvertising(JSON.stringify(this.advertisedRoom));
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
      if (nativeMod && nativeMod.stopAdvertising) {
        await nativeMod.stopAdvertising();
      }
    } catch (_) {}
  }

  async scanNearbyRooms(): Promise<NearbyWlanRoom[]> {
    const now = Date.now();
    const result: NearbyWlanRoom[] = [];
    const seenCodes = new Set<string>();

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

    // Exclude this device's own advertised room from nearby remote rooms (Requirement 8)
    const remoteRooms = result.filter(r => !this.advertisedRoom || r.code !== this.advertisedRoom.code);

    if (__DEV__ && remoteRooms.length > 0) {
      remoteRooms.forEach(nr => {
        console.log(`[ROOM_DISCOVERY]\nroomId=${nr.code}\nhost=${nr.hostName}\nplayerCount=${nr.playerCount}`);
      });
    }

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

    if (__DEV__) {
      console.log(`[TRANSPORT]\nconnected=false\ntransport=WLAN\nroomId=${formattedCode}\nplayerId=${player.id}`);
    }

    if (this.isHost) {
      // Host owns authoritative local game session
      this.connectedPeers.set(player.id, player);
      this.setConnectionStatus('CONNECTED');
      if (__DEV__) {
        console.log(`[TRANSPORT]\nconnected=true\ntransport=WLAN\nroomId=${formattedCode}\nplayerId=${player.id}`);
      }
      return true;
    }

    // Client Connecting Flow (Requirements 5, 9, 10, 16)
    if (__DEV__) {
      console.log(`[ROOM_JOIN_REQUEST]\ntransport=WLAN\nroomId=${formattedCode}\nplayerId=${player.id}`);
    }

    // Resolve target host address
    let targetAddress = options?.hostAddress;
    let targetPort = options?.port || DEFAULT_WLAN_PORT;

    if (!targetAddress) {
      const nearbyRooms = await this.scanNearbyRooms();
      const targetRoom = nearbyRooms.find(r => r.code === formattedCode);
      if (targetRoom) {
        targetAddress = targetRoom.hostAddress || '127.0.0.1';
        targetPort = targetRoom.port || DEFAULT_WLAN_PORT;
      } else if (formattedCode.includes(':')) {
        const parts = formattedCode.split(':');
        targetAddress = parts[0];
        targetPort = parseInt(parts[1], 10) || DEFAULT_WLAN_PORT;
      } else {
        // Query local LAN registry
        const localEntry = GLOBAL_LAN_REGISTRY.get(formattedCode);
        if (localEntry) {
          targetAddress = localEntry.room.hostAddress || '127.0.0.1';
          targetPort = localEntry.room.port || DEFAULT_WLAN_PORT;
        }
      }
    }

    // If host cannot be found on network, fail definitively (DO NOT FAKE WLAN - Requirement 27)
    if (!targetAddress) {
      devWarn('WlanTransport', `Host for WLAN room ${formattedCode} could not be resolved on local network.`);
      this.setConnectionStatus('DISCONNECTED');
      if (__DEV__) {
        console.log(`[ROOM_JOIN_REJECTED]\ntransport=WLAN\nroomId=${formattedCode}\nplayerId=${player.id}\nreason=HOST_NOT_FOUND`);
      }
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
          if (__DEV__) {
            console.log(`[TRANSPORT]\nconnected=true\ntransport=WLAN\nroomId=${formattedCode}\nplayerId=${player.id}`);
          }
        } else {
          this.setConnectionStatus('DISCONNECTED');
          if (__DEV__) {
            console.log(`[ROOM_JOIN_REJECTED]\ntransport=WLAN\nroomId=${formattedCode}\nplayerId=${player.id}\nreason=CONNECTION_FAILED`);
          }
        }
        resolve(success);
      };

      try {
        this.socket = new WebSocket(targetUrl);

        const connectionTimeout = setTimeout(() => {
          // If socket cannot connect, reject rather than silently faking connection
          if (!resolved) {
            devWarn('WlanTransport', `Connection timeout to ${targetUrl}`);
            try { this.socket?.close(); } catch (_) {}
            finish(false);
          }
        }, 5000);

        this.socket.onopen = () => {
          clearTimeout(connectionTimeout);
          // Send JOIN_ROOM handshake (Requirement 10)
          const joinPayload = {
            type: 'JOIN_ROOM',
            roomId: formattedCode,
            playerId: player.id,
            displayName: player.name,
            avatar: player.avatar,
            deviceId: options?.deviceId || player.deviceId || '',
          };
          this.socket?.send(JSON.stringify(joinPayload));
        };

        this.socket.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'ROOM_JOIN_ACCEPTED') {
              if (__DEV__) {
                console.log(`[ROOM_JOIN_ACCEPTED]\ntransport=WLAN\nroomId=${formattedCode}\nplayerId=${player.id}\nmembers=${data.members?.length || 1}`);
              }
              finish(true);
            } else if (data.type === 'ROOM_JOIN_REJECTED') {
              devWarn('WlanTransport', 'Host rejected room join:', data.reason);
              if (__DEV__) {
                console.log(`[ROOM_JOIN_REJECTED]\ntransport=WLAN\nroomId=${formattedCode}\nplayerId=${player.id}\nreason=${data.reason || 'REJECTED'}`);
              }
              finish(false);
            } else if (data.event) {
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
          if (__DEV__) {
            console.log(`[TRANSPORT]\nconnected=false\ntransport=WLAN\nroomId=${formattedCode}\nplayerId=${player.id}`);
          }
        };
      } catch (e) {
        devWarn('WlanTransport', 'Connection initialization exception:', e);
        finish(false);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (__DEV__ && this.roomCode && this.localPlayer) {
      console.log(`[ROOM_LEAVE]\ntransport=WLAN\nroomId=${this.roomCode}\nplayerId=${this.localPlayer.id}`);
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
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'COMMAND', command }));
    }
  }

  async broadcastEvent(event: GameEvent): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'EVENT', event }));
    }
    if (this.isHost) {
      this.notifyEvent(event);
    }
  }

  onEvent(callback: (event: GameEvent) => void): () => void {
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

  private notifyEvent(event: GameEvent) {
    this.eventListeners.forEach(fn => {
      try {
        fn(event);
      } catch (err) {
        devWarn('WlanTransport', 'Event handler error:', err);
      }
    });
  }
}
