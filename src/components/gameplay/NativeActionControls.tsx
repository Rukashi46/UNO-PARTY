import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { COLORS } from '../../constants/theme';
import { NativeEffectsService } from '../../services/NativeEffects';

interface ActionControlsProps {
  canDraw: boolean;
  canEndTurn: boolean;
  hasUnoAlert?: boolean;
  onDraw: () => void;
  onCallUno: () => void;
  onEndTurn: () => void;
  disabled?: boolean;
}

export const NativeActionControls: React.FC<ActionControlsProps> = ({
  canDraw,
  canEndTurn,
  hasUnoAlert = false,
  onDraw,
  onCallUno,
  onEndTurn,
  disabled = false,
}) => {
  const isDrawEnabled = canDraw && !disabled;
  const isEndEnabled = canEndTurn && !disabled;

  return (
    <View style={styles.container}>
      {/* Draw Button */}
      <Pressable
        style={({ pressed }) => [
          styles.actionBtn,
          styles.drawBtn,
          !isDrawEnabled && styles.disabledBtn,
          pressed && isDrawEnabled && styles.pressedBtn,
        ]}
        onPress={() => {
          if (!isDrawEnabled) return;
          NativeEffectsService.triggerCardSelect();
          onDraw();
        }}
        disabled={!isDrawEnabled}
      >
        <Text style={styles.btnSmallLabel}>DECK</Text>
        <Text style={styles.btnMainLabel}>DRAW</Text>
      </Pressable>

      {/* Red Glowing UNO Button */}
      <Pressable
        style={({ pressed }) => [
          styles.unoBtn,
          hasUnoAlert && styles.unoAlertBtn,
          pressed && styles.pressedBtn,
          disabled && styles.disabledBtn,
        ]}
        onPress={() => {
          if (disabled) return;
          onCallUno();
        }}
      >
        <Text style={styles.unoText}>UNO</Text>
        {hasUnoAlert && <View style={styles.alertPulseBadge} />}
      </Pressable>

      {/* End Turn Button */}
      <Pressable
        style={({ pressed }) => [
          styles.actionBtn,
          styles.endBtn,
          !isEndEnabled && styles.disabledBtn,
          pressed && isEndEnabled && styles.pressedBtn,
        ]}
        onPress={() => {
          if (!isEndEnabled) return;
          NativeEffectsService.triggerTurnChange();
          onEndTurn();
        }}
        disabled={!isEndEnabled}
      >
        <Text style={styles.btnSmallLabel}>TURN</Text>
        <Text style={styles.btnMainLabel}>END</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    height: 58,
    paddingHorizontal: 20,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  drawBtn: {
    backgroundColor: COLORS.unoBlue,
    borderColor: '#7DD3FC',
  },
  endBtn: {
    backgroundColor: '#1E1D2A',
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  unoBtn: {
    height: 58,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: COLORS.unoRed,
    borderWidth: 2.5,
    borderColor: COLORS.unoYellow,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.unoRed,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 20,
    elevation: 8,
    position: 'relative',
  },
  unoAlertBtn: {
    borderColor: '#FFFFFF',
    shadowColor: COLORS.goldGlow,
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  alertPulseBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.unoYellow,
    borderWidth: 2,
    borderColor: '#000',
  },
  unoText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontStyle: 'italic',
    fontSize: 24,
    letterSpacing: -1,
  },
  btnSmallLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  btnMainLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  disabledBtn: {
    opacity: 0.38,
  },
  pressedBtn: {
    transform: [{ scale: 0.95 }],
  },
});
