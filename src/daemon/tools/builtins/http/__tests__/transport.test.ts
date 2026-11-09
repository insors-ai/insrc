import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Agent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';

import { httpRequestTool, httpWebSocketTool } from '../index.js';

test('HTTP tools preserve TLS validation, redirects, cancellation, and WebSocket negotiation', { timeout: 15_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'insrc-http-transport-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', keyPath, '-out', certPath,
  ], { stdio: 'ignore' });
  const cert = readFileSync(certPath);
  const started = new AbortController();
  const server = createServer({ key: readFileSync(keyPath), cert }, (req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/ok' }).end();
    } else if (req.url === '/slow') {
      started.abort();
    } else {
      res.end('trusted body');
    }
  });
  server.on('upgrade', (req, socket) => {
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade',
      'Sec-WebSocket-Accept: ' + accept, 'Sec-WebSocket-Protocol: insrc-test', '', '',
    ].join('\r\n'));
    socket.write(Buffer.from([0x81, 2, 0x6f, 0x6b]));
    socket.once('data', () => socket.end(Buffer.from([0x88, 2, 0x03, 0xe8])));
    t.after(() => socket.destroy());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const host = '127.0.0.1:' + address.port;
  const deps = { sessionId: 'transport', requestId: 1, repoPath: process.cwd(), send: () => {} };
  const untrusted = await httpRequestTool.execute({ url: 'https://' + host + '/ok' }, deps);
  assert.equal(untrusted.success, false);

  const previous = getGlobalDispatcher();
  const dispatcher = new Agent({ connect: { ca: cert } });
  setGlobalDispatcher(dispatcher);
  t.after(async () => { setGlobalDispatcher(previous); await dispatcher.destroy(); });
  const redirect = await httpRequestTool.execute({ url: 'https://' + host + '/redirect' }, deps);
  assert.equal(redirect.success, true);
  assert.match(redirect.output, /trusted body/);

  const signal = new AbortController();
  started.signal.addEventListener('abort', () => signal.abort(), { once: true });
  const canceled = await httpRequestTool.execute({ url: 'https://' + host + '/slow' }, { ...deps, signal: signal.signal });
  assert.equal(canceled.success, false);
  assert.equal(started.signal.aborted, true);

  const reply = await httpWebSocketTool.execute({
    url: 'wss://' + host + '/ws', protocols: ['insrc-test'], closeOnFirstReply: true, maxRuntimeMs: 2_000,
  }, deps);
  assert.equal(reply.success, true, reply.error);
  assert.match(reply.output, /recv\s+ok/);
});
