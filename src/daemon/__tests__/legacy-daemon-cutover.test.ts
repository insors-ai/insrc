/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { drainLegacyDaemonForCutover, observeLegacyDrain } from '../legacy-daemon-cutover.js';
import { pinLegacyLaunchJob } from '../legacy-launch-job.js';

test('Legacy cutover observes the exact authenticated process exit before cleaning its publication', {
	skip: process.platform !== 'darwin', timeout: 10_000,
}, async t => {
	const stateRoot = await realpath(await mkdtemp('/tmp/insrc-lc-'));
	const entry = join(stateRoot, 'legacy.mjs');
	const log = join(stateRoot, 'daemon.log');
	await writeFile(log, '');
	await writeFile(entry, `
import { createServer } from 'node:net';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.env.INSRC_TEST_ROOT;
const server = createServer(socket => {
  let pending = '';
  socket.on('data', chunk => {
    pending += chunk;
    if (!pending.endsWith('\\n')) return;
    const request = JSON.parse(pending);
    if (request.method === 'daemon.shutdown') {
      appendFileSync(join(root, 'daemon.log'), JSON.stringify({ time: Date.now(), module: 'daemon', msg: 'bye', pid: process.pid }) + '\\n');
      process.exit(0);
    }
  });
});

server.listen(join(root, 'daemon.sock'), () => {
  writeFileSync(join(root, 'daemon.pid'), String(process.pid));
  process.send('ready');
});
`);
	const child = spawn(process.execPath, [entry], {
		env: { ...process.env, INSRC_TEST_ROOT: stateRoot }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
	});
	const exited = once(child, 'exit');
	t.after(async () => {
		if (child.exitCode === null && child.signalCode === null) child.kill();
		await exited;
		await rm(stateRoot, { recursive: true, force: true });
	});
	const ready = await Promise.race([once(child, 'message').then(([message]) => message), exited]);
	assert.equal(ready, 'ready');
	const pin = { stateRoot, runtime: process.execPath, entry };
	await assert.rejects(drainLegacyDaemonForCutover({ ...pin, entry: join(stateRoot, 'foreign.mjs') }, async () => {}), /pinned entry/);
	assert.equal(child.exitCode, null);
	const observed = await observeLegacyDrain(pin, async () => {}, { log });
	assert.equal(observed?.exit.pid, child.pid);
	assert.equal(observed?.drain, 'graceful');
	assert.deepEqual(await exited, [0, null]);
	assert.equal(existsSync(join(stateRoot, 'daemon.pid')), false);
	assert.equal(existsSync(join(stateRoot, 'daemon.sock')), false);
});

test('Legacy LaunchAgent pinning rejects automatic restart before migration', { skip: process.platform !== 'darwin' }, async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-legacy-pin-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const descriptor = join(root, 'recovery.plist');
	const baseline = { version: 1, enabled: false, stateRoot: root, releaseRoot: root, releaseId: 'release',
		runtime: '/bin/sh', pathEnv: '/usr/bin:/bin' } as const;
	const plist = (keepAlive: boolean) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>fixture.recovery</string>
<key>ProgramArguments</key><array><string>/bin/sh</string><string>recover.sh</string></array>
<key>KeepAlive</key><${keepAlive}/><key>RunAtLoad</key><true/></dict></plist>`;
	await writeFile(descriptor, plist(true), { mode: 0o600 });
	await assert.rejects(pinLegacyLaunchJob(baseline, baseline, descriptor), /unsupported.*restart policy/);
	await writeFile(descriptor, plist(false));
	const pin = await pinLegacyLaunchJob(baseline, baseline, descriptor);
	assert.equal(pin.runAtLoad, true);
	assert.equal(pin.job.label, 'fixture.recovery');
	assert.match(pin.descriptorHash, /^[a-f0-9]{64}$/);
});
