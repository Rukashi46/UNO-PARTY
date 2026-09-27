import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Player } from '../../types/game';
import { COLORS } from '../../constants/theme';

interface GameOverModalProps {
  visible: boolean;
  winner: Player | { name: string; avatar: string; isHuman: boolean } | null;
  onPlayAgain: () => void;
  onExit: () => void;
}

export const NativeGameOverModal: React.FC<GameOverModalProps> = ({
  visible,
  winner,
  onPlayAgain,
  onExit,
}) => {
  if (!visible || !winner) return null;

  const isLocalWinner = winner.isHuman;

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        {/* Glow border */}
        <View style={[styles.halo, isLocalWinner ? styles.winHalo : styles.loseHalo]} />

        {/* Trophy / Icon */}
        <Text style={styles.trophy}>{isLocalWinner ? '🏆' : '👑'}</Text>

        {/* Title */}
        <Text
          style={[
            styles.title,
            { color: isLocalWinner ? COLORS.goldGlow : COLORS.unoYellow },
          ]}
        >
          {isLocalWinner ? 'VICTORY!' : 'ROUND OVER!'}
        </Text>

        {/* Winner Info */}
        <View style={styles.winnerPill}>
          <Text style={styles.winnerAvatar}>{winner.avatar}</Text>
          <Text style={styles.winnerText}>
            {winner.name} {isLocalWinner ? '(YOU)' : ''} WINS!
          </Text>
        </View>

        <Text style={styles.subtext}>
          {isLocalWinner
            ? 'Outstanding party play! You cleared all your cards first!'
            : `${winner.name} got rid of all their cards and took the round!`}
        </Text>

        {/* Buttons */}
        <View style={styles.btnRow}>
          <Pressable
            style={({ pressed }) => [styles.playBtn, pressed && styles.btnPressed]}
            onPress={onPlayAgain}
          >
            <Text style={styles.playBtnText}>PLAY AGAIN</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.exitBtn, pressed && styles.btnPressed]}
            onPress={onExit}
          >
            <Text style={styles.exitBtnText}>LOBBY</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 4, 10, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 110,
  },
  card: {
    width: 560,
    backgroundColor: 'rgba(20, 16, 28, 0.98)',
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: COLORS.goldGlow,
    paddingVertical: 36,
    paddingHorizontal: 40,
    alignItems: 'center',
    shadowColor: COLORS.goldGlow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 32,
    elevation: 24,
    position: 'relative',
  },
  halo: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 34,
    borderWidth: 1,
  },
  winHalo: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  loseHalo: {
    borderColor: 'rgba(234, 29, 36, 0.4)',
  },
  trophy: {
    fontSize: 54,
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  winnerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 10,
  },
  winnerAvatar: {
    fontSize: 24,
  },
  winnerText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  subtext: {
    color: '#CBD5E1',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 28,
    lineHeight: 22,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  playBtn: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.unoGreen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#34D399',
    shadowColor: COLORS.unoGreen,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  playBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  exitBtn: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  exitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
