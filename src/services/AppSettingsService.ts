import { SafeStorage } from './SafeStorage';
import { NativeEffectsService } from './NativeEffects';
import { devWarn } from './ErrorMapper';
import { PlayerIdentityService } from './PlayerIdentityService';
import { SupabaseDataService } from '../multiplayer/SupabaseDataService';
import { DeckType, GameEndMode } from '../types/game';

export interface UserSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  hapticsEnabled: boolean;
  animationsEnabled: boolean;
  cardConfirmation: boolean;
  turnNotifications: boolean;
  theme: string;
  language: string;
  defaultDeck: DeckType;
  defaultGameEndMode: GameEndMode;
  defaultStackingEnabled: boolean;
  defaultSevenZeroEnabled: boolean;
  defaultJumpInEnabled: boolean;
  defaultDrawUntilPlayable: boolean;
  defaultForcePlay: boolean;
  updatedAt?: string;
}

// Backward-compatible alias
export type AppSettings = UserSettings;

const DEFAULT_SETTINGS: UserSettings = {
  soundEnabled: true,
  musicEnabled: true,
  hapticsEnabled: true,
  animationsEnabled: true,
  cardConfirmation: true,
  turnNotifications: true,
  theme: 'Dark Mahogany Felt',
  language: 'English (US)',
  defaultDeck: 'NORMAL',
  defaultGameEndMode: 'FIRST_PLAYER_WINS',
  defaultStackingEnabled: true,
  defaultSevenZeroEnabled: true,
  defaultJumpInEnabled: true,
  defaultDrawUntilPlayable: false,
  defaultForcePlay: false,
};

type SettingsListener = (settings: UserSettings) => void;

export class AppSettingsService {
  private static settings: UserSettings = { ...DEFAULT_SETTINGS };
  private static listeners: Set<SettingsListener> = new Set();
  private static isInitialized = false;
  private static activeUserId: string | null = null;

  static async init(): Promise<UserSettings> {
    const profile = await PlayerIdentityService.getProfile();
    this.activeUserId = profile.id;
    const storageKey = profile.isGuest ? `settings:guest:${profile.id}` : `settings:${profile.id}`;

    try {
      const stored = await SafeStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      } else {
        this.settings = { ...DEFAULT_SETTINGS };
      }
    } catch (e) {
      devWarn('AppSettingsService', 'Failed to load user settings from storage, using defaults:', e);
    }

    this.isInitialized = true;
    this.syncNativeEffects();

    // Background cloud sync if online
    this.syncWithCloud().catch(err => {
      devWarn('AppSettingsService', 'Background settings sync deferred:', err);
    });

    return this.settings;
  }

  static getSettings(): UserSettings {
    return { ...this.settings };
  }

  static async updateSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): Promise<UserSettings> {
    return this.updateSettings({ [key]: value } as Partial<UserSettings>);
  }

  static async updateSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
    const updated = {
      ...this.settings,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.settings = updated;
    this.syncNativeEffects();
    this.notifyListeners();

    // Persist locally namespaced
    const profile = await PlayerIdentityService.getProfile();
    const storageKey = profile.isGuest ? `settings:guest:${profile.id}` : `settings:${profile.id}`;

    try {
      await SafeStorage.setItem(storageKey, JSON.stringify(this.settings));
    } catch (e) {
      devWarn('AppSettingsService', 'Failed to persist user settings:', e);
    }

    // Persist to cloud asynchronously if online
    SupabaseDataService.syncUserSettings(profile.id, this.settings).catch(() => {});

    return { ...this.settings };
  }

  /**
   * Save match settings as User Default Settings (Requirement 16: [ Save as Default ])
   */
  static async saveMatchAsDefault(matchRules: {
    deckType?: DeckType;
    gameEndMode?: GameEndMode;
    stacking?: boolean;
    sevenZeroRule?: boolean;
    jumpInRule?: boolean;
    drawUntilPlayable?: boolean;
    forcePlay?: boolean;
  }): Promise<UserSettings> {
    return this.updateSettings({
      defaultDeck: matchRules.deckType || this.settings.defaultDeck,
      defaultGameEndMode: matchRules.gameEndMode || this.settings.defaultGameEndMode,
      defaultStackingEnabled: matchRules.stacking !== undefined ? matchRules.stacking : this.settings.defaultStackingEnabled,
      defaultSevenZeroEnabled: matchRules.sevenZeroRule !== undefined ? matchRules.sevenZeroRule : this.settings.defaultSevenZeroEnabled,
      defaultJumpInEnabled: matchRules.jumpInRule !== undefined ? matchRules.jumpInRule : this.settings.defaultJumpInEnabled,
      defaultDrawUntilPlayable: matchRules.drawUntilPlayable !== undefined ? matchRules.drawUntilPlayable : this.settings.defaultDrawUntilPlayable,
      defaultForcePlay: matchRules.forcePlay !== undefined ? matchRules.forcePlay : this.settings.defaultForcePlay,
    });
  }

  /**
   * Synchronize with cloud using deterministic last-write-wins (updated_at)
   */
  static async syncWithCloud(): Promise<boolean> {
    try {
      const profile = await PlayerIdentityService.getProfile();
      if (profile.isGuest) return true; // Guests remain local-only

      const cloudSettings = await SupabaseDataService.fetchUserSettings(profile.id);

      if (cloudSettings) {
        // Last-write-wins comparison
        const localTime = this.settings.updatedAt ? new Date(this.settings.updatedAt).getTime() : 0;
        const cloudTime = cloudSettings.updatedAt ? new Date(cloudSettings.updatedAt).getTime() : 0;

        if (cloudTime > localTime) {
          this.settings = { ...this.settings, ...cloudSettings };
          this.syncNativeEffects();
          this.notifyListeners();
          const storageKey = `settings:${profile.id}`;
          await SafeStorage.setItem(storageKey, JSON.stringify(this.settings));
        } else {
          await SupabaseDataService.syncUserSettings(profile.id, this.settings);
        }
      } else {
        await SupabaseDataService.syncUserSettings(profile.id, this.settings);
      }
      return true;
    } catch (e) {
      devWarn('AppSettingsService', 'syncWithCloud error:', e);
      return false;
    }
  }

  static subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.settings });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static syncNativeEffects() {
    NativeEffectsService.setPreferences(this.settings.soundEnabled, this.settings.hapticsEnabled);
  }

  private static notifyListeners() {
    const copy = { ...this.settings };
    this.listeners.forEach(fn => fn(copy));
  }
}
