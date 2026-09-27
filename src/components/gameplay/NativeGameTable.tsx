import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { COLORS } from '../../constants/theme';

export const NativeGameTable: React.FC = () => {
  return (
    <View style={styles.tableFelt}>
      {/* Outer Glow Ring */}
      <View style={styles.feltBorderRing} />

      {/* Debossed Center Watermark */}
      <Text style={styles.debossedLogo}>UNO</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  tableFelt: {
    width: 1640,
    height: 820,
    borderRadius: 410,
    backgroundColor: '#3E0A0A',
    borderWidth: 16,
    borderColor: '#2D0A0A',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: COLORS.unoRed,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 50,
  },
  feltBorderRing: {
    position: 'absolute',
    width: 1644,
    height: 824,
    borderRadius: 412,
    borderWidth: 4,
    borderColor: COLORS.feltRim,
  },
  debossedLogo: {
    fontSize: 220,
    fontWeight: '900',
    fontStyle: 'italic',
    color: 'rgba(20, 2, 2, 0.4)',
    letterSpacing: -6,
    transform: [{ rotate: '-12deg' }],
  },
});
