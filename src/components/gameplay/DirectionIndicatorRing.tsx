import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS } from '../../constants/theme';

interface DirectionIndicatorRingProps {
  direction: 'CW' | 'CCW';
  activeColor?: string;
}

export const DirectionIndicatorRing: React.FC<DirectionIndicatorRingProps> = ({
  direction,
  activeColor = COLORS.unoYellow,
}) => {
  // Continuous rotation value
  const rotation = useSharedValue(0);
  // Scale / flip transition value on reverse (1 for CW, -1 for CCW)
  const directionMultiplier = useSharedValue(direction === 'CW' ? 1 : -1);
  const glowPulse = useSharedValue(0.35);

  useEffect(() => {
    // 500ms smooth transition when direction reverses (Requirement 55)
    directionMultiplier.value = withTiming(direction === 'CW' ? 1 : -1, {
      duration: 550,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [direction]);

  useEffect(() => {
    // Smooth infinite rotation
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 14000,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    // Subtle gentle glow breathing
    glowPulse.value = withRepeat(
      withTiming(0.55, {
        duration: 2200,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );

    return () => {
      cancelAnimation(rotation);
      cancelAnimation(glowPulse);
    };
  }, []);

  const animatedRingStyle = useAnimatedStyle(() => {
    const currentAngle = rotation.value * directionMultiplier.value;
    return {
      transform: [
        { rotate: `${currentAngle}deg` },
        { scaleY: 0.72 }, // Elliptical table match
      ],
      opacity: glowPulse.value,
    };
  });

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.ring, animatedRingStyle]}>
        {/* Curved Track Border */}
        <View style={styles.trackBorder} />

        {/* 4 Directional Chevron Pointer Accents positioned at 0, 90, 180, 270 deg */}
        <View style={[styles.arrowMarker, { top: -14, left: '50%', marginLeft: -12 }]}>
          <View style={styles.chevronArrow} />
        </View>

        <View style={[styles.arrowMarker, { bottom: -14, left: '50%', marginLeft: -12 }]}>
          <View style={[styles.chevronArrow, { transform: [{ rotate: '180deg' }] }]} />
        </View>

        <View style={[styles.arrowMarker, { right: -14, top: '50%', marginTop: -12 }]}>
          <View style={[styles.chevronArrow, { transform: [{ rotate: '90deg' }] }]} />
        </View>

        <View style={[styles.arrowMarker, { left: -14, top: '50%', marginTop: -12 }]}>
          <View style={[styles.chevronArrow, { transform: [{ rotate: '-90deg' }] }]} />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 680,
    height: 480,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1, // Behind center card piles (zIndex 10) and above table background
  },
  ring: {
    width: 580,
    height: 580,
    borderRadius: 290,
    borderWidth: 3,
    borderColor: 'rgba(251, 191, 36, 0.4)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: COLORS.goldGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
  },
  trackBorder: {
    position: 'absolute',
    width: 560,
    height: 560,
    borderRadius: 280,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  arrowMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronArrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.unoYellow,
    shadowColor: COLORS.goldGlow,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
});
