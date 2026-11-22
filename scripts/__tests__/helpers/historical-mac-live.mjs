/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { historicalCommit, historicalSnapshot, nativeOnnxProbe, qualificationEmbedder, qualificationRpc, recordedCommand } from './historical-daemon-qualification.mjs';

const project = resolve('.');
const declaration = { version: 1, graphSchema: 10, startup: 'rollback-compatible', formats: { lance: '1', config: '1', repoAndIndexQueue: '1', workflowAndSession: '1' } };
const git = (cwd, ...args) => execFileSync('/usr/bin/git', ['-C', cwd, '-c', 'user.name=Historical qualification fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();

async function until(action, description, timeout = 60_000) {
 const deadline = Date.now() + timeout;
 let last;
 do {
  try { const value = await action(); if (value) return value; } catch (error) { last = error; }
  await delay(250);
 } while (Date.now() < deadline);
 throw new Error(description + ': ' + (last?.message ?? 'deadline exceeded'));
}

/** root contains an independently built, unmodified historical checkout and verified distribution. */
export async function runPreparedHistoricalMac(root) {
 assert.equal(process.platform + '-' + process.arch, 'darwin-arm64');
 const home = join(root, 'home'), prior = join(root, 'prior'), origin = join(root, 'origin');
 const distribution = (await readFile(join(root, 'distribution'), 'utf8')).trim();
 const node = join(distribution, 'bin/node');
 const priorNode = await readFile(join(root, 'prior-runtime'), 'utf8').then(value => value.trim(), error => { if (error.code === 'ENOENT') return node; throw error; });
 assert.equal(git(prior, 'rev-parse', 'HEAD'), historicalCommit);
 assert.equal(git(prior, 'status', '--porcelain'), '');
 const embedder = await qualificationEmbedder();
 const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: root, PATH: distribution + '/bin:/usr/bin:/bin:/usr/sbin:/sbin',
  INSRC_REPO: '', INSRC_DAEMON_ROOT: prior, INSRC_MODE: 'probe-worker', NODE_OPTIONS: '', NODE_PATH: '',
  ONNXRUNTIME_NODE_INSTALL_CUDA: 'skip', PYTHONDONTWRITEBYTECODE: '1', INSRC_CTL_LOG_DIR: join(root, 'ctl-logs') };
 for (const key of Object.keys(env)) if (key.startsWith('NODE_TEST') || key.startsWith('INSRC_TEST')) delete env[key];
 await writeFile(join(home, '.insrc/config.json'), JSON.stringify({
  models: { local: { host: embedder.host, embeddingModel: 'qualification:latest', embeddingDim: 1024 } },
  daemonUpdate: { repoUrl: origin, branch: 'qualification' },
  historicalQualificationMarker: 'retain-this-user-setting',
 }));
 await writeFile(join(home, '.insrc/daemon-node'), priorNode, { mode: 0o600 });
 const stderr = await open(join(root, 'historical-daemon.log'), 'w', 0o600);
 const child = spawn(priorNode, ['--import', 'tsx/esm', join(prior, 'out/daemon/index.js')], { cwd: prior, env, stdio: ['ignore', stderr.fd, stderr.fd] });
 const closed = new Promise(resolve => child.once('close', (...result) => resolve(result)));
 child.on('error', () => {});
 const rpc = (method, params) => qualificationRpc(home, method, params);
 const receipts = { historicalCommit, node, priorNode, historicalPid: child.pid, stages: [] };
 let managedRoot;
 try {
  const initialStatus = await until(() => rpc('daemon.status'), 'historical daemon ready');
  assert.equal(initialStatus.installedCommit, historicalCommit);
  await writeFile(join(root, 'historical-status.json'), JSON.stringify(initialStatus, null, 2));
  const repo = join(root, 'seed-repo'); await mkdir(repo);
  git(repo, 'init', '-qb', 'main');
  await writeFile(join(repo, 'seed.ts'), 'export function historicalSeed() { return 42; }\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'historical user data');
  assert.equal((await rpc('repo.add', { path: repo })).ok, true);
  await until(async () => {
   const result = await rpc('search.by_file', { filePath: join(repo, 'seed.ts') });
   return Array.isArray(result) && result.some(entity => entity.name === 'historicalSeed') ? result : false;
  }, 'historical seed indexed', 120_000);
  assert.equal((await rpc('repo.settings.set', { repo, key: 'type', value: 'none' })).ok, true);
  const turn = { sessionId: 'historical-runtime-qualification', idx: 0, user: 'preserve historical turn', assistant: 'preserved answer', entities: [], vector: embedder.vector, repo };
  assert.equal((await rpc('session.save', turn)).ok, true);
  assert.equal((await rpc('session.close', { id: turn.sessionId, repo, summary: 'historical session', seenEntities: [], summaryVector: embedder.vector })).ok, true);
  const snapshot = () => historicalSnapshot(home, repo);
  const baseline = await snapshot();
  assert.ok(baseline.vectors.length > 0);
  await writeFile(join(root, 'seed-ipc.json'), JSON.stringify(baseline, null, 2));
  receipts.stages.push('historical IPC graph/vector/session/config seed');

  git(root, 'clone', '--no-hardlinks', '--quiet', '--branch', 'v2', project, origin);
  git(origin, 'checkout', '-qb', 'qualification');
  const key = join(root, 'fixture-signing-key');
  execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
  const predecessors = { [historicalCommit]: { declaration, crashConsistentReopening: true, launchProfiles: ['legacy-direct', 'legacy-stopped', 'managed'] } };
  let sequence = 0;
  const publish = async () => {
   const previous = git(origin, 'rev-parse', 'HEAD');
   if (sequence) predecessors[previous] = { declaration, crashConsistentReopening: true, launchProfiles: ['managed'] };
   await mkdir(join(origin, 'release'), { recursive: true });
   await writeFile(join(origin, 'release/macos-compatibility.json'), JSON.stringify({ version: 1, candidate: declaration, predecessors }));
   await writeFile(join(origin, 'release/qualification-sequence.txt'), String(++sequence));
   git(origin, 'add', 'release'); git(origin, 'commit', '-qm', 'Fixture-only historical source qualification ' + sequence);
   git(origin, '-c', 'gpg.format=ssh', '-c', 'user.signingkey=' + key, 'tag', '-fs', 'insrc-release/qualification', '-m', JSON.stringify({ version: 1, repoUrl: origin, branch: 'qualification', sequence }));
   return git(origin, 'rev-parse', 'HEAD');
  };
  const candidate = await publish();
  const installer = join(root, 'fixture-installer.sh');
  await recordedCommand(root, 'package-installer', node, ['scripts/bundle-release-bootstrap.mjs', key + '.pub', installer, 'darwin'], { cwd: project, env });
  const assertData = async stage => {
   const current = await snapshot();
   assert.deepEqual(current, baseline, stage + ': seeded IPC data changed');
   const config = JSON.parse(await readFile(join(home, '.insrc/config.json'), 'utf8'));
   assert.equal(config.historicalQualificationMarker, 'retain-this-user-setting');
   await writeFile(join(root, stage + '-ipc.json'), JSON.stringify(current, null, 2));
  };
  // Deliberately unusable ambient injection must be removed before any Node process.
  const bootstrapEnv = { ...env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', NODE_OPTIONS: '--invalid-qualification-injection', NODE_PATH: '/nonexistent/hostile-node-path' };
  await recordedCommand(root, 'historical-upgrade', '/bin/bash', [installer, '-y', '--target', prior, '--repo', origin, '--branch', 'qualification', '--migrate-runtime', '--no-start'], { cwd: root, env: bootstrapEnv, timeout: 1_800_000 });
  const selected = JSON.parse(await readFile(join(home, '.insrc/managed-lifecycle/installation.json'), 'utf8'));
  managedRoot = selected.releaseRoot;
  assert.equal(selected.releaseId, candidate);
  assert.equal(selected.runtime, node);
  assert.equal((await rpc('daemon.status')).installedCommit, candidate);
  await closed;
  await assertData('migrated');
  receipts.stages.push('historical running -> managed current, hostile injection/no ambient Node');
  await recordedCommand(root, 'candidate-cpu-onnx', node, ['--input-type=module', '-e', nativeOnnxProbe], { cwd: managedRoot, env });
  const next = await publish();
  await recordedCommand(root, 'subsequent-upgrade', '/bin/bash', [installer, '-y', '--target', prior, '--repo', origin, '--branch', 'qualification', '--migrate-runtime', '--no-start'], { cwd: root, env: bootstrapEnv, timeout: 1_800_000 });
  const selectedNext = JSON.parse(await readFile(join(home, '.insrc/managed-lifecycle/installation.json'), 'utf8'));
  managedRoot = selectedNext.releaseRoot;
  assert.equal(selectedNext.releaseId, next);
  assert.equal((await rpc('daemon.status')).installedCommit, next);
  await assertData('subsequent');
  receipts.stages.push('managed current -> subsequent source update');
  return receipts;
 } finally {
  try {
   if (managedRoot) await recordedCommand(root, 'managed-stop', '/bin/bash', [join(managedRoot, 'scripts/daemon-ctl.sh'), 'stop'], { cwd: root, env: { ...env, INSRC_DAEMON_ROOT: managedRoot }, timeout: 120_000 });
   else {
    await rpc('daemon.shutdown').catch(() => {});
    const killer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    await closed; clearTimeout(killer);
   }
  } finally {
   await stderr.close();
   await embedder.close();
   await writeFile(join(root, 'qualification-receipts.json'), JSON.stringify(receipts, null, 2));
  }
 }
}

/** Continue the same real migrated installation; all faults live in fixture source/environment. */
export async function runHistoricalMacFaults(root) {
 const home = join(root, 'home'), state = join(home, '.insrc'), origin = join(root, 'origin');
 const installer = join(root, 'fixture-installer.sh'), logical = join(root, 'prior');
 const selected = JSON.parse(await readFile(join(state, 'managed-lifecycle/installation.json'), 'utf8'));
 const node = selected.runtime, embedder = await qualificationEmbedder();
 const config = JSON.parse(await readFile(join(state, 'config.json'), 'utf8'));
 config.models.local.host = embedder.host;
 await writeFile(join(state, 'config.json'), JSON.stringify(config));
 const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: root, PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  INSRC_REPO: '', INSRC_DAEMON_ROOT: selected.releaseRoot, INSRC_MODE: 'probe-worker',
  NODE_OPTIONS: '--invalid-qualification-injection', NODE_PATH: '/nonexistent/hostile-node-path',
  ONNXRUNTIME_NODE_INSTALL_CUDA: 'skip', PYTHONDONTWRITEBYTECODE: '1', INSRC_CTL_LOG_DIR: join(root, 'ctl-logs') };
 for (const key of Object.keys(env)) if (key.startsWith('NODE_TEST') || key.startsWith('INSRC_TEST')) delete env[key];
 const baseline = JSON.parse(await readFile(join(root, 'seed-ipc.json'), 'utf8'));
 const selector = async () => JSON.parse(await readFile(join(state, 'managed-lifecycle/installation.json'), 'utf8'));
 const journal = async () => JSON.parse(await readFile(join(state, 'managed-lifecycle/journal.json'), 'utf8'));
 const rpc = (method, params) => qualificationRpc(home, method, params);
 const assertData = async label => {
  const data = await until(() => historicalSnapshot(home, join(root, 'seed-repo')), label + ' IPC ready');
  assert.deepEqual(data, baseline, label + ': seeded IPC data changed');
  assert.equal(JSON.parse(await readFile(join(state, 'config.json'), 'utf8')).historicalQualificationMarker, 'retain-this-user-setting');
  await writeFile(join(root, label + '-ipc.json'), JSON.stringify(data, null, 2));
 };
 let current = selected;
 const ctl = async (label, command) => recordedCommand(root, label, '/bin/bash', [join(current.releaseRoot, 'scripts/daemon-ctl.sh'), command, '--skip-sync', '--skip-install', '--skip-build'], { cwd: root, env: { ...env, INSRC_DAEMON_ROOT: current.releaseRoot }, timeout: 180_000 });
 const source = join(origin, 'src/daemon/index.ts'), original = await readFile(source, 'utf8');
 let sequence = Number(await readFile(join(origin, 'release/qualification-sequence.txt'), 'utf8'));
 const catalogFile = join(origin, 'release/macos-compatibility.json');
 const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
 const publish = async fault => {
  catalog.predecessors[current.releaseId] = { declaration, crashConsistentReopening: true, launchProfiles: ['managed'] };
  await writeFile(catalogFile, JSON.stringify(catalog));
  // This source fault is signed fixture content. All actual application imports,
  // dependencies and native probes remain; only probation startup exits early.
  await writeFile(source, (fault ? "if (process.env['INSRC_PROBATION_UPDATE']) process.exit(86);\n" : '') + original);
  await writeFile(join(origin, 'release/qualification-sequence.txt'), String(++sequence));
  git(origin, 'add', 'release', 'src/daemon/index.ts');
  git(origin, 'commit', '-qm', fault ? 'Fixture-only probation startup fault' : 'Fixture-only clean retry');
  git(origin, '-c', 'gpg.format=ssh', '-c', 'user.signingkey=' + join(root, 'fixture-signing-key'), 'tag', '-fs', 'insrc-release/qualification', '-m', JSON.stringify({ version: 1, repoUrl: origin, branch: 'qualification', sequence }));
  return git(origin, 'rev-parse', 'HEAD');
 };
 const install = (name, override = {}, expectedCodes = [0]) => recordedCommand(root, name, '/bin/bash', [installer, '-y', '--target', logical, '--repo', origin, '--branch', 'qualification', '--migrate-runtime', '--no-start'], { cwd: root, env: { ...env, ...override }, expectedCodes, timeout: 1_800_000 });
 const receipts = { stages: [] };
 try {
  await ctl('faults-start', 'start');
  await assertData('faults-initial');
  const initialPid = (await readFile(join(state, 'daemon.pid'), 'utf8')).trim();
  const { readDarwinIncarnation } = await import(pathToFileURL(join(selected.releaseRoot, 'out/shared/darwin-lifecycle.js')).href);
  const initialIdentity = await readDarwinIncarnation(Number(initialPid));
  await publish(false);
  await install('native-build-failure', { CXXFLAGS: '-finsrc-qualification-native-failure' }, [1, 4]);
  assert.match(await readFile(join(root, 'native-build-failure.log'), 'utf8'), /(?:unknown|unrecognized|unsupported).*finsrc-qualification-native-failure/);
  assert.deepEqual(await selector(), selected);
  assert.equal((await readFile(join(state, 'daemon.pid'), 'utf8')).trim(), initialPid);
  assert.deepEqual(await readDarwinIncarnation(Number(initialPid)), initialIdentity);
  receipts.retainedIdentity = initialIdentity;
  assert.equal((await journal()).active, null);
  assert.equal((await rpc('daemon.status')).installedCommit, selected.releaseId);
  await assertData('native-failure-retained');
  receipts.stages.push('actual native compiler failure before cutover preserves exact live prior PID/selection/data');
  const failed = await publish(true);
  await install('readiness-failure', {}, [4]);
  const rolledBack = await journal();
  assert.equal(rolledBack.active, null);
  assert.equal(rolledBack.outcome.decision, 'rolled-back');
  assert.deepEqual(await selector(), selected);
  assert.equal((await rpc('daemon.status')).installedCommit, selected.releaseId);
  await assertData('readiness-rollback');
  receipts.failedCandidate = failed;
  receipts.rollback = rolledBack.outcome;
  receipts.stages.push('actual signed application candidate fails probation; existing owner restores qualified prior');
  const retry = await publish(false);
  await install('readiness-retry');
  current = await selector();
  assert.equal(current.releaseId, retry);
  assert.equal(current.runtime, node);
  assert.equal((await rpc('daemon.status')).installedCommit, retry);
  await assertData('readiness-retry');
  await ctl('qualified-restart', 'restart');
  await assertData('qualified-restart');
  receipts.retryCommit = retry;
  receipts.stages.push('clean retry commits; selected shell restart preserves real historical IPC data');
  return receipts;
 } finally {
  current = await selector();
  try { await ctl('faults-stop', 'stop'); }
  finally {
   await embedder.close();
   await writeFile(join(root, 'fault-receipts.json'), JSON.stringify(receipts, null, 2));
  }
 }
}

export async function verifyHistoricalMacMcp(root) {
 const home = join(root, 'home'), state = join(home, '.insrc');
 const selected = JSON.parse(await readFile(join(state, 'managed-lifecycle/installation.json'), 'utf8'));
 const stub = await qualificationEmbedder();
 const config = JSON.parse(await readFile(join(state, 'config.json'), 'utf8'));
 config.models.local.host = stub.host;
 await writeFile(join(state, 'config.json'), JSON.stringify(config));
 const env = { ...process.env, HOME: home, INSRC_REPO: join(root, 'seed-repo'), INSRC_MODE: 'probe-worker',
  INSRC_DAEMON_ROOT: selected.releaseRoot, PATH: '/usr/bin:/bin', NODE_OPTIONS: '--invalid-qualification-injection', NODE_PATH: '/nonexistent/hostile-node-path' };
 for (const key of Object.keys(env)) if (key.startsWith('NODE_TEST') || key.startsWith('INSRC_TEST')) delete env[key];
 const ctl = command => recordedCommand(root, 'mcp-' + command, '/bin/bash', [join(selected.releaseRoot, 'scripts/daemon-ctl.sh'), command, '--skip-sync', '--skip-install', '--skip-build'], { cwd: root, env, timeout: 180_000 });
 const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
 const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
 const transport = new StdioClientTransport({ command: '/bin/bash', args: [join(root, 'prior/scripts/insrc-mcp')], cwd: join(root, 'seed-repo'), env, stderr: 'pipe' });
 const client = new Client({ name: 'historical-source-qualification', version: '1' });
 let stderr = '';
 transport.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
 try {
  await ctl('start');
  await client.connect(transport);
  assert.ok((await client.listTools()).tools.some(tool => tool.name === 'insrc_schema'));
  const result = await client.callTool({ name: 'insrc_schema', arguments: { tool: 'insrc_build_step', phase: 'implement' } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const { readDarwinIncarnation, readDarwinLaunchContext } = await import(pathToFileURL(join(selected.releaseRoot, 'out/shared/darwin-lifecycle.js')).href);
  // The migration dispatcher retains its captured child rather than execing it.
  // Observe that direct child after MCP initialization, then verify its native identity.
  const children = execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n')
   .map(line => line.trim().split(/\s+/).map(Number)).filter(([, parent]) => parent === transport.pid);
  const processes = [];
  for (const [pid] of children) processes.push({ identity: await readDarwinIncarnation(pid), context: await readDarwinLaunchContext(pid) });
  const mcp = processes.find(item => item.context.argv.includes(join(selected.releaseRoot, 'out/bin/insrc-mcp.js')));
  assert.ok(mcp, JSON.stringify(processes));
  const { identity, context } = mcp;
  assert.equal(identity.executable, selected.runtime);
  assert.ok(context.argv.includes(join(selected.releaseRoot, 'out/bin/insrc-mcp.js')));
  await writeFile(join(root, 'mcp-route.json'), JSON.stringify({ selected, identity, context, result }, null, 2));
 } finally {
  await client.close();
  await writeFile(join(root, 'mcp-stderr.log'), stderr);
  try { await ctl('stop'); } finally { await stub.close(); }
 }
}

/** Remove only this fixture's idle supervisor through its existing exact-incarnation owner. */
export async function closeHistoricalMacSupervisor(root) {
 const home = join(root, 'home'), state = join(home, '.insrc');
 const selected = await readFile(join(state, 'managed-lifecycle/installation.json'), 'utf8').then(JSON.parse, error => { if (error.code === 'ENOENT') return undefined; throw error; });
 if (!selected) return;
 const code = `
import assert from 'node:assert/strict';
const base=${JSON.stringify(pathToFileURL(selected.releaseRoot + '/').href)},state=${JSON.stringify(state)};
const {InstallationMutationGate}=await import(new URL('out/shared/installation-mutation-gate.js',base));
const {readDarwinIncarnation}=await import(new URL('out/shared/darwin-lifecycle.js',base));
const {readManagedInstallation,requireQuiescentInstallation,removeManagedJob}=await import(new URL('out/shared/managed-daemon-installation.js',base));
const gate=new InstallationMutationGate(state),selected=await readManagedInstallation(state);
const reservation=await gate.reserve({kind:'stop',owner:await readDarwinIncarnation(process.pid)});
try { const proof=await removeManagedJob(selected,async()=>{await gate.admit(reservation);assert.deepEqual(await readManagedInstallation(state),selected);await requireQuiescentInstallation(selected);}); process.stdout.write(JSON.stringify(proof)+'\\n'); }
finally {await gate.release(reservation);}
`;
 await recordedCommand(root, 'supervisor-closure', selected.runtime, ['--input-type=module', '-e', code], { cwd: project, env: { ...process.env, HOME: home, INSRC_MODE: 'probe-worker', NODE_OPTIONS: '', NODE_PATH: '' }, timeout: 60_000 });
}
