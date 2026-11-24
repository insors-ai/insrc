import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnFixture, stopOwnedChildren, childLine } from '../../daemon/tools/__tests__/_proc.js';
import { ControllerStore } from '../controller-store.js';
import { forwardImmediate } from '../operation-control.js';
import type { ManagerRequest } from '../contracts.js';
import type { ShutdownRequest } from '../peer-contracts.js';
import { managerFixture } from './_manager-fixture.js';

const program = fileURLToPath(new URL('./operation-control-fixture.mjs', import.meta.url));
const immediate = (operationId = 'operation'): ManagerRequest => ({ protocolVersion: 1, installationId: 'fixture', operationId, action: 'stop', shutdownMode: 'immediate' });
const snapshot = (home: string) => readFileSync(join(home, 'install/controller.json'), 'utf8');
const discoveryFile = (home: string) => join(home, 'install/operations/operation/control.json');
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function forward(home: string, children: ChildProcess[], request = immediate()) {
  const child = spawnFixture(process.execPath, ['--import', 'tsx/esm', program, 'forward', home, JSON.stringify(request)], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child); const closed = once(child, 'close'); const value = JSON.parse(await childLine(child)) as { error?: string; state?: { phase: string } };
  const [code, signal] = await closed; return { value, code, signal };
}

test('cross window immediate forwards while owner lock remains held', { timeout: 45_000 }, async () => {
  const f = managerFixture(), children: ChildProcess[] = [], draining = deferred<ShutdownRequest>(), completion = deferred<import('../peer-contracts.js').ShutdownCompletion>();
  let partial: Socket | undefined;
  f.peers.lifecycle!.waitShutdownCompletion = async (_location, request) => { draining.resolve(request); return completion.promise; };
  const manager = f.manager(), stopped = manager.execute({ ...immediate(), shutdownMode: 'graceful' });
  try {
    const shutdown = await draining.promise, before = snapshot(f.home), owner = readFileSync(discoveryFile(f.home), 'utf8');
    assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
    const [one, two] = await Promise.all([forward(f.home, children), forward(f.home, children)]);
    assert.equal(one.code, 0); assert.equal(two.code, 0); assert.equal(one.value.state?.phase, 'quiescing');
    assert.equal(snapshot(f.home), before); assert.equal(readFileSync(discoveryFile(f.home), 'utf8'), owner);
    assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
    await assert.rejects(f.manager().execute({ ...immediate('independent'), action: 'restart', shutdownMode: 'graceful' }), { code: 'busy' });
    const sent = f.state.shutdowns; assert.equal(sent.length, 2, 'duplicates coalesce at the live owner');
    assert.equal(sent[0]!.mode, 'graceful'); assert.equal(sent[1]!.mode, 'immediate');
    for (const key of ['operationId', 'expectedInstanceId', 'completionEndpoint', 'completionNonce'] as const) assert.equal(sent[1]![key], shutdown[key]);
    partial = createConnection((JSON.parse(owner) as { endpoint: string }).endpoint); partial.on('error', () => {});
    await once(partial, 'connect'); partial.write('{');
    const finishing = Date.now();
    completion.resolve({ operationId: shutdown.operationId, instanceId: shutdown.expectedInstanceId, completionNonce: shutdown.completionNonce, resourceOwnershipReleased: true });
    assert.equal((await stopped).state.phase, 'stopped');
    assert.ok(Date.now() - finishing < 5_000, 'a partial control frame cannot keep the owner open indefinitely');
    const lease = ControllerStore.acquire(f.location); lease.close();
    await assert.rejects(forwardImmediate(f.location, immediate()), { code: 'escalation-unavailable' });
  } finally {
    partial?.destroy();
    completion.resolve({ operationId: 'operation', instanceId: 'incumbent', completionNonce: f.state.shutdowns[0]?.completionNonce ?? '', resourceOwnershipReleased: true });
    await stopped.catch(() => {}); await stopOwnedChildren(children); f.cleanup();
  }
});

test('duplicate stale wrong phase and dead owner escalation preserve exact completion nonce', { timeout: 45_000 }, async () => {
  const f = managerFixture(), children: ChildProcess[] = [];
  try {
    await assert.rejects(forwardImmediate(f.location, immediate()), { code: 'escalation-unavailable' });
    const owner = spawnFixture(process.execPath, ['--import', 'tsx/esm', program, 'owner', f.home], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(owner);
    const draining = JSON.parse(await childLine(owner)) as { request: ShutdownRequest };
    const before = snapshot(f.home), path = discoveryFile(f.home), original = readFileSync(path, 'utf8');
    await assert.rejects(forwardImmediate(f.location, immediate('wrong-operation')), { code: 'escalation-unavailable' });
    await assert.rejects(forwardImmediate(f.location, { ...immediate(), installationId: 'wrong-installation' }), { code: 'escalation-unavailable' });
    writeFileSync(path, JSON.stringify({ ...JSON.parse(original), ownerNonce: '0'.repeat(64) }));
    await assert.rejects(forwardImmediate(f.location, immediate()), { code: 'escalation-unavailable' });
    writeFileSync(path, original);
    if (process.platform !== 'win32') {
      chmodSync(path, 0o644); await assert.rejects(forwardImmediate(f.location, immediate()), { code: 'escalation-unavailable' }); chmodSync(path, 0o600);
    }
    const unauthorized = await new Promise<unknown>((resolve, reject) => {
      const record = JSON.parse(original) as { endpoint: string };
      const socket = createConnection(record.endpoint); let raw = '';
      socket.setTimeout(5000, () => { socket.destroy(); reject(new Error('control fixture did not answer')); }); socket.on('error', reject);
      socket.on('connect', () => socket.write(JSON.stringify({ owner: { ...record, ownerNonce: 'f'.repeat(64) }, request: immediate() }) + '\n'));
      socket.on('data', chunk => { raw += String(chunk); if (raw.includes('\n')) { socket.end(); resolve(JSON.parse(raw.split('\n')[0]!)); } });
    });
    assert.deepEqual(unauthorized, { error: 'escalation-unavailable' });
    assert.equal(snapshot(f.home), before); assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
    const closed = once(owner, 'close'); owner.stdin!.end('exit\n'); assert.deepEqual(await closed, [0, null]);
    const gone = await forward(f.home, children); assert.equal(gone.value.error, 'escalation-unavailable'); assert.equal(gone.code, 1);
    assert.equal(snapshot(f.home), before, 'missing owner never authorizes recovery or mutation');
    const persisted = JSON.parse(readFileSync(join(f.home, 'install/operations/operation/shutdown.json'), 'utf8')) as ShutdownRequest;
    assert.equal(persisted.completionNonce, draining.request.completionNonce); assert.equal(persisted.completionEndpoint, draining.request.completionEndpoint);
    const lease = ControllerStore.acquire(f.location); lease.close();
  } finally { await stopOwnedChildren(children); f.cleanup(); }
});
