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
import type { TestContext } from 'node:test';
import policy from '../../../assets/node-runtime-policy.json' with { type: 'json' };
import { captureStopTarget } from '../../../shared/daemon-process-client.js';
import { processIdentityState, requireProcessIdentity, sameProcess } from '../../../shared/daemon-process.js';
import type { ProcessIdentity } from '../../../shared/daemon-process.js';
import { acquireRunFileGuard } from '../../../shared/daemon-run-files.js';
import { SourceInstallationStore, _setSourcePublicationFaultForTests } from '../../../shared/source-installation.js';
import type { SourceSelection } from '../../../shared/source-installation.js';
import { captureManagedReleasePin } from '../../managed-release-staging.js';
import type { StagedReleasePin } from '../../managed-release-staging.js';
import { LinuxSourceTransaction } from '../../source-update-transaction.js';
import type { SourceActor, SourceTransactionHost, SourceUpgrade } from '../../source-update-transaction.js';

const project = process.env.INSRC_SOURCE_TEST_REPO ?? fileURLToPath(new URL('../../../../', import.meta.url));
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const git = (cwd: string, ...args: string[]) => execFileSync('/usr/bin/git', ['-C', cwd, '-c', 'user.name=test',
 '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
const declaration = { version: 1 as const, graphSchema: 10, startup: 'rollback-compatible' as const,
 formats: { lance: '1', config: '1', repoAndIndexQueue: '1', workflowAndSession: '1' } };
export const daemon = `import fs from 'node:fs';import net from 'node:net';import {spawn} from 'node:child_process';
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
export interface Fixture {
 root: string; logical: string; runtime: string; broker: string; prior: StagedReleasePin;
 candidate: SourceSelection; initial: SourceSelection | null;
}
export async function fixture(t: TestContext, selected = false): Promise<Fixture> {
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
export function launch(runtime: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
 const child = spawn(runtime, args, { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
 launched.add(child); child.once('close', () => launched.delete(child)); return child;
}
export async function request(root: string, method: string): Promise<{ pid: number; child: number }> {
 return new Promise((resolve, reject) => {
  const socket = createConnection(join(root, 'daemon.sock')); let bytes = '';
  socket.setTimeout(3000, () => socket.destroy(new Error('fixture RPC timed out')));
  socket.on('error', reject);
  socket.once('connect', () => socket.end(JSON.stringify({ method }) + '\n'));
  socket.on('data', b => { bytes += b.toString(); });
  socket.once('end', () => { try { resolve(JSON.parse(bytes)); } catch (error) { reject(error); } });
 });
}
export async function waitExit(handle: { hasExited(): Promise<boolean> }) {
 for (let i = 0; i < 200; i++) { if (await handle.hasExited()) return; await delay(10); }
 throw new Error('retained fixture process exit was not observed');
}
export function upgrade(f: Fixture): SourceUpgrade {
 return { prior: f.prior, candidate: f.candidate, compatibility: { prior: { ...declaration, releaseId: f.prior.commit }, candidate: f.candidate.compatibility } };
}
export function host(f: Fixture, options: { failReady?: boolean; unknownChildren?: boolean; handoff?: boolean } = {}) {
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
  async start(pin, guard, record, grantEntry) {
   guard.assertOwned();
   assert.throws(() => acquireRunFileGuard(join(f.root, 'daemon.run-files.guard')), /guard/);
   assert.equal(existsSync(join(f.root, 'store-owner')), false);
   const child = launch(pin.runtime, [join(pin.root, 'out/daemon/index.js')], { ...process.env, FIXTURE_STATE: f.root });
   await once(child, 'message');
   const a = await actor(child.pid!); assert.ok(a);
   const receipt = join(receipts, hash(JSON.stringify([a.target.pid, a.target.startedAt])));
   writeFileSync(receipt, '[]', { mode: 0o600, flush: true }); // No child/store access before the grant.
   record(a); // The child cannot touch even the fixture store before the durable callback.
   if (options.handoff) {
    grantEntry();
    const startup = acquireRunFileGuard(join(f.root, 'daemon.run-files.guard'));
    try { startup.assertOwned(); assert.ok(new SourceInstallationStore(f.root, f.logical).read().active?.execution?.candidate); }
    finally { startup.release(); }
    events.push('entry-guard-acquired');
   }
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
export async function startOriginal(f: Fixture) {
 const child = launch(f.runtime, [join(f.prior.root, 'out/daemon/index.js')], { ...process.env, FIXTURE_STATE: f.root });
 await once(child, 'message'); child.send({ grant: true }); await once(child, 'message'); return child;
}
export async function stopFixture(f: Fixture) {
 const pid = Number(readFileSync(join(f.root, 'daemon.pid'), 'utf8'));
 const target = await captureStopTarget(pid, { executable: f.broker }); assert.ok(target);
 try { await request(f.root, 'shutdown'); await waitExit(target.handle); }
 finally { await target.handle.close(); }
 assert.equal(existsSync(join(f.root, 'store-owner')), false);
}

