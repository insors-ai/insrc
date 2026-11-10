/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { drainLegacyDaemonForCutover } from '../legacy-daemon-cutover.js';

test('Legacy cutover observes the exact authenticated process exit before cleaning its publication', {
	skip: process.platform !== 'darwin', timeout: 10_000,
}, async t => {
	const stateRoot = await realpath(await mkdtemp('/tmp/insrc-lc-'));
	const entry = join(stateRoot, 'legacy.mjs');
	await writeFile(entry, `
import { createServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.env.INSRC_TEST_ROOT;
const server = createServer(socket => {
  let pending = '';
  socket.on('data', chunk => {
    pending += chunk;
    if (!pending.endsWith('\\n')) return;
    const request = JSON.parse(pending);
    if (request.method === 'daemon.shutdown') process.exit(0);
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
	const observed = await drainLegacyDaemonForCutover(pin, async () => {});
	assert.equal(observed?.pid, child.pid);
	assert.deepEqual(await exited, [0, null]);
	assert.equal(existsSync(join(stateRoot, 'daemon.pid')), false);
	assert.equal(existsSync(join(stateRoot, 'daemon.sock')), false);
});
