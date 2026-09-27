import { UnoCard, UnoColor, UnoValue, DeckType, GameRules } from '../types/game';

export class UnoDeckService {
  /**
   * Generates pure authoritative deck strictly following the official specifications:
   * NORMAL: exactly 112 cards
   * NO_MERCY: exactly 168 cards
   */
  static generateDeck(deckType: DeckType = 'NORMAL'): UnoCard[] {
    const cards: UnoCard[] = [];
    const colors: UnoColor[] = ['RED', 'YELLOW', 'GREEN', 'BLUE'];

    if (deckType === 'NORMAL') {
      // ------------------------------------------------------------
      // NORMAL UNO — 112 CARDS
      // ------------------------------------------------------------
      // 1. Number Cards:
      // - 0: 1 per color = 4
      colors.forEach(color => {
        cards.push({ id: `NORM_${color}_0_${Math.random().toString(36).substring(2, 7)}`, color, value: '0' });
      });

      // - 1–9: 2 per number per color = 72
      colors.forEach(color => {
        const numbers: UnoValue[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        numbers.forEach(num => {
          cards.push({ id: `NORM_${color}_${num}_a_${Math.random().toString(36).substring(2, 7)}`, color, value: num });
          cards.push({ id: `NORM_${color}_${num}_b_${Math.random().toString(36).substring(2, 7)}`, color, value: num });
        });
      });

      // 2. Colored Actions:
      // - Skip: 2 per color = 8
      // - Reverse: 2 per color = 8
      // - Draw Two (+2): 2 per color = 8
      colors.forEach(color => {
        (['SKIP', 'REVERSE', 'DRAW_TWO'] as UnoValue[]).forEach(act => {
          cards.push({ id: `NORM_${color}_${act}_a_${Math.random().toString(36).substring(2, 7)}`, color, value: act });
          cards.push({ id: `NORM_${color}_${act}_b_${Math.random().toString(36).substring(2, 7)}`, color, value: act });
        });
      });

      // 3. Wilds:
      // - Wild: 4
      for (let i = 0; i < 4; i++) {
        cards.push({ id: `NORM_WILD_${i}_${Math.random().toString(36).substring(2, 7)}`, color: 'WILD', value: 'WILD' });
      }

      // - Wild Draw Four (+4): 4
      for (let i = 0; i < 4; i++) {
        cards.push({ id: `NORM_WILD_DRAW_FOUR_${i}_${Math.random().toString(36).substring(2, 7)}`, color: 'WILD', value: 'WILD_DRAW_FOUR' });
      }

      // - Dedicated Shuffle Hands: 1
      cards.push({ id: `NORM_SHUFFLE_HANDS_${Math.random().toString(36).substring(2, 7)}`, color: 'WILD', value: 'SHUFFLE_HANDS' });

      // - Custom Wild: 3
      for (let i = 0; i < 3; i++) {
        cards.push({ id: `NORM_CUSTOM_WILD_${i}_${Math.random().toString(36).substring(2, 7)}`, color: 'WILD', value: 'CUSTOM_WILD' });
      }
      // Sum: 4 + 72 + 24 + 4 + 4 + 1 + 3 = 112 cards
    } else {
      // ------------------------------------------------------------
      // NO MERCY — 168 CARDS
      // ------------------------------------------------------------
      // 1. Number Cards: Two complete 0–9 sets for every color (20 per color = 80)
      colors.forEach(color => {
        const numbers: UnoValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        // Set 1
        numbers.forEach(num => {
          cards.push({ id: `NM_${color}_${num}_set1_${Math.random().toString(36).substring(2, 7)}`, color, value: num });
        });
        // Set 2
        numbers.forEach(num => {
          cards.push({ id: `NM_${color}_${num}_set2_${Math.random().toString(36).substring(2, 7)}`, color, value: num });
        });
      });

      // 2. Colored Actions:
      // - Skip: 3 per color = 12
      // - Reverse: 3 per color = 12
      // - Draw Two (+2): 3 per color = 12
      // - Discard All: 3 per color = 12
      colors.forEach(color => {
        (['SKIP', 'REVERSE', 'DRAW_TWO', 'DISCARD_ALL'] as UnoValue[]).forEach(act => {
          for (let i = 1; i <= 3; i++) {
            cards.push({ id: `NM_${color}_${act}_${i}_${Math.random().toString(36).substring(2, 7)}`, color, value: act });
          }
        });
      });

      // - Draw Four (+4): 2 per color = 8 (Colored!)
      colors.forEach(color => {
        for (let i = 1; i <= 2; i++) {
          cards.push({ id: `NM_${color}_DRAW_FOUR_${i}_${Math.random().toString(36).substring(2, 7)}`, color, value: 'DRAW_FOUR' });
        }
      });

      // - Skip Everyone: 2 per color = 8 (Colored!)
      colors.forEach(color => {
        for (let i = 1; i <= 2; i++) {
          cards.push({ id: `NM_${color}_SKIP_EVERYONE_${i}_${Math.random().toString(36).substring(2, 7)}`, color, value: 'SKIP_EVERYONE' });
        }
      });

      // 3. Wild Cards:
      // - Wild Color Roulette: 8
      for (let i = 0; i < 8; i++) {
        cards.push({ id: `NM_WILD_COLOR_ROULETTE_${i}_${Math.random().toString(36).substring(2, 7)}`, color: 'WILD', value: 'WILD_COLOR_ROULETTE' });
      }

      // - Wild Reverse Draw Four: 8
      for (let i = 0; i < 8; i++) {
        cards.push({ id: `NM_WILD_REVERSE_DRAW_FOUR_${i}_${Math.random().toString(36).substring(2, 7)}`, color: 'WILD', value: 'WILD_REVERSE_DRAW_FOUR' });
      }

      // - Wild Draw Six (+6): 4
      for (let i = 0; i < 4; i++) {
        cards.push({ id: `NM_WILD_DRAW_SIX_${i}_${Math.random().toString(36).substring(2, 7)}`, color: 'WILD', value: 'WILD_DRAW_SIX' });
      }

      // - Wild Draw Ten (+10): 4
      for (let i = 0; i < 4; i++) {
        cards.push({ id: `NM_WILD_DRAW_TEN_${i}_${Math.random().toString(36).substring(2, 7)}`, color: 'WILD', value: 'WILD_DRAW_TEN' });
      }
      // Sum: 80 numbers + 48 colored + 8 DrawFour + 8 SkipEveryone + 24 wilds = 168 cards
    }

    return this.shuffle(cards);
  }

  static shuffle(deck: UnoCard[]): UnoCard[] {
    const array = [...deck];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Automated Deck Validation (Part 2)
   * Validates deck against authoritative rules before match creation or match start.
   */
  static validateDeck(deck: UnoCard[], expectedDeckType: DeckType): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Total count check
    const expectedCount = expectedDeckType === 'NORMAL' ? 112 : 168;
    if (deck.length !== expectedCount) {
      errors.push(`Invalid deck size: expected ${expectedCount}, got ${deck.length}`);
    }

    // 2. Duplicate ID check
    const seenIds = new Set<string>();
    for (const card of deck) {
      if (seenIds.has(card.id)) {
        errors.push(`Duplicate card ID detected: ${card.id}`);
      }
      seenIds.add(card.id);
    }

    // 3. Deck isolation checks
    if (expectedDeckType === 'NORMAL') {
      const forbiddenValues: UnoValue[] = [
        'WILD_DRAW_SIX',
        'WILD_DRAW_TEN',
        'WILD_REVERSE_DRAW_FOUR',
        'WILD_COLOR_ROULETTE',
        'SKIP_EVERYONE',
        'DISCARD_ALL',
      ];
      for (const card of deck) {
        if (forbiddenValues.includes(card.value)) {
          errors.push(`Forbidden card in NORMAL deck: ${card.value} (${card.id})`);
        }
      }

      // Check required counts for NORMAL
      const shuffleHandsCount = deck.filter(c => c.value === 'SHUFFLE_HANDS').length;
      if (shuffleHandsCount !== 1) {
        errors.push(`NORMAL deck must have exactly 1 Dedicated Shuffle Hands, got ${shuffleHandsCount}`);
      }
      const customWildCount = deck.filter(c => c.value === 'CUSTOM_WILD').length;
      if (customWildCount !== 3) {
        errors.push(`NORMAL deck must have exactly 3 Custom Wilds, got ${customWildCount}`);
      }
      const normalWildCount = deck.filter(c => c.value === 'WILD' && c.color === 'WILD').length;
      if (normalWildCount !== 4) {
        errors.push(`NORMAL deck must have exactly 4 Wilds, got ${normalWildCount}`);
      }
      const normalWildD4Count = deck.filter(c => c.value === 'WILD_DRAW_FOUR').length;
      if (normalWildD4Count !== 4) {
        errors.push(`NORMAL deck must have exactly 4 Wild +4, got ${normalWildD4Count}`);
      }
    } else {
      // NO MERCY
      const forbiddenInNoMercy: UnoValue[] = ['CUSTOM_WILD', 'SHUFFLE_HANDS'];
      for (const card of deck) {
        if (forbiddenInNoMercy.includes(card.value)) {
          errors.push(`Forbidden card in NO MERCY deck: ${card.value} (${card.id})`);
        }
      }

      const drawSixCount = deck.filter(c => c.value === 'WILD_DRAW_SIX').length;
      if (drawSixCount !== 4) errors.push(`NO MERCY must have exactly 4 +6 cards, got ${drawSixCount}`);
      const drawTenCount = deck.filter(c => c.value === 'WILD_DRAW_TEN').length;
      if (drawTenCount !== 4) errors.push(`NO MERCY must have exactly 4 +10 cards, got ${drawTenCount}`);
      const revD4Count = deck.filter(c => c.value === 'WILD_REVERSE_DRAW_FOUR').length;
      if (revD4Count !== 8) errors.push(`NO MERCY must have exactly 8 Wild Reverse +4 cards, got ${revD4Count}`);
      const rouletteCount = deck.filter(c => c.value === 'WILD_COLOR_ROULETTE').length;
      if (rouletteCount !== 8) errors.push(`NO MERCY must have exactly 8 Color Roulette cards, got ${rouletteCount}`);
      const discardAllCount = deck.filter(c => c.value === 'DISCARD_ALL').length;
      if (discardAllCount !== 12) errors.push(`NO MERCY must have exactly 12 Discard All cards, got ${discardAllCount}`);
      const skipEveryoneCount = deck.filter(c => c.value === 'SKIP_EVERYONE').length;
      if (skipEveryoneCount !== 8) errors.push(`NO MERCY must have exactly 8 Skip Everyone cards, got ${skipEveryoneCount}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static isWildCard(card: UnoCard): boolean {
    return (
      card.color === 'WILD' ||
      card.value === 'WILD' ||
      card.value === 'WILD_DRAW_FOUR' ||
      card.value === 'WILD_REVERSE_DRAW_FOUR' ||
      card.value === 'WILD_DRAW_SIX' ||
      card.value === 'WILD_DRAW_TEN' ||
      card.value === 'CUSTOM_WILD' ||
      card.value === 'SHUFFLE_HANDS' ||
      card.value === 'WILD_COLOR_ROULETTE'
    );
  }

  static getDrawAmount(card: UnoCard): number {
    switch (card.value) {
      case 'DRAW_TWO':
        return 2;
      case 'DRAW_FOUR':
      case 'WILD_DRAW_FOUR':
      case 'WILD_REVERSE_DRAW_FOUR':
        return 4;
      case 'WILD_DRAW_SIX':
        return 6;
      case 'WILD_DRAW_TEN':
        return 10;
      default:
        return 0;
    }
  }

  static canPlayCard(
    card: UnoCard,
    topCard: UnoCard | null,
    activeColor: UnoColor,
    pendingDrawStack: number,
    rules: GameRules
  ): boolean {
    if (!topCard) return true;

    // Stacking rule: When an active draw stack exists, normal matching-color cards CANNOT bypass it!
    if (pendingDrawStack > 0) {
      if (!rules.stacking) return false;
      const cardDraw = this.getDrawAmount(card);
      // Only cards that contribute to the draw penalty can be stacked
      return cardDraw > 0;
    }

    // Wild cards are playable on any turn when no pending stack
    if (this.isWildCard(card)) {
      return true;
    }

    // Color match against activeColor (which handles previous wild selections)
    if (card.color === activeColor) {
      return true;
    }

    // Value match against topCard
    if (card.value === topCard.value) {
      return true;
    }

    return false;
  }

  static isCardPlayable(
    card: UnoCard,
    topCard: UnoCard | null,
    activeColor: UnoColor,
    pendingDrawStack: number,
    rules: GameRules
  ): boolean {
    return this.canPlayCard(card, topCard, activeColor, pendingDrawStack, rules);
  }

  static recycleDiscard(discardPile: UnoCard[]): { newDeck: UnoCard[]; remainingDiscard: UnoCard[] } {
    if (discardPile.length <= 1) {
      return { newDeck: [], remainingDiscard: discardPile };
    }
    const topCard = discardPile[discardPile.length - 1];
    const cardsToRecycle = discardPile.slice(0, -1);
    const shuffled = this.shuffle(cardsToRecycle);
    return {
      newDeck: shuffled,
      remainingDiscard: [topCard],
    };
  }

  static findPlayableCard(
    hand: UnoCard[],
    topCard: UnoCard | null,
    activeColor: UnoColor,
    pendingDrawStack: number,
    rules: GameRules
  ): UnoCard | null {
    // When a stack exists, must find a stacking card
    if (pendingDrawStack > 0) {
      const stackingCards = hand.filter(c => this.canPlayCard(c, topCard, activeColor, pendingDrawStack, rules));
      return stackingCards.length > 0 ? stackingCards[0] : null;
    }

    // Prefer non-wild first, then wild
    const nonWilds = hand.filter(c => !this.isWildCard(c) && this.canPlayCard(c, topCard, activeColor, pendingDrawStack, rules));
    if (nonWilds.length > 0) return nonWilds[0];
    const wilds = hand.filter(c => this.isWildCard(c) && this.canPlayCard(c, topCard, activeColor, pendingDrawStack, rules));
    if (wilds.length > 0) return wilds[0];
    return null;
  }
}
