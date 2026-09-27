import { UnoCard, UnoColor, UnoValue, Player, GameRules, GamePhase, CustomWildPower } from '../types/game';
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
   * Calculate next active player index, taking into account direction, steps, and skipping eliminated players.
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

    while (stepsLeft > 0) {
      index = (index + dirStep + total) % total;
      // Skip eliminated or finished players
      if (!players[index].isEliminated && players[index].hand.length > 0) {
        stepsLeft--;
      }
      // Failsafe loop prevention
      if (index === currentIndex && stepsLeft === stepCount) {
        break;
      }
    }

    return index;
  }

  /**
   * Check for winner or elimination according to rules.
   */
  static checkWinAndEliminations(
    players: Player[],
    rules: GameRules
  ): { updatedPlayers: Player[]; winner: Player | null; eliminated: Player[] } {
    let updated = players.map(p => ({ ...p, cardCount: p.hand.length }));
    const eliminated: Player[] = [];

    // Rule: Mercy rule in No Mercy (25 cards = eliminated)
    if (rules.deckType === 'NO_MERCY' && rules.mercy25Cards) {
      updated = updated.map(p => {
        if (!p.isEliminated && p.hand.length >= 25) {
          eliminated.push(p);
          return { ...p, isEliminated: true };
        }
        return p;
      });
    }

    // Win condition 1: Hand size reaches 0
    const emptyHandPlayer = updated.find(p => !p.isEliminated && p.hand.length === 0);
    if (emptyHandPlayer) {
      return { updatedPlayers: updated, winner: emptyHandPlayer, eliminated };
    }

    // Win condition 2: In No Mercy, last active player standing wins
    if (rules.deckType === 'NO_MERCY') {
      const activeStanding = updated.filter(p => !p.isEliminated);
      if (activeStanding.length === 1) {
        return { updatedPlayers: updated, winner: activeStanding[0], eliminated };
      }
    }

    return { updatedPlayers: updated, winner: null, eliminated };
  }

  /**
   * Pure Engine Action: SHUFFLE_AND_REDEAL_HANDS (Dedicated Shuffle Hands & Custom Wild)
   * 1. Collect all active players' cards into combined pool.
   * 2. Shuffle entire pool.
   * 3. Redistribute cards one-by-one starting with player next to card player in current direction.
   * 4. Continue until pool is empty.
   */
  static executeShuffleAndRedealHands(
    players: Player[],
    cardPlayerIndex: number,
    direction: 'CW' | 'CCW'
  ): { updatedPlayers: Player[]; cardCounts: Record<string, number> } {
    const eligibleIndices: number[] = [];
    const pool: UnoCard[] = [];

    // 1. Gather cards from non-eliminated players
    players.forEach((p, idx) => {
      if (!p.isEliminated) {
        eligibleIndices.push(idx);
        pool.push(...p.hand);
      }
    });

    if (eligibleIndices.length === 0 || pool.length === 0) {
      return {
        updatedPlayers: players,
        cardCounts: players.reduce((acc, p) => ({ ...acc, [p.id]: p.hand.length }), {}),
      };
    }

    // 2. Shuffle entire combined pool
    const shuffledPool = UnoDeckService.shuffle(pool);

    // 3. Determine dealing order: start with player immediately next to card player in current direction
    const dealingOrder: number[] = [];
    let cur = cardPlayerIndex;
    for (let i = 0; i < players.length; i++) {
      cur = this.getNextActivePlayerIndex(players, cur, direction, 1);
      if (!dealingOrder.includes(cur) && eligibleIndices.includes(cur)) {
        dealingOrder.push(cur);
      }
      if (dealingOrder.length === eligibleIndices.length) break;
    }

    // Failsafe fallback if dealing order missed anyone eligible
    eligibleIndices.forEach(idx => {
      if (!dealingOrder.includes(idx)) dealingOrder.push(idx);
    });

    // 4. Clear all eligible hands
    const newHands: Record<number, UnoCard[]> = {};
    eligibleIndices.forEach(idx => {
      newHands[idx] = [];
    });

    // 5. Deal one by one sequentially
    let dealPtr = 0;
    while (shuffledPool.length > 0) {
      const recipientIdx = dealingOrder[dealPtr % dealingOrder.length];
      const card = shuffledPool.pop();
      if (card) {
        newHands[recipientIdx].push(card);
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

    return { updatedPlayers, cardCounts };
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
    const activePlayers = players.filter(p => !p.isEliminated);
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
