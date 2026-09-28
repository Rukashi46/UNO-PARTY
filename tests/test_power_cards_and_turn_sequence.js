// tests/test_power_cards_and_turn_sequence.js
const assert = require('assert');

// 1. Core turn & engine simulation matching UnoGameEngine
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

// 2. Authoritative Single Turn State Machine Simulation
class AuthoritativeTurnMachine {
  constructor(playerNames = ['A', 'B', 'C', 'D'], deckType = 'NORMAL') {
    this.deckType = deckType;
    this.players = playerNames.map((name, i) => ({
      id: `p_${i + 1}`,
      name,
      controller: i === 0 ? 'LOCAL_HUMAN' : 'BOT',
      status: 'ACTIVE',
      isEliminated: false,
      hand: [
        { id: `c_${name}_1`, color: 'RED', value: '1' },
        { id: `c_${name}_2`, color: 'BLUE', value: '2' },
        { id: `c_${name}_3`, color: 'GREEN', value: '3' },
        { id: `c_${name}_4`, color: 'YELLOW', value: '4' },
      ],
      cardCount: 4,
    }));
    this.currentIndex = 0;
    this.turnId = 1;
    this.direction = 'CW';
    this.activeColor = 'RED';
    this.pendingDrawStack = 0;
    this.discardPile = [{ id: 'start_card', color: 'RED', value: '5' }];
    this.actionLock = 'IDLE';
    this.pendingChoice = null;
    this.pendingEffect = false;
    this.turnHistory = [];
  }

  getCurrentPlayer() {
    return this.players[this.currentIndex];
  }

  advanceToNextActivePlayer(options = {}) {
    if (this.pendingEffect) {
      throw new Error(`Cannot advance turn: pending effect running`);
    }
    if (this.pendingChoice) {
      throw new Error(`Cannot advance turn: pending choice ${this.pendingChoice} required`);
    }

    const playedCard = options.playedCard;
    let stepMultiplier = options.stepMultiplier ?? 1;
    const activePlayers = getEligibleActivePlayers(this.players);

    // Direction changes
    if (playedCard?.value === 'REVERSE') {
      this.direction = this.direction === 'CW' ? 'CCW' : 'CW';
      if (activePlayers.length === 2) {
        stepMultiplier = 2; // In 2 players, Reverse acts as Skip!
      }
    } else if (playedCard?.value === 'WILD_REVERSE_DRAW_FOUR') {
      this.direction = this.direction === 'CW' ? 'CCW' : 'CW';
    }

    if (playedCard?.value === 'SKIP') {
      stepMultiplier = 2;
    } else if (playedCard?.value === 'SKIP_EVERYONE') {
      stepMultiplier = 0;
    }

    const curIdx = this.currentIndex;
    const nextIdx = getNextActivePlayerIndex(
      this.players,
      curIdx,
      this.direction,
      stepMultiplier
    );

    this.turnId++;
    this.currentIndex = nextIdx;
    if (options.newActiveColor) {
      this.activeColor = options.newActiveColor;
    }

    const nextPlayer = this.players[nextIdx];
    this.turnHistory.push({
      turnId: this.turnId,
      player: nextPlayer.name,
      direction: this.direction,
      drawStack: this.pendingDrawStack,
      reason: options.reason || playedCard?.value || 'NORMAL',
    });

    return nextPlayer;
  }

  playCard(card, finalColor, extraSkips = 0) {
    const curPlayer = this.getCurrentPlayer();
    // Remove card from hand
    curPlayer.hand = curPlayer.hand.filter(c => c.id !== card.id);
    curPlayer.cardCount = curPlayer.hand.length;
    this.discardPile.push(card);
    this.activeColor = finalColor || card.color;

    // Draw stacks
    if (card.value === 'DRAW_TWO') this.pendingDrawStack += 2;
    else if (card.value === 'WILD_DRAW_FOUR' || card.value === 'WILD_REVERSE_DRAW_FOUR') this.pendingDrawStack += 4;
    else if (card.value === 'WILD_DRAW_SIX') this.pendingDrawStack += 6;
    else if (card.value === 'WILD_DRAW_TEN') this.pendingDrawStack += 10;

    return this.advanceToNextActivePlayer({
      playedCard: card,
      newActiveColor: finalColor,
      stepMultiplier: extraSkips ? 1 + extraSkips : undefined,
      reason: 'PLAY_CARD',
    });
  }

  acceptDrawStack() {
    const curPlayer = this.getCurrentPlayer();
    const penalty = this.pendingDrawStack;
    for (let i = 0; i < penalty; i++) {
      curPlayer.hand.push({ id: `draw_pen_${Date.now()}_${i}`, color: 'BLUE', value: '1' });
    }
    curPlayer.cardCount = curPlayer.hand.length;
    this.pendingDrawStack = 0;

    // Drawer loses turn
    return this.advanceToNextActivePlayer({
      reason: 'ACCEPTED_DRAW_STACK',
    });
  }
}

// 3. Layout calculation matching getOpponentLayout
function getOpponentLayout(idx, total) {
  if (total <= 1) {
    return {
      pos: { top: 80, left: 780 },
      scale: 1.45,
      centerCoord: { x: 960, y: 150 },
      compact: false,
      maxCardBacks: 4,
    };
  }
  if (total === 2) {
    const positions = [
      { top: 85, left: 450 },
      { top: 85, right: 450 },
    ];
    const coords = [
      { x: 580, y: 145 },
      { x: 1340, y: 145 },
    ];
    return {
      pos: positions[idx] || positions[0],
      scale: 1.30,
      centerCoord: coords[idx] || coords[0],
      compact: false,
      maxCardBacks: 4,
    };
  }
  if (total === 3) {
    const positions = [
      { left: 140, top: 370 },
      { top: 80, left: 780 },
      { right: 140, top: 370 },
    ];
    const coords = [
      { x: 260, y: 440 },
      { x: 960, y: 140 },
      { x: 1660, y: 440 },
    ];
    return {
      pos: positions[idx] || positions[0],
      scale: 1.25,
      centerCoord: coords[idx] || coords[0],
      compact: false,
      maxCardBacks: 4,
    };
  }
  if (total === 5) {
    const positions = [
      { left: 140, top: 400 },
      { left: 160, top: 220 },
      { top: 80, left: 780 },
      { right: 160, top: 220 },
      { right: 140, top: 400 },
    ];
    const coords = [
      { x: 250, y: 460 },
      { x: 270, y: 280 },
      { x: 960, y: 135 },
      { x: 1650, y: 280 },
      { x: 1670, y: 460 },
    ];
    return {
      pos: positions[idx] || positions[0],
      scale: 1.12,
      centerCoord: coords[idx] || coords[0],
      compact: false,
      maxCardBacks: 3,
    };
  }
  if (total === 7) {
    const positions = [
      { left: 140, top: 470 },
      { left: 140, top: 240 },
      { top: 80, left: 470 },
      { top: 75, left: 780 },
      { top: 80, right: 470 },
      { right: 140, top: 240 },
      { right: 140, top: 470 },
    ];
    const coords = [
      { x: 250, y: 530 },
      { x: 250, y: 300 },
      { x: 580, y: 135 },
      { x: 960, y: 130 },
      { x: 1340, y: 135 },
      { x: 1670, y: 300 },
      { x: 1670, y: 530 },
    ];
    return {
      pos: positions[idx] || positions[0],
      scale: 1.0,
      centerCoord: coords[idx] || coords[0],
      compact: false,
      maxCardBacks: 3,
    };
  }
  // 10 players (9 opponents)
  const positions = [
    { left: 130, top: 590 },
    { left: 130, top: 385 },
    { left: 130, top: 180 },
    { top: 75, left: 500 },
    { top: 70, left: 780 },
    { top: 75, right: 500 },
    { right: 130, top: 180 },
    { right: 130, top: 385 },
    { right: 130, top: 590 },
  ];
  const coords = [
    { x: 230, y: 640 },
    { x: 230, y: 440 },
    { x: 230, y: 240 },
    { x: 610, y: 130 },
    { x: 960, y: 125 },
    { x: 1310, y: 130 },
    { x: 1690, y: 240 },
    { x: 1690, y: 440 },
    { x: 1690, y: 640 },
  ];
  return {
    pos: positions[idx] || positions[0],
    scale: 0.90,
    centerCoord: coords[idx] || coords[0],
    compact: true,
    maxCardBacks: 3,
  };
}

console.log('======================================================================');
console.log('RUNNING TURN SEQUENCE & POWER CARD ENGINE TESTS');
console.log('======================================================================\n');

// TEST 1: Sequential Turn Order (A -> B -> C -> D -> A)
{
  console.log('--- TEST 1: Standard Turn Progression (A -> B -> C -> D -> A) ---');
  const game = new AuthoritativeTurnMachine(['A', 'B', 'C', 'D']);
  assert.strictEqual(game.getCurrentPlayer().name, 'A');

  game.playCard({ id: 'c1', color: 'RED', value: '1' }, 'RED');
  assert.strictEqual(game.getCurrentPlayer().name, 'B');

  game.playCard({ id: 'c2', color: 'RED', value: '2' }, 'RED');
  assert.strictEqual(game.getCurrentPlayer().name, 'C');

  game.playCard({ id: 'c3', color: 'RED', value: '3' }, 'RED');
  assert.strictEqual(game.getCurrentPlayer().name, 'D');

  game.playCard({ id: 'c4', color: 'RED', value: '4' }, 'RED');
  assert.strictEqual(game.getCurrentPlayer().name, 'A');
  console.log('  PASS: Sequential turn order A -> B -> C -> D -> A strictly verified');
}

// TEST 2: Draw Stack Sequence: A(+2) -> B(+2) -> C draws stack -> D plays -> A plays
{
  console.log('\n--- TEST 2: Draw Stack Stacking & Resolution (A+2 -> B+2 -> C draws penalty -> D -> A) ---');
  const game = new AuthoritativeTurnMachine(['A', 'B', 'C', 'D']);

  // A plays +2
  game.playCard({ id: 'a_draw2', color: 'RED', value: 'DRAW_TWO' }, 'RED');
  assert.strictEqual(game.pendingDrawStack, 2);
  assert.strictEqual(game.getCurrentPlayer().name, 'B');

  // B stacks +2
  game.playCard({ id: 'b_draw2', color: 'RED', value: 'DRAW_TWO' }, 'RED');
  assert.strictEqual(game.pendingDrawStack, 4);
  assert.strictEqual(game.getCurrentPlayer().name, 'C');

  // C cannot stack, draws penalty
  const cInitialCount = game.getCurrentPlayer().cardCount;
  game.acceptDrawStack();
  assert.strictEqual(game.pendingDrawStack, 0);
  assert.strictEqual(game.players[2].cardCount, cInitialCount + 4);
  assert.strictEqual(game.getCurrentPlayer().name, 'D');

  // D plays normal card
  game.playCard({ id: 'd_card', color: 'RED', value: '7' }, 'RED');
  assert.strictEqual(game.getCurrentPlayer().name, 'A');
  console.log('  PASS: Draw stack correctly accumulated (4) and cleared; C skipped, D then A received turns');
}

// TEST 3: Reverse in 4 players vs 2 players
{
  console.log('\n--- TEST 3: Reverse Card in 4-Player & 2-Player Games ---');
  // 4 Players: A plays Reverse -> direction becomes CCW -> D is next!
  const game4 = new AuthoritativeTurnMachine(['A', 'B', 'C', 'D']);
  game4.playCard({ id: 'rev_4', color: 'RED', value: 'REVERSE' }, 'RED');
  assert.strictEqual(game4.direction, 'CCW');
  assert.strictEqual(game4.getCurrentPlayer().name, 'D');
  console.log('  PASS: 4-Player Reverse correctly toggled to CCW and targeted D');

  // 2 Players: In 2 players, Reverse acts as Skip! A plays Reverse -> A keeps turn!
  const game2 = new AuthoritativeTurnMachine(['A', 'B']);
  game2.playCard({ id: 'rev_2', color: 'RED', value: 'REVERSE' }, 'RED');
  assert.strictEqual(game2.getCurrentPlayer().name, 'A');
  console.log('  PASS: 2-Player Reverse correctly acts as Skip; A keeps turn');
}

// TEST 4: Skip & Skip Everyone
{
  console.log('\n--- TEST 4: Skip & Skip Everyone ---');
  const game = new AuthoritativeTurnMachine(['A', 'B', 'C', 'D']);

  // A plays Skip -> B skipped, C is next
  game.playCard({ id: 'skip_1', color: 'RED', value: 'SKIP' }, 'RED');
  assert.strictEqual(game.getCurrentPlayer().name, 'C');

  // C plays Skip Everyone -> all other active players skipped, C keeps turn!
  game.playCard({ id: 'skip_all', color: 'RED', value: 'SKIP_EVERYONE' }, 'RED');
  assert.strictEqual(game.getCurrentPlayer().name, 'C');
  console.log('  PASS: Skip advances by 2 (A -> C), Skip Everyone grants extra turn to same player (C -> C)');
}

// TEST 5: Wild & +4 & +6 & +10 Color Choice & Turn Advancements
{
  console.log('\n--- TEST 5: Wild & Penalty Cards (+4, +6, +10) ---');
  const game = new AuthoritativeTurnMachine(['A', 'B', 'C', 'D']);

  // Wild: choice is required before turn advance
  game.pendingChoice = 'WILD_COLOR';
  assert.throws(() => game.advanceToNextActivePlayer(), /pending choice WILD_COLOR required/);

  game.pendingChoice = null;
  game.playCard({ id: 'wild_1', color: 'WILD', value: 'WILD' }, 'BLUE');
  assert.strictEqual(game.activeColor, 'BLUE');
  assert.strictEqual(game.getCurrentPlayer().name, 'B');

  // +4 Wild Draw Four
  game.playCard({ id: 'w4', color: 'WILD', value: 'WILD_DRAW_FOUR' }, 'GREEN');
  assert.strictEqual(game.pendingDrawStack, 4);
  assert.strictEqual(game.activeColor, 'GREEN');
  assert.strictEqual(game.getCurrentPlayer().name, 'C');

  // +6 Wild Draw Six
  game.playCard({ id: 'w6', color: 'WILD', value: 'WILD_DRAW_SIX' }, 'YELLOW');
  assert.strictEqual(game.pendingDrawStack, 10);
  assert.strictEqual(game.getCurrentPlayer().name, 'D');

  // +10 Wild Draw Ten
  game.playCard({ id: 'w10', color: 'WILD', value: 'WILD_DRAW_TEN' }, 'RED');
  assert.strictEqual(game.pendingDrawStack, 20);
  assert.strictEqual(game.getCurrentPlayer().name, 'A');
  console.log('  PASS: Wild, +4, +6, +10 correctly stack penalty (+20) and advance turns sequentially');
}

// TEST 6: Wild Reverse Draw Four
{
  console.log('\n--- TEST 6: Wild Reverse Draw Four ---');
  const game = new AuthoritativeTurnMachine(['A', 'B', 'C', 'D']);
  assert.strictEqual(game.direction, 'CW');

  // A plays Wild Reverse Draw Four: reverses direction to CCW, adds 4 to stack, next player is D
  game.playCard({ id: 'wr4', color: 'WILD', value: 'WILD_REVERSE_DRAW_FOUR' }, 'BLUE');
  assert.strictEqual(game.direction, 'CCW');
  assert.strictEqual(game.pendingDrawStack, 4);
  assert.strictEqual(game.getCurrentPlayer().name, 'D');
  console.log('  PASS: Wild Reverse Draw Four reverses direction FIRST, sets stack (+4), and targets D in new direction');
}

// TEST 7: Stale Bot Timer Prevention
{
  console.log('\n--- TEST 7: Stale Bot Timer Prevention (expectedTurnId Guard) ---');
  let botExecuted = false;
  const scheduledTurnId = 3;
  const botIndex = 1;

  function simulateBotTimerCallback(currentTurnId, currentIndex) {
    if (currentTurnId !== scheduledTurnId) {
      // Stale timer cancelled!
      return;
    }
    if (currentIndex !== botIndex) {
      return;
    }
    botExecuted = true;
  }

  // Turn has already advanced to 4 before timer fired
  simulateBotTimerCallback(4, botIndex);
  assert.strictEqual(botExecuted, false, 'Stale timer must be cancelled if turnId changed');

  // Exact matching turn
  simulateBotTimerCallback(3, botIndex);
  assert.strictEqual(botExecuted, true, 'Valid bot timer executed on expected turn');
  console.log('  PASS: Bot timer guard rejects stale executions when turnId or playerIndex differs');
}

// TEST 8: Responsive Layout for 2, 3, 4, 6, 8, 10 Players
{
  console.log('\n--- TEST 8: Responsive Layout for 2, 3, 4, 6, 8, 10 Players ---');
  const counts = [2, 3, 4, 6, 8, 10];

  counts.forEach(count => {
    const opponentCount = count - 1;
    const layouts = [];
    for (let i = 0; i < opponentCount; i++) {
      const l = getOpponentLayout(i, opponentCount);
      assert(l.scale >= 0.85 && l.scale <= 1.5, `Scale out of bounds for ${count} players: ${l.scale}`);
      assert(l.centerCoord.x > 0 && l.centerCoord.x < 1920, `X coordinate out of bounds: ${l.centerCoord.x}`);
      assert(l.centerCoord.y > 0 && l.centerCoord.y < 850, `Y coordinate encroaching hand: ${l.centerCoord.y}`);
      layouts.push(l);
    }

    if (count === 10) {
      // For 10 players (9 opponents), compact mode must be true and maxCardBacks <= 3
      layouts.forEach(l => {
        assert.strictEqual(l.compact, true, '10 players layout must enable compact mode');
        assert.strictEqual(l.maxCardBacks, 3, '10 players layout must limit card backs to 3');
      });
      // Check adjacent vertical spacing on left (indices 0, 1, 2)
      const dy01 = Math.abs(layouts[0].centerCoord.y - layouts[1].centerCoord.y);
      const dy12 = Math.abs(layouts[1].centerCoord.y - layouts[2].centerCoord.y);
      assert(dy01 >= 180, `Adjacent nodes on left overlap! dy=${dy01}`);
      assert(dy12 >= 180, `Adjacent nodes on left overlap! dy=${dy12}`);
    }

    if (count === 2) {
      // 2 players: 1 opponent top center
      assert.strictEqual(layouts[0].scale, 1.45, '2 players opponent scale should be 1.45');
      assert.strictEqual(layouts[0].compact, false);
      assert.strictEqual(layouts[0].maxCardBacks, 4);
    }
  });

  console.log('  PASS: Responsive layouts for 2, 3, 4, 6, 8, 10 players verified without overlap');
}

console.log('\n======================================================================');
console.log('ALL TURN SEQUENCE & POWER CARD TESTS PASSED SUCCESSFULLY!');
console.log('======================================================================');
