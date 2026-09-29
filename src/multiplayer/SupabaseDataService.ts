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
