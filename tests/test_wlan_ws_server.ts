// Runs the real WsServer (the code the app ships) over node:net with the
// reference `ws` client. Run: npx tsx tests/test_wlan_ws_server.ts
import * as net from 'net';
import * as assert from 'assert';
import WebSocket from 'ws';
import { WsServer } from '../src/multiplayer/wlan/WsServer';
import { sha1, base64Encode, utf8Encode } from '../src/multiplayer/wlan/bytes';

const PORT = 18741;
const tests: Array<[string, () => Promise<void>]> = [];
const test = (n: string, f: () => Promise<void>) => tests.push([n, f]);

test('sha1/base64 match the RFC 6455 sample accept key', async () => {
  const accept = base64Encode(sha1(utf8Encode('dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11')));
  assert.strictEqual(accept, 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

async function withServer(fn: (s: WsServer) => Promise<void>) {
  const s = new WsServer({ createServer: () => net.createServer() as any, getInfo: () => ({ code: 'ABCD', n: 1 }), pingIntervalMs: 100, idleTimeoutMs: 600 });
  await s.listen(PORT);
  try { await fn(s); } finally { await s.close(); }
}
const once = <T>(f: (res: (v: T) => void) => void) => new Promise<T>(res => f(res));

test('echo text incl. unicode, large (fragmented by ws) and many messages', async () => {
  await withServer(async s => {
    s.onConnection = c => { c.onMessage = m => c.send('echo:' + m); };
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await once<void>(r => ws.on('open', () => r()));
    const big = 'x'.repeat(70000) + '🎴é';
    for (const msg of ['hi', 'ünï🎴', big]) {
      const p = once<string>(r => ws.once('message', d => r(d.toString())));
      ws.send(msg);
      assert.strictEqual(await p, 'echo:' + msg);
    }
    ws.close();
  });
});

test('GET /uno-info returns room beacon over plain HTTP', async () => {
  await withServer(async () => {
    const body = await once<string>(r => {
      const sock = net.connect(PORT, '127.0.0.1', () => sock.write('GET /uno-info HTTP/1.1\r\nHost: x\r\n\r\n'));
      let d = '';
      sock.on('data', c => (d += c));
      sock.on('close', () => r(d));
    });
    assert.ok(body.startsWith('HTTP/1.1 200'));
    assert.ok(body.endsWith('{"code":"ABCD","n":1}'));
  });
});

test('garbage and unmasked frames are rejected without crashing the server', async () => {
  await withServer(async s => {
    let opened = 0;
    s.onConnection = () => opened++;
    await once<void>(r => { const x = net.connect(PORT, '127.0.0.1', () => { x.write('NOT HTTP\r\n\r\n'); }); x.resume(); x.on('close', () => r()); });
    // valid handshake then an unmasked frame -> server must close
    const closed = await once<boolean>(r => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      ws.on('open', () => { (ws as any)._socket.write(Buffer.from([0x81, 0x02, 0x68, 0x69])); });
      ws.on('close', () => r(true));
      ws.on('error', () => r(true));
    });
    assert.ok(closed);
    // server still serves new clients
    const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}`);
    await once<void>(r => ws2.on('open', () => r()));
    ws2.close();
    assert.ok(opened >= 2);
  });
});

test('idle client that never answers pings is dropped; ponging client survives', async () => {
  await withServer(async s => {
    const gone: string[] = [];
    s.onConnection = c => { c.onClose = () => gone.push(c.id); };
    const good = new WebSocket(`ws://127.0.0.1:${PORT}`);               // ws auto-pongs
    await once<void>(r => good.on('open', () => r()));
    const bad = new WebSocket(`ws://127.0.0.1:${PORT}`, { autoPong: false } as any);
    await once<void>(r => bad.on('open', () => r()));
    await new Promise(r => setTimeout(r, 1200));
    assert.strictEqual(gone.length, 1, 'exactly the silent client is dropped');
    assert.strictEqual(good.readyState, WebSocket.OPEN);
    good.close();
  });
});

(async () => {
  let fail = 0;
  for (const [n, f] of tests) {
    try { await f(); console.log('ok   -', n); } catch (e: any) { fail++; console.log('FAIL -', n, '\n', e?.stack || e); }
  }
  process.exit(fail ? 1 : 0);
})();
