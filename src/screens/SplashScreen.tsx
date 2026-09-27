import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { COLORS } from '../constants/theme';
import { NativeEffectsService } from '../services/NativeEffects';

interface SplashScreenProps {
  onStart: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onStart }) => {
  return (
    <Pressable style={styles.container} onPress={onStart}>
      {/* Background fiery radial ambience */}
      <View style={styles.ambientBackdrop} />

      {/* Floating 3D Cards Simulation */}
      <View style={styles.floatingCardsWrap}>
        <View style={[styles.floatingCard, styles.cardLeft]}>
          <Text style={styles.miniCardLogo}>UNO</Text>
        </View>
        <View style={[styles.floatingCard, styles.cardRight]}>
          <Text style={styles.miniCardLogo}>+4</Text>
        </View>
      </View>

      {/* 3D Embossed UNO Title */}
      <View style={styles.titleWrap}>
        <Text style={styles.uno3dTitle}>UNO</Text>
        <Text style={styles.partySubtitle}>PARTY</Text>
      </View>

      {/* Tap to Play prompt */}
      <View style={styles.footerPrompt}>
        <Text style={styles.tapText}>TAP ANYWHERE TO PLAY</Text>
        <Text style={styles.versionText}>CROSS-PLATFORM EDITION • IOS & ANDROID</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050304',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 60,
  },
  ambientBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#3E0A0A',
    opacity: 0.35,
  },
  floatingCardsWrap: {
    width: 220,
    height: 180,
    marginTop: 60,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCard: {
    width: 100,
    height: 140,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 8,
  },
  cardLeft: {
    backgroundColor: COLORS.unoRed,
    transform: [{ rotate: '-15deg' }, { translateX: -30 }],
    zIndex: 1,
  },
  cardRight: {
    backgroundColor: COLORS.unoDark,
    transform: [{ rotate: '12deg' }, { translateX: 30 }, { translateY: 20 }],
    zIndex: 2,
    borderColor: COLORS.goldGlow,
  },
  miniCardLogo: {
    color: COLORS.unoYellow,
    fontSize: 28,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  titleWrap: {
    alignItems: 'center',
  },
  uno3dTitle: {
    fontSize: 100,
    fontWeight: '900',
    fontStyle: 'italic',
    color: COLORS.unoRed,
    letterSpacing: -4,
    textShadowColor: '#7A0612',
    textShadowOffset: { width: 0, height: 8 },
    textShadowRadius: 12,
  },
  partySubtitle: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 8,
    color: COLORS.unoYellow,
    marginTop: -16,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 4,
  },
  footerPrompt: {
    alignItems: 'center',
    gap: 8,
  },
  tapText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 2,
  },
  versionText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
