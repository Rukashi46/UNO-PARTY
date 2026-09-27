import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView, Switch } from 'react-native';
import { COLORS } from '../constants/theme';
import { GameRules } from '../types/game';
import { NativeEffectsService } from '../services/NativeEffects';

interface RulesScreenProps {
  rules?: GameRules;
  isHost?: boolean;
  onUpdateRules?: (rules: GameRules) => void;
  onBack: () => void;
}

export const RulesScreen: React.FC<RulesScreenProps> = ({
  rules: initialRules,
  isHost = true,
  onUpdateRules,
  onBack,
}) => {
  const [currentRules, setCurrentRules] = useState<GameRules>(
    initialRules || {
      deckType: 'NORMAL',
      stacking: true,
      sevenZeroRule: true,
      jumpInRule: true,
      drawUntilPlayable: false,
      forcePlay: false,
      mercy25Cards: true,
      includeCustomWilds: true,
      soundEnabled: true,
      hapticsEnabled: true,
    }
  );

  useEffect(() => {
    if (initialRules) {
      setCurrentRules(initialRules);
    }
  }, [initialRules]);

  const handleToggle = (key: keyof GameRules, val: boolean) => {
    if (!isHost) return;
    NativeEffectsService.triggerCardSelect();
    const updated = { ...currentRules, [key]: val };
    setCurrentRules(updated);
    onUpdateRules?.(updated);
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            NativeEffectsService.triggerCardSelect();
            onBack();
          }}
          style={styles.backBtn}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>

        <Text style={styles.title}>Match Rules</Text>

        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{isHost ? '👑 Host' : '🔒 Client'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!isHost && (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockIcon}>🔒</Text>
            <View>
              <Text style={styles.lockedTitle}>HOST CONTROLLED</Text>
              <Text style={styles.lockedDesc}>Only the room host can modify house rules.</Text>
            </View>
          </View>
        )}

        {/* Game End Mode Section (Requirement 1, 14) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GAME END</Text>
          <View style={styles.rulesCard}>
            <Pressable
              style={[
                styles.modeOptionRow,
                (currentRules.gameEndMode || 'FIRST_PLAYER_WINS') === 'FIRST_PLAYER_WINS' && styles.modeOptionActive,
              ]}
              onPress={() => {
                if (!isHost) return;
                NativeEffectsService.triggerCardSelect();
                const updated = { ...currentRules, gameEndMode: 'FIRST_PLAYER_WINS' as const };
                setCurrentRules(updated);
                onUpdateRules?.(updated);
              }}
              disabled={!isHost}
            >
              <View style={styles.radioOuter}>
                {(currentRules.gameEndMode || 'FIRST_PLAYER_WINS') === 'FIRST_PLAYER_WINS' && (
                  <View style={styles.radioInner} />
                )}
              </View>
              <View style={styles.modeOptionTextWrap}>
                <Text style={styles.ruleName}>First Player Wins</Text>
                <Text style={styles.ruleSubtitle}>First player to empty their hand wins immediately.</Text>
              </View>
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              style={[
                styles.modeOptionRow,
                currentRules.gameEndMode === 'PLAY_UNTIL_LAST_PLAYER' && styles.modeOptionActive,
              ]}
              onPress={() => {
                if (!isHost) return;
                NativeEffectsService.triggerCardSelect();
                const updated = { ...currentRules, gameEndMode: 'PLAY_UNTIL_LAST_PLAYER' as const };
                setCurrentRules(updated);
                onUpdateRules?.(updated);
              }}
              disabled={!isHost}
            >
              <View style={styles.radioOuter}>
                {currentRules.gameEndMode === 'PLAY_UNTIL_LAST_PLAYER' && (
                  <View style={styles.radioInner} />
                )}
              </View>
              <View style={styles.modeOptionTextWrap}>
                <Text style={styles.ruleName}>Play Until Last Player</Text>
                <Text style={styles.ruleSubtitle}>Continue playing after players finish. Record the complete finishing order.</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* Draw & Stack Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DRAW & STACK</Text>
          <View style={styles.rulesCard}>
            <View style={styles.ruleRow}>
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleName}>Stacking</Text>
                <Text style={styles.ruleSubtitle}>Chain +2 and +4 cards to pass penalty</Text>
              </View>
              <Switch
                value={currentRules.stacking}
                onValueChange={v => handleToggle('stacking', v)}
                disabled={!isHost}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.ruleRow}>
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleName}>Draw Until Playable</Text>
                <Text style={styles.ruleSubtitle}>Keep drawing until finding a match</Text>
              </View>
              <Switch
                value={currentRules.drawUntilPlayable}
                onValueChange={v => handleToggle('drawUntilPlayable', v)}
                disabled={!isHost}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.ruleRow}>
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleName}>Force Play</Text>
                <Text style={styles.ruleSubtitle}>Drawn matching card must be played</Text>
              </View>
              <Switch
                value={currentRules.forcePlay}
                onValueChange={v => handleToggle('forcePlay', v)}
                disabled={!isHost}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* Spicy Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SPICY ACTIONS</Text>
          <View style={styles.rulesCard}>
            <View style={styles.ruleRow}>
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleName}>🔄 7-0 Hand Swap</Text>
                <Text style={styles.ruleSubtitle}>7 swaps hand; 0 passes hands around</Text>
              </View>
              <Switch
                value={currentRules.sevenZeroRule}
                onValueChange={v => handleToggle('sevenZeroRule', v)}
                disabled={!isHost}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.ruleRow}>
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleName}>⚡ Jump-In</Text>
                <Text style={styles.ruleSubtitle}>Play identical card out of turn immediately</Text>
              </View>
              <Switch
                value={currentRules.jumpInRule}
                onValueChange={v => handleToggle('jumpInRule', v)}
                disabled={!isHost}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.ruleRow}>
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleName}>💀 25-Card Mercy</Text>
                <Text style={styles.ruleSubtitle}>Holding 25+ cards results in instant elimination</Text>
              </View>
              <Switch
                value={currentRules.mercy25Cards}
                onValueChange={v => handleToggle('mercy25Cards', v)}
                disabled={!isHost}
                trackColor={{ true: COLORS.unoRed, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.ruleRow}>
              <View style={styles.ruleInfo}>
                <Text style={styles.ruleName}>🃏 Custom Wild Cards</Text>
                <Text style={styles.ruleSubtitle}>Include Wild Draw 6, 10, and Shuffle Hands</Text>
              </View>
              <Switch
                value={currentRules.includeCustomWilds}
                onValueChange={v => handleToggle('includeCustomWilds', v)}
                disabled={!isHost}
                trackColor={{ true: COLORS.unoGreen, false: '#334155' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#040507',
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  backArrow: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  title: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  roleText: {
    color: COLORS.unoYellow,
    fontSize: 12,
    fontWeight: '800',
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 40,
    gap: 24,
  },
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    padding: 14,
    gap: 12,
  },
  lockIcon: {
    fontSize: 22,
  },
  lockedTitle: {
    color: COLORS.goldGlow,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  lockedDesc: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  rulesCard: {
    backgroundColor: 'rgba(20, 16, 28, 0.85)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  ruleInfo: {
    flex: 1,
    paddingRight: 16,
  },
  ruleName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
  ruleSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  modeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    paddingHorizontal: 8,
    gap: 12,
  },
  modeOptionActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.unoYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.unoYellow,
  },
  modeOptionTextWrap: {
    flex: 1,
  },
});
