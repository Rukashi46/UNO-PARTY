// Real WlanTransport host+guest over real TCP/WebSocket on loopback.
// Run: node --require ./tests/setup.cjs --import tsx tests/test_wlan_transport_real.ts
import * as net from 'net';
import * as assert from 'assert';
import WebSocket from 'ws';
import { WlanTransport } from '../src/multiplayer/WlanTransport';
import { sanitizeEventFor } from '../src/multiplayer/wlan/sanitize';
import type { WlanPlatform } from '../src/multiplayer/wlan/platform';

const PORT = 18790;
const platform = (ip: string): WlanPlatform => ({
  createServer: () => net.createServer() as any,
  connect: (host, port, cb) => net.connect(port, host, cb) as any,
  getLocalIp: async () => ip,
  createWebSocket: url => new (globalThis as any).WebSocket(url),
});
const player = (id: string, host = false) => ({ id, name: id, avatar: '🙂', isHost: host, isReady: false, isConnected: true, cardCount: 0 }) as any;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const waitFor = async (f: () => boolean, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); await sleep(20); } };

const open: WlanTransport[] = [];
const track = (t: WlanTransport) => (open.push(t), t);
const tests: Array<[string, () => Promise<void>]> = [];
const test = (n: string, f: () => Promise<void>) => tests.push([n, f]);

async function makeHost(status: 'WAITING' | 'PLAYING' = 'WAITING', players = [player('host', true)]) {
  const host = track(new WlanTransport(platform('127.0.0.1'), { port: PORT }));
  const room: any = { hostId: 'host', rules: { deckType: 'NORMAL' }, maxPlayers: 3, status, players };
  host.setHostSnapshotProvider(() => room);
  const hostEvents: any[] = [];
  host.onEvent(e => hostEvents.push(e));
  await host.startAdvertising({ code: 'ROOM1', hostName: 'Host', hostPlayerId: 'host', playerCount: 1, maxPlayers: 3, deckType: 'NORMAL', status: 'WAITING', port: PORT });
  await host.connect('ROOM1', players[0]);
  return { host, room, hostEvents };
}
const guestOf = (id: string) => {
  const g = track(new WlanTransport(platform('127.0.0.2'), { port: PORT }));
  const ev: any[] = [];
  g.onEvent(e => ev.push(e));
  return { g, ev, p: player(id) };
};

test('guest discovers the room by subnet sweep and joins by code', async () => {
  const { host, hostEvents } = await makeHost();
  const { g, p } = guestOf('alice');
  const rooms = await g.scanNearbyRooms();
  assert.strictEqual(rooms.length, 1);
  assert.strictEqual(rooms[0].code, 'ROOM1');
  assert.strictEqual(rooms[0].hostAddress, '127.0.0.1');
  assert.ok(await g.connect('ROOM1', p));
  await waitFor(() => hostEvents.some(e => e.type === 'PLAYER_JOINED'));
  await g.disconnect(); await host.disconnect();
});

test('wrong code, full room and started match are rejected', async () => {
  const { host, room } = await makeHost();
  const a = guestOf('a');
  assert.strictEqual(await a.g.connect('ROOM1', a.p, { hostAddress: '127.0.0.1', port: PORT }), true);
  const wrong = guestOf('w');
  assert.strictEqual(await wrong.g.connect('NOPE1', wrong.p, { hostAddress: '127.0.0.1', port: PORT }), false);
  room.players.push(player('a'), player('b'));            // now full (3/3)
  const full = guestOf('c');
  assert.strictEqual(await full.g.connect('ROOM1', full.p, { hostAddress: '127.0.0.1', port: PORT }), false);
  assert.strictEqual(full.g.lastRejectReason, 'ROOM_FULL');
  room.players.pop(); room.status = 'PLAYING'; host.setRoomStatus('PLAYING');
  const late = guestOf('d');
  assert.strictEqual(await late.g.connect('ROOM1', late.p, { hostAddress: '127.0.0.1', port: PORT }), false);
  assert.strictEqual(late.g.lastRejectReason, 'MATCH_STARTED');
  await a.g.disconnect(); await host.disconnect();
});

test('commands are bound to the connection identity (no spoofing)', async () => {
  const { host, hostEvents } = await makeHost();
  const a = guestOf('alice');
  await a.g.connect('ROOM1', a.p, { hostAddress: '127.0.0.1', port: PORT });
  await a.g.sendCommand({ type: 'PLAY_CARD', commandId: 'c1', playerId: 'host', cardId: 'x' } as any);
  await a.g.sendCommand({ type: 'MATCH_FINISHED', commandId: 'c2', playerId: 'alice' } as any);   // not a legal guest command
  await waitFor(() => hostEvents.some(e => e.type === 'PLAY_CARD'));
  await sleep(100);
  assert.strictEqual(hostEvents.find(e => e.type === 'PLAY_CARD').playerId, 'alice');
  assert.ok(!hostEvents.some(e => e.type === 'MATCH_FINISHED'));
  await a.g.disconnect(); await host.disconnect();
});

test('private hands only reach their owner; drawn card hidden from others', async () => {
  const { host } = await makeHost();
  const a = guestOf('alice'), b = guestOf('bob');
  await a.g.connect('ROOM1', a.p, { hostAddress: '127.0.0.1', port: PORT });
  await b.g.connect('ROOM1', b.p, { hostAddress: '127.0.0.1', port: PORT });
  await host.broadcastEvent({ type: 'PRIVATE_HAND_UPDATE', playerId: 'alice', hand: [{ id: 'k', color: 'RED', value: '5' }] } as any);
  await host.broadcastEvent({ type: 'CARD_DRAWN', playerId: 'alice', newCardCount: 8, drawnCard: { id: 'z' }, revision: 5 } as any);
  await host.broadcastEvent({ type: 'MATCH_STARTED', initialPublicState: {}, privateHand: [{ id: 'host-card' }] } as any);
  await waitFor(() => a.ev.some(e => e.type === 'MATCH_STARTED') && b.ev.some(e => e.type === 'MATCH_STARTED'));
  assert.ok(a.ev.some(e => e.type === 'PRIVATE_HAND_UPDATE'));
  assert.ok(!b.ev.some(e => e.type === 'PRIVATE_HAND_UPDATE'));
  assert.ok(a.ev.find(e => e.type === 'CARD_DRAWN').drawnCard);
  assert.ok(!b.ev.find(e => e.type === 'CARD_DRAWN').drawnCard);
  assert.ok(!JSON.stringify(a.ev).includes('host-card') && !JSON.stringify(b.ev).includes('host-card'));
  await a.g.disconnect(); await b.g.disconnect(); await host.disconnect();
});

test('waiting room: leaving removes the seat at once; in a match the seat is held then reconnect works with the token', async () => {
  const { host, hostEvents, room } = await makeHost();
  const a = guestOf('alice');
  await a.g.connect('ROOM1', a.p, { hostAddress: '127.0.0.1', port: PORT });
  await a.g.disconnect();
  await waitFor(() => hostEvents.some(e => e.type === 'PLAYER_LEFT' && e.playerId === 'alice'));

  const b = guestOf('bob');
  await b.g.connect('ROOM1', b.p, { hostAddress: '127.0.0.1', port: PORT });
  room.players.push(player('bob'));
  room.status = 'PLAYING'; host.setRoomStatus('PLAYING');
  (b.g as any).ws.close();                                    // network drop, not a deliberate leave
  await waitFor(() => hostEvents.some(e => e.type === 'PLAYER_DISCONNECTED' && e.playerId === 'bob'));
  await waitFor(() => b.ev.filter(e => e.type === 'ROOM_JOIN_ACCEPTED').length >= 2, 8000); // auto-rejoined
  assert.ok(hostEvents.some(e => e.type === 'PLAYER_RECONNECTED' && e.playerId === 'bob'));
  assert.ok(!hostEvents.some(e => e.type === 'PLAYER_LEFT' && e.playerId === 'bob'));
  // an impostor with the same id but no token is refused
  const evil = guestOf('bob');
  assert.strictEqual(await evil.g.connect('ROOM1', evil.p, { hostAddress: '127.0.0.1', port: PORT }), false);
  assert.strictEqual(evil.g.lastRejectReason, 'PLAYER_ID_IN_USE');
  await b.g.disconnect(); await host.disconnect();
});

test('host closing the room notifies guests and they do not retry', async () => {
  const { host } = await makeHost();
  const a = guestOf('alice');
  await a.g.connect('ROOM1', a.p, { hostAddress: '127.0.0.1', port: PORT });
  await host.disconnect();
  await waitFor(() => a.ev.some(e => e.type === 'ROOM_CLOSED'));
  await sleep(300);
  assert.notStrictEqual(a.g.getConnectionStatus(), 'RECONNECTING');
  await a.g.disconnect();
});

test('sanitizeEventFor unit cases', async () => {
  assert.strictEqual(sanitizeEventFor({ type: 'SYNC_STATE', targetPlayerId: 'a' }, 'b'), null);
  assert.ok(sanitizeEventFor({ type: 'SYNC_STATE', targetPlayerId: 'a' }, 'a'));
});

(async () => {
  let fail = 0;
  for (const [n, f] of tests) {
    try { await f(); console.log('ok   -', n); } catch (e: any) { fail++; console.log('FAIL -', n, '\n', e?.stack || e); }
    for (const t of open.splice(0)) await t.disconnect().catch(() => {});
  }
  process.exit(fail ? 1 : 0);
})();
