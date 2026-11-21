/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
 const binary = join(root, 'source-actor'), broker = join(root, 'broker');
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
}
