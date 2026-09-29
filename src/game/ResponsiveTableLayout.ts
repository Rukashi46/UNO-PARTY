/**
 * ResponsiveTableLayout.ts - Player-Count-Aware Landscape Game Table Layout Engine
 * Provides independent, readable scaling for 2 to 10 players.
 * Guarantees that avatars, names, card counts, and opponent card backs remain
 * legible without obstructing the center discard/draw piles or local hand.
 */

export interface ViewportSize {
  width: number;
  height: number;
}

export interface PlayerNodeLayout {
  pos: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  centerCoord: { x: number; y: number };
  nodeScale: number;
  avatarSize: number;
  avatarFontSize: number;
  cardBackWidth: number;
  cardBackHeight: number;
  cardBackSpacing: number;
  nameFontSize: number;
  cardCountFontSize: number;
  compact: boolean;
  maxCardBacks: number;
}

export interface TableLayoutConfig {
  playerCount: number;
  tableScale: number;
  localHandScale: number;
  opponents: PlayerNodeLayout[];
}

export function getPlayerLayout(playerCount: number, viewport: ViewportSize = { width: 1920, height: 1080 }): TableLayoutConfig {
  const opponentCount = Math.max(1, playerCount - 1);
  const opponents: PlayerNodeLayout[] = [];

  // Base table and local hand scales (independent from opponent count - Requirement 52)
  const tableScale = 1.0;
  const localHandScale = 1.0;

  for (let idx = 0; idx < opponentCount; idx++) {
    opponents.push(getSingleOpponentLayout(idx, opponentCount));
  }

  return {
    playerCount,
    tableScale,
    localHandScale,
    opponents,
  };
}

export function getSingleOpponentLayout(idx: number, opponentCount: number): PlayerNodeLayout {
  // 2 Players (1 Opponent Duel Profile - Requirement 49)
  if (opponentCount === 1) {
    return {
      pos: { top: 90, left: 770 },
      centerCoord: { x: 960, y: 155 },
      nodeScale: 1.25,
      avatarSize: 56,
      avatarFontSize: 30,
      cardBackWidth: 42,
      cardBackHeight: 62,
      cardBackSpacing: -12,
      nameFontSize: 17,
      cardCountFontSize: 14,
      compact: false,
      maxCardBacks: 4,
    };
  }

  // 3-4 Players (2-3 Opponents Profile - Requirement 49)
  if (opponentCount === 2) {
    const positions = [
      { left: 160, top: 220 },
      { right: 160, top: 220 },
    ];
    const coords = [
      { x: 300, y: 280 },
      { x: 1620, y: 280 },
    ];
    return {
      pos: positions[idx] || positions[0],
      centerCoord: coords[idx] || coords[0],
      nodeScale: 1.18,
      avatarSize: 52,
      avatarFontSize: 28,
      cardBackWidth: 38,
      cardBackHeight: 56,
      cardBackSpacing: -12,
      nameFontSize: 16,
      cardCountFontSize: 13,
      compact: false,
      maxCardBacks: 4,
    };
  }

  if (opponentCount === 3) {
    const positions = [
      { left: 150, top: 320 },
      { top: 85, left: 780 },
      { right: 150, top: 320 },
    ];
    const coords = [
      { x: 280, y: 380 },
      { x: 960, y: 145 },
      { x: 1640, y: 380 },
    ];
    return {
      pos: positions[idx] || positions[0],
      centerCoord: coords[idx] || coords[0],
      nodeScale: 1.15,
      avatarSize: 50,
      avatarFontSize: 26,
      cardBackWidth: 36,
      cardBackHeight: 54,
      cardBackSpacing: -12,
      nameFontSize: 16,
      cardCountFontSize: 13,
      compact: false,
      maxCardBacks: 4,
    };
  }

  // 5-6 Players (4-5 Opponents Profile - Requirement 49)
  if (opponentCount === 4) {
    const positions = [
      { left: 150, top: 400 },
      { left: 320, top: 110 },
      { right: 320, top: 110 },
      { right: 150, top: 400 },
    ];
    const coords = [
      { x: 270, y: 460 },
      { x: 480, y: 170 },
      { x: 1440, y: 170 },
      { x: 1650, y: 460 },
    ];
    return {
      pos: positions[idx] || positions[0],
      centerCoord: coords[idx] || coords[0],
      nodeScale: 1.10,
      avatarSize: 48,
      avatarFontSize: 25,
      cardBackWidth: 34,
      cardBackHeight: 50,
      cardBackSpacing: -14,
      nameFontSize: 15,
      cardCountFontSize: 12,
      compact: false,
      maxCardBacks: 3,
    };
  }

  if (opponentCount === 5) {
    const positions = [
      { left: 140, top: 410 },
      { left: 180, top: 190 },
      { top: 80, left: 780 },
      { right: 180, top: 190 },
      { right: 140, top: 410 },
    ];
    const coords = [
      { x: 260, y: 470 },
      { x: 320, y: 250 },
      { x: 960, y: 140 },
      { x: 1600, y: 250 },
      { x: 1660, y: 470 },
    ];
    return {
      pos: positions[idx] || positions[0],
      centerCoord: coords[idx] || coords[0],
      nodeScale: 1.08,
      avatarSize: 46,
      avatarFontSize: 24,
      cardBackWidth: 34,
      cardBackHeight: 50,
      cardBackSpacing: -14,
      nameFontSize: 15,
      cardCountFontSize: 12,
      compact: false,
      maxCardBacks: 3,
    };
  }

  // 7-8 Players (6-7 Opponents Profile - Requirement 49)
  if (opponentCount === 6) {
    const positions = [
      { left: 140, top: 480 },
      { left: 140, top: 230 },
      { top: 80, left: 540 },
      { top: 80, right: 540 },
      { right: 140, top: 230 },
      { right: 140, top: 480 },
    ];
    const coords = [
      { x: 250, y: 540 },
      { x: 250, y: 290 },
      { x: 650, y: 140 },
      { x: 1270, y: 140 },
      { x: 1670, y: 290 },
      { x: 1670, y: 540 },
    ];
    return {
      pos: positions[idx] || positions[0],
      centerCoord: coords[idx] || coords[0],
      nodeScale: 1.02,
      avatarSize: 44,
      avatarFontSize: 23,
      cardBackWidth: 32,
      cardBackHeight: 48,
      cardBackSpacing: -16,
      nameFontSize: 14,
      cardCountFontSize: 12,
      compact: true,
      maxCardBacks: 3,
    };
  }

  if (opponentCount === 7) {
    const positions = [
      { left: 140, top: 480 },
      { left: 140, top: 230 },
      { top: 80, left: 470 },
      { top: 75, left: 780 },
      { top: 80, right: 470 },
      { right: 140, top: 230 },
      { right: 140, top: 480 },
    ];
    const coords = [
      { x: 250, y: 540 },
      { x: 250, y: 290 },
      { x: 580, y: 140 },
      { x: 960, y: 135 },
      { x: 1340, y: 140 },
      { x: 1670, y: 290 },
      { x: 1670, y: 540 },
    ];
    return {
      pos: positions[idx] || positions[0],
      centerCoord: coords[idx] || coords[0],
      nodeScale: 0.98,
      avatarSize: 42,
      avatarFontSize: 22,
      cardBackWidth: 30,
      cardBackHeight: 46,
      cardBackSpacing: -16,
      nameFontSize: 14,
      cardCountFontSize: 11,
      compact: true,
      maxCardBacks: 3,
    };
  }

  if (opponentCount === 8) {
    const positions = [
      { left: 140, top: 590 },
      { left: 140, top: 385 },
      { left: 140, top: 180 },
      { top: 80, left: 570 },
      { top: 80, right: 570 },
      { right: 140, top: 180 },
      { right: 140, top: 385 },
      { right: 140, top: 590 },
    ];
    const coords = [
      { x: 240, y: 640 },
      { x: 240, y: 440 },
      { x: 240, y: 240 },
      { x: 680, y: 140 },
      { x: 1240, y: 140 },
      { x: 1680, y: 240 },
      { x: 1680, y: 440 },
      { x: 1680, y: 640 },
    ];
    return {
      pos: positions[idx] || positions[0],
      centerCoord: coords[idx] || coords[0],
      nodeScale: 0.95,
      avatarSize: 42,
      avatarFontSize: 22,
      cardBackWidth: 30,
      cardBackHeight: 44,
      cardBackSpacing: -16,
      nameFontSize: 14,
      cardCountFontSize: 11,
      compact: true,
      maxCardBacks: 3,
    };
  }

  // 9-10 Players (9 Opponents Profile - Optimized Perimeter - Requirement 49)
  // 3 Left, 3 Top, 3 Right - readable avatars, readable names, card counts
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
    centerCoord: coords[idx] || coords[0],
    nodeScale: 0.92,
    avatarSize: 42,
    avatarFontSize: 22,
    cardBackWidth: 28,
    cardBackHeight: 42,
    cardBackSpacing: -16,
    nameFontSize: 13,
    cardCountFontSize: 11,
    compact: true,
    maxCardBacks: 3,
  };
}
