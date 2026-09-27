import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { NativeUnoCard } from '../cards/NativeUnoCard';
import { UnoCard, UnoColor } from '../../types/game';
import { COLOR_MAP, COLORS } from '../../constants/theme';

interface DiscardPileProps {
  topCard: UnoCard | null;
  activeColor: UnoColor;
  width?: number;
  height?: number;
}

export const NativeDiscardPile: React.FC<DiscardPileProps> = ({
  topCard,
  activeColor,
  width = 176,
  height = 256,
}) => {
  return (
    <View style={[styles.container, { width, height }]}>
      {/* Underlying drop shadow card */}
      <View style={[styles.shadowCard, { width, height }]} />

      {/* Faceup Discard Card */}
      {topCard ? (
        <View style={{ transform: [{ rotate: '-2.5deg' }] }}>
          <NativeUnoCard card={topCard} width={width} height={height} isPlayable={true} />
        </View>
      ) : (
        <View style={[styles.emptyCard, { width, height }]} />
      )}

      {/* Discard Badge */}
      <View style={styles.badgeContainer}>
        <Text style={styles.discardText}>DISCARD</Text>
        <View style={styles.activeColorRow}>
          <View style={[styles.colorDot, { backgroundColor: COLOR_MAP[activeColor] || COLORS.unoYellow }]} />
          <Text style={[styles.colorText, { color: COLOR_MAP[activeColor] || COLORS.unoYellow }]}>
            {activeColor}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  shadowCard: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: '#1E1D2A',
  },
  badgeContainer: {
    position: 'absolute',
    bottom: -36,
    alignItems: 'center',
  },
  discardText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 2,
  },
  activeColorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  colorText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
});
