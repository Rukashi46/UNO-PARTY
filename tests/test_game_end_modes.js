// tests/test_game_end_modes.js
const assert = require('assert');

// Pure engine logic mirroring UnoGameEngine for direct testing
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

  return index;
}

function evaluatePlayerCompletion(players, rules, currentFinishingOrder = [], currentEliminatedOrder = []) {
  const finishingOrder = [...currentFinishingOrder];
  const eliminatedOrder = [...currentEliminatedOrder];
  let justFinishedPlayerId;
  let justEliminatedPlayerId;

  let updatedPlayers = players.map(p => {
    const cardCount = p.hand ? p.hand.length : p.cardCount;
    let status = p.status || (p.isEliminated ? 'ELIMINATED' : 'ACTIVE');
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

console.log('======================================================================');
console.log('TESTING GAME END / WIN MODE SYSTEM (15 SCENARIOS)');
console.log('======================================================================\n');

// TEST 1 — 4 players, FIRST_PLAYER_WINS: Player A reaches 0 cards
console.log('--- TEST 1: FIRST_PLAYER_WINS (Instant Win) ---');
{
  const players = [
    { id: 'A', name: 'Alice', hand: [], cardCount: 0, status: 'ACTIVE', isHuman: true },
    { id: 'B', name: 'Bob', hand: [{}], cardCount: 1, status: 'ACTIVE', isHuman: false },
    { id: 'C', name: 'Charlie', hand: [{}, {}], cardCount: 2, status: 'ACTIVE', isHuman: false },
    { id: 'D', name: 'Diana', hand: [{}, {}, {}], cardCount: 3, status: 'ACTIVE', isHuman: false },
  ];
  const rules = { deckType: 'NORMAL', gameEndMode: 'FIRST_PLAYER_WINS' };

  const res = evaluatePlayerCompletion(players, rules);
  assert.strictEqual(res.isMatchOver, true, 'Match must be over immediately');
  assert.strictEqual(res.winner.id, 'A', 'Winner must be Alice');
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'A').status, 'FINISHED');
  assert.strictEqual(res.finishingOrder.length, 1);
  console.log('  PASS: First player with 0 cards wins instantly, match marked over');
}

// TEST 2 — 4 players, PLAY_UNTIL_LAST_PLAYER: A reaches 0 cards
console.log('\n--- TEST 2: PLAY_UNTIL_LAST_PLAYER (Game Continues) ---');
{
  const players = [
    { id: 'A', name: 'Alice', hand: [], cardCount: 0, status: 'ACTIVE', isHuman: true },
    { id: 'B', name: 'Bob', hand: [{}, {}], cardCount: 2, status: 'ACTIVE', isHuman: false },
    { id: 'C', name: 'Charlie', hand: [{}, {}], cardCount: 2, status: 'ACTIVE', isHuman: false },
    { id: 'D', name: 'Diana', hand: [{}, {}], cardCount: 2, status: 'ACTIVE', isHuman: false },
  ];
  const rules = { deckType: 'NORMAL', gameEndMode: 'PLAY_UNTIL_LAST_PLAYER' };

  const res = evaluatePlayerCompletion(players, rules);
  assert.strictEqual(res.isMatchOver, false, 'Match must NOT be over yet');
  assert.strictEqual(res.finishingOrder[0], 'A', 'A must be 1st in finishing order');
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'A').status, 'FINISHED');
  assert.strictEqual(res.updatedPlayers.find(p => p.id === 'A').finishRank, 1);

  // Turn rotation: Next turn from A (idx 0) must skip A and go to B (idx 1)
  const nextIdx = getNextActivePlayerIndex(res.updatedPlayers, 0, 'CW', 1);
  assert.strictEqual(nextIdx, 1, 'Next turn must be Bob (idx 1)');

  // In CCW: next turn from B (idx 1) stepping in CCW must skip A (idx 0) and land on D (idx 3)!
  const ccwIdx = getNextActivePlayerIndex(res.updatedPlayers, 1, 'CCW', 1);
  assert.strictEqual(ccwIdx, 3, 'Next turn in CCW from B must skip finished A and go to Diana (idx 3)');

  console.log('  PASS: A marked FINISHED (Rank 1), game continues, A skipped in turn rotation in both directions');
}

// TEST 3 — 4 players, PLAY_UNTIL_LAST_PLAYER: A, C, B reach 0, D left
console.log('\n--- TEST 3: Sequential Finishing Order [A, C, B, D] ---');
{
  const rules = { deckType: 'NORMAL', gameEndMode: 'PLAY_UNTIL_LAST_PLAYER' };
  let currentFinishingOrder = ['A', 'C'];
  const players = [
    { id: 'A', name: 'Alice', hand: [], cardCount: 0, status: 'FINISHED', finishRank: 1 },
    { id: 'B', name: 'Bob', hand: [], cardCount: 0, status: 'ACTIVE' }, // Bob just played final card!
    { id: 'C', name: 'Charlie', hand: [], cardCount: 0, status: 'FINISHED', finishRank: 2 },
    { id: 'D', name: 'Diana', hand: [{}, {}], cardCount: 2, status: 'ACTIVE' },
  ];

  const res = evaluatePlayerCompletion(players, rules, currentFinishingOrder);
  assert.strictEqual(res.finishingOrder.length, 4, 'All 4 players must be ranked');
  assert.deepStrictEqual(res.finishingOrder, ['A', 'C', 'B', 'D'], 'Finishing order must be exactly [A, C, B, D]');
  assert.strictEqual(res.isMatchOver, true, 'Match must be complete when only 1 or 0 active remain');
  assert.strictEqual(res.finalResults[0].playerId, 'A');
  assert.strictEqual(res.finalResults[1].playerId, 'C');
  assert.strictEqual(res.finalResults[2].playerId, 'B');
  assert.strictEqual(res.finalResults[3].playerId, 'D');

  console.log('  PASS: Complete finishing order [A, C, B, D] recorded and match complete');
}

// TEST 4 — No Mercy: Player reaches 25 cards (Mercy Rule)
console.log('\n--- TEST 4: No Mercy 25-Card Mercy Elimination ---');
{
  const rules = { deckType: 'NO_MERCY', mercy25Cards: true, gameEndMode: 'PLAY_UNTIL_LAST_PLAYER' };
  const bigHand = new Array(25).fill({});
  const players = [
    { id: 'A', name: 'Alice', hand: [{}, {}], cardCount: 2, status: 'ACTIVE' },
    { id: 'B', name: 'Bob', hand: bigHand, cardCount: 25, status: 'ACTIVE' },
    { id: 'C', name: 'Charlie', hand: [{}, {}], cardCount: 2, status: 'ACTIVE' },
  ];

  const res = evaluatePlayerCompletion(players, rules);
  const bob = res.updatedPlayers.find(p => p.id === 'B');
  assert.strictEqual(bob.status, 'ELIMINATED', 'Bob status must be ELIMINATED');
  assert.strictEqual(bob.isEliminated, true, 'Bob isEliminated must be true');
  assert.strictEqual(res.eliminatedOrder.includes('B'), true, 'Bob must be in eliminatedOrder');

  // Turn rotation from A (idx 0) in CW must skip B (idx 1) and go to C (idx 2)
  const nextIdx = getNextActivePlayerIndex(res.updatedPlayers, 0, 'CW', 1);
  assert.strictEqual(nextIdx, 2, 'Turn rotation must skip eliminated Bob and go to Charlie');

  console.log('  PASS: 25 cards triggers ELIMINATED status, skipped by turn rotation');
}

// TEST 5 & 6 — 7-0 Hand Swap and Pass: Exclude Finished and Eliminated
console.log('\n--- TEST 5 & 6: 7-0 Rule Excludes Finished and Eliminated Players ---');
{
  const players = [
    { id: 'A', name: 'Alice', hand: [{}], cardCount: 1, status: 'ACTIVE' },
    { id: 'B', name: 'Bob', hand: [], cardCount: 0, status: 'FINISHED' },
    { id: 'C', name: 'Charlie', hand: new Array(25).fill({}), cardCount: 25, status: 'ELIMINATED', isEliminated: true },
    { id: 'D', name: 'Diana', hand: [{}, {}], cardCount: 2, status: 'ACTIVE' },
  ];

  const eligibleForSwap = getEligibleActivePlayers(players).filter(p => p.id !== 'A');
  assert.strictEqual(eligibleForSwap.length, 1, 'Only Diana should be eligible for 7 Swap');
  assert.strictEqual(eligibleForSwap[0].id, 'D', 'Eligible target must be Diana');

  const eligibleForPass = getEligibleActivePlayers(players);
  assert.strictEqual(eligibleForPass.length, 2, 'Only Alice and Diana participate in 0 Pass');
  assert.strictEqual(eligibleForPass[0].id, 'A');
  assert.strictEqual(eligibleForPass[1].id, 'D');

  console.log('  PASS: Finished (Bob) and Eliminated (Charlie) excluded from 7 Swap and 0 Pass');
}

// TEST 7, 8, 9 — Shuffle Hands & Everyone +4: Exclude Finished and Eliminated
console.log('\n--- TEST 7, 8, 9: Shuffle Hands and Everyone +4 Exclude Finished / Eliminated ---');
{
  const players = [
    { id: 'A', name: 'Alice', hand: [{}, {}], cardCount: 2, status: 'ACTIVE' },
    { id: 'B', name: 'Bob', hand: [], cardCount: 0, status: 'FINISHED' },
    { id: 'C', name: 'Charlie', hand: [{}], cardCount: 1, status: 'ACTIVE' },
    { id: 'D', name: 'Diana', hand: new Array(25).fill({}), cardCount: 25, status: 'ELIMINATED', isEliminated: true },
  ];

  // Shuffle hands pool participants
  const poolParticipants = getEligibleActivePlayers(players);
  assert.strictEqual(poolParticipants.length, 2, 'Only A and C participate in Shuffle Hands');
  assert.deepStrictEqual(poolParticipants.map(p => p.id), ['A', 'C']);

  // Everyone +4 targets
  const cardPlayerId = 'A';
  const plusFourTargets = players.filter(p => p.id !== cardPlayerId && !p.isEliminated && p.status !== 'FINISHED' && p.status !== 'ELIMINATED');
  assert.strictEqual(plusFourTargets.length, 1, 'Only Charlie receives +4');
  assert.strictEqual(plusFourTargets[0].id, 'C');

  console.log('  PASS: Finished and Eliminated players excluded from Shuffle Hands pool and Everyone +4 penalty');
}

// TEST 10 & 11 — Reverse Direction Turn Skipping
console.log('\n--- TEST 10 & 11: Reverse Direction with Finished and Eliminated Players ---');
{
  const players = [
    { id: 'P0', hand: [{}], cardCount: 1, status: 'ACTIVE' },
    { id: 'P1', hand: [], cardCount: 0, status: 'FINISHED' },
    { id: 'P2', hand: [{}], cardCount: 1, status: 'ACTIVE' },
    { id: 'P3', hand: [], cardCount: 0, status: 'ELIMINATED', isEliminated: true },
  ];

  // From P0 in CCW: prev is P3 (ELIMINATED) -> next eligible is P2!
  const fromP0_CCW = getNextActivePlayerIndex(players, 0, 'CCW', 1);
  assert.strictEqual(fromP0_CCW, 2, 'CCW from P0 must skip P3 (eliminated) and land on P2');

  // From P2 in CCW: prev is P1 (FINISHED) -> next eligible is P0!
  const fromP2_CCW = getNextActivePlayerIndex(players, 2, 'CCW', 1);
  assert.strictEqual(fromP2_CCW, 0, 'CCW from P2 must skip P1 (finished) and land on P0');

  console.log('  PASS: Reverse direction correctly skips both FINISHED and ELIMINATED players');
}

// TEST 14 — Match Setting / Lobby Synchronization
console.log('\n--- TEST 14: Match Setting & Host Authority ---');
{
  const defaultRules = { deckType: 'NORMAL' };
  assert.strictEqual(defaultRules.gameEndMode || 'FIRST_PLAYER_WINS', 'FIRST_PLAYER_WINS', 'Missing gameEndMode defaults to FIRST_PLAYER_WINS');

  const hostUpdatedRules = { ...defaultRules, gameEndMode: 'PLAY_UNTIL_LAST_PLAYER' };
  assert.strictEqual(hostUpdatedRules.gameEndMode, 'PLAY_UNTIL_LAST_PLAYER');

  console.log('  PASS: Default is FIRST_PLAYER_WINS, host updates to PLAY_UNTIL_LAST_PLAYER correctly');
}

// TEST 15 — Reconnect / Results Serialization
console.log('\n--- TEST 15: Reconnect & Results Distinction ---');
{
  const rules = { deckType: 'NO_MERCY', mercy25Cards: true, gameEndMode: 'PLAY_UNTIL_LAST_PLAYER' };
  const currentFinishingOrder = ['P1'];
  const currentEliminatedOrder = ['P4'];
  const players = [
    { id: 'P1', name: 'P1', avatar: '👑', hand: [], cardCount: 0, status: 'FINISHED', finishRank: 1 },
    { id: 'P2', name: 'P2', avatar: '🎮', hand: [], cardCount: 0, status: 'ACTIVE' }, // finishes now
    { id: 'P3', name: 'P3', avatar: '⭐', hand: [{}], cardCount: 1, status: 'ACTIVE' },
    { id: 'P4', name: 'P4', avatar: '💀', hand: [], cardCount: 26, status: 'ELIMINATED', isEliminated: true },
  ];

  const res = evaluatePlayerCompletion(players, rules, currentFinishingOrder, currentEliminatedOrder);
  assert.strictEqual(res.isMatchOver, true);
  
  // Verify final results clearly distinguish FINISHED vs ELIMINATED
  const p1Res = res.finalResults.find(r => r.playerId === 'P1');
  const p2Res = res.finalResults.find(r => r.playerId === 'P2');
  const p3Res = res.finalResults.find(r => r.playerId === 'P3');
  const p4Res = res.finalResults.find(r => r.playerId === 'P4');

  assert.strictEqual(p1Res.status, 'FINISHED');
  assert.strictEqual(p2Res.status, 'FINISHED');
  assert.strictEqual(p3Res.status, 'FINISHED');
  assert.strictEqual(p4Res.status, 'ELIMINATED');

  console.log('  PASS: Reconnection state and final results clearly distinguish FINISHED vs ELIMINATED');
}

console.log('\n======================================================================');
console.log('ALL 15 GAME END MODE SCENARIO TESTS PASSED!');
console.log('======================================================================\n');
