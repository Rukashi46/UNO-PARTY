import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { COLORS } from '../../constants/theme';

interface DrawPileProps {
  count: number;
  onPress: () => void;
  width?: number;
  height?: number;
}

export const NativeDrawPile: React.FC<DrawPileProps> = ({
  count,
  onPress,
  width = 176,
  height = 256,
}) => {
  return (
    <Pressable onPress={onPress} style={[styles.container, { width, height }]}>
      {/* 3D Depth Card Stacks */}
      <View style={[styles.depthLayer, styles.layer3, { width, height }]} />
      <View style={[styles.depthLayer, styles.layer2, { width, height }]} />
      <View style={[styles.depthLayer, styles.layer1, { width, height }]} />

      {/* Top Face Card */}
      <View style={[styles.faceCard, { width, height }]}>
        <View style={styles.innerOval}>
          <Text style={styles.unoLogo}>UNO</Text>
        </View>
      </View>

      {/* Pile Badge */}
      <View style={styles.badgeContainer}>
        <Text style={styles.drawText}>DRAW</Text>
        <Text style={styles.countText}>{count} cards</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  depthLayer: {
    position: 'absolute',
    borderRadius: 20,
    backgroundColor: '#0F0E13',
    borderColor: '#334155',
    borderWidth: 2,
  },
  layer3: {
    top: 6,
    left: 6,
    backgroundColor: '#09080E',
  },
  layer2: {
    top: 4,
    left: 4,
    backgroundColor: '#161520',
  },
  layer1: {
    top: 2,
    left: 2,
    backgroundColor: '#1E1D2A',
  },
  faceCard: {
    backgroundColor: '#000000',
    borderRadius: 20,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  innerOval: {
    width: '74%',
    height: '76%',
    borderRadius: 999,
    backgroundColor: COLORS.unoRed,
    transform: [{ rotate: '-25deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  unoLogo: {
    color: COLORS.unoYellow,
    fontSize: 44,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -2,
    transform: [{ rotate: '-5deg' }],
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 3 },
    textShadowRadius: 1,
  },
  badgeContainer: {
    position: 'absolute',
    bottom: -36,
    alignItems: 'center',
  },
  drawText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 2,
  },
  countText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
});
