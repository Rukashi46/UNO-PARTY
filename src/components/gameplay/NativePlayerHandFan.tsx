import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { NativeUnoCard } from '../cards/NativeUnoCard';
import { UnoCard, UnoColor, GameRules } from '../../types/game';
import { UnoDeckService } from '../../game/UnoDeckService';
import { COLORS } from '../../constants/theme';
import { NativeEffectsService } from '../../services/NativeEffects';

interface PlayerHandFanProps {
  hand: UnoCard[];
  topCard: UnoCard | null;
  activeColor: UnoColor;
  pendingDrawStack: number;
  rules: GameRules;
  isMyTurn: boolean;
  playerName?: string;
  avatar?: string;
  selectedCardId?: string | null;
  onSelectCard?: (card: UnoCard | null) => void;
  onPlayCard: (card: UnoCard) => void;
  onInvalidAttempt?: (card: UnoCard, reason: string) => void;
  disabled?: boolean;
}

export const NativePlayerHandFan: React.FC<PlayerHandFanProps> = ({
  hand,
  topCard,
  activeColor,
  pendingDrawStack,
  rules,
  isMyTurn,
  playerName = 'YOU',
  avatar = '👦🏻',
  selectedCardId: externalSelectedId,
  onSelectCard,
  onPlayCard,
  onInvalidAttempt,
  disabled = false,
}) => {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);

  // Controlled or uncontrolled selection id
  const currentSelectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;

  // Clear selection if selected card is no longer in hand
  useEffect(() => {
    if (currentSelectedId && !hand.some(c => c.id === currentSelectedId)) {
      setInternalSelectedId(null);
      onSelectCard?.(null);
    }
  }, [hand, currentSelectedId, onSelectCard]);

  const cardCount = hand.length;

  // Dynamic card sizing and spacing based on hand count
  // When fewer cards: BIGGER cards with wider, clearer spacing!
  // When more cards: graceful reduction and dynamic overlap so all cards remain visible!
  const getDynamicCardDimensions = (count: number) => {
    if (count <= 3) {
      return { cardWidth: 168, cardHeight: 244, overlapMargin: -22, maxAngle: 12 };
    }
    if (count <= 6) {
      return { cardWidth: 156, cardHeight: 226, overlapMargin: -34, maxAngle: 18 };
    }
    if (count <= 9) {
      return { cardWidth: 146, cardHeight: 212, overlapMargin: -48, maxAngle: 24 };
    }
    if (count <= 13) {
      return { cardWidth: 136, cardHeight: 198, overlapMargin: -60, maxAngle: 28 };
    }
    return { cardWidth: 124, cardHeight: 180, overlapMargin: -70, maxAngle: 32 };
  };

  const { cardWidth, cardHeight, overlapMargin, maxAngle } = getDynamicCardDimensions(cardCount);

  // Calculate dynamic rotation angle for natural fan spread
  const getCardRotation = (index: number, total: number) => {
    if (total <= 1) return 0;
    const step = (maxAngle * 2) / (total - 1);
    return -maxAngle + index * step;
  };

  const getCardOffsetY = (index: number, total: number) => {
    if (total <= 1) return 0;
    const mid = (total - 1) / 2;
    const distFromCenter = Math.abs(index - mid);
    return -distFromCenter * 4;
  };

  const handleCardPress = (card: UnoCard) => {
    if (disabled || !isMyTurn) {
      NativeEffectsService.triggerInvalidAction();
      onInvalidAttempt?.(card, 'Not your turn!');
      return;
    }

    const isPlayable = UnoDeckService.isCardPlayable(
      card,
      topCard,
      activeColor,
      pendingDrawStack,
      rules
    );

    if (currentSelectedId === card.id) {
      // SECOND TAP on the SAME card -> CONFIRM PLAY
      if (isPlayable) {
        setInternalSelectedId(null);
        onSelectCard?.(null);
        onPlayCard(card);
      } else {
        NativeEffectsService.triggerInvalidAction();
        onInvalidAttempt?.(card, 'This card cannot be played on the current pile.');
      }
    } else {
      // FIRST TAP on card -> SELECT AND LIFT (Do NOT play)
      setInternalSelectedId(card.id);
      onSelectCard?.(card);
      NativeEffectsService.triggerCardSelect();
    }
  };

  return (
    <View style={styles.container}>
      {/* Player Identity Pill */}
      <View style={[styles.identityPill, isMyTurn && styles.myTurnPill]}>
        <View style={styles.avatarWrap}>
          <Text style={styles.avatarEmoji}>{avatar}</Text>
          <View style={styles.onlineBadge}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        </View>
        <View style={styles.nameBlock}>
          <Text style={styles.playerName}>
            {playerName} <Text style={styles.youTag}>({isMyTurn ? 'You' : 'Active'})</Text>
          </Text>
          <Text style={styles.handCount}>
            {hand.length} {hand.length === 1 ? 'card' : 'cards'}
            {isMyTurn ? ' • YOUR TURN' : ''}
          </Text>
        </View>
      </View>

      {/* Fan of Native UNO Cards */}
      <View style={styles.fanRow}>
        {hand.map((card, idx) => {
          const isPlayable =
            isMyTurn &&
            UnoDeckService.isCardPlayable(card, topCard, activeColor, pendingDrawStack, rules);
          const isSelected = currentSelectedId === card.id;
          const rotation = getCardRotation(idx, cardCount);
          const offsetY = getCardOffsetY(idx, cardCount);

          return (
            <View
              key={card.id}
              style={[
                styles.cardSlot,
                {
                  marginLeft: idx === 0 ? 0 : overlapMargin,
                  zIndex: isSelected ? 50 : idx + 1,
                  transform: [{ rotate: `${rotation}deg` }, { translateY: offsetY }],
                },
              ]}
            >
              <NativeUnoCard
                card={card}
                isPlayable={isPlayable}
                isSelected={isSelected}
                width={cardWidth}
                height={cardHeight}
                onPress={() => handleCardPress(card)}
                disabled={disabled}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  identityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 8, 14, 0.92)',
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    paddingVertical: 7,
    paddingHorizontal: 20,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  myTurnPill: {
    borderColor: COLORS.goldGlow,
    shadowColor: COLORS.goldGlow,
    shadowOpacity: 0.85,
    shadowRadius: 16,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E293B',
    borderWidth: 2.5,
    borderColor: COLORS.unoYellow,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginRight: 10,
  },
  avatarEmoji: {
    fontSize: 22,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.unoGreen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#000',
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  nameBlock: {
    justifyContent: 'center',
  },
  playerName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  youTag: {
    color: COLORS.unoYellow,
    fontSize: 13,
    fontWeight: '700',
  },
  handCount: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  fanRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 250,
    paddingHorizontal: 30,
  },
  cardSlot: {
    position: 'relative',
  },
});
