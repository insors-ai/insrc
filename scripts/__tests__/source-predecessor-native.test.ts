/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { captureManagedReleasePin, verifyStagedReleasePin } from '../../src/daemon/managed-release-staging.js';
import { inspectSourcePredecessor, prepareSourcePredecessor } from '../../src/daemon/source-predecessor.js';
import { ownedNodeEnvironment } from '../../src/shared/owned-node-runtime.js';
import { nativeOptions, ownedSourceFixture } from './helpers/owned-source-fixture.js';

const git = (cwd: string, ...args: string[]) => execFileSync('/usr/bin/git', ['-C', cwd, '-c', 'user.name=Recovery test',
 '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim();
const declaration = { version: 1, graphSchema: 10, startup: 'rollback-compatible',
 formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' } };

async function fixture() {
 const f = ownedSourceFixture('26');
 try {
  const origin = join(f.root, 'origin'), prior = join(f.root, 'incumbent');
  await mkdir(origin); git(origin, 'init', '-qb', 'main');
  // Deliberately historical: no provisioner, runtime-store helper, smoke or supervisor.
  await writeFile(join(origin, '.gitignore'), 'out/\nnode_modules/\npackages/project-memory/\n');
  await writeFile(join(origin, 'package.json'), JSON.stringify({ name: 'historical-recovery-fixture', version: '1.0.0',
   type: 'module', scripts: { build: 'node build.mjs' } }));
  await writeFile(join(origin, '.npmrc'), 'offline=true\naudit=false\nfund=false\n');
  await writeFile(join(origin, 'build.mjs'), `import fs from 'node:fs';
for(const dir of ['out/daemon','node_modules','packages/project-memory'])fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync('out/daemon/index.js','process.exit(0);');
fs.writeFileSync('node_modules/built-with',process.versions.node);
`);
  const runtime = join(f.distribution, 'bin/node'), npm = join(f.distribution, 'lib/node_modules/npm/bin/npm-cli.js');
  const env = ownedNodeEnvironment({ node: runtime, npm, identity: '22.22.1:fixture' }, f.env);
  execFileSync(runtime, [npm, 'install', '--package-lock-only', '--ignore-scripts'], { cwd: origin, env, stdio: 'pipe' });
  git(origin, 'add', '.'); git(origin, 'commit', '-qm', 'historical release');
  const priorCommit = git(origin, 'rev-parse', 'HEAD'), tree = git(origin, 'rev-parse', 'HEAD^{tree}');
  git(f.root, 'clone', '-q', '--', origin, prior);
  for (const args of [['ci'], ['run', 'build']]) execFileSync(runtime, [npm, ...args], { cwd: prior, env, stdio: 'pipe' });
  await writeFile(join(prior, 'node_modules/.insrc-install-ok'), git(prior, 'hash-object', 'package-lock.json'), { mode: 0o600 });
  const knownBuild = await captureManagedReleasePin(prior, runtime);
  const key = join(f.root, 'key'), verifier = join(f.root, 'verifier.mjs'), installer = join(f.root, 'installer.sh');
  execFileSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
  execFileSync(process.execPath, ['scripts/bundle-release-bootstrap.mjs', key + '.pub', installer]);
  const encoded = (await readFile(installer, 'utf8')).match(/^INSRC_RELEASE_BOOTSTRAP_B64='([^']+)'$/m)?.[1];
  assert.ok(encoded); await writeFile(verifier, Buffer.from(encoded, 'base64'), { mode: 0o600 });
  await mkdir(join(origin, 'release'));
  let sequence = 0;
  const publish = async (recovery?: { tree: string }, graphSchema = 10) => {
   await writeFile(join(origin, 'release/macos-compatibility.json'), JSON.stringify({ version: 1, candidate: { ...declaration, graphSchema },
    predecessors: { [priorCommit]: { declaration, crashConsistentReopening: true, launchProfiles: ['legacy-stopped'],
     ...(recovery ? { recovery } : {}) } } }));
   git(origin, 'add', '.'); git(origin, 'commit', '--allow-empty', '-qm', 'qualification');
   git(origin, '-c', 'gpg.format=ssh', '-c', `user.signingkey=${key}`, 'tag', '-fs', 'insrc-release/main',
    '-m', JSON.stringify({ version: 1, repoUrl: origin, branch: 'main', sequence: ++sequence }));
  };
  await publish();
  const input = { stateRoot: join(f.home, '.insrc'), runtime, verifier, source: { repoUrl: origin, branch: 'main' },
   priorCommit, target: 'darwin' as const, launchProfile: 'legacy-stopped' };
  return { ...f, origin, prior, runtime, knownBuild, input, tree, publish };
 } catch (error) { f.clean(); throw error; }
}

// These are miniature, real npm/build fixtures. Native production upgrade qualification
// and transaction cutover remain the later platform tasks, not claims of these tests.
test('Source-ahead stale output and partial npm preserve incumbent and require qualified recovery', nativeOptions, async t => {
 const f = await fixture(); t.after(() => f.clean());
 const incumbent = { root: f.prior, runtime: f.runtime, knownBuild: f.knownBuild };
 const options = { bootstrapRoot: f.seed };
 assert.equal((await prepareSourcePredecessor(f.input, incumbent, options)).decision, 'existing-qualified');
 // Clean source alone and editable build declarations are not build provenance.
 await writeFile(join(f.prior, 'out/release-compatibility.json'), JSON.stringify({ ...declaration, releaseId: f.input.priorCommit }));
 const unknown = await prepareSourcePredecessor(f.input, { root: f.prior, runtime: f.runtime }, options);
 assert.equal(unknown.decision, 'recovery-required');
 assert.ok(unknown.guidance.stageRollback.argv.includes('--rebuild-predecessor'));
 await rm(join(f.prior, 'out/release-compatibility.json'));
 git(f.prior, 'commit', '--allow-empty', '-qm', 'source advanced without build');
 const observation = await inspectSourcePredecessor(incumbent);
 assert.equal(observation.builtCommit, f.input.priorCommit);
 assert.notEqual(observation.sourceHead, observation.builtCommit);
 assert.ok(observation.issues.includes('source-head-ahead-of-known-built-release'));
 const before = await readFile(join(f.prior, 'out/daemon/index.js'));
 assert.equal((await prepareSourcePredecessor(f.input, incumbent, options)).decision, 'recovery-required');
 assert.deepEqual(await readFile(join(f.prior, 'out/daemon/index.js')), before);
 await rm(join(f.prior, 'node_modules/built-with'));
 assert.ok((await inspectSourcePredecessor(incumbent)).issues.includes('known-build-bytes-mismatch'));
 await rm(join(f.prior, 'out/daemon/index.js'));
 assert.ok((await inspectSourcePredecessor(incumbent)).issues.includes('compiled-output-or-dependencies-incomplete'));
 const blocked = await prepareSourcePredecessor(f.input, incumbent, { ...options, rebuildPredecessor: true });
 assert.equal(blocked.decision, 'recovery-required');
 assert.match(blocked.reason!, /does not authorize/);
 assert.match(blocked.guidance.sideBySide.prerequisite, /separate empty/);
 const noCheckout = await prepareSourcePredecessor(f.input, { root: join(f.root, 'absent'), runtime: f.runtime }, options);
 assert.equal(noCheckout.decision, 'recovery-required');
 assert.match(noCheckout.reason!, /retain all incumbent files and data/);
 const inspect = spawnSync(f.runtime, [resolve('out/bin/insrc-source-recovery.js'), 'inspect', f.input.stateRoot,
  join(f.root, 'absent'), f.runtime], { encoding: 'utf8' });
 assert.equal(inspect.status, 4, inspect.stderr);
 assert.equal(JSON.parse(inspect.stdout).activationPermitted, false);
 assert.equal(JSON.parse(inspect.stdout).decision, 'recovery-required');
 const request = join(f.root, 'unsafe-request.json');
 await writeFile(request, '{}', { mode: 0o644 });
 const prepare = spawnSync(f.runtime, [resolve('out/bin/insrc-source-recovery.js'), 'prepare', request], { encoding: 'utf8' });
 assert.equal(prepare.status, 4);
 assert.match(prepare.stderr, /private and owned/);
});

test('Dirty lock/source preserved; independently staged rollback baseline admitted only by actual compatibility', nativeOptions, async t => {
 const f = await fixture(); t.after(() => f.clean());
 const incumbent = { root: f.prior, runtime: f.runtime, knownBuild: f.knownBuild };
 const options = { bootstrapRoot: f.seed, rebuildPredecessor: true };
 const dirtySource = Buffer.from('// developer edit: preserve exactly\n'), dirtyLock = Buffer.from('{"partly":"installed"}\n');
 await writeFile(join(f.prior, 'build.mjs'), dirtySource);
 await writeFile(join(f.prior, 'package-lock.json'), dirtyLock);
 const head = git(f.prior, 'rev-parse', 'HEAD'), index = await readFile(join(f.prior, '.git/index'));
 assert.ok((await inspectSourcePredecessor(incumbent)).issues.includes('install-marker-mismatch'));
 await publishAndCheck({ tree: f.tree }, 11, /compatib/);
 // A signed but wrong recovery tree may not execute npm against any prior source.
 await f.publish({ tree: 'a'.repeat(40) });
 const wrongTree = await prepareSourcePredecessor(f.input, incumbent, options);
 assert.equal(wrongTree.decision, 'recovery-required');
 assert.match(wrongTree.reason!, /tree|recovery/);
 await f.publish({ tree: f.tree });
 // External smoke explicitly checks only the tiny fixture, never represents native qualification.
 await mkdir(join(f.seed, 'out/bin'), { recursive: true });
 await writeFile(join(f.seed, 'out/bin/insrc-runtime-smoke.js'),
  `import fs from 'node:fs';if(!process.argv[2]||!fs.existsSync(process.argv[2]+'/out/daemon/index.js'))process.exit(9);`);
 const inherited = { ...process.env };
 try {
  Object.assign(process.env, f.env); delete process.env.NODE_OPTIONS; delete process.env.NODE_PATH;
  const result = await prepareSourcePredecessor(f.input, incumbent, options);
  assert.equal(result.decision, 'rebuild-staged');
  if (result.decision !== 'rebuild-staged') assert.fail(result.reason);
  assert.equal(result.baseline.commit, f.input.priorCommit);
  assert.notEqual(result.baseline.root, f.prior);
  assert.equal(result.baseline.runtime, f.runtime);
  assert.equal(result.compatibility.prior.releaseId, f.input.priorCommit);
  assert.notEqual(result.compatibility.candidate.releaseId, f.input.priorCommit);
  assert.equal(await readFile(join(result.baseline.root, 'node_modules/built-with'), 'utf8'), '22.22.1');
  await verifyStagedReleasePin(result.baseline);
  assert.ok(result.activationPrerequisites.some(s => s.includes('platform transaction owner')));
  await assert.rejects(readFile(join(f.input.stateRoot, 'managed-lifecycle/current.json')), { code: 'ENOENT' });
  await assert.rejects(readFile(join(f.input.stateRoot, 'source-lifecycle/journal.json')), { code: 'ENOENT' });
  await assert.rejects(readFile(f.fakeTrace), { code: 'ENOENT' });
 } finally {
  for (const key of Object.keys(process.env)) if (!(key in inherited)) delete process.env[key];
  Object.assign(process.env, inherited);
 }
 assert.deepEqual(await readFile(join(f.prior, 'build.mjs')), dirtySource);
 assert.deepEqual(await readFile(join(f.prior, 'package-lock.json')), dirtyLock);
 assert.deepEqual(await readFile(join(f.prior, '.git/index')), index);
 assert.equal(git(f.prior, 'rev-parse', 'HEAD'), head);
 async function publishAndCheck(recovery: { tree: string }, graphSchema: number, reason: RegExp) {
  await f.publish(recovery, graphSchema);
  const result = await prepareSourcePredecessor(f.input, incumbent, options);
  assert.equal(result.decision, 'recovery-required');
  assert.match(result.reason!, reason);
 }
});
