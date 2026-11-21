/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import type { TestContext } from 'node:test';
import policy from '../../assets/node-runtime-policy.json' with { type: 'json' };
import { SourceInstallationStore } from '../../shared/source-installation.js';
import { _setSourcePublicationFaultForTests } from '../../shared/source-installation.js';
import type { SourceSelection } from '../../shared/source-installation.js';
import { captureManagedReleasePin } from '../managed-release-staging.js';
import { LinuxSourceTransaction } from '../source-update-transaction.js';
import { NativeSourceTransactionHost } from '../source-transaction-host.js';
import { SourceNativeActor } from '../../shared/source-actor-client.js';
import { sourceLinux } from './helpers/source-linux.js';

const file = fileURLToPath(import.meta.url), project = process.env.INSRC_SOURCE_TEST_REPO ?? fileURLToPath(new URL('../../../', import.meta.url));
const git = (cwd: string, ...args: string[]) => execFileSync('/usr/bin/git', ['-C', cwd, '-c', 'user.name=Source host test',
 '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
const declaration = { version: 1 as const, graphSchema: 10, startup: 'rollback-compatible' as const,
 formats: { lance: '1', config: '1', repoAndIndexQueue: '1', workflowAndSession: '1' } };
const daemon = `import fs from 'node:fs';import net from 'node:net';import {spawn,execFileSync} from 'node:child_process';
import {daemonRunFiles as files} from './run-file-ownership.js';import {PATHS} from '../shared/paths.js';
const startup=files.lease();if(files.isAlreadyRunning()){startup.release();process.exit(1);}
const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});
const commit=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const server=net.createServer(socket=>socket.once('data',data=>{
 const request=JSON.parse(data.toString());
 if(request.method==='daemon.status')socket.end(JSON.stringify({id:request.id,result:{installedCommit:commit,uptime:1}})+'\\n');
 if(request.method==='daemon.shutdown'){
  socket.end(JSON.stringify({id:request.id,result:{ok:true}})+'\\n');
  child.once('close',()=>{const guard=files.lease();files.assertSocketOwned();server.close(()=>{files.markListenerClosed();files.clearRunFiles();guard.release();process.exit(0);});});child.kill('SIGTERM');
 }
}));
server.listen(PATHS.sockFile,()=>{files.claimSocket();files.writePid();startup.release();});
`;
async function fixture(t: TestContext) {
 const root = mkdtempSync(join(tmpdir(), 'insrc-source-host-')), home = join(root, 'home'), stateRoot = join(home, '.insrc'), logical = join(stateRoot, 'daemon');
 mkdirSync(logical, { recursive: true, mode: 0o700 });
 const target = `linux-${process.arch}` as 'linux-arm64' | 'linux-x64';
 const tools = join(project, 'scripts'), archive = join(project, `.insrc/tmp/node-runtime-provenance/node-v22.22.1-${target}.tar.gz`);
 assert.ok(existsSync(archive), 'the pinned official archive fixture is required');
 const distribution = execFileSync('/bin/bash', [join(tools, 'provision-node-runtime.sh'), stateRoot, archive], { encoding: 'utf8', timeout: 120_000 }).trim();
 const runtime = join(distribution, 'bin/node');
 const actor = join(root, 'source-actor'), broker = join(root, 'broker');
 execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', join(project, 'src/native/source-actor/main.c'), '-o', actor]);
 execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', join(project, 'src/native/process-broker/main.c'), join(project, 'src/native/process-broker/linux.c'), '-o', broker]);
 const release = async (name: string, sequence: number): Promise<SourceSelection> => {
  const checkout = join(stateRoot, `source-lifecycle/releases/${name}/checkout`);
  for (const dir of ['out/daemon', 'out/shared', 'out/bin', 'node_modules', 'packages/project-memory', 'scripts', 'src/assets']) mkdirSync(join(checkout, dir), { recursive: true, mode: 0o700 });
  for (const name of ['provision-node-runtime.sh', 'node-runtime-archive.sh', 'node-runtime-env.sh', 'node-runtime-policy.sh', 'node-runtime-policy.mjs', 'node-runtime-store.mjs']) copyFileSync(join(tools, name), join(checkout, 'scripts', name));
  copyFileSync(join(project, 'src/assets/node-runtime-policy.json'), join(checkout, 'src/assets/node-runtime-policy.json'));
  for (const name of ['daemon/run-file-ownership', 'daemon/source-store-probe', 'shared/paths', 'shared/daemon-run-files', 'shared/daemon-process', 'shared/source-release-compatibility', 'shared/source-release-target', 'bin/insrc-source-startup-barrier']) copyFileSync(join(project, `out/${name}.js`), join(checkout, `out/${name}.js`));
  copyFileSync(actor, join(checkout, 'out/bin/insrc-source-actor')); copyFileSync(broker, join(checkout, 'out/bin/insrc-process-broker'));
  writeFileSync(join(checkout, 'out/daemon/index.js'), daemon);
  writeFileSync(join(checkout, '.gitignore'), 'out/\nnode_modules/\npackages/\n');
  writeFileSync(join(checkout, 'package.json'), JSON.stringify({ name, type: 'module' }));
  writeFileSync(join(checkout, 'package-lock.json'), '{}');
  git(checkout, 'init', '-qb', 'main'); git(checkout, 'add', '.'); git(checkout, 'commit', '-qm', name);
  execFileSync(runtime, [join(tools, 'node-runtime-store.mjs'), 'bind', stateRoot, checkout, distribution], { encoding: 'utf8', timeout: 120_000 });
  const pin = await captureManagedReleasePin(checkout, runtime);
  return { pin, target, binding: join(stateRoot, 'source-runtimes', `${createHash('sha256').update(checkout).digest('hex')}.json`),
   toolchain: { nodeVersion: policy.nodeVersion, archiveSha256: policy.targets[target].sha256 },
   source: { channel: { repoUrl: 'https://example.invalid/qualified-source', branch: 'main' }, sequence,
    tagObject: String(sequence).repeat(40), commit: pin.commit, tree: git(checkout, 'rev-parse', 'HEAD^{tree}') },
   compatibility: { ...declaration, releaseId: pin.commit } };
 };
 const prior = await release('prior', 1), candidate = await release('candidate', 2);
 const store = new SourceInstallationStore(realpathSync(stateRoot), logical);
 store.update(0, state => ({ ...state, selected: prior, sourceReleases: [prior.source] }));
 const diagnostics = join(project, '.insrc/tmp/source-host-progress'); mkdirSync(diagnostics, { recursive: true, mode: 0o700 });
 const progress = join(diagnostics, `${target}-${process.pid}-${Date.now()}.jsonl`);
 const checkpoint = (stage: string) => {
  const state = store.read();
  appendFileSync(progress, JSON.stringify({ time: new Date().toISOString(), stage, root, state }) + '\n', { mode: 0o600 });
 };
 _setSourcePublicationFaultForTests(point => { if (point === 'directory-synced') checkpoint('publication'); });
 t.after(async () => {
  const manager = store.read().active?.candidate ?? store.read().selected ?? candidate;
  const host = new NativeSourceTransactionHost(store, manager);
  let closed = false;
  try {
   const current = store.read();
   if (current.active) throw new Error('fixture left an unresolved source transaction');
   const result = await new LinuxSourceTransaction(store, host).lifecycle('stop');
   assert.equal(result.decision, 'committed', result.detail);
   closed = true;
  } catch (error) {
   // Failure cleanup is scoped to this fixture's native tickets, including detached descendants.
   // Never delete a fixture runtime while a potentially live actor still references it.
   const directory = join(stateRoot, 'source-lifecycle/actors');
   for (const name of existsSync(directory) ? readdirSync(directory) : []) {
    const actor = await SourceNativeActor.reopen(join(directory, name), join(manager.pin.root, 'out/bin/insrc-source-actor'));
    try {
     assert.ok(actor.ticket.release.root.startsWith(join(stateRoot, 'source-lifecycle/releases/')));
     await actor.kill(); await actor.childrenClosed();
    } finally { await actor.close(); }
   }
   throw new Error(`Source host fixture retained for diagnosis at ${root}`, { cause: error });
  } finally { await host.close(); _setSourcePublicationFaultForTests(); if (closed) rmSync(root, { recursive: true, force: true }); }
 });
 const run = async (operation: 'start' | 'restart' | 'stop' | 'update') => {
  checkpoint(`begin-${operation}`);
  const host = new NativeSourceTransactionHost(store, operation === 'update' ? candidate : store.read().selected!);
  try {
   const owner = new LinuxSourceTransaction(store, host);
   return operation === 'update' ? await owner.update(async () => ({ prior: prior.pin, candidate,
    compatibility: { prior: prior.compatibility, candidate: candidate.compatibility } })) : await owner.lifecycle(operation);
  } finally { await host.close(); checkpoint(`end-${operation}`); }
 };
 return { root, stateRoot, store, prior, candidate, run };
}

test('Native source transaction composes real startup guards, store probes and retained actor lifecycle', { timeout: 900_000 }, async t => sourceLinux(t, file, project, async () => {
 const f = await fixture(t);
 const pid = () => Number(readFileSync(join(f.stateRoot, 'daemon.pid'), 'utf8'));
 const started = await f.run('start'); assert.equal(started.decision, 'committed', started.detail);
 const original = pid();
 assert.equal((await f.run('start')).decision, 'committed'); assert.equal(pid(), original, 'start must preserve an already running incarnation');
 const updated = await f.run('update'); assert.equal(updated.decision, 'committed', updated.detail);
 assert.notEqual(pid(), original); assert.deepEqual(f.store.read().selected, f.candidate);
 const beforeRestart = pid();
 const restarted = await f.run('restart'); assert.equal(restarted.decision, 'committed', restarted.detail); assert.notEqual(pid(), beforeRestart);
 const stopped = await f.run('stop'); assert.equal(stopped.decision, 'committed', stopped.detail);
 assert.equal(existsSync(join(f.stateRoot, 'daemon.pid')), false); assert.equal(existsSync(join(f.stateRoot, 'daemon.sock')), false);
 const fromStopped = await f.run('restart'); assert.equal(fromStopped.decision, 'committed', fromStopped.detail); assert.ok(pid());
 assert.equal(existsSync(join(f.stateRoot, 'graph.lmdb')), false); assert.equal(existsSync(join(f.stateRoot, 'lance')), false);
}, { timeoutMs: 480_000 }));
