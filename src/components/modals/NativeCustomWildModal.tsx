import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { CustomWildPower } from '../../types/game';
import { COLORS } from '../../constants/theme';
import { NativeEffectsService } from '../../services/NativeEffects';

interface CustomWildModalProps {
  visible: boolean;
  canChoose: boolean;
  chooserName?: string;
  onSelectPower: (power: CustomWildPower) => void;
}

export const NativeCustomWildModal: React.FC<CustomWildModalProps> = ({
  visible,
  canChoose,
  chooserName = 'Player',
  onSelectPower,
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
          <Text style={styles.titleBadge}>CUSTOM WILD POWER</Text>
          <Text style={styles.titleText}>
            {canChoose ? 'CHOOSE YOUR POWER' : `${chooserName.toUpperCase()} IS CHOOSING A POWER...`}
          </Text>
          <Text style={styles.subText}>
            {canChoose
              ? 'Select which special rule to unleash upon the table!'
              : 'Please wait while the card player makes their choice.'}
          </Text>
        </View>

        {canChoose ? (
          <View style={styles.optionsRow}>
            {/* Option 1: Shuffle Hands */}
            <Pressable
              style={({ pressed }) => [
                styles.powerCard,
                styles.shuffleCard,
                pressed && styles.powerCardPressed,
              ]}
              onPress={() => {
                NativeEffectsService.triggerCardPlay();
                onSelectPower('SHUFFLE_HANDS');
              }}
            >
              <Text style={styles.powerEmoji}>🔀</Text>
              <Text style={styles.powerTitle}>SHUFFLE HANDS</Text>
              <Text style={styles.powerDesc}>
                Pool all active cards, shuffle, and redeal one by one!
              </Text>
            </Pressable>

            {/* Option 2: Everyone +4 */}
            <Pressable
              style={({ pressed }) => [
                styles.powerCard,
                styles.plusFourCard,
                pressed && styles.powerCardPressed,
              ]}
              onPress={() => {
                NativeEffectsService.triggerCardPlay();
                onSelectPower('EVERYONE_PLUS_FOUR');
              }}
            >
              <Text style={styles.powerEmoji}>💥</Text>
              <Text style={styles.powerTitle}>EVERYONE +4</Text>
              <Text style={styles.powerDesc}>
                Every other player receives +4 penalty cards!
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingEmoji}>⏳</Text>
            <Text style={styles.waitingText}>Waiting for {chooserName}...</Text>
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
    width: 580,
    backgroundColor: '#1E1528',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#9333EA',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#9333EA',
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
    backgroundColor: '#9333EA',
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
    color: '#C084FC',
    letterSpacing: 2,
    marginBottom: 4,
  },
  titleText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 1,
    textAlign: 'center',
  },
  subText: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  powerCard: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  shuffleCard: {
    backgroundColor: '#1E293B',
    borderColor: '#38BDF8',
  },
  plusFourCard: {
    backgroundColor: '#2D1515',
    borderColor: '#EF4444',
  },
  powerCardPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.85,
  },
  powerEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  powerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 6,
  },
  powerDesc: {
    fontSize: 11,
    color: '#CBD5E1',
    textAlign: 'center',
    lineHeight: 16,
  },
  waitingContainer: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  waitingEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  waitingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#CBD5E1',
    letterSpacing: 0.5,
  },
});
