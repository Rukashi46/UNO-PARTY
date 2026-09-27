import { SafeStorage } from './SafeStorage';
import { NativeEffectsService } from './NativeEffects';
import { devWarn } from './ErrorMapper';
import { PlayerIdentityService } from './PlayerIdentityService';
import { SupabaseDataService } from '../multiplayer/SupabaseDataService';

export interface AppSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  hapticsEnabled: boolean;
  animationsEnabled: boolean;
  cardConfirmation: boolean;
  turnNotifications: boolean;
  theme: string;
  language: string;
}

const STORAGE_KEY = '@uno_party_app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  musicEnabled: true,
  hapticsEnabled: true,
  animationsEnabled: true,
  cardConfirmation: true, // Default ON for two-tap confirmation
  turnNotifications: true,
  theme: 'Dark Mahogany Felt',
  language: 'English (US)',
};

type SettingsListener = (settings: AppSettings) => void;

export class AppSettingsService {
  private static settings: AppSettings = { ...DEFAULT_SETTINGS };
  private static listeners: Set<SettingsListener> = new Set();
  private static isInitialized = false;

  static async init(): Promise<AppSettings> {
    if (this.isInitialized) return this.settings;

    try {
      const stored = await SafeStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      devWarn('AppSettingsService', 'Failed to load app settings from storage, using defaults:', e);
    }

    this.isInitialized = true;
    this.syncNativeEffects();

    // Background cloud sync with Supabase profiles table
    this.syncWithCloud().catch(err => {
      devWarn('AppSettingsService', 'Initial cloud settings sync failed (using local settings):', err);
    });

    return this.settings;
  }

  static getSettings(): AppSettings {
    return { ...this.settings };
  }

  static async updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<AppSettings> {
    this.settings[key] = value;
    this.syncNativeEffects();
    this.notifyListeners();

    try {
      await SafeStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      devWarn('AppSettingsService', 'Failed to persist app settings:', e);
    }

    // Persist to Supabase profiles table in background
    PlayerIdentityService.getIdentity()
      .then(identity => {
        SupabaseDataService.syncProfile(
          identity.id,
          identity.name,
          identity.avatar,
          this.settings
        ).catch(() => {});
      })
      .catch(() => {});

    return { ...this.settings };
  }

  static async syncWithCloud(): Promise<boolean> {
    try {
      const identity = await PlayerIdentityService.getIdentity();
      const profile = await SupabaseDataService.fetchProfile(identity.id);

      if (profile && profile.settings) {
        this.settings = { ...this.settings, ...profile.settings };
        this.syncNativeEffects();
        this.notifyListeners();
        await SafeStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      } else {
        await SupabaseDataService.syncProfile(
          identity.id,
          identity.name,
          identity.avatar,
          this.settings
        );
      }
      return true;
    } catch (e) {
      devWarn('AppSettingsService', 'syncWithCloud error:', e);
      return false;
    }
  }

  static subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    // Call immediately with current settings
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
