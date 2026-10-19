/** Strips private information from an event before it is sent to `recipientId`. Returns null to drop it. */
export function sanitizeEventFor(event: any, recipientId: string): any | null {
  if (!event || typeof event !== 'object') return null;
  switch (event.type) {
    case 'PRIVATE_HAND_UPDATE':
      return event.playerId === recipientId ? event : null;
    case 'MATCH_STARTED': {
      const { privateHand: _omit, ...rest } = event;
      return rest;
    }
    case 'SYNC_STATE':
      return event.targetPlayerId === recipientId ? event : null;
    case 'CARD_DRAWN':
      if (event.drawnCard && event.playerId !== recipientId) {
        const { drawnCard: _omit, ...rest } = event;
        return rest;
      }
      return event;
    default:
      return event;
  }
}

export const GUEST_COMMAND_TYPES = new Set([
  'PLAY_CARD', 'DRAW_CARD', 'CHOOSE_WILD_COLOR', 'CHOOSE_CUSTOM_WILD_POWER', 'CHOOSE_SWAP_TARGET',
  'CHOOSE_ROULETTE_COLOR', 'ACCEPT_DRAW_STACK', 'CALL_UNO', 'END_TURN', 'REQUEST_SYNC', 'PING', 'PONG', 'TEST_STATE',
]);
