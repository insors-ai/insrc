import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { nativeOptions, ownedSourceFixture } from './helpers/owned-source-fixture.js';

test('shell fresh install update and restart preflight use official owned Node despite ambient Node and npm', nativeOptions, () => {
	const f = ownedSourceFixture();
	try {
		const installation = join(f.root, 'installed with spaces');
		const install = spawnSync('/bin/bash', [join(f.scripts, 'insrc-daemon-install.sh'), '--target', installation, '--repo', f.seed, '--branch', 'main', '--no-start', '--embedder', 'onnx', '-y'], { env: f.env, encoding: 'utf8', timeout: 60000 });
		assert.equal(install.status, 0, install.stdout + install.stderr);
		const run = (command: string, extraEnv: Record<string, string> = {}, ...flags: string[]) => spawnSync('/bin/bash', [join(installation, 'scripts/daemon-ctl.sh'), command, '--skip-sync', ...flags], {
			env: { ...f.env, INSRC_DAEMON_ROOT: installation, ...extraEnv }, encoding: 'utf8', timeout: 30000,
		});
		const marker = join(installation, 'node_modules/.insrc-install-ok');
		writeFileSync(marker, 'old-lock-only-marker\n');
		const update = run('update'); assert.equal(update.status, 0, update.stdout + update.stderr);
		assert.match(readFileSync(marker, 'utf8'), /^v2:[a-f0-9]+:22\.22\.1:/);
		writeFileSync(join(f.root, 'ambient/node'), `#!/bin/sh\nprintf node >> '${f.fakeTrace}'\nprintf 'v20.18.0\\n'\nexit 99\n`);
		writeFileSync(marker, 'force-owned-install-with-node20\n');
		const older = run('update', {}, '--skip-build'); assert.equal(older.status, 0, older.stdout + older.stderr);
		rmSync(join(f.root, 'ambient/node')); rmSync(join(f.root, 'ambient/npm'));
		writeFileSync(marker, 'force-owned-install-without-node\n');
		const absent = run('update', {}, '--skip-build'); assert.equal(absent.status, 0, absent.stdout + absent.stderr);
		const pid = join(f.home, '.insrc/daemon.pid'); writeFileSync(pid, 'retain-incumbent');
		const restart = run('restart', { INSRC_TEST_BUILD_FAIL: '1' }, '--skip-install');
		assert.equal(restart.status, 4, restart.stdout + restart.stderr);
		assert.equal(readFileSync(pid, 'utf8'), 'retain-incumbent', 'failed preparation never reaches stop');
		const external = run('update', { INSRC_NODE_BIN: process.execPath }, '--skip-install', '--skip-build');
		assert.equal(external.status, 2); assert.match(external.stderr, /External INSRC_NODE_BIN/);
		const matching = run('update', { INSRC_NODE_BIN: join(f.distribution, 'bin/node') }, '--skip-install', '--skip-build');
		assert.equal(matching.status, 0, matching.stdout + matching.stderr);
		assert.ok(!existsSync(f.fakeTrace));
		assert.ok(f.records().some(record => record.phase === 'preinstall'));
		assert.ok(f.records().some(record => record.phase === 'build'));
		for (const record of f.records()) {
			assert.equal(record.version, '22.22.1'); assert.equal(record.exe, join(f.distribution, 'bin/node'));
			if ('options' in record) { assert.equal(record.options, null); assert.equal(record.nodePath, null); }
		}
	} finally { f.clean(); }
});

test('shell legacy upgrade bridge uses the same official Node and npm before managed delegation', nativeOptions, () => {
	for (const ambient of ['absent', '20', '26'] as const) {
	const f = ownedSourceFixture(ambient);
	try {
		const installation = join(f.root, 'incumbent'); cpSync(f.seed, installation, { recursive: true });
		writeFileSync(join(installation, 'incumbent'), 'retained executable');
		// Authorization is a fixture adapter; this test proves runtime routing,
		// not the signing policy independently covered by managed release tests.
		const verifier = `import fs from 'node:fs'; const [operation,bridge,state,repo]=process.argv.slice(2); if(operation!=='authorize')process.exit(91); fs.cpSync(repo,bridge+'/checkout',{recursive:true});`;
		const script = join(f.scripts, 'insrc-daemon-install.sh');
		writeFileSync(script, readFileSync(script, 'utf8').replace("INSRC_RELEASE_BOOTSTRAP_B64=''", `INSRC_RELEASE_BOOTSTRAP_B64='${Buffer.from(verifier).toString('base64')}'`));
		const result = spawnSync('/bin/bash', [script, '--target', installation, '--repo', f.seed, '--branch', 'main', '-y'], { env: f.env, encoding: 'utf8', timeout: 60000 });
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.equal(readFileSync(join(installation, 'incumbent'), 'utf8'), 'retained executable');
		assert.ok(f.records().some(record => record.phase === 'prepare-legacy-upgrade'));
		assert.ok(!existsSync(f.fakeTrace));
		for (const record of f.records()) { assert.equal(record.version, '22.22.1'); assert.equal(record.exe, join(f.distribution, 'bin/node')); }
	} finally { f.clean(); }
	}
});

test('fresh installer uses official Node with absent Node and ambient Node20 or Node26', nativeOptions, () => {
	for (const ambient of ['absent', '20', '26'] as const) {
		const f = ownedSourceFixture(ambient);
		try {
			const installation = join(f.root, 'fresh installation');
			const result = spawnSync('/bin/bash', [join(f.scripts, 'insrc-daemon-install.sh'), '--target', installation, '--repo', f.seed, '--branch', 'main', '--no-start', '--embedder', 'onnx', '-y'], { env: f.env, encoding: 'utf8', timeout: 60000 });
			assert.equal(result.status, 0, `${ambient}: ${result.stdout}${result.stderr}`);
			assert.ok(!existsSync(f.fakeTrace));
			for (const record of f.records()) { assert.equal(record.version, '22.22.1'); assert.equal(record.exe, join(f.distribution, 'bin/node')); }
		} finally { f.clean(); }
	}
});

test('successful restart retains actual official helper and daemon child identity across the runtime matrix', nativeOptions, async () => {
	for (const ambient of ['absent', '20', '26'] as const) {
		const f = ownedSourceFixture(ambient), installation = f.seed;
		mkdirSync(join(installation, 'out/bin'), { recursive: true }); mkdirSync(join(installation, 'out/daemon'), { recursive: true });
		mkdirSync(join(installation, 'node_modules'), { recursive: true });
		symlinkSync(resolve('node_modules/tsx'), join(installation, 'node_modules/tsx'));
		// Run the real compiled stop helper in an empty HOME (no predecessor to
		// capture). Existing errno1 forced-stop qualification stays separate.
		writeFileSync(join(installation, 'out/bin/insrc-daemon-control.js'), `import fs from 'node:fs'; fs.appendFileSync(process.env.INSRC_TEST_IDENTITY,JSON.stringify({phase:'control-helper',version:process.versions.node,exe:process.execPath})+'\\n'); await import(${JSON.stringify(pathToFileURL(resolve('out/bin/insrc-daemon-control.js')).href)});`);
		const socket = join(f.home, '.insrc/daemon.sock'), pid = join(f.home, '.insrc/daemon.pid');
		writeFileSync(join(installation, 'out/daemon/index.js'), `import net from 'node:net'; import fs from 'node:fs';
const sock=${JSON.stringify(socket)}, pid=${JSON.stringify(pid)};
const server=net.createServer(s=>s.on('data',()=>s.end('done\\n',()=>setImmediate(exit))));
function exit(){fs.rmSync(sock,{force:true});fs.rmSync(pid,{force:true});process.exit(0);}
server.listen(sock,()=>{fs.writeFileSync(pid,String(process.pid));const identity={phase:'daemon',version:process.versions.node,exe:process.execPath};fs.appendFileSync(process.env.INSRC_TEST_IDENTITY,JSON.stringify(identity)+'\\n');fs.writeSync(3,JSON.stringify(identity)+'\\n');});
setTimeout(exit,15000);
`);
		const child = spawn('/bin/bash', [join(f.scripts, 'daemon-ctl.sh'), 'restart', '--skip-sync', '--skip-install', '--skip-build'], {
			env: { ...f.env, INSRC_DAEMON_ROOT: installation }, stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
		});
		let output = ''; child.stdout!.on('data', c => { output += c; }); child.stderr!.on('data', c => { output += c; });
		const exited = new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code)); });
		// fd3 is inherited by the actual daemon and held until process exit.
		// Child 'close' confirms that retained descriptor closed, even after disown.
		const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
		let data = '';
		const ready = new Promise<any>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`daemon descriptor handshake timed out: ${output}`)), 10000);
			child.stdio[3]!.on('data', chunk => { data += chunk; if (data.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(data.split('\n')[0]!)); } });
		});
		const shutdown = async () => {
			if (!existsSync(socket)) return;
			await new Promise<void>(resolve => {
				const connection = createConnection(socket); connection.once('connect', () => connection.end('shutdown\n'));
				connection.on('data', () => {}); connection.once('error', () => resolve()); connection.once('close', () => resolve());
			});
		};
		try {
			const identity = await ready; assert.equal(identity.version, '22.22.1'); assert.equal(identity.exe, join(f.distribution, 'bin/node'));
			assert.equal(await exited, 0, output);
			assert.ok(f.records().some(record => record.phase === 'control-helper'));
			assert.ok(!existsSync(f.fakeTrace));
			for (const record of f.records()) { assert.equal(record.version, '22.22.1'); assert.equal(record.exe, join(f.distribution, 'bin/node')); }
		} finally {
			await shutdown();
			if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
			await closed; f.clean();
		}
	}
});
