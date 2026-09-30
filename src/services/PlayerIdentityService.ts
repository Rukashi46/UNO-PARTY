import { Platform, Linking } from 'react-native';
import { SafeStorage } from './SafeStorage';
import { devLog, devWarn } from './ErrorMapper';
import { getSupabaseClient, isSupabaseConfigured } from '../multiplayer/SupabaseClient';
import { SupabaseDataService } from '../multiplayer/SupabaseDataService';

export interface UserProfile {
  id: string; // Account identity UUID (auth.users.id or persistent guest UUID)
  displayName: string; // User-editable display name
  avatar: string; // Avatar emoji or URL
  isGuest: boolean;
  email?: string;
}

// Backward-compatible interface for existing match callers
export interface PlayerIdentity {
  id: string;
  name: string;
  avatar: string;
  isHost: boolean;
  isGuest?: boolean;
  email?: string;
  deviceId?: string;
}

const DEVICE_ID_KEY = '@uno_party_device_id';
const GUEST_ID_KEY = '@uno_party_guest_id';
const ACTIVE_USER_ID_KEY = '@uno_party_active_user_id';
const DEFAULT_AVATARS = ['👦🏻', '👩🏼', '🧔🏻‍♂️', '👧🏻', '🐯', '🐼', '🦊', '👑', '🎮', '⭐', '🔥', '🎯'];

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type ProfileChangeListener = (profile: UserProfile) => void;

export class PlayerIdentityService {
  private static currentProfile: UserProfile | null = null;
  private static listeners: Set<ProfileChangeListener> = new Set();
  private static authSubscriptionInitialized = false;

  /**
   * Initializes auth state listener and loads initial profile.
   */
  static async init(): Promise<UserProfile> {
    if (!this.authSubscriptionInitialized && isSupabaseConfigured()) {
      this.authSubscriptionInitialized = true;
      try {
        const supabase = getSupabaseClient();
        supabase.auth.onAuthStateChange(async (event, session) => {
          devLog('PlayerIdentityService', `Auth state changed: ${event}`);
          if (session?.user) {
            await this.handleUserAuthenticated(session.user);
          } else if (event === 'SIGNED_OUT') {
            await this.handleUserSignedOut();
          }
        });
      } catch (err) {
        devWarn('PlayerIdentityService', 'Failed to attach Supabase auth listener:', err);
      }
    }

    return this.getProfile();
  }

  /**
   * Authoritative account profile getter.
   * Loads from active session (Google Auth or Guest Mode).
   */
  static async getProfile(): Promise<UserProfile> {
    if (this.currentProfile) return this.currentProfile;

    // Check if Supabase has an active authenticated Google session
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const profile = await this.handleUserAuthenticated(session.user);
          return profile;
        }
      } catch (e) {
        devWarn('PlayerIdentityService', 'Failed to retrieve active auth session, falling back to guest mode:', e);
      }
    }

    // Fallback: Guest Mode (local persistent UUID)
    const guestProfile = await this.loadGuestProfile();
    this.currentProfile = guestProfile;
    return guestProfile;
  }

  /**
   * Retrieves or generates a persistent local Device ID.
   * Identifies the local device / installation.
   * Separated from playerId, roomId, and sessionId.
   */
  static async getDeviceId(): Promise<string> {
    let deviceId: string | null = null;
    try {
      deviceId = await SafeStorage.getItem(DEVICE_ID_KEY);
    } catch (_) {}

    if (!deviceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)) {
      deviceId = generateUUID();
      try {
        await SafeStorage.setItem(DEVICE_ID_KEY, deviceId);
      } catch (_) {}
    }
    return deviceId;
  }

  /**
   * Backward-compatible helper returning PlayerIdentity format.
   */
  static async getIdentity(): Promise<PlayerIdentity> {
    const profile = await this.getProfile();
    const deviceId = await this.getDeviceId();
    return {
      id: profile.id,
      name: profile.displayName,
      avatar: profile.avatar,
      isHost: true,
      isGuest: profile.isGuest,
      email: profile.email,
      deviceId,
    };
  }

  /**
   * Update profile (display name, avatar).
   * - Saves locally namespaced by user ID
   * - Syncs to Supabase profiles table if authenticated or online
   * - Notifies all subscribers
   */
  static async updateProfile(updates: Partial<Pick<UserProfile, 'displayName' | 'avatar'>>): Promise<UserProfile> {
    const current = await this.getProfile();
    const updated: UserProfile = {
      ...current,
      ...(updates.displayName !== undefined ? { displayName: updates.displayName.trim().substring(0, 32) || 'Player' } : {}),
      ...(updates.avatar !== undefined ? { avatar: updates.avatar } : {}),
    };

    this.currentProfile = updated;

    // Save locally namespaced
    const storageKey = updated.isGuest ? `profile:guest:${updated.id}` : `profile:${updated.id}`;
    await SafeStorage.setItem(storageKey, JSON.stringify(updated));

    // Synchronize to cloud if authenticated or online
    if (isSupabaseConfigured()) {
      SupabaseDataService.syncProfile(updated.id, updated.displayName, updated.avatar).catch(err => {
        devWarn('PlayerIdentityService', 'Cloud profile update deferred:', err);
      });
    }

    this.notifyListeners(updated);
    return updated;
  }

  /**
   * Backward-compatible alias for updateProfile.
   */
  static async updateIdentity(updates: Partial<PlayerIdentity>): Promise<PlayerIdentity> {
    const res = await this.updateProfile({
      displayName: updates.name,
      avatar: updates.avatar,
    });
    return {
      id: res.id,
      name: res.displayName,
      avatar: res.avatar,
      isHost: true,
      isGuest: res.isGuest,
      email: res.email,
    };
  }

  /**
   * Initiates Google OAuth Login via Supabase.
   */
  static async signInWithGoogle(): Promise<{ error?: string }> {
    if (!isSupabaseConfigured()) {
      return { error: 'Online services are currently unavailable.' };
    }

    try {
      const supabase = getSupabaseClient();
      const redirectUrl =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.origin
          : 'unoarena://auth/callback';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        devWarn('PlayerIdentityService', 'Google OAuth sign in failed:', error.message);
        if (error.message.includes('not enabled') || error.message.includes('Unsupported provider')) {
          return { error: 'Google sign-in is not enabled in your Supabase dashboard yet.' };
        }
        return { error: error.message };
      }

      if (data?.url) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          // Open in a popup window so user does not lose their current game or app state
          const popup = window.open(data.url, 'google_login', 'width=520,height=640,menubar=no,toolbar=no');
          if (!popup) {
            window.location.href = data.url;
          }
        } else {
          await Linking.openURL(data.url);
        }
      }

      return {};
    } catch (e: any) {
      devWarn('PlayerIdentityService', 'Google OAuth sign in exception:', e);
      const msg = e?.message || 'Login failed.';
      if (msg.includes('not enabled') || msg.includes('Unsupported provider')) {
        return { error: 'Google sign-in is not enabled in your Supabase dashboard yet.' };
      }
      return { error: msg };
    }
  }

  /**
   * Sign Out of Google Account and revert to clean Guest Mode.
   */
  static async signOut(): Promise<void> {
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        await supabase.auth.signOut();
      }
    } catch (err) {
      devWarn('PlayerIdentityService', 'Supabase signOut warning:', err);
    }

    await this.handleUserSignedOut();
  }

  /**
   * Handles authenticated Google user session:
   * 1. Uses auth.users.id as the permanent account identity
   * 2. Checks Supabase profiles table for existing profile
   * 3. If exists, loads custom displayName/avatar (never overwrites custom name with Google name)
   * 4. If new, initializes with Google name/avatar
   */
  private static async handleUserAuthenticated(user: any): Promise<UserProfile> {
    const userId = user.id;
    const storageKey = `profile:${userId}`;
    await SafeStorage.setItem(ACTIVE_USER_ID_KEY, userId);

    // 1. Check local cache for this specific user ID
    let cachedProfile: UserProfile | null = null;
    try {
      const cached = await SafeStorage.getItem(storageKey);
      if (cached) {
        cachedProfile = JSON.parse(cached);
      }
    } catch (_) {}

    // 2. Fetch authoritative cloud profile from Supabase
    let cloudProfile: any = null;
    try {
      cloudProfile = await SupabaseDataService.fetchProfile(userId);
    } catch (_) {}

    let profile: UserProfile;

    if (cloudProfile && cloudProfile.displayName) {
      // Returning user: Load existing custom profile from Supabase
      profile = {
        id: userId,
        displayName: cloudProfile.displayName,
        avatar: cloudProfile.avatar || cachedProfile?.avatar || '👦🏻',
        isGuest: false,
        email: user.email,
      };
    } else if (cachedProfile) {
      // Local cached profile
      profile = {
        ...cachedProfile,
        id: userId,
        isGuest: false,
        email: user.email,
      };
      // Backfill to Supabase
      SupabaseDataService.syncProfile(userId, profile.displayName, profile.avatar).catch(() => {});
    } else {
      // First-time Google user initialization
      const googleName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.user_metadata?.given_name ||
        user.email?.split('@')[0] ||
        'Player';

      const initialAvatar =
        user.user_metadata?.avatar_url ||
        DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];

      profile = {
        id: userId,
        displayName: googleName.substring(0, 32),
        avatar: initialAvatar,
        isGuest: false,
        email: user.email,
      };

      // Persist to Supabase
      SupabaseDataService.syncProfile(userId, profile.displayName, profile.avatar).catch(() => {});
    }

    this.currentProfile = profile;
    await SafeStorage.setItem(storageKey, JSON.stringify(profile));
    this.notifyListeners(profile);
    return profile;
  }

  /**
   * Handles sign-out: reverts to guest mode without leaking previous user's profile.
   */
  private static async handleUserSignedOut(): Promise<UserProfile> {
    await SafeStorage.removeItem(ACTIVE_USER_ID_KEY);
    const guestProfile = await this.loadGuestProfile();
    this.currentProfile = guestProfile;
    this.notifyListeners(guestProfile);
    return guestProfile;
  }

  /**
   * Loads or creates a persistent Guest profile.
   */
  private static async loadGuestProfile(): Promise<UserProfile> {
    let guestId: string | null = null;
    try {
      guestId = await SafeStorage.getItem(GUEST_ID_KEY);
    } catch (_) {}

    if (!guestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guestId)) {
      guestId = generateUUID();
      await SafeStorage.setItem(GUEST_ID_KEY, guestId);
    }

    const storageKey = `profile:guest:${guestId}`;
    try {
      const stored = await SafeStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.id === guestId) {
          return { ...parsed, isGuest: true };
        }
      }
    } catch (_) {}

    // Initial guest profile (never hardcoded 'VARUN')
    const initialGuest: UserProfile = {
      id: guestId,
      displayName: 'Player',
      avatar: '👦🏻',
      isGuest: true,
    };

    await SafeStorage.setItem(storageKey, JSON.stringify(initialGuest));
    return initialGuest;
  }

  static subscribe(listener: ProfileChangeListener): () => void {
    this.listeners.add(listener);
    if (this.currentProfile) {
      listener({ ...this.currentProfile });
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static notifyListeners(profile: UserProfile) {
    const copy = { ...profile };
    this.listeners.forEach(fn => fn(copy));
  }
}
