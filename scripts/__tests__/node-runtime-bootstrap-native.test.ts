import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const { NODE_RUNTIME_POLICY, renderNodeRuntimeShell } = await import(new URL('../node-runtime-policy.mjs', import.meta.url).href);
const target = `${process.platform}-${process.arch}`;
const archive = resolve(`.insrc/tmp/node-runtime-provenance/node-v22.22.1-${target}.tar.gz`);

// The official archive is an explicitly provisioned qualification fixture, never
// silently fetched by an ordinary offline test run. The build gate ran this case
// with the verified archive present; absent fixtures are not native qualification.
test('bootstraps the official archive in an empty HOME without PATH Node or npm', {
	skip: !existsSync(archive) ? 'requires the pinned official archive qualification fixture' : false,
}, () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-native-bootstrap-')));
	try {
		mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'src/assets'), { recursive: true });
		const home = join(root, 'home'); mkdirSync(home);
		const env = { HOME: home, PATH: '/usr/bin:/bin' };
		const absent = spawnSync('/bin/sh', ['-c', 'command -v node || command -v npm'], { env, encoding: 'utf8' });
		assert.notEqual(absent.status, 0, 'global Node/npm are not reachable');
		for (const name of ['provision-node-runtime.sh', 'node-runtime-archive.sh', 'node-runtime-policy.mjs', 'node-runtime-store.mjs']) {
			copyFileSync(new URL(`../${name}`, import.meta.url), join(root, 'scripts', name));
		}
		const policy = structuredClone(NODE_RUNTIME_POLICY);
		policy.targets[target].enabled = true; policy.targets[target].qualification = 'docs/plans/node-runtime-evidence/bootstrap-smoke.md';
		writeFileSync(join(root, 'src/assets/node-runtime-policy.json'), JSON.stringify(policy));
		writeFileSync(join(root, 'scripts/node-runtime-policy.sh'), renderNodeRuntimeShell(policy));
		const script = join(root, 'scripts/provision-node-runtime.sh'), state = join(home, '.insrc');
		const first = spawnSync('/bin/bash', [script, state, archive], { env, encoding: 'utf8', timeout: 120000 });
		assert.equal(first.status, 0, first.stderr);
		const distribution = first.stdout.trim(); assert.ok(distribution.startsWith(`${state}/runtimes/`));
		const actual = spawnSync(join(distribution, 'bin/node'), ['-p', 'JSON.stringify({version:process.versions.node,target:process.platform+"-"+process.arch,path:process.execPath})'], { env, encoding: 'utf8', timeout: 10000 });
		assert.equal(actual.status, 0); const identity = JSON.parse(actual.stdout);
		assert.equal(identity.version, '22.22.1'); assert.equal(identity.target, target); assert.equal(identity.path, join(distribution, 'bin/node'));
		const npm = spawnSync(join(distribution, 'bin/node'), [join(distribution, 'lib/node_modules/npm/bin/npm-cli.js'), '--version'], { env, encoding: 'utf8', timeout: 10000 });
		assert.equal(npm.status, 0); assert.match(npm.stdout, /^10\.9\.4\s*$/);
		const reuse = spawnSync('/bin/bash', [script, state], { env, encoding: 'utf8', timeout: 120000 });
		assert.equal(reuse.status, 0, reuse.stderr); assert.equal(reuse.stdout, first.stdout);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
