/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import { acquireRunFileGuard, readRunFileGuardPin } from '../../shared/daemon-run-files.js';
import { InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import { installationPaths } from '../../shared/managed-daemon-installation.js';
import { classifyLegacyDrain } from '../legacy-drain-evidence.js';
import { adoptLegacyRunGuard, giveLegacyRunGuard, holdLegacyRunGuard, settleLegacyRunGuard } from '../legacy-run-guard.js';
import { SupervisorRunFiles } from '../supervisor-run-files.js';

test('Graceful, broker-denied and unknown drain evidence', () => {
	const pid = 820;
	const request = Date.UTC(2026, 10, 11);
	const time = request + 100;
	const graceful = { pid, time, module: 'daemon', msg: 'bye' };
	const denied = { pid, time: new Date(time).toISOString(), module: 'shutdown-watchdog', stage: 'watchdog capture',
		reason: 'broker capture failed: process capability broker refused: denied (errno 1)' };
	const classify = (...events: object[]) => classifyLegacyDrain(events.map(event => JSON.stringify(event)), pid, request, request + 200);
	assert.equal(classify(graceful), 'graceful');
	assert.equal(classify(denied), 'broker-denied');
	assert.equal(classify(graceful, denied), 'unknown');
	assert.equal(classify({ ...graceful, pid: pid + 1 }, { ...denied, time: request - 1 }), 'unknown');
	assert.equal(classify({ ...denied, stage: 'queue drain' }, { ...graceful, time: request + 201 }), 'unknown');
	assert.equal(classify({ ...graceful, msg: 'shutdown: queue drain failed' }, { ...denied, reason: 'broker capture failed' }), 'unknown');
});

test('Guard adoption binds exact identities and recovers on either side of transfer',
	{ skip: process.platform !== 'darwin' || (process.getuid?.() ?? 0) === 0, timeout: 90_000 }, async t => {
		const root = await realpath(await mkdtemp('/tmp/insrc-guard-transfer-'));
		t.after(() => rm(root, { recursive: true, force: true }));
		const helper = join(root, 'darwin-lifecycle');
		execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror',
			fileURLToPath(new URL('../../native/darwin-lifecycle/identity.c', import.meta.url)), '-o', helper]);
		const gate = new InstallationMutationGate(root, helper);
		const paths = installationPaths(root);
		const owner = await readDarwinIncarnation(process.pid, helper);
		const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 5000)'], { stdio: 'ignore' });
		t.after(async () => {
			if (child.exitCode !== null || child.signalCode !== null) return;
			const exited = once(child, 'exit');
			child.kill();
			await exited;
		});
		await once(child, 'spawn');
		const supervisor = await readDarwinIncarnation(child.pid!, helper);
		for (const running of [true, false]) {
			const update = await gate.reserve({ kind: 'update', owner,
				predecessor: { priorRelease: 'old', candidateRelease: 'new', priorCommit: 'old', wasRunning: running } });
			assert.equal(update.kind, 'update');
			if (update.kind !== 'update') throw new Error('expected update reservation');
			for (const step of ['legacy-launcher-fence', 'predecessor-stop']) {
				await gate.recordIntent(update, step, step);
				await gate.recordReceipt(update, step, step);
			}
			const old = await holdLegacyRunGuard(gate, update, root, helper);
			const directory = readRunFileGuardPin(paths.runGuard)!.directory;
			await gate.recordIntent(update, 'candidate-job', 'new');
			await gate.recordReceipt(update, 'candidate-job', JSON.stringify({ incarnation: supervisor }));
			await assert.rejects(giveLegacyRunGuard(gate, update, root, owner, helper), /exact successor job/);
			const lostIntent = { admit: gate.admit.bind(gate), recordReceipt: gate.recordReceipt.bind(gate),
				async recordIntent(...args: Parameters<InstallationMutationGate['recordIntent']>) {
					await gate.recordIntent(...args);
					throw new Error('interrupted before guard rotation');
				} };
			await assert.rejects(giveLegacyRunGuard(lostIntent, update, root, supervisor, helper), /before guard rotation/);
			old.assertOwned();
			assert.throws(() => acquireRunFileGuard(paths.runGuard), /ownership conflict/);
			const lostReceipt = { admit: gate.admit.bind(gate), recordIntent: gate.recordIntent.bind(gate),
				recordReceipt: async () => { throw new Error('interrupted after guard rotation'); } };
			await assert.rejects(giveLegacyRunGuard(lostReceipt, update, root, supervisor, helper), /after guard rotation/);
			assert.throws(() => old.release(), /ownership changed/);
			const pending = await gate.admit(update);
			assert.throws(() => adoptLegacyRunGuard(paths.runGuard, pending, supervisor), /receipt/);
			await giveLegacyRunGuard(gate, update, root, supervisor, helper);
			const active = await gate.admit(update);
			assert.throws(() => adoptLegacyRunGuard(paths.runGuard, active, owner), /cannot adopt/);
			assert.deepEqual(readRunFileGuardPin(paths.runGuard)!.directory, directory);
			assert.throws(() => acquireRunFileGuard(paths.runGuard), /ownership conflict/);
			if (running) {
				const runFiles = new SupervisorRunFiles({ guardPath: paths.runGuard, pidFile: paths.daemonPid, socketFile: paths.daemonSocket },
					{ ...supervisor, commandLine: supervisor.executable }, supervisor.uid);
				await runFiles.prepare('generation', adoptLegacyRunGuard(paths.runGuard, active, supervisor));
				assert.ok(await runFiles.grant('generation'));
				await runFiles.reconcile('generation', undefined);
			} else {
				await settleLegacyRunGuard(gate, update, root, 'lifecycle', helper);
				await settleLegacyRunGuard(gate, update, root, 'lifecycle', helper);
			}
			assert.equal(readRunFileGuardPin(paths.runGuard), undefined);
			await gate.publishOutcome(update, 'rolled-back', 'test verified the legacy guard was released');
			await gate.release(update);
		}
	});
