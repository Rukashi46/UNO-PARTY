import { getSupabaseClient, isSupabaseConfigured } from './SupabaseClient';
import { GameRules } from '../types/game';
import { devWarn } from '../services/ErrorMapper';

export interface CloudRoomRecord {
  id: string;
  room_code: string;
  host_player_id: string;
  host_id?: string;
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
   * Supports both `display_name` / `avatar_id` and legacy `username` / `avatar`.
   */
  static async syncProfile(
    userId: string,
    displayName: string,
    avatar: string,
    settings?: any
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const sanitizedName = displayName.trim().substring(0, 32) || 'Player';
      const payload: Record<string, any> = {
        id: userId,
        display_name: sanitizedName,
        avatar_id: avatar,
        username: sanitizedName,
        avatar,
        updated_at: new Date().toISOString(),
      };

      if (settings !== undefined) {
        payload.settings = settings;
      }

      let { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });

      // If display_name column does not exist on remote yet, retry with username/avatar only
      if (error && error.message && error.message.includes("'display_name'")) {
        delete payload.display_name;
        delete payload.avatar_id;
        const retry = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
        error = retry.error;
      }

      // If settings column does not exist, retry without settings
      if (error && error.message && error.message.includes("'settings'") && payload.settings !== undefined) {
        delete payload.settings;
        const retry = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
        error = retry.error;
      }

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
   * Fetch player profile & settings from Supabase `profiles` table.
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
        displayName: data.display_name || data.username || 'Player',
        avatar: data.avatar_id || data.avatar || '👦🏻',
        settings: data.settings,
        updatedAt: data.updated_at,
      };
    } catch (e) {
      devWarn('SupabaseDataService', 'fetchProfile exception:', e);
      return null;
    }
  }

  /**
   * Authoritative User Settings Sync (Part B: user_settings table with fallback)
   */
  static async syncUserSettings(userId: string, settings: Record<string, any>): Promise<boolean> {
    if (!isSupabaseConfigured()) return false;
    try {
      const supabase = getSupabaseClient();
      const payload = {
        user_id: userId,
        sound_enabled: settings.soundEnabled ?? true,
        haptics_enabled: settings.hapticsEnabled ?? true,
        animations_enabled: settings.animationsEnabled ?? true,
        theme: settings.theme || 'Dark Mahogany Felt',
        default_deck: settings.defaultDeck || 'NORMAL',
        default_game_end_mode: settings.defaultGameEndMode || 'FIRST_PLAYER_WINS',
        default_stacking_enabled: settings.defaultStackingEnabled ?? true,
        default_seven_zero_enabled: settings.defaultSevenZeroEnabled ?? true,
        default_jump_in_enabled: settings.defaultJumpInEnabled ?? true,
        default_draw_until_playable: settings.defaultDrawUntilPlayable ?? false,
        default_force_play: settings.defaultForcePlay ?? false,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('user_settings').upsert(payload, { onConflict: 'user_id' });

      if (error) {
        // Table user_settings may not be created on remote instance; fallback to profile.settings
        const profile = await this.fetchProfile(userId);
        if (profile) {
          await this.syncProfile(userId, profile.displayName, profile.avatar, settings);
        }
        return false;
      }
      return true;
    } catch (e) {
      devWarn('SupabaseDataService', 'syncUserSettings exception:', e);
      return false;
    }
  }

  /**
   * Authoritative User Settings Fetch (Part B: user_settings table with fallback)
   */
  static async fetchUserSettings(userId: string): Promise<Record<string, any> | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        return {
          soundEnabled: data.sound_enabled,
          hapticsEnabled: data.haptics_enabled,
          animationsEnabled: data.animations_enabled,
          theme: data.theme,
          defaultDeck: data.default_deck,
          defaultGameEndMode: data.default_game_end_mode,
          defaultStackingEnabled: data.default_stacking_enabled,
          defaultSevenZeroEnabled: data.default_seven_zero_enabled,
          defaultJumpInEnabled: data.default_jump_in_enabled,
          defaultDrawUntilPlayable: data.default_draw_until_playable,
          defaultForcePlay: data.default_force_play,
          updatedAt: data.updated_at,
        };
      }

      // Fallback to profiles.settings
      const profile = await this.fetchProfile(userId);
      return profile?.settings || null;
    } catch (e) {
      devWarn('SupabaseDataService', 'fetchUserSettings exception:', e);
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
      const code = roomCode.toUpperCase();
      const payload: Record<string, any> = {
        room_code: code,
        host_id: hostPlayerId,
        host_player_id: hostPlayerId,
        mode: mode,
        game_mode: mode,
        status: 'WAITING',
        max_players: 10,
        rules: rules,
        host_address: hostAddress || null,
        updated_at: new Date().toISOString(),
      };

      let { data, error } = await supabase
        .from('rooms')
        .upsert(payload, { onConflict: 'room_code' })
        .select()
        .single();

      // Fallback if specific column is missing on remote schema
      if (error && (error.message.includes('host_player_id') || error.message.includes('host_id'))) {
        delete payload.host_player_id;
        const retry = await supabase.from('rooms').upsert(payload, { onConflict: 'room_code' }).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error && (error.message.includes("'mode'") || error.message.includes('game_mode'))) {
        delete payload.mode;
        const retry = await supabase.from('rooms').upsert(payload, { onConflict: 'room_code' }).select().single();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        devWarn('SupabaseDataService', 'registerRoom error:', error.message);
        return null;
      }
      return {
        id: data.id,
        room_code: data.room_code,
        host_player_id: data.host_player_id || data.host_id || hostPlayerId,
        host_address: data.host_address,
        mode: data.mode || data.game_mode || mode,
        status: data.status,
        max_players: data.max_players || 10,
        rules: data.rules || rules,
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
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode.toUpperCase())
        .maybeSingle();

      if (error) {
        devWarn('SupabaseDataService', 'lookupRoom error:', error.message);
        return null;
      }
      if (!data) return null;

      return {
        id: data.id,
        room_code: data.room_code,
        host_player_id: data.host_player_id || data.host_id || '',
        host_address: data.host_address,
        mode: data.mode || data.game_mode || 'ONLINE',
        status: data.status,
        max_players: data.max_players || 10,
        rules: data.rules,
      };
    } catch (e) {
      devWarn('SupabaseDataService', 'lookupRoom exception:', e);
      return null;
    }
  }

  /**
   * Fetches all registered players of a room from `room_players` table.
   */
  static async fetchRoomPlayers(roomId: string): Promise<any[]> {
    if (!isSupabaseConfigured()) return [];
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true });

      if (error) {
        devWarn('SupabaseDataService', 'fetchRoomPlayers error:', error.message);
        return [];
      }

      return (data || []).map(row => ({
        id: row.player_id,
        name: row.display_name || row.username || 'Player',
        avatar: row.avatar || '👦🏻',
        isHost: Boolean(row.is_host),
        isReady: Boolean(row.is_ready),
        isConnected: Boolean(row.is_connected ?? row.connected ?? true),
        cardCount: row.card_count || 7,
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
   * Handles both new joins and reconnections without duplicate keys.
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
      const sanitizedName = (username || 'Player').trim().substring(0, 32);
      const payload: Record<string, any> = {
        room_id: roomId,
        player_id: playerId,
        display_name: sanitizedName,
        username: sanitizedName,
        avatar: avatar || '👦🏻',
        is_host: isHost,
        is_ready: isHost,
        is_connected: true,
        connected: true,
        last_seen: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      };

      let { error } = await supabase.from('room_players').upsert(
        payload,
        { onConflict: 'room_id,player_id' }
      );

      if (error && error.message.includes('display_name')) {
        delete payload.display_name;
        const retry = await supabase.from('room_players').upsert(payload, { onConflict: 'room_id,player_id' });
        error = retry.error;
      }

      if (error && error.message.includes('last_seen_at')) {
        delete payload.last_seen_at;
        const retry = await supabase.from('room_players').upsert(payload, { onConflict: 'room_id,player_id' });
        error = retry.error;
      }

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
   * Removes participant from `room_players` table or marks disconnected.
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
   * Records match winner and stats in Supabase `game_history`.
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
