/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { historicalCommit, historicalSnapshot, nativeOnnxProbe, qualificationEmbedder, qualificationRpc, recordedCommand } from './historical-daemon-qualification.mjs';

const declaration = { version: 1, graphSchema: 10, startup: 'rollback-compatible', formats: { lance: '1', config: '1', repoAndIndexQueue: '1', workflowAndSession: '1' } };
const git = (cwd, ...args) => execFileSync('/usr/bin/git', ['-C', cwd, '-c', 'user.name=Linux historical qualification fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
async function until(action, description, timeout = 120_000) {
 const deadline = Date.now() + timeout; let last;
 do { try { const value = await action(); if (value) return value; } catch (error) { last = error; } await delay(250); } while (Date.now() < deadline);
 throw new Error(description + ': ' + (last?.message ?? 'deadline exceeded'));
}
async function prepared(root) {
 const home = join(root, 'home'), state = join(home, '.insrc');
 const distribution = (await readFile(join(root, 'distribution'), 'utf8')).trim();
 const node = join(distribution, 'bin/node');
 return { home, state, distribution, node, prior: join(root, 'prior'), origin: join(root, 'origin') };
}
function cleanEnvironment(home, distribution, root) {
 const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: root, INSRC_MODE: 'probe-worker', INSRC_REPO: '',
  PATH: distribution + '/bin:/usr/bin:/bin', NODE_OPTIONS: '', NODE_PATH: '',
  ONNXRUNTIME_NODE_INSTALL_CUDA: 'skip', PYTHONDONTWRITEBYTECODE: '1', INSRC_CTL_LOG_DIR: join(root, 'ctl-logs') };
 for (const key of Object.keys(env)) if (key.startsWith('NODE_TEST') || key.startsWith('INSRC_TEST')) delete env[key];
 return env;
}

/** Prepare a real already-built historical tree; no application/runtime stubs. */
export async function prepareLinuxAuthority(root, project, externalNode) {
 assert.equal(process.platform, 'linux');
 const { home, state, distribution, node, prior, origin } = await prepared(root);
 const target = 'linux-' + process.arch, env = cleanEnvironment(home, distribution, root);
 assert.equal(git(prior, 'rev-parse', 'HEAD'), historicalCommit);
 assert.equal(git(prior, 'status', '--porcelain'), '');
 await access(externalNode);
 await writeFile(join(root, 'prior-runtime'), externalNode);
 await recordedCommand(root, 'owned-npm-version', node, [join(distribution, 'lib/node_modules/npm/bin/npm-cli.js'), '--version'], { cwd: prior, env });
 await recordedCommand(root, 'prior-native-modules', node, [join(project, 'out/bin/insrc-runtime-smoke.js'), prior], { cwd: prior, env });
 await recordedCommand(root, 'prior-cpu-onnx', node, ['--input-type=module', '-e', nativeOnnxProbe], { cwd: prior, env });
 const { measureManagedReleaseFingerprint } = await import(pathToFileURL(join(project, 'out/daemon/managed-release-staging.js')).href);
 const fingerprint = await measureManagedReleaseFingerprint(prior, externalNode);
 await writeFile(join(root, 'historical-pin.json'), JSON.stringify({ root: prior, runtime: externalNode, commit: historicalCommit, tree: git(prior, 'rev-parse', 'HEAD^{tree}'), fingerprint }, null, 2));
 git(root, 'clone', '--no-hardlinks', '--quiet', '--branch', 'v2', project, origin);
 git(origin, 'checkout', '-qb', 'qualification');
 const key = join(root, 'fixture-signing-key');
 execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
 const catalog = { version: 1, target, candidate: declaration, predecessors: {
  [historicalCommit]: { declaration, fingerprint, crashConsistentReopening: true, launchProfiles: ['linux-source-running', 'linux-source-stopped'], recovery: { tree: git(prior, 'rev-parse', 'HEAD^{tree}') } },
 } };
 await mkdir(join(origin, 'release'), { recursive: true });
 await writeFile(join(origin, `release/${target}-compatibility.json`), JSON.stringify(catalog));
 await writeFile(join(origin, 'release/qualification-sequence.txt'), '0');
 const authority = await linuxPublisher(root);
 await authority.publish(false);
 await writeFile(join(root, 'host-os.log'), await readFile('/etc/os-release', 'utf8') + '\n' + execFileSync('/usr/bin/uname', ['-a'], { encoding: 'utf8' }));
 return { root, target, publicKey: await readFile(key + '.pub', 'utf8'), state, distribution };
}

async function linuxPublisher(root) {
 const { origin } = await prepared(root), target = 'linux-' + process.arch;
 const catalogFile = join(origin, `release/${target}-compatibility.json`);
 const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
 let sequence = Number(await readFile(join(origin, 'release/qualification-sequence.txt'), 'utf8'));
 const source = join(origin, 'src/daemon/index.ts');
 const original = (await readFile(source, 'utf8')).replace(/^if \(process\.env\['INSRC_SOURCE_ACTOR_TOKEN'\]\) process\.exit\(86\);\n/, '');
 return { async publish(fault, predecessor) {
  if (predecessor) catalog.predecessors[predecessor] = { declaration, crashConsistentReopening: true, launchProfiles: ['linux-source-running', 'linux-source-stopped'] };
  await writeFile(catalogFile, JSON.stringify(catalog));
  await writeFile(source, (fault ? "if (process.env['INSRC_SOURCE_ACTOR_TOKEN']) process.exit(86);\n" : '') + original);
  await writeFile(join(origin, 'release/qualification-sequence.txt'), String(++sequence));
  git(origin, 'add', 'release', 'src/daemon/index.ts'); git(origin, 'commit', '-qm', fault ? 'Fixture-only Linux source startup fault' : 'Fixture-only Linux source qualification ' + sequence);
  git(origin, '-c', 'gpg.format=ssh', '-c', 'user.signingkey=' + join(root, 'fixture-signing-key'), 'tag', '-fs', 'insrc-release/qualification', '-m', JSON.stringify({ version: 1, repoUrl: origin, branch: 'qualification', sequence }));
  return git(origin, 'rev-parse', 'HEAD');
 } };
}

/** Real historical source, retained data and explicit qualified recovery through the public installer. */
export async function runHistoricalLinux(root, project, installer) {
 const { home, state, distribution, node, prior, origin } = await prepared(root);
 const priorNode = (await readFile(join(root, 'prior-runtime'), 'utf8')).trim();
 const env = cleanEnvironment(home, distribution, root), target = 'linux-' + process.arch;
 env.INSRC_DAEMON_ROOT = prior;
 const stub = await qualificationEmbedder();
 await writeFile(join(state, 'config.json'), JSON.stringify({ models: { local: { host: stub.host, embeddingModel: 'qualification:latest', embeddingDim: 1024 } }, daemonUpdate: { repoUrl: origin, branch: 'qualification' }, historicalQualificationMarker: 'retain-this-user-setting' }));
 await writeFile(join(state, 'daemon-node'), priorNode, { mode: 0o600 });
 const log = await open(join(root, 'historical-daemon.log'), 'w', 0o600);
 const child = spawn(priorNode, ['--import', 'tsx/esm', join(prior, 'out/daemon/index.js')], { cwd: prior, env, stdio: ['ignore', log.fd, log.fd] });
 const closed = new Promise(resolve => child.once('close', (...value) => resolve(value)));
 child.on('error', () => {});
 const rpc = (method, params) => qualificationRpc(home, method, params);
 const journal = async () => JSON.parse(await readFile(join(state, 'source-lifecycle/journal.json'), 'utf8'));
 const hostile = join(root, 'hostile'); await mkdir(hostile, { recursive: true });
 for (const name of ['node', 'npm']) await writeFile(join(hostile, name), `#!/bin/sh\nprintf '%s\\n' '${name}' >> '${join(root, 'ambient-used')}'\nexit 97\n`, { mode: 0o700 });
 const entryEnv = { ...env, PATH: hostile + ':/usr/bin:/bin', NODE_OPTIONS: '--invalid-linux-qualification-injection', NODE_PATH: '/untrusted/qualification' };
 const install = (name, rebuild = false, expectedCodes = [0], override = {}) => recordedCommand(root, name, '/bin/bash', [installer, '-y', '--target', prior, '--repo', origin, '--branch', 'qualification', '--migrate-runtime', '--predecessor', historicalCommit, ...(rebuild ? ['--rebuild-predecessor'] : []), '--no-start'], { cwd: root, env: { ...entryEnv, ...override }, expectedCodes, timeout: 1_800_000 });
 let current;
 const ctl = async (name, command) => {
  current = (await journal()).selected;
  assert.ok(current, 'a qualified selected source is required');
  return recordedCommand(root, name, '/bin/bash', [join(current.pin.root, 'scripts/daemon-ctl.sh'), command, '--skip-sync', '--skip-install', '--skip-build'], { cwd: root, env: { ...entryEnv, INSRC_DAEMON_ROOT: prior }, timeout: 300_000 });
 };
 const receipts = { target, historicalCommit, priorNode, node, stages: [] };
 try {
  assert.equal((await until(() => rpc('daemon.status'), 'historical daemon ready')).installedCommit, historicalCommit);
  const repo = join(root, 'seed-repo'); await mkdir(repo); git(repo, 'init', '-qb', 'main');
  await writeFile(join(repo, 'seed.ts'), 'export function historicalSeed() { return 42; }\n'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'historical Linux user data');
  assert.equal((await rpc('repo.add', { path: repo })).ok, true);
  await until(async () => { const entities = await rpc('search.by_file', { filePath: join(repo, 'seed.ts') }); return entities.some(entity => entity.name === 'historicalSeed'); }, 'historical repository indexed');
  assert.equal((await rpc('repo.settings.set', { repo, key: 'type', value: 'none' })).ok, true);
  const turn = { sessionId: 'historical-runtime-qualification', idx: 0, user: 'preserve historical turn', assistant: 'preserved answer', entities: [], vector: stub.vector, repo };
  assert.equal((await rpc('session.save', turn)).ok, true);
  assert.equal((await rpc('session.close', { id: turn.sessionId, repo, summary: 'historical session', seenEntities: [], summaryVector: stub.vector })).ok, true);
  const baseline = await historicalSnapshot(home, repo); assert.ok(baseline.vectors.length);
  await writeFile(join(root, 'seed-ipc.json'), JSON.stringify(baseline, null, 2));
  const assertData = async name => {
   const value = await until(() => historicalSnapshot(home, repo), name + ' IPC ready'); assert.deepEqual(value, baseline);
   assert.equal(JSON.parse(await readFile(join(state, 'config.json'), 'utf8')).historicalQualificationMarker, 'retain-this-user-setting');
   await writeFile(join(root, name + '-ipc.json'), JSON.stringify(value, null, 2));
  };
  // Linux never adopts an unmanaged process without a retained native ownership
  // ticket. Its original captured child is drained before staged activation.
  await rpc('daemon.shutdown');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000); await closed; clearTimeout(timeout);
  assert.equal(child.exitCode, 0);
  receipts.stages.push('real historical application seeds data and closes through IPC before Linux ownership migration');

  // Model a partly failed old update, retaining all user work and original bytes.
  const oldEntry = join(prior, 'out/daemon/index.js');
  await writeFile(oldEntry, (await readFile(oldEntry, 'utf8')) + '\n// stale output from a failed legacy update\n');
  await writeFile(join(prior, 'retained-user-work.txt'), 'do not overwrite local work\n');
  await rename(join(prior, 'node_modules/fs-ext'), join(prior, 'node_modules/fs-ext.retained-before-failed-update'));
  const retained = { entry: createHash('sha256').update(await readFile(oldEntry)).digest('hex'), note: await readFile(join(prior, 'retained-user-work.txt'), 'utf8'), git: git(prior, 'status', '--porcelain') };
  await install('unqualified-old-build-refused', false, [4]);
  const rejected = await journal(); assert.equal(rejected.selected, null); assert.equal(rejected.active, null);
  assert.equal(rejected.outcome.decision, 'rolled-back');
  const directories = (await import('node:fs/promises')).readdir;
  const releases = join(state, 'source-lifecycle/releases');
  const stageRoots = (await directories(releases)).filter(name => !name.startsWith('.')).map(name => join(releases, name, 'checkout'));
  assert.ok(stageRoots.length);
  await recordedCommand(root, 'broken-predecessor-inspect', node, [join(stageRoots[0], 'out/bin/insrc-source-recovery.js'), 'inspect', state, prior, priorNode], { cwd: root, env });
  const inventory = JSON.parse((await readFile(join(root, 'broken-predecessor-inspect.log'), 'utf8')).trim());
  assert.equal(inventory.activationPermitted, false);
  assert.ok(inventory.inventory.issues.includes('source-or-lockfile-dirty'));
  assert.ok(inventory.inventory.issues.includes('source-or-output-ahead-of-build-attestation'));
  assert.equal(createHash('sha256').update(await readFile(oldEntry)).digest('hex'), retained.entry);

  await install('historical-qualified-recovery', true);
  current = (await journal()).selected; assert.ok(current); assert.equal(current.pin.runtime, node);
  assert.equal((await journal()).active, null);
  await assert.rejects(access(join(state, 'daemon.pid')), { code: 'ENOENT' });
  assert.equal(createHash('sha256').update(await readFile(oldEntry)).digest('hex'), retained.entry);
  assert.equal(await readFile(join(prior, 'retained-user-work.txt'), 'utf8'), retained.note);
  assert.equal(git(prior, 'status', '--porcelain'), retained.git);
  await assert.rejects(access(join(prior, 'node_modules/fs-ext')), { code: 'ENOENT' });
  await ctl('migrated-start', 'start'); await assertData('migrated');
  receipts.stages.push('dirty/stale/partial predecessor refused; explicit signed recovery rebuild stages old actual source without overwriting incumbent');
  receipts.firstCommit = current.pin.commit;
  await recordedCommand(root, 'candidate-native-modules', node, [join(current.pin.root, 'out/bin/insrc-runtime-smoke.js')], { cwd: current.pin.root, env });
  await recordedCommand(root, 'candidate-cpu-onnx', node, ['--input-type=module', '-e', nativeOnnxProbe], { cwd: current.pin.root, env });
  const authority = await linuxPublisher(root);
  const next = await authority.publish(false, current.pin.commit);
  await recordedCommand(root, 'bound-source-update', '/bin/bash', [installer, '-y', '--target', prior, '--repo', origin, '--branch', 'qualification', '--migrate-runtime', '--no-start'], { cwd: root, env: entryEnv, timeout: 1_800_000 });
  current = (await journal()).selected; assert.equal(current.pin.commit, next);
  assert.equal((await rpc('daemon.status')).installedCommit, next); await assertData('subsequent');
  await ctl('selected-restart', 'restart'); await assertData('selected-restart');
  receipts.nextCommit = next; receipts.stages.push('actual migrated source subsequently updates and restarts with owned runtime and identical IPC data');
  return receipts;
 } finally {
  try {
   if (await access(join(state, 'source-lifecycle/journal.json')).then(() => true, () => false)) {
    if ((await journal()).selected) await ctl('qualification-stop', 'stop');
   } else { await rpc('daemon.shutdown').catch(() => {}); const timer = setTimeout(() => child.kill('SIGKILL'), 10_000); await closed; clearTimeout(timer); }
  } finally { await log.close(); await stub.close(); await writeFile(join(root, 'qualification-receipts.json'), JSON.stringify(receipts, null, 2)); }
 }
}

/** Retain the actual application/data while exercising native ownership recovery. */
export async function runHistoricalLinuxFaults(root, project, installer) {
 const { home, state, distribution, node, prior, origin } = await prepared(root), target = 'linux-' + process.arch;
 const env = cleanEnvironment(home, distribution, root), stub = await qualificationEmbedder();
 const config = JSON.parse(await readFile(join(state, 'config.json'), 'utf8')); config.models.local.host = stub.host;
 await writeFile(join(state, 'config.json'), JSON.stringify(config));
 const entryEnv = { ...env, PATH: join(root, 'hostile') + ':/usr/bin:/bin', NODE_OPTIONS: '--invalid-linux-qualification-injection', NODE_PATH: '/untrusted/qualification', INSRC_DAEMON_ROOT: prior };
 const journal = async () => JSON.parse(await readFile(join(state, 'source-lifecycle/journal.json'), 'utf8'));
 const rpc = (method, params) => qualificationRpc(home, method, params);
 const baseline = JSON.parse(await readFile(join(root, 'seed-ipc.json'), 'utf8'));
 const assertData = async name => {
  const data = await until(() => historicalSnapshot(home, join(root, 'seed-repo')), name + ' IPC ready'); assert.deepEqual(data, baseline);
  await writeFile(join(root, name + '-ipc.json'), JSON.stringify(data, null, 2));
  assert.equal(JSON.parse(await readFile(join(state, 'config.json'), 'utf8')).historicalQualificationMarker, 'retain-this-user-setting');
 };
 let current = (await journal()).selected;
 const ctl = async (name, command) => { current = (await journal()).selected; return recordedCommand(root, name, '/bin/bash', [join(current.pin.root, 'scripts/daemon-ctl.sh'), command, '--skip-sync', '--skip-install', '--skip-build'], { cwd: root, env: entryEnv, timeout: 300_000 }); };
 const install = (name, expectedCodes = [0], override = {}) => recordedCommand(root, name, '/bin/bash', [installer, '-y', '--target', prior, '--repo', origin, '--branch', 'qualification', '--migrate-runtime', '--no-start'], { cwd: root, env: { ...entryEnv, ...override }, expectedCodes, timeout: 1_800_000 });
 const authority = await linuxPublisher(root), receipts = { target, stages: [] };
 try {
  await ctl('faults-start', 'start'); await assertData('faults-initial');
  const { readProcessIdentity } = await import(pathToFileURL(join(current.pin.root, 'out/shared/daemon-process.js')).href);
  const pid = Number(await readFile(join(state, 'daemon.pid'), 'utf8'));
  const identity = readProcessIdentity(pid), selectedBefore = current;
  assert.ok(identity);

  // Real owned Node/npm environment checks, including explicit empty/v12 CUDA
  // choices. These run no CUDA download or embedding-model inference.
  const { resolveOwnedToolchain, ownedNodeEnvironment } = await import(pathToFileURL(join(current.pin.root, 'out/shared/owned-node-runtime.js')).href);
  const toolchain = await resolveOwnedToolchain(current.pin.root, state);
  for (const [name, cuda] of [['unset', undefined], ['empty', ''], ['v12', 'v12']]) {
   const parent = { ...entryEnv }; if (cuda === undefined) delete parent.ONNXRUNTIME_NODE_INSTALL_CUDA; else parent.ONNXRUNTIME_NODE_INSTALL_CUDA = cuda;
   const owned = ownedNodeEnvironment(toolchain, parent);
   await recordedCommand(root, 'owned-environment-' + name, toolchain.node, ['-e', `process.stdout.write(JSON.stringify({exe:process.execPath,node:process.versions.node,cuda:process.env.ONNXRUNTIME_NODE_INSTALL_CUDA,options:process.env.NODE_OPTIONS??null,nodePath:process.env.NODE_PATH??null,python:process.env.PYTHONDONTWRITEBYTECODE,target:process.env.npm_config_target}));`], { cwd: root, env: owned });
   const observed = JSON.parse(await readFile(join(root, 'owned-environment-' + name + '.log'), 'utf8'));
   assert.deepEqual(observed, { exe: node, node: '22.22.1', cuda: cuda === undefined ? 'skip' : cuda, options: null, nodePath: null, python: '1', target: '22.22.1' });
   await recordedCommand(root, 'owned-npm-' + name, toolchain.node, [toolchain.npm, '--version'], { cwd: root, env: owned });
   assert.equal((await readFile(join(root, 'owned-npm-' + name + '.log'), 'utf8')).trim(), '10.9.4');
  }
  for (const ambient of ['absent', '20', '26']) {
   const bin = join(root, 'ambient-' + ambient); await mkdir(bin);
   if (ambient !== 'absent') for (const name of ['node', 'npm']) await writeFile(join(bin, name), `#!/bin/sh\nprintf '%s\\n' '${name}:${ambient}' >> '${join(root, 'ambient-used')}'\nprintf 'v${ambient}.0.0\\n'\nexit 97\n`, { mode: 0o700 });
   await install('already-selected-ambient-' + ambient, [0], { PATH: bin + ':/usr/bin:/bin' });
   assert.deepEqual(readProcessIdentity(pid), identity); await assert.rejects(access(join(root, 'ambient-used')), { code: 'ENOENT' });
  }
  receipts.stages.push('actual owned Node/npm identities preserve unset/empty/v12 CUDA and ignore ambient no/20/26 plus hostile injection');

  const interruptedCommit = await authority.publish(false, current.pin.commit);
  await install('native-build-failure', [4], { CXXFLAGS: '-finsrc-qualification-native-failure' });
  assert.match(await readFile(join(root, 'native-build-failure.log'), 'utf8'), /(?:unknown|unrecognized|unsupported).*finsrc-qualification-native-failure/);
  assert.deepEqual((await journal()).selected, selectedBefore); assert.equal((await journal()).active, null);
  assert.deepEqual(readProcessIdentity(pid), identity); await assertData('native-failure-retained');
  receipts.retainedIdentity = identity;
  receipts.stages.push('actual compiler failure leaves exact live prior incarnation, qualified selection and data intact');

  const workspace = join(root, 'interruption-stage'); await mkdir(workspace, { mode: 0o700 });
  const verifier = join(state, 'source-lifecycle/verifier.mjs');
  await recordedCommand(root, 'interruption-stage', node, [verifier, 'stage', workspace, state, origin, 'qualification', '--target=' + target, '--prior=' + current.pin.commit, '--profile=linux-source-running'], { cwd: root, env, timeout: 1_800_000 });
  const stagedFile = join(root, 'interruption-stage.log'), staged = JSON.parse(await readFile(stagedFile, 'utf8'));
  assert.equal(staged.candidate.pin.commit, interruptedCommit);
  const marker = join(root, 'paused-source-controller'), preload = join(root, 'pause-source-controller.mjs');
  await writeFile(preload, `import fs from 'node:fs';import{_setSourcePublicationFaultForTests as set}from ${JSON.stringify(pathToFileURL(join(staged.candidate.pin.root, 'out/shared/source-installation.js')).href)};set(point=>{if(point!=='after-rename')return;const state=JSON.parse(fs.readFileSync(${JSON.stringify(join(state, 'source-lifecycle/journal.json'))}));if(state.active?.phase==='predecessor-exited'){fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({id:state.active.id,phase:state.active.phase}),{mode:0o600,flush:true});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}});`);
  const output = await open(join(root, 'interruption-controller.log'), 'w', 0o600);
  const controller = spawn(node, ['--import', preload, join(staged.candidate.pin.root, 'out/bin/insrc-source-control.js'), 'upgrade', state, prior, stagedFile, verifier, current.pin.runtime], { cwd: root, env, stdio: ['ignore', output.fd, output.fd], signal: AbortSignal.timeout(1_800_000), killSignal: 'SIGKILL' });
  let controllerError; controller.on('error', error => { controllerError = error; });
  const closed = new Promise(resolve => controller.once('close', (...result) => resolve(result)));
  try {
   const deadline = Date.now() + 1_800_000;
   while (!await access(marker).then(() => true, () => false)) {
    if (controllerError || controller.exitCode !== null || controller.signalCode !== null) throw new Error('source controller exited before pause: ' + (controllerError?.message ?? (await readFile(join(root, 'interruption-controller.log'), 'utf8')).slice(-8192)));
    if (Date.now() > deadline) throw new Error('source controller did not reach the predecessor-exited checkpoint');
    await delay(100);
   }
   assert.equal((await journal()).active.phase, 'predecessor-exited');
   controller.kill('SIGKILL'); assert.deepEqual(await closed, [null, 'SIGKILL']);
   receipts.interruption = { controllerPid: controller.pid, signal: 'SIGKILL', candidateCommit: interruptedCommit, ...JSON.parse(await readFile(marker, 'utf8')) };
  } finally { if (controller.exitCode === null && controller.signalCode === null) controller.kill('SIGKILL'); await closed; await output.close(); }
  await ctl('explicit-source-recovery', 'recover');
  assert.equal((await journal()).active, null); assert.equal((await journal()).outcome.decision, 'rolled-back');
  assert.deepEqual((await journal()).selected, selectedBefore); await assertData('interrupted-recovered');
  receipts.recovery = (await journal()).outcome;
  receipts.stages.push('actual controller interruption after predecessor exit; existing public recovery restores qualified running prior and retained data');
  // Reuse the exact already-built immutable staging receipt. The public
  // controller rechecks its source authority and both pins before activation.
  await recordedCommand(root, 'interruption-retry', node, [join(staged.candidate.pin.root, 'out/bin/insrc-source-control.js'), 'upgrade', state, prior, stagedFile, verifier, current.pin.runtime], { cwd: root, env, timeout: 1_800_000 });
  current = (await journal()).selected;
  assert.equal(current.pin.commit, interruptedCommit); await assertData('interruption-retry');

  const beforeFailure = current, failed = await authority.publish(true, current.pin.commit);
  await install('readiness-failure', [4]);
  assert.equal((await journal()).active, null); assert.equal((await journal()).outcome.decision, 'rolled-back');
  assert.deepEqual((await journal()).selected, beforeFailure); await assertData('readiness-rollback');
  receipts.failedCandidate = failed; receipts.rollback = (await journal()).outcome;
  const retry = await authority.publish(false, beforeFailure.pin.commit);
  await install('readiness-retry'); current = (await journal()).selected;
  assert.equal(current.pin.commit, retry); await assertData('readiness-retry');
  await ctl('qualified-restart', 'restart'); await assertData('qualified-restart');
  receipts.retryCommit = retry;
  receipts.stages.push('actual signed startup failure rolls back; clean retry and selected restart preserve IPC data');
  return receipts;
 } finally {
  try { await ctl('faults-stop', 'stop'); }
  finally { await stub.close(); await writeFile(join(root, 'fault-receipts.json'), JSON.stringify(receipts, null, 2)); }
 }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const [mode, root, project, argument] = process.argv.slice(2);
 if (mode === 'prepare') process.stdout.write(JSON.stringify(await prepareLinuxAuthority(root, project, argument)) + '\n');
 else if (mode === 'run') process.stdout.write(JSON.stringify(await runHistoricalLinux(root, project, argument)) + '\n');
 else if (mode === 'faults') process.stdout.write(JSON.stringify(await runHistoricalLinuxFaults(root, project, argument)) + '\n');
 else throw new Error('usage: historical-linux-live.mjs prepare|run ROOT PROJECT EXTERNAL_NODE|INSTALLER');
}
