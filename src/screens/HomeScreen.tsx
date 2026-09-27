import React from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { COLORS } from '../constants/theme';
import { GameMode } from '../types/game';
import { NativeEffectsService } from '../services/NativeEffects';

interface HomeScreenProps {
  onSelectMode: (mode: GameMode) => void;
  onOpenSettings: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onSelectMode, onOpenSettings }) => {
  const modes: { id: GameMode; title: string; subtitle: string; icon: string; color: string }[] = [
    { id: 'ONLINE', title: 'ONLINE', subtitle: 'Play with friends worldwide', icon: '🌐', color: COLORS.unoRed },
    { id: 'WLAN', title: 'WLAN', subtitle: 'Play on local network', icon: '📡', color: COLORS.unoBlue },
    { id: 'PLAY_BOTS', title: 'PLAY BOTS', subtitle: 'Practice offline with AI', icon: '🤖', color: COLORS.unoGreen },
    { id: 'PASS_AND_PLAY', title: 'PASS & PLAY', subtitle: 'On the same device', icon: '👥', color: '#9333EA' },
  ];

  return (
    <View style={styles.container}>
      {/* User Status Bar */}
      <View style={styles.header}>
        <View style={styles.userProfile}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarEmoji}>👦🏻</Text>
            <View style={styles.onlineDot} />
          </View>
          <View>
            <Text style={styles.username}>VARUN</Text>
            <Text style={styles.onlineStatus}>● Online</Text>
          </View>
        </View>

        <Pressable
          onPress={() => {
            NativeEffectsService.triggerCardSelect();
            onOpenSettings();
          }}
          style={styles.settingsBtn}
        >
          <Text style={styles.gearIcon}>⚙️</Text>
        </Pressable>
      </View>

      {/* 4 Big Glass Mode Cards */}
      <ScrollView contentContainerStyle={styles.modeCardsList} showsVerticalScrollIndicator={false}>
        {modes.map(mode => (
          <Pressable
            key={mode.id}
            style={({ pressed }) => [
              styles.modeCard,
              { borderColor: `${mode.color}55` },
              pressed && styles.cardPressed,
            ]}
            onPress={() => {
              NativeEffectsService.triggerCardSelect();
              onSelectMode(mode.id);
            }}
          >
            <View style={[styles.iconBox, { backgroundColor: mode.color }]}>
              <Text style={styles.modeIcon}>{mode.icon}</Text>
            </View>

            <View style={styles.modeTextCol}>
              <Text style={styles.modeTitle}>{mode.title}</Text>
              <Text style={styles.modeSubtitle}>{mode.subtitle}</Text>
            </View>

            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  userProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E293B',
    borderWidth: 2,
    borderColor: '#EC4899',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarEmoji: {
    fontSize: 22,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.unoGreen,
    borderWidth: 2,
    borderColor: '#000',
  },
  username: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  onlineStatus: {
    color: COLORS.emeraldGlow,
    fontSize: 12,
    fontWeight: '700',
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearIcon: {
    fontSize: 18,
  },
  modeCardsList: {
    gap: 16,
    paddingBottom: 40,
  },
  modeCard: {
    height: 104,
    backgroundColor: 'rgba(23, 27, 38, 0.85)',
    borderRadius: 26,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  modeIcon: {
    fontSize: 26,
  },
  modeTextCol: {
    flex: 1,
  },
  modeTitle: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 1,
  },
  modeSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  chevron: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 26,
    fontWeight: '600',
  },
});
