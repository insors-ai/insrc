/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { guardedLegacyShellJob, pinLegacyLaunchJob } from '../legacy-launch-job.js';

test('Guarded shell LaunchAgent uses the pinned Node preload and preserves passive launch policy', {
	skip: process.platform !== 'darwin',
}, async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-legacy-job-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const canonical = join(root, 'daemon');
	const archive = join(root, 'archive');
	const descriptor = join(root, 'legacy.plist');
	const privateDescriptor = join(root, 'private.plist');
	const preload = join(root, 'guard.mjs');
	const prior = { version: 1 as const, stateRoot: root, releaseRoot: canonical, releaseId: 'prior', runtime: process.execPath,
		pathEnv: '/usr/bin:/bin', enabled: false };
	await writeFile(descriptor, `<plist version="1.0"><dict>
		<key>Label</key><string>ai.insors.daemon</string>
		<key>ProgramArguments</key><array><string>/bin/bash</string><string>-c</string><string>${canonical}/scripts/daemon-ctl.sh start</string></array>
		<key>RunAtLoad</key><false/><key>KeepAlive</key><false/>
		<key>EnvironmentVariables</key><dict><key>NODE_OPTIONS</key><string>--import /untrusted</string></dict>
		</dict></plist>`, { mode: 0o600 });
	const legacy = await pinLegacyLaunchJob(prior, { ...prior, releaseId: 'candidate' }, descriptor);
	const result = await guardedLegacyShellJob(legacy, prior, archive, preload, privateDescriptor);
	assert.deepEqual(result.job.args, [prior.runtime, '--import', preload, '--import', 'tsx/esm', join(archive, 'out/daemon/index.js')]);
	assert.equal(result.job.label, legacy.job.label);
	assert.notEqual(result.descriptorHash, legacy.descriptorHash);
	await writeFile(privateDescriptor, result.bytes, { mode: 0o600 });
	const { stdout } = await promisify(execFile)('/usr/bin/plutil', ['-convert', 'json', '-o', '-', privateDescriptor]);
	const restored = JSON.parse(stdout);
	assert.equal(restored.RunAtLoad, false);
	assert.equal(restored.KeepAlive, false);
	assert.equal(restored.WorkingDirectory, archive);
	assert.equal(restored.EnvironmentVariables.INSRC_DAEMON_ROOT, canonical);
	assert.equal(restored.EnvironmentVariables.NODE_OPTIONS, undefined);
	await writeFile(descriptor, '<plist><dict/></plist>');
	await assert.rejects(guardedLegacyShellJob(legacy, prior, archive, preload, privateDescriptor), /descriptor changed/);
});

test('The restored admin hook wraps both qualified importers and preserves unrelated handlers', async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-legacy-admin-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const daemon = join(root, 'out/daemon');
	await mkdir(join(daemon, 'threads'), { recursive: true });
	await writeFile(join(root, 'package.json'), '{"type":"module"}');
	await writeFile(join(daemon, 'admin-handlers.js'), `
		export const sharedAdminHandlers = () => ({
			'daemon.update': () => { throw new Error('unguarded update'); },
			'daemon.shutdown': () => 'original shutdown',
			'daemon.status': () => 'ready',
		});
		export const adminWorkerHandlers = sharedAdminHandlers;
	`);
	const useTable = (name: string, relative: string) => `
		import { ${name} } from ${JSON.stringify(relative)};
		const table = ${name}();
		let update;
		try { await table['daemon.update'](); } catch (error) { update = error.message; }
		export const result = [update, await table['daemon.shutdown'](), table['daemon.status']()];
	`;
	await writeFile(join(daemon, 'handler-runtime.js'), useTable('sharedAdminHandlers', './admin-handlers.js'));
	await writeFile(join(daemon, 'threads/admin-worker.js'), `
		import { parentPort } from 'node:worker_threads';
		${useTable('adminWorkerHandlers', '../admin-handlers.js')}
		parentPort.postMessage(result);
	`);
	const hook = new URL('../legacy-admin-guard.ts', import.meta.url).href;
	const preload = join(root, 'preload.mjs');
	await writeFile(preload, `
		import { register } from ${JSON.stringify(import.meta.resolve('tsx/esm/api'))};
		register();
		const { installLegacyAdminGuard } = await import(${JSON.stringify(hook)});
		installLegacyAdminGuard({
			archive: ${JSON.stringify(root)},
			requestPublicStop: async () => 'controller stop',
			attest: (table, thread) => console.log(table + ':' + thread),
			registerMainDrain: drain => console.log(drain()),
		});
	`);
	const entry = join(root, 'main.mjs');
	await writeFile(entry, `
		import { once } from 'node:events';
		import { Worker } from 'node:worker_threads';
		import { result } from './out/daemon/handler-runtime.js';
		console.log(JSON.stringify(result));
		const worker = new Worker(new URL('./out/daemon/threads/admin-worker.js', import.meta.url));
		const [workerResult] = await once(worker, 'message');
		console.log(JSON.stringify(workerResult));
	`);
	const { stdout } = await promisify(execFile)(process.execPath, ['--import', preload, entry]);
	const lines = stdout.trim().split('\n');
	assert.equal(lines[0], 'original shutdown');
	assert.equal(lines[1], 'main:0');
	assert.match(lines[3] ?? '', /^worker:[1-9]\d*$/);
	const expected = ['Restored daemon updates require the current insrc installer', 'controller stop', 'ready'];
	assert.deepEqual(JSON.parse(lines[2] ?? ''), expected);
	assert.deepEqual(JSON.parse(lines[4] ?? ''), expected);
});
