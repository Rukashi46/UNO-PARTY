import { UnoCard, UnoColor, GameRules, GamePhase, CustomWildPower, DeckType, PlayerController, GameEndMode, PlayerStatus } from '../types/game';
export { GameRules, CustomWildPower, DeckType, PlayerController, GameEndMode, PlayerStatus };

export type MultiplayerMode = 'ONLINE' | 'WLAN' | 'PLAY_BOTS' | 'PASS_AND_PLAY';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';

export interface RoomPlayer {
  id: string; // Logical playerId (RFC4122 UUID or auth ID)
  name: string;
  avatar: string;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  cardCount: number;
  controller?: PlayerController;
  deviceId?: string; // Local installation/device identifier
  isEliminated?: boolean;
  status?: PlayerStatus;
  finishRank?: number;
}

export interface MultiplayerRoom {
  id: string;
  code: string;
  hostId: string;
  status: 'WAITING' | 'STARTING' | 'PLAYING' | 'FINISHED';
  mode: MultiplayerMode;
  rules: GameRules;
  maxPlayers: number;
  players: RoomPlayer[];
  createdAt?: number;
}

export interface NearbyWlanRoom {
  code: string;
  hostName: string;
  hostPlayerId?: string;
  roomName?: string;
  playerCount: number;
  maxPlayers: number;
  deckType: DeckType;
  status: 'WAITING' | 'PLAYING';
  hostAddress?: string;
  port?: number;
  lastSeen?: number;
}

export type GameCommand =
  | { type: 'PLAY_CARD'; commandId: string; revision?: number; playerId: string; cardId: string; wildColor?: UnoColor }
  | { type: 'DRAW_CARD'; commandId: string; revision?: number; playerId: string }
  | { type: 'CHOOSE_WILD_COLOR'; commandId: string; revision?: number; playerId: string; chosenColor: UnoColor }
  | { type: 'CHOOSE_CUSTOM_WILD_POWER'; commandId: string; revision?: number; playerId: string; power: CustomWildPower }
  | { type: 'CHOOSE_SWAP_TARGET'; commandId: string; revision?: number; playerId: string; targetPlayerId: string }
  | { type: 'CHOOSE_ROULETTE_COLOR'; commandId: string; revision?: number; playerId: string; chosenColor: UnoColor }
  | { type: 'ACCEPT_DRAW_STACK'; commandId: string; revision?: number; playerId: string }
  | { type: 'CALL_UNO'; commandId: string; playerId: string }
  | { type: 'END_TURN'; commandId: string; revision?: number; playerId: string };

export type GameEvent =
  | { type: 'PLAYER_JOINED'; player: RoomPlayer }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'PLAYER_READY'; playerId: string; isReady: boolean }
  | { type: 'RULES_UPDATED'; rules: GameRules }
  | { type: 'ROOM_MAX_PLAYERS_UPDATED'; maxPlayers: number }
  | { type: 'HOST_CHANGED'; newHostId: string }
  | { type: 'MATCH_STARTED'; initialPublicState: PublicMatchState; privateHand: UnoCard[] }
  | {
      type: 'CARD_PLAYED';
      playerId: string;
      playedCard: UnoCard;
      newCardCount: number;
      activeColor: UnoColor;
      pendingDrawStack: number;
      revision: number;
    }
  | {
      type: 'CARD_DRAWN';
      playerId: string;
      newCardCount: number;
      drawnCard?: UnoCard; // Sent ONLY to the drawing player (Part 28)
      revision: number;
    }
  | { type: 'WILD_COLOR_SELECTED'; playerId: string; activeColor: UnoColor; revision: number }
  | { type: 'CUSTOM_WILD_SELECTED'; playerId: string; power: CustomWildPower; revision: number }
  | { type: 'HANDS_SWAPPED'; player1Id: string; player2Id: string; player1CardCount: number; player2CardCount: number; revision: number }
  | { type: 'HANDS_PASSED'; direction: 'CW' | 'CCW'; playerCardCounts: Record<string, number>; revision: number }
  | {
      type: 'SHUFFLE_AND_REDEAL_HANDS';
      cardPlayerId?: string;
      playerCardCounts: Record<string, number>;
      initialCardCounts?: Record<string, number>;
      dealingOrder?: string[];
      dealSequence?: string[];
      totalCards?: number;
      revision: number;
    }
  | { type: 'ROULETTE_DRAW_COMPLETED'; targetPlayerId: string; chosenColor: UnoColor; drawnCount: number; revision: number }
  | { type: 'DISCARD_ALL_TRIGGERED'; playerId: string; color: UnoColor; count: number; revision: number }
  | { type: 'SKIP_EVERYONE_TRIGGERED'; playerId: string; revision: number }
  | { type: 'DRAW_STACK_RESOLVED'; playerId: string; penaltyAmount: number; revision: number }
  | { type: 'PHASE_CHANGED'; phase: GamePhase; choiceOwnerId?: string; revision: number }
  | { type: 'PRIVATE_HAND_UPDATE'; playerId: string; hand: UnoCard[] }
  | { type: 'UNO_CALLED'; playerId: string }
  | {
      type: 'TURN_CHANGED';
      nextPlayerId: string;
      activeColor: UnoColor;
      direction: 'CW' | 'CCW';
      pendingDrawStack: number;
      revision: number;
    }
  | { type: 'PLAYER_ELIMINATED'; playerId: string; reason: string; revision: number }
  | { type: 'PLAYER_FINISHED'; playerId: string; rank: number; finishingOrder: string[]; revision: number }
  | { type: 'PLAYER_WON'; winnerId: string; winnerName: string; finishingOrder?: string[]; finalResults?: any[]; revision: number }
  | { type: 'MATCH_FINISHED'; finishingOrder?: string[]; finalResults?: any[]; revision?: number }
  | {
      type: 'GAME_STATE_UPDATE';
      revision: number;
      roomId: string;
      discardTop: UnoCard | null;
      discardPile: UnoCard[];
      activeColor: UnoColor;
      currentPlayerId: string;
      direction: 'CW' | 'CCW';
      pendingDrawStack: number;
      players: RoomPlayer[];
      playedCard?: UnoCard;
      playerWhoPlayed?: string;
    }
  | { type: 'SYNC_STATE'; state: PublicMatchState; privateHand?: UnoCard[] };

export interface PublicMatchState {
  roomId: string;
  topCard: UnoCard | null;
  activeColor: UnoColor;
  currentPlayerId: string;
  direction: 'CW' | 'CCW';
  pendingDrawStack: number;
  drawPileCount: number;
  players: RoomPlayer[];
  discardPile: UnoCard[];
  rules: GameRules;
  status: 'PLAYING' | 'FINISHED';
  gamePhase: GamePhase;
  choiceOwnerId?: string;
  revision: number;
  finishingOrder?: string[];
}

export interface MultiplayerTransport {
  connect(roomCode: string, player: RoomPlayer, options?: { hostAddress?: string; port?: number; deviceId?: string }): Promise<boolean>;
  disconnect(): Promise<void>;
  sendCommand(command: GameCommand): Promise<void>;
  broadcastEvent(event: GameEvent): Promise<void>;
  onEvent(callback: (event: GameEvent) => void): () => void;
  onConnectionChange(callback: (status: ConnectionStatus) => void): () => void;
  getConnectionStatus(): ConnectionStatus;
  // WLAN discovery methods
  startAdvertising?(roomInfo: NearbyWlanRoom): Promise<void>;
  stopAdvertising?(): Promise<void>;
  scanNearbyRooms?(): Promise<NearbyWlanRoom[]>;
}
