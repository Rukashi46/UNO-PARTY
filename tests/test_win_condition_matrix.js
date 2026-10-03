const assert = require('assert');

// Exact copy of UnoGameEngine logic
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

  const selected = players[index];
  const isSelectedEligible =
    selected &&
    !selected.isEliminated &&
    selected.status !== 'FINISHED' &&
    selected.status !== 'ELIMINATED' &&
    (selected.status === 'ACTIVE' || selected.cardCount > 0 || (selected.hand && selected.hand.length > 0));

  if (!isSelectedEligible) {
    const firstEligibleIdx = players.findIndex(
      p =>
        !p.isEliminated &&
        p.status !== 'FINISHED' &&
        p.status !== 'ELIMINATED' &&
        (p.status === 'ACTIVE' || p.cardCount > 0 || (p.hand && p.hand.length > 0))
    );
    if (firstEligibleIdx !== -1) {
      return firstEligibleIdx;
    }
  }

  return index;
}

function evaluatePlayerCompletion(players, rules, currentFinishingOrder = [], currentEliminatedOrder = []) {
  const finishingOrder = [...currentFinishingOrder];
  const eliminatedOrder = [...currentEliminatedOrder];
  let justFinishedPlayerId;
  let justEliminatedPlayerId;

  let updatedPlayers = players.map(p => {
    // In multiplayer, remote players' hands are private and hidden (p.hand is dummy [] while p.cardCount > 0).
    const cardCount = (p.controller === 'REMOTE_HUMAN' || (p.cardCount && p.cardCount > 0 && (!p.hand || p.hand.length === 0)))
      ? (p.cardCount ?? 0)
      : (p.hand ? p.hand.length : (p.cardCount ?? 0));
    let status = p.status || (p.isEliminated ? 'ELIMINATED' : 'ACTIVE');
    let isEliminated = p.isEliminated || status === 'ELIMINATED';

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

  const activePlayers = getEligibleActivePlayers(updatedPlayers);
  const endMode = rules.gameEndMode || 'FIRST_PLAYER_WINS';
  let isMatchOver = false;
  let winner = null;

  if (endMode === 'FIRST_PLAYER_WINS') {
    if (finishingOrder.length >= 1) {
      isMatchOver = true;
      winner = updatedPlayers.find(p => p.id === finishingOrder[0]) || null;
    } else if (rules.deckType === 'NO_MERCY' && activePlayers.length === 1 && updatedPlayers.length > 1) {
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

console.log('=== RUNNING WIN CONDITION & MULTIPLAYER TESTS ===\n');

// -------------------------------------------------------------
// TEST 1: 7 cards -> play 1 -> 6 cards
// Expected: status = ACTIVE, no win, finishRank = undefined, isMatchOver = false
// -------------------------------------------------------------
console.log('[TEST 1] 7 cards -> play 1 card (6 cards remaining)');
const p1_t1 = { id: 'host', name: 'Host', hand: [1,2,3,4,5,6], cardCount: 6, status: 'ACTIVE', controller: 'LOCAL_HUMAN' };
const p2_t1 = { id: 'client', name: 'Client', hand: [], cardCount: 7, status: 'ACTIVE', controller: 'REMOTE_HUMAN' };
const res1 = evaluatePlayerCompletion([p1_t1, p2_t1], { gameEndMode: 'FIRST_PLAYER_WINS', deckType: 'NORMAL' }, [], []);

assert.strictEqual(res1.isMatchOver, false, 'Match must NOT be over when player has 6 cards');
assert.strictEqual(res1.winner, null, 'Winner must be null when player has 6 cards');
assert.strictEqual(res1.updatedPlayers[0].status, 'ACTIVE', 'Host status must remain ACTIVE');
assert.strictEqual(res1.updatedPlayers[0].cardCount, 6, 'Host card count must be 6');
assert.strictEqual(res1.updatedPlayers[1].status, 'ACTIVE', 'Client status must remain ACTIVE');
assert.strictEqual(res1.finishingOrder.length, 0, 'Finishing order must be empty');
console.log('  PASSED: 7 -> 6 cards does NOT trigger win, player remains ACTIVE\n');

// -------------------------------------------------------------
// TEST 2: 2 cards -> play 1 -> 1 card
// Expected: status = ACTIVE, no win, finishRank = undefined, isMatchOver = false
// -------------------------------------------------------------
console.log('[TEST 2] 2 cards -> play 1 card (1 card remaining)');
const p1_t2 = { id: 'host', name: 'Host', hand: [1], cardCount: 1, status: 'ACTIVE', controller: 'LOCAL_HUMAN' };
const p2_t2 = { id: 'client', name: 'Client', hand: [], cardCount: 5, status: 'ACTIVE', controller: 'REMOTE_HUMAN' };
const res2 = evaluatePlayerCompletion([p1_t2, p2_t2], { gameEndMode: 'FIRST_PLAYER_WINS', deckType: 'NORMAL' }, [], []);

assert.strictEqual(res2.isMatchOver, false, 'Match must NOT be over when player has 1 card');
assert.strictEqual(res2.winner, null, 'Winner must be null when player has 1 card');
assert.strictEqual(res2.updatedPlayers[0].status, 'ACTIVE', 'Host status must remain ACTIVE');
assert.strictEqual(res2.finishingOrder.length, 0, 'Finishing order must be empty');
console.log('  PASSED: 2 -> 1 card does NOT trigger win, player remains ACTIVE\n');

// -------------------------------------------------------------
// TEST 3: 1 card -> play 1 -> 0 cards (FIRST_PLAYER_WINS)
// Expected: status = FINISHED, winner assigned, isMatchOver = true
// -------------------------------------------------------------
console.log('[TEST 3] 1 card -> play 1 card (0 cards) [FIRST_PLAYER_WINS]');
const p1_t3 = { id: 'host', name: 'Host', hand: [], cardCount: 0, status: 'ACTIVE', controller: 'LOCAL_HUMAN' };
const p2_t3 = { id: 'client', name: 'Client', hand: [], cardCount: 4, status: 'ACTIVE', controller: 'REMOTE_HUMAN' };
const res3 = evaluatePlayerCompletion([p1_t3, p2_t3], { gameEndMode: 'FIRST_PLAYER_WINS', deckType: 'NORMAL' }, [], []);

assert.strictEqual(res3.isMatchOver, true, 'Match MUST be over when first player has 0 cards');
assert.strictEqual(res3.winner.id, 'host', 'Host MUST be the winner');
assert.strictEqual(res3.updatedPlayers[0].status, 'FINISHED', 'Host status must be FINISHED');
assert.strictEqual(res3.updatedPlayers[0].finishRank, 1, 'Host finishRank must be 1');
assert.deepStrictEqual(res3.finishingOrder, ['host'], 'Finishing order must contain host');
console.log('  PASSED: 1 -> 0 cards in FIRST_PLAYER_WINS ends match and assigns winner\n');

// -------------------------------------------------------------
// TEST 4: 1 card -> play 1 -> 0 cards (PLAY_UNTIL_LAST_PLAYER)
// Expected: Player finishes with rank 1, BUT match continues if >1 active players remain
// -------------------------------------------------------------
console.log('[TEST 4] 1 card -> play 1 card (0 cards) [PLAY_UNTIL_LAST_PLAYER with 3 players]');
const pA_t4 = { id: 'A', name: 'Player A', hand: [], cardCount: 0, status: 'ACTIVE', controller: 'LOCAL_HUMAN' };
const pB_t4 = { id: 'B', name: 'Player B', hand: [], cardCount: 3, status: 'ACTIVE', controller: 'REMOTE_HUMAN' };
const pC_t4 = { id: 'C', name: 'Player C', hand: [], cardCount: 5, status: 'ACTIVE', controller: 'REMOTE_HUMAN' };
const res4 = evaluatePlayerCompletion([pA_t4, pB_t4, pC_t4], { gameEndMode: 'PLAY_UNTIL_LAST_PLAYER', deckType: 'NORMAL' }, [], []);

assert.strictEqual(res4.isMatchOver, false, 'Match must NOT be over while 2 active players remain');
assert.strictEqual(res4.updatedPlayers[0].status, 'FINISHED', 'Player A status must be FINISHED');
assert.strictEqual(res4.updatedPlayers[0].finishRank, 1, 'Player A finishRank must be 1');
assert.strictEqual(res4.updatedPlayers[1].status, 'ACTIVE', 'Player B must remain ACTIVE');
assert.strictEqual(res4.updatedPlayers[2].status, 'ACTIVE', 'Player C must remain ACTIVE');
assert.strictEqual(res4.justFinishedPlayerId, 'A', 'justFinishedPlayerId must be A');
console.log('  PASSED: In PLAY_UNTIL_LAST_PLAYER, first 0-card player finishes at rank 1 and game continues\n');

// -------------------------------------------------------------
// TEST 5: Exclude FINISHED players from turn rotation
// -------------------------------------------------------------
console.log('[TEST 5] Turn rotation excludes FINISHED players');
const players_t5 = [
  { id: 'A', name: 'Player A', status: 'FINISHED', cardCount: 0, isEliminated: false },
  { id: 'B', name: 'Player B', status: 'ACTIVE', cardCount: 3, isEliminated: false },
  { id: 'C', name: 'Player C', status: 'ACTIVE', cardCount: 5, isEliminated: false },
];

const nextTurnFromA = getNextActivePlayerIndex(players_t5, 0, 'CW', 1);
assert.strictEqual(nextTurnFromA, 1, 'Turn from finished A must advance to active B (index 1)');

const nextTurnFromB = getNextActivePlayerIndex(players_t5, 1, 'CW', 1);
assert.strictEqual(nextTurnFromB, 2, 'Turn from active B must advance to active C (index 2)');

const nextTurnFromC = getNextActivePlayerIndex(players_t5, 2, 'CW', 1);
assert.strictEqual(nextTurnFromC, 1, 'Turn from active C must skip finished A and wrap to active B (index 1)');
console.log('  PASSED: Finished players are completely excluded from turn rotation\n');

// -------------------------------------------------------------
// TEST 6: B finishes second, C takes final rank 3
// -------------------------------------------------------------
console.log('[TEST 6] B finishes, C takes final rank [PLAY_UNTIL_LAST_PLAYER]');
const players_t6 = [
  { id: 'A', name: 'Player A', status: 'FINISHED', finishRank: 1, cardCount: 0, isEliminated: false },
  { id: 'B', name: 'Player B', status: 'ACTIVE', hand: [], cardCount: 0, isEliminated: false },
  { id: 'C', name: 'Player C', status: 'ACTIVE', cardCount: 2, isEliminated: false },
];
const res6 = evaluatePlayerCompletion(players_t6, { gameEndMode: 'PLAY_UNTIL_LAST_PLAYER', deckType: 'NORMAL' }, ['A'], []);

assert.strictEqual(res6.isMatchOver, true, 'Match must be over when only 1 active player remains');
assert.strictEqual(res6.updatedPlayers[0].finishRank, 1, 'Player A rank must be 1');
assert.strictEqual(res6.updatedPlayers[1].finishRank, 2, 'Player B rank must be 2');
assert.strictEqual(res6.updatedPlayers[2].finishRank, 3, 'Player C (last standing) must receive rank 3');
assert.deepStrictEqual(res6.finishingOrder, ['A', 'B', 'C'], 'Finishing order must be [A, B, C]');
console.log('  PASSED: PLAY_UNTIL_LAST_PLAYER properly assigns ranks 1, 2, 3 and ends match\n');

// -------------------------------------------------------------
// TEST 7: Drawing cards cannot trigger false win
// -------------------------------------------------------------
console.log('[TEST 7] Drawing cards cannot trigger false win');
const p1_t7 = { id: 'host', name: 'Host', hand: [1,2,3,4,5,6,7,8], cardCount: 8, status: 'ACTIVE', controller: 'LOCAL_HUMAN' };
const p2_t7 = { id: 'client', name: 'Client', hand: [], cardCount: 7, status: 'ACTIVE', controller: 'REMOTE_HUMAN' };
const res7 = evaluatePlayerCompletion([p1_t7, p2_t7], { gameEndMode: 'FIRST_PLAYER_WINS', deckType: 'NORMAL' }, [], []);

assert.strictEqual(res7.isMatchOver, false, 'Drawing must never trigger win');
assert.strictEqual(res7.winner, null, 'Winner must be null');
console.log('  PASSED: Drawing cards does not trigger false win\n');

console.log('ALL 7 WIN CONDITION AND MULTIPLAYER TESTS PASSED PERFECTLY!');
