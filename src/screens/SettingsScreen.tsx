import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { COLORS } from '../constants/theme';
import { AppSettings, AppSettingsService } from '../services/AppSettingsService';
import { NativeEffectsService } from '../services/NativeEffects';
import { PlayerIdentityService, PlayerIdentity } from '../services/PlayerIdentityService';
import { isSupabaseConfigured } from '../multiplayer/SupabaseClient';

interface SettingsScreenProps {
  onBack: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack }) => {
  const [settings, setSettings] = useState<AppSettings>(AppSettingsService.getSettings());
  const [identity, setIdentity] = useState<PlayerIdentity | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  useEffect(() => {
    AppSettingsService.init().then(s => setSettings(s));
    PlayerIdentityService.getIdentity().then(id => setIdentity(id));
    const unsubscribe = AppSettingsService.subscribe(newSettings => {
      setSettings(newSettings);
    });
    return unsubscribe;
  }, []);

  const handleToggle = (key: keyof AppSettings, val: boolean) => {
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
        {/* Section 0: User Profile & Supabase Cloud */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>USER PROFILE & SUPABASE CLOUD</Text>
          <View style={styles.cardPanel}>
            <View style={styles.profileRow}>
              <View style={styles.profileAvatarBox}>
                <Text style={styles.profileAvatarText}>{identity?.avatar || '👦🏻'}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{identity?.name || 'VARUN'}</Text>
                <Text style={styles.profileIdLabel}>UNIQUE USER ID (UUID)</Text>
                <Text style={styles.profileIdText} numberOfLines={1} ellipsizeMode="middle">
                  {identity?.id || 'Loading ID...'}
                </Text>
              </View>
              <Pressable
                style={[styles.syncBtn, isSyncing && styles.syncBtnDisabled]}
                disabled={isSyncing}
                onPress={handleManualSync}
              >
                <Text style={styles.syncBtnText}>{isSyncing ? 'SYNCING...' : 'SYNC NOW'}</Text>
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
                  ? 'Supabase profiles table: User ID and settings synchronized'
                  : 'Local Storage Active: Offline fallback mode enabled'}
              </Text>
            </View>

            {syncToast && (
              <View style={styles.syncToastBox}>
                <Text style={styles.syncToastText}>{syncToast}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Section 1: App Experience */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APP EXPERIENCE</Text>
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

            {/* Music */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(254, 219, 0, 0.15)' }]}>
                  <Text style={styles.rowIcon}>🎵</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Music</Text>
                  <Text style={styles.rowDesc}>Background ambient music in menu & match</Text>
                </View>
              </View>
              <Switch
                value={settings.musicEnabled}
                onValueChange={v => handleToggle('musicEnabled', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            {/* Haptics */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(0, 166, 81, 0.15)' }]}>
                  <Text style={styles.rowIcon}>📳</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Haptic Feedback</Text>
                  <Text style={styles.rowDesc}>Tactile vibration pulses on taps and turns</Text>
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
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(0, 133, 200, 0.15)' }]}>
                  <Text style={styles.rowIcon}>✨</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Card Animations</Text>
                  <Text style={styles.rowDesc}>Physics flight trajectories and shockwaves</Text>
                </View>
              </View>
              <Switch
                value={settings.animationsEnabled}
                onValueChange={v => handleToggle('animationsEnabled', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            {/* Card Confirmation */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                  <Text style={styles.rowIcon}>👆</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Card Confirmation</Text>
                  <Text style={styles.rowDesc}>Two-tap play: Tap 1 to select, Tap 2 to play</Text>
                </View>
              </View>
              <Switch
                value={settings.cardConfirmation}
                onValueChange={v => handleToggle('cardConfirmation', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            {/* Turn Notifications */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                  <Text style={styles.rowIcon}>🔔</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Show Turn Notifications</Text>
                  <Text style={styles.rowDesc}>Alert banners when it becomes your turn</Text>
                </View>
              </View>
              <Switch
                value={settings.turnNotifications}
                onValueChange={v => handleToggle('turnNotifications', v)}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* Section 3: Appearance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APPEARANCE</Text>
          <View style={styles.cardPanel}>
            <Pressable style={styles.navRow}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(234, 29, 36, 0.15)' }]}>
                  <Text style={styles.rowIcon}>🎨</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Theme</Text>
                  <Text style={styles.rowDesc}>Visual board & table style</Text>
                </View>
              </View>
              <View style={styles.navRight}>
                <Text style={styles.valueText}>{settings.theme}</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Section 4: Language */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LANGUAGE</Text>
          <View style={styles.cardPanel}>
            <Pressable style={styles.navRow}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(0, 133, 200, 0.15)' }]}>
                  <Text style={styles.rowIcon}>🌐</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Language</Text>
                  <Text style={styles.rowDesc}>Interface and card text language</Text>
                </View>
              </View>
              <View style={styles.navRight}>
                <Text style={styles.valueText}>{settings.language}</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Section 5: About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
          <View style={styles.cardPanel}>
            <Pressable style={styles.navRow}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(254, 219, 0, 0.15)' }]}>
                  <Text style={styles.rowIcon}>ℹ️</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>About UNO PARTY</Text>
                  <Text style={styles.rowDesc}>Classic Party Card Game Native Edition</Text>
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            <View style={styles.divider} />

            <View style={styles.navRow}>
              <View style={styles.rowLeft}>
                <View style={[styles.iconWrap, { backgroundColor: 'rgba(255, 255, 255, 0.08)' }]}>
                  <Text style={styles.rowIcon}>📱</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.rowLabel}>Version</Text>
                  <Text style={styles.rowDesc}>Production Release</Text>
                </View>
              </View>
              <Text style={styles.valueText}>v1.0.0 (Native)</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#040507',
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  backArrow: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 40,
    gap: 22,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  cardPanel: {
    backgroundColor: 'rgba(20, 16, 28, 0.85)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    paddingRight: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
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
    letterSpacing: 0.3,
  },
  rowDesc: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  valueText: {
    color: COLORS.goldGlow,
    fontSize: 13,
    fontWeight: '700',
  },
  chevron: {
    color: '#64748B',
    fontSize: 20,
    fontWeight: '300',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginLeft: 68,
  },
  dividerProfile: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginHorizontal: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  profileAvatarBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 24,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  profileIdLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  profileIdText: {
    color: COLORS.goldGlow,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
    marginTop: 1,
  },
  syncBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1.5,
    borderColor: COLORS.goldGlow,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  syncBtnDisabled: {
    opacity: 0.5,
  },
  syncBtnText: {
    color: COLORS.goldGlow,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cloudStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
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
  syncToastBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(34, 197, 94, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  syncToastText: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
