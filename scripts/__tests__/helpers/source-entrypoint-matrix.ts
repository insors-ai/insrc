/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createDaemonLifecycleController } from '../../../vscode-plugin/src/daemon/controller.js';
import { defaultSubprocessRunner } from '../../../vscode-plugin/src/daemon/subprocess.js';
import { selectedDaemonRoot, selectedMcpRoot } from '../../../vscode-plugin/src/daemon/paths.js';
import type { IpcClient } from '../../../src/shared/ipc-client.js';
import { sourceEntrypointAuthority as authority } from './source-entrypoint-authority.js';
import policy from '../../../src/assets/node-runtime-policy.json' with { type: 'json' };

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
  CXXFLAGS: '-DINSRC_IDE_FIXTURE=1', BUILD_TRACE: trace, AMBIENT_TRACE: ambient, INSRC_CTL_LOG_DIR: join(c.root, 'ctl-logs'), BASH_ENV: join(c.root, 'bash-env') };
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
 } else if (c.phase === 'ide') {
  const selected = readState().selected.pin;
  const paths = { daemonRoot: old, ctlScript: join(old, 'scripts/daemon-ctl.sh'), daemonEntry: join(old, 'out/daemon/index.js'),
   bundledInstaller: c.installer, sourceStateRoot: state };
  // The IDE host is the worker. Its ambient Node and injection variables must not
  // leak into the independently provisioned installer or selected shell owner.
  Object.assign(process.env, env);
  const client = { reachability: async () => existsSync(join(state, 'daemon.pid')) ? 'running' : 'stopped' } as IpcClient;
  const controller = createDaemonLifecycleController({ runner: defaultSubprocessRunner, paths, client });
  assert.equal(await selectedDaemonRoot(paths), selected.root);
  const update = await controller.run('update'); assert.equal(update.ok, true, update.message);
  assert.equal(update.state, 'stopped', 'an IDE update must preserve the stopped launch profile');
  assert.equal(readState().selected.pin.commit, selected.commit);
  for (const action of ['start', 'restart', 'stop'] as const) {
   const result = await controller.run(action); assert.equal(result.ok, true, result.message);
   assert.equal(result.state, action === 'stop' ? 'stopped' : 'running');
  }
  const wrapper = join((await selectedMcpRoot(paths))!, 'scripts/insrc-mcp');
  const mcp = execFileSync('/bin/bash', [wrapper], { env, encoding: 'utf8', cwd: c.root, timeout: 120_000 });
  assert.equal(JSON.parse(mcp).exe, selected.runtime);
  const journal = join(state, 'source-lifecycle/journal.json'), bytes = readFileSync(journal);
  try {
   writeFileSync(journal, '{malformed');
   const refused = await controller.run('restart'); assert.equal(refused.ok, false);
   assert.equal(existsSync(join(state, 'daemon.pid')), false);
  } finally { writeFileSync(journal, bytes); }
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
   assert.equal(row.python, '1'); assert.equal(row.target, '22.22.1'); assert.equal(row.nativeRuntime, 'node');
   assert.match(String(row.cxx), /-DINSRC_IDE_FIXTURE=1/);
   if (row.phase === 'preinstall') assert.match(String(row.cxx), /-std=c\+\+17/);
   assert.equal(row.options, null); assert.equal(row.nodePath, null); assert.equal(row.cuda, c.variant === 'bound' ? 'v12' : 'skip');
  }
  assert.equal(readState().active, null);
 } else if (c.phase === 'cleanup') {
  if (existsSync(join(state, 'source-lifecycle/journal.json'))) ctl('stop');
  rmSync(c.root, { recursive: true, force: true });
 } else throw new Error('Unknown entrypoint fixture phase');
 process.stdout.write(JSON.stringify({ phase: c.phase, ok: true }) + '\n');
}
export async function matrix(shell: boolean, ide = false) {
 // Origin repositories and generated workers produce substantial filesystem
 // churn. Keep owned fixtures outside the live indexed repo; OrbStack exposes
 // the canonical Mac temp path through the same /mnt/mac mount as the project.
 const root = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-source-entrypoints-'))), bundle = join(root, 'worker.mjs');
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
     if (ide) await invoke('ide');
     if (shell) { await invoke('running'); a.publish(); await invoke('profile-change'); await invoke('update-running'); a.publish(); await invoke('update-stopped'); }
     await invoke('check');
    } finally { await invoke('cleanup'); }
   }
  } finally { await exec('orb', ['stop', name], { timeout: 30_000 }); }
 }
 return root;
}
