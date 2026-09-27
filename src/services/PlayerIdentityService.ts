import { SafeStorage } from './SafeStorage';
import { devWarn } from './ErrorMapper';

export interface PlayerIdentity {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
}

const STORAGE_KEY = '@uno_party_player_identity';

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class PlayerIdentityService {
  private static currentIdentity: PlayerIdentity | null = null;

  static async getIdentity(): Promise<PlayerIdentity> {
    if (this.currentIdentity) return this.currentIdentity;

    try {
      const stored = await SafeStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Ensure id is a valid UUID for Supabase
        if (parsed.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.id)) {
          this.currentIdentity = parsed;
          return this.currentIdentity!;
        }
      }
    } catch (e) {
      devWarn('PlayerIdentityService', 'Failed to load player identity, using memory session:', e);
    }

    // Generate valid RFC4122 UUID for Supabase database compatibility
    const newId = generateUUID();
    const identity: PlayerIdentity = {
      id: newId,
      name: 'VARUN',
      avatar: '👦🏻',
      isHost: true,
    };

    this.currentIdentity = identity;
    await this.saveIdentity(identity);
    // Background sync profile to Supabase
    this.syncProfileToSupabase(identity);
    return identity;
  }

  static async updateIdentity(updates: Partial<PlayerIdentity>): Promise<PlayerIdentity> {
    const current = await this.getIdentity();
    const updated = { ...current, ...updates };
    this.currentIdentity = updated;
    await this.saveIdentity(updated);
    this.syncProfileToSupabase(updated);
    return updated;
  }

  private static syncProfileToSupabase(identity: PlayerIdentity) {
    try {
      const { SupabaseDataService } = require('../multiplayer/SupabaseDataService');
      SupabaseDataService.syncProfile(identity.id, identity.name, identity.avatar).catch(() => {});
    } catch (_) {}
  }

  private static async saveIdentity(identity: PlayerIdentity): Promise<void> {
    try {
      await SafeStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    } catch (e) {
      devWarn('PlayerIdentityService', 'Failed to save player identity to persistent storage:', e);
    }
  }
}
