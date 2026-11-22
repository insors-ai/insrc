/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { SourceNativeActor, sourceActorRpc } from '../source-actor-client.js';
import { requireProcessIdentity, processIdentityState } from '../daemon-process.js';
import { sourceLinux } from '../../daemon/__tests__/helpers/source-linux.js';

const file = fileURLToPath(import.meta.url), project = process.env.INSRC_SOURCE_TEST_REPO ?? fileURLToPath(new URL('../../../', import.meta.url));
async function fixture(t: TestContext) {
 const root = mkdtempSync(join(tmpdir(), 'insrc-source-actor-')), release = join(root, 'release');
 mkdirSync(join(release, 'out/daemon'), { recursive: true });
 mkdirSync(join(release, 'out/bin'), { recursive: true });
 const binary = join(release, 'out/bin/insrc-source-actor'), broker = join(root, 'broker');
 const native = join(project, 'src/native');
 execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', join(native, 'source-actor/main.c'), '-o', binary]);
 execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', join(native, 'process-broker/main.c'), join(native, 'process-broker/linux.c'), '-o', broker]);
 writeFileSync(join(release, 'package.json'), '{"type":"module"}');
 writeFileSync(join(release, 'out/daemon/index.js'), `import fs from 'node:fs';import net from 'node:net';import {spawn,fork} from 'node:child_process';import {Worker} from 'node:worker_threads';
const root=process.env.ACTOR_TEST_ROOT;
fs.writeFileSync(root+'/entered',String(process.pid));
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});
fs.writeFileSync(root+'/descendant',String(child.pid));
const worker=new Worker('setInterval(()=>{},1000)',{eval:true});
// fork() inherits --import while using its own IPC setup and sanitized environment.
fs.writeFileSync(root+'/fork.mjs','setInterval(()=>{},1000)');
const forked=fork(root+'/fork.mjs',[],{env:{},stdio:['ignore','ignore','ignore','ipc']});
forked.once('spawn',()=>fs.writeFileSync(root+'/fork-pid',String(forked.pid)));
net.createServer(socket=>socket.once('data',data=>{
 const request=JSON.parse(data.toString());
 fs.appendFileSync(root+'/requests',request.method+'\\n');
 socket.end(JSON.stringify({id:request.id,result:{pid:process.pid,method:request.method}})+'\\n');
})).listen(root+'/public.sock');
setInterval(()=>{},1000);
`);
 // Bundle the real barrier for the standalone fixture without depending on source node_modules.
 const barrier = join(root, 'barrier.mjs');
 const packaged = readFileSync(join(project, 'out/bin/insrc-source-startup-barrier.js'), 'utf8');
 writeFileSync(barrier, packaged);
 const options = { binary, broker, barrier, directory: join(root, 'actors'), release: { root: release, runtime: process.execPath,
  commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64) }, transactionId: 'fixture-transaction', role: 'candidate' as const,
  env: { ...process.env, ACTOR_TEST_ROOT: root, NODE_OPTIONS: '--invalid-injection', NODE_PATH: '/invalid' } };
 let actor: SourceNativeActor | undefined;
 t.after(async () => { if (actor) { try { await actor.kill(); } finally { await actor.close(); } } rmSync(root, { recursive: true, force: true }); });
 return { root, options, retain(value: SourceNativeActor | undefined) { actor = value; } };
}
async function ready(root: string) {
 for (let i = 0; i < 400; i++) {
  if (existsSync(join(root, 'descendant')) && existsSync(join(root, 'fork-pid')) && existsSync(join(root, 'public.sock'))) return;
  await delay(10);
 }
 throw new Error('fixture daemon did not enter after grant');
}

if (process.env.INSRC_SOURCE_ACTOR_CONTROLLER) {
 const options = JSON.parse(process.env.INSRC_SOURCE_ACTOR_CONTROLLER) as Parameters<typeof SourceNativeActor.launch>[0];
 const actor = await SourceNativeActor.launch(options);
 await actor.grant(); await ready(options.env!.ACTOR_TEST_ROOT!);
 process.send?.({ directory: actor.directory, ticket: actor.ticket });
 const [message] = await once(process, 'message');
 if (message === 'commit') { await actor.commit(); await actor.commit(); }
 await actor.close(); process.exit(0);
} else {
test('Native source actor gates startup and proves descendant closure', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
 const f = await fixture(t), actor = await SourceNativeActor.launch(f.options); f.retain(actor);
 assert.equal(execFileSync(f.options.binary, ['preflight'], { encoding: 'utf8' }).trim(), 'SUPPORTED');
 assert.equal(existsSync(join(f.root, 'entered')), false, 'entry must remain blocked before the recorded grant');
 assert.equal(await actor.target.handle.hasExited(), false);
 assert.throws(() => execFileSync(f.options.binary, ['control', actor.ticket.token, String(actor.ticket.monitor.pid), 'wrong-incarnation', 'GRANT']));
 assert.equal(existsSync(join(f.root, 'entered')), false);
 await actor.grant(); await ready(f.root);
 const descendants = ['descendant', 'fork-pid'].map(name => requireProcessIdentity(Number(readFileSync(join(f.root, name), 'utf8'))));
 for (const child of descendants) assert.equal(processIdentityState(child), 'same');
 await actor.target.handle.terminate();
 await actor.childrenClosed();
 for (const child of descendants) assert.notEqual(processIdentityState(child), 'same', 'subreaper must close even detached descendants');
 // The monitor has naturally exited after its durable close receipt. Cleanup no longer needs control RPC.
 await actor.close(); f.retain(undefined);
}));

test('Native source actor survives committed controller exit and closes uncommitted trees', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
 for (const commit of [false, true]) {
  const f = await fixture(t);
  const args = file.endsWith('.ts') ? ['--import', fileURLToPath(import.meta.resolve('tsx/esm')), file] : [file];
  const worker = spawn(process.execPath, args, { env: { ...process.env, INSRC_SOURCE_ACTOR_CONTROLLER: JSON.stringify(f.options) },
   stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let error = ''; worker.stderr.on('data', data => { error += data.toString(); });
  const [message] = await once(worker, 'message') as [{ directory: string; ticket: { root: { pid: number } } }];
  const children = ['descendant', 'fork-pid'].map(name => requireProcessIdentity(Number(readFileSync(join(f.root, name), 'utf8'))));
  const ended = once(worker, 'close'); worker.send(commit ? 'commit' : 'exit');
  const [code] = await ended; assert.equal(code, 0, error);
  if (!commit) {
   for (let i = 0; !existsSync(join(message.directory, 'closed')) && i < 400; i++) await delay(25);
  }
  const actor = await SourceNativeActor.reopen(message.directory, f.options.binary); f.retain(actor);
  if (commit) {
   assert.equal(await actor.target.handle.hasExited(), false);
   assert.equal(actor.target.pid, message.ticket.root.pid);
   for (const child of children) assert.equal(processIdentityState(child), 'same');
   await actor.kill();
  }
  await actor.childrenClosed();
  for (const child of children) assert.notEqual(processIdentityState(child), 'same');
  await actor.close(); f.retain(undefined);
 }
}));

test('Source lifecycle RPC authenticates the socket peer before sending request bytes', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
 const f = await fixture(t), actor = await SourceNativeActor.launch(f.options); f.retain(actor);
 await actor.grant(); await ready(f.root);
 const socket = join(f.root, 'public.sock');
 assert.deepEqual(await sourceActorRpc(f.options.binary, socket, actor.target, 'daemon.status'), { pid: actor.target.pid, method: 'daemon.status' });
 const before = readFileSync(join(f.root, 'requests'), 'utf8');
 assert.throws(() => execFileSync(f.options.binary, ['rpc', socket, String(actor.target.pid), 'wrong-incarnation', 'daemon.shutdown']));
 assert.throws(() => execFileSync(f.options.binary, ['rpc', socket, String(actor.target.pid), actor.target.startedAt, 'workflow.approve']));
 assert.equal(readFileSync(join(f.root, 'requests'), 'utf8'), before, 'wrong incarnation and unsupported methods must not be sent');
 // Replace the public pathname with an unrelated live listener. Its UID and pathname match,
 // but its socket credentials cannot authorize a request to the recorded daemon.
 rmSync(socket);
 let bytes = 0;
 const replacement = createServer(connection => connection.on('data', data => { bytes += data.length; }));
 await new Promise<void>((resolve, reject) => { replacement.once('error', reject); replacement.listen(socket, resolve); });
 try { await assert.rejects(sourceActorRpc(f.options.binary, socket, actor.target, 'daemon.shutdown')); }
 finally { await new Promise<void>((resolve, reject) => replacement.close(error => error ? reject(error) : resolve())); }
 assert.equal(bytes, 0, 'a replacement must receive no shutdown bytes');
 assert.equal(await actor.target.handle.hasExited(), false);
 await actor.kill(); await actor.childrenClosed();
 await actor.close(); f.retain(undefined);
}));

test('Native source actor reconciles a lost status transport only with positive subtree closure', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
 const f = await fixture(t), actor = await SourceNativeActor.launch(f.options); f.retain(actor);
 await actor.grant(); await ready(f.root);
 for (const close of [false, true]) {
  const client = join(f.root, `status-race-${close}.mjs`);
  writeFileSync(client, `#!${process.execPath}\nimport {execFileSync} from 'node:child_process';
if(process.argv[2]==='control'&&process.argv[6]==='STATUS'){
 if(${close})execFileSync(${JSON.stringify(f.options.binary)},['control',...process.argv.slice(3,6),'KILL']);
 process.exit(3);
}
execFileSync(${JSON.stringify(f.options.binary)},process.argv.slice(2),{stdio:'inherit'});
`, { mode: 0o700 });
  if (!close) {
   await assert.rejects(SourceNativeActor.reopen(actor.directory, client));
   assert.equal(await actor.target.handle.hasExited(), false, 'a failed status without closure proof must not be treated as exit');
  } else {
   const reopened = await SourceNativeActor.reopen(actor.directory, client);
   assert.equal(await reopened.target.handle.hasExited(), true);
   await reopened.childrenClosed(); await reopened.close();
   await actor.childrenClosed();
  }
 }
 await actor.close(); f.retain(undefined);
}));

test('Detached source updater retains independent native ownership across incumbent closure', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
 for (const commit of [false, true]) {
  const f = await fixture(t);
  writeFileSync(join(f.options.release.root, 'out/bin/insrc-source-control.js'), `import fs from 'node:fs';import{spawn}from'node:child_process';
const root=process.env.ACTOR_TEST_ROOT, directory=process.env.INSRC_SOURCE_ACTOR_DIRECTORY;
const request=JSON.parse(fs.readFileSync(process.env.INSRC_SOURCE_UPDATE_REQUEST,'utf8'));
if(request.bound!=='current-owner')throw Error('request did not reach the pinned updater');
fs.writeFileSync(root+'/update-entered',String(process.pid));
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});
fs.writeFileSync(root+'/update-descendant',String(child.pid));setInterval(()=>{},1000);`);
  const actor = await SourceNativeActor.launch(f.options); f.retain(actor);
  let updater: SourceNativeActor | undefined;
  try {
   await actor.grant(); await ready(f.root); await actor.commit();
   updater = await actor.detachUpdater(f.options.release, { bound: 'current-owner' }, 'fixture-update');
   assert.equal(existsSync(join(f.root, 'update-entered')), false, 'independent supervisor must still gate updater entry');
   assert.equal(await updater.target.handle.hasExited(), false);
   await assert.rejects(actor.detachUpdater(f.options.release, {}, 'second-update'), /already owns a handoff/);
   await updater.grant();
   for (let i = 0; !existsSync(join(f.root, 'update-descendant')) && i < 400; i++) await delay(10);
   const child = requireProcessIdentity(Number(readFileSync(join(f.root, 'update-descendant'), 'utf8')));
   if (commit) await updater.commit();
   await actor.kill(); await actor.childrenClosed();
   if (commit) {
    assert.equal(await updater.target.handle.hasExited(), false, 'committed updater must outlive full incumbent subtree closure');
    assert.equal(processIdentityState(child), 'same');
    const reopened = await SourceNativeActor.reopen(updater.directory, f.options.binary);
    try { await reopened.kill(); await reopened.childrenClosed(); } finally { await reopened.close(); }
   }
   await updater.childrenClosed();
   assert.notEqual(processIdentityState(child), 'same', 'the independent owner must close its own descendants');
  } finally {
   if (updater) { try { await updater.kill(); await updater.childrenClosed(); } finally { await updater.close(); } }
  }
 }
}));

test('Daemon store probe is gated, leaves empty state untouched and refuses incomplete stores', { timeout: 480_000 }, async t => sourceLinux(t, file, project, async () => {
 for (const scenario of ['empty', 'partial', 'wrong-state', 'changed-formats', 'dangling-link', 'compaction-leftover', 'orphan-lock']) {
  const f = await fixture(t), release = f.options.release.root, home = join(f.root, 'home'), stateRoot = join(home, '.insrc');
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  mkdirSync(join(release, 'out/shared'), { recursive: true });
  for (const name of ['daemon/source-store-probe', 'shared/paths', 'shared/source-release-compatibility', 'shared/source-release-target']) {
   writeFileSync(join(release, `out/${name}.js`), readFileSync(join(project, `out/${name}.js`)));
  }
  if (scenario === 'partial') mkdirSync(join(stateRoot, 'graph.lmdb'));
  if (scenario === 'dangling-link') symlinkSync(join(f.root, 'missing-store'), join(stateRoot, 'graph.lmdb'));
  if (scenario === 'compaction-leftover') writeFileSync(join(stateRoot, 'graph.lmdb.bak'), 'retained-backup');
  if (scenario === 'orphan-lock') writeFileSync(join(stateRoot, 'graph.lmdb-lock'), 'retained-lock');
  const prior = { version: 1, releaseId: 'prior', graphSchema: 10, startup: 'rollback-compatible',
   formats: { lance: '1', config: '1', repoAndIndexQueue: '1', workflowAndSession: '1' } };
  const candidate = { ...prior, releaseId: 'candidate', ...(scenario === 'changed-formats' ? { graphSchema: 11 } : {}) };
  const actor = await SourceNativeActor.launch({ ...f.options, role: 'probe', env: { ...f.options.env, HOME: home,
   INSRC_SOURCE_STORE_PROBE: JSON.stringify({ stateRoot: scenario === 'wrong-state' ? f.root : stateRoot, prior, candidate }) } });
  f.retain(actor);
  const resultFile = join(actor.directory, 'probe-result.json');
  assert.equal(existsSync(resultFile), false, 'probe cannot inspect stores before its recorded grant');
  assert.equal(existsSync(join(f.root, 'entered')), false, 'probe role must not run the public daemon entry');
  await actor.grant(); await actor.childrenClosed();
  const result = await actor.probeResult() as { token: string; pid: number; ok: boolean; empty?: boolean; error?: string; pair?: unknown };
  assert.equal(result.token, actor.ticket.token); assert.equal(result.pid, actor.target.pid);
  assert.equal(result.ok, scenario === 'empty');
  if (scenario === 'empty') { assert.equal(result.empty, true); assert.deepEqual(result.pair, { prior, candidate }); }
  else assert.match(result.error!, /incomplete|does not name|changes writable formats|compaction recovery/);
  assert.equal(existsSync(join(stateRoot, 'daemon.pid')), false);
  assert.equal(existsSync(join(stateRoot, 'daemon.sock')), false);
  assert.equal(existsSync(join(stateRoot, 'lance')), false);
  assert.equal(existsSync(join(stateRoot, 'graph.lmdb')), scenario === 'partial', 'probe must not initialize empty stores');
  if (scenario === 'dangling-link') assert.equal(lstatSync(join(stateRoot, 'graph.lmdb')).isSymbolicLink(), true);
  if (scenario === 'compaction-leftover') assert.equal(readFileSync(join(stateRoot, 'graph.lmdb.bak'), 'utf8'), 'retained-backup');
  if (scenario === 'orphan-lock') assert.equal(readFileSync(join(stateRoot, 'graph.lmdb-lock'), 'utf8'), 'retained-lock');
  const reopened = await SourceNativeActor.reopen(actor.directory, f.options.binary);
  await reopened.childrenClosed(); await reopened.close();
  writeFileSync(resultFile, JSON.stringify({ ...result, version: 1, token: '0'.repeat(64) }));
  await assert.rejects(actor.probeResult(), /another actor/, 'a result from another actor must never be accepted');
  await actor.close(); f.retain(undefined);
 }
}));
}
