import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const { NODE_RUNTIME_POLICY: policy, readNodeRuntimePolicy, sourceRuntimeFor } =
	await import(new URL('../node-runtime-policy.mjs', import.meta.url).href);
const { syncNodeRuntimeAssets } = await import(new URL('../sync-node-runtime-policy.mjs', import.meta.url).href);

test('pins candidate Node distributions to the authenticated checksum inventory', () => {
	const sums = readFileSync(new URL('../../docs/plans/node-runtime-evidence/SHASUMS256.txt', import.meta.url));
	assert.equal(createHash('sha256').update(sums).digest('hex'), policy.checksums.sha256);
	const entries = new Map(sums.toString().trim().split('\n').map(line => line.trim().split(/\s+/)));
	for (const [target, entry] of Object.entries(policy.targets) as Array<[string, any]>) {
		assert.equal(entries.get(entry.sha256), `node-v${policy.nodeVersion}-${target}.tar.gz`);
		if (entry.enabled) {
			assert.equal(target, 'darwin-arm64');
			assert.match(readFileSync(new URL('../../' + entry.qualification, import.meta.url), 'utf8'), /npm ci[\s\S]*tree-sitter[\s\S]*confirmedClosed/);
		} else assert.equal(entry.qualification, null);
	}
	const proof = readFileSync(new URL('../../docs/plans/node-runtime-evidence/verification.txt', import.meta.url), 'utf8');
	assert.match(proof, new RegExp(`\\[GNUPG:\\] VALIDSIG ${policy.checksums.signerFingerprint} `));
});

test('rejects malformed version target URL digest layout and qualification policy', () => {
	const invalid = [
		(p: any) => { p.schemaVersion = 2; },
		(p: any) => { p.nodeVersion = '26.0.0'; },
		(p: any) => { p.targets['win-x64'] = p.targets['darwin-arm64']; },
		(p: any) => { p.targets['linux-x64'].url = 'https://example.com/node.tar.gz'; },
		(p: any) => { p.targets['linux-x64'].sha256 = '0'; },
		(p: any) => { p.layout.npm = '../global/npm'; },
		(p: any) => { p.targets['darwin-arm64'].enabled = true; p.targets['darwin-arm64'].qualification = null; },
		(p: any) => { p.checksums.signerFingerprint = 'unknown'; },
	];
	for (const mutate of invalid) {
		const copy = structuredClone(policy); mutate(copy);
		assert.throws(() => readNodeRuntimePolicy(copy), /invalid Node runtime policy/);
	}
});

test('rejects unsupported and unqualified public targets without an environment bypass', () => {
	assert.throws(() => sourceRuntimeFor('win32', 'x64'), /unsupported/);
	assert.throws(() => sourceRuntimeFor('linux', 'x64'), /not qualified/);
	const script = new URL('../node-runtime-policy.sh', import.meta.url).pathname;
	for (const [target, status, diagnostic] of [['linux-x64', 3, 'not qualified'], ['win32-x64', 2, 'unsupported']] as const) {
		const child = spawnSync('/bin/sh', ['-c', '. "$1"; insrc_node_runtime_policy "$2"', 'policy-test', script, target], {
			env: { PATH: '/usr/bin:/bin', INSRC_NODE_BIN: '/external/node', INSRC_RUNTIME_QUALIFY: '1' }, encoding: 'utf8', timeout: 5000,
		});
		assert.equal(child.status, status); assert.match(child.stderr, new RegExp(diagnostic));
	}
});

test('keeps generated client assets signed release pins and native headers aligned', () => {
	assert.doesNotThrow(() => syncNodeRuntimeAssets(true));
	assert.equal(policy.layout.node, 'bin/node');
	assert.equal(policy.layout.npm, 'lib/node_modules/npm/bin/npm-cli.js');
	assert.ok(Object.isFrozen(policy.targets['darwin-arm64']));
});
