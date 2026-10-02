import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, Pressable, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GameplayViewport } from '../components/gameplay/GameplayViewport';
import { NativeGameTable } from '../components/gameplay/NativeGameTable';
import { NativeDrawPile } from '../components/gameplay/NativeDrawPile';
import { NativeDiscardPile } from '../components/gameplay/NativeDiscardPile';
import { NativeOpponentNode } from '../components/gameplay/NativeOpponentNode';
import { NativePlayerHandFan } from '../components/gameplay/NativePlayerHandFan';
import { NativeActionControls } from '../components/gameplay/NativeActionControls';
import { NativeWildColorPicker } from '../components/modals/NativeWildColorPicker';
import { NativeCustomWildModal } from '../components/modals/NativeCustomWildModal';
import { NativeSwapPlayerModal } from '../components/modals/NativeSwapPlayerModal';
import { NativeRouletteColorModal } from '../components/modals/NativeRouletteColorModal';
import { NativeUnoToast } from '../components/gameplay/NativeUnoToast';
import { NativeGameOverModal } from '../components/modals/NativeGameOverModal';
import { AnimatedFlightCard } from '../components/gameplay/AnimatedFlightCard';
import { ShuffleHandsAnimation, ShuffleParticipant } from '../components/gameplay/ShuffleHandsAnimation';
import { UnoCard, UnoColor, Player, GameRules, CustomWildPower, DeckType, PlayerController, GameEndMode, PlayerStatus } from '../types/game';
import { UnoDeckService } from '../game/UnoDeckService';
import { UnoGameEngine, ShuffleHandsResult, FinalRankItem } from '../game/UnoGameEngine';
import { getPlayerLayout, getSingleOpponentLayout } from '../game/ResponsiveTableLayout';
import { COLORS, COLOR_MAP } from '../constants/theme';
import { NativeEffectsService } from '../services/NativeEffects';
import { MultiplayerSession } from '../multiplayer/MultiplayerSession';
import { MultiplayerDiagnosticsPanel } from '../components/gameplay/MultiplayerDiagnosticsPanel';
import { MPDiagnostics } from '../services/MultiplayerDiagnosticsService';

export type ActionLockState =
  | 'IDLE'
  | 'PLAYING_CARD'
  | 'DRAWING_CARD'
  | 'SHUFFLING_HANDS'
  | 'CHOOSING_WILD_COLOR'
  | 'CHOOSING_CUSTOM_WILD_POWER'
  | 'CHOOSING_SWAP_TARGET'
  | 'CHOOSING_ROULETTE_COLOR'
  | 'WAITING_FOR_REMOTE_PLAYER'
  | 'PASS_DEVICE'
  | 'ADVANCING_TURN'
  | 'GAME_OVER';

interface GameplayScreenProps {
  onQuit: () => void;
}

const INITIAL_OPPONENTS: Player[] = [
  { id: '1', name: 'Sarah', avatar: '👩🏼', isHuman: false, playerType: 'BOT', controller: 'BOT', hand: [], cardCount: 7, isHost: true },
  { id: '2', name: 'Alex', avatar: '👦🏼', isHuman: false, playerType: 'BOT', controller: 'BOT', hand: [], cardCount: 7 },
  { id: '3', name: 'Chris', avatar: '👨🏽', isHuman: false, playerType: 'BOT', controller: 'BOT', hand: [], cardCount: 7 },
  { id: '4', name: 'May', avatar: '👧🏻', isHuman: false, playerType: 'BOT', controller: 'BOT', hand: [], cardCount: 7 },
  { id: '5', name: 'Tiger', avatar: '🐯', isHuman: false, playerType: 'BOT', controller: 'BOT', hand: [], cardCount: 7 },
  { id: '6', name: 'Clever Panda', avatar: '🐼', isHuman: false, playerType: 'BOT', controller: 'BOT', hand: [], cardCount: 7 },
  { id: '7', name: 'Jason', avatar: '🧔🏻‍♂️', isHuman: false, playerType: 'BOT', controller: 'BOT', hand: [], cardCount: 7 },
  { id: '8', name: 'Wild Fox', avatar: '🦊', isHuman: false, playerType: 'BOT', controller: 'BOT', hand: [], cardCount: 7 },
];

export const GameplayScreen: React.FC<GameplayScreenProps> = ({ onQuit }) => {
  useEffect(() => {
    async function lockLandscape() {
      if (Platform.OS !== 'web') {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } catch (_) {}
      }
    }
    lockLandscape();

    return () => {
      if (Platform.OS !== 'web') {
        try {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } catch (_) {}
      }
    };
  }, []);

  // 1. Authoritative Game State
  const [deck, setDeck] = useState<UnoCard[]>([]);
  const [discardPile, setDiscardPile] = useState<UnoCard[]>([]);
  const [activeColor, setActiveColor] = useState<UnoColor>('YELLOW');
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState<number>(0);
  const [playDirection, setPlayDirection] = useState<'CW' | 'CCW'>('CW');
  const [pendingDrawStack, setPendingDrawStack] = useState<number>(0);
  const [hasDrawnThisTurn, setHasDrawnThisTurn] = useState<boolean>(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Authoritative Turn Machine State (turnId, phase, pending tracking)
  const [turnId, setTurnId] = useState<number>(1);
  const turnIdRef = useRef<number>(1);
  const [turnPhase, setTurnPhase] = useState<string>('WAITING_FOR_ACTION');
  const turnPhaseRef = useRef<string>('WAITING_FOR_ACTION');
  const pendingChoiceRef = useRef<string | null>(null);
  const pendingEffectRef = useRef<boolean>(false);

  // Stored refs to prevent stale closures across async timeouts and flight animations
  const allPlayersRef = useRef<Player[]>([]);
  const currentPlayerIndexRef = useRef<number>(0);
  const playDirectionRef = useRef<'CW' | 'CCW'>('CW');
  const activeColorRef = useRef<UnoColor>('YELLOW');
  const pendingDrawStackRef = useRef<number>(0);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTurnRef = useRef<(options?: { playedCard?: UnoCard; newActiveColor?: UnoColor; stepMultiplier?: number; reason?: string }) => void>(() => {});
  const handleRouletteRef = useRef<((color: UnoColor) => void) | null>(null);

  // Pass & Play device handoff target
  const [handoffTarget, setHandoffTarget] = useState<Player | null>(null);

  // Centralized Action Lock State
  const [actionLock, setActionLock] = useState<ActionLockState>('IDLE');

  // Option Authority Modals State
  const [pendingWildCard, setPendingWildCard] = useState<UnoCard | null>(null);
  const [canChooseWild, setCanChooseWild] = useState<boolean>(true);
  const [wildChooserName, setWildChooserName] = useState<string>('Player');

  const [customWildModalVisible, setCustomWildModalVisible] = useState<boolean>(false);
  const [canChooseCustomWild, setCanChooseCustomWild] = useState<boolean>(true);
  const [customWildChooserName, setCustomWildChooserName] = useState<string>('Player');

  const [swapModalVisible, setSwapModalVisible] = useState<boolean>(false);
  const [canChooseSwap, setCanChooseSwap] = useState<boolean>(true);
  const [swapChooserName, setSwapChooserName] = useState<string>('Player');

  const [rouletteModalVisible, setRouletteModalVisible] = useState<boolean>(false);
  const [canChooseRoulette, setCanChooseRoulette] = useState<boolean>(true);
  const [rouletteTargetName, setRouletteTargetName] = useState<string>('Player');

  // Watchdog Dead-End Assertion (Requirement 63):
  // Detects any lingering transient lock state (DRAWING_CARD, PLAYING_CARD, or orphaned modals)
  // and auto-reconciles to IDLE with a logged recovery to prevent freezes.
  useEffect(() => {
    if (actionLock === 'IDLE' || actionLock === 'GAME_OVER') return;

    const watchdog = setTimeout(() => {
      if (actionLock === 'DRAWING_CARD' || actionLock === 'PLAYING_CARD') {
        console.warn(`[DEAD_END_ASSERTION] Transient lock '${actionLock}' timed out. Auto-reconciling to IDLE.`);
        setActionLock('IDLE');
      } else if (actionLock === 'CHOOSING_WILD_COLOR' && !pendingWildCard) {
        console.warn(`[DEAD_END_ASSERTION] Orphaned CHOOSING_WILD_COLOR lock without pending card. Auto-reconciling to IDLE.`);
        setActionLock('IDLE');
      }
    }, 6000);

    return () => clearTimeout(watchdog);
  }, [actionLock, pendingWildCard]);

  // In-Game UNO Toast State
  const [unoToast, setUnoToast] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'penalty';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'success',
  });
  const [hasCalledUno, setHasCalledUno] = useState<boolean>(false);

  // Flight Animation State
  const [flightConfig, setFlightConfig] = useState<{
    active: boolean;
    card: UnoCard | null;
    isDrawFlight: boolean;
    startPos: { x: number; y: number };
    endPos: { x: number; y: number };
  }>({
    active: false,
    card: null,
    isDrawFlight: true,
    startPos: { x: 832, y: 488 },
    endPos: { x: 960, y: 920 },
  });
  const pendingFlightResolve = useRef<(() => void) | null>(null);

  // Shuffle Hands Cinematic Animation State
  const [shuffleAnimationConfig, setShuffleAnimationConfig] = useState<{
    visible: boolean;
    cardPlayerId: string;
    cardPlayerName: string;
    participants: ShuffleParticipant[];
    dealSequence: string[];
    localNewHand: UnoCard[];
    totalCards: number;
    pendingCard?: UnoCard | null;
  } | null>(null);

  const pendingShuffleResultRef = useRef<{
    result: ShuffleHandsResult;
    cardPlayerId: string;
    pendingCard?: UnoCard | null;
  } | null>(null);

  // Winner & Finishing Order State (Requirement 1, 4, 5, 6, 19)
  const [winner, setWinner] = useState<{ name: string; avatar: string; isHuman: boolean } | null>(null);
  const [finishingOrder, setFinishingOrder] = useState<string[]>([]);
  const finishingOrderRef = useRef<string[]>([]);
  const [eliminatedOrder, setEliminatedOrder] = useState<string[]>([]);
  const eliminatedOrderRef = useRef<string[]>([]);
  const [finalResults, setFinalResults] = useState<FinalRankItem[]>([]);

  // Feed Announcements
  const [announcement, setAnnouncement] = useState<{ text: string; highlight: string; color: string }>({
    text: 'Game started! Match begins',
    highlight: 'Yellow 7',
    color: COLORS.unoYellow,
  });

  const session = MultiplayerSession.getInstance();
  const activeRoom = session.getRoom();
  const deckType: DeckType = activeRoom?.rules.deckType || 'NORMAL';

  const rules: GameRules = activeRoom?.rules || {
    deckType: 'NORMAL',
    stacking: true,
    sevenZeroRule: false,
    jumpInRule: true,
    drawUntilPlayable: false,
    forcePlay: false,
    mercy25Cards: false,
    includeCustomWilds: true,
    soundEnabled: true,
    hapticsEnabled: true,
  };

  const showToast = useCallback(
    (title: string, message: string, type: 'success' | 'warning' | 'penalty' = 'success') => {
      setUnoToast({ visible: true, title, message, type });
      setTimeout(() => {
        setUnoToast(prev => ({ ...prev, visible: false }));
      }, 2400);
    },
    []
  );

  // Initialize Game on Mount
  const initializeGame = useCallback(() => {
    const localUser = session.getLocalPlayer();
    const isPassAndPlay = activeRoom?.mode === 'PASS_AND_PLAY';
    const isBotsMode = activeRoom?.mode === 'PLAY_BOTS';

    // Clear any bot timer
    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }

    // Reset finishing orders
    finishingOrderRef.current = [];
    eliminatedOrderRef.current = [];
    setFinishingOrder([]);
    setEliminatedOrder([]);
    setFinalResults([]);

    // Part 1: exactly 112 cards for NORMAL, 168 cards for NO_MERCY
    const newDeck = UnoDeckService.generateDeck(deckType);

    // Pick starting non-wild card for discard pile
    let top = newDeck.pop() || null;
    while (top && UnoDeckService.isWildCard(top)) {
      newDeck.unshift(top);
      top = newDeck.pop() || null;
    }

    let initialPlayersList: Player[] = [];
    const isMultiplayer = activeRoom?.mode === 'ONLINE' || activeRoom?.mode === 'WLAN';

    if (isMultiplayer) {
      const authDiscard = session.getAuthoritativeDiscard();
      const authTop = authDiscard[authDiscard.length - 1] || top || { id: 'default_start', color: 'RED', value: '7' };
      const authColor = session.getAuthoritativeActiveColor() || authTop.color;
      const authDirection = session.getAuthoritativeDirection() || 'CW';
      const authPendingDraw = session.getAuthoritativePendingDraw() || 0;
      const myPrivateHand = session.getLocalPrivateHand();

      initialPlayersList = (activeRoom.players || []).map(p => {
        const isLocal = p.id === localUser?.id;
        const controller: PlayerController = isLocal ? 'LOCAL_HUMAN' : 'REMOTE_HUMAN';
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isHuman: true,
          playerType: 'HUMAN',
          controller,
          hand: isLocal ? (myPrivateHand.length > 0 ? myPrivateHand : newDeck.splice(0, 7)) : [],
          cardCount: isLocal ? (myPrivateHand.length > 0 ? myPrivateHand.length : 7) : (p.cardCount || 7),
          isHost: p.isHost,
          status: (p.status || 'ACTIVE') as PlayerStatus,
          finishRank: p.finishRank,
          isEliminated: Boolean(p.isEliminated),
        };
      });

      setAllPlayers(initialPlayersList);
      allPlayersRef.current = initialPlayersList;

      setDiscardPile(authDiscard.length > 0 ? authDiscard : [authTop]);
      setActiveColor(authColor);
      activeColorRef.current = authColor;
      setPlayDirection(authDirection);
      playDirectionRef.current = authDirection;
      setPendingDrawStack(authPendingDraw);
      pendingDrawStackRef.current = authPendingDraw;

      const authCurId = session.getAuthoritativeCurrentPlayerId();
      const curIdx = initialPlayersList.findIndex(p => p.id === authCurId);
      const effectiveIndex = curIdx !== -1 ? curIdx : 0;
      setCurrentPlayerIndex(effectiveIndex);
      currentPlayerIndexRef.current = effectiveIndex;

      const activeP = initialPlayersList[effectiveIndex];
      const isMyTurnNow = activeP?.id === localUser?.id;
      setActionLock(isMyTurnNow ? 'IDLE' : 'WAITING_FOR_REMOTE_PLAYER');

      setAnnouncement({
        text: 'Top card revealed: ',
        highlight: `${authTop.color} ${authTop.value}`,
        color: COLOR_MAP[authTop.color] || COLORS.unoYellow,
      });

      setDeck(newDeck);
      setHasDrawnThisTurn(false);
      setSelectedCardId(null);
      setHasCalledUno(false);
      setWinner(null);
      setHandoffTarget(null);
      setTurnId(session.getRevision() || 1);
      turnIdRef.current = session.getRevision() || 1;
      setTurnPhase('WAITING_FOR_ACTION');
      turnPhaseRef.current = 'WAITING_FOR_ACTION';
      pendingChoiceRef.current = null;
      pendingEffectRef.current = false;
      return;
    }

    if (activeRoom && activeRoom.players.length > 0) {
      initialPlayersList = activeRoom.players.map((p, idx) => {
        let controller: PlayerController = 'REMOTE_HUMAN';
        if (isPassAndPlay) {
          controller = 'LOCAL_HUMAN';
        } else if (isBotsMode) {
          controller = idx === 0 ? 'LOCAL_HUMAN' : (p.controller || 'BOT');
        } else if (p.controller) {
          controller = p.controller;
        } else {
          controller = p.id === localUser?.id ? 'LOCAL_HUMAN' : 'REMOTE_HUMAN';
        }
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isHuman: controller === 'LOCAL_HUMAN' || controller === 'REMOTE_HUMAN',
          playerType: controller === 'BOT' ? 'BOT' : 'HUMAN',
          controller,
          hand: newDeck.splice(0, 7),
          cardCount: 7,
          isHost: p.isHost,
          status: 'ACTIVE' as PlayerStatus,
          finishRank: undefined,
          isEliminated: false,
        };
      });
    } else {
      initialPlayersList = [
        {
          id: localUser?.id || 'player_1',
          name: localUser?.name || 'Player 1',
          avatar: localUser?.avatar || '👑',
          isHuman: true,
          playerType: 'HUMAN',
          controller: 'LOCAL_HUMAN',
          hand: newDeck.splice(0, 7),
          cardCount: 7,
          isHost: true,
          status: 'ACTIVE' as PlayerStatus,
          finishRank: undefined,
          isEliminated: false,
        },
      ];
      if (isPassAndPlay) {
        initialPlayersList.push(
          { id: 'local_2', name: 'Player 2', avatar: '🎮', isHuman: true, playerType: 'HUMAN', controller: 'LOCAL_HUMAN', hand: newDeck.splice(0, 7), cardCount: 7 },
          { id: 'local_3', name: 'Player 3', avatar: '⭐', isHuman: true, playerType: 'HUMAN', controller: 'LOCAL_HUMAN', hand: newDeck.splice(0, 7), cardCount: 7 }
        );
      } else {
        const botPool = [
          { name: 'Sarah', avatar: '👩🏼' },
          { name: 'Chris', avatar: '👨🏽' },
          { name: 'Jason', avatar: '🧔🏻‍♂️' },
        ];
        botPool.forEach((bot, i) => {
          initialPlayersList.push({
            id: `bot_${i + 1}`,
            name: bot.name,
            avatar: bot.avatar,
            isHuman: false,
            playerType: 'BOT',
            controller: 'BOT',
            hand: newDeck.splice(0, 7),
            cardCount: 7,
          });
        });
      }
    }

    setAllPlayers(initialPlayersList);
    allPlayersRef.current = initialPlayersList;

    if (top) {
      setDiscardPile([top]);
      setActiveColor(top.color);
      activeColorRef.current = top.color;
      setAnnouncement({
        text: 'Top card revealed: ',
        highlight: `${top.color} ${top.value}`,
        color: COLOR_MAP[top.color] || COLORS.unoYellow,
      });
    }

    setDeck(newDeck);
    setCurrentPlayerIndex(0);
    currentPlayerIndexRef.current = 0;
    setPlayDirection('CW');
    playDirectionRef.current = 'CW';
    setPendingDrawStack(0);
    pendingDrawStackRef.current = 0;
    setHasDrawnThisTurn(false);
    setSelectedCardId(null);
    setHasCalledUno(false);
    setWinner(null);
    setHandoffTarget(null);
    setActionLock('IDLE');
    setTurnId(1);
    turnIdRef.current = 1;
    setTurnPhase('WAITING_FOR_ACTION');
    turnPhaseRef.current = 'WAITING_FOR_ACTION';
    pendingChoiceRef.current = null;
    pendingEffectRef.current = false;
  }, [activeRoom, deckType, session]);

  useEffect(() => {
    initializeGame();

    const localUser = session.getLocalPlayer();

    // Subscribe to authoritative multiplayer incoming events
    const unsub = session.onEvent(event => {
      switch (event.type) {
        case 'CARD_PLAYED': {
          if (event.playerId !== localUser?.id) {
            setDiscardPile(prev => [...prev, event.playedCard]);
            setActiveColor(event.activeColor);
            activeColorRef.current = event.activeColor;
            setPendingDrawStack(event.pendingDrawStack);
            pendingDrawStackRef.current = event.pendingDrawStack;
            setAllPlayers(prev => {
              const next = prev.map(p => (p.id === event.playerId ? { ...p, cardCount: event.newCardCount } : p));
              allPlayersRef.current = next;
              return next;
            });
            NativeEffectsService.triggerCardPlay();
            setAnnouncement({
              text: 'Opponent played: ',
              highlight: `${event.activeColor} ${event.playedCard.value.replace(/_/g, ' ')}`,
              color: COLOR_MAP[event.activeColor] || COLORS.unoYellow,
            });
          }
          break;
        }

        case 'CARD_DRAWN': {
          if (event.playerId !== localUser?.id) {
            setAllPlayers(prev => {
              const next = prev.map(p => (p.id === event.playerId ? { ...p, cardCount: event.newCardCount } : p));
              allPlayersRef.current = next;
              return next;
            });
            setAnnouncement({
              text: 'Opponent ',
              highlight: 'drew a card from deck',
              color: '#94A3B8',
            });
          }
          break;
        }

        case 'PRIVATE_HAND_UPDATE': {
          // Securely receive private hand update
          if (event.playerId === localUser?.id) {
            setAllPlayers(prev => {
              const next = prev.map((p, idx) =>
                idx === 0 ? { ...p, hand: event.hand, cardCount: event.hand.length } : p
              );
              allPlayersRef.current = next;
              return next;
            });
            // Update localNewHand in active shuffle animation config if running
            setShuffleAnimationConfig(prev => {
              if (prev && prev.visible) {
                return { ...prev, localNewHand: event.hand };
              }
              return prev;
            });
          }
          break;
        }

        case 'WILD_COLOR_SELECTED': {
          setActiveColor(event.activeColor);
          activeColorRef.current = event.activeColor;
          setCanChooseWild(true);
          setActionLock('IDLE');
          break;
        }

        case 'SHUFFLE_AND_REDEAL_HANDS': {
          const cardPlayer = allPlayersRef.current.find(p => p.id === event.cardPlayerId);
          const cardPlayerName = cardPlayer?.name || 'Opponent';

          // Build participant data with accurate screen positions
          const participants: ShuffleParticipant[] = allPlayersRef.current
            .filter(p => !p.isEliminated)
            .map(p => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              isLocal: p.id === localUser?.id || p.id === allPlayersRef.current[0]?.id,
              initialCardCount: (event.initialCardCounts && event.initialCardCounts[p.id]) || p.cardCount,
              finalCardCount: event.playerCardCounts[p.id] !== undefined ? event.playerCardCounts[p.id] : p.cardCount,
              screenPos: getPlayerScreenCoord(p.id),
            }));

          const localParticipant = participants.find(p => p.isLocal);
          const localHand = allPlayersRef.current.find(p => p.id === localParticipant?.id)?.hand || [];

          setActionLock('SHUFFLING_HANDS');

          pendingShuffleResultRef.current = {
            result: {
              updatedPlayers: allPlayersRef.current.map(p => ({
                ...p,
                cardCount: event.playerCardCounts[p.id] !== undefined ? event.playerCardCounts[p.id] : p.cardCount,
              })),
              cardCounts: event.playerCardCounts,
              initialCardCounts: event.initialCardCounts || {},
              eligiblePlayerIds: participants.map(p => p.id),
              dealingOrder: event.dealingOrder || [],
              dealSequence: (event.dealSequence || []).map(id => ({ playerId: id, card: { id: 'card', color: 'WILD', value: '7' } })),
              totalCards: event.totalCards || 20,
            },
            cardPlayerId: event.cardPlayerId || '',
            pendingCard: null,
          };

          setShuffleAnimationConfig({
            visible: true,
            cardPlayerId: event.cardPlayerId || '',
            cardPlayerName,
            participants,
            dealSequence: event.dealSequence || event.dealingOrder || [],
            localNewHand: localHand,
            totalCards: event.totalCards || 20,
          });
          break;
        }

        case 'HANDS_SWAPPED': {
          setAllPlayers(prev => {
            const next = prev.map(p => {
              if (p.id === event.player1Id) return { ...p, cardCount: event.player1CardCount };
              if (p.id === event.player2Id) return { ...p, cardCount: event.player2CardCount };
              return p;
            });
            allPlayersRef.current = next;
            return next;
          });
          showToast('7 SWAP HANDS', 'Hands were swapped between players!', 'warning');
          break;
        }

        case 'HANDS_PASSED': {
          if (event.playerCardCounts) {
            setAllPlayers(prev => {
              const next = prev.map(p => ({
                ...p,
                cardCount: event.playerCardCounts[p.id] !== undefined ? event.playerCardCounts[p.id] : p.cardCount,
              }));
              allPlayersRef.current = next;
              return next;
            });
          }
          showToast('0 PASS HANDS', `Hands passed ${event.direction === 'CW' ? 'Clockwise' : 'Counter-Clockwise'}!`, 'warning');
          break;
        }

        case 'DISCARD_ALL_TRIGGERED': {
          showToast('DISCARD ALL', `Discarded all ${event.color} cards!`, 'warning');
          break;
        }

        case 'SKIP_EVERYONE_TRIGGERED': {
          showToast('SKIP EVERYONE', 'All other players were skipped! Extra turn granted!', 'warning');
          break;
        }

        case 'DRAW_STACK_RESOLVED': {
          setPendingDrawStack(0);
          pendingDrawStackRef.current = 0;
          showToast('STACK PENALTY', `Player drew +${event.penaltyAmount} penalty cards!`, 'penalty');
          break;
        }

        case 'PHASE_CHANGED': {
          const isOwner = event.choiceOwnerId === localUser?.id;
          const ownerPlayer = activeRoom?.players.find(p => p.id === event.choiceOwnerId);
          const ownerName = isOwner ? 'You' : ownerPlayer?.name || 'Player';

          if (event.phase === 'CHOOSING_WILD_COLOR') {
            setCanChooseWild(isOwner);
            setWildChooserName(ownerName);
            setActionLock('CHOOSING_WILD_COLOR');
          } else if (event.phase === 'CHOOSING_CUSTOM_WILD_POWER') {
            setCanChooseCustomWild(isOwner);
            setCustomWildChooserName(ownerName);
            setCustomWildModalVisible(true);
          } else if (event.phase === 'CHOOSING_SWAP_TARGET') {
            setCanChooseSwap(isOwner);
            setSwapChooserName(ownerName);
            setSwapModalVisible(true);
          } else if (event.phase === 'CHOOSING_ROULETTE_COLOR') {
            setCanChooseRoulette(isOwner);
            setRouletteTargetName(ownerName);
            setRouletteModalVisible(true);
          }
          break;
        }

        case 'UNO_CALLED': {
          showToast('UNO!', 'Player called UNO! 🔥', 'success');
          break;
        }

        case 'GAME_STATE_UPDATE': {
          const targetIndex = allPlayersRef.current.findIndex(p => p.id === event.currentPlayerId);
          const newIndex = targetIndex !== -1 ? targetIndex : 0;
          const targetPlayer = allPlayersRef.current[newIndex];
          const isMe = targetPlayer?.controller === 'LOCAL_HUMAN' || targetPlayer?.id === localUser?.id;

          if (event.discardPile && Array.isArray(event.discardPile)) {
            setDiscardPile([...event.discardPile]);
          } else if (event.discardTop) {
            const topCard = event.discardTop;
            setDiscardPile(prev => [...prev, topCard]);
          }

          setActiveColor(event.activeColor);
          activeColorRef.current = event.activeColor;
          setPlayDirection(event.direction);
          playDirectionRef.current = event.direction;
          setPendingDrawStack(event.pendingDrawStack);
          pendingDrawStackRef.current = event.pendingDrawStack;

          setCurrentPlayerIndex(newIndex);
          currentPlayerIndexRef.current = newIndex;

          const nextTurn = (event.revision || turnIdRef.current) + 1;
          setTurnId(nextTurn);
          turnIdRef.current = nextTurn;

          // Update card counts from event.players if available
          if (event.players && Array.isArray(event.players)) {
            setAllPlayers(prev => {
              const next = prev.map(p => {
                const rp = event.players.find((ep: any) => ep.id === p.id);
                return rp && typeof rp.cardCount === 'number' ? { ...p, cardCount: rp.cardCount } : p;
              });
              allPlayersRef.current = next;
              return next;
            });
          }

          if (isMe) {
            setActionLock('IDLE');
            NativeEffectsService.triggerTurnChange();
          } else {
            setActionLock('WAITING_FOR_REMOTE_PLAYER');
          }

          if (event.playedCard && event.playerWhoPlayed !== localUser?.id) {
            NativeEffectsService.triggerCardPlay();
            setAnnouncement({
              text: 'Opponent played: ',
              highlight: `${event.activeColor} ${event.playedCard.value.replace(/_/g, ' ')}`,
              color: COLOR_MAP[event.activeColor] || COLORS.unoYellow,
            });
          }
          break;
        }

        case 'TURN_CHANGED': {
          const targetIndex = allPlayersRef.current.findIndex(p => p.id === event.nextPlayerId);
          const newIndex = targetIndex !== -1 ? targetIndex : 0;
          const targetPlayer = allPlayersRef.current[newIndex];
          const isMe = targetPlayer?.controller === 'LOCAL_HUMAN' || targetPlayer?.id === localUser?.id;

          setCurrentPlayerIndex(newIndex);
          currentPlayerIndexRef.current = newIndex;
          setActiveColor(event.activeColor);
          activeColorRef.current = event.activeColor;
          setPlayDirection(event.direction);
          playDirectionRef.current = event.direction;
          setPendingDrawStack(event.pendingDrawStack);
          pendingDrawStackRef.current = event.pendingDrawStack;

          const nextTurn = (event.revision || turnIdRef.current) + 1;
          setTurnId(nextTurn);
          turnIdRef.current = nextTurn;

          console.log(`[TURN] (Multiplayer Event) turnId=${nextTurn} player=${targetPlayer?.name} controller=${targetPlayer?.controller} direction=${event.direction} drawStack=${event.pendingDrawStack}`);

          if (isMe) {
            setActionLock('IDLE');
            NativeEffectsService.triggerTurnChange();
          } else {
            setActionLock('WAITING_FOR_REMOTE_PLAYER');
          }
          break;
        }

        case 'PLAYER_FINISHED': {
          setAllPlayers(prev => {
            const next = prev.map(p =>
              p.id === event.playerId ? { ...p, status: 'FINISHED' as PlayerStatus, finishRank: event.rank } : p
            );
            allPlayersRef.current = next;
            return next;
          });
          if (event.finishingOrder) {
            setFinishingOrder(event.finishingOrder);
            finishingOrderRef.current = event.finishingOrder;
          }
          const finisher = allPlayersRef.current.find(p => p.id === event.playerId);
          showToast('FINISHED!', `${finisher?.name || 'Player'} finished in position #${event.rank}!`, 'success');
          break;
        }

        case 'PLAYER_WON': {
          if (event.finalResults) {
            setFinalResults(event.finalResults);
          }
          setWinner({ name: event.winnerName, avatar: '👑', isHuman: event.winnerId === localUser?.id });
          setActionLock('GAME_OVER');
          break;
        }
      }
    });

    return () => {
      unsub();
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }
    };
  }, [initializeGame, showToast, activeRoom, session]);

  const isPassAndPlay = activeRoom?.mode === 'PASS_AND_PLAY';
  const localUser = session.getLocalPlayer();
  const activePlayer = allPlayers[currentPlayerIndex];

  const myPlayer = isPassAndPlay
    ? activePlayer
    : (allPlayers.find(p => p.id === localUser?.id) || allPlayers[0]);
  const isMyPlayerFinished = Boolean(
    myPlayer && (myPlayer.status === 'FINISHED' || (myPlayer.finishRank !== undefined && myPlayer.cardCount === 0))
  );
  const isMyPlayerEliminated = Boolean(myPlayer && (myPlayer.status === 'ELIMINATED' || myPlayer.isEliminated));

  const myHand = (isPassAndPlay
    ? activePlayer?.hand
    : (allPlayers.find(p => p.id === localUser?.id)?.hand || allPlayers[0]?.hand)) || [];

  const opponents = isPassAndPlay
    ? allPlayers.filter((_, idx) => idx !== currentPlayerIndex)
    : allPlayers.filter(p => p.id !== (localUser?.id || allPlayers[0]?.id));

  const isMyTurn =
    !isMyPlayerFinished &&
    !isMyPlayerEliminated &&
    (isPassAndPlay
      ? activePlayer?.controller === 'LOCAL_HUMAN'
      : (activePlayer?.id === localUser?.id || (!localUser && currentPlayerIndex === 0)) &&
        activePlayer?.controller === 'LOCAL_HUMAN') &&
    actionLock === 'IDLE';

  const ensureCardsInDeck = useCallback(
    (currentDeck: UnoCard[], currentDiscard: UnoCard[]): { deck: UnoCard[]; discard: UnoCard[] } => {
      if (currentDeck.length > 0) {
        return { deck: currentDeck, discard: currentDiscard };
      }
      const recycled = UnoDeckService.recycleDiscard(currentDiscard);
      return {
        deck: recycled.newDeck,
        discard: recycled.remainingDiscard,
      };
    },
    []
  );

  // Dynamic player-count aware opponent layout & scaling for 2 to 10 players
  const getOpponentLayout = useCallback((idx: number, total: number) => {
    const layout = getSingleOpponentLayout(idx, total);
    return {
      pos: layout.pos,
      scale: layout.nodeScale,
      centerCoord: layout.centerCoord,
      compact: layout.compact,
      maxCardBacks: layout.maxCardBacks,
      avatarSize: layout.avatarSize,
      nameFontSize: layout.nameFontSize,
      cardCountFontSize: layout.cardCountFontSize,
    };
  }, []);

  // Screen coordinate helper for cinematic card animations (flight, shuffle, redistribution)
  const getPlayerScreenCoord = useCallback(
    (playerId: string): { x: number; y: number } => {
      const localUser = session.getLocalPlayer();
      const isPassAndPlay = activeRoom?.mode === 'PASS_AND_PLAY';
      const curIdx = currentPlayerIndexRef.current;

      const isBottomPlayer = isPassAndPlay
        ? allPlayersRef.current[curIdx]?.id === playerId
        : (playerId === localUser?.id || playerId === allPlayersRef.current[0]?.id);

      if (isBottomPlayer) {
        return { x: 960, y: 920 };
      }

      const opponentList = isPassAndPlay
        ? allPlayersRef.current.filter((_, idx) => idx !== curIdx)
        : allPlayersRef.current.slice(1);

      const opIdx = opponentList.findIndex(p => p.id === playerId);
      if (opIdx !== -1) {
        return getOpponentLayout(opIdx, opponentList.length).centerCoord;
      }

      return { x: 960, y: 460 };
    },
    [session, activeRoom, getOpponentLayout]
  );

  // Bot Turn Loop (ONLY FOR BOT PLAYERS - Production Hardened Guard)
  const runBotTurn = useCallback(
    (botIndex: number, currentActiveColor: UnoColor, expectedTurnId?: number) => {
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }

      const bot = allPlayersRef.current[botIndex];
      // BOT TURN GUARD: Assert player controller is BOT!
      if (!bot || bot.controller !== 'BOT') return;

      const targetTurnId = expectedTurnId !== undefined ? expectedTurnId : turnIdRef.current;
      const expectedBotId = bot.id;

      // Visible Bot Thinking moment
      setAnnouncement({
        text: 'Bot thinking: ',
        highlight: `${bot.name} is choosing a card...`,
        color: '#94A3B8',
      });

      // Natural thinking delay between 1100-1400ms
      botTimerRef.current = setTimeout(() => {
        botTimerRef.current = null;
        // CANCEL STALE BOT TIMERS GUARD: Check turnId, bot index, and player controller
        if (turnIdRef.current !== targetTurnId) {
          console.log(`[BOT_CANCEL] Cancelled stale bot timer: expected turn ${targetTurnId}, current turn ${turnIdRef.current}`);
          return;
        }
        if (currentPlayerIndexRef.current !== botIndex) {
          console.log(`[BOT_CANCEL] Cancelled stale bot timer: expected index ${botIndex}, current index ${currentPlayerIndexRef.current}`);
          return;
        }
        const currentActive = allPlayersRef.current[currentPlayerIndexRef.current];
        if (!currentActive || currentActive.controller !== 'BOT' || currentActive.id !== expectedBotId) {
          return;
        }
        if (actionLock === 'GAME_OVER' || actionLock === 'SHUFFLING_HANDS') return;

        setDiscardPile(latestDiscard => {
          setDeck(latestDeck => {
            const { deck: validDeck, discard: validDiscard } = ensureCardsInDeck(latestDeck, latestDiscard);
            const totalOpponents = Math.max(1, allPlayersRef.current.length - 1);
            const botCoord = getOpponentLayout(botIndex - 1, totalOpponents).centerCoord;

            // Bot response to pending draw stack
            const curStack = pendingDrawStackRef.current;
            if (curStack > 0) {
              const topCard = validDiscard.length > 0 ? validDiscard[validDiscard.length - 1] : null;
              const topDraw = topCard ? UnoDeckService.getDrawAmount(topCard) : 2;
              const currentDrawValue = topDraw > 0 ? topDraw : 2;

              // Eligible bot stack options: newDrawValue >= currentDrawValue
              const botEligibleStackValues: Array<'DRAW_TWO' | 'WILD_DRAW_FOUR' | 'WILD_DRAW_SIX' | 'WILD_DRAW_TEN'> = [];
              if (currentDrawValue <= 2) botEligibleStackValues.push('DRAW_TWO');
              if (currentDrawValue <= 4) botEligibleStackValues.push('WILD_DRAW_FOUR');
              if (currentDrawValue <= 6 && deckType === 'NO_MERCY') botEligibleStackValues.push('WILD_DRAW_SIX');
              if (currentDrawValue <= 10 && deckType === 'NO_MERCY') botEligibleStackValues.push('WILD_DRAW_TEN');

              const canBotStack = botEligibleStackValues.length > 0 && Math.random() > 0.45;

              if (canBotStack) {
                const chosenStackValue = botEligibleStackValues[Math.floor(Math.random() * botEligibleStackValues.length)];
                const stackAmount = chosenStackValue === 'DRAW_TWO' ? 2 : chosenStackValue === 'WILD_DRAW_FOUR' ? 4 : chosenStackValue === 'WILD_DRAW_SIX' ? 6 : 10;
                const botColors: UnoColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
                const chosenColor = botColors[Math.floor(Math.random() * botColors.length)];

                const stackCard: UnoCard = {
                  id: `bot_card_${Date.now()}`,
                  color: chosenStackValue === 'DRAW_TWO' ? chosenColor : 'WILD',
                  value: chosenStackValue,
                };

                setAllPlayers(prev => {
                  const next = prev.map((p, idx) =>
                    idx === botIndex ? { ...p, cardCount: Math.max(1, p.cardCount - 1) } : p
                  );
                  allPlayersRef.current = next;
                  return next;
                });

                setFlightConfig({
                  active: true,
                  card: stackCard,
                  isDrawFlight: false,
                  startPos: botCoord,
                  endPos: { x: 1088, y: 488 },
                });

                pendingFlightResolve.current = () => {
                  setDiscardPile(prev => [...prev, stackCard]);
                  setPendingDrawStack(prev => {
                    const s = prev + stackAmount;
                    pendingDrawStackRef.current = s;
                    return s;
                  });
                  setActiveColor(chosenColor);
                  activeColorRef.current = chosenColor;
                  NativeEffectsService.triggerCardPlay();
                  advanceTurnRef.current({ playedCard: stackCard, newActiveColor: chosenColor, reason: `BOT_STACK_${chosenStackValue}` });
                };

                return validDeck;
              } else {
                // Bot takes stack penalty
                const penalty = curStack;
                setPendingDrawStack(0);
                pendingDrawStackRef.current = 0;
                setAllPlayers(prev => {
                  const next = prev.map((p, idx) =>
                    idx === botIndex ? { ...p, cardCount: p.cardCount + penalty } : p
                  );
                  allPlayersRef.current = next;
                  return next;
                });
                showToast('STACK PENALTY', `${bot.name} took +${penalty} penalty cards!`, 'penalty');
                advanceTurnRef.current({ newActiveColor: currentActiveColor, reason: 'BOT_ACCEPTED_STACK' });
                return validDeck;
              }
            }

            // Normal bot play or draw - allow bots with 1 card to play and finish!
            const willPlayCard = (bot.cardCount === 1 ? Math.random() > 0.15 : Math.random() > 0.35) && bot.cardCount >= 1;

            if (willPlayCard) {
              const botColors: UnoColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
              const chosenColor = botColors[Math.floor(Math.random() * botColors.length)];
              const botValues = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'SKIP', 'REVERSE', 'DRAW_TWO'];
              const chosenValue = botValues[Math.floor(Math.random() * botValues.length)];

              const simulatedCard: UnoCard = {
                id: `bot_card_${Date.now()}`,
                color: chosenColor,
                value: chosenValue as any,
              };

              setAllPlayers(prev => {
                const next = prev.map((p, idx) => {
                  if (idx === botIndex) {
                    const newCount = Math.max(0, p.cardCount - 1);
                    if (newCount === 1) {
                      showToast('UNO!', `${p.name} called UNO!`, 'warning');
                    }
                    return { ...p, cardCount: newCount };
                  }
                  return p;
                });
                allPlayersRef.current = next;
                return next;
              });

              // Evaluate bot completion via authoritative engine
              const evalResult = UnoGameEngine.evaluatePlayerCompletion(
                allPlayersRef.current,
                rules,
                finishingOrderRef.current,
                eliminatedOrderRef.current
              );

              finishingOrderRef.current = evalResult.finishingOrder;
              eliminatedOrderRef.current = evalResult.eliminatedOrder;
              setFinishingOrder(evalResult.finishingOrder);
              setEliminatedOrder(evalResult.eliminatedOrder);

              allPlayersRef.current = evalResult.updatedPlayers;
              setAllPlayers(evalResult.updatedPlayers);

              if (evalResult.justFinishedPlayerId) {
                const finisher = evalResult.updatedPlayers.find(p => p.id === evalResult.justFinishedPlayerId);
                showToast('FINISHED!', `${finisher?.name || 'Bot'} finished in position #${finisher?.finishRank || 1}!`, 'success');
              }

              if (evalResult.isMatchOver) {
                setFinalResults(evalResult.finalResults);
                const w = evalResult.winner || bot;
                setWinner({ name: w.name, avatar: w.avatar, isHuman: w.isHuman ?? false });
                setActionLock('GAME_OVER');
                return validDeck;
              }

              // Apply draw stack if card is DRAW_TWO
              if (simulatedCard.value === 'DRAW_TWO') {
                setPendingDrawStack(prev => {
                  const s = prev + 2;
                  pendingDrawStackRef.current = s;
                  return s;
                });
              }

              // Launch visible play flight from bot position to discard pile
              setFlightConfig({
                active: true,
                card: simulatedCard,
                isDrawFlight: false,
                startPos: botCoord,
                endPos: { x: 1088, y: 488 },
              });

              pendingFlightResolve.current = () => {
                setDiscardPile(prev => [...prev, simulatedCard]);
                setActiveColor(chosenColor);
                activeColorRef.current = chosenColor;
                setAnnouncement({
                  text: `${bot.name} played: `,
                  highlight: `${chosenColor} ${chosenValue}`,
                  color: COLOR_MAP[chosenColor] || COLORS.unoYellow,
                });

                NativeEffectsService.triggerCardPlay();
                advanceTurnRef.current({ playedCard: simulatedCard, newActiveColor: chosenColor, reason: 'BOT_PLAY' });
              };

              return validDeck;
            } else {
              // Bot draws card: launch visible draw flight from draw pile to bot position
              const nextDeck = [...validDeck];
              const drawnCard = nextDeck.pop() || {
                id: `bot_draw_${Date.now()}`,
                color: 'RED' as UnoColor,
                value: '1' as const,
              };

              setFlightConfig({
                active: true,
                card: drawnCard,
                isDrawFlight: true,
                startPos: { x: 832, y: 488 },
                endPos: botCoord,
              });

              pendingFlightResolve.current = () => {
                setAllPlayers(prev => {
                  const next = prev.map((p, idx) =>
                    idx === botIndex ? { ...p, cardCount: p.cardCount + 1 } : p
                  );
                  allPlayersRef.current = next;
                  return next;
                });

                // Check whether THAT newly drawn card is legally playable
                const topCard = validDiscard[validDiscard.length - 1] || null;
                const isPlayable = UnoDeckService.canPlayCard(
                  drawnCard,
                  topCard,
                  currentActiveColor,
                  0,
                  rules
                );

                if (isPlayable && Math.random() > 0.4) {
                  // Bot immediately plays the drawn playable card
                  const chosenColor = drawnCard.color === 'WILD' ? (['RED', 'YELLOW', 'GREEN', 'BLUE'] as UnoColor[])[Math.floor(Math.random() * 4)] : drawnCard.color;
                  setDiscardPile(prev => [...prev, drawnCard]);
                  setActiveColor(chosenColor);
                  activeColorRef.current = chosenColor;
                  setAllPlayers(prev => {
                    const next = prev.map((p, idx) =>
                      idx === botIndex ? { ...p, cardCount: Math.max(0, p.cardCount - 1) } : p
                    );
                    allPlayersRef.current = next;
                    return next;
                  });

                  // Evaluate bot completion via authoritative engine
                  const evalResult = UnoGameEngine.evaluatePlayerCompletion(
                    allPlayersRef.current,
                    rules,
                    finishingOrderRef.current,
                    eliminatedOrderRef.current
                  );

                  finishingOrderRef.current = evalResult.finishingOrder;
                  eliminatedOrderRef.current = evalResult.eliminatedOrder;
                  setFinishingOrder(evalResult.finishingOrder);
                  setEliminatedOrder(evalResult.eliminatedOrder);

                  allPlayersRef.current = evalResult.updatedPlayers;
                  setAllPlayers(evalResult.updatedPlayers);

                  if (evalResult.justFinishedPlayerId) {
                    const finisher = evalResult.updatedPlayers.find(p => p.id === evalResult.justFinishedPlayerId);
                    showToast('FINISHED!', `${finisher?.name || 'Bot'} finished in position #${finisher?.finishRank || 1}!`, 'success');
                  }

                  if (evalResult.isMatchOver) {
                    setFinalResults(evalResult.finalResults);
                    const w = evalResult.winner || bot;
                    setWinner({ name: w.name, avatar: w.avatar, isHuman: w.isHuman ?? false });
                    setActionLock('GAME_OVER');
                    return;
                  }

                  setAnnouncement({
                    text: `${bot.name} played drawn card: `,
                    highlight: `${chosenColor} ${drawnCard.value.replace(/_/g, ' ')}`,
                    color: COLOR_MAP[chosenColor] || COLORS.unoYellow,
                  });
                  NativeEffectsService.triggerCardPlay();
                  advanceTurnRef.current({ playedCard: drawnCard, newActiveColor: chosenColor, reason: 'BOT_PLAY_DRAWN' });
                } else {
                  // Card is unplayable or bot keeps: turn auto-advances
                  setAnnouncement({
                    text: `${bot.name} `,
                    highlight: isPlayable ? 'drew and kept card' : 'drew an unplayable card',
                    color: '#94A3B8',
                  });
                  advanceTurnRef.current({ newActiveColor: currentActiveColor, reason: 'BOT_DRAW' });
                }
              };

              return nextDeck;
            }
          });

          return latestDiscard;
        });
      }, 1250);
    },
    [actionLock, ensureCardsInDeck, getOpponentLayout, showToast, rules]
  );

  // Authoritative Single Turn Advancement Path
  const advanceToNextActivePlayer = useCallback(
    (options?: {
      playedCard?: UnoCard;
      newActiveColor?: UnoColor;
      stepMultiplier?: number;
      reason?: string;
    }) => {
      // Clear any pending bot timer immediately
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }

      if (actionLock === 'GAME_OVER') return;

      setSelectedCardId(null);
      setHasDrawnThisTurn(false);

      const playedCard = options?.playedCard;
      const newActiveColor = options?.newActiveColor;
      let stepMultiplier = options?.stepMultiplier ?? 1;

      // Handle Direction & 2-Player Reverse Rule
      let currentDir = playDirectionRef.current;
      const activePlayers = UnoGameEngine.getEligibleActivePlayers(allPlayersRef.current);

      if (playedCard?.value === 'REVERSE') {
        currentDir = currentDir === 'CW' ? 'CCW' : 'CW';
        setPlayDirection(currentDir);
        playDirectionRef.current = currentDir;
        if (activePlayers.length === 2) {
          stepMultiplier = 2; // In 2-player game, Reverse acts as Skip!
        }
      } else if (playedCard?.value === 'WILD_REVERSE_DRAW_FOUR') {
        currentDir = currentDir === 'CW' ? 'CCW' : 'CW';
        setPlayDirection(currentDir);
        playDirectionRef.current = currentDir;
      }

      const curIdx = currentPlayerIndexRef.current;
      const fromPlayer = allPlayersRef.current[curIdx];

      if (playedCard?.value === 'SKIP') {
        stepMultiplier = 2;
      } else if (playedCard?.value === 'SKIP_EVERYONE') {
        // Card player takes another turn immediately UNLESS they just emptied their hand and finished!
        const isFromPlayerFinished = fromPlayer && (fromPlayer.status === 'FINISHED' || fromPlayer.status === 'ELIMINATED' || fromPlayer.isEliminated || fromPlayer.cardCount === 0);
        stepMultiplier = isFromPlayerFinished ? 1 : 0;
      }

      const nextIndex = UnoGameEngine.getNextActivePlayerIndex(
        allPlayersRef.current,
        curIdx,
        currentDir,
        stepMultiplier
      );

      const nextPlayer = allPlayersRef.current[nextIndex];
      if (!nextPlayer) return;

      // Increment turnId & revision
      const nextTurnId = turnIdRef.current + 1;
      turnIdRef.current = nextTurnId;
      setTurnId(nextTurnId);

      setCurrentPlayerIndex(nextIndex);
      currentPlayerIndexRef.current = nextIndex;

      if (newActiveColor) {
        setActiveColor(newActiveColor);
        activeColorRef.current = newActiveColor;
      }

      const effectiveColor = newActiveColor || activeColorRef.current;

      console.log(`[TURN_CHANGE] from=${fromPlayer?.name} (${fromPlayer?.id}) to=${nextPlayer.name} (${nextPlayer.id}) reason=${options?.reason || playedCard?.value || 'NORMAL'}`);
      console.log(`[TURN] turnId=${nextTurnId} player=${nextPlayer.name} controller=${nextPlayer.controller} direction=${currentDir} phase=WAITING_FOR_ACTION drawStack=${pendingDrawStackRef.current}`);

      if (nextPlayer.controller === 'LOCAL_HUMAN') {
        if (isPassAndPlay) {
          if (fromPlayer && nextPlayer.id === fromPlayer.id && playedCard?.value === 'SKIP_EVERYONE') {
            setActionLock('IDLE');
            showToast('SKIP EVERYONE!', `${nextPlayer.name} takes another turn!`, 'success');
            NativeEffectsService.triggerTurnChange();
          } else {
            setHandoffTarget(nextPlayer);
            setActionLock('PASS_DEVICE');
          }
        } else {
          setActionLock('IDLE');
          NativeEffectsService.triggerTurnChange();
        }
      } else if (nextPlayer.controller === 'BOT') {
        setActionLock('IDLE');
        runBotTurn(nextIndex, effectiveColor, nextTurnId);
      } else {
        setActionLock('WAITING_FOR_REMOTE_PLAYER');
      }
    },
    [isPassAndPlay, runBotTurn, actionLock, showToast]
  );

  advanceTurnRef.current = advanceToNextActivePlayer;
  const advanceTurn = advanceToNextActivePlayer;

  // 2. DRAW CARD Action & Draw Stack Handling (Parts 5 & 21)
  const handleDrawCard = useCallback(() => {
    if (!isMyTurn) {
      NativeEffectsService.triggerInvalidAction();
      showToast('NOT YOUR TURN', 'Wait for your turn to draw cards.', 'warning');
      return;
    }
    if (actionLock !== 'IDLE') return;

    // Part 5: If an active draw stack exists, tapping draw pile ACCEPTS the entire accumulated penalty!
    if (pendingDrawStack > 0) {
      const penalty = pendingDrawStack;
      setActionLock('DRAWING_CARD');

      const { deck: currentDeck, discard: currentDiscard } = ensureCardsInDeck(deck, discardPile);
      const drawnCards: UnoCard[] = [];
      let tempDeck = [...currentDeck];

      for (let i = 0; i < penalty; i++) {
        if (tempDeck.length === 0) {
          const rec = UnoDeckService.recycleDiscard(currentDiscard);
          tempDeck = rec.newDeck;
        }
        if (tempDeck.length > 0) {
          drawnCards.push(tempDeck.pop()!);
        }
      }

      // Visual flight animation for accepting penalty cards
      setFlightConfig({
        active: true,
        card: drawnCards[0] || null,
        isDrawFlight: true,
        startPos: { x: 832, y: 488 },
        endPos: { x: 960, y: 920 },
      });

      pendingFlightResolve.current = () => {
        const curIdx = currentPlayerIndexRef.current;
        const nextPlayers = allPlayersRef.current.map((p, idx) => {
          if (idx === curIdx) {
            const nextHand = [...p.hand, ...drawnCards];
            return { ...p, hand: nextHand, cardCount: nextHand.length };
          }
          return p;
        });
        allPlayersRef.current = nextPlayers;
        setAllPlayers(nextPlayers);

        setDeck(tempDeck);
        setPendingDrawStack(0);
        pendingDrawStackRef.current = 0;
        showToast('DRAW PENALTY', `You drew ${drawnCards.length} cards from the stack!`, 'penalty');
        session.acceptDrawStack();

        // Check Mercy Rule (25+ cards in No Mercy)
        const evalResult = UnoGameEngine.evaluatePlayerCompletion(
          allPlayersRef.current,
          rules,
          finishingOrderRef.current,
          eliminatedOrderRef.current
        );

        finishingOrderRef.current = evalResult.finishingOrder;
        eliminatedOrderRef.current = evalResult.eliminatedOrder;
        setFinishingOrder(evalResult.finishingOrder);
        setEliminatedOrder(evalResult.eliminatedOrder);

        allPlayersRef.current = evalResult.updatedPlayers;
        setAllPlayers(evalResult.updatedPlayers);

        if (evalResult.justEliminatedPlayerId) {
          const elim = evalResult.updatedPlayers.find(p => p.id === evalResult.justEliminatedPlayerId);
          showToast('ELIMINATED!', `${elim?.name || 'Player'} reached 25+ cards and was eliminated!`, 'penalty');
        }

        if (evalResult.isMatchOver) {
          setFinalResults(evalResult.finalResults);
          const w = evalResult.winner;
          setWinner(w ? { name: w.name, avatar: w.avatar, isHuman: w.isHuman } : null);
          setActionLock('GAME_OVER');
          return;
        }

        // Penalty drawer automatically loses turn - advances to next active player without requiring End Turn
        advanceToNextActivePlayer({ newActiveColor: activeColorRef.current, reason: 'ACCEPTED_DRAW_STACK' });
      };

      return;
    }

    if (hasDrawnThisTurn) {
      NativeEffectsService.triggerInvalidAction();
      showToast('ALREADY DRAWN', 'You can only draw once per turn, then play or end turn.', 'warning');
      return;
    }

    const { deck: currentDeck, discard: currentDiscard } = ensureCardsInDeck(deck, discardPile);
    if (currentDeck.length === 0) {
      showToast('EMPTY DECK', 'No cards available to draw.', 'warning');
      return;
    }

    const cardToDraw = currentDeck[currentDeck.length - 1];
    const newDeck = currentDeck.slice(0, -1);

    setActionLock('DRAWING_CARD');

    setFlightConfig({
      active: true,
      card: cardToDraw,
      isDrawFlight: true,
      startPos: { x: 832, y: 488 },
      endPos: { x: 960, y: 920 },
    });

    pendingFlightResolve.current = () => {
      const curIdx = currentPlayerIndexRef.current;
      const curPlayer = allPlayersRef.current[curIdx];

      // 1. Add drawn card to player's hand and commit deck
      const nextPlayers = allPlayersRef.current.map((p, idx) => {
        if (idx === curIdx) {
          const nextHand = [...p.hand, cardToDraw];
          return { ...p, hand: nextHand, cardCount: nextHand.length };
        }
        return p;
      });
      allPlayersRef.current = nextPlayers;
      setAllPlayers(nextPlayers);

      setDeck(newDeck);
      setDiscardPile(currentDiscard);

      // Check Mercy Rule (25+ cards in No Mercy)
      const evalResult = UnoGameEngine.evaluatePlayerCompletion(
        allPlayersRef.current,
        rules,
        finishingOrderRef.current,
        eliminatedOrderRef.current
      );

      finishingOrderRef.current = evalResult.finishingOrder;
      eliminatedOrderRef.current = evalResult.eliminatedOrder;
      setFinishingOrder(evalResult.finishingOrder);
      setEliminatedOrder(evalResult.eliminatedOrder);

      allPlayersRef.current = evalResult.updatedPlayers;
      setAllPlayers(evalResult.updatedPlayers);

      if (evalResult.justEliminatedPlayerId) {
        const elim = evalResult.updatedPlayers.find(p => p.id === evalResult.justEliminatedPlayerId);
        showToast('ELIMINATED!', `${elim?.name || 'Player'} reached 25+ cards and was eliminated!`, 'penalty');
      }

      if (evalResult.isMatchOver) {
        setFinalResults(evalResult.finalResults);
        const w = evalResult.winner;
        setWinner(w ? { name: w.name, avatar: w.avatar, isHuman: w.isHuman } : null);
        setActionLock('GAME_OVER');
        return;
      }

      session.drawCard();

      // 2. Check whether THAT newly drawn card is legally playable under current discard, color, and rules
      const topCard = currentDiscard[currentDiscard.length - 1] || null;
      const isPlayable = UnoDeckService.canPlayCard(
        cardToDraw,
        topCard,
        activeColorRef.current,
        0,
        rules
      );

      const curName = curPlayer?.name || 'You';

      if (!isPlayable) {
        // IF THE DRAWN CARD IS NOT PLAYABLE:
        // - Automatically complete the current player's turn.
        // - Automatically advance to the next eligible ACTIVE player.
        // - Do NOT require the player to press End Turn.
        // - Do NOT leave the player waiting on the same turn.
        // - Do NOT allow another card selection/action.
        setAnnouncement({
          text: `${curName} drew `,
          highlight: `${cardToDraw.color === 'WILD' ? '' : cardToDraw.color} ${cardToDraw.value.replace(/_/g, ' ')} (Unplayable)`,
          color: '#94A3B8',
        });
        showToast('DRAW: UNPLAYABLE', `${cardToDraw.color === 'WILD' ? '' : cardToDraw.color} ${cardToDraw.value.replace(/_/g, ' ')} cannot be played. Turn advances!`, 'warning');
        NativeEffectsService.triggerTurnChange();
        advanceToNextActivePlayer({ reason: 'DRAW_UNPLAYABLE_CARD' });
      } else {
        // IF THE DRAWN CARD IS PLAYABLE:
        // - Keep the current player's turn.
        // - Keep the drawn card in their hand.
        // - Allow the player to either:
        //     a) Play the drawn card, OR
        //     b) Press End Turn.
        // - End Turn remains available only because the drawn card is playable.
        setHasDrawnThisTurn(true);
        setActionLock('IDLE');
        NativeEffectsService.triggerCardSelect();
        setAnnouncement({
          text: `${curName} drew `,
          highlight: `${cardToDraw.color === 'WILD' ? '' : cardToDraw.color} ${cardToDraw.value.replace(/_/g, ' ')} (Playable!)`,
          color: COLOR_MAP[cardToDraw.color] || COLORS.unoYellow,
        });
        showToast('DRAW: PLAYABLE!', `Drawn card can be played! Play it or tap End Turn.`, 'success');
      }
    };
  }, [isMyTurn, actionLock, pendingDrawStack, hasDrawnThisTurn, deck, discardPile, ensureCardsInDeck, showToast, session, advanceToNextActivePlayer, rules]);

  // 3. PLAY CARD (Two-Tap Confirmed)
  const handlePlayCard = useCallback(
    (card: UnoCard) => {
      if (!isMyTurn) {
        NativeEffectsService.triggerInvalidAction();
        showToast('NOT YOUR TURN', 'Wait for your turn to play.', 'warning');
        return;
      }
      if (actionLock !== 'IDLE') return;

      const topCard = discardPile[discardPile.length - 1] || null;

      // Part 5: Stacking verification - newDrawValue >= currentDrawValue
      if (pendingDrawStack > 0) {
        if (!rules.stacking) {
          NativeEffectsService.triggerInvalidAction();
          showToast('STACK ACTIVE', `Stacking disabled. Draw penalty cards (+${pendingDrawStack})!`, 'penalty');
          return;
        }
        const cardDraw = UnoDeckService.getDrawAmount(card);
        const topDraw = topCard ? UnoDeckService.getDrawAmount(topCard) : 2;
        const currentDrawValue = topDraw > 0 ? topDraw : 2;
        if (cardDraw === 0) {
          NativeEffectsService.triggerInvalidAction();
          showToast('STACK ACTIVE', `You must play a +card to stack or draw penalty (+${pendingDrawStack})!`, 'penalty');
          return;
        }
        if (cardDraw < currentDrawValue) {
          NativeEffectsService.triggerInvalidAction();
          showToast('STACK RULE', `Cannot stack +${cardDraw} on +${currentDrawValue}. Must be +${currentDrawValue} or higher!`, 'penalty');
          return;
        }
      }

      const isPlayable = UnoDeckService.canPlayCard(card, topCard, activeColor, pendingDrawStack, rules);

      if (!isPlayable) {
        NativeEffectsService.triggerInvalidAction();
        showToast('INVALID PLAY', 'This card does not match color or value.', 'warning');
        return;
      }

      // Special Card Trigger Checks
      const curPlayer = allPlayersRef.current[currentPlayerIndexRef.current];
      const curName = curPlayer?.name || 'Player';

      if (card.value === 'CUSTOM_WILD') {
        setSelectedCardId(card.id);
        setPendingWildCard(card);
        setCustomWildChooserName(curName);
        setCanChooseCustomWild(true);
        setCustomWildModalVisible(true);
        setActionLock('CHOOSING_CUSTOM_WILD_POWER');
        return;
      }

      if (card.value === 'SHUFFLE_HANDS') {
        // Dedicated Shuffle Hands (Section 18: Authoritative + Cinematic Animation)
        setSelectedCardId(card.id);
        setPendingWildCard(card);
        executeShuffleHandsLogic(card);
        return;
      }

      if (card.value === '7' && deckType === 'NO_MERCY') {
        // 7 Swap Hands (Mandatory in No Mercy)
        setSelectedCardId(card.id);
        setPendingWildCard(card);
        setSwapChooserName(curName);
        setCanChooseSwap(true);
        setSwapModalVisible(true);
        setActionLock('CHOOSING_SWAP_TARGET');
        return;
      }

      if (card.value === '0' && deckType === 'NO_MERCY') {
        // 0 Pass Hands (Mandatory in No Mercy)
        executePassHandsLogic(card);
        return;
      }

      if (card.value === 'DISCARD_ALL') {
        executeDiscardAllLogic(card);
        return;
      }

      if (card.value === 'WILD_COLOR_ROULETTE') {
        // Color Roulette: Next active player becomes target
        setSelectedCardId(card.id);
        setPendingWildCard(card);
        const targetIdx = UnoGameEngine.getNextActivePlayerIndex(
          allPlayersRef.current,
          currentPlayerIndexRef.current,
          playDirectionRef.current,
          1
        );
        const targetPlayer = allPlayersRef.current[targetIdx];
        if (targetPlayer) {
          setRouletteTargetName(targetPlayer.name);
        }
        if (targetPlayer?.controller === 'BOT') {
          // Bot target picks color automatically
          const colors: UnoColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
          const botColor = colors[Math.floor(Math.random() * colors.length)];
          if (handleRouletteRef.current) {
            handleRouletteRef.current(botColor);
          }
        } else if (targetPlayer?.controller === 'LOCAL_HUMAN') {
          setCanChooseRoulette(true);
          setRouletteModalVisible(true);
          setActionLock('CHOOSING_ROULETTE_COLOR');
        } else {
          setActionLock('WAITING_FOR_REMOTE_PLAYER');
        }
        return;
      }

      if (UnoDeckService.isWildCard(card)) {
        setSelectedCardId(card.id);
        setPendingWildCard(card);
        setWildChooserName(curName);
        setCanChooseWild(true);
        setActionLock('CHOOSING_WILD_COLOR');
        return;
      }

      commitPlay(card, card.color);
    },
    [isMyTurn, actionLock, discardPile, activeColor, pendingDrawStack, rules, deckType, showToast]
  );

  // Commit Play after validation
  const commitPlay = useCallback(
    (card: UnoCard, finalColor: UnoColor, extraSkips: number = 0) => {
      setActionLock('PLAYING_CARD');

      setFlightConfig({
        active: true,
        card,
        isDrawFlight: false,
        startPos: { x: 960, y: 920 },
        endPos: { x: 1088, y: 488 },
      });

      pendingFlightResolve.current = () => {
        const curIdx = currentPlayerIndexRef.current;
        const curPlayer = allPlayersRef.current[curIdx];

        const nextPlayers = allPlayersRef.current.map((p, idx) => {
          if (idx === curIdx) {
            const nextHand = p.hand.filter(c => c.id !== card.id);
            return { ...p, hand: nextHand, cardCount: nextHand.length };
          }
          return p;
        });
        allPlayersRef.current = nextPlayers;
        setAllPlayers(nextPlayers);

        // Authoritative completion evaluation
        const evalResult = UnoGameEngine.evaluatePlayerCompletion(
          allPlayersRef.current,
          rules,
          finishingOrderRef.current,
          eliminatedOrderRef.current
        );

        finishingOrderRef.current = evalResult.finishingOrder;
        eliminatedOrderRef.current = evalResult.eliminatedOrder;
        setFinishingOrder(evalResult.finishingOrder);
        setEliminatedOrder(evalResult.eliminatedOrder);

        allPlayersRef.current = evalResult.updatedPlayers;
        setAllPlayers(evalResult.updatedPlayers);

        if (evalResult.justFinishedPlayerId) {
          const finisher = evalResult.updatedPlayers.find(p => p.id === evalResult.justFinishedPlayerId);
          showToast('FINISHED!', `${finisher?.name || 'Player'} finished in position #${finisher?.finishRank || 1}!`, 'success');
        }

        if (evalResult.isMatchOver) {
          setFinalResults(evalResult.finalResults);
          const w = evalResult.winner || curPlayer;
          setWinner(w ? { name: w.name, avatar: w.avatar, isHuman: w.isHuman } : null);
          setActionLock('GAME_OVER');
          return;
        }

        const remainingCards = (curPlayer?.hand.length || 1) - 1;
        if (remainingCards === 1 && !hasCalledUno) {
          showToast('UNO REMINDER', `${curPlayer?.name || 'Player'} has 1 card remaining! Call UNO!`, 'warning');
        }

        setDiscardPile(prev => [...prev, card]);
        setActiveColor(finalColor);
        activeColorRef.current = finalColor;
        setSelectedCardId(null);
        setPendingWildCard(null);

        // Apply Draw Stack if card has draw amount
        const drawAmt = UnoDeckService.getDrawAmount(card);
        if (drawAmt > 0) {
          setPendingDrawStack(prev => {
            const nextStack = prev + drawAmt;
            pendingDrawStackRef.current = nextStack;
            return nextStack;
          });
        }

        setAnnouncement({
          text: `${curPlayer?.name || 'Player'} played: `,
          highlight: `${finalColor} ${card.value.replace(/_/g, ' ')}`,
          color: COLOR_MAP[finalColor] || COLORS.unoYellow,
        });

        NativeEffectsService.triggerCardPlay();

        const isMultiplayer = activeRoom?.mode === 'ONLINE' || activeRoom?.mode === 'WLAN';
        if (isMultiplayer) {
          MPDiagnostics.logGameTx('PLAY_CARD', curPlayer?.id || '', card.id, activeRoom.code);
          setActionLock('WAITING_FOR_REMOTE_PLAYER');
          session.playCard(card.id, finalColor);
        } else {
          advanceToNextActivePlayer({ playedCard: card, newActiveColor: finalColor, stepMultiplier: extraSkips ? 1 + extraSkips : undefined, reason: 'COMMIT_PLAY' });
          session.playCard(card.id, finalColor);
        }
      };
    },
    [hasCalledUno, showToast, advanceToNextActivePlayer, session, rules, activeRoom]
  );

  // Dedicated Shuffle Hands Logic (Used identically by Dedicated Shuffle Hands & Custom Wild)
  const executeShuffleHandsLogic = useCallback(
    (card?: UnoCard | null, explicitCardPlayerId?: string) => {
      const curIdx = currentPlayerIndexRef.current;
      const curPlayer = allPlayersRef.current[curIdx];
      const cardPlayerId = explicitCardPlayerId || curPlayer?.id || 'player_1';
      const cardPlayerName = allPlayersRef.current.find(p => p.id === cardPlayerId)?.name || 'Player';

      // If card was played from hand, remove it from hand and place on discard pile
      if (card) {
        setDiscardPile(prev => [...prev, card]);
        allPlayersRef.current = allPlayersRef.current.map((p, idx) => {
          if (idx === curIdx) {
            const nextHand = p.hand.filter(c => c.id !== card.id);
            return { ...p, hand: nextHand, cardCount: nextHand.length };
          }
          return p;
        });
      }

      // 1. Authoritative Engine execution: executeShuffleHands
      const result = UnoGameEngine.executeShuffleHands(
        allPlayersRef.current,
        curIdx,
        playDirectionRef.current
      );

      // 2. Build participants with accurate screen positions
      const isPassAndPlay = activeRoom?.mode === 'PASS_AND_PLAY';
      const localUser = session.getLocalPlayer();
      const participants: ShuffleParticipant[] = result.updatedPlayers
        .filter(p => !p.isEliminated)
        .map(p => {
          const isLocal = isPassAndPlay
            ? p.id === curPlayer?.id
            : (p.id === localUser?.id || p.id === allPlayersRef.current[0]?.id);
          return {
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            isLocal,
            initialCardCount: result.initialCardCounts[p.id] || p.hand.length,
            finalCardCount: result.cardCounts[p.id] || 0,
            screenPos: getPlayerScreenCoord(p.id),
          };
        });

      const localParticipant = participants.find(p => p.isLocal);
      const localNewHand = result.updatedPlayers.find(p => p.id === localParticipant?.id)?.hand || [];

      // 3. Set Action Lock to SHUFFLING_HANDS (blocks all user inputs & bot timers)
      setActionLock('SHUFFLING_HANDS');
      pendingEffectRef.current = true;

      // 4. Store pending result to commit once animation finishes
      pendingShuffleResultRef.current = {
        result,
        cardPlayerId,
        pendingCard: card || pendingWildCard,
      };

      // 5. Activate visual cinematic animation
      setShuffleAnimationConfig({
        visible: true,
        cardPlayerId,
        cardPlayerName,
        participants,
        dealSequence: result.dealSequence.map(s => s.playerId),
        localNewHand,
        totalCards: result.totalCards,
        pendingCard: card || pendingWildCard,
      });
    },
    [session, activeRoom, getPlayerScreenCoord, pendingWildCard]
  );

  // Callback when ShuffleHandsAnimation completes
  const handleShuffleAnimationComplete = useCallback(() => {
    pendingEffectRef.current = false;
    const pending = pendingShuffleResultRef.current;
    if (pending) {
      const { result, cardPlayerId, pendingCard } = pending;
      pendingShuffleResultRef.current = null;

      // Commit authoritative state to React state
      setAllPlayers(result.updatedPlayers);
      allPlayersRef.current = result.updatedPlayers;

      // Close animation
      setShuffleAnimationConfig(null);

      showToast('SHUFFLE HANDS', 'All cards gathered, shuffled and redealt sequentially!', 'success');

      // Card player now chooses wild color
      const localUser = session.getLocalPlayer();
      const isPassAndPlay = activeRoom?.mode === 'PASS_AND_PLAY';
      const curIdx = currentPlayerIndexRef.current;
      const curPlayer = allPlayersRef.current[curIdx];

      const isCardPlayerLocal = isPassAndPlay
        ? curPlayer?.controller === 'LOCAL_HUMAN' && curPlayer?.id === cardPlayerId
        : cardPlayerId === localUser?.id || cardPlayerId === allPlayersRef.current[0]?.id;

      const isCardPlayerBot = curPlayer?.controller === 'BOT' && curPlayer?.id === cardPlayerId;

      if (isCardPlayerLocal) {
        setPendingWildCard(pendingCard || { id: `wild_shuffle_${Date.now()}`, color: 'WILD', value: 'SHUFFLE_HANDS' });
        pendingChoiceRef.current = 'WILD_COLOR';
        setCanChooseWild(true);
        setWildChooserName(curPlayer?.name || 'You');
        setActionLock('CHOOSING_WILD_COLOR');
      } else if (isCardPlayerBot) {
        // Bot chooses color
        const botColors: UnoColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
        const chosenColor = botColors[Math.floor(Math.random() * botColors.length)];
        setActiveColor(chosenColor);
        activeColorRef.current = chosenColor;
        setActionLock('IDLE');
        advanceToNextActivePlayer({ playedCard: pendingCard || undefined, newActiveColor: chosenColor, reason: 'SHUFFLE_HANDS_BOT' });
      } else {
        // Remote player is choosing color
        setActionLock('WAITING_FOR_REMOTE_PLAYER');
      }
    } else {
      setShuffleAnimationConfig(null);
      setActionLock('IDLE');
    }
  }, [session, activeRoom, showToast, advanceToNextActivePlayer]);

  // Pass Hands in Direction Logic (0 Card)
  const executePassHandsLogic = useCallback((card: UnoCard) => {
    const curIdx = currentPlayerIndexRef.current;
    const curPlayer = allPlayersRef.current[curIdx];
    if (!curPlayer) return;

    // 1. Remove played 0 card from current player's hand first
    const updatedHand = curPlayer.hand.filter(c => c.id !== card.id);
    const playersWithCardRemoved = allPlayersRef.current.map((p, idx) =>
      idx === curIdx ? { ...p, hand: updatedHand, cardCount: updatedHand.length } : p
    );

    // 2. Put 0 card on discard pile
    setDiscardPile(prev => [...prev, card]);
    setActiveColor(card.color);
    activeColorRef.current = card.color;

    // 3. Pass hands in current direction
    const { updatedPlayers } = UnoGameEngine.executePassHandsInDirection(
      playersWithCardRemoved,
      playDirectionRef.current
    );
    allPlayersRef.current = updatedPlayers;
    setAllPlayers(updatedPlayers);

    showToast('0 PASS HANDS', `Hands passed ${playDirectionRef.current === 'CW' ? 'Clockwise' : 'Counter-Clockwise'}!`, 'warning');
    console.log(`[EFFECT] turnId=${turnIdRef.current} card=0 source=${curPlayer.name} effect=PASS_HANDS direction=${playDirectionRef.current}`);

    // 4. Evaluate completion / win
    const evalResult = UnoGameEngine.evaluatePlayerCompletion(
      updatedPlayers,
      rules,
      finishingOrderRef.current,
      eliminatedOrderRef.current
    );

    finishingOrderRef.current = evalResult.finishingOrder;
    eliminatedOrderRef.current = evalResult.eliminatedOrder;
    setFinishingOrder(evalResult.finishingOrder);
    setEliminatedOrder(evalResult.eliminatedOrder);
    allPlayersRef.current = evalResult.updatedPlayers;
    setAllPlayers(evalResult.updatedPlayers);

    if (evalResult.isMatchOver) {
      setFinalResults(evalResult.finalResults);
      const w = evalResult.winner || curPlayer;
      setWinner(w ? { name: w.name, avatar: w.avatar, isHuman: w.isHuman } : null);
      setActionLock('GAME_OVER');
      return;
    }

    advanceToNextActivePlayer({ playedCard: card, newActiveColor: card.color, reason: 'PASS_HANDS' });
  }, [rules, showToast, advanceToNextActivePlayer]);

  // Discard All Logic
  const executeDiscardAllLogic = useCallback((card: UnoCard) => {
    const curIdx = currentPlayerIndexRef.current;
    const curPlayer = allPlayersRef.current[curIdx];
    if (!curPlayer) return;

    // 1. Remove the played DISCARD_ALL card first, then discard all remaining matching color
    const handWithoutCard = curPlayer.hand.filter(c => c.id !== card.id);
    const playerWithoutCard = { ...curPlayer, hand: handWithoutCard, cardCount: handWithoutCard.length };

    const { updatedPlayer, updatedDiscard, discardedCount } = UnoGameEngine.executeDiscardAll(
      playerWithoutCard,
      [...discardPile, card],
      card.color
    );

    const nextPlayers = allPlayersRef.current.map((p, idx) => (idx === curIdx ? updatedPlayer : p));
    allPlayersRef.current = nextPlayers;
    setAllPlayers(nextPlayers);
    setDiscardPile(updatedDiscard);
    setActiveColor(card.color);
    activeColorRef.current = card.color;

    showToast('DISCARD ALL', `Discarded ${discardedCount + 1} ${card.color} cards!`, 'warning');
    console.log(`[EFFECT] turnId=${turnIdRef.current} card=DISCARD_ALL source=${curPlayer.name} color=${card.color} count=${discardedCount + 1}`);

    // 2. Evaluate completion / win
    const evalResult = UnoGameEngine.evaluatePlayerCompletion(
      nextPlayers,
      rules,
      finishingOrderRef.current,
      eliminatedOrderRef.current
    );

    finishingOrderRef.current = evalResult.finishingOrder;
    eliminatedOrderRef.current = evalResult.eliminatedOrder;
    setFinishingOrder(evalResult.finishingOrder);
    setEliminatedOrder(evalResult.eliminatedOrder);
    allPlayersRef.current = evalResult.updatedPlayers;
    setAllPlayers(evalResult.updatedPlayers);

    if (evalResult.isMatchOver) {
      setFinalResults(evalResult.finalResults);
      const w = evalResult.winner || curPlayer;
      setWinner(w ? { name: w.name, avatar: w.avatar, isHuman: w.isHuman } : null);
      setActionLock('GAME_OVER');
      return;
    }

    advanceToNextActivePlayer({ playedCard: card, newActiveColor: card.color, reason: 'DISCARD_ALL' });
  }, [discardPile, rules, showToast, advanceToNextActivePlayer]);

  // Wild Color Selection Callback
  const handleWildColorSelected = useCallback(
    (color: UnoColor) => {
      if (!pendingWildCard) return;
      const card = pendingWildCard;
      setPendingWildCard(null);
      pendingChoiceRef.current = null;

      if (card.value === 'SHUFFLE_HANDS' || card.value === 'CUSTOM_WILD') {
        setActiveColor(color);
        activeColorRef.current = color;
        setActionLock('IDLE');
        setAnnouncement({
          text: 'Wild Color chosen: ',
          highlight: color,
          color: COLOR_MAP[color] || COLORS.unoYellow,
        });
        NativeEffectsService.triggerCardPlay();
        advanceToNextActivePlayer({ playedCard: card, newActiveColor: color, reason: 'WILD_COLOR' });
        session.chooseWildColor(color);
      } else {
        commitPlay(card, color);
        session.chooseWildColor(color);
      }
    },
    [pendingWildCard, commitPlay, session, advanceToNextActivePlayer]
  );

  // Custom Wild Power Selection Callback
  const handleCustomWildPowerSelected = useCallback(
    (power: CustomWildPower) => {
      setCustomWildModalVisible(false);
      pendingChoiceRef.current = null;
      session.chooseCustomWildPower(power);

      if (power === 'SHUFFLE_HANDS') {
        executeShuffleHandsLogic(pendingWildCard);
      } else if (power === 'EVERYONE_PLUS_FOUR') {
        const curIdx = currentPlayerIndexRef.current;
        setAllPlayers(prev => {
          const next = prev.map((p, idx) =>
            idx !== curIdx && !p.isEliminated && p.status !== 'FINISHED' && p.status !== 'ELIMINATED'
              ? { ...p, cardCount: p.cardCount + 4 }
              : p
          );
          allPlayersRef.current = next;
          return next;
        });
        showToast('EVERYONE +4', 'Every other player received +4 penalty cards!', 'penalty');
        pendingChoiceRef.current = 'WILD_COLOR';
        setActionLock('CHOOSING_WILD_COLOR');
      }
    },
    [executeShuffleHandsLogic, session, showToast, pendingWildCard]
  );

  // 7 Swap Player Selection Callback
  const handleSwapPlayerSelected = useCallback(
    (targetPlayerId: string) => {
      setSwapModalVisible(false);
      pendingChoiceRef.current = null;
      session.chooseSwapTarget(targetPlayerId);

      const curIdx = currentPlayerIndexRef.current;
      const curPlayer = allPlayersRef.current[curIdx];
      const target = allPlayersRef.current.find(p => p.id === targetPlayerId);
      if (!curPlayer || !target) return;

      const card = pendingWildCard;
      setPendingWildCard(null);

      // 1. Remove the 7 card from current player's hand and put on discard pile
      let handWithoutCard = curPlayer.hand;
      if (card) {
        handWithoutCard = curPlayer.hand.filter(c => c.id !== card.id);
      }
      const playerWithUpdatedHand = {
        ...curPlayer,
        hand: handWithoutCard,
        cardCount: handWithoutCard.length,
      };

      const playersBeforeSwap = allPlayersRef.current.map((p, idx) =>
        idx === curIdx ? playerWithUpdatedHand : p
      );

      // 2. Execute swap hands
      const { updatedPlayers } = UnoGameEngine.executeSwapHands(
        playersBeforeSwap,
        curPlayer.id,
        targetPlayerId
      );

      allPlayersRef.current = updatedPlayers;
      setAllPlayers(updatedPlayers);

      if (card) {
        setDiscardPile(prev => [...prev, card]);
        setActiveColor(card.color);
        activeColorRef.current = card.color;
      }

      showToast('SWAP HANDS', `Exchanged hands with ${target.name}!`, 'warning');
      console.log(`[EFFECT] turnId=${turnIdRef.current} card=7 source=${curPlayer.name} target=${target.name} effect=SWAP_HANDS`);

      // 3. Evaluate completion / win
      const evalResult = UnoGameEngine.evaluatePlayerCompletion(
        updatedPlayers,
        rules,
        finishingOrderRef.current,
        eliminatedOrderRef.current
      );

      finishingOrderRef.current = evalResult.finishingOrder;
      eliminatedOrderRef.current = evalResult.eliminatedOrder;
      setFinishingOrder(evalResult.finishingOrder);
      setEliminatedOrder(evalResult.eliminatedOrder);
      allPlayersRef.current = evalResult.updatedPlayers;
      setAllPlayers(evalResult.updatedPlayers);

      if (evalResult.isMatchOver) {
        setFinalResults(evalResult.finalResults);
        const w = evalResult.winner || curPlayer;
        setWinner(w ? { name: w.name, avatar: w.avatar, isHuman: w.isHuman } : null);
        setActionLock('GAME_OVER');
        return;
      }

      advanceToNextActivePlayer({ playedCard: card || undefined, newActiveColor: card?.color, reason: 'SWAP_HANDS' });
    },
    [pendingWildCard, rules, showToast, session, advanceToNextActivePlayer]
  );

  // Roulette Color Selection Callback
  const handleRouletteColorSelected = useCallback(
    (color: UnoColor) => {
      setRouletteModalVisible(false);
      pendingChoiceRef.current = null;
      session.chooseRouletteColor(color);

      const curIdx = currentPlayerIndexRef.current;
      const curPlayer = allPlayersRef.current[curIdx];
      const card = pendingWildCard;
      setPendingWildCard(null);

      // Target is next active player
      const targetIdx = UnoGameEngine.getNextActivePlayerIndex(
        allPlayersRef.current,
        curIdx,
        playDirectionRef.current,
        1
      );
      const targetPlayer = allPlayersRef.current[targetIdx];

      // Remove card from current player's hand and put on discard pile
      if (card && curPlayer) {
        const nextHand = curPlayer.hand.filter(c => c.id !== card.id);
        allPlayersRef.current = allPlayersRef.current.map((p, idx) =>
          idx === curIdx ? { ...p, hand: nextHand, cardCount: nextHand.length } : p
        );
        setDiscardPile(prev => [...prev, card]);
      }
      setActiveColor(color);
      activeColorRef.current = color;

      // Execute roulette draw for target
      if (targetPlayer) {
        const { updatedPlayer, updatedDrawPile, updatedDiscardPile, drawnCards } = UnoGameEngine.executeColorRouletteDraw(
          targetPlayer,
          deck,
          discardPile,
          color
        );

        setDeck(updatedDrawPile);
        setDiscardPile(updatedDiscardPile);
        const nextPlayers = allPlayersRef.current.map((p, idx) =>
          idx === targetIdx ? updatedPlayer : p
        );
        allPlayersRef.current = nextPlayers;
        setAllPlayers(nextPlayers);

        showToast('ROULETTE DRAW', `${targetPlayer.name} drew ${drawnCards.length} cards until ${color} appeared!`, 'penalty');
        console.log(`[EFFECT] turnId=${turnIdRef.current} card=COLOR_ROULETTE source=${curPlayer?.name} target=${targetPlayer.name} color=${color} drawn=${drawnCards.length}`);
      }

      // Check completions
      const evalResult = UnoGameEngine.evaluatePlayerCompletion(
        allPlayersRef.current,
        rules,
        finishingOrderRef.current,
        eliminatedOrderRef.current
      );

      finishingOrderRef.current = evalResult.finishingOrder;
      eliminatedOrderRef.current = evalResult.eliminatedOrder;
      setFinishingOrder(evalResult.finishingOrder);
      setEliminatedOrder(evalResult.eliminatedOrder);
      allPlayersRef.current = evalResult.updatedPlayers;
      setAllPlayers(evalResult.updatedPlayers);

      if (evalResult.isMatchOver) {
        setFinalResults(evalResult.finalResults);
        const w = evalResult.winner;
        setWinner(w ? { name: w.name, avatar: w.avatar, isHuman: w.isHuman } : null);
        setActionLock('GAME_OVER');
        return;
      }

      // Target loses turn: advance with stepMultiplier = 2 (skipping target)
      advanceToNextActivePlayer({
        playedCard: card || undefined,
        newActiveColor: color,
        stepMultiplier: 2,
        reason: 'COLOR_ROULETTE_SKIP',
      });
    },
    [deck, discardPile, rules, showToast, session, advanceToNextActivePlayer, pendingWildCard]
  );
  handleRouletteRef.current = handleRouletteColorSelected;

  // End Turn Action
  const handleEndTurn = useCallback(() => {
    if (!isMyTurn) return;
    if (actionLock !== 'IDLE') return;
    if (!hasDrawnThisTurn) {
      showToast('CANNOT END TURN', 'You must draw a card before passing your turn.', 'warning');
      return;
    }

    NativeEffectsService.triggerTurnChange();
    advanceToNextActivePlayer({ reason: 'END_TURN' });
    session.endTurn();
  }, [isMyTurn, actionLock, hasDrawnThisTurn, showToast, advanceToNextActivePlayer, session]);

  // In-Game UNO Call
  const handleCallUno = useCallback(() => {
    if (actionLock === 'GAME_OVER') return;
    const curIdx = currentPlayerIndexRef.current;
    const curPlayer = allPlayersRef.current[curIdx];
    const curHand = curPlayer?.hand || [];

    if (curHand.length === 2 || curHand.length === 1) {
      setHasCalledUno(true);
      NativeEffectsService.triggerUnoCall();
      showToast('UNO!', 'UNO CALL REGISTERED! 🎉', 'success');
      setAnnouncement({
        text: `${(curPlayer?.name || 'Player').toUpperCase()} `,
        highlight: 'CALLED UNO!',
        color: COLORS.unoRed,
      });
      session.callUno();
    } else {
      NativeEffectsService.triggerInvalidAction();
      showToast('CANNOT CALL UNO', 'UNO is only valid when you have 1 or 2 cards remaining!', 'warning');
    }
  }, [actionLock, showToast, session]);

  const topCard = discardPile[discardPile.length - 1] || null;

  return (
    <GameplayViewport>
      {__DEV__ && <MultiplayerDiagnosticsPanel />}
      {/* Table Oval with Circular Animated Direction Indicator */}
      <View style={styles.tableCenter}>
        <NativeGameTable direction={playDirection} activeColor={activeColor} />
      </View>

      {/* Top HUD */}
      <View style={styles.topHud}>
        <View style={styles.timerBadge}>
          <Text style={styles.timerIcon}>
            {activeRoom?.mode === 'WLAN' ? '📡' : activeRoom?.mode === 'ONLINE' ? '🌐' : '⏱'}
          </Text>
          <Text style={styles.timerText}>
            {isMyPlayerFinished
              ? `YOU FINISHED #${myPlayer?.finishRank || 1}! SPECTATING...`
              : isMyPlayerEliminated
              ? 'YOU ARE ELIMINATED! SPECTATING...'
              : isMyTurn
              ? (pendingDrawStack > 0
                  ? (isPassAndPlay ? `${allPlayers[currentPlayerIndex]?.name?.toUpperCase()}'S TURN (+${pendingDrawStack} STACK!)` : `YOUR TURN (+${pendingDrawStack} STACK!)`)
                  : (isPassAndPlay ? `${allPlayers[currentPlayerIndex]?.name?.toUpperCase()}'S TURN` : 'YOUR TURN'))
              : actionLock === 'WAITING_FOR_REMOTE_PLAYER'
              ? `WAITING FOR ${allPlayers[currentPlayerIndex]?.name || 'OPPONENT'}...`
              : `${allPlayers[currentPlayerIndex]?.name || 'OPPONENT'}'S TURN`}
          </Text>
        </View>

        <View style={styles.feedBadge}>
          <View style={[styles.feedDot, { backgroundColor: announcement.color }]} />
          <Text style={styles.feedText}>
            {announcement.text}
            <Text style={{ fontWeight: '900', color: announcement.color }}>
              {announcement.highlight}
            </Text>
          </Text>
        </View>

        <Pressable
          onPress={() => {
            if (botTimerRef.current) {
              clearTimeout(botTimerRef.current);
              botTimerRef.current = null;
            }
            onQuit();
          }}
          style={styles.quitBtn}
        >
          <Text style={styles.quitText}>✕</Text>
        </Pressable>
      </View>

      {/* Center Draw & Discard Piles (Enlarged) */}
      <View style={styles.centerPiles}>
        <NativeDrawPile
          count={deck.length}
          onPress={handleDrawCard}
          width={192}
          height={278}
        />
        <NativeDiscardPile
          topCard={topCard}
          activeColor={activeColor}
          width={192}
          height={278}
        />
      </View>

      {/* Opponents Around Table Edge with Dynamic Scaling */}
      {opponents.slice(0, 9).map((op, idx) => {
        const layout = getOpponentLayout(idx, opponents.length);
        const isOpTurn = allPlayers[currentPlayerIndex]?.id === op.id;
        return (
          <View key={op.id || idx} style={[styles.opponentPos, layout.pos]}>
            <NativeOpponentNode
              player={op}
              isTurn={isOpTurn}
              scale={layout.scale}
              avatarSize={layout.avatarSize}
              nameFontSize={layout.nameFontSize}
              cardCountFontSize={layout.cardCountFontSize}
              compact={layout.compact}
              maxCardBacks={layout.maxCardBacks}
            />
          </View>
        );
      })}

      {/* Bottom Center: Player Hand or Spectator Banner */}
      {isMyPlayerFinished && !isPassAndPlay ? (
        <View style={styles.spectatorCard}>
          <Text style={styles.spectatorTrophy}>🏁</Text>
          <Text style={styles.spectatorTitle}>
            YOU FINISHED IN POSITION #{myPlayer?.finishRank || 1}!
          </Text>
          <Text style={styles.spectatorSubtitle}>
            {rules.gameEndMode === 'PLAY_UNTIL_LAST_PLAYER'
              ? 'Play Until Last Player: Remaining players are battling for rank positions.'
              : 'Match is concluding...'}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.bottomHand}>
            <NativePlayerHandFan
              hand={myHand}
              topCard={topCard}
              activeColor={activeColor}
              pendingDrawStack={pendingDrawStack}
              rules={rules}
              isMyTurn={isMyTurn}
              playerName={isPassAndPlay ? activePlayer?.name : (session.getLocalPlayer()?.name || activePlayer?.name || 'Player')}
              avatar={isPassAndPlay ? activePlayer?.avatar : (session.getLocalPlayer()?.avatar || activePlayer?.avatar || '👤')}
              selectedCardId={selectedCardId}
              onSelectCard={card => setSelectedCardId(card ? card.id : null)}
              onPlayCard={handlePlayCard}
              onInvalidAttempt={(_, reason) => showToast('INVALID PLAY', reason, 'warning')}
              disabled={!isMyTurn || actionLock !== 'IDLE'}
            />
          </View>

          {/* Bottom Corner Action Controls */}
          <View style={styles.bottomActions}>
            <NativeActionControls
              canDraw={isMyTurn && !hasDrawnThisTurn && actionLock === 'IDLE'}
              canEndTurn={isMyTurn && hasDrawnThisTurn && actionLock === 'IDLE'}
              hasUnoAlert={myHand.length === 2 || myHand.length === 1}
              onDraw={handleDrawCard}
              onCallUno={handleCallUno}
              onEndTurn={handleEndTurn}
              disabled={!isMyTurn || actionLock !== 'IDLE'}
            />
          </View>
        </>
      )}

      {/* Flight Card Animation */}
      <AnimatedFlightCard
        active={flightConfig.active}
        card={flightConfig.card}
        isDrawFlight={flightConfig.isDrawFlight}
        startPos={flightConfig.startPos}
        endPos={flightConfig.endPos}
        onComplete={() => {
          setFlightConfig(prev => ({ ...prev, active: false, card: null }));
          if (pendingFlightResolve.current) {
            const resolve = pendingFlightResolve.current;
            pendingFlightResolve.current = null;
            resolve();
          }
        }}
      />

      {/* Pass & Play Device Handoff Overlay (Part 2 & 3) */}
      {actionLock === 'PASS_DEVICE' && handoffTarget && (
        <View style={styles.passDeviceOverlay}>
          <View style={styles.passDeviceCard}>
            <Text style={styles.passDeviceEmoji}>{handoffTarget.avatar}</Text>
            <Text style={styles.passDeviceTitle}>PASS DEVICE TO</Text>
            <Text style={styles.passDeviceName}>{handoffTarget.name.toUpperCase()}</Text>
            <Text style={styles.passDeviceSub}>
              Please hand the device to {handoffTarget.name}. Keep cards private!
            </Text>
            <Pressable
              style={styles.passDeviceBtn}
              onPress={() => {
                NativeEffectsService.triggerCardSelect();
                setActionLock('IDLE');
                NativeEffectsService.triggerTurnChange();
              }}
            >
              <Text style={styles.passDeviceBtnText}>I'M READY / START TURN ▶</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* In-Game UNO Toast */}
      <NativeUnoToast
        visible={unoToast.visible}
        title={unoToast.title}
        message={unoToast.message}
        type={unoToast.type}
      />

      {/* Wild Color Picker Modal */}
      <NativeWildColorPicker
        visible={actionLock === 'CHOOSING_WILD_COLOR'}
        wildCard={pendingWildCard}
        canChoose={canChooseWild}
        chooserName={wildChooserName}
        onSelectColor={handleWildColorSelected}
      />

      {/* Custom Wild Choice Modal (Part 2) */}
      <NativeCustomWildModal
        visible={customWildModalVisible}
        canChoose={canChooseCustomWild}
        chooserName={customWildChooserName}
        onSelectPower={handleCustomWildPowerSelected}
      />

      {/* 7 Swap Player Choice Modal (Part 3) */}
      <NativeSwapPlayerModal
        visible={swapModalVisible}
        canChoose={canChooseSwap}
        chooserName={swapChooserName}
        eligiblePlayers={opponents}
        onSelectPlayer={handleSwapPlayerSelected}
      />

      {/* Color Roulette Choice Modal (Part 4) */}
      <NativeRouletteColorModal
        visible={rouletteModalVisible}
        canChoose={canChooseRoulette}
        targetName={rouletteTargetName}
        onSelectColor={handleRouletteColorSelected}
      />

      {/* Shuffle Hands Cinematic Animation (Section 4-11, 18, 24-25) */}
      {shuffleAnimationConfig && (
        <ShuffleHandsAnimation
          visible={shuffleAnimationConfig.visible}
          cardPlayerId={shuffleAnimationConfig.cardPlayerId}
          cardPlayerName={shuffleAnimationConfig.cardPlayerName}
          participants={shuffleAnimationConfig.participants}
          dealSequence={shuffleAnimationConfig.dealSequence}
          localNewHand={shuffleAnimationConfig.localNewHand}
          totalCards={shuffleAnimationConfig.totalCards}
          onComplete={handleShuffleAnimationComplete}
        />
      )}

      {/* Game Over Modal */}
      <NativeGameOverModal
        visible={actionLock === 'GAME_OVER'}
        gameEndMode={rules.gameEndMode || 'FIRST_PLAYER_WINS'}
        winner={winner}
        finalResults={finalResults}
        onPlayAgain={initializeGame}
        onExit={onQuit}
      />
    </GameplayViewport>
  );
};

const styles = StyleSheet.create({
  tableCenter: {
    position: 'absolute',
    top: 130,
    left: 140,
    width: 1640,
    height: 820,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHud: {
    position: 'absolute',
    top: 40,
    left: 64,
    right: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 40,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.6)',
    paddingVertical: 8,
    paddingHorizontal: 18,
    gap: 8,
    shadowColor: COLORS.goldGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  timerIcon: {
    fontSize: 18,
  },
  timerText: {
    color: COLORS.unoYellow,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  feedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingVertical: 8,
    paddingHorizontal: 22,
    gap: 10,
  },
  feedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.emeraldGlow,
  },
  feedText: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
  },
  quitBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quitText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  centerPiles: {
    position: 'absolute',
    top: 360,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 80,
    zIndex: 15,
  },
  opponentPos: {
    position: 'absolute',
    zIndex: 20,
  },
  bottomHand: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  bottomActions: {
    position: 'absolute',
    bottom: 48,
    right: 64,
    zIndex: 35,
  },
  passDeviceOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4, 5, 7, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  passDeviceCard: {
    width: 440,
    paddingVertical: 32,
    paddingHorizontal: 28,
    borderRadius: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.98)',
    borderWidth: 2,
    borderColor: COLORS.unoYellow,
    alignItems: 'center',
    shadowColor: COLORS.unoYellow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  passDeviceEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  passDeviceTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#94A3B8',
    letterSpacing: 2,
    marginBottom: 4,
  },
  passDeviceName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 10,
  },
  passDeviceSub: {
    fontSize: 14,
    color: '#CBD5E1',
    textAlign: 'center',
    marginBottom: 24,
  },
  passDeviceBtn: {
    backgroundColor: COLORS.unoYellow,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
    shadowColor: COLORS.unoYellow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  passDeviceBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  spectatorCard: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    marginLeft: -260,
    width: 520,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(234, 179, 8, 0.5)',
    shadowColor: '#EAB308',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  spectatorTrophy: {
    fontSize: 32,
    marginBottom: 6,
  },
  spectatorTitle: {
    color: '#FACC15',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  spectatorSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});
