import { UnoCard, UnoColor, UnoValue, Player, GameRules, GamePhase, CustomWildPower, GameEndMode, PlayerStatus } from '../types/game';
import { UnoDeckService } from './UnoDeckService';

export interface EngineResult {
  players: Player[];
  discardPile: UnoCard[];
  drawPile: UnoCard[];
  activeColor: UnoColor;
  pendingDrawStack: number;
  currentPlayerIndex: number;
  direction: 'CW' | 'CCW';
  gamePhase: GamePhase;
  choiceOwnerId?: string;
  winner: Player | null;
  events: EngineEvent[];
  revision: number;
}

export type EngineEvent =
  | { type: 'CARD_PLAYED'; playerId: string; card: UnoCard }
  | { type: 'CARD_DRAWN'; playerId: string; count: number }
  | { type: 'DISCARD_ALL'; playerId: string; color: UnoColor; count: number }
  | { type: 'SKIP_EVERYONE'; playerId: string }
  | { type: 'DIRECTION_REVERSED'; newDirection: 'CW' | 'CCW' }
  | { type: 'PLAYER_SKIPPED'; playerId: string }
  | { type: 'SHUFFLE_AND_REDEAL_HANDS'; cardCounts: Record<string, number> }
  | { type: 'SWAP_HANDS'; player1Id: string; player2Id: string }
  | { type: 'PASS_HANDS'; direction: 'CW' | 'CCW'; cardCounts: Record<string, number> }
  | { type: 'CUSTOM_WILD_RESOLVED'; playerId: string; power: CustomWildPower }
  | { type: 'ROULETTE_DRAW_RESOLVED'; playerId: string; color: UnoColor; drawnCount: number }
  | { type: 'DRAW_STACK_RESOLVED'; playerId: string; totalDrawn: number }
  | { type: 'PLAYER_ELIMINATED'; playerId: string; reason: string }
  | { type: 'PLAYER_WON'; winner: Player };

export interface ShuffleHandsResult {
  updatedPlayers: Player[];
  cardCounts: Record<string, number>;
  initialCardCounts: Record<string, number>;
  eligiblePlayerIds: string[];
  dealingOrder: string[];
  dealSequence: { playerId: string; card: UnoCard }[];
  totalCards: number;
}

export interface FinalRankItem {
  playerId: string;
  name: string;
  avatar: string;
  status: PlayerStatus;
  rank: number;
  cardCount: number;
  isHuman: boolean;
}

export interface CompletionEvaluationResult {
  updatedPlayers: Player[];
  finishingOrder: string[];
  eliminatedOrder: string[];
  justFinishedPlayerId?: string;
  justEliminatedPlayerId?: string;
  isMatchOver: boolean;
  winner: Player | null;
  finalResults: FinalRankItem[];
}

export class UnoGameEngine {
  /**
   * Helper: ensure cards in draw pile by recycling discard pile if necessary.
   */
  static ensureDrawCards(drawPile: UnoCard[], discardPile: UnoCard[], needed: number): { drawPile: UnoCard[]; discardPile: UnoCard[] } {
    let currentDraw = [...drawPile];
    let currentDiscard = [...discardPile];

    if (currentDraw.length < needed) {
      const recycled = UnoDeckService.recycleDiscard(currentDiscard);
      currentDraw = [...currentDraw, ...recycled.newDeck];
      currentDiscard = recycled.remainingDiscard;
    }

    return { drawPile: currentDraw, discardPile: currentDiscard };
  }

  /**
   * Centralized helper: returns all eligible active players participating in gameplay.
   * Excludes FINISHED and ELIMINATED players.
   */
  static getEligibleActivePlayers(players: Player[]): Player[] {
    return players.filter(p => {
      if (p.status === 'FINISHED' || p.status === 'ELIMINATED' || p.isEliminated) {
        return false;
      }
      if (p.status === 'ACTIVE') {
        return true;
      }
      // Fallback for players without explicit status:
      return p.cardCount > 0 || (p.hand && p.hand.length > 0);
    });
  }

  /**
   * Authoritative turn rotation helper:
   * Skips FINISHED and ELIMINATED players.
   * Respects current direction ('CW' | 'CCW') and stepCount (normal=1, skip=2, etc.).
   */
  static getNextActivePlayerIndex(
    players: Player[],
    currentIndex: number,
    direction: 'CW' | 'CCW',
    stepCount: number = 1
  ): number {
    const total = players.length;
    if (total === 0) return 0;

    let index = currentIndex;
    let stepsLeft = stepCount;
    const dirStep = direction === 'CW' ? 1 : -1;

    let loopCount = 0;
    while (stepsLeft > 0 && loopCount < total * 2) {
      index = (index + dirStep + total) % total;
      loopCount++;
      const p = players[index];
      const isEligible =
        p &&
        !p.isEliminated &&
        p.status !== 'FINISHED' &&
        p.status !== 'ELIMINATED' &&
        (p.status === 'ACTIVE' || p.cardCount > 0 || (p.hand && p.hand.length > 0));

      if (isEligible) {
        stepsLeft--;
      }
      if (index === currentIndex && stepsLeft === stepCount) {
        break;
      }
    }

    // Safety guarantee: If stepCount was 0 or current player finished, never return an ineligible player!
    const selected = players[index];
    const isSelectedEligible =
      selected &&
      !selected.isEliminated &&
      selected.status !== 'FINISHED' &&
      selected.status !== 'ELIMINATED' &&
      (selected.status === 'ACTIVE' || selected.cardCount > 0 || (selected.hand && selected.hand.length > 0));

    if (!isSelectedEligible) {
      let findLoop = 0;
      while (findLoop < total) {
        index = (index + dirStep + total) % total;
        findLoop++;
        const candidate = players[index];
        if (
          candidate &&
          !candidate.isEliminated &&
          candidate.status !== 'FINISHED' &&
          candidate.status !== 'ELIMINATED' &&
          (candidate.status === 'ACTIVE' || candidate.cardCount > 0 || (candidate.hand && candidate.hand.length > 0))
        ) {
          return index;
        }
      }
    }

    return index;
  }

  /**
   * Centralized Authoritative Completion Evaluation:
   * Evaluates player completion (hand = 0) and Mercy rule eliminations (25+ cards),
   * updates player statuses (ACTIVE, FINISHED, ELIMINATED),
   * tracks finishingOrder and eliminatedOrder, and determines whether match is over
   * based on GameEndMode ('FIRST_PLAYER_WINS' vs 'PLAY_UNTIL_LAST_PLAYER').
   */
  static evaluatePlayerCompletion(
    players: Player[],
    rules: GameRules,
    currentFinishingOrder: string[] = [],
    currentEliminatedOrder: string[] = []
  ): CompletionEvaluationResult {
    const finishingOrder = [...currentFinishingOrder];
    const eliminatedOrder = [...currentEliminatedOrder];
    let justFinishedPlayerId: string | undefined;
    let justEliminatedPlayerId: string | undefined;

    // 1. Process player statuses
    let updatedPlayers: Player[] = players.map(p => {
      // In multiplayer, remote players' hands are private and hidden (p.hand is dummy [] while p.cardCount > 0).
      // We must not treat a hidden hand as 0 cards, otherwise remote players are instantly marked finished!
      const cardCount = (p.controller === 'REMOTE_HUMAN' || (p.cardCount && p.cardCount > 0 && (!p.hand || p.hand.length === 0)))
        ? (p.cardCount ?? 0)
        : (p.hand ? p.hand.length : (p.cardCount ?? 0));
      let status: PlayerStatus = p.status || (p.isEliminated ? 'ELIMINATED' : 'ACTIVE');
      let isEliminated = p.isEliminated || status === 'ELIMINATED';

      // 25-card Mercy Rule (No Mercy only)
      if (rules.deckType === 'NO_MERCY' && rules.mercy25Cards && !isEliminated && status !== 'FINISHED') {
        if (cardCount >= 25) {
          status = 'ELIMINATED';
          isEliminated = true;
          if (!eliminatedOrder.includes(p.id)) {
            eliminatedOrder.push(p.id);
            justEliminatedPlayerId = p.id;
          }
        }
      }

      // Hand emptied (Finished)
      if (!isEliminated && status !== 'ELIMINATED' && cardCount === 0 && status !== 'FINISHED') {
        status = 'FINISHED';
        if (!finishingOrder.includes(p.id)) {
          finishingOrder.push(p.id);
          justFinishedPlayerId = p.id;
        }
      }

      const finishRank = finishingOrder.includes(p.id) ? finishingOrder.indexOf(p.id) + 1 : p.finishRank;

      return {
        ...p,
        cardCount,
        status,
        isEliminated,
        finishRank,
      };
    });

    const activePlayers = this.getEligibleActivePlayers(updatedPlayers);
    const endMode = rules.gameEndMode || 'FIRST_PLAYER_WINS';
    let isMatchOver = false;
    let winner: Player | null = null;

    if (endMode === 'FIRST_PLAYER_WINS') {
      if (finishingOrder.length >= 1) {
        isMatchOver = true;
        winner = updatedPlayers.find(p => p.id === finishingOrder[0]) || null;
      } else if (rules.deckType === 'NO_MERCY' && activePlayers.length === 1 && updatedPlayers.length > 1) {
        // Last standing player wins No Mercy by elimination of all opponents
        isMatchOver = true;
        winner = activePlayers[0];
        if (!finishingOrder.includes(winner.id)) {
          finishingOrder.push(winner.id);
        }
      } else if (activePlayers.length === 0) {
        isMatchOver = true;
      }
    } else {
      // PLAY_UNTIL_LAST_PLAYER
      if (activePlayers.length === 0) {
        isMatchOver = true;
      } else if (activePlayers.length === 1 && (finishingOrder.length > 0 || eliminatedOrder.length > 0)) {
        // Only 1 player left holding cards: they take the final rank!
        const lastPlayer = activePlayers[0];
        if (!finishingOrder.includes(lastPlayer.id)) {
          finishingOrder.push(lastPlayer.id);
        }
        updatedPlayers = updatedPlayers.map(p =>
          p.id === lastPlayer.id
            ? { ...p, status: 'FINISHED', finishRank: finishingOrder.length }
            : p
        );
        isMatchOver = true;
      }

      if (finishingOrder.length > 0) {
        winner = updatedPlayers.find(p => p.id === finishingOrder[0]) || null;
      }
    }

    // Build complete final results
    const finalResults: FinalRankItem[] = [];
    finishingOrder.forEach((id, idx) => {
      const p = updatedPlayers.find(pl => pl.id === id);
      if (p) {
        finalResults.push({
          playerId: p.id,
          name: p.name,
          avatar: p.avatar,
          status: 'FINISHED',
          rank: idx + 1,
          cardCount: p.cardCount,
          isHuman: p.isHuman,
        });
      }
    });

    updatedPlayers.forEach(p => {
      if (!finishingOrder.includes(p.id) && !eliminatedOrder.includes(p.id)) {
        finalResults.push({
          playerId: p.id,
          name: p.name,
          avatar: p.avatar,
          status: p.status || 'ACTIVE',
          rank: finalResults.length + 1,
          cardCount: p.cardCount,
          isHuman: p.isHuman,
        });
      }
    });

    eliminatedOrder.forEach(id => {
      const p = updatedPlayers.find(pl => pl.id === id);
      if (p && !finalResults.some(r => r.playerId === id)) {
        finalResults.push({
          playerId: p.id,
          name: p.name,
          avatar: p.avatar,
          status: 'ELIMINATED',
          rank: finalResults.length + 1,
          cardCount: p.cardCount,
          isHuman: p.isHuman,
        });
      }
    });

    return {
      updatedPlayers,
      finishingOrder,
      eliminatedOrder,
      justFinishedPlayerId,
      justEliminatedPlayerId,
      isMatchOver,
      winner,
      finalResults,
    };
  }

  /**
   * Check for winner or elimination according to rules (delegates to evaluatePlayerCompletion).
   */
  static checkWinAndEliminations(
    players: Player[],
    rules: GameRules
  ): { updatedPlayers: Player[]; winner: Player | null; eliminated: Player[] } {
    const res = this.evaluatePlayerCompletion(players, rules);
    const eliminated = res.updatedPlayers.filter(p => p.isEliminated || p.status === 'ELIMINATED');
    return { updatedPlayers: res.updatedPlayers, winner: res.winner, eliminated };
  }


  /**
   * Pure Authoritative Engine Action: executeShuffleHands (Dedicated Shuffle Hands & Custom Wild)
   * 1. Gather cards from all eligible active (non-eliminated) players.
   * 2. Shuffle entire combined pool exactly once.
   * 3. Determine dealing order starting from player immediately next to card player in current direction.
   * 4. Deal one by one sequentially until pool is empty.
   */
  static executeShuffleHands(
    players: Player[],
    cardPlayerIndex: number,
    direction: 'CW' | 'CCW'
  ): ShuffleHandsResult {
    const eligibleIndices: number[] = [];
    const pool: UnoCard[] = [];
    const initialCardCounts: Record<string, number> = {};

    // 1. Gather cards from eligible active players
    players.forEach((p, idx) => {
      initialCardCounts[p.id] = (p.hand || []).length;
      if (!p.isEliminated && p.status !== 'FINISHED' && p.status !== 'ELIMINATED' && p.hand && p.hand.length > 0) {
        eligibleIndices.push(idx);
        pool.push(...p.hand);
      }
    });

    if (eligibleIndices.length === 0 || pool.length === 0) {
      return {
        updatedPlayers: players,
        cardCounts: players.reduce((acc, p) => ({ ...acc, [p.id]: p.hand.length }), {}),
        initialCardCounts,
        eligiblePlayerIds: [],
        dealingOrder: [],
        dealSequence: [],
        totalCards: 0,
      };
    }

    // 2. Shuffle entire combined pool
    const shuffledPool = UnoDeckService.shuffle([...pool]);

    // 3. Determine dealing order: start with player immediately next to card player in current direction
    const dealingOrderIndices: number[] = [];
    let cur = cardPlayerIndex;
    for (let i = 0; i < players.length; i++) {
      cur = this.getNextActivePlayerIndex(players, cur, direction, 1);
      if (!dealingOrderIndices.includes(cur) && eligibleIndices.includes(cur)) {
        dealingOrderIndices.push(cur);
      }
      if (dealingOrderIndices.length === eligibleIndices.length) break;
    }

    // Failsafe fallback if dealing order missed anyone eligible
    eligibleIndices.forEach(idx => {
      if (!dealingOrderIndices.includes(idx)) dealingOrderIndices.push(idx);
    });

    const dealingOrder = dealingOrderIndices.map(idx => players[idx].id);

    // 4. Clear all eligible hands
    const newHands: Record<number, UnoCard[]> = {};
    eligibleIndices.forEach(idx => {
      newHands[idx] = [];
    });

    // 5. Deal one by one sequentially
    const dealSequence: { playerId: string; card: UnoCard }[] = [];
    let dealPtr = 0;
    while (shuffledPool.length > 0) {
      const recipientIdx = dealingOrderIndices[dealPtr % dealingOrderIndices.length];
      const card = shuffledPool.pop();
      if (card) {
        newHands[recipientIdx].push(card);
        dealSequence.push({ playerId: players[recipientIdx].id, card });
      }
      dealPtr++;
    }

    // 6. Update players
    const updatedPlayers = players.map((p, idx) => {
      if (newHands[idx]) {
        return {
          ...p,
          hand: newHands[idx],
          cardCount: newHands[idx].length,
        };
      }
      return p;
    });

    const cardCounts: Record<string, number> = {};
    updatedPlayers.forEach(p => {
      cardCounts[p.id] = p.hand.length;
    });

    return {
      updatedPlayers,
      cardCounts,
      initialCardCounts,
      eligiblePlayerIds: eligibleIndices.map(idx => players[idx].id),
      dealingOrder,
      dealSequence,
      totalCards: pool.length,
    };
  }

  /**
   * Alias pointing to the exact same authoritative executeShuffleHands implementation
   */
  static executeShuffleAndRedealHands(
    players: Player[],
    cardPlayerIndex: number,
    direction: 'CW' | 'CCW'
  ): ShuffleHandsResult {
    return this.executeShuffleHands(players, cardPlayerIndex, direction);
  }

  /**
   * Pure Engine Action: SWAP_HANDS_WITH_PLAYER (7 Swap Hands - No Mercy Only)
   */
  static executeSwapHands(
    players: Player[],
    player1Id: string,
    player2Id: string
  ): { updatedPlayers: Player[] } {
    const p1 = players.find(p => p.id === player1Id);
    const p2 = players.find(p => p.id === player2Id);
    if (!p1 || !p2) return { updatedPlayers: players };

    const p1Hand = [...p1.hand];
    const p2Hand = [...p2.hand];

    const updatedPlayers = players.map(p => {
      if (p.id === player1Id) {
        return { ...p, hand: p2Hand, cardCount: p2Hand.length };
      }
      if (p.id === player2Id) {
        return { ...p, hand: p1Hand, cardCount: p1Hand.length };
      }
      return p;
    });

    return { updatedPlayers };
  }

  /**
   * Pure Engine Action: PASS_HANDS_IN_DIRECTION (0 Pass Hands - No Mercy Only)
   * All active players' entire hands move simultaneously from a snapshot in current direction.
   */
  static executePassHandsInDirection(
    players: Player[],
    direction: 'CW' | 'CCW'
  ): { updatedPlayers: Player[]; cardCounts: Record<string, number> } {
    const activePlayers = this.getEligibleActivePlayers(players);
    if (activePlayers.length <= 1) {
      return {
        updatedPlayers: players,
        cardCounts: players.reduce((acc, p) => ({ ...acc, [p.id]: p.hand.length }), {}),
      };
    }

    // Take snapshot of each active player's hand
    const handSnapshot = new Map<string, UnoCard[]>();
    activePlayers.forEach(p => {
      handSnapshot.set(p.id, [...p.hand]);
    });

    // In current direction, player i gets hand of player behind them
    // Clockwise: P1 -> P2 -> P3 -> P4 -> P1
    // Counter-clockwise: P1 <- P2 <- P3 <- P4 <- P1
    const n = activePlayers.length;
    const newHandMap = new Map<string, UnoCard[]>();

    activePlayers.forEach((p, i) => {
      const sourceIndex = direction === 'CW' ? (i - 1 + n) % n : (i + 1) % n;
      const sourcePlayer = activePlayers[sourceIndex];
      newHandMap.set(p.id, handSnapshot.get(sourcePlayer.id) || []);
    });

    const updatedPlayers = players.map(p => {
      if (newHandMap.has(p.id)) {
        const hand = newHandMap.get(p.id)!;
        return { ...p, hand, cardCount: hand.length };
      }
      return p;
    });

    const cardCounts: Record<string, number> = {};
    updatedPlayers.forEach(p => {
      cardCounts[p.id] = p.hand.length;
    });

    return { updatedPlayers, cardCounts };
  }

  /**
   * Pure Engine Action: DISCARD_ALL (No Mercy colored card)
   * Discards all cards matching the card's color from player's hand into discard pile.
   */
  static executeDiscardAll(
    player: Player,
    discardPile: UnoCard[],
    color: UnoColor
  ): { updatedPlayer: Player; updatedDiscard: UnoCard[]; discardedCount: number } {
    const keep: UnoCard[] = [];
    const discard: UnoCard[] = [];

    player.hand.forEach(c => {
      if (c.color === color) {
        discard.push(c);
      } else {
        keep.push(c);
      }
    });

    const updatedPlayer: Player = {
      ...player,
      hand: keep,
      cardCount: keep.length,
    };

    const updatedDiscard = [...discardPile, ...discard];

    return {
      updatedPlayer,
      updatedDiscard,
      discardedCount: discard.length,
    };
  }

  /**
   * Pure Engine Action: COLOR_ROULETTE_DRAW (No Mercy Wild Color Roulette)
   * Target draws cards one by one until a card of chosen color appears (which also goes to target's hand).
   * Target then loses turn.
   */
  static executeColorRouletteDraw(
    targetPlayer: Player,
    drawPile: UnoCard[],
    discardPile: UnoCard[],
    chosenColor: UnoColor
  ): { updatedPlayer: Player; updatedDrawPile: UnoCard[]; updatedDiscardPile: UnoCard[]; drawnCards: UnoCard[] } {
    let curDraw = [...drawPile];
    let curDiscard = [...discardPile];
    const drawn: UnoCard[] = [];
    const newHand = [...targetPlayer.hand];

    let foundMatch = false;
    let safeguard = 0;

    while (!foundMatch && safeguard < 50) {
      safeguard++;
      if (curDraw.length === 0) {
        const recycled = UnoDeckService.recycleDiscard(curDiscard);
        curDraw = recycled.newDeck;
        curDiscard = recycled.remainingDiscard;
      }
      if (curDraw.length === 0) break; // Entire deck exhausted

      const card = curDraw.pop()!;
      drawn.push(card);
      newHand.push(card);

      if (card.color === chosenColor) {
        foundMatch = true;
      }
    }

    const updatedPlayer: Player = {
      ...targetPlayer,
      hand: newHand,
      cardCount: newHand.length,
    };

    return {
      updatedPlayer,
      updatedDrawPile: curDraw,
      updatedDiscardPile: curDiscard,
      drawnCards: drawn,
    };
  }

  /**
   * Pure Engine Action: RESOLVE_DRAW_STACK_PENALTY
   * Player draws the full accumulated pendingDrawStack penalty and loses turn.
   */
  static resolveDrawStackPenalty(
    player: Player,
    drawPile: UnoCard[],
    discardPile: UnoCard[],
    amount: number
  ): { updatedPlayer: Player; updatedDrawPile: UnoCard[]; updatedDiscardPile: UnoCard[]; drawnCards: UnoCard[] } {
    const { drawPile: validDraw, discardPile: validDiscard } = this.ensureDrawCards(drawPile, discardPile, amount);
    let curDraw = [...validDraw];
    const drawn: UnoCard[] = [];

    for (let i = 0; i < amount; i++) {
      if (curDraw.length === 0) {
        const recycled = UnoDeckService.recycleDiscard(validDiscard);
        curDraw = recycled.newDeck;
      }
      if (curDraw.length > 0) {
        drawn.push(curDraw.pop()!);
      }
    }

    const updatedPlayer: Player = {
      ...player,
      hand: [...player.hand, ...drawn],
      cardCount: player.hand.length + drawn.length,
    };

    return {
      updatedPlayer,
      updatedDrawPile: curDraw,
      updatedDiscardPile: validDiscard,
      drawnCards: drawn,
    };
  }
}
