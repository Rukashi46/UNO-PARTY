import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { UnoCard } from '../../types/game';
import { NativeUnoCard } from '../cards/NativeUnoCard';
import { COLORS } from '../../constants/theme';
import { NativeEffectsService } from '../../services/NativeEffects';

export interface ShuffleParticipant {
  id: string;
  name: string;
  avatar: string;
  isLocal: boolean;
  initialCardCount: number;
  finalCardCount: number;
  screenPos: { x: number; y: number };
}

export interface ShuffleHandsAnimationProps {
  visible: boolean;
  cardPlayerId: string;
  cardPlayerName: string;
  participants: ShuffleParticipant[];
  dealSequence: string[]; // player IDs in sequence
  localNewHand: UnoCard[];
  totalCards: number;
  onComplete: () => void;
}

const CENTER_X = 960;
const CENTER_Y = 460;
const CARD_W = 120;
const CARD_H = 174;

// 10 proxy cards for the cinematic 3D vortex
const VORTEX_CARD_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export const ShuffleHandsAnimation: React.FC<ShuffleHandsAnimationProps> = ({
  visible,
  cardPlayerId,
  cardPlayerName,
  participants,
  dealSequence,
  localNewHand,
  totalCards,
  onComplete,
}) => {
  // Phase tracking: 1 = Release, 2 = Converge, 3 = Vortex, 4 = Confirm, 5 = Deal, 6 = Done
  const [phaseText, setPhaseText] = useState<string>('GATHERING ALL CARDS...');
  const [dealtCounts, setDealtCounts] = useState<Record<string, number>>({});
  const [activeDealCard, setActiveDealCard] = useState<{
    key: number;
    recipientId: string;
    card?: UnoCard;
    targetPos: { x: number; y: number };
  } | null>(null);

  // Shared animation values
  const gatheringProgress = useSharedValue(0);
  const vortexSpin = useSharedValue(0);
  const vortexScale = useSharedValue(0);
  const confirmPulse = useSharedValue(1);
  const confirmGlow = useSharedValue(0);
  const dealFlightProgress = useSharedValue(0);

  const isMountedRef = useRef<boolean>(true);
  const timerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const safeTimeout = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      if (isMountedRef.current) fn();
    }, ms);
    timerRefs.current.push(t);
    return t;
  };

  useEffect(() => {
    isMountedRef.current = true;
    if (!visible) return;

    // Reset initial card counts for participants
    const initialMap: Record<string, number> = {};
    participants.forEach(p => {
      initialMap[p.id] = p.initialCardCount;
    });
    setDealtCounts(initialMap);

    // =========================================================================
    // PHASE 1 & 2: CARD RELEASE & CONVERGE TO CENTER (~800ms)
    // =========================================================================
    setPhaseText('GATHERING ALL ACTIVE CARDS...');
    NativeEffectsService.triggerTurnChange();

    gatheringProgress.value = 0;
    gatheringProgress.value = withTiming(1, {
      duration: 750,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });

    // =========================================================================
    // PHASE 3: CENTRAL 3D SHUFFLE VORTEX (~900ms)
    // =========================================================================
    safeTimeout(() => {
      setPhaseText('SHUFFLING CARDS IN VORTEX...');
      NativeEffectsService.triggerCardSelect();

      // Clear hands visually as cards have entered center pool
      const zeroMap: Record<string, number> = {};
      participants.forEach(p => {
        zeroMap[p.id] = 0;
      });
      setDealtCounts(zeroMap);

      vortexScale.value = withSpring(1, { damping: 12, stiffness: 120 });
      vortexSpin.value = withTiming(4 * Math.PI, {
        duration: 900,
        easing: Easing.linear,
      });
    }, 780);

    // =========================================================================
    // PHASE 4: SHUFFLE CONFIRMATION & CONSOLIDATION (~280ms)
    // =========================================================================
    safeTimeout(() => {
      setPhaseText('CARDS SHUFFLED!');
      NativeEffectsService.triggerCardPlay();

      confirmPulse.value = withSequence(
        withTiming(1.22, { duration: 130, easing: Easing.out(Easing.ease) }),
        withTiming(1.0, { duration: 150, easing: Easing.in(Easing.ease) })
      );
      confirmGlow.value = withSequence(
        withTiming(1, { duration: 130 }),
        withTiming(0, { duration: 150 })
      );
    }, 1700);

    // =========================================================================
    // PHASE 5: SEQUENTIAL ONE-BY-ONE REDISTRIBUTION (~1200ms)
    // =========================================================================
    safeTimeout(() => {
      setPhaseText('REDISTRIBUTING ONE BY ONE...');
      vortexScale.value = withTiming(0, { duration: 200 });

      // Build sequence of visual dealing steps
      const stepsToAnimate = dealSequence.slice(0, Math.min(14, dealSequence.length));
      const staggerMs = 85;

      let localCardIndex = 0;
      stepsToAnimate.forEach((recipientId, stepIdx) => {
        safeTimeout(() => {
          const participant = participants.find(p => p.id === recipientId);
          const targetPos = participant ? participant.screenPos : { x: CENTER_X, y: 920 };

          let cardForLocal: UnoCard | undefined = undefined;
          if (participant?.isLocal && localNewHand[localCardIndex]) {
            cardForLocal = localNewHand[localCardIndex];
            localCardIndex++;
          }

          setActiveDealCard({
            key: stepIdx,
            recipientId,
            card: cardForLocal,
            targetPos,
          });

          NativeEffectsService.triggerCardSelect();

          dealFlightProgress.value = 0;
          dealFlightProgress.value = withTiming(1, {
            duration: 220,
            easing: Easing.bezier(0.2, 0.8, 0.2, 1),
          });

          // When card lands at recipient, increment their badge count
          safeTimeout(() => {
            setDealtCounts(prev => ({
              ...prev,
              [recipientId]: (prev[recipientId] || 0) + 1,
            }));
          }, 180);
        }, stepIdx * staggerMs);
      });

      // After all visual flights finish, sync full authoritative counts
      const dealFinishMs = stepsToAnimate.length * staggerMs + 320;
      safeTimeout(() => {
        const finalMap: Record<string, number> = {};
        participants.forEach(p => {
          finalMap[p.id] = p.finalCardCount;
        });
        setDealtCounts(finalMap);
        setPhaseText('REDISTRIBUTION COMPLETE!');
      }, dealFinishMs);

      // Complete full sequence
      safeTimeout(() => {
        onComplete();
      }, dealFinishMs + 400);
    }, 2000);

    return () => {
      isMountedRef.current = false;
      timerRefs.current.forEach(t => clearTimeout(t));
      timerRefs.current = [];
    };
  }, [visible]);

  // Overall container opacity style
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: 200 }),
  }));

  // Center stack pulse style
  const centerPulseAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: confirmPulse.value }],
    shadowOpacity: confirmGlow.value * 0.8,
  }));

  // Flight style for the currently flying card in Phase 5
  const dealingFlightAnimatedStyle = useAnimatedStyle(() => {
    if (!activeDealCard) return { opacity: 0 };
    const p = dealFlightProgress.value;
    const curX = CENTER_X + (activeDealCard.targetPos.x - CENTER_X) * p;
    const arcHeight = -55;
    const curY = CENTER_Y + (activeDealCard.targetPos.y - CENTER_Y) * p + arcHeight * Math.sin(p * Math.PI);
    const rotation = (p * 24 - 12) + 'deg';
    const scale = 1 - 0.18 * p;

    return {
      left: curX - CARD_W / 2,
      top: curY - CARD_H / 2,
      transform: [{ rotate: rotation }, { scale }],
      opacity: p < 0.05 ? p * 20 : p > 0.95 ? (1 - p) * 20 : 1,
    };
  });

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, backdropAnimatedStyle]} pointerEvents="none">
      {/* Top Banner */}
      <View style={styles.bannerContainer}>
        <View style={styles.bannerBadge}>
          <Text style={styles.bannerIcon}>🔀</Text>
          <Text style={styles.bannerTitle}>SHUFFLE HANDS</Text>
        </View>
        <Text style={styles.bannerSubtitle}>{phaseText}</Text>
        <Text style={styles.bannerDetails}>
          {cardPlayerName.toUpperCase()} POOLED {totalCards} CARDS FROM ALL PLAYERS
        </Text>
      </View>

      {/* Participant Badge Counters reflecting real-time animated deal */}
      {participants.map(p => (
        <View
          key={p.id}
          style={[
            styles.participantBadge,
            { left: p.screenPos.x - 65, top: p.screenPos.y - (p.isLocal ? 115 : 60) },
          ]}
        >
          <Text style={styles.participantAvatar}>{p.avatar}</Text>
          <View>
            <Text style={styles.participantName} numberOfLines={1}>
              {p.name.toUpperCase()}
            </Text>
            <Text style={styles.participantCount}>
              {dealtCounts[p.id] !== undefined ? `${dealtCounts[p.id]} CARDS` : '...'}
            </Text>
          </View>
        </View>
      ))}

      {/* Phase 1 & 2: Cards converging to center */}
      {participants.map((p, pIdx) => {
        return (
          <GatheringCardGroup
            key={p.id}
            startPos={p.screenPos}
            centerPos={{ x: CENTER_X, y: CENTER_Y }}
            progress={gatheringProgress}
            staggerOffset={pIdx * 0.08}
          />
        );
      })}

      {/* Phase 3: Central 3D Shuffle Vortex */}
      <View style={[styles.vortexCenter, { left: CENTER_X - 150, top: CENTER_Y - 150 }]}>
        <View style={styles.vortexRingOuter} />
        <View style={styles.vortexRingInner} />
        {VORTEX_CARD_INDICES.map(i => (
          <VortexCardItem
            key={i}
            index={i}
            spin={vortexSpin}
            scale={vortexScale}
          />
        ))}
      </View>

      {/* Phase 4: Center Consolidated Stack */}
      <Animated.View
        style={[
          styles.centralStack,
          { left: CENTER_X - CARD_W / 2, top: CENTER_Y - CARD_H / 2 },
          centerPulseAnimatedStyle,
        ]}
      >
        <View style={styles.cardBack}>
          <View style={styles.backBorder}>
            <View style={styles.backOval}>
              <Text style={styles.backUnoText}>UNO</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* Phase 5: One-by-One Dealing Card Flight */}
      {activeDealCard && (
        <Animated.View style={[styles.flyingCardWrap, dealingFlightAnimatedStyle]}>
          {activeDealCard.card ? (
            <NativeUnoCard
              card={activeDealCard.card}
              width={CARD_W}
              height={CARD_H}
              isPlayable={false}
            />
          ) : (
            <View style={[styles.cardBack, { width: CARD_W, height: CARD_H }]}>
              <View style={styles.backBorder}>
                <View style={styles.backOval}>
                  <Text style={styles.backUnoText}>UNO</Text>
                </View>
              </View>
            </View>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
};

// Sub-component: Gathering cards from a player to center
const GatheringCardGroup: React.FC<{
  startPos: { x: number; y: number };
  centerPos: { x: number; y: number };
  progress: SharedValue<number>;
  staggerOffset: number;
}> = ({ startPos, centerPos, progress, staggerOffset }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const raw = progress.value - staggerOffset;
    const p = Math.max(0, Math.min(1, raw * (1 / (1 - staggerOffset || 1))));

    const curX = startPos.x + (centerPos.x - startPos.x) * p;
    const arcHeight = -40;
    const curY = startPos.y + (centerPos.y - startPos.y) * p + arcHeight * Math.sin(p * Math.PI);
    const rotation = (p * 35 - 15) + 'deg';
    const scale = 1 - 0.25 * p;
    const opacity = p >= 1 ? 0 : p < 0.05 ? p * 20 : 1;

    return {
      left: curX - CARD_W / 2,
      top: curY - CARD_H / 2,
      transform: [{ rotate: rotation }, { scale }],
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.flyingCardWrap, animatedStyle]}>
      <View style={[styles.cardBack, { width: CARD_W, height: CARD_H }]}>
        <View style={styles.backBorder}>
          <View style={styles.backOval}>
            <Text style={styles.backUnoText}>UNO</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

// Sub-component: Vortex orbital cards
const VortexCardItem: React.FC<{
  index: number;
  spin: SharedValue<number>;
  scale: SharedValue<number>;
}> = ({ index, spin, scale }) => {
  const baseAngle = (index / VORTEX_CARD_INDICES.length) * 2 * Math.PI;
  const radius = 68 + (index % 3) * 28;

  const animatedStyle = useAnimatedStyle(() => {
    const currentAngle = baseAngle + spin.value;
    const x = 150 + radius * Math.cos(currentAngle) - CARD_W / 2;
    const y = 150 + radius * Math.sin(currentAngle) * 0.55 - CARD_H / 2;
    const tilt = (currentAngle * (180 / Math.PI) + 90) + 'deg';
    const s = scale.value * (0.85 + 0.2 * Math.sin(currentAngle));

    return {
      left: x,
      top: y,
      transform: [
        { rotate: tilt },
        { scale: s },
      ],
      opacity: scale.value,
    };
  });

  return (
    <Animated.View style={[styles.vortexCard, animatedStyle]}>
      <View style={[styles.cardBack, { width: CARD_W * 0.75, height: CARD_H * 0.75 }]}>
        <View style={styles.backBorder}>
          <View style={styles.backOval}>
            <Text style={[styles.backUnoText, { fontSize: 18 }]}>UNO</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 7, 12, 0.72)',
    zIndex: 9999,
  },
  bannerContainer: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 2,
    borderColor: COLORS.goldGlow,
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 36,
    shadowColor: COLORS.goldGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  bannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerIcon: {
    fontSize: 24,
  },
  bannerTitle: {
    color: COLORS.goldGlow,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  bannerSubtitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 3,
  },
  bannerDetails: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  participantBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  participantAvatar: {
    fontSize: 20,
  },
  participantName: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
    maxWidth: 90,
  },
  participantCount: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  flyingCardWrap: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
  },
  vortexCenter: {
    position: 'absolute',
    width: 300,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vortexRingOuter: {
    position: 'absolute',
    width: 280,
    height: 160,
    borderRadius: 140,
    borderWidth: 2,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderStyle: 'dashed',
  },
  vortexRingInner: {
    position: 'absolute',
    width: 200,
    height: 110,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  vortexCard: {
    position: 'absolute',
  },
  centralStack: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    shadowColor: COLORS.goldGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 10,
  },
  cardBack: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 5,
    borderWidth: 2,
    borderColor: '#334155',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  backBorder: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
  },
  backOval: {
    width: '80%',
    height: '52%',
    backgroundColor: '#EF4444',
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-25deg' }],
  },
  backUnoText: {
    color: '#FACC15',
    fontSize: 24,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
  },
});
