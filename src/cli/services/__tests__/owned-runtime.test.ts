import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { cleanNodeEnvironment, ownedNodeEnvironment, resolveOwnedToolchain, toolchainInstallMarker } from '../owned-runtime.js';
import { nativeBuildEnv } from '../maintenance.js';

test('owned runtime adapter consumes shell authority and rejects invalid metadata without global fallback', async () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-runtime-adapter-')); mkdirSync(join(root, 'scripts'));
	const file = join(root, 'scripts/node-runtime-env.sh');
	try {
		writeFileSync(file, 'insrc_source_toolchain() { NODE_BIN=/owned/bin/node; NPM_CLI=/owned/lib/npm-cli.js; TOOLCHAIN_ID=22.22.1:darwin-arm64:archive; }\n');
		assert.deepEqual(await resolveOwnedToolchain(root), { node: '/owned/bin/node', npm: '/owned/lib/npm-cli.js', identity: '22.22.1:darwin-arm64:archive' });
		writeFileSync(file, 'insrc_source_toolchain() { NODE_BIN=node; NPM_CLI=npm; TOOLCHAIN_ID=invalid; }\n');
		await assert.rejects(resolveOwnedToolchain(root), /invalid toolchain/);
		writeFileSync(file, 'insrc_source_toolchain() { echo "cached runtime is corrupt; reinstall" >&2; return 2; }\n');
		await assert.rejects(resolveOwnedToolchain(root), /cached runtime is corrupt; reinstall/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('owned runtime and native build environments preserve caller flags while removing Node injection', () => {
	const runtime = { node: '/owned/bin/node', npm: '/owned/lib/npm-cli.js', identity: '22.22.1:darwin-arm64:archive' };
	const parent = { PATH: '/hostile:/usr/bin', NODE_OPTIONS: '--injected', NODE_PATH: '/external', CXXFLAGS: '-O2', USER_FLAG: 'kept', PYTHONDONTWRITEBYTECODE: '', npm_config_target: '26.0.0' };
	const env = nativeBuildEnv(ownedNodeEnvironment(runtime, parent));
	assert.equal(env['PATH'], '/owned/bin:/hostile:/usr/bin'); assert.equal(env['NODE_OPTIONS'], undefined); assert.equal(env['NODE_PATH'], undefined);
	assert.equal(env['PYTHONDONTWRITEBYTECODE'], '1'); assert.equal(parent.PYTHONDONTWRITEBYTECODE, '');
	assert.equal(env['CXXFLAGS'], '-O2 -std=c++17'); assert.equal(env['USER_FLAG'], 'kept'); assert.equal(env['npm_config_target'], '22.22.1');
	assert.equal(parent.NODE_OPTIONS, '--injected'); assert.equal(parent.CXXFLAGS, '-O2');
	assert.equal(cleanNodeEnvironment(parent)['NODE_OPTIONS'], undefined);
	assert.equal(toolchainInstallMarker('lock', runtime), 'v2:lock:22.22.1:darwin-arm64:archive');
});


test('owned builds default optional ONNX CUDA installation to skip only when absent', () => {
 const runtime = { node: '/owned/bin/node', npm: '/owned/lib/npm-cli.js', identity: '22.22.1:linux-x64:archive' };
 for (const value of [undefined, '', 'skip', 'v11', 'v12', 'true']) {
  const parent: NodeJS.ProcessEnv = value === undefined ? {} : { ONNXRUNTIME_NODE_INSTALL_CUDA: value };
  assert.equal(ownedNodeEnvironment(runtime,parent)['ONNXRUNTIME_NODE_INSTALL_CUDA'],value ?? 'skip');
  assert.equal(parent['ONNXRUNTIME_NODE_INSTALL_CUDA'],value);
 }
});
