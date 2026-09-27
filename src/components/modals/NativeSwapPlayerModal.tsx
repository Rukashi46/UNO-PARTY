import React, { useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Player } from '../../types/game';
import { COLORS } from '../../constants/theme';
import { NativeEffectsService } from '../../services/NativeEffects';

interface SwapPlayerModalProps {
  visible: boolean;
  canChoose: boolean;
  chooserName?: string;
  eligiblePlayers: Player[];
  onSelectPlayer: (targetPlayerId: string) => void;
}

export const NativeSwapPlayerModal: React.FC<SwapPlayerModalProps> = ({
  visible,
  canChoose,
  chooserName = 'Player',
  eligiblePlayers,
  onSelectPlayer,
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
          <Text style={styles.titleBadge}>7 SWAP HANDS (NO MERCY)</Text>
          <Text style={styles.titleText}>
            {canChoose ? 'CHOOSE PLAYER TO SWAP WITH' : `${chooserName.toUpperCase()} IS CHOOSING A PLAYER...`}
          </Text>
          <Text style={styles.subText}>
            {canChoose
              ? 'Hand swap is mandatory. Select an opponent to exchange your entire hand.'
              : 'Please wait while hands are swapped.'}
          </Text>
        </View>

        {canChoose ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.playersList}
          >
            {eligiblePlayers.map(p => (
              <Pressable
                key={p.id}
                style={({ pressed }) => [
                  styles.playerCard,
                  pressed && styles.playerCardPressed,
                ]}
                onPress={() => {
                  NativeEffectsService.triggerCardPlay();
                  onSelectPlayer(p.id);
                }}
              >
                <Text style={styles.playerAvatar}>{p.avatar || '👤'}</Text>
                <Text style={styles.playerName} numberOfLines={1}>{p.name}</Text>
                <View style={styles.badgeContainer}>
                  <Text style={styles.cardCountText}>{p.cardCount || p.hand?.length || 0} cards</Text>
                </View>
                <View style={styles.swapActionBtn}>
                  <Text style={styles.swapActionText}>SWAP</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.waitingContainer}>
            <Text style={styles.waitingEmoji}>🔄</Text>
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
    width: 620,
    backgroundColor: '#1E1528',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#F59E0B',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#F59E0B',
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
    backgroundColor: '#F59E0B',
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
    color: '#FBBF24',
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
  playersList: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  playerCard: {
    width: 110,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  playerCardPressed: {
    transform: [{ scale: 0.94 }],
    borderColor: '#F59E0B',
  },
  playerAvatar: {
    fontSize: 34,
    marginBottom: 6,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
    textAlign: 'center',
  },
  badgeContainer: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 10,
  },
  cardCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F59E0B',
  },
  swapActionBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  swapActionText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
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
