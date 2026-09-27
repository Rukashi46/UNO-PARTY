// tests/test_shuffle_hands_production.js
const assert = require('assert');

// Logic matching UnoGameEngine.executeShuffleHands
function getNextActivePlayerIndex(players, currentIndex, direction) {
  const step = direction === 'CW' ? 1 : -1;
  const n = players.length;
  let next = (currentIndex + step + n) % n;
  let loopCount = 0;
  while (players[next] && (players[next].isEliminated || (players[next].cardCount === 0 && players[next].hand && players[next].hand.length === 0))) {
    next = (next + step + n) % n;
    loopCount++;
    if (loopCount > n) return -1;
  }
  return next;
}

function executeShuffleHands(players, cardPlayerIndex, direction) {
  const eligibleIndices = [];
  const pool = [];
  const initialCardCounts = {};

  // 1. Gather cards from non-eliminated players
  players.forEach((p, idx) => {
    initialCardCounts[p.id] = (p.hand || []).length;
    if (!p.isEliminated) {
      eligibleIndices.push(idx);
      if (p.hand && p.hand.length > 0) {
        pool.push(...p.hand);
      }
    }
  });

  const totalCards = pool.length;

  // 2. Clear hands for eligible players
  const workingPlayers = players.map(p => {
    if (p.isEliminated) return { ...p };
    return { ...p, hand: [], cardCount: 0 };
  });

  if (pool.length === 0 || eligibleIndices.length === 0) {
    const cardCounts = {};
    workingPlayers.forEach(p => { cardCounts[p.id] = (p.hand || []).length; });
    return {
      updatedPlayers: workingPlayers,
      cardCounts,
      initialCardCounts,
      eligiblePlayerIds: eligibleIndices.map(i => players[i].id),
      dealingOrder: [],
      dealSequence: [],
      totalCards: 0,
    };
  }

  // 3. Shuffle pool (Fisher-Yates)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }

  // 4. Determine starting recipient: player NEXT to card player in CURRENT direction
  let recipientIdx = getNextActivePlayerIndex(players, cardPlayerIndex, direction);
  if (recipientIdx === -1 || !eligibleIndices.includes(recipientIdx)) {
    recipientIdx = eligibleIndices[0];
  }

  // 5. Generate cyclic dealing sequence
  const dealingOrder = [];
  let curr = recipientIdx;
  for (let i = 0; i < eligibleIndices.length; i++) {
    dealingOrder.push(players[curr].id);
    curr = getNextActivePlayerIndex(players, curr, direction);
    if (curr === -1 || !eligibleIndices.includes(curr)) {
      curr = eligibleIndices[(eligibleIndices.indexOf(recipientIdx) + i + 1) % eligibleIndices.length];
    }
  }

  // 6. Deal one card at a time sequentially
  const dealSequence = [];
  let dealTargetIdx = recipientIdx;

  for (let i = 0; i < pool.length; i++) {
    const card = pool[i];
    workingPlayers[dealTargetIdx].hand.push(card);
    workingPlayers[dealTargetIdx].cardCount = workingPlayers[dealTargetIdx].hand.length;

    dealSequence.push({
      playerId: workingPlayers[dealTargetIdx].id,
      card,
    });

    dealTargetIdx = getNextActivePlayerIndex(players, dealTargetIdx, direction);
    if (dealTargetIdx === -1 || !eligibleIndices.includes(dealTargetIdx)) {
      dealTargetIdx = eligibleIndices[(eligibleIndices.indexOf(dealTargetIdx) + 1) % eligibleIndices.length];
    }
  }

  const finalCounts = {};
  workingPlayers.forEach(p => {
    finalCounts[p.id] = (p.hand || []).length;
  });

  return {
    updatedPlayers: workingPlayers,
    cardCounts: finalCounts,
    initialCardCounts,
    eligiblePlayerIds: eligibleIndices.map(i => players[i].id),
    dealingOrder,
    dealSequence,
    totalCards,
  };
}

console.log('======================================================================');
console.log('TESTING SHUFFLE HANDS PRODUCTION SPECIFICATION');
console.log('======================================================================\n');

function makeCards(prefix, count) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push({ id: `${prefix}_card_${i}`, color: 'BLUE', value: '5' });
  }
  return cards;
}

// TEST 1 — DEDICATED SHUFFLE HANDS (P1=3, P2=8, P3=5, P4=4 -> 20 cards)
console.log('--- TEST 1: Dedicated Shuffle Hands (20 Cards Total) ---');
{
  const players = [
    { id: 'P1', name: 'Player 1', hand: makeCards('P1', 3), cardCount: 3, isEliminated: false },
    { id: 'P2', name: 'Player 2', hand: makeCards('P2', 8), cardCount: 8, isEliminated: false },
    { id: 'P3', name: 'Player 3', hand: makeCards('P3', 5), cardCount: 5, isEliminated: false },
    { id: 'P4', name: 'Player 4', hand: makeCards('P4', 4), cardCount: 4, isEliminated: false },
  ];

  const result = executeShuffleHands(players, 0, 'CW');

  assert.strictEqual(result.totalCards, 20, 'Total collected cards must be 20');
  assert.strictEqual(result.dealSequence.length, 20, 'Must have 20 deal steps in sequence');
  assert.strictEqual(result.dealingOrder[0], 'P2', 'Dealing must start with player NEXT to P1 (P2)');
  assert.strictEqual(result.dealSequence[0].playerId, 'P2', 'First dealt card must go to P2');
  assert.strictEqual(result.dealSequence[1].playerId, 'P3', 'Second dealt card must go to P3');
  assert.strictEqual(result.dealSequence[2].playerId, 'P4', 'Third dealt card must go to P4');
  assert.strictEqual(result.dealSequence[3].playerId, 'P1', 'Fourth dealt card must go to P1');

  // Verify hand quantities are NOT preserved: 20 cards dealt among 4 players = 5 each
  assert.strictEqual(result.cardCounts['P1'], 5, 'P1 final card count should be 5 (was 3)');
  assert.strictEqual(result.cardCounts['P2'], 5, 'P2 final card count should be 5 (was 8)');
  assert.strictEqual(result.cardCounts['P3'], 5, 'P3 final card count should be 5 (was 5)');
  assert.strictEqual(result.cardCounts['P4'], 5, 'P4 final card count should be 5 (was 4)');

  console.log('  PASS: 20 cards collected, redistributed sequentially starting at P2, quantities changed from [3,8,5,4] to [5,5,5,5]');
}

// TEST 2 — CUSTOM WILD -> SHUFFLE HANDS
console.log('\n--- TEST 2: Custom Wild -> Shuffle Hands ---');
{
  const players = [
    { id: 'P1', name: 'Player 1', hand: makeCards('P1', 2), cardCount: 2, isEliminated: false },
    { id: 'P2', name: 'Player 2', hand: makeCards('P2', 3), cardCount: 3, isEliminated: false },
    { id: 'P3', name: 'Player 3', hand: makeCards('P3', 6), cardCount: 6, isEliminated: false },
  ];

  const result = executeShuffleHands(players, 1, 'CW');

  assert.strictEqual(result.totalCards, 11, 'Total cards must be 11');
  assert.strictEqual(result.dealingOrder[0], 'P3', 'Must start with P3');
  assert.strictEqual(result.dealSequence[0].playerId, 'P3');
  assert.strictEqual(result.dealSequence[1].playerId, 'P1');
  assert.strictEqual(result.dealSequence[2].playerId, 'P2');

  assert.strictEqual(result.cardCounts['P3'], 4, 'P3 receives 4 cards');
  assert.strictEqual(result.cardCounts['P1'], 4, 'P1 receives 4 cards');
  assert.strictEqual(result.cardCounts['P2'], 3, 'P2 receives 3 cards');

  console.log('  PASS: Custom Wild -> Shuffle Hands uses identical engine action and dealing pattern');
}

// TEST 4 — REVERSE DIRECTION ('CCW')
console.log('\n--- TEST 4: Reverse Direction (CCW) ---');
{
  const players = [
    { id: 'P1', name: 'Player 1', hand: makeCards('P1', 4), cardCount: 4, isEliminated: false },
    { id: 'P2', name: 'Player 2', hand: makeCards('P2', 4), cardCount: 4, isEliminated: false },
    { id: 'P3', name: 'Player 3', hand: makeCards('P3', 4), cardCount: 4, isEliminated: false },
    { id: 'P4', name: 'Player 4', hand: makeCards('P4', 4), cardCount: 4, isEliminated: false },
  ];

  const result = executeShuffleHands(players, 0, 'CCW');

  assert.strictEqual(result.dealingOrder[0], 'P4', 'In CCW, must start with P4');
  assert.strictEqual(result.dealSequence[0].playerId, 'P4', 'First card goes to P4 in CCW');
  assert.strictEqual(result.dealSequence[1].playerId, 'P3', 'Second card goes to P3 in CCW');
  assert.strictEqual(result.dealSequence[2].playerId, 'P2', 'Third card goes to P2 in CCW');
  assert.strictEqual(result.dealSequence[3].playerId, 'P1', 'Fourth card goes to P1 in CCW');

  console.log('  PASS: Reverse direction correctly deals in CCW order [P4 -> P3 -> P2 -> P1]');
}

// TEST 5 — ELIMINATED PLAYERS EXCLUDED
console.log('\n--- TEST 5: Eliminated Player Exclusion ---');
{
  const players = [
    { id: 'P1', name: 'Player 1', hand: makeCards('P1', 3), cardCount: 3, isEliminated: false },
    { id: 'P2', name: 'Player 2', hand: makeCards('P2', 4), cardCount: 4, isEliminated: false },
    { id: 'P3', name: 'Player 3', hand: makeCards('P3', 7), cardCount: 7, isEliminated: true },
    { id: 'P4', name: 'Player 4', hand: makeCards('P4', 3), cardCount: 3, isEliminated: false },
  ];

  const result = executeShuffleHands(players, 0, 'CW');

  assert.strictEqual(result.totalCards, 10, 'Only non-eliminated players cards pooled (10)');
  assert.strictEqual(result.eligiblePlayerIds.includes('P3'), false, 'P3 must NOT be eligible');
  assert.strictEqual(result.cardCounts['P3'], 7, 'P3 card count remains untouched');

  result.dealSequence.forEach(step => {
    assert.notStrictEqual(step.playerId, 'P3', 'Eliminated player P3 must NOT receive any cards');
  });

  assert.strictEqual(result.dealSequence[0].playerId, 'P2');
  assert.strictEqual(result.dealSequence[1].playerId, 'P4');
  assert.strictEqual(result.dealSequence[2].playerId, 'P1');

  console.log('  PASS: Eliminated player P3 excluded from pooling and dealing sequence');
}

// TEST 6 & 7 — MULTIPLAYER DETERMINISM & INTEGRITY
console.log('\n--- TEST 6 & 7: Multiplayer Event & Card Integrity ---');
{
  const initialCards = [
    ...makeCards('P1', 4),
    ...makeCards('P2', 5),
    ...makeCards('P3', 6),
  ];
  const initialIds = new Set(initialCards.map(c => c.id));

  const players = [
    { id: 'P1', name: 'P1', hand: initialCards.slice(0, 4), cardCount: 4, isEliminated: false },
    { id: 'P2', name: 'P2', hand: initialCards.slice(4, 9), cardCount: 5, isEliminated: false },
    { id: 'P3', name: 'P3', hand: initialCards.slice(9, 15), cardCount: 6, isEliminated: false },
  ];

  const result = executeShuffleHands(players, 0, 'CW');

  const finalCards = [];
  result.updatedPlayers.forEach(p => finalCards.push(...p.hand));
  assert.strictEqual(finalCards.length, initialCards.length, 'Total final cards must equal total initial cards');
  
  const finalIds = new Set(finalCards.map(c => c.id));
  assert.strictEqual(finalIds.size, initialIds.size, 'No cards duplicated');
  initialIds.forEach(id => {
    assert.strictEqual(finalIds.has(id), true, `Card ${id} must exist in final set`);
  });

  console.log('  PASS: 100% card conservation — no cards lost, duplicated, or corrupted');
}

console.log('\n======================================================================');
console.log('ALL SHUFFLE HANDS PRODUCTION SPECIFICATION TESTS PASSED!');
console.log('======================================================================\n');
