// Three real MultiplayerSession instances play over the real WLAN transport.
// Run: node --require ./tests/setup.cjs --import tsx tests/test_wlan_full_match.ts
import * as assert from 'assert';
import { MultiplayerSession } from '../src/multiplayer/MultiplayerSession';
import * as net from 'net';
import { defaultWlanPlatform } from '../src/multiplayer/wlan/platform';
import { UnoDeckService } from '../src/game/UnoDeckService';

// Node stand-ins for react-native-tcp-socket / expo-network (the app uses the real ones).
Object.assign(defaultWlanPlatform, {
  createServer: () => net.createServer() as any,
  connect: (host: string, port: number, cb: () => void) => net.connect(port, host, cb) as any,
  getLocalIp: async () => '127.0.0.1',
});
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const waitFor = async (f: () => boolean, ms = 5000, what = '') => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout ' + what); await sleep(15); } };
const P = (id: string, host = false) => ({ id, name: id, avatar: '🙂', isHost: host, isReady: false, isConnected: true, cardCount: 0 }) as any;
const rules: any = { deckType: 'NORMAL', stacking: true, sevenZeroRule: false, jumpInRule: false, drawUntilPlayable: false, forcePlay: false, mercy25Cards: false, includeCustomWilds: false, soundEnabled: false, hapticsEnabled: false };

async function setup() {
  const mk = () => new (MultiplayerSession as any)() as MultiplayerSession;
  const [h, a, b] = [mk(), mk(), mk()];
  await h.createRoom('WLAN', P('host', true), rules, 'TEST1');
  const opts = { hostAddress: '127.0.0.1' };
  await a.joinRoom('WLAN', 'TEST1', P('alice'), opts);
  await b.joinRoom('WLAN', 'TEST1', P('bob'), opts);
  await waitFor(() => h.getRoom()!.players.length === 3 && a.getRoom()!.players.length === 3 && b.getRoom()!.players.length === 3, 5000, 'lobby sync');
  const log: Record<string, any[]> = { host: [], alice: [], bob: [] };
  h.onEvent(e => log.host.push(e)); a.onEvent(e => log.alice.push(e)); b.onEvent(e => log.bob.push(e));
  return { h, a, b, log, byId: { host: h, alice: a, bob: b } as Record<string, MultiplayerSession> };
}

const bestColor = (hand: any[]) => { const n: Record<string, number> = {}; hand.forEach(c => { if (c.color !== 'WILD') n[c.color] = (n[c.color] || 0) + 1; }); return (Object.entries(n).sort((x, y) => y[1] - x[1])[0]?.[0] || 'RED') as any; };
async function takeTurn(s: MultiplayerSession) {
  const room = s.getRoom()!;
  const top = s.getAuthoritativeTopCard();
  const hand = s.getLocalPrivateHand();
  const color = s.getAuthoritativeActiveColor();
  const pending = s.getAuthoritativePendingDraw();
  const playable = hand.find(c => UnoDeckService.canPlayCard(c, top, color, pending, room.rules));
  if (playable) await s.playCard(playable.id, playable.color === 'WILD' ? bestColor(hand) : undefined);
  else if (pending > 0) await s.acceptDrawStack();
  else await s.drawCard();
}

const tests: Array<[string, () => Promise<void>]> = [];
tests.push(['3 devices play a full match to a winner; hands stay private; all agree on the result', async () => {
  const { h, a, b, log, byId } = await setup();
  await h.startMatch();
  await waitFor(() => a.getLocalPrivateHand().length === 7 && b.getLocalPrivateHand().length === 7, 5000, 'deal');
  // guests never saw anyone else's cards
  for (const who of ['alice', 'bob']) {
    const mine = byId[who].getLocalPrivateHand().map(c => c.id);
    const hostHand = h.getLocalPrivateHand().map(c => c.id);
    assert.ok(!mine.some(id => hostHand.includes(id)));
  }
  let turns = 0;
  while (!log.host.some(e => e.type === 'PLAYER_WON') && turns++ < 4000) {
    const cur = h.getAuthoritativeCurrentPlayerId();
    const rev = h.getRevision();
    const phase = (h as any).authoritativePhase as string;
    const owner = (h as any).authoritativeChoiceOwnerId as string | null;
    if (phase !== 'PLAYING' && owner) {
      const o = byId[owner];
      if (phase === 'CHOOSING_CUSTOM_WILD_POWER') await o.chooseCustomWildPower('EVERYONE_PLUS_FOUR');
      else if (phase === 'CHOOSING_WILD_COLOR') await o.chooseWildColor(bestColor(o.getLocalPrivateHand()));
      else if (phase === 'CHOOSING_SWAP_TARGET') await o.chooseSwapTarget(h.getRoom()!.players.find(p => p.id !== owner && p.status !== 'ELIMINATED')!.id);
      else if (phase === 'CHOOSING_ROULETTE_COLOR') await o.chooseRouletteColor(bestColor(o.getLocalPrivateHand()));
      else throw new Error('unhandled phase ' + phase);
    } else await takeTurn(byId[cur]);
    await waitFor(() => h.getRevision() !== rev || log.host.some(e => e.type === 'PLAYER_WON'), 3000, 'turn ' + turns).catch(() => {});
    await sleep(3);
  }
  await waitFor(() => log.alice.some(e => e.type === 'PLAYER_WON') && log.bob.some(e => e.type === 'PLAYER_WON'), 5000, 'result broadcast');
  const w = (l: any[]) => l.find(e => e.type === 'PLAYER_WON').winnerId;
  assert.strictEqual(w(log.alice), w(log.host));
  assert.strictEqual(w(log.bob), w(log.host));
  const private_ = (l: any[]) => l.filter(e => e.type === 'PRIVATE_HAND_UPDATE');
  assert.ok(private_(log.alice).every(e => e.playerId === 'alice'));
  assert.ok(private_(log.bob).every(e => e.playerId === 'bob'));
  for (const s of [h, a, b]) await s.leaveRoom();
}]);

tests.push(['guests leaving mid-match forfeit; last player standing wins instead of stalling', async () => {
  const { h, a, b, log } = await setup();
  await h.startMatch();
  await waitFor(() => a.getLocalPrivateHand().length === 7, 5000, 'deal');
  await a.leaveRoom();
  await waitFor(() => h.getRoom()!.players.find(p => p.id === 'alice')?.status === 'ELIMINATED', 5000, 'alice forfeit');
  assert.ok(!log.host.some(e => e.type === 'PLAYER_WON'), 'two players still left');
  await b.leaveRoom();
  await waitFor(() => log.host.some(e => e.type === 'PLAYER_WON'), 5000, 'host wins');
  assert.strictEqual(log.host.find(e => e.type === 'PLAYER_WON').winnerId, 'host');
  await h.leaveRoom();
}]);

(async () => {
  let fail = 0;
  for (const [n, f] of tests) {
    try { await f(); console.log('ok   -', n); } catch (e: any) { fail++; console.log('FAIL -', n, '\n', e?.stack || e); }
  }
  process.exit(fail ? 1 : 0);
})();
