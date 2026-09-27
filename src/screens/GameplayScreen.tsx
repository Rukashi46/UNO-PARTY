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
import { UnoCard, UnoColor, Player, GameRules, CustomWildPower, DeckType, PlayerController } from '../types/game';
import { UnoDeckService } from '../game/UnoDeckService';
import { UnoGameEngine } from '../game/UnoGameEngine';
import { COLORS, COLOR_MAP } from '../constants/theme';
import { NativeEffectsService } from '../services/NativeEffects';
import { MultiplayerSession } from '../multiplayer/MultiplayerSession';

export type ActionLockState =
  | 'IDLE'
  | 'PLAYING_CARD'
  | 'DRAWING_CARD'
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

  // Stored refs to prevent stale closures across async timeouts and flight animations
  const allPlayersRef = useRef<Player[]>([]);
  const currentPlayerIndexRef = useRef<number>(0);
  const playDirectionRef = useRef<'CW' | 'CCW'>('CW');
  const activeColorRef = useRef<UnoColor>('YELLOW');
  const pendingDrawStackRef = useRef<number>(0);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTurnRef = useRef<(playedCard?: UnoCard, newActiveColor?: UnoColor, extraSkipCount?: number) => void>(() => {});

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

  // Winner State
  const [winner, setWinner] = useState<{ name: string; avatar: string; isHuman: boolean } | null>(null);

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

    // Part 1: exactly 112 cards for NORMAL, 168 cards for NO_MERCY
    const newDeck = UnoDeckService.generateDeck(deckType);

    // Pick starting non-wild card for discard pile
    let top = newDeck.pop() || null;
    while (top && UnoDeckService.isWildCard(top)) {
      newDeck.unshift(top);
      top = newDeck.pop() || null;
    }

    let initialPlayersList: Player[] = [];
    if (activeRoom && activeRoom.players.length > 0) {
      initialPlayersList = activeRoom.players.map((p, idx) => {
        let controller: PlayerController = 'REMOTE_HUMAN';
        if (isPassAndPlay) {
          controller = 'LOCAL_HUMAN';
        } else if (isBotsMode) {
          controller = idx === 0 ? 'LOCAL_HUMAN' : 'BOT';
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
          // Part 28: Securely receive private hand update
          if (event.playerId === localUser?.id) {
            setAllPlayers(prev => {
              const next = prev.map((p, idx) =>
                idx === 0 ? { ...p, hand: event.hand, cardCount: event.hand.length } : p
              );
              allPlayersRef.current = next;
              return next;
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
          showToast('SHUFFLE HANDS', 'Hands gathered, shuffled and redealt sequentially!', 'success');
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

        case 'TURN_CHANGED': {
          const isMe = event.nextPlayerId === localUser?.id;
          setCurrentPlayerIndex(isMe ? 0 : 1);
          currentPlayerIndexRef.current = isMe ? 0 : 1;
          setActiveColor(event.activeColor);
          activeColorRef.current = event.activeColor;
          setPlayDirection(event.direction);
          playDirectionRef.current = event.direction;
          setPendingDrawStack(event.pendingDrawStack);
          pendingDrawStackRef.current = event.pendingDrawStack;

          if (isMe) {
            setActionLock('IDLE');
            NativeEffectsService.triggerTurnChange();
          } else {
            setActionLock('WAITING_FOR_REMOTE_PLAYER');
          }
          break;
        }

        case 'PLAYER_WON': {
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
  const myHand = (isPassAndPlay
    ? allPlayers[currentPlayerIndex]?.hand
    : allPlayers[0]?.hand) || [];

  const opponents = isPassAndPlay
    ? allPlayers.filter((_, idx) => idx !== currentPlayerIndex)
    : allPlayers.slice(1);

  const isMyTurn =
    (isPassAndPlay
      ? allPlayers[currentPlayerIndex]?.controller === 'LOCAL_HUMAN'
      : currentPlayerIndex === 0) &&
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

  // Dynamic opponent layout & scaling based on player count
  const getOpponentLayout = useCallback((idx: number, total: number) => {
    if (total <= 1) {
      // 1v1 duel: Top center, prominent, bold and large!
      return {
        pos: { top: 82, left: 790 },
        scale: 1.45,
        centerCoord: { x: 960, y: 140 },
      };
    }
    if (total === 2) {
      // 3-player match: Two top balanced nodes
      const positions = [
        { top: 88, left: 460 },
        { top: 88, right: 460 },
      ];
      const coords = [
        { x: 580, y: 140 },
        { x: 1340, y: 140 },
      ];
      return {
        pos: positions[idx] || positions[0],
        scale: 1.34,
        centerCoord: coords[idx] || coords[0],
      };
    }
    if (total === 3) {
      // 4-player match: Left, Top-center, Right
      const positions = [
        { left: 210, top: 370 },
        { top: 82, left: 790 },
        { right: 210, top: 370 },
      ];
      const coords = [
        { x: 300, y: 440 },
        { x: 960, y: 140 },
        { x: 1620, y: 440 },
      ];
      return {
        pos: positions[idx] || positions[0],
        scale: 1.25,
        centerCoord: coords[idx] || coords[0],
      };
    }
    if (total === 4) {
      // 5-player match: Top Left, Top Right, Mid Left, Mid Right
      const positions = [
        { top: 88, left: 520 },
        { top: 88, right: 520 },
        { left: 210, top: 370 },
        { right: 210, top: 370 },
      ];
      const coords = [
        { x: 620, y: 140 },
        { x: 1300, y: 140 },
        { x: 300, y: 440 },
        { x: 1620, y: 440 },
      ];
      return {
        pos: positions[idx] || positions[0],
        scale: 1.18,
        centerCoord: coords[idx] || coords[0],
      };
    }
    // 5 to 9 opponents (6 to 10 players): Full table coverage
    const defaultPositions = [
      { top: 88, left: 480 },
      { top: 82, left: 800 },
      { top: 88, right: 480 },
      { left: 210, top: 230 },
      { left: 200, top: 380 },
      { left: 210, bottom: 230 },
      { right: 210, top: 230 },
      { right: 200, top: 380 },
      { right: 210, bottom: 230 },
    ];
    const defaultCoords = [
      { x: 580, y: 140 },
      { x: 960, y: 135 },
      { x: 1340, y: 140 },
      { x: 290, y: 280 },
      { x: 280, y: 440 },
      { x: 290, y: 700 },
      { x: 1630, y: 280 },
      { x: 1640, y: 440 },
      { x: 1630, y: 700 },
    ];
    const scale = total <= 6 ? 1.10 : total <= 8 ? 1.0 : 0.94;
    return {
      pos: defaultPositions[idx] || defaultPositions[0],
      scale,
      centerCoord: defaultCoords[idx] || defaultCoords[0],
    };
  }, []);

  // Bot Turn Loop (ONLY FOR BOT PLAYERS - Production Hardened Guard)
  const runBotTurn = useCallback(
    (botIndex: number, currentActiveColor: UnoColor) => {
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }

      const bot = allPlayersRef.current[botIndex];
      // BOT TURN GUARD (Part 24): Assert player controller is BOT!
      if (!bot || bot.controller !== 'BOT') return;

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
        // CANCEL STALE BOT TIMERS GUARD (Part 24 & 25)
        if (actionLock === 'GAME_OVER') return;
        if (currentPlayerIndexRef.current !== botIndex) return; // Stale timer!
        const currentActive = allPlayersRef.current[currentPlayerIndexRef.current];
        if (!currentActive || currentActive.controller !== 'BOT' || currentActive.id !== expectedBotId) {
          return;
        }

        setDiscardPile(latestDiscard => {
          setDeck(latestDeck => {
            const { deck: validDeck, discard: validDiscard } = ensureCardsInDeck(latestDeck, latestDiscard);
            const totalOpponents = Math.max(1, allPlayersRef.current.length - 1);
            const botCoord = getOpponentLayout(botIndex - 1, totalOpponents).centerCoord;

            // Bot response to pending draw stack
            const curStack = pendingDrawStackRef.current;
            if (curStack > 0) {
              const botColors: UnoColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];
              const chosenColor = botColors[Math.floor(Math.random() * botColors.length)];

              if (Math.random() > 0.6) {
                // Bot stacks +2
                const stackCard: UnoCard = {
                  id: `bot_card_${Date.now()}`,
                  color: chosenColor,
                  value: 'DRAW_TWO',
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
                    const s = prev + 2;
                    pendingDrawStackRef.current = s;
                    return s;
                  });
                  setActiveColor(chosenColor);
                  activeColorRef.current = chosenColor;
                  NativeEffectsService.triggerCardPlay();
                  advanceTurnRef.current(stackCard, chosenColor);
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
                advanceTurnRef.current(undefined, currentActiveColor);
                return validDeck;
              }
            }

            // Normal bot play or draw
            const willPlayCard = Math.random() > 0.35 && bot.cardCount > 1;

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

              let botWon = false;
              setAllPlayers(prev => {
                const next = prev.map((p, idx) => {
                  if (idx === botIndex) {
                    const newCount = p.cardCount - 1;
                    if (newCount === 0) {
                      botWon = true;
                    } else if (newCount === 1) {
                      showToast('UNO!', `${p.name} called UNO!`, 'warning');
                    }
                    return { ...p, cardCount: newCount };
                  }
                  return p;
                });
                allPlayersRef.current = next;
                return next;
              });

              if (botWon) {
                setWinner({ name: bot.name, avatar: bot.avatar, isHuman: false });
                setActionLock('GAME_OVER');
                return validDeck;
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
                advanceTurnRef.current(simulatedCard, chosenColor);
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

                setAnnouncement({
                  text: `${bot.name} `,
                  highlight: 'drew a card from deck',
                  color: '#94A3B8',
                });

                advanceTurnRef.current(undefined, currentActiveColor);
              };

              return nextDeck;
            }
          });

          return latestDiscard;
        });
      }, 1250);
    },
    [actionLock, ensureCardsInDeck, getOpponentLayout, showToast]
  );

  // Authoritative Turn Advancement
  const advanceTurn = useCallback(
    (
      playedCard?: UnoCard,
      newActiveColor?: UnoColor,
      extraSkipCount: number = 0
    ) => {
      // Clear any pending bot timer immediately (Part 25)
      if (botTimerRef.current) {
        clearTimeout(botTimerRef.current);
        botTimerRef.current = null;
      }

      setActionLock('ADVANCING_TURN');
      setSelectedCardId(null);
      setHasDrawnThisTurn(false);

      let currentDir = playDirectionRef.current;
      if (playedCard?.value === 'REVERSE') {
        currentDir = currentDir === 'CW' ? 'CCW' : 'CW';
        setPlayDirection(currentDir);
        playDirectionRef.current = currentDir;
      }

      let stepMultiplier = 1;
      if (playedCard?.value === 'SKIP') {
        stepMultiplier = 2;
      } else if (playedCard?.value === 'SKIP_EVERYONE') {
        stepMultiplier = 0; // Card player takes another turn immediately!
      } else if (extraSkipCount > 0) {
        stepMultiplier = 1 + extraSkipCount;
      }

      const totalPlayers = allPlayersRef.current.length || 1;
      const step = currentDir === 'CW' ? 1 : -1;
      const curIdx = currentPlayerIndexRef.current;
      const nextIndex = (curIdx + step * stepMultiplier + totalPlayers * 10) % totalPlayers;

      setCurrentPlayerIndex(nextIndex);
      currentPlayerIndexRef.current = nextIndex;

      const nextPlayer = allPlayersRef.current[nextIndex];
      if (!nextPlayer) return;

      const effectiveColor = newActiveColor || activeColorRef.current;

      if (nextPlayer.controller === 'LOCAL_HUMAN') {
        if (isPassAndPlay) {
          // ENTER LOCAL PASS / HANDOFF STATE (Part 2 & 3)
          setHandoffTarget(nextPlayer);
          setActionLock('PASS_DEVICE');
        } else {
          // Play Bots or Online host: Local player's turn!
          setActionLock('IDLE');
          NativeEffectsService.triggerTurnChange();
        }
      } else if (nextPlayer.controller === 'BOT') {
        // Run bot turn ONLY when player controller is BOT! (Part 5 & 24)
        setActionLock('ADVANCING_TURN');
        runBotTurn(nextIndex, effectiveColor);
      } else {
        // REMOTE_HUMAN: wait for network command
        setActionLock('WAITING_FOR_REMOTE_PLAYER');
      }
    },
    [isPassAndPlay, runBotTurn]
  );

  advanceTurnRef.current = advanceTurn;

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

      const curIdx = currentPlayerIndexRef.current;
      setAllPlayers(prev => {
        const next = prev.map((p, idx) => {
          if (idx === curIdx) {
            const nextHand = [...p.hand, ...drawnCards];
            return { ...p, hand: nextHand, cardCount: nextHand.length };
          }
          return p;
        });
        allPlayersRef.current = next;
        return next;
      });

      setDeck(tempDeck);
      setPendingDrawStack(0);
      pendingDrawStackRef.current = 0;
      showToast('DRAW PENALTY', `You drew ${drawnCards.length} cards from the stack!`, 'penalty');
      session.acceptDrawStack();

      // Penalty drawer loses turn
      advanceTurn(undefined, activeColor);
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
      setAllPlayers(prev => {
        const next = prev.map((p, idx) => {
          if (idx === curIdx) {
            const nextHand = [...p.hand, cardToDraw];
            return { ...p, hand: nextHand, cardCount: nextHand.length };
          }
          return p;
        });
        allPlayersRef.current = next;
        return next;
      });

      setDeck(newDeck);
      setDiscardPile(currentDiscard);
      setHasDrawnThisTurn(true);
      setActionLock('IDLE');
      NativeEffectsService.triggerCardSelect();

      const curName = allPlayersRef.current[curIdx]?.name || 'You';
      setAnnouncement({
        text: `${curName} `,
        highlight: 'drew a card from the deck',
        color: COLORS.unoBlue,
      });

      session.drawCard();
    };
  }, [isMyTurn, actionLock, pendingDrawStack, hasDrawnThisTurn, deck, discardPile, ensureCardsInDeck, showToast, session, advanceTurn, activeColor]);

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

      // Part 5: Stacking verification
      if (pendingDrawStack > 0) {
        if (!rules.stacking) {
          NativeEffectsService.triggerInvalidAction();
          showToast('STACK ACTIVE', `Stacking disabled. Draw penalty cards (+${pendingDrawStack})!`, 'penalty');
          return;
        }
        const cardDraw = UnoDeckService.getDrawAmount(card);
        if (cardDraw === 0) {
          NativeEffectsService.triggerInvalidAction();
          showToast('STACK ACTIVE', `You must play a +card to stack or draw penalty (+${pendingDrawStack})!`, 'penalty');
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
      if (card.value === 'CUSTOM_WILD') {
        setSelectedCardId(card.id);
        setPendingWildCard(card);
        setCanChooseCustomWild(true);
        setCustomWildModalVisible(true);
        setActionLock('CHOOSING_CUSTOM_WILD_POWER');
        return;
      }

      if (card.value === 'SHUFFLE_HANDS') {
        // Dedicated Shuffle Hands
        setSelectedCardId(card.id);
        setPendingWildCard(card);
        executeShuffleHandsLogic();
        setActionLock('CHOOSING_WILD_COLOR');
        return;
      }

      if (card.value === '7' && deckType === 'NO_MERCY') {
        // 7 Swap Hands (Mandatory in No Mercy)
        setSelectedCardId(card.id);
        setPendingWildCard(card);
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
        setCanChooseRoulette(true);
        setRouletteModalVisible(true);
        setActionLock('CHOOSING_ROULETTE_COLOR');
        return;
      }

      if (UnoDeckService.isWildCard(card)) {
        setSelectedCardId(card.id);
        setPendingWildCard(card);
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

        let isVictory = false;
        setAllPlayers(prev => {
          const next = prev.map((p, idx) => {
            if (idx === curIdx) {
              const nextHand = p.hand.filter(c => c.id !== card.id);
              if (nextHand.length === 0) {
                isVictory = true;
              }
              return { ...p, hand: nextHand, cardCount: nextHand.length };
            }
            return p;
          });
          allPlayersRef.current = next;
          return next;
        });

        if (isVictory && curPlayer) {
          setWinner({ name: curPlayer.name, avatar: curPlayer.avatar, isHuman: curPlayer.isHuman });
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
        advanceTurn(card, finalColor, extraSkips);
        session.playCard(card.id, finalColor);
      };
    },
    [hasCalledUno, showToast, advanceTurn, session]
  );

  // Dedicated Shuffle Hands Logic (Part 2)
  const executeShuffleHandsLogic = useCallback(() => {
    const curIdx = currentPlayerIndexRef.current;
    const { updatedPlayers } = UnoGameEngine.executeShuffleAndRedealHands(
      allPlayersRef.current,
      curIdx,
      playDirectionRef.current
    );
    setAllPlayers(updatedPlayers);
    allPlayersRef.current = updatedPlayers;
    showToast('SHUFFLE HANDS', 'All cards gathered, shuffled and redealt sequentially!', 'success');
  }, [showToast]);

  // Pass Hands in Direction Logic (Part 3 - 0 Card)
  const executePassHandsLogic = useCallback((card: UnoCard) => {
    const { updatedPlayers } = UnoGameEngine.executePassHandsInDirection(
      allPlayersRef.current,
      playDirectionRef.current
    );
    setAllPlayers(updatedPlayers);
    allPlayersRef.current = updatedPlayers;
    showToast('0 PASS HANDS', `Hands passed ${playDirectionRef.current === 'CW' ? 'Clockwise' : 'Counter-Clockwise'}!`, 'warning');
    commitPlay(card, card.color);
  }, [showToast, commitPlay]);

  // Discard All Logic (Part 3)
  const executeDiscardAllLogic = useCallback((card: UnoCard) => {
    const curIdx = currentPlayerIndexRef.current;
    const curPlayer = allPlayersRef.current[curIdx];
    if (!curPlayer) return;

    const { updatedPlayer, updatedDiscard, discardedCount } = UnoGameEngine.executeDiscardAll(
      curPlayer,
      discardPile,
      card.color
    );

    setAllPlayers(prev => {
      const next = prev.map((p, idx) => (idx === curIdx ? updatedPlayer : p));
      allPlayersRef.current = next;
      return next;
    });
    setDiscardPile(updatedDiscard);
    showToast('DISCARD ALL', `Discarded ${discardedCount} ${card.color} cards!`, 'warning');
    commitPlay(card, card.color);
  }, [discardPile, showToast, commitPlay]);

  // Wild Color Selection Callback
  const handleWildColorSelected = useCallback(
    (color: UnoColor) => {
      if (!pendingWildCard) return;
      const card = pendingWildCard;
      setPendingWildCard(null);
      commitPlay(card, color);
      session.chooseWildColor(color);
    },
    [pendingWildCard, commitPlay, session]
  );

  // Custom Wild Power Selection Callback (Part 2)
  const handleCustomWildPowerSelected = useCallback(
    (power: CustomWildPower) => {
      setCustomWildModalVisible(false);
      session.chooseCustomWildPower(power);

      if (power === 'SHUFFLE_HANDS') {
        executeShuffleHandsLogic();
      } else if (power === 'EVERYONE_PLUS_FOUR') {
        // Every other player gets +4
        const curIdx = currentPlayerIndexRef.current;
        setAllPlayers(prev => {
          const next = prev.map((p, idx) =>
            idx !== curIdx ? { ...p, cardCount: p.cardCount + 4 } : p
          );
          allPlayersRef.current = next;
          return next;
        });
        showToast('EVERYONE +4', 'Every other player received +4 penalty cards!', 'penalty');
      }

      // Card player now chooses wild color
      setActionLock('CHOOSING_WILD_COLOR');
    },
    [executeShuffleHandsLogic, session, showToast]
  );

  // 7 Swap Player Selection Callback (Part 3)
  const handleSwapPlayerSelected = useCallback(
    (targetPlayerId: string) => {
      setSwapModalVisible(false);
      session.chooseSwapTarget(targetPlayerId);

      const target = allPlayersRef.current.find(p => p.id === targetPlayerId);
      if (target) {
        showToast('SWAP HANDS', `Exchanged hand with ${target.name}!`, 'warning');
      }

      if (pendingWildCard) {
        commitPlay(pendingWildCard, pendingWildCard.color);
      }
    },
    [session, showToast, pendingWildCard, commitPlay]
  );

  // Roulette Color Selection Callback (Part 4)
  const handleRouletteColorSelected = useCallback(
    (color: UnoColor) => {
      setRouletteModalVisible(false);
      session.chooseRouletteColor(color);

      // Execute roulette draw for target
      const { updatedDrawPile: newDraw, updatedDiscardPile: newDiscard, drawnCards } = UnoGameEngine.executeColorRouletteDraw(
        { id: 'target', name: '', avatar: '', isHuman: false, controller: 'BOT', hand: [], cardCount: 0 },
        deck,
        discardPile,
        color
      );

      setDeck(newDraw);
      setDiscardPile(newDiscard);
      showToast('ROULETTE DRAW', `Target drew ${drawnCards.length} cards until ${color} appeared!`, 'penalty');

      if (pendingWildCard) {
        commitPlay(pendingWildCard, color, 1); // Target draws and loses turn
      }
    },
    [deck, discardPile, session, showToast, pendingWildCard, commitPlay]
  );

  // End Turn Action
  const handleEndTurn = useCallback(() => {
    if (!isMyTurn) return;
    if (actionLock !== 'IDLE') return;
    if (!hasDrawnThisTurn) {
      showToast('CANNOT END TURN', 'You must draw a card before passing your turn.', 'warning');
      return;
    }

    NativeEffectsService.triggerTurnChange();
    advanceTurn();
    session.endTurn();
  }, [isMyTurn, actionLock, hasDrawnThisTurn, showToast, advanceTurn, session]);

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
      {/* Table Oval */}
      <View style={styles.tableCenter}>
        <NativeGameTable />
      </View>

      {/* Top HUD */}
      <View style={styles.topHud}>
        <View style={styles.timerBadge}>
          <Text style={styles.timerIcon}>
            {activeRoom?.mode === 'WLAN' ? '📡' : activeRoom?.mode === 'ONLINE' ? '🌐' : '⏱'}
          </Text>
          <Text style={styles.timerText}>
            {isMyTurn
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
            />
          </View>
        );
      })}

      {/* Bottom Center: Player Hand with TWO-TAP Confirmation */}
      <View style={styles.bottomHand}>
        <NativePlayerHandFan
          hand={myHand}
          topCard={topCard}
          activeColor={activeColor}
          pendingDrawStack={pendingDrawStack}
          rules={rules}
          isMyTurn={isMyTurn}
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

      {/* Game Over Modal */}
      <NativeGameOverModal
        visible={actionLock === 'GAME_OVER'}
        winner={winner}
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
});
