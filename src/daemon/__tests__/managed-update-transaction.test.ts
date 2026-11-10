/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import type { ManagedSupervisorLink } from '../../cli/services/managed-daemon-control.js';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import { classifyMutationRecovery, InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import type {
	DurableUpdateOutcome, InstallationJournal, MutationReservation,
} from '../../shared/installation-mutation-gate.js';
import { recoverManagedTransaction, settleManagedUpdate } from '../managed-update-transaction.js';
import type { ManagedInstallation, RegisteredManagedJob } from '../../shared/managed-daemon-installation.js';
import { completeManagedUpdate, recoverInstalledManagedUpdate } from '../managed-update-recovery.js';
import { qualifyManagedUpdate, stageManagedUpdate } from '../managed-update-handoff.js';
import { readReleaseCompatibility } from '../release-compatibility.js';

const owner: DarwinIncarnation = { pid: 10, uid: 501, startedAt: '0:0', executable: '/usr/bin/node' };
const update: Extract<MutationReservation, { kind: 'update' }> = {
	id: 'update', kind: 'update', owner,
	predecessor: { priorRelease: 'prior', candidateRelease: 'candidate', priorCommit: 'prior-head', wasRunning: true },
	entries: [],
};
const candidate = { job: { target: 'gui/501/job', pid: 11 }, generation: 'candidate-generation' };

test('Incompatible supervisor version produces one terminal failure after reconciliation', async () => {
	const calls: string[] = [];
	const result = await settleManagedUpdate({
		async publishOutcome(_authority, decision) { calls.push(decision); },
		async release() { calls.push('release'); },
	}, update, {
		async stage() { throw new Error('no common supervisor version'); },
		async verifyCandidate() { assert.fail('incompatible candidate cannot be verified'); },
		async rollback() { calls.push('predecessor restored'); },
	});
	assert.deepEqual(calls, ['predecessor restored', 'rolled-back', 'release']);
	assert.deepEqual(result, { id: update.id, decision: 'rolled-back', detail: 'no common supervisor version' });
});

test('Terminal outcome and marker ordering, including persistence failure', async () => {
	for (const fail of [false, true]) {
		const calls: string[] = [];
		const action = settleManagedUpdate({
			async publishOutcome(_authority, decision) {
				calls.push(decision);
				if (fail) throw new Error('publication failed');
			},
			async release() { calls.push('release'); },
		}, update, {
			async stage() { return candidate; },
			async verifyCandidate(receipt) { assert.equal(receipt, candidate); calls.push('verified'); },
			async rollback() { assert.fail('a publication error must preserve the reservation for recovery'); },
		});
		if (fail) await assert.rejects(action, /publication failed/);
		else assert.equal((await action).decision, 'committed');
		assert.deepEqual(calls, fail ? ['verified', 'committed'] : ['verified', 'committed', 'release']);
	}

	const calls: string[] = [];
	const fenced = await settleManagedUpdate({
		async publishOutcome(_authority, decision) { calls.push(decision); },
		async release() { assert.fail('a fenced reservation must remain active'); },
	}, update, {
		async stage() { throw new Error('no candidate handshake'); },
		async verifyCandidate() { assert.fail('candidate cannot be verified'); },
		async rollback() { throw new Error('candidate job ownership unresolved'); },
	});
	assert.deepEqual(calls, ['operator-recovery']);
	assert.match(fenced.detail, /ownership unresolved/);
});

test('Recovery applies only the operations permitted by the matching outcome', async () => {
	const scenarios = [
		{ outcome: null, expected: ['verify-owner', 'rollback:lifecycle', 'rolled-back', 'release'] },
		{ outcome: { id: 'older', decision: 'committed' }, expected: ['verify-owner', 'rollback:lifecycle', 'rolled-back', 'release'] },
		{ outcome: { id: 'update', decision: 'committed' }, expected: ['verify-owner', 'verify-candidate', 'release'] },
		{ outcome: { id: 'update', decision: 'rolled-back' }, expected: ['verify-owner', 'verify-predecessor', 'release'] },
		{ outcome: { id: 'update', decision: 'operator-recovery' }, expected: ['verify-owner', 'rollback:reconcile', 'release'] },
	] as const;
	for (const { outcome, expected } of scenarios) {
		const calls: string[] = [];
		const durable: DurableUpdateOutcome | null = outcome === null ? null : { ...outcome, detail: 'prior decision' };
		const journal: InstallationJournal = { version: 1, root: '/private/root', active: update, outcome: durable };
		await recoverManagedTransaction({
			async read() { return journal; },
			async claimRecovery(_id, _owner, reconcile) {
				const decision = classifyMutationRecovery(journal);
				assert.notEqual(decision, 'idle');
				if (decision === 'idle' || !await reconcile(journal, decision)) throw new Error('fixture ownership conflict');
				return decision;
			},
			async publishOutcome(_authority, decision) { calls.push(decision); },
			async release() { calls.push('release'); },
		}, update.id, owner, {
			async verifyOwnership() { calls.push('verify-owner'); return true; },
			async verifyCommitted() { calls.push('verify-candidate'); },
			async verifyRolledBack() { calls.push('verify-predecessor'); },
			async rollback(_update, purpose) { calls.push(`rollback:${purpose}`); },
		});
		assert.deepEqual(calls, expected);
	}
});

const darwin = process.platform === 'darwin';
const mac = { skip: !darwin, timeout: 20_000 };
type Point = 'reservation' | 'job registration' | 'probation' | 'after outcome publication';

async function installationFixture(t: TestContext, point: Point = 'reservation') {
	const root = await realpath(await mkdtemp('/tmp/insrc-rt-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const gate = new InstallationMutationGate(root);
	const controller = await readDarwinIncarnation(process.pid);
	const makeInstallation = (releaseId: string): ManagedInstallation => ({
		version: 1, releaseId, enabled: true, pathEnv: '/usr/bin:/bin', runtime: process.execPath,
		stateRoot: root, releaseRoot: join(root, releaseId),
	});
	const prior = makeInstallation('prior');
	const next = makeInstallation('candidate');
	const previousProfile = readReleaseCompatibility({
		version: 1, releaseId: prior.releaseId, graphSchema: 10, startup: 'rollback-compatible',
		formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' },
	});
	const nextProfile = { ...previousProfile, releaseId: next.releaseId };
	const pins = qualifyManagedUpdate(prior, next, previousProfile, nextProfile, [{ prior: previousProfile, candidate: nextProfile }]);
	const predecessor = {
		priorRelease: prior.releaseId, candidateRelease: next.releaseId, priorCommit: 'prior-head',
		wasRunning: true, generation: 'prior-generation', pins: { prior, candidate: next },
	};
	const jobs = new Map([prior, next].map((release, index) => {
		const incarnation = { ...controller, pid: 50 + index };
		const job: RegisteredManagedJob = { target: 'gui/501/job', pid: incarnation.pid, incarnation };
		return [release, job] as const;
	}));
	let selected = point === 'reservation' ? prior : next;
	let registered: ManagedInstallation | undefined = selected;
	let generation: string | null = point === 'job registration' ? null : `${selected.releaseId}-generation`;
	let state: 'idle' | 'running' | 'exited' = generation === null ? 'idle' : 'running';
	const exit = { kind: 'graceful', code: 0, signal: null } as const;
	const events: string[] = [];
	let failHello = false;
	const operations = {
		async connect(installation: ManagedInstallation): Promise<ManagedSupervisorLink> {
			assert.equal(registered, installation);
			if (failHello && installation === next) throw new Error('candidate hello failed');
			return {
				close() {},
				async call(request) {
					if (request.generation !== null) assert.equal(request.generation, generation);
					if (request.op === 'stop') { events.push(`stop:${installation.releaseId}`); state = 'exited'; }
					if (request.op === 'start') {
						events.push(`start:${installation.releaseId}`);
						state = 'running';
						generation = `${installation.releaseId}-restored`;
					}
					return { v: 1, id: 'status', ok: true, state, generation, ...(state === 'exited' ? { exit } : {}) };
				},
			};
		},
		async inspect(installation: ManagedInstallation) {
			if (registered === undefined) return undefined;
			assert.equal(installation, registered, 'refuse a job belonging to another release');
			return jobs.get(registered);
		},
		async incarnation(pid: number) { return [...jobs.values()].find(job => job.pid === pid)!.incarnation!; },
		async select(installation: ManagedInstallation, check: () => Promise<void>) {
			await check();
			assert.equal(registered, undefined);
			events.push(`select:${installation.releaseId}`);
			selected = installation;
		},
		async verifySelector(first: ManagedInstallation, second = first) {
			assert.ok(first.releaseId === selected.releaseId || second.releaseId === selected.releaseId);
		},
		async remove(installation: ManagedInstallation, check: () => Promise<void>, expected?: DarwinIncarnation) {
			await check();
			if (registered === undefined) return undefined;
			assert.equal(registered, installation);
			assert.notEqual(state, 'running');
			const job = jobs.get(installation)!;
			if (expected !== undefined) assert.deepEqual(expected, job.incarnation);
			events.push(`remove:${installation.releaseId}`);
			registered = undefined;
			return { job, startedAt: job.incarnation!.startedAt };
		},
		async register(installation: ManagedInstallation, check: () => Promise<void>) {
			await check();
			assert.equal(selected, installation);
			assert.equal(registered, undefined);
			events.push(`register:${installation.releaseId}`);
			registered = installation;
			generation = null;
			state = 'idle';
			return jobs.get(installation);
		},
		async quiescent() { assert.notEqual(state, 'running'); },
	};
	// The real journal deserializes pins into fresh objects after the controller exits.
	const pinned = (installation: ManagedInstallation) => installation.releaseId === prior.releaseId ? prior : next;
	const host = {
		...operations,
		connect: (installation: ManagedInstallation) => operations.connect(pinned(installation)),
		inspect: (installation: ManagedInstallation) => operations.inspect(pinned(installation)),
		remove: (installation: ManagedInstallation, check: () => Promise<void>, expected?: DarwinIncarnation) =>
			operations.remove(pinned(installation), check, expected),
		select: (installation: ManagedInstallation, check: () => Promise<void>) => operations.select(pinned(installation), check),
		register: (installation: ManagedInstallation, check: () => Promise<void>) => operations.register(pinned(installation), check),
	};
	return {
		root, gate, controller, prior, next, pins, predecessor, jobs, host, events,
		refuseHello: () => { failHello = true; },
		relaunch() {
			assert.equal(registered, next);
			const job = jobs.get(next)!;
			const incarnation = { ...job.incarnation!, pid: job.incarnation!.pid + 100 };
			jobs.set(next, { ...job, pid: incarnation.pid, incarnation });
			state = 'idle';
			generation = null;
		},
	};
}

test('Fail hello after candidate job registration before child start, remove the candidate job and restore the prior release', mac, async t => {
	const f = await installationFixture(t);
	const active = await f.gate.reserve({ kind: 'update', owner: f.controller, predecessor: f.predecessor }) as typeof update;
	f.refuseHello();
	const outcome = await completeManagedUpdate(f.gate, active, f.pins, f.host, (gate, reservation, pins) =>
		stageManagedUpdate(gate, reservation, pins, { ...f.host, async inspectStores() {} }));
	assert.equal(outcome.decision, 'rolled-back');
	assert.match(outcome.detail, /hello failed/);
	assert.deepEqual(f.events, [
		'stop:prior', 'remove:prior', 'select:candidate', 'register:candidate',
		'remove:candidate', 'select:prior', 'register:prior', 'start:prior',
	]);
	assert.equal((await f.gate.read()).active, null);
});

async function killController(
	t: TestContext, f: Awaited<ReturnType<typeof installationFixture>>, point: Point, pendingRegistration = false,
): Promise<string> {
	const entries: [string, string, string?][] = [];
	if (point !== 'reservation') {
		entries.push(['predecessor-stop', 'prior-generation', JSON.stringify({ state: 'exited', generation: 'prior-generation', exit: { kind: 'graceful' } })]);
		entries.push(['predecessor-job-removal', 'prior', '{"absent":true}']);
		entries.push(['provisional-selector', 'candidate', 'candidate']);
		entries.push(pendingRegistration ? ['candidate-job', 'candidate'] : ['candidate-job', 'candidate', JSON.stringify(f.jobs.get(f.next))]);
	}
	if (point === 'probation' || point === 'after outcome publication') {
		entries.push(['candidate-start', 'candidate', '{"generation":"candidate-generation","state":"running"}']);
	}
	const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `
import { InstallationMutationGate } from './src/shared/installation-mutation-gate.ts';
import { readDarwinIncarnation } from './src/shared/darwin-lifecycle.ts';
const [root, predecessor, entries, point] = process.argv.slice(1);
const gate = new InstallationMutationGate(root);
const active = await gate.reserve({ kind: 'update', owner: await readDarwinIncarnation(process.pid), predecessor: JSON.parse(predecessor) });
for (const [step, intent, receipt] of JSON.parse(entries)) {
  await gate.recordIntent(active, step, intent);
  if (receipt !== undefined) await gate.recordReceipt(active, step, receipt);
}
if (point === 'after outcome publication') await gate.publishOutcome(active, 'committed', 'fixture commit');
process.send(active.id);
setInterval(() => {}, 1000);
`, f.root, JSON.stringify(f.predecessor), JSON.stringify(entries), point], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
	t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
	const id = await Promise.race([
		once(child, 'message').then(([message]) => String(message)),
		once(child, 'exit').then(([code]) => { throw new Error(`fixture controller exited early (${code})`); }),
	]);
	const exited = once(child, 'exit');
	child.kill('SIGKILL');
	await exited;
	return id;
}

test('Kill the controller at reservation, job registration, probation, and after outcome publication', mac, async t => {
	for (const point of ['reservation', 'job registration', 'probation', 'after outcome publication'] as const) {
		const f = await installationFixture(t, point);
		const id = await killController(t, f, point);
		const result = await recoverInstalledManagedUpdate(f.gate, id, f.controller, f.host);
		assert.equal(result.decision, point === 'after outcome publication' ? 'committed' : 'rolled-back');
		assert.equal((await f.gate.read()).active, null);
		assert.equal(f.events.includes('stop:candidate'), point === 'probation');
		assert.equal(f.events.includes('remove:candidate'), point === 'job registration' || point === 'probation');
		assert.equal(f.events.includes('select:prior'), point === 'job registration' || point === 'probation');
	}
});

test('Relaunch supervisor after provisional release selection and verify recovery restores the old selector before uncommitted rollback, or preserves the candidate after success', mac, async t => {
	for (const committed of [false, true]) {
		const point = committed ? 'after outcome publication' : 'job registration';
		const f = await installationFixture(t, point);
		const id = await killController(t, f, point, !committed);
		f.relaunch();
		const outcome = await recoverInstalledManagedUpdate(f.gate, id, f.controller, f.host);
		assert.equal(outcome.decision, committed ? 'committed' : 'rolled-back');
		assert.equal((await f.gate.read()).active, null);
		if (committed) {
			await f.host.verifySelector(f.next);
			assert.deepEqual(f.events, []);
		} else {
			await f.host.verifySelector(f.prior);
			assert.deepEqual(f.events, ['remove:candidate', 'select:prior', 'register:prior', 'start:prior']);
		}
	}

	const uncertain = await installationFixture(t, 'probation');
	const id = await killController(t, uncertain, 'probation');
	uncertain.relaunch();
	await assert.rejects(recoverInstalledManagedUpdate(uncertain.gate, id, uncertain.controller, uncertain.host), /recorded supervisor incarnation/);
	assert.equal((await uncertain.gate.read()).active?.id, id);
	assert.deepEqual(uncertain.events, []);
});
