import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { buildStages } from '../../../scripts/test-harness/build.mjs';
import { resolveInstallationLocation } from '../location.ts';
import { runtimePolicy, runtimeArchive } from '../runtime-policy.ts';
import { checkDevPrerequisites, devBuildEnvironment, installDevDependencies, loadDevBuildHelpers, ownedDevBuildEnvironment, verifyDevToolchain } from '../dev-toolchain.ts';
const [root, runtime, scenario] = process.argv.slice(2);
const target = { os: process.platform, arch: process.arch, baseline: 'local-fixture' };
const location = resolveInstallationLocation('fixture', { home: join(root, '..', 'h') });
const identity = { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' };
const selected = await verifyDevToolchain(location, identity), original = { ...process.env };
assert.equal(existsSync(join(dirname(selected.node), process.platform === 'win32' ? 'npm.cmd' : 'npm')), false);
const run = createRun(root, { mode: 'build' });
await withRun(run, async scope => {
  const poison = join(root, 'poison'); mkdirSync(poison);
  for (const name of ['node', 'npm', 'npx']) writeFileSync(join(poison, name), '#!/bin/sh\necho HOST_TOOL_USED >&2\nexit 91\n', { mode: 0o700 });
  const inherited = { ...process.env, PATH: `${poison}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    NODE_OPTIONS: '--require=/must-not-load', NODE_PATH: '/must-not-load', npm_config_node_options: '--require=/must-not-load',
    NPM_CONFIG_TARGET: '99.0.0', npm_config_nodedir: '/must-not-use', INSRC_TEST_RUN_ID: 'foreign', INSRC_TEST_ROOT: '/foreign', NODE_TEST_CONTEXT: 'child-v8',
    INSRC_NODE_HEADERS: '/must-not-use', INSRC_NODE_LIB: '/must-not-use', INSRC_NATIVE_CC: '/must-not-use',
    npm_config_registry: 'https://registry.npmjs.org/', NPM_TOKEN: 'fixture-delegated', GIT_SSH_COMMAND: 'fixture-ssh-command' };
  if (scenario === 'cuda-empty') inherited.ONNXRUNTIME_NODE_INSTALL_CUDA = '';
  else if (scenario === 'cuda-custom') inherited.ONNXRUNTIME_NODE_INSTALL_CUDA = 'custom';
  else delete inherited.ONNXRUNTIME_NODE_INSTALL_CUDA;
  const clean = devBuildEnvironment(selected, inherited);
  assert.equal(clean.INSRC_TEST_RUN_ID, undefined); assert.equal(clean.INSRC_TEST_ROOT, undefined); assert.equal(clean.NODE_TEST_CONTEXT, undefined);
  assert.equal(clean.NODE_OPTIONS, undefined); assert.equal(clean.NODE_PATH, undefined); assert.equal(clean.NPM_CONFIG_TARGET, undefined);
  assert.equal(clean.npm_config_target, runtimePolicy.nodeVersion); assert.equal(clean.npm_config_nodedir, selected.headers);
  assert.equal(clean.INSRC_NODE_HEADERS, join(selected.headers, 'include/node')); assert.equal(clean.INSRC_NODE_LIB, selected.nodeLib);
  assert.equal(clean.INSRC_NATIVE_CC, undefined);
  assert.equal(clean.NPM_TOKEN, inherited.NPM_TOKEN); assert.equal(clean.GIT_SSH_COMMAND, inherited.GIT_SSH_COMMAND);
  const env = ownedDevBuildEnvironment(run, selected, inherited), owned = { ...run, environment: () => env };
  assert.equal(env.INSRC_TEST_RUN_ID, run.runId); assert.equal(env.INSRC_TEST_ROOT, run.root);
  assert.equal(env.ONNXRUNTIME_NODE_INSTALL_CUDA, scenario === 'cuda-empty' ? '' : scenario === 'cuda-custom' ? 'custom' : 'skip');
  const stages = buildStages(owned, { npmCli: selected.npmCli });
  assert.ok(stages.some(args => args[0] === selected.npmCli && args[1] === 'run' && args[2] === 'typecheck:tools'));
  assert.ok(stages.some(args => args[0] === 'scripts/build-installer-control.mjs'));
  assert.throws(() => buildStages(owned, { npmCli: 'npm' }));
  assert.throws(() => buildStages(owned, { npmCli: join(runtime, 'missing-cli.js') }));
  if (scenario === 'prerequisite') {
    const commands = process.platform === 'win32' ? ['git', 'cl.exe', 'powershell.exe'] : ['git', 'cc', 'tar'];
    for (let index = 0; index < commands.length; index++) {
      const starts = [];
      await assert.rejects(checkDevPrerequisites(run, { start: async (...args) => { starts.push(args); return { code: starts.length - 1 === index ? null : 0, launchError: starts.length - 1 === index ? 'missing' : undefined, log: '' }; } }, selected, env), { code: 'source-prerequisite-missing' });
      assert.deepEqual(starts.map(args => args[0]), commands.slice(0, index + 1));
    }
    assert.throws(() => devBuildEnvironment({ ...selected }, inherited), { code: 'runtime-invalid' });
    await assert.rejects(verifyDevToolchain(location, { ...identity, target: { ...target, arch: target.arch === 'arm64' ? 'x64' : 'arm64' } }), { code: 'runtime-invalid' });
    return;
  }
  await checkDevPrerequisites(run, scope, selected, env);
  // No registry access: this package has a valid dependency-free lockfile.
  await installDevDependencies(run, scope, selected, env);
  assert.equal(readFileSync(join(root, 'install-owned'), 'utf8'), 'yes');
  const npm = await scope.start(selected.node, [selected.npmCli, '--version'], { env });
  assert.equal(npm.code, 0, readFileSync(npm.log, 'utf8'));
  assert.equal(readFileSync(npm.log, 'utf8').trim(), runtimePolicy.npmVersion);
  const child = await scope.start(selected.node, [selected.npmCli, 'run', 'probe'], { env });
  assert.equal(child.code, 0, readFileSync(child.log, 'utf8'));
  const observed = JSON.parse(readFileSync(join(root, 'observed.json'), 'utf8'));
  assert.equal(observed.node, selected.node); assert.equal(observed.version, `v${runtimePolicy.nodeVersion}`);
  assert.equal(observed.cuda, env.ONNXRUNTIME_NODE_INSTALL_CUDA); assert.equal(observed.npm, runtimePolicy.npmVersion);
  assert.equal(observed.nodeOptions, null); assert.equal(observed.nodePath, null);
  const helpers = await loadDevBuildHelpers(run);
  // The accepted checkout helper deliberately writes a marker so root resolution
  // cannot silently use the invoking installer's helper module.
  assert.deepEqual(helpers.buildStages(run, { npmCli: selected.npmCli }), [['accepted-checkout-helper', selected.npmCli]]);
  const prepared = await helpers.prepareBuild(owned, scope, { npmCli: selected.npmCli,
    stages: [[selected.npmCli, 'run', 'probe'], ['scripts/build-installer-control.mjs']],
    requiredArtifacts: ['out/installer/native/control.node'] });
  assert.equal(prepared.runtimeExecutable, selected.node); assert.equal(prepared.runId, run.runId);
  const native = await scope.start(selected.node, ['-e', "const c=require('./out/installer/native/control.node');const h=c.acquire('native-probe.lock');if(!c.held(h))throw Error('native lock');c.close(h);"], { env });
  assert.equal(native.code, 0, readFileSync(native.log, 'utf8'));
  const stageObserved = JSON.parse(readFileSync(join(root, 'observed.json'), 'utf8'));
  assert.equal(stageObserved.node, selected.node); assert.equal(stageObserved.npm, runtimePolicy.npmVersion);
  assert.equal(stageObserved.cuda, env.ONNXRUNTIME_NODE_INSTALL_CUDA);
});
assert.ok(isDeepStrictEqual({ ...process.env }, original), 'Parent environment must remain unchanged');
