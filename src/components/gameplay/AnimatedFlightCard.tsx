import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { UnoCard } from '../../types/game';
import { NativeUnoCard } from '../cards/NativeUnoCard';
import { COLORS } from '../../constants/theme';

interface FlightCardProps {
  active: boolean;
  card: UnoCard | null;
  isDrawFlight?: boolean;
  startPos: { x: number; y: number };
  endPos: { x: number; y: number };
  onComplete: () => void;
  width?: number;
  height?: number;
}

export const AnimatedFlightCard: React.FC<FlightCardProps> = ({
  active,
  card,
  isDrawFlight = true,
  startPos,
  endPos,
  onComplete,
  width = 156,
  height = 226,
}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withTiming(
        1,
        {
          duration: isDrawFlight ? 600 : 540,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        },
        (finished) => {
          if (finished) {
            runOnJS(onComplete)();
          }
        }
      );
    } else {
      progress.value = 0;
    }
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const curX = startPos.x + (endPos.x - startPos.x) * p;
    // Parabolic arc for realistic card toss physics
    const arcHeight = -70;
    const curY = startPos.y + (endPos.y - startPos.y) * p + arcHeight * Math.sin(p * Math.PI);
    const rotation = (p * 20 - 10) + 'deg';
    const scale = 1 + 0.15 * Math.sin(p * Math.PI);

    return {
      left: curX - width / 2,
      top: curY - height / 2,
      transform: [
        { rotate: rotation },
        { scale },
      ],
      opacity: p < 0.05 ? p * 20 : 1,
    };
  });

  if (!active || !card) return null;

  return (
    <Animated.View style={[styles.container, { width, height }, animatedStyle]} pointerEvents="none">
      {isDrawFlight ? (
        // Authentic UNO card back for drawing flight
        <View style={[styles.cardBack, { width, height }]}>
          <View style={styles.backBorder}>
            <View style={styles.backOval}>
              <Text style={styles.backUnoText}>UNO</Text>
            </View>
          </View>
        </View>
      ) : (
        // Played card face flying to discard pile
        <NativeUnoCard card={card} width={width} height={height} isPlayable={true} />
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 144,
    height: 208,
    zIndex: 85,
  },
  cardBack: {
    width: 144,
    height: 208,
    borderRadius: 18,
    backgroundColor: '#0F0E13',
    borderWidth: 3.5,
    borderColor: '#FFFFFF',
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 16,
    elevation: 12,
  },
  backBorder: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#262432',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backOval: {
    width: '74%',
    height: '76%',
    borderRadius: 999,
    backgroundColor: COLORS.unoRed,
    transform: [{ rotate: '-25deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  backUnoText: {
    color: COLORS.unoYellow,
    fontSize: 34,
    fontWeight: '900',
    fontStyle: 'italic',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3,
  },
});
