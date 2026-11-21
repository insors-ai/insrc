import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const { NODE_RUNTIME_POLICY, renderNodeRuntimeShell } = await import(new URL('../../node-runtime-policy.mjs', import.meta.url).href);
const target = `${process.platform}-${process.arch}`;
export const archive = resolve(`.insrc/tmp/node-runtime-provenance/node-v22.22.1-${target}.tar.gz`);
export const nativeOptions = { skip: !existsSync(archive) ? 'requires the pinned official archive fixture' : false, timeout: 180000 };

export function ownedSourceFixture(ambient: 'absent' | '20' | '26' = '26') {
	const root = realpathSync(mkdtempSync(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'insrc-native-shell-'))), seed = join(root, 'seed'), home = join(root, 'home');
	const scripts = join(seed, 'scripts'); mkdirSync(scripts, { recursive: true }); mkdirSync(home);
	mkdirSync(join(seed, 'src/assets/models'), { recursive: true });
	for (const file of ['provision-node-runtime.sh', 'node-runtime-archive.sh', 'node-runtime-env.sh', 'node-runtime-policy.mjs', 'node-runtime-store.mjs', 'daemon-ctl.sh', 'insrc-daemon-install.sh', 'insrc', 'insrc-mcp']) {
		copyFileSync(new URL(`../../${file}`, import.meta.url), join(scripts, file));
	}
	const policy = structuredClone(NODE_RUNTIME_POLICY);
	policy.targets[target].enabled = true; policy.targets[target].qualification = 'docs/plans/node-runtime-evidence/bootstrap-smoke.md';
	writeFileSync(join(seed, 'src/assets/node-runtime-policy.json'), JSON.stringify(policy));
	writeFileSync(join(scripts, 'node-runtime-policy.sh'), renderNodeRuntimeShell(policy));
	copyFileSync(resolve('src/assets/models/cloud-model-catalog.json'), join(seed, 'src/assets/models/cloud-model-catalog.json'));
	const trace = join(root, 'identity.jsonl'), fakeTrace = join(root, 'ambient-used'), bin = join(root, 'ambient'); mkdirSync(bin);
	for (const command of ['node', 'npm']) {
		if (ambient === 'absent') continue;
		writeFileSync(join(bin, command), `#!/bin/sh\nprintf '%s\\n' '${command}' >> '${fakeTrace}'\nprintf 'v${ambient}.0.0\\n'\nexit 99\n`); chmodSync(join(bin, command), 0o700);
	}
	const env = { ...process.env, HOME: home, TMPDIR: root, PATH: `${bin}:/usr/bin:/bin`, INSRC_TEST_IDENTITY: trace,
		INSRC_CTL_LOG_DIR: join(root, 'logs'), NODE_OPTIONS: '--invalid-injection', NODE_PATH: '/external/injection' };
	const bootstrap = spawnSync('/bin/bash', [join(scripts, 'provision-node-runtime.sh'), join(home, '.insrc'), archive], {
		env, encoding: 'utf8', timeout: 120000,
	});
	assert.equal(bootstrap.status, 0, bootstrap.stderr); const distribution = bootstrap.stdout.trim();
	const observer = `import fs from 'node:fs';
const phase=process.argv[2];
fs.appendFileSync(process.env.INSRC_TEST_IDENTITY, JSON.stringify({phase,version:process.versions.node,exe:process.execPath,options:process.env.NODE_OPTIONS??null,nodePath:process.env.NODE_PATH??null})+'\\n');
if(phase==='build'){
 if(process.env.INSRC_TEST_BUILD_FAIL)process.exit(7);
 fs.mkdirSync('out/bin',{recursive:true});
 fs.writeFileSync('out/bin/insrc-runtime-smoke.js', 'process.exit(0);');
 fs.writeFileSync('out/bin/insrc-daemon-control.js', ${JSON.stringify("import fs from 'node:fs';fs.appendFileSync(process.env.INSRC_TEST_IDENTITY,JSON.stringify({phase:process.argv[2],version:process.versions.node,exe:process.execPath})+'\\n');")});
}
`;
	writeFileSync(join(seed, 'observer.mjs'), observer);
	writeFileSync(join(seed, 'package.json'), JSON.stringify({ name: 'owned-node-fixture', version: '1.0.0', type: 'module', scripts: {
		preinstall: 'node observer.mjs preinstall', build: 'node observer.mjs build',
	} }));
	writeFileSync(join(seed, '.npmrc'), 'offline=true\naudit=false\nfund=false\n');
	const prepared = spawnSync(join(distribution, 'bin/node'), [join(distribution, 'lib/node_modules/npm/bin/npm-cli.js'), 'install', '--package-lock-only', '--ignore-scripts'], {
		cwd: seed, env: { ...env, NODE_OPTIONS: '', NODE_PATH: '' }, encoding: 'utf8', timeout: 20000,
	});
	assert.equal(prepared.status, 0, prepared.stderr);
	const git = (...args: string[]) => {
		const r = spawnSync('/usr/bin/git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-C', seed, ...args], { encoding: 'utf8' });
		assert.equal(r.status, 0, r.stderr);
	};
	git('init', '-q', '-b', 'main'); git('add', '.'); git('commit', '-q', '-m', 'fixture');
	const clean = () => rmSync(root, { recursive: true, force: true });
	const records = () => readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
	return { root, seed, home, env, scripts, trace, fakeTrace, distribution, records, clean };
}

