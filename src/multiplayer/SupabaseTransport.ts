import { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseConfigured } from './SupabaseClient';
import {
  MultiplayerTransport,
  ConnectionStatus,
  RoomPlayer,
  GameCommand,
  GameEvent,
} from './types';

export class SupabaseTransport implements MultiplayerTransport {
  private channel: RealtimeChannel | null = null;
  private connectionStatus: ConnectionStatus = 'DISCONNECTED';
  private eventListeners: Set<(event: GameEvent) => void> = new Set();
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private roomCode: string = '';
  private localPlayer: RoomPlayer | null = null;

  async connect(roomCode: string, player: RoomPlayer): Promise<boolean> {
    this.roomCode = roomCode;
    this.localPlayer = player;
    this.setConnectionStatus('CONNECTING');

    if (!isSupabaseConfigured()) {
      console.warn('[SupabaseTransport] Supabase credentials not configured in environment.');
      this.setConnectionStatus('DISCONNECTED');
      return false;
    }

    try {
      const supabase = getSupabaseClient();
      const code = roomCode.toUpperCase().trim();
      const channelName = `uno-room:${code}`;
      const role = player.isHost ? 'HOST' : 'CLIENT';

      if (__DEV__) {
        console.log(`[ONLINE_ROOM]\nroomId=${code}\nchannel=${channelName}\nplayerId=${player.id}\nrole=${role}`);
      }

      // Clean up previous channel if any
      if (this.channel) {
        await supabase.removeChannel(this.channel);
      }

      this.channel = supabase.channel(channelName, {
        config: {
          presence: { key: player.id },
          broadcast: { self: false, ack: false },
        },
      });

      // 1. Presence Sync (Who is connected/ready)
      this.channel.on('presence', { event: 'sync' }, () => {
        const state = this.channel?.presenceState() || {};
        // Find joined players
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
          this.notifyEvent(payload as GameEvent);
        }
      });

      this.channel.on('broadcast', { event: 'game_command' }, ({ payload }) => {
        // Handled if local player is host
        if (payload) {
          this.notifyEvent(payload as any);
        }
      });

      // Subscribe to channel
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.setConnectionStatus('DISCONNECTED');
          reject(new Error('Connection timeout to Supabase Realtime'));
        }, 12000);

        this.channel?.subscribe(status => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            this.setConnectionStatus('CONNECTED');
            if (__DEV__) {
              console.log(`[TRANSPORT]\nconnected=true\ntransport=ONLINE\nroomId=${code}\nplayerId=${player.id}`);
            }
            if (this.localPlayer) {
              this.channel?.track(this.localPlayer);
            }
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timeout);
            this.setConnectionStatus('DISCONNECTED');
            if (__DEV__) {
              console.log(`[TRANSPORT]\nconnected=false\ntransport=ONLINE\nroomId=${code}\nplayerId=${player.id}`);
            }
            reject(new Error(`Failed to subscribe: ${status}`));
          }
        });
      });

      return true;
    } catch (err) {
      console.error('[SupabaseTransport] Connection error:', err);
      this.setConnectionStatus('DISCONNECTED');
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      const supabase = getSupabaseClient();
      await this.channel.untrack();
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.setConnectionStatus('DISCONNECTED');
  }

  async sendCommand(command: GameCommand): Promise<void> {
    if (!this.channel || this.connectionStatus !== 'CONNECTED') return;

    await this.channel.send({
      type: 'broadcast',
      event: 'game_command',
      payload: command,
    });
  }

  async broadcastEvent(event: GameEvent): Promise<void> {
    if (!this.channel || this.connectionStatus !== 'CONNECTED') return;

    await this.channel.send({
      type: 'broadcast',
      event: 'game_event',
      payload: event,
    });
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
    this.eventListeners.forEach(fn => fn(event));
  }
}
