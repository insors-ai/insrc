import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, lstatSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import { authorizeLiveAdmission } from '../live-admission.js';
import type { LiveAdmissionReference } from '../live-admission.js';
import type { LaunchAdmission } from '../peer-contracts.js';
import { ControllerStore } from '../controller-store.js';
import { managerFixture } from './_manager-fixture.js';
import { childLine, spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';

const fixture = fileURLToPath(new URL('./live-admission-fixture.mjs', import.meta.url));
const probeFixture = fileURLToPath(new URL('./daemon-data-lease-fixture.mjs', import.meta.url));
type Fixture = ReturnType<typeof managerFixture>;
interface Session { admission: LaunchAdmission; reference: LiveAdmissionReference }
async function owner(f: Fixture, children: ChildProcess[]): Promise<{ child: ChildProcess; session: Session }> {
  const child = spawnFixture(process.execPath, ['--import', 'tsx/esm', fixture, 'owner', f.home], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child);
  const session = JSON.parse(await childLine(child, 10_000)) as Session;
  assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
  return { child, session };
}
async function candidate(f: Fixture, session: Session, children: ChildProcess[]): Promise<ChildProcess> {
  const child = spawnFixture(process.execPath, ['--import', 'tsx/esm', fixture, 'candidate', f.home], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child);
  const ready = childLine(child, 10_000); child.stdin!.write(JSON.stringify(session) + '\n'); assert.match(await ready, /waiting/); return child;
}
async function command(child: ChildProcess, value: string): Promise<string> {
  const reply = childLine(child, 10_000); child.stdin!.write(value + '\n'); return (await reply).trim();
}
async function exit(child: ChildProcess): Promise<void> {
  const closed = once(child, 'close'); child.stdin!.end('exit\n'); assert.deepEqual(await closed, [0, null]);
}
async function probe(f: Fixture, children: ChildProcess[]): Promise<string> {
  const child = spawnFixture(process.execPath, [probeFixture, f.home, 'probe'], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
  const closed = once(child, 'close'); const reply = await childLine(child, 10_000); assert.deepEqual(await closed, [0, null]); return reply.trim();
}
async function deniedFrame(address: string, frame: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection(address); let received = '';
    const deadline = setTimeout(() => { socket.destroy(); reject(new Error('Invalid fixture frame did not close within its bound')); }, 5_000);
    socket.on('error', () => {}); socket.on('data', data => { received += data.toString(); });
    socket.once('close', () => { clearTimeout(deadline); try { assert.equal(received, ''); resolve(); } catch (error) { reject(error); } });
    socket.once('connect', () => socket.write(frame));
  });
}

test('live launch admission requires ordered one-use barriers and an exact current session', { timeout: 90_000 }, async () => {
  const f = managerFixture(), children: ChildProcess[] = [];
  try {
    const o = await owner(f, children), { admission, reference } = o.session;
    if (process.platform !== 'win32') assert.equal(lstatSync(reference.endpoint).mode & 0o777, 0o600);
    await assert.rejects(authorizeLiveAdmission(f.location, admission, reference, 'lease'), { code: 'admission-unavailable' });
    await assert.rejects(authorizeLiveAdmission(f.location, { ...admission, completionNonce: 'd'.repeat(64) }, reference, 'spawn'), { code: 'admission-unavailable' });
    await assert.rejects(authorizeLiveAdmission(f.location, admission, { ...reference, endpoint: reference.endpoint + '-foreign' }, 'spawn'), { code: 'admission-unavailable' });
    await authorizeLiveAdmission(f.location, admission, reference, 'spawn');
    await assert.rejects(authorizeLiveAdmission(f.location, admission, reference, 'spawn'), { code: 'admission-unavailable' });
    const actor = await candidate(f, o.session, children);
    assert.equal(await command(actor, 'lease'), 'lease-held');
    assert.equal(await command(actor, 'stores'), 'admitted');
    assert.equal(await probe(f, children), 'busy');
    await assert.rejects(authorizeLiveAdmission(f.location, admission, reference, 'lease'), { code: 'admission-unavailable' });
    await exit(actor); await exit(o.child);
  } finally { await stopOwnedChildren(children); f.cleanup(); }
});

test('delayed spawn and pre-lease actors cannot launch from durable admission after manager exit', { timeout: 90_000 }, async () => {
  for (const barrier of ['spawn', 'lease'] as const) {
    const f = managerFixture(), children: ChildProcess[] = [];
    try {
      const o = await owner(f, children);
      if (barrier === 'spawn') {
        await exit(o.child);
        await assert.rejects(authorizeLiveAdmission(f.location, o.session.admission, o.session.reference, 'spawn'), { code: 'admission-unavailable' });
      } else {
        await authorizeLiveAdmission(f.location, o.session.admission, o.session.reference, 'spawn');
        const actor = await candidate(f, o.session, children); await exit(o.child);
        const closed = once(actor, 'close'); assert.equal(await command(actor, 'lease'), 'blocked-before-lease'); assert.deepEqual(await closed, [0, null]);
      }
      assert.equal(existsSync(join(f.home, 'install/daemon-data.lock')), false);
      assert.equal(existsSync(join(f.home, 'fixture-store-opened')), false);
    } finally { await stopOwnedChildren(children); f.cleanup(); }
  }
});

test('manager loss after lease but before final grant denies stores and releases only at child exit', { timeout: 90_000 }, async () => {
  const f = managerFixture(), children: ChildProcess[] = [];
  try {
    const o = await owner(f, children); await authorizeLiveAdmission(f.location, o.session.admission, o.session.reference, 'spawn');
    const actor = await candidate(f, o.session, children); assert.equal(await command(actor, 'lease'), 'lease-held');
    await exit(o.child); assert.equal(await probe(f, children), 'busy');
    const closed = once(actor, 'close'); assert.equal(await command(actor, 'stores'), 'blocked-before-stores'); assert.deepEqual(await closed, [0, null]);
    assert.equal(existsSync(join(f.home, 'fixture-store-opened')), false);
    assert.equal(await probe(f, children), 'acquired');
  } finally { await stopOwnedChildren(children); f.cleanup(); }
});

test('final admitted child survives manager loss without inheriting its controller lock', { timeout: 90_000 }, async () => {
  const f = managerFixture(), children: ChildProcess[] = [];
  try {
    const o = await owner(f, children); await authorizeLiveAdmission(f.location, o.session.admission, o.session.reference, 'spawn');
    const actor = await candidate(f, o.session, children); assert.equal(await command(actor, 'lease'), 'lease-held');
    assert.equal(await command(actor, 'stores'), 'admitted'); await exit(o.child);
    assert.equal(actor.exitCode, null); assert.equal(existsSync(join(f.home, 'fixture-store-opened')), true);
    const controller = ControllerStore.acquire(f.location); controller.assertHeld(); controller.close();
    assert.equal(await probe(f, children), 'busy');
    await exit(actor); assert.equal(await probe(f, children), 'acquired');
  } finally { await stopOwnedChildren(children); f.cleanup(); }
});

test('replaced durable admission revision and cancellation revoke later live barriers', { timeout: 90_000 }, async () => {
  for (const revoke of ['replace-admission', 'replace-revision', 'cancel']) {
    const f = managerFixture(), children: ChildProcess[] = [];
    try {
      const o = await owner(f, children); await authorizeLiveAdmission(f.location, o.session.admission, o.session.reference, 'spawn');
      assert.match(await command(o.child, revoke), /replaced|cancelled/);
      const actor = await candidate(f, o.session, children);
      const closed = once(actor, 'close'); assert.equal(await command(actor, 'lease'), 'blocked-before-lease'); assert.deepEqual(await closed, [0, null]);
      assert.equal(existsSync(join(f.home, 'fixture-store-opened')), false); await exit(o.child);
    } finally { await stopOwnedChildren(children); f.cleanup(); }
  }
});

test('invalid capability oversized frames and client cancellation cannot consume live admission', { timeout: 90_000 }, async () => {
  const f = managerFixture(), children: ChildProcess[] = [];
  try {
    const o = await owner(f, children), { admission, reference } = o.session;
    const abort = new AbortController(); abort.abort();
    await assert.rejects(authorizeLiveAdmission(f.location, admission, reference, 'spawn', abort.signal), { code: 'admission-unavailable' });
    await deniedFrame(reference.endpoint, JSON.stringify({ protocolVersion: 1, capability: '0'.repeat(64), admission, barrier: 'spawn', challenge: 'd'.repeat(64) }) + '\n');
    await deniedFrame(reference.endpoint, 'x'.repeat(65_537));
    await authorizeLiveAdmission(f.location, admission, reference, 'spawn');
    await exit(o.child);
  } finally { await stopOwnedChildren(children); f.cleanup(); }
});

test('final store grant requires the actual retained lease for the selected installation', { timeout: 90_000 }, async () => {
  const f = managerFixture(), children: ChildProcess[] = [];
  try {
    const o = await owner(f, children); await authorizeLiveAdmission(f.location, o.session.admission, o.session.reference, 'spawn');
    const actor = await candidate(f, o.session, children);
    assert.equal(await command(actor, 'fake-stores'), 'invalid-lease-rejected');
    assert.equal(await command(actor, 'lease'), 'lease-held');
    assert.equal(await command(actor, 'foreign-stores'), 'invalid-lease-rejected');
    assert.equal(existsSync(join(f.home, 'fixture-store-opened')), false);
    assert.equal(await command(actor, 'stores'), 'admitted');
    await exit(actor); await exit(o.child);
  } finally { await stopOwnedChildren(children); f.cleanup(); }
});
