import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Player } from '../../types/game';
import { COLORS } from '../../constants/theme';

interface OpponentNodeProps {
  player: Player;
  isTurn?: boolean;
  scale?: number;
}

export const NativeOpponentNode: React.FC<OpponentNodeProps> = ({
  player,
  isTurn: rawIsTurn = false,
  scale = 1.0,
}) => {
  const isFinished = player.status === 'FINISHED' || (player.hand && player.hand.length === 0 && player.cardCount === 0 && player.status !== 'ACTIVE' && player.finishRank !== undefined);
  const isEliminated = player.status === 'ELIMINATED' || player.isEliminated;
  const isTurn = !isFinished && !isEliminated && rawIsTurn;

  const cardCount = isFinished || isEliminated ? 0 : Math.min(player.cardCount, 8);
  const cardAngles = [-15, -10, -5, 0, 5, 10, 15, 20];

  return (
    <View style={[styles.container, { transform: [{ scale }] }]}>
      {/* Mini Card Fan */}
      <View style={styles.fanContainer}>
        {Array.from({ length: cardCount }).map((_, idx) => (
          <View
            key={idx}
            style={[
              styles.miniCard,
              {
                marginLeft: idx === 0 ? 0 : -16,
                transform: [{ rotate: `${cardAngles[idx % cardAngles.length]}deg` }],
              },
            ]}
          >
            <View style={styles.miniCardBack}>
              <Text style={styles.miniUnoText}>U</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Player Pill Badge */}
      <View
        style={[
          styles.badge,
          isTurn && styles.badgeTurn,
          isFinished && styles.badgeFinished,
          isEliminated && styles.badgeEliminated,
        ]}
      >
        {player.isHost && (
          <View style={styles.hostCrown}>
            <Text style={styles.crownText}>👑</Text>
          </View>
        )}

        <View
          style={[
            styles.avatarCircle,
            isTurn && styles.avatarCircleTurn,
            isFinished && styles.avatarCircleFinished,
            isEliminated && styles.avatarCircleEliminated,
          ]}
        >
          <Text style={styles.avatarText}>{player.avatar}</Text>
        </View>

        <View style={styles.textColumn}>
          <View style={styles.nameRow}>
            <Text
              style={[
                styles.nameText,
                isFinished && styles.nameTextFinished,
                isEliminated && styles.nameTextEliminated,
              ]}
              numberOfLines={1}
            >
              {player.name}
            </Text>
            {isTurn && (
              <View style={styles.turnTag}>
                <Text style={styles.turnTagText}>TURN</Text>
              </View>
            )}
            {isFinished && (
              <View style={styles.finishedTag}>
                <Text style={styles.finishedTagText}>
                  {player.finishRank ? `#${player.finishRank}` : 'FIN'}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[
              styles.cardCountText,
              player.cardCount === 1 && !isFinished && !isEliminated && styles.unoCountText,
              isFinished && styles.finishedCountText,
              isEliminated && styles.eliminatedCountText,
            ]}
          >
            {isFinished
              ? `🏁 FINISHED (${player.finishRank ? `#${player.finishRank}` : 'DONE'})`
              : isEliminated
              ? '💀 ELIMINATED'
              : player.cardCount === 1
              ? '🔥 UNO! (1)'
              : `${player.cardCount} cards`}
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
  },
  fanContainer: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'center',
  },
  miniCard: {
    width: 34,
    height: 50,
    borderRadius: 6,
    backgroundColor: '#0A0910',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.65,
    shadowRadius: 5,
  },
  miniCardBack: {
    width: 24,
    height: 38,
    borderRadius: 999,
    backgroundColor: COLORS.unoRed,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-30deg' }],
  },
  miniUnoText: {
    color: COLORS.unoYellow,
    fontSize: 11,
    fontWeight: '900',
    fontStyle: 'italic',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 8, 14, 0.88)',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  badgeTurn: {
    borderColor: COLORS.emeraldGlow,
    shadowColor: COLORS.emeraldGlow,
    shadowOpacity: 0.85,
    shadowRadius: 18,
  },
  hostCrown: {
    position: 'absolute',
    top: -14,
    left: 10,
    backgroundColor: COLORS.goldGlow,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  crownText: {
    fontSize: 11,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1E293B',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarCircleTurn: {
    borderColor: COLORS.emeraldGlow,
  },
  avatarText: {
    fontSize: 24,
  },
  textColumn: {
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nameText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  turnTag: {
    backgroundColor: COLORS.emeraldGlow,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  turnTagText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '900',
  },
  cardCountText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  unoCountText: {
    color: COLORS.unoRed,
    fontWeight: '900',
  },
  badgeFinished: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    opacity: 0.8,
  },
  badgeEliminated: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(20, 10, 10, 0.75)',
    opacity: 0.65,
  },
  avatarCircleFinished: {
    borderColor: '#22C55E',
  },
  avatarCircleEliminated: {
    borderColor: '#EF4444',
  },
  nameTextFinished: {
    color: '#94A3B8',
  },
  nameTextEliminated: {
    color: '#EF4444',
    textDecorationLine: 'line-through',
  },
  finishedTag: {
    backgroundColor: '#22C55E',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  finishedTagText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '900',
  },
  finishedCountText: {
    color: '#4ADE80',
    fontWeight: '800',
  },
  eliminatedCountText: {
    color: '#F87171',
    fontWeight: '800',
  },
});
