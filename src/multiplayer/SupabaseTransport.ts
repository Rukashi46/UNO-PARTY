import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from './SupabaseClient';
import {
  MultiplayerTransport,
  ConnectionStatus,
  RoomPlayer,
  GameCommand,
  GameEvent,
} from './types';
import { MPDiagnostics } from '../services/MultiplayerDiagnosticsService';

export class SupabaseTransport implements MultiplayerTransport {
  private channel: RealtimeChannel | null = null;
  private connectionStatus: ConnectionStatus = 'DISCONNECTED';
  private eventListeners: Set<(event: GameEvent | any) => void> = new Set();
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private roomCode: string = '';
  private localPlayer: RoomPlayer | null = null;

  async connect(roomCode: string, player: RoomPlayer): Promise<boolean> {
    const code = roomCode.toUpperCase().trim();
    this.roomCode = code;
    this.localPlayer = player;
    this.setConnectionStatus('CONNECTING');

    MPDiagnostics.logTransportStart('ONLINE', 'CONNECTING');
    MPDiagnostics.logConnectStart('ONLINE', code);

    if (!isSupabaseConfigured()) {
      console.warn('[SupabaseTransport] Supabase credentials not configured in environment.');
      MPDiagnostics.logConnectFailure('ONLINE', code, 'MISSING_CREDENTIALS', 'ENV_NOT_SET');
      this.setConnectionStatus('DISCONNECTED');
      return false;
    }

    try {
      const supabase = getSupabaseClient();
      const channelName = `uno-room:${code}`;

      // Clean up previous channel if any
      if (this.channel) {
        await supabase.removeChannel(this.channel);
        this.channel = null;
      }

      this.channel = supabase.channel(channelName, {
        config: {
          presence: { key: player.id },
          broadcast: { self: false, ack: true },
        },
      });

      // 1. Presence Sync
      this.channel.on('presence', { event: 'sync' }, () => {
        const state = this.channel?.presenceState() || {};
        Object.keys(state).forEach(key => {
          const presenceList = state[key] as any[];
          if (presenceList && presenceList.length > 0) {
            const p = presenceList[0] as RoomPlayer;
            if (p && p.id !== this.localPlayer?.id) {
              this.notifyEvent({ type: 'PLAYER_JOINED', player: { ...p, controller: 'REMOTE_HUMAN' } });
            }
          }
        });
      });

      this.channel.on('presence', { event: 'join' }, ({ newPresences }) => {
        newPresences.forEach((presence: any) => {
          if (presence.id !== this.localPlayer?.id) {
            this.notifyEvent({ type: 'PLAYER_JOINED', player: { ...presence, controller: 'REMOTE_HUMAN' } });
          }
        });
      });

      this.channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach((presence: any) => {
          this.notifyEvent({ type: 'PLAYER_LEFT', playerId: presence.id });
        });
      });

      // 2. Broadcast for Game Events and Commands
      this.channel.on('broadcast', { event: 'game_event' }, ({ payload }) => {
        if (payload) {
          if (payload.type === 'TEST_STATE' || payload.type === 'SYNC_STATE' || payload.revision !== undefined) {
            MPDiagnostics.logStateReceived(code, payload.revision || 1);
          }
          this.notifyEvent(payload);
        }
      });

      this.channel.on('broadcast', { event: 'game_command' }, ({ payload }) => {
        if (payload) {
          MPDiagnostics.logCommandReceived(code, payload.playerId || 'UNKNOWN', payload.commandId || '', payload.type || 'COMMAND');
          this.notifyEvent(payload);
        }
      });

      // Phase 5: Explicit subscription status tracking
      MPDiagnostics.logRealtime(channelName, 'SUBSCRIBING');

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.setConnectionStatus('DISCONNECTED');
          MPDiagnostics.logRealtime(channelName, 'TIMED_OUT', 'Connection timeout to Supabase Realtime');
          MPDiagnostics.logConnectFailure('ONLINE', code, 'Connection timeout to Supabase Realtime', 'TIMED_OUT');
          reject(new Error('Connection timeout to Supabase Realtime'));
        }, 12000);

        this.channel?.subscribe(status => {
          MPDiagnostics.logRealtime(channelName, status);
          MPDiagnostics.logOnlineChannel(code, channelName, status);

          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            this.setConnectionStatus('CONNECTED');
            MPDiagnostics.logConnectSuccess('ONLINE', code, channelName);
            if (this.localPlayer) {
              this.channel?.track(this.localPlayer);
            }
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(timeout);
            this.setConnectionStatus('DISCONNECTED');
            MPDiagnostics.logConnectFailure('ONLINE', code, `Subscription ended: ${status}`, status);
            reject(new Error(`Failed to subscribe: ${status}`));
          }
        });
      });

      return true;
    } catch (err: any) {
      MPDiagnostics.logConnectFailure('ONLINE', code, err?.message || 'UNKNOWN_ERROR', 'CONN_ERR');
      this.setConnectionStatus('DISCONNECTED');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.roomCode && this.localPlayer) {
      MPDiagnostics.logDisconnect('ONLINE', this.roomCode, this.localPlayer.id, 'USER_DISCONNECT');
    }
    if (this.channel) {
      const supabase = getSupabaseClient();
      try {
        await this.channel.untrack();
        await supabase.removeChannel(this.channel);
      } catch (_) {}
      this.channel = null;
    }
    this.setConnectionStatus('DISCONNECTED');
  }

  async sendCommand(command: GameCommand): Promise<void> {
    if (!this.channel || this.connectionStatus !== 'CONNECTED') return;

    MPDiagnostics.logCommandSend(
      this.roomCode,
      command.playerId,
      command.commandId,
      command.type
    );

    await this.channel.send({
      type: 'broadcast',
      event: 'game_command',
      payload: command,
    });
  }

  async broadcastEvent(event: GameEvent): Promise<void> {
    if (!this.channel || this.connectionStatus !== 'CONNECTED') return;

    const evt = event as any;
    if (evt.revision !== undefined || evt.type === 'TEST_STATE' || evt.type === 'SYNC_STATE') {
      MPDiagnostics.logStateSend(this.roomCode, evt.revision || 1);
    }

    await this.channel.send({
      type: 'broadcast',
      event: 'game_event',
      payload: event,
    });

    // Supabase channel has broadcast.self = false. Notify local listeners on Host immediately!
    this.notifyEvent(event);
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
        console.warn('[SupabaseTransport] Event callback error:', err);
      }
    });
  }
}
