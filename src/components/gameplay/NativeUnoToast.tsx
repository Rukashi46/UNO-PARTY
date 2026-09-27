import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../../constants/theme';

interface UnoToastProps {
  visible: boolean;
  type?: 'success' | 'warning' | 'penalty';
  title?: string;
  message?: string;
}

export const NativeUnoToast: React.FC<UnoToastProps> = ({
  visible,
  type = 'success',
  title = 'UNO!',
  message = 'CALL REGISTERED!',
}) => {
  const translateY = useSharedValue(20);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 12, stiffness: 140 });
      scale.value = withSpring(1, { damping: 12, stiffness: 140 });
      opacity.value = withTiming(1, { duration: 180 });
    } else {
      translateY.value = withTiming(15, { duration: 200 });
      scale.value = withTiming(0.9, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  if (!visible) return null;

  const isSuccess = type === 'success';
  const isWarning = type === 'warning';

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        isSuccess && styles.successToast,
        isWarning && styles.warningToast,
        type === 'penalty' && styles.penaltyToast,
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.iconCircle,
          isSuccess && { backgroundColor: COLORS.unoRed },
          isWarning && { backgroundColor: COLORS.unoYellow },
          type === 'penalty' && { backgroundColor: '#7F1D1D' },
        ]}
      >
        <Text style={styles.iconText}>
          {isSuccess ? '🔥' : isWarning ? '⚠️' : '🚨'}
        </Text>
      </View>
      <View style={styles.textColumn}>
        <Text
          style={[
            styles.toastTitle,
            isSuccess && { color: COLORS.unoYellow },
            isWarning && { color: '#FEDB00' },
            type === 'penalty' && { color: '#F87171' },
          ]}
        >
          {title}
        </Text>
        <Text style={styles.toastMessage}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: 228,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 12, 22, 0.95)',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.unoRed,
    paddingVertical: 10,
    paddingHorizontal: 22,
    gap: 12,
    shadowColor: COLORS.unoRed,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 18,
    elevation: 25,
    zIndex: 90,
  },
  successToast: {
    borderColor: COLORS.goldGlow,
    shadowColor: COLORS.goldGlow,
  },
  warningToast: {
    borderColor: COLORS.unoYellow,
    shadowColor: COLORS.unoYellow,
  },
  penaltyToast: {
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  iconText: {
    fontSize: 18,
  },
  textColumn: {
    justifyContent: 'center',
  },
  toastTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  toastMessage: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
