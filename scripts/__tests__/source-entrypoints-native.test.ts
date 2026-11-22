/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import policy from '../../src/assets/node-runtime-policy.json' with { type: 'json' };

const exec = promisify(execFile), project = resolve('.');
const git = (cwd: string, ...args: string[]) => execFileSync('/usr/bin/git', ['-C', cwd, '-c', 'user.name=Entrypoint test',
 '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
const declaration = { version: 1, graphSchema: 10, startup: 'rollback-compatible', formats: { lance: '1', config: '1', repoAndIndexQueue: '1', workflowAndSession: '1' } };
interface WorkerConfig { phase: string; root: string; project: string; origin: string; prior: string; installer: string; variant: string; }
const worker = process.env['INSRC_ENTRYPOINT_WORKER'];

if (worker) {
 const c = JSON.parse(worker) as WorkerConfig;
 const home = join(c.root, 'home'), state = join(home, '.insrc'), old = join(state, 'daemon'), hostile = join(c.root, 'hostile');
 const ambient = join(c.root, 'ambient-used'), oldTrace = join(c.root, 'incumbent-executed'), trace = join(c.root, 'builds.jsonl');
 const node = process.execPath, target = `linux-${process.arch}` as 'linux-arm64' | 'linux-x64';
 const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, PATH: `${hostile}:/usr/bin:/bin`,
  NODE_OPTIONS: '--invalid-injection', NODE_PATH: '/invalid/injection', INCUMBENT_ROOT: old, INCUMBENT_TRACE: oldTrace,
  BUILD_TRACE: trace, AMBIENT_TRACE: ambient, INSRC_CTL_LOG_DIR: join(c.root, 'ctl-logs'), BASH_ENV: join(c.root, 'bash-env') };
 if (c.variant === 'bound') env.ONNXRUNTIME_NODE_INSTALL_CUDA = 'v12'; else delete env.ONNXRUNTIME_NODE_INSTALL_CUDA;
 const snapshotPath = join(c.root, 'snapshot.json');
 const readState = () => JSON.parse(readFileSync(join(state, 'source-lifecycle/journal.json'), 'utf8')) as {
  selected: { pin: { root: string; runtime: string; commit: string } }; active: unknown; outcome: { decision: string; detail: string } };
 const ctl = (command: string, override: NodeJS.ProcessEnv = {}) => {
  const current = readState().selected.pin.root;
  return execFileSync('/bin/bash', [join(current, 'scripts/daemon-ctl.sh'), command], { env: { ...env, ...override }, encoding: 'utf8', timeout: 480_000, maxBuffer: 1024 * 1024 });
 };
 if (c.phase === 'migrate') {
  mkdirSync(old, { recursive: true, mode: 0o700 }); mkdirSync(hostile, { mode: 0o700 });
  // Observe entry without modifying the byte-exact historical updater script.
  writeFileSync(env.BASH_ENV!, 'if [ "$0" = "$INCUMBENT_ROOT/scripts/daemon-ctl.sh" ]; then printf invoked > "$INCUMBENT_TRACE"; exit 91; fi\n', { mode: 0o600 });
  for (const name of ['node', 'npm']) writeFileSync(join(hostile, name), '#!/bin/sh\nprintf invoked >> "$AMBIENT_TRACE"\nexit 97\n', { mode: 0o700 });
  git(state, 'clone', '-q', '--', c.origin, old); git(old, 'checkout', '-q', '--detach', c.prior);
  git(old, 'branch', '-f', 'main', c.prior); git(old, 'checkout', '-q', 'main');
  for (const path of ['out/daemon', 'out/bin', 'node_modules', 'packages/project-memory']) mkdirSync(join(old, path), { recursive: true });
  writeFileSync(join(old, 'out/daemon/index.js'), '// stale incumbent output retained during migration\n');
  writeFileSync(join(old, 'out/bin/insrc-daemon-control.js'), 'throw Error("old controller must not execute");');
  const lock = '{"locallyEdited":true,"lockfileVersion":3}\n'; writeFileSync(join(old, 'package-lock.json'), lock);
  const cleanEnv = { ...env }; delete cleanEnv.NODE_OPTIONS; delete cleanEnv.NODE_PATH;
  const archive = join(c.project, `.insrc/tmp/node-runtime-provenance/node-v22.22.1-${target}.tar.gz`);
  if (c.variant === 'bound') {
   for (const path of ['scripts/provision-node-runtime.sh', 'scripts/node-runtime-archive.sh', 'scripts/node-runtime-env.sh', 'scripts/node-runtime-policy.sh', 'scripts/node-runtime-policy.mjs', 'scripts/node-runtime-store.mjs', 'src/assets/node-runtime-policy.json']) {
    mkdirSync(dirname(join(old, path)), { recursive: true }); cpSync(join(c.project, path), join(old, path));
   }
   const distribution = execFileSync('/bin/bash', [join(c.project, 'scripts/provision-node-runtime.sh'), state, archive], { env: cleanEnv, encoding: 'utf8', timeout: 120_000 }).trim();
   execFileSync(node, [join(c.project, 'scripts/node-runtime-store.mjs'), 'bind', state, old, distribution], { env: cleanEnv, encoding: 'utf8' });
  } else writeFileSync(join(state, 'daemon-node'), join(hostile, 'node'), { mode: 0o600 });
  const before = { lock, output: readFileSync(join(old, 'out/daemon/index.js'), 'utf8'), head: git(old, 'rev-parse', 'HEAD'), ctl: readFileSync(join(old, 'scripts/daemon-ctl.sh'), 'utf8') };
  writeFileSync(snapshotPath, JSON.stringify(before), { mode: 0o600 });
  assert.throws(() => execFileSync('/bin/bash', [join(c.project, 'scripts/insrc-daemon-install.sh'), '-y', '--migrate-runtime',
   '--target', old, '--runtime-archive', archive, '--no-start'], { env, encoding: 'utf8', timeout: 120_000 }), error => {
    const result = error as { status?: number; stdout?: string; stderr?: string };
    assert.equal(result.status, 4); assert.match(`${result.stdout ?? ''}${result.stderr ?? ''}`, /current authenticated release installer/); return true;
   });
  const output = execFileSync('/bin/bash', [c.installer, '-y', '--migrate-runtime', '--target', old, '--repo', c.origin, '--branch', 'main',
   '--runtime-archive', archive, '--predecessor', c.prior, '--rebuild-predecessor', '--no-start'], { env, encoding: 'utf8', timeout: 480_000, maxBuffer: 1024 * 1024 });
  writeFileSync(join(c.root, 'installer.log'), output);
  assert.equal(readState().outcome.decision, 'committed'); assert.equal(readState().active, null);
  assert.notEqual(readState().selected.pin.root, old); assert.equal(existsSync(join(state, 'daemon.pid')), false);
 } else if (c.phase === 'running') {
  ctl('start'); const pid = readFileSync(join(state, 'daemon.pid'), 'utf8');
  ctl('start'); assert.equal(readFileSync(join(state, 'daemon.pid'), 'utf8'), pid);
  ctl('update'); assert.equal(readFileSync(join(state, 'daemon.pid'), 'utf8'), pid, 'same-release update must preserve running PID');
  assert.match(ctl('status'), /daemon running/);
 } else if (c.phase === 'profile-change') {
  const before = readState().selected.pin;
  assert.throws(() => ctl('update', { SOURCE_FIXTURE_STOP_DURING_BUILD: '1' }), error => {
   const result = error as { status?: number; stdout?: string };
   assert.equal(result.status, 4); assert.match(result.stdout ?? '', /launch profile changed during preparation/); return true;
  });
  assert.deepEqual(readState().selected.pin, before);
  assert.equal(readState().active, null); assert.equal(existsSync(join(state, 'daemon.pid')), false);
  ctl('start');
 } else if (c.phase === 'update-running') {
  const before = readState().selected.pin, pid = readFileSync(join(state, 'daemon.pid'), 'utf8');
  ctl('update'); const next = readState().selected.pin;
  assert.notEqual(next.commit, before.commit); assert.notEqual(next.root, before.root);
  assert.notEqual(readFileSync(join(state, 'daemon.pid'), 'utf8'), pid);
  ctl('restart'); ctl('stop'); assert.equal(existsSync(join(state, 'daemon.pid')), false);
 } else if (c.phase === 'update-stopped') {
  const before = readState().selected.pin.commit;
  ctl('update'); assert.notEqual(readState().selected.pin.commit, before);
  assert.equal(existsSync(join(state, 'daemon.pid')), false, 'update must preserve the stopped state');
  ctl('restart'); assert.equal(existsSync(join(state, 'daemon.pid')), true, 'restart from stopped must start');
  ctl('stop');
  const journal = join(state, 'source-lifecycle/journal.json'), original = readFileSync(journal);
  try { writeFileSync(journal, '{malformed'); assert.throws(() => ctl('start')); }
  finally { writeFileSync(journal, original); }
 } else if (c.phase === 'check') {
  const before = JSON.parse(readFileSync(snapshotPath, 'utf8')) as { lock: string; output: string; head: string; ctl: string };
  assert.equal(readFileSync(join(old, 'package-lock.json'), 'utf8'), before.lock);
  assert.equal(readFileSync(join(old, 'out/daemon/index.js'), 'utf8'), before.output); assert.equal(git(old, 'rev-parse', 'HEAD'), before.head);
  assert.equal(readFileSync(join(old, 'scripts/daemon-ctl.sh'), 'utf8'), before.ctl);
  assert.equal(existsSync(ambient), false); assert.equal(existsSync(oldTrace), false);
  const rows = readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>);
  assert.ok(rows.length >= 4);
  for (const row of rows) {
   assert.equal(row.version, '22.22.1'); assert.equal(row.npmVersion, '10.9.4'); assert.notEqual(row.cwd, old);
   assert.equal(row.options, null); assert.equal(row.nodePath, null); assert.equal(row.cuda, c.variant === 'bound' ? 'v12' : 'skip');
  }
  assert.equal(readState().active, null);
 } else if (c.phase === 'cleanup') {
  if (existsSync(join(state, 'source-lifecycle/journal.json'))) ctl('stop');
  rmSync(c.root, { recursive: true, force: true });
 } else throw new Error('Unknown entrypoint fixture phase');
 process.stdout.write(JSON.stringify({ phase: c.phase, ok: true }) + '\n');
} else {
async function authority(root: string, target: 'linux-arm64' | 'linux-x64') {
 const origin = join(root, 'origin'); mkdirSync(origin);
 const key = join(root, 'key'), installer = join(root, 'installer.sh');
 execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
 const { buildSync } = await import('esbuild');
 const bundle = (entry: string) => buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent' }).outputFiles[0]!.text;
 const app = join(root, 'app.mjs');
 writeFileSync(app, `import fs from'node:fs';import net from'node:net';import{spawn,execFileSync}from'node:child_process';
import{daemonRunFiles as f}from${JSON.stringify(join(project, 'src/daemon/run-file-ownership.ts'))};
import{PATHS}from${JSON.stringify(join(project, 'src/shared/paths.ts'))};
const startup=f.lease();if(f.isAlreadyRunning()){startup.release();process.exit(1);}const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});
const commit=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const server=net.createServer(s=>s.once('data',b=>{const r=JSON.parse(b);if(r.method==='daemon.status')s.end(JSON.stringify({id:r.id,result:{installedCommit:commit}})+'\\n');if(r.method==='daemon.shutdown'){s.end(JSON.stringify({id:r.id,result:{ok:true}})+'\\n');child.once('close',()=>{const g=f.lease();f.assertSocketOwned();server.close(()=>{f.markListenerClosed();f.clearRunFiles();g.release();process.exit(0);});});child.kill('SIGTERM');}}));
server.listen(PATHS.sockFile,()=>{f.claimSocket();f.writePid();startup.release();});`);
 mkdirSync(join(origin, 'raw'), { recursive: true });
 writeFileSync(join(origin, 'raw/daemon.b64'), Buffer.from(bundle(app)).toString('base64'));
 writeFileSync(join(origin, '.gitignore'), '/out/\n/node_modules/\n/packages/\n');
 const manifest = { name: 'source-entrypoint-fixture', version: '1.0.0', type: 'module', scripts: { preinstall: 'node record.mjs preinstall', build: 'node build.mjs' } };
 writeFileSync(join(origin, 'package.json'), JSON.stringify(manifest));
 writeFileSync(join(origin, 'package-lock.json'), JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages: { '': { name: manifest.name, version: manifest.version } } }));
 writeFileSync(join(origin, '.npmrc'), 'offline=true\naudit=false\nfund=false\n');
 writeFileSync(join(origin, 'record.mjs'), `import fs from'node:fs';import{dirname,resolve}from'node:path';if(process.cwd()===process.env.INCUMBENT_ROOT){fs.writeFileSync(process.env.INCUMBENT_TRACE,'old npm');process.exit(91);}const npmVersion=JSON.parse(fs.readFileSync(resolve(dirname(process.env.npm_execpath),'../package.json'))).version;fs.appendFileSync(process.env.BUILD_TRACE,JSON.stringify({phase:process.argv[2],cwd:process.cwd(),exe:process.execPath,version:process.versions.node,npm:process.env.npm_execpath,npmVersion,options:process.env.NODE_OPTIONS??null,nodePath:process.env.NODE_PATH??null,cuda:process.env.ONNXRUNTIME_NODE_INSTALL_CUDA})+'\\n');`);
 writeFileSync(join(origin, 'build.mjs'), `import fs from'node:fs';import'./record.mjs';for(const d of['out/daemon','out/bin','node_modules','packages/project-memory'])fs.mkdirSync(d,{recursive:true});fs.writeFileSync('out/daemon/index.js',Buffer.from(fs.readFileSync('raw/daemon.b64','utf8'),'base64'));`);
 mkdirSync(join(origin, 'scripts'));
 const historicalCtl = execFileSync('/usr/bin/git', ['show', 'a30aa7f91a50409e129b0af25ff3d897be1b45b6:scripts/daemon-ctl.sh'], { cwd: project, encoding: 'utf8' });
 writeFileSync(join(origin, 'scripts/daemon-ctl.sh'), historicalCtl, { mode: 0o700 });
 assert.equal(readFileSync(join(origin, 'scripts/daemon-ctl.sh'), 'utf8'), historicalCtl);
 git(origin, 'init', '-qb', 'main'); git(origin, 'add', '.'); git(origin, 'commit', '-qm', 'historical fixture');
 const prior = git(origin, 'rev-parse', 'HEAD'), priorTree = git(origin, 'rev-parse', 'HEAD^{tree}');
 for (const path of ['scripts/provision-node-runtime.sh', 'scripts/node-runtime-archive.sh', 'scripts/node-runtime-env.sh', 'scripts/node-runtime-policy.sh', 'scripts/node-runtime-policy.mjs', 'scripts/node-runtime-store.mjs', 'scripts/daemon-ctl.sh', 'src/assets/node-runtime-policy.json']) {
  mkdirSync(dirname(join(origin, path)), { recursive: true }); cpSync(join(project, path), join(origin, path));
 }
 // The public installer still provisions the official archive. This routing fixture then
 // delegates repeated runtime-owner lookups to that fixed distribution; full repeated
 // archive/inventory coverage remains available with INSRC_ENTRYPOINT_FULL_RUNTIME=1.
 if (process.env['INSRC_ENTRYPOINT_FULL_RUNTIME'] !== '1') {
  const identity = `${policy.nodeVersion}:${target}:${policy.targets[target].sha256}`;
  const relative = `runtimes/node-v${policy.nodeVersion}-${target}/${policy.targets[target].sha256}/distribution`;
  writeFileSync(join(origin, 'scripts/node-runtime-env.sh'), `insrc_source_toolchain() {
 unset NODE_OPTIONS NODE_PATH
 local distribution="$2/${relative}"
 NODE_BIN="$distribution/bin/node"
 NPM_CLI="$distribution/lib/node_modules/npm/bin/npm-cli.js"
 [ -x "$NODE_BIN" ] && [ -f "$NPM_CLI" ] || return 2
 TOOLCHAIN_ID='${identity}'
 SOURCE_RUNTIME_BOUND=1
 export PYTHONDONTWRITEBYTECODE=1
 export ONNXRUNTIME_NODE_INSTALL_CUDA="\${ONNXRUNTIME_NODE_INSTALL_CUDA-skip}"
 export npm_config_target='${policy.nodeVersion}' npm_config_runtime=node
 export PATH="$distribution/bin:\${PATH:-/usr/bin:/bin}"
}\n`);
 }
 writeFileSync(join(origin, 'raw/controller.b64'), Buffer.from(bundle(join(project, 'src/bin/insrc-source-control.ts'))).toString('base64'));
 for (const path of ['daemon/source-store-probe', 'shared/paths', 'shared/source-release-compatibility', 'shared/source-release-target', 'bin/insrc-source-startup-barrier']) {
  mkdirSync(dirname(join(origin, `raw/out/${path}.js`)), { recursive: true }); cpSync(join(project, `out/${path}.js`), join(origin, `raw/out/${path}.js`));
 }
 cpSync(join(project, 'src/native/source-actor'), join(origin, 'raw/native/source-actor'), { recursive: true });
 cpSync(join(project, 'src/native/process-broker'), join(origin, 'raw/native/process-broker'), { recursive: true });
 const baseBuild = readFileSync(join(origin, 'build.mjs'), 'utf8');
 writeFileSync(join(origin, 'build.mjs'), baseBuild + `
import{execFileSync}from'node:child_process';fs.cpSync('raw/out','out',{recursive:true});fs.writeFileSync('out/bin/insrc-source-control.js',Buffer.from(fs.readFileSync('raw/controller.b64','utf8'),'base64'));fs.writeFileSync('out/bin/insrc-runtime-smoke.js','process.exit(0);');fs.writeFileSync('out/bin/insrc-daemon-supervisor.js','process.exit(0);');
execFileSync('/usr/bin/cc',['-std=c11','-O2','-Wall','-Wextra','-Werror','raw/native/source-actor/main.c','-o','out/bin/insrc-source-actor']);execFileSync('/usr/bin/cc',['-std=c11','-O2','-Wall','-Wextra','-Werror','raw/native/process-broker/main.c','raw/native/process-broker/linux.c','-o','out/bin/insrc-process-broker']);`);
 // Exercise a real spontaneous daemon stop during npm, while update staging owns
 // mutation exclusion. The subsequent activation must recheck its signed profile.
 writeFileSync(join(origin, 'build.mjs'), readFileSync(join(origin, 'build.mjs'), 'utf8') + `
if(process.env.SOURCE_FIXTURE_STOP_DURING_BUILD==='1'){
 const net=await import('node:net'),pid=process.env.HOME+'/.insrc/daemon.pid';
 await new Promise((resolve,reject)=>{const s=net.connect(process.env.HOME+'/.insrc/daemon.sock');s.setTimeout(10000,()=>s.destroy(Error('fixture shutdown timed out')));s.on('connect',()=>s.write(JSON.stringify({id:1,method:'daemon.shutdown',params:{}})+'\\n'));s.on('data',()=>{});s.on('error',reject);s.on('end',resolve);});
 const deadline=Date.now()+10000;while(fs.existsSync(pid)){if(Date.now()>deadline)throw Error('fixture daemon did not exit');await new Promise(r=>setTimeout(r,25));}
}`);
 mkdirSync(join(origin, 'release')); let sequence = 0;
 const predecessors: Record<string, unknown> = { [prior]: { declaration, crashConsistentReopening: true, launchProfiles: ['linux-source-running', 'linux-source-stopped'], recovery: { tree: priorTree } } };
 const publish = () => {
  const previous = git(origin, 'rev-parse', 'HEAD');
  if (sequence) predecessors[previous] = { declaration, crashConsistentReopening: true, launchProfiles: ['linux-source-running', 'linux-source-stopped'] };
  writeFileSync(join(origin, `release/${target}-compatibility.json`), JSON.stringify({ version: 1, target, candidate: declaration, predecessors }));
  writeFileSync(join(origin, 'version.txt'), String(++sequence)); git(origin, 'add', '.'); git(origin, 'commit', '-qm', `candidate ${sequence}`);
  git(origin, '-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'tag', '-fs', 'insrc-release/main', '-m', JSON.stringify({ version: 1, repoUrl: `/mnt/mac${origin}`, branch: 'main', sequence }));
 };
 publish(); execFileSync(process.execPath, ['scripts/bundle-release-bootstrap.mjs', key + '.pub', installer, target]);
 return { origin, prior, installer, publish };
}
async function matrix(shell: boolean) {
 const root = mkdtempSync(join(project, '.insrc/tmp/source-entrypoints-')), bundle = join(root, 'worker.mjs');
 const { buildSync } = await import('esbuild');
 buildSync({ entryPoints: [fileURLToPath(import.meta.url)], outfile: bundle, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
 const machines = JSON.parse((await exec('orb', ['list', '--format=json'])).stdout) as Array<{ name: string; state: string }>;
 for (const [name, target] of [['insrc-node-arm64', 'linux-arm64'], ['insrc-node-x64', 'linux-x64']] as const) {
  const machine = machines.find(item => item.name === name); assert.ok(machine); assert.equal(machine.state, 'stopped');
  await exec('orb', ['start', name], { timeout: 30_000 });
  try {
   const home = (await exec('orb', ['-m', name, '/bin/sh', '-c', 'printf "%s" "$HOME"'])).stdout;
   const node = join(home, 'insrc-node-qualification/home/.insrc/runtimes', `node-v${policy.nodeVersion}-${target}`, policy.targets[target].sha256, 'distribution/bin/node');
   for (const variant of shell ? ['legacy'] : ['legacy', 'bound']) {
    const stage = join(root, `${target}-${variant}`); mkdirSync(stage);
    const a = await authority(stage, target);
    const guestRoot = (await exec('orb', ['-m', name, '/usr/bin/mktemp', '-d', '/tmp/insrc-entrypoints-XXXXXX'])).stdout.trim();
    const config = { root: guestRoot, project: `/mnt/mac${project}`, origin: `/mnt/mac${a.origin}`, prior: a.prior, installer: `/mnt/mac${a.installer}`, variant };
    const invoke = async (phase: string) => {
     try {
      const result = await exec('orb', ['-m', name, '/usr/bin/env', `INSRC_ENTRYPOINT_WORKER=${JSON.stringify({ ...config, phase })}`, node, `/mnt/mac${bundle}`], { timeout: 600_000, maxBuffer: 2 * 1024 * 1024 });
      writeFileSync(join(stage, `${phase}.json`), result.stdout);
     } catch (error) {
      const e = error as { stdout?: string; stderr?: string }; writeFileSync(join(stage, `${phase}-failed.log`), `${e.stdout ?? ''}\n${e.stderr ?? ''}`); throw error;
     }
    };
    try {
     await invoke('migrate');
     if (shell) { await invoke('running'); a.publish(); await invoke('profile-change'); await invoke('update-running'); a.publish(); await invoke('update-stopped'); }
     await invoke('check');
    } finally { await invoke('cleanup'); }
   }
  } finally { await exec('orb', ['stop', name], { timeout: 30_000 }); }
 }
 return root;
}
// Controlled source/application fixtures prove routing and ownership. Production native/data qualification is t9–t11.
test('Current packaged installer upgrades existing legacy/bound target without old npm', { timeout: 1_800_000, skip: process.platform !== 'darwin' }, async t => {
 t.diagnostic(`Entrypoint receipts: ${await matrix(false)}`);
});
test('Shell selected-root routing and update/restart semantics under hostile PATH', { timeout: 2_400_000, skip: process.platform !== 'darwin' }, async t => {
 t.diagnostic(`Shell receipts: ${await matrix(true)}`);
});
}
