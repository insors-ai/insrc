/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import type { TestContext } from 'node:test';
import policy from '../../assets/node-runtime-policy.json' with { type: 'json' };
import { captureStopTarget } from '../../shared/daemon-process-client.js';
import { processIdentityState, requireProcessIdentity, sameProcess } from '../../shared/daemon-process.js';
import type { ProcessIdentity } from '../../shared/daemon-process.js';
import { acquireRunFileGuard } from '../../shared/daemon-run-files.js';
import { SourceInstallationStore, _setSourcePublicationFaultForTests } from '../../shared/source-installation.js';
import type { SourceSelection } from '../../shared/source-installation.js';
import { captureManagedReleasePin } from '../managed-release-staging.js';
import type { StagedReleasePin } from '../managed-release-staging.js';
import { LinuxSourceTransaction } from '../source-update-transaction.js';
import type { SourceActor, SourceTransactionHost, SourceUpgrade } from '../source-update-transaction.js';
import { sourceLinux } from './helpers/source-linux.js';

const file = fileURLToPath(import.meta.url);
const project = process.env.INSRC_SOURCE_TEST_REPO ?? fileURLToPath(new URL('../../../', import.meta.url));
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const git = (cwd: string, ...args: string[]) => execFileSync('/usr/bin/git', ['-C', cwd, '-c', 'user.name=test',
 '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
const declaration = { version: 1 as const, graphSchema: 10, startup: 'rollback-compatible' as const,
 formats: { lance: '1', config: '1', repoAndIndexQueue: '1', workflowAndSession: '1' } };
const daemon = `import fs from 'node:fs';import net from 'node:net';import {spawn} from 'node:child_process';
const state=process.env.FIXTURE_STATE, lock=state+'/store-owner', pid=state+'/daemon.pid', socket=state+'/daemon.sock';
let granted=false, child;
process.once('disconnect',()=>{if(!granted)process.exit(0);});
process.once('message',()=>{
 granted=true;fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
 child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 const server=net.createServer(connection=>connection.once('data',bytes=>{
  const request=JSON.parse(bytes.toString());
  if(request.method==='status')connection.end(JSON.stringify({pid:process.pid,child:child.pid})+'\\n');
  if(request.method==='shutdown'){
   connection.end('{}\\n');
   child.once('close',()=>{fs.rmSync(lock);fs.rmSync(pid);server.close(()=>process.exit(0));});child.kill('SIGTERM');
  }
 }));
 server.listen(socket,()=>{fs.writeFileSync(pid,String(process.pid));process.send?.({ready:true});});
});
process.send?.({waiting:true});
`;
interface Fixture {
 root: string; logical: string; runtime: string; broker: string; prior: StagedReleasePin;
 candidate: SourceSelection; initial: SourceSelection | null;
}
async function fixture(t: TestContext, selected = false): Promise<Fixture> {
 const root = mkdtempSync(join(tmpdir(), 'insrc-linux-cutover-')), logical = join(root, 'daemon');
 mkdirSync(logical, { mode: 0o700 });
 const target = `linux-${process.arch}` as 'linux-arm64' | 'linux-x64';
 const runtime = join(root, 'runtimes', `node-v${policy.nodeVersion}-${target}`, policy.targets[target].sha256, 'distribution/bin/node');
 mkdirSync(dirname(runtime), { recursive: true, mode: 0o700 }); copyFileSync(process.execPath, runtime);
 const broker = join(root, 'process-broker'), source = join(project, 'src/native/process-broker');
 execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', join(source, 'main.c'), join(source, 'linux.c'), '-o', broker]);
 const release = async (name: string, directory: string, sequence: number): Promise<SourceSelection> => {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const dir of ['out/daemon', 'node_modules', 'packages/project-memory']) mkdirSync(join(directory, dir), { recursive: true });
  writeFileSync(join(directory, '.gitignore'), 'out/\nnode_modules/\npackages/\n');
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, type: 'module' }));
  writeFileSync(join(directory, 'package-lock.json'), '{}');
  writeFileSync(join(directory, 'out/daemon/index.js'), daemon);
  git(directory, 'init', '-qb', 'main'); git(directory, 'add', '.'); git(directory, 'commit', '-qm', name);
  const pin = await captureManagedReleasePin(directory, runtime);
  const binding = join(root, 'source-runtimes', `${hash(directory)}.json`);
  mkdirSync(dirname(binding), { recursive: true, mode: 0o700 });
  writeFileSync(binding, JSON.stringify({ schemaVersion: 1, installationRoot: directory, target, nodeVersion: policy.nodeVersion,
   archiveSha256: policy.targets[target].sha256, distribution: dirname(dirname(runtime)), inventorySha256: 'f'.repeat(64) }), { mode: 0o600 });
  return { pin, target, toolchain: { nodeVersion: policy.nodeVersion, archiveSha256: policy.targets[target].sha256 }, binding,
   source: { channel: { repoUrl: 'https://example.invalid/source', branch: 'main' }, sequence,
    tagObject: name === 'prior' ? 'a'.repeat(40) : 'b'.repeat(40), commit: pin.commit, tree: git(directory, 'rev-parse', 'HEAD^{tree}') },
   compatibility: { ...declaration, releaseId: pin.commit } };
 };
 const old = await release('prior', selected ? join(root, 'source-lifecycle/releases/prior/checkout') : logical, 1);
 const candidate = await release('candidate', join(root, 'source-lifecycle/releases/candidate/checkout'), 2);
 const f = { root, logical, runtime, broker, prior: old.pin, candidate, initial: selected ? old : null };
 const store = new SourceInstallationStore(root, logical);
 store.update(0, state => ({ ...state, selected: f.initial, sourceReleases: selected ? [old.source] : [] }));
 t.after(async () => {
  _setSourcePublicationFaultForTests();
  const pid = existsSync(join(root, 'daemon.pid')) ? Number(readFileSync(join(root, 'daemon.pid'), 'utf8')) : undefined;
  if (pid !== undefined) {
   const target = await captureStopTarget(pid, { executable: broker });
   if (target) {
    try { await request(root, 'shutdown'); await waitExit(target.handle); }
    finally { await target.handle.close(); }
   }
  }
  for (const child of launched) if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'close'); }
  rmSync(root, { recursive: true, force: true });
 });
 return f;
}
const launched = new Set<ChildProcess>();
function launch(runtime: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
 const child = spawn(runtime, args, { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
 launched.add(child); child.once('close', () => launched.delete(child)); return child;
}
async function request(root: string, method: string): Promise<{ pid: number; child: number }> {
 return new Promise((resolve, reject) => {
  const socket = createConnection(join(root, 'daemon.sock')); let bytes = '';
  socket.setTimeout(3000, () => socket.destroy(new Error('fixture RPC timed out')));
  socket.on('error', reject);
  socket.once('connect', () => socket.end(JSON.stringify({ method }) + '\n'));
  socket.on('data', b => { bytes += b.toString(); });
  socket.once('end', () => { try { resolve(JSON.parse(bytes)); } catch (error) { reject(error); } });
 });
}
async function waitExit(handle: { hasExited(): Promise<boolean> }) {
 for (let i = 0; i < 200; i++) { if (await handle.hasExited()) return; await delay(10); }
 throw new Error('retained fixture process exit was not observed');
}
function upgrade(f: Fixture): SourceUpgrade {
 return { prior: f.prior, candidate: f.candidate, compatibility: { prior: { ...declaration, releaseId: f.prior.commit }, candidate: f.candidate.compatibility } };
}
function host(f: Fixture, options: { failReady?: boolean; unknownChildren?: boolean } = {}) {
 const events: string[] = [];
 const receipts = join(f.root, 'actors'); mkdirSync(receipts, { recursive: true, mode: 0o700 });
 const actor = async (pid: number): Promise<SourceActor | null> => {
  const target = await captureStopTarget(pid, { executable: f.broker }); if (!target) return null;
  let children: ProcessIdentity[] = [];
  const receipt = join(receipts, hash(JSON.stringify([target.pid, target.startedAt])));
  if (existsSync(receipt)) children = JSON.parse(readFileSync(receipt, 'utf8')) as ProcessIdentity[];
  return {
   target,
   async childrenClosed() {
    if (options.unknownChildren) throw new Error('descendant closure is unknown');
    for (const child of children) assert.notEqual(processIdentityState(child), 'same', 'owned descendant remains alive');
    events.push('children-closed');
   },
   async shutdown() { events.push('shutdown'); await request(f.root, 'shutdown'); await waitExit(target.handle); },
   async observeChildren() {
    const status = await request(f.root, 'status'); assert.equal(status.pid, target.pid);
    children = [requireProcessIdentity(status.child)];
    writeFileSync(receipt, JSON.stringify(children), { mode: 0o600, flush: true });
   },
  } as SourceActor & { observeChildren(): Promise<void> };
 };
 const rememberChildren = async (a: SourceActor) => { await (a as SourceActor & { observeChildren(): Promise<void> }).observeChildren(); };
 const effects: SourceTransactionHost = {
  async capture(_initial, prior) {
   if (!existsSync(join(f.root, 'daemon.pid'))) { assert.equal(existsSync(join(f.root, 'daemon.sock')), false); return null; }
   const a = await actor(Number(readFileSync(join(f.root, 'daemon.pid'), 'utf8'))); assert.ok(a);
   assert.ok(a.target.commandLine.endsWith(join(prior.root, 'out/daemon/index.js')));
   await rememberChildren(a); return a;
  },
  async recover(expected) {
   const a = await actor(expected.pid); if (!a) return null;
   if (!sameProcess(a.target, expected)) { await a.target.handle.close(); throw new Error('replacement actor preserved'); }
   if (!existsSync(join(f.root, 'daemon.pid'))) {
    try { await waitExit(a.target.handle); }
    finally { await a.target.handle.close(); }
    return null; // Ungranted fixture child exits when its controller channel closes.
   }
   try { await rememberChildren(a); return a; }
   catch (error) { await a.target.handle.close(); throw error; }
  },
  async proveClosed(expected) {
   assert.notEqual(processIdentityState(expected), 'same');
   const children = JSON.parse(readFileSync(join(receipts, hash(JSON.stringify([expected.pid, expected.startedAt]))), 'utf8')) as ProcessIdentity[];
   for (const child of children) assert.notEqual(processIdentityState(child), 'same');
  },
  async quiescent(_prior, _candidate, guard) {
   guard.assertOwned(); assert.equal(existsSync(join(f.root, 'store-owner')), false, 'a daemon still owns the fixture store');
   assert.equal(existsSync(join(f.root, 'daemon.pid')), false); assert.equal(existsSync(join(f.root, 'daemon.sock')), false);
   events.push('quiescent');
  },
  async verifyStores(_pair, guard) { guard.assertOwned(); assert.equal(existsSync(join(f.root, 'store-owner')), false); events.push('stores-qualified'); },
  async verifyRuntime(selection) { assert.equal(selection.pin.runtime, f.runtime); events.push('runtime-verified'); },
  async start(pin, guard, record) {
   guard.assertOwned();
   assert.throws(() => acquireRunFileGuard(join(f.root, 'daemon.run-files.guard')), /guard/);
   assert.equal(existsSync(join(f.root, 'store-owner')), false);
   const child = launch(pin.runtime, [join(pin.root, 'out/daemon/index.js')], { ...process.env, FIXTURE_STATE: f.root });
   await once(child, 'message');
   const a = await actor(child.pid!); assert.ok(a);
   const receipt = join(receipts, hash(JSON.stringify([a.target.pid, a.target.startedAt])));
   writeFileSync(receipt, '[]', { mode: 0o600, flush: true }); // No child/store access before the grant.
   record(a); // The child cannot touch even the fixture store before the durable callback.
   writeFileSync(receipt, '{"pendingGrant":true}', { mode: 0o600, flush: true });
   child.send({ grant: true }); await once(child, 'message'); await rememberChildren(a);
   events.push(pin.commit === f.prior.commit ? 'start-prior' : 'start-candidate'); return a;
  },
  async ready(a, pin) {
   assert.ok(a.target.commandLine.endsWith(join(pin.root, 'out/daemon/index.js')));
   const status = await request(f.root, 'status'); assert.equal(status.pid, a.target.pid);
   assert.equal(await a.target.handle.hasExited(), false);
   if (options.failReady && pin.commit === f.candidate.pin.commit) throw new Error('fixture candidate readiness failed');
   events.push('ready');
  },
 };
 return { effects, events };
}
async function startOriginal(f: Fixture) {
 const child = launch(f.runtime, [join(f.prior.root, 'out/daemon/index.js')], { ...process.env, FIXTURE_STATE: f.root });
 await once(child, 'message'); child.send({ grant: true }); await once(child, 'message'); return child;
}
async function stopFixture(f: Fixture) {
 const pid = Number(readFileSync(join(f.root, 'daemon.pid'), 'utf8'));
 const target = await captureStopTarget(pid, { executable: f.broker }); assert.ok(target);
 try { await request(f.root, 'shutdown'); await waitExit(target.handle); }
 finally { await target.handle.close(); }
 assert.equal(existsSync(join(f.root, 'store-owner')), false);
}

if (process.env.INSRC_SOURCE_TRANSACTION_WORKER) {
 const { fixture: f, phase } = JSON.parse(process.env.INSRC_SOURCE_TRANSACTION_WORKER) as { fixture: Fixture; phase: string };
 const store = new SourceInstallationStore(f.root, f.logical), h = host(f,
  { failReady: ['rollback-required', 'rolled-back'].includes(phase) || phase.includes('prior'), unknownChildren: phase === 'recovery-required' });
 _setSourcePublicationFaultForTests(point => {
  const active = store.read().active;
  const checkpoint = phase === 'spawn-prior-recorded'
   ? active?.execution?.step === 'spawn-prior' && active.execution.restored !== null
   : phase === 'spawn-prior-unrecorded' ? active?.execution?.step === 'spawn-prior' && active.execution.restored === null
   : phase.startsWith('prior-ready') ? active?.execution?.step === 'prior-ready' : active?.phase === phase;
  if (point === 'after-rename' && checkpoint) process.exit(81);
 });
 await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
 process.exit(82);
} else {
 test('Linux original-process closure precedes selection and candidate start', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
  const f = await fixture(t), store = new SourceInstallationStore(f.root, f.logical), h = host(f);
  const original = await startOriginal(f), before = store.read().selected;
  const failed = await new LinuxSourceTransaction(store, h.effects).update(async () => {
   await assert.rejects(new LinuxSourceTransaction(store, h.effects).exclusive(async () => {}), /guard/);
   throw new Error('fixture npm failed');
  });
  assert.equal(failed.decision, 'rolled-back'); assert.deepEqual(store.read().selected, before);
  assert.equal((await request(f.root, 'status')).pid, original.pid); assert.equal(h.events.includes('shutdown'), false);
  const result = await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
  assert.equal(result.decision, 'committed'); assert.deepEqual(store.read().selected, f.candidate);
  assert.equal(store.read().active, null);
  assert.ok(h.events.indexOf('children-closed') < h.events.indexOf('stores-qualified'));
  assert.ok(h.events.indexOf('stores-qualified') < h.events.indexOf('start-candidate'));
  assert.notEqual((await request(f.root, 'status')).pid, original.pid);
  assert.equal(existsSync(join(f.root, 'daemon.run-files.guard')), false);
 }));

 test('Interrupted cutover and failed readiness recover exact prior selection and running state', { timeout: 600_000 }, async t => sourceLinux(t, file, project, async () => {
  for (const selected of [false, true]) {
   const f = await fixture(t, selected), store = new SourceInstallationStore(f.root, f.logical), h = host(f, { failReady: true });
   await startOriginal(f);
   const result = await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
   assert.equal(result.decision, 'rolled-back', result.detail); assert.deepEqual(store.read().selected, f.initial);
   assert.ok(h.events.indexOf('start-candidate') < h.events.indexOf('start-prior'));
   assert.equal(store.read().active, null); await stopFixture(f);
  }
  // Interrupt real controller processes after durable checkpoints. The replacement controller
  // reclaims only a dead owner's guard and captures exact actors through the real Linux broker.
  for (const point of ['before-rename', 'after-rename'] as const) {
   const f = await fixture(t), store = new SourceInstallationStore(f.root, f.logical), h = host(f);
   await startOriginal(f); let injected = false;
   _setSourcePublicationFaultForTests(observed => {
    const current = store.read();
    if (!injected && observed === point && current.active?.execution?.step === 'select-candidate'
     && (point === 'before-rename' || current.active.phase === 'candidate-selected')) {
     injected = true; throw new Error('injected selection publication failure');
    }
   });
   const result = await new LinuxSourceTransaction(store, h.effects).update(async () => upgrade(f));
   _setSourcePublicationFaultForTests(); assert.equal(injected, true);
   assert.equal(result.decision, point === 'after-rename' ? 'committed' : 'rolled-back', result.detail);
   assert.deepEqual(store.read().selected, point === 'after-rename' ? f.candidate : null);
   await stopFixture(f);
  }
  for (const phase of ['reserved', 'staged', 'predecessor-exited', 'candidate-selected', 'candidate-ready', 'committed',
   'rollback-required', 'rolled-back', 'recovery-required', 'spawn-prior-unrecorded', 'spawn-prior-recorded', 'prior-ready', 'prior-ready-exited']) {
   const f = await fixture(t, phase === 'candidate-ready'), store = new SourceInstallationStore(f.root, f.logical);
   await startOriginal(f);
   const args = file.endsWith('.ts') ? ['--import', fileURLToPath(import.meta.resolve('tsx/esm')), file] : [file];
   const worker = spawn(process.execPath, args, { env: { ...process.env, INSRC_SOURCE_TRANSACTION_WORKER: JSON.stringify({ fixture: f, phase }) }, stdio: ['ignore', 'pipe', 'pipe'] });
   let stderr = ''; worker.stderr.on('data', chunk => { stderr += chunk.toString(); });
   const [code] = await once(worker, 'close'); assert.equal(code, 81, stderr);
   const h = host(f), restored = store.read().active?.execution?.restored;
   if (phase === 'prior-ready-exited') {
    assert.ok(restored);
    const actor = await h.effects.recover(restored); assert.ok(actor);
    try { await actor.shutdown(); await actor.childrenClosed(); }
    finally { await actor.target.handle.close(); }
   }
   const result = await new LinuxSourceTransaction(store, h.effects).recover();
   if (phase === 'spawn-prior-unrecorded') {
    assert.equal(result?.decision, 'recovery-required', result?.detail);
    assert.equal(h.events.includes('start-prior'), false, 'unrecorded spawn must not be repeated');
    assert.equal(store.read().active?.execution?.restored, null);
    continue;
   }
   assert.equal(result?.decision, phase === 'committed' ? 'committed' : 'rolled-back', result?.detail);
   assert.deepEqual(store.read().selected, phase === 'committed' ? f.candidate : f.initial);
   assert.equal(store.read().active, null);
   const status = await request(f.root, 'status'); assert.ok(status);
   if (phase === 'prior-ready') assert.equal(status.pid, restored?.pid, 'already-restored running prior must be preserved');
   if (phase === 'prior-ready-exited') assert.notEqual(status.pid, restored?.pid, 'closed restored prior must be restarted');
   await stopFixture(f);
  }
  const idle = await fixture(t), idleStore = new SourceInstallationStore(idle.root, idle.logical), idleHost = host(idle);
  const idleResult = await new LinuxSourceTransaction(idleStore, idleHost.effects).update(async () => upgrade(idle));
  assert.equal(idleResult.decision, 'committed'); assert.equal(idleHost.events.includes('start-candidate'), false);
  assert.deepEqual(idleStore.read().selected, idle.candidate);
  for (const operation of ['start', 'start', 'restart', 'stop', 'restart', 'stop'] as const) {
   const previous = existsSync(join(idle.root, 'daemon.pid')) ? Number(readFileSync(join(idle.root, 'daemon.pid'), 'utf8')) : undefined;
   const result = await new LinuxSourceTransaction(idleStore, idleHost.effects).lifecycle(operation);
   assert.equal(result.decision, 'committed', result.detail);
   assert.deepEqual(idleStore.read().selected, idle.candidate);
   if (operation === 'stop') assert.equal(existsSync(join(idle.root, 'store-owner')), false);
   else {
    const current = (await request(idle.root, 'status')).pid;
    if (operation === 'start' && previous) assert.equal(current, previous, 'already-running start must not restart');
    if (operation === 'restart') assert.notEqual(current, previous, 'restart must start even when previously stopped');
   }
  }
  assert.equal(idleStore.read().retainedSelections.length, 1, 'same release is retained once across ordinary lifecycle actions');
  const uncertain = await fixture(t), uncertainStore = new SourceInstallationStore(uncertain.root, uncertain.logical);
  await startOriginal(uncertain);
  const fenced = await new LinuxSourceTransaction(uncertainStore, host(uncertain, { unknownChildren: true }).effects).update(async () => upgrade(uncertain));
  assert.equal(fenced.decision, 'recovery-required'); assert.equal(uncertainStore.read().selected, null);
  await assert.rejects(new LinuxSourceTransaction(uncertainStore, host(uncertain).effects).exclusive(async () => {}), /guard/);
  const replaced = await fixture(t), replacedStore = new SourceInstallationStore(replaced.root, replaced.logical);
  const lease = replacedStore.acquireLifecycleGuard('mutation');
  const parent = join(replaced.root, 'source-lifecycle');
  renameSync(parent, `${parent}-retained`); mkdirSync(parent, { mode: 0o700 });
  writeFileSync(join(parent, 'sentinel'), 'preserved');
  assert.throws(() => lease.assertOwned(), /replaced/);
  assert.throws(() => lease.release(), /replaced/);
  assert.equal(readFileSync(join(parent, 'sentinel'), 'utf8'), 'preserved');
 }));
}
