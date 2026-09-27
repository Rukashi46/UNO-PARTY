/**
 * Centralized Production Error Mapper & Dev Logger
 *
 * Ensures technical errors (stack traces, Supabase internals, WebSocket errors)
 * are NEVER displayed directly to users.
 */

declare const __DEV__: boolean;

export const devLog = (tag: string, ...args: any[]): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[${tag}]`, ...args);
  }
};

export const devWarn = (tag: string, ...args: any[]): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[${tag}]`, ...args);
  }
};

export const devError = (tag: string, ...args: any[]): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.error(`[${tag}]`, ...args);
  }
};

export type KnownErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_IN_ROOM'
  | 'NOT_YOUR_TURN'
  | 'CONNECTION_FAILED'
  | 'CONNECTION_LOST'
  | 'MATCH_STARTED'
  | 'INVALID_ACTION'
  | 'ROOM_START_INVALID'
  | 'DECK_INVALID'
  | 'MIN_PLAYERS_REQUIRED'
  | 'UNKNOWN_ERROR';

const ERROR_MESSAGES: Record<KnownErrorCode, string> = {
  ROOM_NOT_FOUND: 'Room not found. Check the room code and try again.',
  ROOM_FULL: 'This room is full.',
  ALREADY_IN_ROOM: 'You are already in this room.',
  NOT_YOUR_TURN: "It's not your turn.",
  CONNECTION_FAILED: 'Unable to connect. Please try again.',
  CONNECTION_LOST: 'Connection lost. Reconnecting...',
  MATCH_STARTED: 'This match has already started.',
  INVALID_ACTION: 'That action is no longer available.',
  ROOM_START_INVALID: 'The match cannot start yet. At least 2 players are required.',
  MIN_PLAYERS_REQUIRED: 'At least 2 players are required to start a multiplayer match.',
  DECK_INVALID: 'Unable to start the match. Please try again.',
  UNKNOWN_ERROR: 'Something went wrong. Please try again.',
};

export class ProductionError extends Error {
  public code: KnownErrorCode;

  constructor(code: KnownErrorCode, internalDebugMessage?: string) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN_ERROR);
    this.code = code;
    this.name = 'ProductionError';

    if (internalDebugMessage) {
      devError('ProductionError', `Code: ${code} | Debug: ${internalDebugMessage}`);
    }
  }
}

export const getSafeErrorMessage = (error: unknown): string => {
  if (!error) return ERROR_MESSAGES.UNKNOWN_ERROR;

  // Log full internal details strictly to development console
  devError('ErrorCatcher', error);

  if (error instanceof ProductionError) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as any).code as KnownErrorCode;
    if (ERROR_MESSAGES[code]) {
      return ERROR_MESSAGES[code];
    }
  }

  const rawMsg = typeof error === 'string' ? error : (error as any)?.message || '';

  // Match common patterns without exposing raw details
  if (rawMsg.includes('not found') || rawMsg.includes('404')) {
    return ERROR_MESSAGES.ROOM_NOT_FOUND;
  }
  if (rawMsg.includes('full') || rawMsg.includes('capacity')) {
    return ERROR_MESSAGES.ROOM_FULL;
  }
  if (rawMsg.includes('already in') || rawMsg.includes('already_joined')) {
    return ERROR_MESSAGES.ALREADY_IN_ROOM;
  }
  if (rawMsg.includes('started') || rawMsg.includes('PLAYING')) {
    return ERROR_MESSAGES.MATCH_STARTED;
  }
  if (rawMsg.includes('network') || rawMsg.includes('fetch') || rawMsg.includes('timeout')) {
    return ERROR_MESSAGES.CONNECTION_FAILED;
  }
  if (rawMsg.includes('min') || rawMsg.includes('player count') || rawMsg.includes('alone')) {
    return ERROR_MESSAGES.MIN_PLAYERS_REQUIRED;
  }

  // Fallback to production safe generic message
  return ERROR_MESSAGES.UNKNOWN_ERROR;
};
