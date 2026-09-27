import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { UnoColor, UnoCard } from '../../types/game';
import { COLORS } from '../../constants/theme';
import { NativeEffectsService } from '../../services/NativeEffects';

interface WildColorPickerProps {
  visible: boolean;
  wildCard?: UnoCard | null;
  canChoose?: boolean;
  chooserName?: string;
  onSelectColor: (color: UnoColor) => void;
}

const COLOR_OPTIONS: { color: UnoColor; label: string; hex: string; emoji: string }[] = [
  { color: 'RED', label: 'RED', hex: COLORS.unoRed, emoji: '🔴' },
  { color: 'YELLOW', label: 'YELLOW', hex: COLORS.unoYellow, emoji: '🟡' },
  { color: 'GREEN', label: 'GREEN', hex: COLORS.unoGreen, emoji: '🟢' },
  { color: 'BLUE', label: 'BLUE', hex: COLORS.unoBlue, emoji: '🔵' },
];

export const NativeWildColorPicker: React.FC<WildColorPickerProps> = ({
  visible,
  wildCard,
  canChoose = true,
  chooserName = 'Player',
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

  const cardTitle = wildCard?.value.replace(/_/g, ' ') || 'WILD CARD';

  return (
    <Animated.View style={[styles.backdrop, containerAnimatedStyle]}>
      <Animated.View style={[styles.modalCard, cardAnimatedStyle]}>
        {/* Glow Halo */}
        <View style={styles.glowHalo} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.titleBadge}>PARTY WILD PLAY</Text>
          <Text style={styles.titleText}>
            {canChoose ? 'CHOOSE A COLOR' : `${chooserName.toUpperCase()} IS CHOOSING A COLOR...`}
          </Text>
          <Text style={styles.subText}>
            {canChoose ? (
              <>
                Selected: <Text style={{ color: COLORS.goldGlow, fontWeight: '900' }}>{cardTitle}</Text>
              </>
            ) : (
              'Waiting for player to select active color.'
            )}
          </Text>
        </View>

        {canChoose ? (
          /* 2x2 Grid of 4 Colors */
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
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>🎨</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#CBD5E1', letterSpacing: 0.5 }}>
              Waiting for {chooserName}...
            </Text>
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
    backgroundColor: 'rgba(5, 4, 10, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modalCard: {
    width: 520,
    backgroundColor: 'rgba(23, 18, 30, 0.96)',
    borderRadius: 28,
    borderWidth: 2.5,
    borderColor: COLORS.goldGlow,
    padding: 32,
    alignItems: 'center',
    shadowColor: COLORS.goldGlow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 28,
    elevation: 20,
    position: 'relative',
  },
  glowHalo: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  titleBadge: {
    color: COLORS.goldGlow,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  subText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  colorBtn: {
    width: '47%',
    height: 74,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  colorBtnPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  colorEmoji: {
    fontSize: 22,
  },
  colorLabel: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
  },
});
