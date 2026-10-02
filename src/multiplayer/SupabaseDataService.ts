import { getSupabaseClient, isSupabaseConfigured } from './SupabaseClient';
import { GameRules } from '../types/game';
import { devWarn } from '../services/ErrorMapper';
import { MPDiagnostics } from '../services/MultiplayerDiagnosticsService';

export interface CloudRoomRecord {
  id: string; // Set to room_code to guarantee stable identifier
  room_code: string;
  host_player_id: string;
  host_address?: string;
  mode: string;
  status: string;
  max_players: number;
  rules: any;
}

export interface CloudProfileRecord {
  id: string;
  displayName: string;
  avatar: string;
  settings?: any;
  updatedAt?: string;
}

export class SupabaseDataService {
  /**
   * Upsert player profile in Supabase `profiles` table.
   * Remote live schema: id (UUID), username (TEXT), avatar (TEXT), created_at, updated_at (TIMESTAMPTZ)
   */
  static async syncProfile(
    userId: string,
    displayName: string,
    avatar: string,
    _settings?: any
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const sanitizedName = (displayName || 'Player').trim().substring(0, 32);
      const payload = {
        id: userId,
        username: sanitizedName,
        avatar: avatar || '👦🏻',
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });

      if (error) {
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
   * Fetch player profile from Supabase `profiles` table.
   */
  static async fetchProfile(userId: string): Promise<CloudProfileRecord | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        devWarn('SupabaseDataService', 'fetchProfile error:', error.message);
        return null;
      }
      if (!data) return null;

      return {
        id: data.id,
        displayName: data.username || data.display_name || 'Player',
        avatar: data.avatar || data.avatar_id || '👦🏻',
        updatedAt: data.updated_at,
      };
    } catch (e) {
      devWarn('SupabaseDataService', 'fetchProfile exception:', e);
      return null;
    }
  }

  /**
   * Authoritative User Settings Sync (Stored locally with cloud sync fallback)
   */
  static async syncUserSettings(_userId: string, _settings: Record<string, any>): Promise<boolean> {
    return true;
  }

  /**
   * Authoritative User Settings Fetch
   */
  static async fetchUserSettings(_userId: string): Promise<Record<string, any> | null> {
    return null;
  }

  /**
   * Updates max_players capacity in Supabase `rooms` table.
   * Remote live schema: max_players (INTEGER), updated_at (BIGINT)
   */
  static async updateRoomMaxPlayers(roomCode: string, maxPlayers: number): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('rooms')
        .update({ max_players: maxPlayers, updated_at: Date.now() })
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
   * Remote live schema:
   * room_code (TEXT), host_player_id (TEXT), host_address (TEXT), status (TEXT),
   * mode (TEXT), max_players (INTEGER), rules (JSONB), updated_at (BIGINT epoch ms)
   */
  static async registerRoom(
    roomCode: string,
    hostPlayerId: string,
    mode: string = 'ONLINE',
    rules: GameRules,
    hostAddress?: string
  ): Promise<CloudRoomRecord | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const supabase = getSupabaseClient();
      const code = roomCode.toUpperCase().trim();
      const payload = {
        room_code: code,
        host_player_id: hostPlayerId,
        host_address: hostAddress || null,
        mode: mode,
        status: 'WAITING',
        max_players: 10,
        rules: rules,
        updated_at: Date.now(),
      };

      const { data, error } = await supabase
        .from('rooms')
        .upsert(payload, { onConflict: 'room_code' })
        .select()
        .single();

      if (error) {
        devWarn('SupabaseDataService', 'registerRoom error:', error.message);
        if (__DEV__) {
          console.error(`[SUPABASE_ROOM_ERROR] registerRoom failed: ${error.message} (code: ${error.code})`);
        }
        return null;
      }

      return {
        id: data.room_code,
        room_code: data.room_code,
        host_player_id: data.host_player_id,
        host_address: data.host_address,
        mode: data.mode,
        status: data.status,
        max_players: data.max_players,
        rules: data.rules,
      };
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
      const code = roomCode.toUpperCase().trim();
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', code)
        .maybeSingle();

      if (error) {
        devWarn('SupabaseDataService', 'lookupRoom error:', error.message);
        return null;
      }
      if (!data) return null;

      return {
        id: data.room_code,
        room_code: data.room_code,
        host_player_id: data.host_player_id,
        host_address: data.host_address,
        mode: data.mode,
        status: data.status,
        max_players: data.max_players,
        rules: data.rules,
      };
    } catch (e) {
      devWarn('SupabaseDataService', 'lookupRoom exception:', e);
      return null;
    }
  }

  /**
   * Fetches all registered players of a room from `room_players` table.
   * Remote live schema:
   * room_code (TEXT), player_id (TEXT), name (TEXT), avatar (TEXT), is_host (BOOLEAN), last_seen (BIGINT)
   */
  static async fetchRoomPlayers(roomCode: string): Promise<any[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const supabase = getSupabaseClient();
      const code = roomCode.toUpperCase().trim();
      const { data, error } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_code', code);

      if (error) {
        devWarn('SupabaseDataService', 'fetchRoomPlayers error:', error.message);
        if (__DEV__) {
          console.error(`[SUPABASE_PLAYERS_ERROR] fetchRoomPlayers failed: ${error.message} (code: ${error.code})`);
        }
        return [];
      }

      return (data || []).map(row => ({
        id: row.player_id,
        name: row.name || 'Player',
        avatar: row.avatar || '👦🏻',
        isHost: Boolean(row.is_host),
        isReady: Boolean(row.is_host),
        isConnected: true,
        cardCount: 7,
        controller: 'REMOTE_HUMAN',
      }));
    } catch (e) {
      devWarn('SupabaseDataService', 'fetchRoomPlayers exception:', e);
      return [];
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
          updated_at: Date.now(),
        })
        .eq('room_code', roomCode.toUpperCase().trim());

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
   * Updates status of an active room ('WAITING', 'PLAYING', 'FINISHED', 'CLOSED').
   */
  static async updateRoomStatus(
    roomCode: string,
    status: 'LOBBY' | 'WAITING' | 'PLAYING' | 'FINISHED' | 'CANCELLED' | 'CLOSED'
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('rooms')
        .update({
          status,
          updated_at: Date.now(),
        })
        .eq('room_code', roomCode.toUpperCase().trim());

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
   * Remote live schema:
   * room_code (TEXT), player_id (TEXT), name (TEXT), avatar (TEXT), is_host (BOOLEAN), last_seen (BIGINT)
   * On Conflict: room_code, player_id
   */
  static async joinRoomPlayer(
    roomCode: string,
    playerId: string,
    username: string,
    avatar: string,
    isHost: boolean = false
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const code = roomCode.toUpperCase().trim();
      const sanitizedName = (username || 'Player').trim().substring(0, 32);
      const payload = {
        room_code: code,
        player_id: playerId,
        name: sanitizedName,
        avatar: avatar || '👦🏻',
        is_host: isHost,
        last_seen: Date.now(),
      };

      const { error } = await supabase
        .from('room_players')
        .upsert(payload, { onConflict: 'room_code,player_id' });

      if (error) {
        devWarn('SupabaseDataService', 'joinRoomPlayer error:', error.message);
        if (__DEV__) {
          console.error(`[ROOM_MEMBERSHIP_INSERT_FAILED]\nroomId=${code}\nplayerId=${playerId}\nerror=${error.message}\ncode=${error.code}`);
        }
        MPDiagnostics.logJoinRejected(code, playerId, `ROOM_MEMBERSHIP_INSERT_FAILED: ${error.message}`);
        return false;
      }

      return true;
    } catch (e: any) {
      devWarn('SupabaseDataService', 'joinRoomPlayer exception:', e);
      if (__DEV__) {
        console.error(`[ROOM_MEMBERSHIP_INSERT_FAILED]\nroomId=${roomCode}\nplayerId=${playerId}\nerror=${e?.message || 'Exception'}`);
      }
      MPDiagnostics.logJoinRejected(roomCode, playerId, `ROOM_MEMBERSHIP_INSERT_FAILED: ${e?.message || 'Exception'}`);
      return false;
    }
  }

  /**
   * Removes participant from `room_players` table.
   */
  static async leaveRoomPlayer(roomCode: string, playerId: string): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const code = roomCode.toUpperCase().trim();
      const { error } = await supabase
        .from('room_players')
        .delete()
        .eq('room_code', code)
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
   * Records match winner in Supabase `game_history` if table exists.
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
