import { UnoDeckService } from '../src/game/UnoDeckService';
import { UnoGameEngine } from '../src/game/UnoGameEngine';
import { UnoCard, Player, GameRules } from '../src/types/game';

declare const process: any;

console.log('====================================================');
console.log('UNO PARTY ENGINE & MULTIPLAYER TEST MATRIX SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] Test ${totalTests}: ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] Test ${totalTests}: ${testName}`);
    process.exitCode = 1;
  }
}

// ------------------------------------------------------------
// PART 1 & 2: NORMAL UNO TESTS
// ------------------------------------------------------------
const normalDeck = UnoDeckService.generateDeck('NORMAL');

assert(normalDeck.length === 112, `NORMAL deck generates exactly 112 cards (got ${normalDeck.length})`);

const normalZeroes = normalDeck.filter(c => c.value === '0');
assert(normalZeroes.length === 4, `NORMAL has exactly 4 zero cards (1 per color)`);

const normalNumbers1to9 = normalDeck.filter(c => ['1','2','3','4','5','6','7','8','9'].includes(c.value));
assert(normalNumbers1to9.length === 72, `NORMAL has exactly 72 1-9 number cards (2 per color)`);

const normalSkips = normalDeck.filter(c => c.value === 'SKIP');
assert(normalSkips.length === 8, `NORMAL has exactly 8 Skips (2 per color)`);

const normalReverses = normalDeck.filter(c => c.value === 'REVERSE');
assert(normalReverses.length === 8, `NORMAL has exactly 8 Reverses (2 per color)`);

const normalDrawTwos = normalDeck.filter(c => c.value === 'DRAW_TWO');
assert(normalDrawTwos.length === 8, `NORMAL has exactly 8 Draw Twos (2 per color)`);

const normalWilds = normalDeck.filter(c => c.value === 'WILD' && c.color === 'WILD');
assert(normalWilds.length === 4, `NORMAL has exactly 4 Wild cards`);

const normalWildPlusFours = normalDeck.filter(c => c.value === 'WILD_DRAW_FOUR');
assert(normalWildPlusFours.length === 4, `NORMAL has exactly 4 Wild Draw Four cards`);

const normalShuffleHands = normalDeck.filter(c => c.value === 'SHUFFLE_HANDS');
assert(normalShuffleHands.length === 1, `NORMAL has exactly 1 dedicated Shuffle Hands card`);

const normalCustomWilds = normalDeck.filter(c => c.value === 'CUSTOM_WILD');
assert(normalCustomWilds.length === 3, `NORMAL has exactly 3 Custom Wild cards`);

// Verify absence of No Mercy cards in Normal UNO
const normalPlusSix = normalDeck.filter(c => c.value === 'WILD_DRAW_SIX');
assert(normalPlusSix.length === 0, `NORMAL MUST NOT contain +6 cards`);

const normalPlusTen = normalDeck.filter(c => c.value === 'WILD_DRAW_TEN');
assert(normalPlusTen.length === 0, `NORMAL MUST NOT contain +10 cards`);

const normalRoulette = normalDeck.filter(c => c.value === 'WILD_COLOR_ROULETTE');
assert(normalRoulette.length === 0, `NORMAL MUST NOT contain Color Roulette`);

const normalDiscardAll = normalDeck.filter(c => c.value === 'DISCARD_ALL');
assert(normalDiscardAll.length === 0, `NORMAL MUST NOT contain Discard All`);

const normalSkipEveryone = normalDeck.filter(c => c.value === 'SKIP_EVERYONE');
assert(normalSkipEveryone.length === 0, `NORMAL MUST NOT contain Skip Everyone`);

const normalReverseDrawFour = normalDeck.filter(c => c.value === 'WILD_REVERSE_DRAW_FOUR');
assert(normalReverseDrawFour.length === 0, `NORMAL MUST NOT contain Wild Reverse Draw Four`);

// ------------------------------------------------------------
// PART 3 & 4: NO MERCY TESTS
// ------------------------------------------------------------
const noMercyDeck = UnoDeckService.generateDeck('NO_MERCY');

assert(noMercyDeck.length === 168, `NO MERCY deck generates exactly 168 cards (got ${noMercyDeck.length})`);

const nmNumbers = noMercyDeck.filter(c => ['0','1','2','3','4','5','6','7','8','9'].includes(c.value));
assert(nmNumbers.length === 80, `NO MERCY has exactly 80 number cards (Two complete 0-9 sets per color)`);

const nmSkips = noMercyDeck.filter(c => c.value === 'SKIP');
assert(nmSkips.length === 12, `NO MERCY has exactly 12 Skips (3 per color)`);

const nmReverses = noMercyDeck.filter(c => c.value === 'REVERSE');
assert(nmReverses.length === 12, `NO MERCY has exactly 12 Reverses (3 per color)`);

const nmDrawTwos = noMercyDeck.filter(c => c.value === 'DRAW_TWO');
assert(nmDrawTwos.length === 12, `NO MERCY has exactly 12 Draw Twos (3 per color)`);

const nmDiscardAll = noMercyDeck.filter(c => c.value === 'DISCARD_ALL');
assert(nmDiscardAll.length === 12, `NO MERCY has exactly 12 Discard All (3 per color)`);

const nmDrawFours = noMercyDeck.filter(c => c.value === 'DRAW_FOUR');
assert(nmDrawFours.length === 8, `NO MERCY has exactly 8 colored Draw Four cards (2 per color)`);

const nmSkipEveryones = noMercyDeck.filter(c => c.value === 'SKIP_EVERYONE');
assert(nmSkipEveryones.length === 8, `NO MERCY has exactly 8 colored Skip Everyone cards (2 per color)`);

const nmRoulette = noMercyDeck.filter(c => c.value === 'WILD_COLOR_ROULETTE');
assert(nmRoulette.length === 8, `NO MERCY has exactly 8 Wild Color Roulette cards`);

const nmReverseDrawFour = noMercyDeck.filter(c => c.value === 'WILD_REVERSE_DRAW_FOUR');
assert(nmReverseDrawFour.length === 8, `NO MERCY has exactly 8 Wild Reverse Draw Four cards`);

const nmDrawSix = noMercyDeck.filter(c => c.value === 'WILD_DRAW_SIX');
assert(nmDrawSix.length === 4, `NO MERCY has exactly 4 Wild Draw Six cards`);

const nmDrawTen = noMercyDeck.filter(c => c.value === 'WILD_DRAW_TEN');
assert(nmDrawTen.length === 4, `NO MERCY has exactly 4 Wild Draw Ten cards`);

// ------------------------------------------------------------
// PART 5: DRAW STACK ARITHMETIC & RULES
// ------------------------------------------------------------
const defaultRules: GameRules = {
  deckType: 'NO_MERCY',
  stacking: true,
  sevenZeroRule: true,
  jumpInRule: true,
  drawUntilPlayable: false,
  forcePlay: false,
  mercy25Cards: true,
  includeCustomWilds: true,
  soundEnabled: true,
  hapticsEnabled: true,
};

const cDraw2: UnoCard = { id: '1', color: 'RED', value: 'DRAW_TWO' };
const cDraw4: UnoCard = { id: '2', color: 'BLUE', value: 'DRAW_FOUR' };
const cDraw6: UnoCard = { id: '3', color: 'WILD', value: 'WILD_DRAW_SIX' };
const cDraw10: UnoCard = { id: '4', color: 'WILD', value: 'WILD_DRAW_TEN' };

const totalStack = UnoDeckService.getDrawAmount(cDraw2) +
  UnoDeckService.getDrawAmount(cDraw4) +
  UnoDeckService.getDrawAmount(cDraw6) +
  UnoDeckService.getDrawAmount(cDraw10);

assert(totalStack === 22, `+2 + +4 + +6 + +10 correctly equals 22 accumulated penalty (got ${totalStack})`);

// Normal matching color card CANNOT bypass active draw stack
const topCardYellowPlus2: UnoCard = { id: 'top', color: 'YELLOW', value: 'DRAW_TWO' };
const yellowZero: UnoCard = { id: 'y0', color: 'YELLOW', value: '0' };
const yellowDrawTwo: UnoCard = { id: 'yd2', color: 'YELLOW', value: 'DRAW_TWO' };

const canBypass = UnoDeckService.canPlayCard(yellowZero, topCardYellowPlus2, 'YELLOW', 2, defaultRules);
assert(canBypass === false, `Normal matching-color card (Yellow 0) CANNOT bypass active draw stack (+2)`);

const canStack = UnoDeckService.canPlayCard(yellowDrawTwo, topCardYellowPlus2, 'YELLOW', 2, defaultRules);
assert(canStack === true, `Stacking response (+2) is permitted on active draw stack`);

// ------------------------------------------------------------
// PART 6: DEDICATED SHUFFLE HANDS REDISTRIBUTION
// ------------------------------------------------------------
const testPlayers: Player[] = [
  { id: 'p1', name: 'P1', avatar: '1', isHuman: true, cardCount: 3, hand: [{ id: 'a', color: 'RED', value: '1' }, { id: 'b', color: 'RED', value: '2' }, { id: 'c', color: 'RED', value: '3' }] },
  { id: 'p2', name: 'P2', avatar: '2', isHuman: false, cardCount: 8, hand: new Array(8).fill(null).map((_, i) => ({ id: `p2_${i}`, color: 'BLUE', value: '5' })) },
  { id: 'p3', name: 'P3', avatar: '3', isHuman: false, cardCount: 5, hand: new Array(5).fill(null).map((_, i) => ({ id: `p3_${i}`, color: 'GREEN', value: '6' })) },
  { id: 'p4', name: 'P4', avatar: '4', isHuman: false, cardCount: 4, hand: new Array(4).fill(null).map((_, i) => ({ id: `p4_${i}`, color: 'YELLOW', value: '7' })) },
];

const totalCardsBefore = 3 + 8 + 5 + 4; // 20 cards
const shuffleRes = UnoGameEngine.executeShuffleAndRedealHands(testPlayers, 0, 'CW');
const totalCardsAfter = shuffleRes.updatedPlayers.reduce((acc, p) => acc + p.hand.length, 0);

assert(totalCardsAfter === totalCardsBefore, `Shuffle Hands conserves total cards in pool (20 cards)`);
// Sequential redistribution starting at next player (P2)
assert(shuffleRes.updatedPlayers[1].hand.length === 5, `P2 gets 5 cards under sequential deal of 20 cards to 4 players`);
assert(shuffleRes.updatedPlayers[0].hand.length === 5, `P1 gets 5 cards under sequential deal of 20 cards to 4 players (does not preserve original 3)`);

// ------------------------------------------------------------
// PART 7: 7 SWAP HANDS & 0 PASS HANDS
// ------------------------------------------------------------
const swapPlayers: Player[] = [
  { id: 'pA', name: 'Player A', avatar: 'A', isHuman: true, cardCount: 3, hand: new Array(3).fill(null).map((_, i) => ({ id: `a_${i}`, color: 'RED', value: '1' })) },
  { id: 'pB', name: 'Player B', avatar: 'B', isHuman: false, cardCount: 9, hand: new Array(9).fill(null).map((_, i) => ({ id: `b_${i}`, color: 'BLUE', value: '2' })) },
];

const swapRes = UnoGameEngine.executeSwapHands(swapPlayers, 'pA', 'pB');
assert(swapRes.updatedPlayers[0].hand.length === 9, `7-Swap: Player A receives Player B's entire 9 cards`);
assert(swapRes.updatedPlayers[1].hand.length === 3, `7-Swap: Player B receives Player A's entire 3 cards`);

// 0 Pass Hands: simultaneous snapshot
const passPlayers: Player[] = [
  { id: 'p1', name: 'P1', avatar: '1', isHuman: true, cardCount: 2, hand: [{ id: 'p1_1', color: 'RED', value: '1' }, { id: 'p1_2', color: 'RED', value: '2' }] },
  { id: 'p2', name: 'P2', avatar: '2', isHuman: false, cardCount: 4, hand: new Array(4).fill(null).map((_, i) => ({ id: `p2_${i}`, color: 'BLUE', value: '3' })) },
  { id: 'p3', name: 'P3', avatar: '3', isHuman: false, cardCount: 6, hand: new Array(6).fill(null).map((_, i) => ({ id: `p3_${i}`, color: 'GREEN', value: '4' })) },
];

const passRes = UnoGameEngine.executePassHandsInDirection(passPlayers, 'CW');
assert(passRes.updatedPlayers[1].hand.length === 2, `0-Pass Clockwise: P2 receives P1's hand (2 cards)`);
assert(passRes.updatedPlayers[2].hand.length === 4, `0-Pass Clockwise: P3 receives P2's hand (4 cards)`);
assert(passRes.updatedPlayers[0].hand.length === 6, `0-Pass Clockwise: P1 receives P3's hand (6 cards)`);

// ------------------------------------------------------------
// PART 8: DISCARD ALL
// ------------------------------------------------------------
const discardAllHand: UnoCard[] = [
  { id: 'c1', color: 'RED', value: '2' },
  { id: 'c2', color: 'BLUE', value: '5' },
  { id: 'c3', color: 'RED', value: '8' },
  { id: 'c4', color: 'YELLOW', value: 'SKIP' },
  { id: 'c5', color: 'RED', value: 'DRAW_TWO' },
  { id: 'c6', color: 'GREEN', value: '4' },
];

const discardAllRes = UnoGameEngine.executeDiscardAll(
  { id: 'p', name: 'P', avatar: '', isHuman: true, cardCount: 6, hand: discardAllHand },
  [],
  'RED'
);

assert(discardAllRes.discardedCount === 3, `RED DISCARD ALL discards exactly 3 red cards`);
assert(discardAllRes.updatedPlayer.hand.length === 3, `Player retains exactly the 3 non-red cards`);
assert(discardAllRes.updatedPlayer.hand.every(c => c.color !== 'RED'), `Player has 0 red cards remaining after Red Discard All`);

// ------------------------------------------------------------
// SUMMARY
// ------------------------------------------------------------
console.log(`\n====================================================`);
console.log(`RESULTS: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('====================================================\n');
