/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test, { after, before } from 'node:test';

const enabled = process.env['INSRC_LIVE_TESTS'] === '1' && process.platform === 'darwin' && process.arch === 'arm64';
const options = { skip: enabled ? false : 'requires explicit real darwin-arm64 qualification (INSRC_LIVE_TESTS=1)', timeout: 3_600_000 };
const { recordedCommand, historicalCommit, nativeOnnxProbe } = await import(new URL('./helpers/historical-daemon-qualification.mjs', import.meta.url).href);
const { runPreparedHistoricalMac, runHistoricalMacFaults, verifyHistoricalMacMcp, closeHistoricalMacSupervisor } = await import(new URL('./helpers/historical-mac-live.mjs', import.meta.url).href);
let root: string;
let distribution: string;

before(async () => {
 if (!enabled) return;
 assert.match(process.versions.node, /^22\./);
 root = await realpath(await mkdtemp('/private/tmp/insrc-historical-mac-'));
 const home = join(root, 'home'), prior = join(root, 'prior');
 await mkdir(join(home, '.insrc'), { recursive: true });
 const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: root, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', NODE_OPTIONS: '', NODE_PATH: '', ONNXRUNTIME_NODE_INSTALL_CUDA: 'skip', PYTHONDONTWRITEBYTECODE: '1', npm_config_target: '22.22.1', npm_config_runtime: 'node', CXXFLAGS: '-std=c++17' };
 for (const key of Object.keys(env)) if (key.startsWith('NODE_TEST') || key.startsWith('INSRC_TEST')) delete env[key];
 await recordedCommand(root, 'prior-clone', '/usr/bin/git', ['clone', '--no-hardlinks', '--no-checkout', '--quiet', resolve('.'), prior], { env });
 await recordedCommand(root, 'prior-checkout', '/usr/bin/git', ['-C', prior, 'checkout', '--quiet', historicalCommit], { env });
 await recordedCommand(root, 'provision-runtime', '/bin/bash', [resolve('scripts/provision-node-runtime.sh'), join(home, '.insrc')], { env, timeout: 180_000 });
 distribution = (await readFile(join(root, 'provision-runtime.log'), 'utf8')).trim();
 await writeFile(join(root, 'distribution'), distribution);
 // The historical process uses the external development Node. Candidate builds
 // and activation must independently select the official owned 22.22.1 runtime.
 await writeFile(join(root, 'prior-runtime'), await realpath(process.execPath));
 const node = join(distribution, 'bin/node'), npm = join(distribution, 'lib/node_modules/npm/bin/npm-cli.js');
 const buildEnv = { ...env, PATH: distribution + '/bin:/usr/bin:/bin:/usr/sbin:/sbin' };
 await recordedCommand(root, 'owned-npm-version', node, [npm, '--version'], { cwd: prior, env: buildEnv });
 await recordedCommand(root, 'prior-npm-ci', node, [npm, 'ci', '--no-audit', '--no-fund'], { cwd: prior, env: buildEnv });
 await recordedCommand(root, 'prior-build', node, [npm, 'run', 'build'], { cwd: prior, env: buildEnv });
 await recordedCommand(root, 'prior-native-modules', node, [resolve('out/bin/insrc-runtime-smoke.js'), prior], { cwd: prior, env: buildEnv });
 await recordedCommand(root, 'prior-cpu-onnx', node, ['--input-type=module', '-e', nativeOnnxProbe], { cwd: prior, env: buildEnv });
}, { timeout: 900_000 });

after(async () => { if (root) await closeHistoricalMacSupervisor(root); });

test('darwin-arm64 actual historical upgrade, subsequent update and qualified rollback/retry', options, async t => {
 t.diagnostic('Retained real qualification receipts: ' + root);
 try {
  const upgrades = await runPreparedHistoricalMac(root);
  assert.equal(upgrades.stages.length, 3);
  assert.notEqual(upgrades.priorNode, upgrades.node);
  const faults = await runHistoricalMacFaults(root);
  assert.equal(faults.stages.length, 3);
  await verifyHistoricalMacMcp(root);
 } finally { await closeHistoricalMacSupervisor(root); }
});

test('Mac native dependency loads and owned Node/npm environment identities', options, async () => {
 const native = JSON.parse((await readFile(join(root, 'prior-native-modules.log'), 'utf8')).trim());
 assert.equal(native.node, '22.22.1');
 assert.equal(native.executable, join(distribution, 'bin/node'));
 assert.deepEqual(native.loaded, ['tree-sitter', 'lmdb', 'fs-ext', '@lancedb/lancedb', '@duckdb/node-api']);
 assert.equal((await readFile(join(root, 'owned-npm-version.log'), 'utf8')).trim(), '10.9.4');
 for (const name of ['prior-cpu-onnx', 'candidate-cpu-onnx']) {
  const result = JSON.parse((await readFile(join(root, name + '.log'), 'utf8')).trim());
  assert.equal(result.node, '22.22.1'); assert.equal(result.executable, join(distribution, 'bin/node'));
  assert.equal(result.onnx, 'cpu Identity(float32[1]) => 42');
 }
});
