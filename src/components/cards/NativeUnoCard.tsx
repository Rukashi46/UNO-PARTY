import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { UnoCard } from '../../types/game';
import { COLOR_MAP, COLORS } from '../../constants/theme';
import { NativeEffectsService } from '../../services/NativeEffects';

interface UnoCardProps {
  card: UnoCard;
  isPlayable?: boolean;
  isSelected?: boolean;
  width?: number;
  height?: number;
  onPress?: () => void;
  disabled?: boolean;
}

export const NativeUnoCard: React.FC<UnoCardProps> = ({
  card,
  isPlayable = true,
  isSelected = false,
  width = 144,
  height = 208,
  onPress,
  disabled = false,
}) => {
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  // Sync animation position with isSelected prop
  useEffect(() => {
    if (isSelected) {
      translateY.value = withSpring(-38, { damping: 14, stiffness: 140 });
      scale.value = withSpring(1.08, { damping: 14, stiffness: 140 });
    } else {
      translateY.value = withSpring(0, { damping: 16, stiffness: 160 });
      scale.value = withSpring(1, { damping: 16, stiffness: 160 });
    }
  }, [isSelected]);

  const handlePressIn = () => {
    if (disabled) return;
    if (!isSelected) {
      scale.value = withSpring(1.06, { damping: 12 });
      translateY.value = withSpring(-24, { damping: 12 });
    }
  };

  const handlePressOut = () => {
    if (disabled) return;
    if (!isSelected) {
      scale.value = withSpring(1, { damping: 15 });
      translateY.value = withSpring(0, { damping: 15 });
    } else {
      scale.value = withSpring(1.08, { damping: 15 });
      translateY.value = withSpring(-38, { damping: 15 });
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: scale.value },
        { translateY: translateY.value },
      ],
    };
  });

  const getSymbol = (val: string) => {
    switch (val) {
      case 'SKIP': return '⊘';
      case 'REVERSE': return '⇄';
      case 'DRAW_TWO': return '+2';
      case 'DRAW_FOUR':
      case 'WILD_DRAW_FOUR': return '+4';
      case 'WILD_REVERSE_DRAW_FOUR': return '⇄+4';
      case 'WILD_DRAW_SIX': return '+6';
      case 'WILD_DRAW_TEN': return '+10';
      case 'WILD': return '★';
      case 'CUSTOM_WILD': return '⚡';
      case 'SHUFFLE_HANDS': return '🔀';
      case 'SKIP_EVERYONE': return '⛔';
      case 'DISCARD_ALL': return '🗑';
      case 'WILD_COLOR_ROULETTE': return '🎯';
      default: return val;
    }
  };

  const bgColor = COLOR_MAP[card.color] || COLORS.unoDark;
  const isWild =
    card.color === 'WILD' ||
    card.value === 'WILD' ||
    card.value.startsWith('WILD_') ||
    card.value === 'CUSTOM_WILD' ||
    card.value === 'SHUFFLE_HANDS';
  const symbol = getSymbol(card.value);
  const scaleRatio = width / 144;
  const cornerFontSize = Math.max(16, Math.round(20 * scaleRatio));
  const centerFontSize = Math.max(38, Math.round(52 * scaleRatio));
  const cornerTop = Math.round(8 * scaleRatio);
  const cornerSide = Math.round(10 * scaleRatio);
  const cardBorderRadius = Math.round(18 * scaleRatio);
  const cardBorderWidth = isSelected ? Math.round(4.5 * scaleRatio) : Math.round(3.5 * scaleRatio);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={{ width, height }}
    >
      <Animated.View
        style={[
          styles.cardContainer,
          {
            width,
            height,
            backgroundColor: bgColor,
            borderRadius: cardBorderRadius,
            borderWidth: cardBorderWidth,
          },
          isSelected && styles.cardSelected,
          !isPlayable && styles.cardDimmed,
          animatedStyle,
        ]}
      >
        {/* Top-Left Corner Symbol */}
        <Text
          style={[
            styles.cornerSymbol,
            {
              top: cornerTop,
              left: cornerSide,
              fontSize: cornerFontSize,
            },
          ]}
        >
          {symbol}
        </Text>

        {/* Center Angled White/Dark Oval */}
        <View style={styles.centerOvalWrapper}>
          <View style={[styles.centerOval, isWild && styles.wildOval]}>
            {isWild ? (
              <View style={styles.wildWheel}>
                <View style={[styles.quadrant, { backgroundColor: COLORS.unoRed }]} />
                <View style={[styles.quadrant, { backgroundColor: COLORS.unoBlue }]} />
                <View style={[styles.quadrant, { backgroundColor: COLORS.unoYellow }]} />
                <View style={[styles.quadrant, { backgroundColor: COLORS.unoGreen }]} />
                {symbol !== '★' && (
                  <View style={styles.wildSymbolBadge}>
                    <Text style={[styles.wildBadgeText, { fontSize: Math.round(22 * scaleRatio) }]}>
                      {symbol}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={[styles.centerSymbol, { color: bgColor, fontSize: centerFontSize }]}>
                {symbol}
              </Text>
            )}
          </View>
        </View>

        {/* Bottom-Right Inverted Corner Symbol */}
        <Text
          style={[
            styles.cornerSymbol,
            {
              bottom: cornerTop,
              right: cornerSide,
              fontSize: cornerFontSize,
              transform: [{ rotate: '180deg' }],
            },
          ]}
        >
          {symbol}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 18,
    borderWidth: 3.5,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  cardSelected: {
    borderColor: COLORS.goldGlow,
    borderWidth: 4.5,
    shadowColor: COLORS.goldGlow,
    shadowOpacity: 0.9,
    shadowRadius: 18,
  },
  cardDimmed: {
    opacity: 0.6,
  },
  cornerSymbol: {
    position: 'absolute',
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 20,
    fontStyle: 'italic',
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  cornerTopLeft: {
    top: 8,
    left: 10,
  },
  cornerBottomRight: {
    bottom: 8,
    right: 10,
    transform: [{ rotate: '180deg' }],
  },
  centerOvalWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOval: {
    width: '78%',
    height: '68%',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '-26deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  wildOval: {
    backgroundColor: '#1E1E24',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  centerSymbol: {
    fontSize: 52,
    fontWeight: '900',
    fontStyle: 'italic',
    transform: [{ rotate: '26deg' }],
  },
  wildWheel: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quadrant: {
    width: '50%',
    height: '50%',
  },
  wildSymbolBadge: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: '#FFF',
    transform: [{ rotate: '26deg' }],
  },
  wildBadgeText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 22,
  },
});
