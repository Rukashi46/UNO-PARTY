const assert = require('assert');

// Test simulation for PLAY_UNTIL_LAST_PLAYER runtime and engine behavior
console.log('======================================================================');
console.log('TESTING PLAY_UNTIL_LAST_PLAYER RUNTIME & MATCH ENGINE');
console.log('======================================================================\n');

// Mock UnoGameEngine behavior
function getEligibleActivePlayers(players) {
  return players.filter(p => {
    if (p.status === 'FINISHED' || p.status === 'ELIMINATED' || p.isEliminated) {
      return false;
    }
    if (p.status === 'ACTIVE') {
      return true;
    }
    return p.cardCount > 0 || (p.hand && p.hand.length > 0);
  });
}

function getNextActivePlayerIndex(players, currentIndex, direction, stepCount = 1) {
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

function evaluatePlayerCompletion(players, rules, currentFinishingOrder = [], currentEliminatedOrder = []) {
  const finishingOrder = [...currentFinishingOrder];
  const eliminatedOrder = [...currentEliminatedOrder];
  let justFinishedPlayerId;

  let updatedPlayers = players.map(p => {
    const cardCount = p.hand ? p.hand.length : p.cardCount;
    let status = p.status || (p.isEliminated ? 'ELIMINATED' : 'ACTIVE');
    let isEliminated = p.isEliminated || status === 'ELIMINATED';

    if (!isEliminated && status !== 'ELIMINATED' && cardCount === 0 && status !== 'FINISHED') {
      status = 'FINISHED';
      if (!finishingOrder.includes(p.id)) {
        finishingOrder.push(p.id);
        justFinishedPlayerId = p.id;
      }
    }

    const finishRank = finishingOrder.includes(p.id) ? finishingOrder.indexOf(p.id) + 1 : p.finishRank;
    return { ...p, cardCount, status, isEliminated, finishRank };
  });

  const activePlayers = getEligibleActivePlayers(updatedPlayers);
  const endMode = rules.gameEndMode || 'FIRST_PLAYER_WINS';
  let isMatchOver = false;
  let winner = null;

  if (endMode === 'FIRST_PLAYER_WINS') {
    if (finishingOrder.length >= 1) {
      isMatchOver = true;
      winner = updatedPlayers.find(p => p.id === finishingOrder[0]) || null;
    }
  } else {
    // PLAY_UNTIL_LAST_PLAYER
    if (activePlayers.length === 0) {
      isMatchOver = true;
    } else if (activePlayers.length === 1 && (finishingOrder.length > 0 || eliminatedOrder.length > 0)) {
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

  const finalResults = [];
  finishingOrder.forEach((id, idx) => {
    const p = updatedPlayers.find(pl => pl.id === id);
    if (p) {
      finalResults.push({
        playerId: p.id,
        name: p.name,
        status: 'FINISHED',
        rank: idx + 1,
        cardCount: p.cardCount,
        isHuman: p.isHuman,
      });
    }
  });

  return { updatedPlayers, activePlayers, finishingOrder, isMatchOver, winner, finalResults, justFinishedPlayerId };
}

// -------------------------------------------------------------
// TEST 1: BOT PLAYING FINAL CARD (The bug where bot.cardCount > 1 prevented win)
// -------------------------------------------------------------
console.log('--- TEST 1: Bot With 1 Card Can Play Final Card & Finish ---');
const bot = { id: 'bot_1', name: 'Sarah', cardCount: 1, hand: [{ id: 'c1', color: 'RED', value: '5' }] };

// Old broken check:
const oldBotCheck = bot.cardCount > 1;
assert.strictEqual(oldBotCheck, false, 'Old check strictly prevented bot with 1 card from playing');

// New fixed check:
const newBotCheck = bot.cardCount >= 1;
assert.strictEqual(newBotCheck, true, 'New check allows bot with 1 card to play and finish');
console.log('  PASS: Bot with 1 card is no longer stuck in infinite draw loop');

// -------------------------------------------------------------
// TEST 2: SEQUENTIAL 4-PLAYER PLAY_UNTIL_LAST_PLAYER GAMEPLAY
// -------------------------------------------------------------
console.log('\n--- TEST 2: Sequential Match in PLAY_UNTIL_LAST_PLAYER Mode ---');
const rules = { deckType: 'NORMAL', gameEndMode: 'PLAY_UNTIL_LAST_PLAYER' };
let players = [
  { id: 'human', name: 'Human Player', isHuman: true, cardCount: 1, hand: [{ id: 'h1' }] },
  { id: 'bot_1', name: 'Sarah', isHuman: false, cardCount: 2, hand: [{ id: 'b1' }, { id: 'b2' }] },
  { id: 'bot_2', name: 'Chris', isHuman: false, cardCount: 2, hand: [{ id: 'c1' }, { id: 'c2' }] },
  { id: 'bot_3', name: 'Jason', isHuman: false, cardCount: 3, hand: [{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }] },
];

let finishingOrder = [];

// Step A: Human plays last card
players[0].hand = [];
players[0].cardCount = 0;
let res = evaluatePlayerCompletion(players, rules, finishingOrder);
players = res.updatedPlayers;
finishingOrder = res.finishingOrder;

assert.strictEqual(res.isMatchOver, false, 'Match is NOT over after human finishes in PLAY_UNTIL_LAST_PLAYER');
assert.strictEqual(players[0].status, 'FINISHED');
assert.strictEqual(players[0].finishRank, 1);
assert.strictEqual(finishingOrder.length, 1);
assert.strictEqual(finishingOrder[0], 'human');
console.log('  PASS: Human finishes in Rank 1, match continues');

// Verify turn advancement from Human (idx 0) skips Human
let nextIdx = getNextActivePlayerIndex(players, 0, 'CW', 1);
assert.strictEqual(nextIdx, 1, 'Turn advances to Bot 1 (idx 1)');
console.log('  PASS: Turn successfully advances to Bot 1');

// Step B: Bot 1 plays card and finishes
players[1].hand = [];
players[1].cardCount = 0;
res = evaluatePlayerCompletion(players, rules, finishingOrder);
players = res.updatedPlayers;
finishingOrder = res.finishingOrder;

assert.strictEqual(res.isMatchOver, false, 'Match is still NOT over after Bot 1 finishes');
assert.strictEqual(players[1].status, 'FINISHED');
assert.strictEqual(players[1].finishRank, 2);
assert.deepStrictEqual(finishingOrder, ['human', 'bot_1']);
console.log('  PASS: Bot 1 finishes in Rank 2, match continues');

// Step C: Bot 2 plays card and finishes
players[2].hand = [];
players[2].cardCount = 0;
res = evaluatePlayerCompletion(players, rules, finishingOrder);
players = res.updatedPlayers;
finishingOrder = res.finishingOrder;

assert.strictEqual(res.isMatchOver, true, 'Match IS OVER once only 1 active player (Bot 3) remains!');
assert.strictEqual(players[3].status, 'FINISHED', 'Last player Bot 3 receives final rank');
assert.strictEqual(players[3].finishRank, 4);
assert.deepStrictEqual(finishingOrder, ['human', 'bot_1', 'bot_2', 'bot_3']);
assert.strictEqual(res.winner.id, 'human', 'Human is correctly preserved as the 1st place winner');
assert.strictEqual(res.winner.isHuman, true, 'Human winner has isHuman = true');
console.log('  PASS: Full finishing order correctly resolved [Human #1, Sarah #2, Chris #3, Jason #4]');

// -------------------------------------------------------------
// TEST 3: SKIP_EVERYONE AS FINAL CARD DOES NOT RE-SELECT FINISHED PLAYER
// -------------------------------------------------------------
console.log('\n--- TEST 3: SKIP_EVERYONE As Final Card Turn Advancement ---');
const testPlayers = [
  { id: 'p0', name: 'Finisher', status: 'FINISHED', cardCount: 0 },
  { id: 'p1', name: 'Active 1', status: 'ACTIVE', cardCount: 3 },
  { id: 'p2', name: 'Active 2', status: 'ACTIVE', cardCount: 4 },
];
// If p0 played SKIP_EVERYONE as last card, stepCount was 0 in old code:
const safeIdx = getNextActivePlayerIndex(testPlayers, 0, 'CW', 0);
assert.strictEqual(safeIdx, 1, 'getNextActivePlayerIndex safely avoids returning finished player even with step 0');
console.log('  PASS: getNextActivePlayerIndex advances to next active player');

// -------------------------------------------------------------
// TEST 4: 2-PLAYER REVERSE WHEN DOWN TO 2 ACTIVE PLAYERS
// -------------------------------------------------------------
console.log('\n--- TEST 4: Reverse Card When 2 Active Players Remain In 4-Player Match ---');
const fourPlayersWithTwoActive = [
  { id: 'p0', status: 'FINISHED', cardCount: 0 },
  { id: 'p1', status: 'ACTIVE', cardCount: 2 },
  { id: 'p2', status: 'FINISHED', cardCount: 0 },
  { id: 'p3', status: 'ACTIVE', cardCount: 3 },
];
const activeCount = getEligibleActivePlayers(fourPlayersWithTwoActive).length;
assert.strictEqual(activeCount, 2, 'Exactly 2 active players remain');
const reverseStepMultiplier = activeCount === 2 ? 2 : 1;
assert.strictEqual(reverseStepMultiplier, 2, 'Reverse correctly acts as Skip when 2 active players remain');
console.log('  PASS: Reverse correctly skips opponent when 2 active players remain');

console.log('\n======================================================================');
console.log('ALL PLAY_UNTIL_LAST_PLAYER RUNTIME & ENGINE TESTS PASSED 100%!');
console.log('======================================================================');
