import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { COLORS } from '../constants/theme';
import { UserSettings, AppSettingsService } from '../services/AppSettingsService';
import { NativeEffectsService } from '../services/NativeEffects';
import { PlayerIdentityService, UserProfile } from '../services/PlayerIdentityService';
import { isSupabaseConfigured } from '../multiplayer/SupabaseClient';
import { ProfileModal } from '../components/modals/ProfileModal';

interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const [settings, setSettings] = useState<UserSettings>(AppSettingsService.getSettings());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  useEffect(() => {
    AppSettingsService.init().then(s => setSettings(s));
    PlayerIdentityService.getProfile().then(p => setProfile(p));

    const unsubSettings = AppSettingsService.subscribe(newSettings => {
      setSettings(newSettings);
    });
    const unsubProfile = PlayerIdentityService.subscribe(newProfile => {
      setProfile(newProfile);
    });

    return () => {
      unsubSettings();
      unsubProfile();
    };
  }, []);

  const handleToggle = (key: keyof UserSettings, val: boolean) => {
    NativeEffectsService.triggerCardSelect();
    AppSettingsService.updateSetting(key, val);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    NativeEffectsService.triggerCardSelect();
    try {
      const ok = await AppSettingsService.syncWithCloud();
      setSyncToast(ok ? 'Profile & settings synced to Supabase!' : 'Saved to local storage.');
    } catch (_) {
      setSyncToast('Saved to local storage.');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(null), 3000);
    }
  };

  const isCloudConnected = isSupabaseConfigured();

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            NativeEffectsService.triggerCardSelect();
            onBack();
          }}
          style={styles.backBtn}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>

        <Text style={styles.title}>SETTINGS</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Section 0: Account & Profile */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT & PROFILE</Text>
          <View style={styles.cardPanel}>
            <View style={styles.profileRow}>
              <View style={styles.profileAvatarBox}>
                <Text style={styles.profileAvatarText}>{profile?.avatar || '👦🏻'}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{profile?.displayName || 'PLAYER'}</Text>
                <Text style={styles.profileIdLabel}>
                  {profile?.isGuest ? 'GUEST ACCOUNT (LOCAL UUID)' : `GOOGLE ACCOUNT (${profile?.email || 'ONLINE'})`}
                </Text>
                <Text style={styles.profileIdText} numberOfLines={1} ellipsizeMode="middle">
                  {profile?.id || 'Loading...'}
                </Text>
              </View>
              <Pressable
                style={styles.editProfileBtn}
                onPress={() => {
                  NativeEffectsService.triggerCardSelect();
                  setIsProfileModalOpen(true);
                }}
              >
                <Text style={styles.editProfileText}>EDIT</Text>
              </Pressable>
            </View>

            <View style={styles.dividerProfile} />

            <View style={styles.cloudStatusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isCloudConnected ? COLORS.unoGreen : COLORS.unoYellow },
                ]}
              />
              <Text style={styles.cloudStatusText}>
                {isCloudConnected
                  ? 'Cloud Sync: Supabase profiles & user_settings active'
                  : 'Offline-First: Local persistence active'}
              </Text>
              <Pressable
                style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
                disabled={isSyncing}
                onPress={handleManualSync}
              >
                <Text style={styles.syncBtnText}>{isSyncing ? 'SYNCING...' : 'SYNC'}</Text>
              </Pressable>
            </View>

            {syncToast && (
              <View style={styles.syncToastBox}>
                <Text style={styles.syncToastText}>{syncToast}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Section 1: Audio */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AUDIO</Text>
          <View style={styles.cardPanel}>
            {/* Sound Effects */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(234, 29, 36, 0.15)' }]}>
                  <Text style={styles.rowIcon}>🔊</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Sound Effects</Text>
                  <Text style={styles.rowDesc}>Audio for card play, draw, and calls</Text>
                </View>
              </View>
              <Switch
                value={settings.soundEnabled}
                onValueChange={v => handleToggle('soundEnabled', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            {/* Haptics */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                  <Text style={styles.rowIcon}>📳</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Haptic Feedback</Text>
                  <Text style={styles.rowDesc}>Vibration on turn change, draw, UNO call</Text>
                </View>
              </View>
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={v => handleToggle('hapticsEnabled', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* Section 2: Gameplay */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GAMEPLAY</Text>
          <View style={styles.cardPanel}>
            {/* Animations */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Text style={styles.rowIcon}>✨</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Card Animations</Text>
                  <Text style={styles.rowDesc}>Smooth card flight & shuffle sequences</Text>
                </View>
              </View>
              <Switch
                value={settings.animationsEnabled}
                onValueChange={v => handleToggle('animationsEnabled', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* Section 3: User Default Match Rules */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MATCH DEFAULTS (YOUR PREFERENCES)</Text>
          <View style={styles.cardPanel}>
            {/* Default Deck */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(234, 179, 8, 0.15)' }]}>
                  <Text style={styles.rowIcon}>🃏</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Default Deck</Text>
                  <Text style={styles.rowDesc}>{settings.defaultDeck === 'NO_MERCY' ? 'UNO No Mercy (168 Cards)' : 'Modern UNO (112 Cards)'}</Text>
                </View>
              </View>
              <Pressable
                style={styles.pickerPill}
                onPress={() => {
                  NativeEffectsService.triggerCardSelect();
                  const nextDeck = settings.defaultDeck === 'NORMAL' ? 'NO_MERCY' : 'NORMAL';
                  AppSettingsService.updateSetting('defaultDeck', nextDeck);
                }}
              >
                <Text style={styles.pickerPillText}>{settings.defaultDeck === 'NORMAL' ? 'MODERN' : 'NO MERCY'}</Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            {/* Default Game End Mode */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                  <Text style={styles.rowIcon}>🏁</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Default Game End</Text>
                  <Text style={styles.rowDesc}>
                    {settings.defaultGameEndMode === 'FIRST_PLAYER_WINS' ? 'First Player Wins' : 'Play Until Last Player'}
                  </Text>
                </View>
              </View>
              <Pressable
                style={styles.pickerPill}
                onPress={() => {
                  NativeEffectsService.triggerCardSelect();
                  const next = settings.defaultGameEndMode === 'FIRST_PLAYER_WINS' ? 'PLAY_UNTIL_LAST_PLAYER' : 'FIRST_PLAYER_WINS';
                  AppSettingsService.updateSetting('defaultGameEndMode', next);
                }}
              >
                <Text style={styles.pickerPillText}>
                  {settings.defaultGameEndMode === 'FIRST_PLAYER_WINS' ? 'FIRST WINS' : 'UNTIL LAST'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            {/* Stacking */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Default Stacking</Text>
                  <Text style={styles.rowDesc}>Stack +2, +4, +6, +10 penalties</Text>
                </View>
              </View>
              <Switch
                value={settings.defaultStackingEnabled}
                onValueChange={v => handleToggle('defaultStackingEnabled', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            {/* 7-0 Rule */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Default 7-0 Rule</Text>
                  <Text style={styles.rowDesc}>7 swaps hands, 0 passes all hands</Text>
                </View>
              </View>
              <Switch
                value={settings.defaultSevenZeroEnabled}
                onValueChange={v => handleToggle('defaultSevenZeroEnabled', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            {/* Jump-In */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Default Jump-In</Text>
                  <Text style={styles.rowDesc}>Play exact matching card out of turn</Text>
                </View>
              </View>
              <Switch
                value={settings.defaultJumpInEnabled}
                onValueChange={v => handleToggle('defaultJumpInEnabled', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            {/* Draw Until Playable */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Draw Until Playable</Text>
                  <Text style={styles.rowDesc}>Keep drawing cards until a playable card is drawn</Text>
                </View>
              </View>
              <Switch
                value={settings.defaultDrawUntilPlayable}
                onValueChange={v => handleToggle('defaultDrawUntilPlayable', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            {/* Force Play */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Force Play</Text>
                  <Text style={styles.rowDesc}>Automatically play playable cards upon drawing</Text>
                </View>
              </View>
              <Switch
                value={settings.defaultForcePlay}
                onValueChange={v => handleToggle('defaultForcePlay', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Profile Modal */}
      <ProfileModal
        visible={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#040507',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    padding: 20,
    gap: 24,
    paddingBottom: 40,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  cardPanel: {
    backgroundColor: 'rgba(23, 27, 38, 0.85)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  profileAvatarBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: COLORS.goldGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 26,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
  },
  profileIdLabel: {
    color: COLORS.emeraldGlow,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  profileIdText: {
    color: '#64748B',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  editProfileBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  editProfileText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  dividerProfile: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 4,
  },
  cloudStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cloudStatusText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  syncBtn: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.unoGreen,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  syncBtnDisabled: {
    opacity: 0.5,
  },
  syncBtnText: {
    color: COLORS.unoGreen,
    fontSize: 11,
    fontWeight: '800',
  },
  syncToastBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  syncToastText: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIcon: {
    fontSize: 18,
  },
  textWrap: {
    flex: 1,
  },
  rowLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  rowDesc: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  pickerPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  pickerPillText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },
});
