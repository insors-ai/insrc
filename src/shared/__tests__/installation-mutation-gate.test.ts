/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import type { TestContext } from 'node:test';
import { readDarwinIncarnation } from '../darwin-lifecycle.js';
import type { DarwinIncarnation } from '../darwin-lifecycle.js';
import { SupervisorLifecycleError } from '../daemon-supervisor-protocol.js';
import type { SupervisorErrorCode } from '../daemon-supervisor-protocol.js';
import { classifyMutationRecovery, InstallationMutationGate } from '../installation-mutation-gate.js';
import type { InstallationJournal, MutationReservation } from '../installation-mutation-gate.js';

const darwin = process.platform === 'darwin' && (process.getuid?.() ?? 0) !== 0;
const options = { skip: !darwin };
const predecessor = { priorRelease: '/previous', candidateRelease: '/candidate', priorCommit: 'old', wasRunning: true };
let scratch: string | undefined;
let helper: string;
let owner: DarwinIncarnation;

before(async () => {
	if (!darwin) return;
	scratch = realpathSync(mkdtempSync('/tmp/insrc-mutation-'));
	helper = join(scratch, 'observer');
	execFileSync(process.env['CC'] || 'cc', ['-std=c11', '-Wall', '-Wextra', '-Werror',
		fileURLToPath(new URL('../../native/darwin-lifecycle/identity.c', import.meta.url)), '-o', helper]);
	owner = await readDarwinIncarnation(process.pid, helper);
});
after(() => {
	if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
});

function fixture(): { root: string; gate: InstallationMutationGate } {
	const root = mkdtempSync(join(scratch!, 'root-'));
	return { root, gate: new InstallationMutationGate(root, helper) };
}

async function rejects(code: SupervisorErrorCode, result: Promise<unknown>): Promise<void> {
	await assert.rejects(result, error => error instanceof SupervisorLifecycleError && error.code === code);
}

test('Durable update reservation blocks competing mutations and binds the owner', options, async () => {
	const { gate, root } = fixture();
	const update = await gate.reserve({ kind: 'update', owner, predecessor });
	const second = new InstallationMutationGate(root, helper);
	assert.deepEqual((await second.read()).active, update);
	await rejects('busy', second.reserve({ kind: 'start', owner }));
	await rejects('ownership-conflict', second.admit({ id: 'other', owner }));
	assert.deepEqual(await second.admit(update), update);
	await rejects('ownership-conflict', second.release(update));
	await gate.recordIntent(update, 'start', 'job and predecessor exit verified');
	await rejects('ownership-conflict', gate.recordReceipt(update, 'different', 'not the expected receipt'));
	await rejects('ownership-conflict', gate.publishOutcome(update, 'committed', 'candidate not yet verified'));
	await gate.recordReceipt(update, 'start', 'generation g1 running');
	await gate.publishOutcome(update, 'committed', 'validated g1');
	await rejects('ownership-conflict', gate.publishOutcome(update, 'rolled-back', 'second outcome'));
	await rejects('ownership-conflict', second.admit(update));
	await second.admit(update, 'activate');
	await gate.release(update);
	assert.deepEqual(await second.read(), {
		version: 1, root, active: null, outcome: { id: update.id, decision: 'committed', detail: 'validated g1' },
	});
});

test('Admission rejects foreign update IDs, owner PID reuse and connections opened before lease publication', options, async () => {
	const { root, gate } = fixture();
	const beforePublication = new InstallationMutationGate(root, helper);
	assert.equal((await beforePublication.read()).active, null);
	const original = await beforePublication.reserve({ kind: 'restart', owner });
	await rejects('busy', gate.reserve({ kind: 'update', owner, predecessor }));
	await beforePublication.release(original);
	const active = await gate.reserve({ kind: 'update', owner, predecessor });
	await rejects('ownership-conflict', beforePublication.admit(original));
	await rejects('ownership-conflict', beforePublication.admit({ id: 'foreign', owner }));
	await rejects('ownership-conflict', beforePublication.admit({ id: active.id, owner: { ...owner, startedAt: '0:0' } }));
	await beforePublication.admit(active);
	writeFileSync(join(root, 'managed-lifecycle', 'journal.json'), '{bad', { mode: 0o600 });
	await rejects('ownership-conflict', beforePublication.reserve({ kind: 'stop', owner }));
});

test('Recovery classification distinguishes uncommitted, committed, rolled-back and fenced transactions', options, async () => {
	const { root, gate } = fixture();
	const active = await gate.reserve({ kind: 'update', owner, predecessor });
	const base = await gate.read();
	const journal = (id: string, decision: 'committed' | 'rolled-back' | 'operator-recovery'): InstallationJournal => ({
		...base, outcome: { id, decision, detail: 'evidence' },
	});
	assert.equal(classifyMutationRecovery({ ...base, active: null }), 'idle');
	assert.equal(classifyMutationRecovery(base), 'uncommitted');
	assert.equal(classifyMutationRecovery(journal('previous-transaction', 'committed')), 'uncommitted');
	assert.equal(classifyMutationRecovery(journal(active.id, 'committed')), 'activate');
	assert.equal(classifyMutationRecovery(journal(active.id, 'rolled-back')), 'finish-rollback');
	await gate.recordIntent(active, 'job-removal', 'verified job');
	await gate.publishOutcome(active, 'operator-recovery', 'missing exit evidence');
	assert.equal(classifyMutationRecovery(await new InstallationMutationGate(root, helper).read()), 'fenced');
	await rejects('ownership-conflict', gate.admit(active, 'reconcile'));
	await rejects('ownership-conflict', gate.release(active));
});

type ContenderMessage = { reservation: MutationReservation } | { error: string };
function contender(t: TestContext, root: string, holdLock = false) {
	const gateModule = new URL('../installation-mutation-gate.ts', import.meta.url).href;
	const identityModule = new URL('../darwin-lifecycle.ts', import.meta.url).href;
	const script = `
		import { openSync } from 'node:fs';
		import { spawnSync } from 'node:child_process';
		import { join } from 'node:path';
		import { InstallationMutationGate } from ${JSON.stringify(gateModule)};
		import { readDarwinIncarnation } from ${JSON.stringify(identityModule)};
		const [root, helper, hold] = process.argv.slice(1);
		const owner = await readDarwinIncarnation(process.pid, helper);
		const gate = new InstallationMutationGate(root, helper);
		try {
			const reservation = await gate.reserve({ kind: 'restart', owner });
			if (hold === 'true') {
				const fd = openSync(join(root, 'managed-lifecycle/arbitration.lock'), 'r+');
				const result = spawnSync(helper, ['lock'], { stdio: ['ignore', 'ignore', 'ignore', fd] });
				if (result.status !== 0) throw new Error('fixture could not hold arbitration lock');
			}
			process.send({ reservation });
		} catch (error) { process.send({ error: error.code ?? error.message }); }
		process.on('message', () => {});
	`;
	const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, root, helper, String(holdLock)], {
		stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
	});
	const closed = once(child, 'exit');
	const message = Promise.race([
		once(child, 'message').then(([value]) => value as ContenderMessage),
		closed.then(() => { throw new Error('contender exited before reporting admission'); }),
	]);
	const stop = async () => {
		if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
		await closed;
	};
	t.after(stop);
	return { message, stop };
}

test('Two independent processes cannot reserve the same installation or clear an unverified orphan reservation', options, async t => {
	const { root, gate } = fixture();
	const first = contender(t, root);
	const second = contender(t, root);
	const replies = await Promise.all([first.message, second.message]);
	assert.equal(replies.filter(result => 'reservation' in result).length, 1);
	assert.deepEqual(replies.find(result => 'error' in result), { error: 'busy' });
	const winner = 'reservation' in replies[0]! ? first : second;
	const result = await winner.message;
	assert.ok('reservation' in result);
	await rejects('ownership-conflict', gate.claimRecovery(result.reservation.id, owner, async () => true));
	await winner.stop();
	await rejects('ownership-conflict', gate.claimRecovery(result.reservation.id, owner, async () => false));
	await rejects('busy', gate.reserve({ kind: 'start', owner }));
	assert.equal((await gate.read()).active?.id, result.reservation.id);
});

test('Controller death releases short arbitration but preserves the durable reservation', options, async t => {
	const { root, gate } = fixture();
	const holder = contender(t, root, true);
	const result = await holder.message;
	assert.ok('reservation' in result);
	await rejects('busy', gate.reserve({ kind: 'stop', owner }));
	await holder.stop();
	await rejects('busy', gate.reserve({ kind: 'stop', owner }));
	assert.equal(await gate.claimRecovery(result.reservation.id, owner, async (state, decision) => {
		assert.equal(state.active?.id, result.reservation.id);
		assert.equal(decision, 'uncommitted');
		return true; // The fixture performed no external lifecycle transitions.
	}), 'uncommitted');
	const recovered = await gate.read();
	assert.deepEqual(recovered.active?.owner, owner);
	await gate.release({ id: result.reservation.id, owner });
	const next = await gate.reserve({ kind: 'stop', owner });
	assert.notEqual(next.id, result.reservation.id);
});

test('Public lifecycle admission remains busy while an update owns the installation', options, async () => {
	const { root, gate } = fixture();
	const update = await gate.reserve({ kind: 'update', owner, predecessor });
	const publicLifecycle = new InstallationMutationGate(root, helper);
	for (const kind of ['start', 'stop', 'restart'] as const) {
		await rejects('busy', publicLifecycle.reserve({ kind, owner }));
	}
	await rejects('busy', publicLifecycle.reserve({ kind: 'update', owner, predecessor }));
	await gate.publishOutcome(update, 'rolled-back', 'prior release verified');
	await rejects('busy', publicLifecycle.reserve({ kind: 'stop', owner }));
	await gate.release(update);
	const publicStop = await publicLifecycle.reserve({ kind: 'stop', owner });
	assert.equal(publicStop.kind, 'stop');
});
