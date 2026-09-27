export type UnoColor = 'RED' | 'YELLOW' | 'GREEN' | 'BLUE' | 'WILD';

export type UnoValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'SKIP'
  | 'REVERSE'
  | 'DRAW_TWO'
  | 'DRAW_FOUR' // Colored +4 in No Mercy
  | 'WILD'
  | 'WILD_DRAW_FOUR'
  | 'WILD_REVERSE_DRAW_FOUR' // No Mercy Wild Reverse +4
  | 'WILD_DRAW_SIX'
  | 'WILD_DRAW_TEN'
  | 'CUSTOM_WILD'
  | 'SHUFFLE_HANDS'
  | 'SKIP_EVERYONE'
  | 'DISCARD_ALL'
  | 'WILD_COLOR_ROULETTE';

export interface UnoCard {
  id: string;
  color: UnoColor;
  value: UnoValue;
}

export type DeckType = 'NORMAL' | 'NO_MERCY';

export type CustomWildPower = 'SHUFFLE_HANDS' | 'EVERYONE_PLUS_FOUR';

export type PlayerControl = 'HUMAN' | 'BOT';

export type PlayerController = 'LOCAL_HUMAN' | 'BOT' | 'REMOTE_HUMAN';

export type GameEndMode = 'FIRST_PLAYER_WINS' | 'PLAY_UNTIL_LAST_PLAYER';

export type PlayerStatus = 'ACTIVE' | 'FINISHED' | 'ELIMINATED';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  isHuman: boolean;
  playerType?: PlayerControl;
  controller?: PlayerController;
  hand: UnoCard[];
  cardCount: number;
  isHost?: boolean;
  hasCalledUno?: boolean;
  hasTurn?: boolean;
  score?: number;
  isEliminated?: boolean;
  status?: PlayerStatus;
  finishRank?: number;
}

export type GameMode = 'ONLINE' | 'WLAN' | 'PLAY_BOTS' | 'PASS_AND_PLAY';

export interface GameRules {
  deckType: DeckType;
  stacking: boolean;
  sevenZeroRule: boolean; // Built-in & mandatory in No Mercy; normal numbers in Normal UNO
  jumpInRule: boolean;
  drawUntilPlayable: boolean;
  forcePlay: boolean;
  mercy25Cards: boolean;
  includeCustomWilds: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  gameEndMode?: GameEndMode;
}

export type GamePhase =
  | 'NOT_STARTED'
  | 'PLAYING'
  | 'CHOOSING_WILD_COLOR'
  | 'CHOOSING_CUSTOM_WILD_POWER'
  | 'CHOOSING_SWAP_TARGET'
  | 'CHOOSING_ROULETTE_COLOR'
  | 'ROULETTE_DRAWING'
  | 'WAITING_FOR_REMOTE_PLAYER'
  | 'SHUFFLE_ANIMATION'
  | 'ROUND_OVER'
  | 'MATCH_OVER'
  | 'GAME_OVER';

export interface ActionLog {
  id: string;
  text: string;
  isAlert?: boolean;
  color?: UnoColor;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  direction: 'CW' | 'CCW';
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  activeColor: UnoColor;
  pendingDrawStack: number;
  gamePhase: GamePhase;
  rules: GameRules;
  mode: GameMode;
  roomCode: string;
  logs: ActionLog[];
  winner: Player | null;
  roundNumber: number;
  timerSeconds: number;
  revision?: number;
  choiceOwnerId?: string;
  finishingOrder?: string[];
}
