import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { UnoColor } from '../../types/game';
import { COLORS } from '../../constants/theme';
import { NativeEffectsService } from '../../services/NativeEffects';

interface RouletteColorModalProps {
  visible: boolean;
  canChoose: boolean;
  targetName?: string;
  onSelectColor: (color: UnoColor) => void;
}

const COLOR_OPTIONS: { color: UnoColor; label: string; hex: string; emoji: string }[] = [
  { color: 'RED', label: 'RED', hex: COLORS.unoRed, emoji: '🔴' },
  { color: 'YELLOW', label: 'YELLOW', hex: COLORS.unoYellow, emoji: '🟡' },
  { color: 'GREEN', label: 'GREEN', hex: COLORS.unoGreen, emoji: '🟢' },
  { color: 'BLUE', label: 'BLUE', hex: COLORS.unoBlue, emoji: '🔵' },
];

export const NativeRouletteColorModal: React.FC<RouletteColorModalProps> = ({
  visible,
  canChoose,
  targetName = 'Player',
  onSelectColor,
}) => {
  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 250 });
      scale.value = withSpring(1, { damping: 14, stiffness: 120 });
    } else {
      opacity.value = withTiming(0, { duration: 180 });
      scale.value = withTiming(0.8, { duration: 180 });
    }
  }, [visible]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.backdrop, containerAnimatedStyle]}>
      <Animated.View style={[styles.modalCard, cardAnimatedStyle]}>
        <View style={styles.glowHalo} />

        <View style={styles.header}>
          <Text style={styles.titleBadge}>🎯 COLOR ROULETTE</Text>
          <Text style={styles.titleText}>
            {canChoose ? 'CHOOSE YOUR ROULETTE COLOR' : `${targetName.toUpperCase()} IS CHOOSING A COLOR...`}
          </Text>
          <Text style={styles.subText}>
            {canChoose
              ? 'Cards will be drawn one-by-one into your hand until this color appears!'
              : 'Target player must select a color for roulette drawing.'}
          </Text>
        </View>

        {canChoose ? (
          <View style={styles.grid}>
            {COLOR_OPTIONS.map(opt => (
              <Pressable
                key={opt.color}
                style={({ pressed }) => [
                  styles.colorBtn,
                  { backgroundColor: opt.hex },
                  pressed && styles.colorBtnPressed,
                ]}
                onPress={() => {
                  NativeEffectsService.triggerCardPlay();
                  onSelectColor(opt.color);
                }}
              >
                <Text style={styles.colorEmoji}>{opt.emoji}</Text>
                <Text
                  style={[
                    styles.colorLabel,
                    opt.color === 'YELLOW' && { color: '#0F172A' },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingEmoji}>🎯</Text>
            <Text style={styles.waitingText}>Waiting for {targetName} to choose...</Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 15, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modalCard: {
    width: 480,
    backgroundColor: '#1E1528',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#EC4899',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 28,
    elevation: 24,
    overflow: 'hidden',
  },
  glowHalo: {
    position: 'absolute',
    top: -60,
    left: '20%',
    width: '60%',
    height: 120,
    backgroundColor: '#EC4899',
    opacity: 0.25,
    borderRadius: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  titleBadge: {
    fontSize: 11,
    fontWeight: '900',
    color: '#F472B6',
    letterSpacing: 2,
    marginBottom: 4,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 1,
    textAlign: 'center',
  },
  subText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  colorBtn: {
    width: '46%',
    height: 64,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  colorBtnPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
  },
  colorEmoji: {
    fontSize: 22,
  },
  colorLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  waitingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  waitingEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  waitingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#CBD5E1',
    letterSpacing: 0.5,
  },
});
