/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import policy from '../../src/assets/node-runtime-policy.json' with { type: 'json' };
import { sourceEntrypointAuthority } from './helpers/source-entrypoint-authority.js';

import { readSourceInstallation } from '../../src/shared/source-routing.js';
import { readSourceUpdateOutcome } from '../../src/shared/source-update-outcomes.js';

const exec = promisify(execFile), project = resolve('.');
interface Config { phase: string; root: string; project: string; }
const worker = process.env['INSRC_CONSUMER_WORKER'];
if (worker) {
 const c = JSON.parse(worker) as Config;
 const { update, restart } = await import(c.project + '/out/cli/services/maintenance.js');
 const { startDaemon, stopDaemon } = await import(c.project + '/out/cli/services/daemon.js');
 const stateRoot = join(c.root, 'home/.insrc');
 const store = (await readSourceInstallation(stateRoot))!;
 const selected = () => store.read().selected!.pin;
 const env = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' };
 const ctl = (command: string) => execFileSync(selected().runtime, [join(selected().root, 'out/bin/insrc-source-control.js'), command, stateRoot, store.installationRoot], { env, encoding: 'utf8', timeout: 480000 });
 const rpc = (method: string) => new Promise<unknown>((resolve, reject) => {
  const s = createConnection(join(stateRoot, 'daemon.sock')); let bytes = '';
  s.setTimeout(25000, () => s.destroy(new Error('fixture IPC timed out')));
  s.on('error', reject); s.on('connect', () => s.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: {} }) + '\n'));
  s.on('data', chunk => { bytes += chunk; if (bytes.includes('\n')) { s.destroy(); const r = JSON.parse(bytes.split('\n')[0]!) as { result: unknown; error?: { message: string } }; if (r.error) reject(new Error(r.error.message)); else resolve(r.result); } });
 });
 const wait = async (condition: () => boolean, message: string, ms = 180000) => {
  const deadline = performance.now() + ms;
  while (!condition()) { if (performance.now() > deadline) throw new Error(message); await delay(50); }
 };
 if (c.phase === 'start') {
  assert.equal((await startDaemon()).started, true);
  const pid = readFileSync(join(stateRoot, 'daemon.pid'), 'utf8');
  const already = await startDaemon(); assert.equal(already.alreadyRunning, true); assert.equal(already.started, false);
  assert.equal(readFileSync(join(stateRoot, 'daemon.pid'), 'utf8'), pid);
 } else if (c.phase === 'tui') {
  const before = selected(), pid = readFileSync(join(stateRoot, 'daemon.pid'), 'utf8');
  const logs: string[] = [];
  process.env.NODE_OPTIONS = '--invalid-injection'; process.env.NODE_PATH = '/invalid';
  const result = await update({}, (line: string) => logs.push(line));
  assert.equal(result.ok, true, JSON.stringify({ result, logs })); assert.deepEqual(result.steps, ['update']);
  assert.notEqual(selected().commit, before.commit); assert.notEqual(readFileSync(join(stateRoot, 'daemon.pid'), 'utf8'), pid);
  assert.match(logs.join('\n'), /committed/);
  assert.equal(readSourceUpdateOutcome(store)?.decision, 'committed');
 } else if (c.phase === 'ipc-cancel') {
  const before = selected(), builds = readFileSync(join(c.root, 'builds.jsonl'), 'utf8');
  writeFileSync(join(stateRoot, 'ack-mode'), 'cancel');
  const reply = await rpc('daemon.update') as { launched: boolean; updateId: string };
  assert.equal(reply.launched, true);
  await wait(() => store.read().active === null, 'cancel did not finish');
  assert.deepEqual(selected(), before); assert.equal(readFileSync(join(c.root, 'builds.jsonl'), 'utf8'), builds);
  const result = readSourceUpdateOutcome(store); assert.equal(result?.updateId, reply.updateId); assert.equal(result?.decision, 'rolled-back');
  assert.match(result?.error ?? '', /acknowledgment was not delivered/);
  rmSync(join(stateRoot, 'ack-mode'));
 } else if (c.phase === 'ipc') {
  const before = selected(), pid = readFileSync(join(stateRoot, 'daemon.pid'), 'utf8'), builds = readFileSync(join(c.root, 'builds.jsonl'), 'utf8');
  writeFileSync(join(stateRoot, 'ack-mode'), 'wait');
  const reply = await rpc('daemon.update') as { launched: boolean; updateId: string }; assert.equal(reply.launched, true);
  assert.equal(store.read().active?.id, reply.updateId); assert.equal(store.read().active?.phase, 'reserved');
  await delay(250); assert.equal(readFileSync(join(c.root, 'builds.jsonl'), 'utf8'), builds, 'no preparation before reply release');
  assert.equal(readSourceUpdateOutcome(store), null);
  writeFileSync(join(stateRoot, 'ack-release'), 'yes');
  await wait(() => store.read().active === null, 'detached update did not finish');
  assert.notEqual(selected().commit, before.commit); assert.notEqual(readFileSync(join(stateRoot, 'daemon.pid'), 'utf8'), pid);
  const result = readSourceUpdateOutcome(store); assert.equal(result?.updateId, reply.updateId); assert.equal(result?.decision, 'committed');
  assert.equal((await rpc('daemon.updateOutcome') as { updateId: string }).updateId, reply.updateId);
  const { readPublicUpdateOutcome } = await import(c.project + '/out/daemon/managed-update-ipc.js');
  assert.deepEqual(await readPublicUpdateOutcome(), result);
  const { readUpdateOutcome } = await import(c.project + '/out/daemon/update-runner.js');
  assert.deepEqual(readUpdateOutcome(), result, 'restored old reader can see the mirrored result');
  // Ordinary lifecycle must preserve the update result, including its original timestamp.
  assert.equal((await restart(() => {})).ok, true);
  assert.deepEqual(readSourceUpdateOutcome(store), result);
  assert.equal((await stopDaemon()).stopped, true);
  assert.equal((await startDaemon()).started, true); assert.deepEqual(readSourceUpdateOutcome(store), result);
  rmSync(join(stateRoot, 'ack-mode')); rmSync(join(stateRoot, 'ack-release'));
 } else if (c.phase === 'failure') {
  const before = selected(), pid = readFileSync(join(stateRoot, 'daemon.pid'), 'utf8');
  writeFileSync(join(stateRoot, 'fail-build'), 'yes');
  const logs: string[] = [], result = await update({}, (line: string) => logs.push(line));
  assert.equal(result.ok, false); assert.match(result.error ?? '', /Source command failed/);
  assert.match(result.error ?? '', /insrc-source-control\.js.*update/);
  assert.match(result.error ?? '', /fixture-final-compiler-diagnostic/); assert.ok((result.error?.length ?? 0) < 15000);
  assert.deepEqual(selected(), before); assert.equal(readFileSync(join(stateRoot, 'daemon.pid'), 'utf8'), pid);
  assert.equal(readSourceUpdateOutcome(store)?.decision, 'rolled-back'); rmSync(join(stateRoot, 'fail-build'));
 } else if (c.phase === 'launch') {
  const pin = selected(), old = store.installationRoot;
  for (const name of ['insrc', 'insrc-mcp']) {
   const result = execFileSync(join(pin.root, 'scripts', name), ['consumer-arg'], { env, cwd: c.root, encoding: 'utf8', timeout: 60000 });
   const value = JSON.parse(result) as { exe: string; args: string[]; cwd?: string };
   assert.equal(value.exe, pin.runtime); assert.deepEqual(value.args, ['consumer-arg']);
   if (name === 'insrc') assert.equal(value.cwd, c.root);
  }
  assert.notEqual(pin.root, old);
  const journal = join(stateRoot, 'source-lifecycle/journal.json'), original = readFileSync(journal);
  try {
   writeFileSync(journal, '{malformed');
   await assert.rejects(startDaemon()); await assert.rejects(stopDaemon());
   const result = await update({}, () => {}); assert.equal(result.ok, false);
   for (const name of ['insrc', 'insrc-mcp']) assert.throws(() => execFileSync(join(pin.root, 'scripts', name), [], { env, cwd: c.root, encoding: 'utf8', timeout: 60000 }));
  } finally { writeFileSync(journal, original); }
 } else if (c.phase === 'cleanup') {
  ctl('stop');
  const records = readFileSync(join(c.root, 'builds.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  for (const record of records) {
   assert.equal(record.version, '22.22.1'); assert.equal(record.npmVersion, '10.9.4');
   assert.equal(record.exe, selected().runtime); assert.notEqual(record.cwd, store.installationRoot);
   assert.equal(record.options, null); assert.equal(record.nodePath, null);
  }
  assert.equal(existsSync(join(c.root, 'ambient-used')), false); assert.equal(existsSync(join(c.root, 'incumbent-executed')), false);
  rmSync(c.root, { recursive: true, force: true });
 } else throw new Error('Unknown consumer phase');
 process.stdout.write(JSON.stringify({ phase: c.phase, ok: true }) + '\n');
} else {
async function matrix(mode: 'update' | 'launch') {
 const root = mkdtempSync(join(project, '.insrc/tmp/source-consumers-')), bundle = join(root, 'worker.mjs'), migrate = join(root, 'migrate.mjs');
 const { buildSync } = await import('esbuild');
 for (const [input, outfile] of [[fileURLToPath(import.meta.url), bundle], [join(project, 'scripts/__tests__/source-entrypoints-native.test.ts'), migrate]]) buildSync({ entryPoints: [input!], outfile: outfile!, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
 const inventory = JSON.parse((await exec('orb', ['list', '--format=json'])).stdout) as Array<{ name: string; state: string }>;
 for (const [machine, target] of [['insrc-node-arm64', 'linux-arm64'], ['insrc-node-x64', 'linux-x64']] as const) {
  assert.equal(inventory.find(m => m.name === machine)?.state, 'stopped'); await exec('orb', ['start', machine]);
  let guestRoot: string | undefined, a: Awaited<ReturnType<typeof sourceEntrypointAuthority>> | undefined;
  const stage = join(root, target); mkdirSync(stage);
  try {
   const home = (await exec('orb', ['-m', machine, '/bin/sh', '-c', 'printf "%s" "$HOME"'])).stdout;
   const node = join(home, 'insrc-node-qualification/home/.insrc/runtimes', `node-v${policy.nodeVersion}-${target}`, policy.targets[target].sha256, 'distribution/bin/node');
   guestRoot = (await exec('orb', ['-m', machine, '/usr/bin/mktemp', '-d', '/tmp/insrc-consumers-XXXXXX'])).stdout.trim();
   const app = `import fs from'node:fs';import net from'node:net';import{spawn,execFileSync}from'node:child_process';import{setTimeout as delay}from'node:timers/promises';
import{daemonRunFiles as f}from${JSON.stringify(join(project, 'src/daemon/run-file-ownership.ts'))};
import{PATHS}from${JSON.stringify(join(project, 'src/shared/paths.ts'))};
import{launchSourceUpdate}from${JSON.stringify(join(project, 'src/daemon/source-update-launch.ts'))};
import{readSourceInstallation}from${JSON.stringify(join(project, 'src/shared/source-routing.ts'))};
import{readSourceUpdateOutcome}from${JSON.stringify(join(project, 'src/shared/source-update-outcomes.ts'))};
const startup=f.lease();if(f.isAlreadyRunning()){startup.release();process.exit(1);}const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});
const commit=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const server=net.createServer(s=>s.once('data',async b=>{const r=JSON.parse(b);try{
if(r.method==='daemon.status')s.end(JSON.stringify({id:r.id,result:{installedCommit:commit}})+'\\n');
if(r.method==='daemon.updateOutcome')s.end(JSON.stringify({id:r.id,result:readSourceUpdateOutcome(await readSourceInstallation())})+'\\n');
if(r.method==='daemon.update'){let delivered;const written=new Promise(resolve=>{delivered=resolve;});const result=await launchSourceUpdate(()=>written);s.end(JSON.stringify({id:r.id,result})+'\\n',async()=>{const mode=fs.existsSync(PATHS.insrc+'/ack-mode')?fs.readFileSync(PATHS.insrc+'/ack-mode','utf8'):'';if(mode==='wait'){while(!fs.existsSync(PATHS.insrc+'/ack-release'))await delay(25);}delivered(mode!=='cancel');});}
if(r.method==='daemon.shutdown'){s.end(JSON.stringify({id:r.id,result:{ok:true}})+'\\n');child.once('close',()=>{const g=f.lease();f.assertSocketOwned();server.close(()=>{f.markListenerClosed();f.clearRunFiles();g.release();process.exit(0);});});child.kill('SIGTERM');}
}catch(error){s.end(JSON.stringify({id:r.id,error:{message:error.message}})+'\\n');}}));server.listen(PATHS.sockFile,()=>{f.claimSocket();f.writePid();startup.release();});`;
   a = await sourceEntrypointAuthority(stage, target, app);
   writeFileSync(join(a.origin, 'build.mjs'), readFileSync(join(a.origin, 'build.mjs'), 'utf8') + `\nif(fs.existsSync(process.env.HOME+'/.insrc/fail-build')){console.error('diagnostic-noise'.repeat(2000));throw Error('fixture-final-compiler-diagnostic');}\n`); a.publish();
   const config = { root: guestRoot, project: `/mnt/mac${project}`, origin: `/mnt/mac${a.origin}`, prior: a.prior, installer: `/mnt/mac${a.installer}`, variant: 'legacy' };
   const result = await exec('orb', ['-m', machine, '/usr/bin/env', `INSRC_ENTRYPOINT_WORKER=${JSON.stringify({ ...config, phase: 'migrate' })}`, node, `/mnt/mac${migrate}`], { timeout: 600000, maxBuffer: 1024 * 1024 });
   writeFileSync(join(stage, 'migrate.json'), result.stdout);
   const invoke = async (phase: string) => {
    try {
     const output = await exec('orb', ['-m', machine, '/usr/bin/env', `HOME=${guestRoot}/home`, `PATH=${guestRoot}/hostile:/usr/bin:/bin`, `INSRC_DAEMON_ROOT=${guestRoot}/home/.insrc/daemon`, `BUILD_TRACE=${guestRoot}/builds.jsonl`, `INCUMBENT_ROOT=${guestRoot}/home/.insrc/daemon`, `INCUMBENT_TRACE=${guestRoot}/incumbent-executed`, `INSRC_CONSUMER_WORKER=${JSON.stringify({ root: guestRoot, phase, project: `/mnt/mac${project}` })}`, node, `/mnt/mac${bundle}`], { timeout: 600000, maxBuffer: 1024 * 1024 });
     writeFileSync(join(stage, `${phase}.json`), output.stdout);
    } catch (error) { const e = error as { stdout?: string; stderr?: string }; writeFileSync(join(stage, `${phase}-failed.log`), `${e.stdout ?? ''}\n${e.stderr ?? ''}`); throw error; }
   };
   try {
    await invoke('start');
    if (mode === 'update') { a.publish(); await invoke('tui'); a.publish(); await invoke('ipc-cancel'); await invoke('ipc'); a.publish(); await invoke('failure'); }
    else await invoke('launch');
   } finally { await invoke('cleanup'); guestRoot = undefined; }
  } finally {
   // Never remove a fixture while a native actor may still own it.
   await exec('orb', ['stop', machine], { timeout: 30000 });
  }
 }
 return root;
}
test('TUI and detached daemon update survive handoff and expose final outcome', { timeout: 1800000, skip: process.platform !== 'darwin' }, async t => { t.diagnostic(`Consumer receipts: ${await matrix('update')}`); });
test('MCP/start resolve source selection and reject malformed state', { timeout: 1200000, skip: process.platform !== 'darwin' }, async t => { t.diagnostic(`Launch receipts: ${await matrix('launch')}`); });
}
