import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Player, GameEndMode, PlayerStatus } from '../../types/game';
import { FinalRankItem } from '../../game/UnoGameEngine';
import { COLORS } from '../../constants/theme';

interface GameOverModalProps {
  visible: boolean;
  gameEndMode?: GameEndMode;
  winner: Player | { name: string; avatar: string; isHuman: boolean } | null;
  finalResults?: FinalRankItem[];
  onPlayAgain: () => void;
  onExit: () => void;
}

export const NativeGameOverModal: React.FC<GameOverModalProps> = ({
  visible,
  gameEndMode = 'FIRST_PLAYER_WINS',
  winner,
  finalResults = [],
  onPlayAgain,
  onExit,
}) => {
  if (!visible) return null;

  const isPlayUntilLast = gameEndMode === 'PLAY_UNTIL_LAST_PLAYER';
  const isLocalWinner = winner?.isHuman;

  return (
    <View style={styles.backdrop}>
      <View style={[styles.card, isPlayUntilLast && styles.cardLarge]}>
        {/* Glow border */}
        <View style={[styles.halo, isLocalWinner ? styles.winHalo : styles.loseHalo]} />

        {/* Trophy / Icon */}
        <Text style={styles.trophy}>{isPlayUntilLast ? '🏁' : isLocalWinner ? '🏆' : '👑'}</Text>

        {/* Title */}
        <Text
          style={[
            styles.title,
            { color: isLocalWinner ? COLORS.goldGlow : COLORS.unoYellow },
          ]}
        >
          {isPlayUntilLast ? 'MATCH COMPLETE' : isLocalWinner ? 'VICTORY!' : 'MATCH COMPLETE'}
        </Text>

        {/* Winner or Finishing Order Header */}
        {!isPlayUntilLast && winner && (
          <View style={styles.winnerPill}>
            <Text style={styles.winnerAvatar}>{winner.avatar}</Text>
            <Text style={styles.winnerText}>
              {winner.name} {isLocalWinner ? '(YOU)' : ''} WINS!
            </Text>
          </View>
        )}

        {isPlayUntilLast && (
          <View style={styles.orderHeaderRow}>
            <Text style={styles.orderHeaderTitle}>FINISHING ORDER</Text>
          </View>
        )}

        {/* Ranked Players List */}
        {finalResults && finalResults.length > 0 && (
          <View style={styles.resultsList}>
            {finalResults.map((item, idx) => {
              const isFirst = item.rank === 1;
              const isFinished = item.status === 'FINISHED';
              const isEliminated = item.status === 'ELIMINATED';

              return (
                <View
                  key={item.playerId || idx}
                  style={[
                    styles.resultRow,
                    isFirst && styles.resultRowFirst,
                  ]}
                >
                  <View style={styles.rankBadge}>
                    <Text style={[styles.rankText, isFirst && styles.rankTextFirst]}>
                      {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `${item.rank}`}
                    </Text>
                  </View>

                  <Text style={styles.playerAvatar}>{item.avatar}</Text>

                  <View style={styles.playerInfo}>
                    <Text style={[styles.playerName, isFirst && styles.playerNameFirst]} numberOfLines={1}>
                      {item.name} {item.isHuman ? '(YOU)' : ''}
                    </Text>
                    {!isPlayUntilLast && item.rank > 1 && (
                      <Text style={styles.cardsLeftText}>{item.cardCount} cards remaining</Text>
                    )}
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      isFinished ? styles.statusFinished : isEliminated ? styles.statusEliminated : styles.statusActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        isFinished ? styles.statusFinishedText : isEliminated ? styles.statusEliminatedText : styles.statusActiveText,
                      ]}
                    >
                      {item.status}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!isPlayUntilLast && !finalResults.length && (
          <Text style={styles.subtext}>
            {isLocalWinner
              ? 'Outstanding party play! You cleared all your cards first!'
              : `${winner?.name || 'Player'} got rid of all their cards and took the match!`}
          </Text>
        )}

        {/* Buttons */}
        <View style={styles.btnRow}>
          <Pressable
            style={({ pressed }) => [styles.playBtn, pressed && styles.btnPressed]}
            onPress={onPlayAgain}
          >
            <Text style={styles.playBtnText}>PLAY AGAIN</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.exitBtn, pressed && styles.btnPressed]}
            onPress={onExit}
          >
            <Text style={styles.exitBtnText}>LOBBY</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 4, 10, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 110,
  },
  card: {
    width: 560,
    backgroundColor: 'rgba(20, 16, 28, 0.98)',
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: COLORS.goldGlow,
    paddingVertical: 36,
    paddingHorizontal: 40,
    alignItems: 'center',
    shadowColor: COLORS.goldGlow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 32,
    elevation: 24,
    position: 'relative',
  },
  halo: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 34,
    borderWidth: 1,
  },
  winHalo: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  loseHalo: {
    borderColor: 'rgba(234, 29, 36, 0.4)',
  },
  trophy: {
    fontSize: 54,
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  winnerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 16,
    gap: 10,
  },
  winnerAvatar: {
    fontSize: 24,
  },
  winnerText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  subtext: {
    color: '#CBD5E1',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 28,
    lineHeight: 22,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  playBtn: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.unoGreen,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#34D399',
    shadowColor: COLORS.unoGreen,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  playBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  exitBtn: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  exitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cardLarge: {
    width: 640,
    maxHeight: '90%',
  },
  orderHeaderRow: {
    marginTop: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
    paddingBottom: 8,
    alignItems: 'center',
  },
  orderHeaderTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  resultsList: {
    width: '100%',
    marginVertical: 14,
    gap: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 12,
  },
  resultRowFirst: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  rankBadge: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#E2E8F0',
  },
  rankTextFirst: {
    fontSize: 20,
  },
  playerAvatar: {
    fontSize: 22,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  playerNameFirst: {
    color: COLORS.goldGlow,
    fontWeight: '900',
  },
  cardsLeftText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusFinished: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  statusEliminated: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  statusActive: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderColor: 'rgba(148, 163, 184, 0.3)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusFinishedText: {
    color: '#4ADE80',
  },
  statusEliminatedText: {
    color: '#F87171',
  },
  statusActiveText: {
    color: '#94A3B8',
  },
});
