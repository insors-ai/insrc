/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import { listenForLegacyDrain, requestLegacyDrain } from '../legacy-private-drain.js';

test('Private legacy drain accepts one request from the journaled controller at the exact intent', {
	skip: process.platform !== 'darwin',
}, async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-legacy-drain-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const owner = await readDarwinIncarnation(process.pid);
	const gate = new InstallationMutationGate(root);
	const path = join(root, 'private.sock');
	let drains = 0;
	const server = await listenForLegacyDrain(path, root, owner, gate, () => { drains++; });
	t.after(() => { server.close(); });
	const member = { dev: '1', ino: '2', ctimeNs: '3', mtimeNs: '4', size: '5' };
	const prior = { version: 1 as const, stateRoot: root, releaseRoot: root, releaseId: 'old',
		runtime: owner.executable, pathEnv: '/usr/bin:/bin', enabled: false };
	const update = await gate.reserve({ kind: 'update', owner, predecessor: {
		priorRelease: 'old', priorCommit: 'old', candidateRelease: 'new', wasRunning: true,
		pins: { prior, candidate: { ...prior, releaseId: 'new', releaseRoot: join(root, 'candidate'), enabled: true } },
		launch: { kind: 'direct', process: owner, argv: [owner.executable, join(root, 'out/daemon/index.js')],
			cwd: root, pidFile: member, socketFile: member },
	} });
	await assert.rejects(requestLegacyDrain(path, owner, update.id));
	assert.equal(drains, 0);
	await gate.recordIntent(update, 'predecessor-stop', 'exact legacy route');
	await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `
		import { createConnection } from 'node:net';
		const [path, id] = process.argv.slice(1);
		const socket = createConnection(path);
		socket.on('connect', () => socket.write(JSON.stringify({ version: 1, op: 'drain', id }) + '\\n'));
		socket.on('data', () => { process.exitCode = 1; });
	`, path, update.id]);
	await assert.rejects(requestLegacyDrain(path, { ...owner, startedAt: '1:2' }, update.id), /peer changed/);
	await assert.rejects(requestLegacyDrain(path, owner, 'wrong-update'));
	assert.equal(drains, 0);
	await requestLegacyDrain(path, owner, update.id);
	await assert.rejects(requestLegacyDrain(path, owner, update.id));
	assert.equal(drains, 1);
	await gate.recordReceipt(update, 'predecessor-stop', 'fixture drained');
	await gate.publishOutcome(update, 'rolled-back', 'fixture completed');
	await gate.release(update);
});
