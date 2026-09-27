import { getSupabaseClient, isSupabaseConfigured } from './SupabaseClient';
import { GameRules } from '../types/game';
import { devWarn } from '../services/ErrorMapper';

export interface CloudRoomRecord {
  id: string;
  room_code: string;
  host_player_id: string;
  host_address?: string;
  mode: string;
  status: string;
  max_players: number;
  rules: any;
}

export class SupabaseDataService {
  /**
   * Upsert player profile in Supabase `profiles` table.
   * Matches 20260924_initial_schema.sql:
   * CREATE TABLE public.profiles (id UUID PRIMARY KEY, username TEXT, avatar TEXT, settings JSONB, ...)
   */
  static async syncProfile(
    playerId: string,
    username: string,
    avatar: string,
    settings?: any
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const payload: Record<string, any> = {
        id: playerId,
        username: username.substring(0, 32),
        avatar,
        updated_at: new Date().toISOString(),
      };

      if (settings !== undefined) {
        payload.settings = settings;
      }

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });

      if (error) {
        // If settings column doesn't exist yet, retry without settings column so profile row is saved
        if (error.message && error.message.includes("'settings'") && payload.settings !== undefined) {
          delete payload.settings;
          const retry = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
          if (!retry.error) return true;
        }
        devWarn('SupabaseDataService', 'syncProfile error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      devWarn('SupabaseDataService', 'syncProfile exception:', e);
      return false;
    }
  }

  /**
   * Fetch player profile & saved settings from Supabase `profiles` table.
   */
  static async fetchProfile(playerId: string): Promise<{
    id: string;
    username: string;
    avatar: string;
    settings?: any;
  } | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', playerId)
        .maybeSingle();

      if (error) {
        devWarn('SupabaseDataService', 'fetchProfile error:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      devWarn('SupabaseDataService', 'fetchProfile exception:', e);
      return null;
    }
  }

  /**
   * Updates max_players capacity in Supabase `rooms` table.
   */
  static async updateRoomMaxPlayers(roomCode: string, maxPlayers: number): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('rooms')
        .update({ max_players: maxPlayers, updated_at: new Date().toISOString() })
        .eq('room_code', roomCode.toUpperCase());

      if (error) {
        devWarn('SupabaseDataService', 'updateRoomMaxPlayers error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      devWarn('SupabaseDataService', 'updateRoomMaxPlayers exception:', e);
      return false;
    }
  }

  /**
   * Registers a room in Supabase `rooms` table.
   * Matches 20260924_initial_schema.sql:
   * CREATE TABLE public.rooms (id UUID, room_code TEXT, host_player_id UUID, ...)
   */
  static async registerRoom(
    roomCode: string,
    hostPlayerId: string,
    mode: string = 'ONLINE_ROOM',
    rules: GameRules,
    hostAddress?: string
  ): Promise<CloudRoomRecord | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('rooms')
        .upsert(
          {
            room_code: roomCode.toUpperCase(),
            host_player_id: hostPlayerId,
            mode,
            status: 'LOBBY',
            max_players: 10,
            rules: rules,
            host_address: hostAddress || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'room_code' }
        )
        .select()
        .single();

      if (error) {
        devWarn('SupabaseDataService', 'registerRoom error:', error.message);
        return null;
      }
      return data as CloudRoomRecord;
    } catch (e) {
      devWarn('SupabaseDataService', 'registerRoom exception:', e);
      return null;
    }
  }

  /**
   * Looks up room details by room_code from Supabase `rooms` table.
   */
  static async lookupRoom(roomCode: string): Promise<CloudRoomRecord | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .maybeSingle();

      if (error) {
        devWarn('SupabaseDataService', 'lookupRoom error:', error.message);
        return null;
      }
      return data as CloudRoomRecord | null;
    } catch (e) {
      devWarn('SupabaseDataService', 'lookupRoom exception:', e);
      return null;
    }
  }

  /**
   * Updates rules for an active room in Supabase `rooms` table.
   */
  static async updateRoomRules(roomCode: string, rules: GameRules): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('rooms')
        .update({
          rules: rules,
          updated_at: new Date().toISOString(),
        })
        .eq('room_code', roomCode.toUpperCase());

      if (error) {
        devWarn('SupabaseDataService', 'updateRoomRules error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      devWarn('SupabaseDataService', 'updateRoomRules exception:', e);
      return false;
    }
  }

  /**
   * Updates status of an active room ('LOBBY', 'PLAYING', 'FINISHED', 'CANCELLED').
   */
  static async updateRoomStatus(
    roomCode: string,
    status: 'LOBBY' | 'PLAYING' | 'FINISHED' | 'CANCELLED'
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('rooms')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('room_code', roomCode.toUpperCase());

      if (error) {
        devWarn('SupabaseDataService', 'updateRoomStatus error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      devWarn('SupabaseDataService', 'updateRoomStatus exception:', e);
      return false;
    }
  }

  /**
   * Inserts or updates a participant in `room_players` table.
   */
  static async joinRoomPlayer(
    roomId: string,
    playerId: string,
    username: string,
    avatar: string,
    isHost: boolean = false
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('room_players').upsert(
        {
          room_id: roomId,
          player_id: playerId,
          username: username.substring(0, 16),
          avatar,
          is_host: isHost,
          connected: true,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'room_id,player_id' }
      );

      if (error) {
        devWarn('SupabaseDataService', 'joinRoomPlayer error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      devWarn('SupabaseDataService', 'joinRoomPlayer exception:', e);
      return false;
    }
  }

  /**
   * Removes participant from `room_players` table.
   */
  static async leaveRoomPlayer(roomId: string, playerId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('room_players')
        .delete()
        .eq('room_id', roomId)
        .eq('player_id', playerId);

      if (error) {
        devWarn('SupabaseDataService', 'leaveRoomPlayer error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      devWarn('SupabaseDataService', 'leaveRoomPlayer exception:', e);
      return false;
    }
  }

  /**
   * Records match winner and stats in Supabase `game_history` (or `matches`).
   */
  static async recordGameHistory(
    roomCode: string,
    winnerId: string | null,
    winnerName: string,
    playerCount: number,
    mode: string,
    rounds: number = 1
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('game_history').insert({
        room_code: roomCode,
        winner_id: winnerId,
        winner_name: winnerName,
        player_count: playerCount,
        mode,
        rounds_played: rounds,
        created_at: new Date().toISOString(),
      });

      if (error) {
        devWarn('SupabaseDataService', 'recordGameHistory error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      devWarn('SupabaseDataService', 'recordGameHistory exception:', e);
      return false;
    }
  }
}

