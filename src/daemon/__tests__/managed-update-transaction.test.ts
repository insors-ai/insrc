/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { strict as assert } from 'node:assert';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { open } from 'lmdb';
import { connect } from '@lancedb/lancedb';
import type { ManagedSupervisorLink } from '../../cli/services/managed-daemon-control.js';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import { classifyMutationRecovery, InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import type {
	DurableUpdateOutcome, InstallationJournal, MutationReservation,
} from '../../shared/installation-mutation-gate.js';
import { recoverManagedTransaction, settleManagedUpdate } from '../managed-update-transaction.js';
import type { ManagedInstallation, RegisteredManagedJob } from '../../shared/managed-daemon-installation.js';
import { installationPaths, launchctl, requireAbsentManagedSelector, requireQuiescentInstallation } from '../../shared/managed-daemon-installation.js';
import { runFileIdentity } from '../../shared/daemon-run-files.js';
import { completeLegacyMigration, completeManagedUpdate, recoverInstalledManagedUpdate } from '../managed-update-recovery.js';
import { qualifyManagedUpdate, stageManagedUpdate } from '../managed-update-handoff.js';
import { readReleaseCompatibility } from '../release-compatibility.js';
import { readPublicInstalledCommit, readPublicUpdateOutcome } from '../managed-update-ipc.js';
import { discoverLegacyLaunch } from '../legacy-cutover-admission.js';
import { drainLegacyDaemonForCutover } from '../legacy-daemon-cutover.js';
import { inspectLegacyJob, removeLegacyJob, restoreLegacyService, verifyLegacyService } from '../legacy-launch-job.js';

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

test('Uncertain publication with durable success versus no outcome', async () => {
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

test('Observe in-flight status throughout injected rollback, then exactly one terminal outcome after restored readiness or a durable operator-recovery decision', mac, async t => {
	for (const leaveFenced of [false, true]) {
		const f = await installationFixture(t);
		const active = await f.gate.reserve({ kind: 'update', owner: f.controller, predecessor: f.predecessor }) as typeof update;
		f.refuseHello();
		const host = {
			...f.host,
			async select(pin: ManagedInstallation, authorize: () => Promise<void>) {
				await f.host.select(pin, authorize);
				assert.equal(await readPublicInstalledCommit(f.gate, undefined, () => 'candidate-head'), 'prior-head');
				assert.equal(await readPublicUpdateOutcome(f.gate), null);
			},
			async remove(pin: ManagedInstallation, authorize: () => Promise<void>, expected?: DarwinIncarnation) {
				if (pin.releaseId === 'candidate') {
					assert.equal(await readPublicInstalledCommit(f.gate, undefined, () => 'candidate-head'), 'prior-head');
					assert.equal(await readPublicUpdateOutcome(f.gate), null);
					if (leaveFenced) throw new Error('candidate exit is uncertain');
				}
				return f.host.remove(pin, authorize, expected);
			},
		};
		const result = await completeManagedUpdate(f.gate, active, f.pins, host, (gate, reservation, pins) =>
			stageManagedUpdate(gate, reservation, pins, { ...host, async inspectStores() {} }));
		assert.equal(result.decision, leaveFenced ? 'operator-recovery' : 'rolled-back');
		const state = await readPublicUpdateOutcome(f.gate);
		assert.equal(state?.updateId, active.id);
		assert.equal(state?.state, 'failed');
		assert.equal(await readPublicInstalledCommit(f.gate, undefined, () => leaveFenced ? 'candidate-head' : 'prior-head'), 'prior-head');
		await assert.rejects(f.gate.publishOutcome(active, 'committed', 'duplicate'));
		assert.deepEqual(await readPublicUpdateOutcome(f.gate), state);
	}
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

async function legacyMigrationFixture(t: TestContext, candidateReady: boolean) {
	const root = await realpath(await mkdtemp('/tmp/insrc-migration-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const gate = new InstallationMutationGate(root);
	const owner = await readDarwinIncarnation(process.pid);
	const makePin = (releaseId: string, enabled: boolean): ManagedInstallation => ({
		version: 1, enabled, releaseId, stateRoot: root, releaseRoot: join(root, releaseId),
		runtime: process.execPath, pathEnv: '/usr/bin:/bin',
	});
	const prior = makePin('legacy', false);
	const candidate = makePin('candidate', true);
	const baseline = { ...candidate, enabled: false };
	const profile = (releaseId: string) => readReleaseCompatibility({
		version: 1, releaseId, graphSchema: 10, startup: 'rollback-compatible',
		formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' },
	});
	const compatibility = { prior: profile('legacy'), candidate: profile('candidate') };
	const legacy = {
		baseline, descriptorHash: '1'.repeat(64), entry: join(prior.releaseRoot, 'out/daemon/index.js'), runAtLoad: true,
		job: { uid: owner.uid, label: 'fixture.recovery', descriptor: join(root, 'saved.plist'), program: '/bin/sh', args: ['/bin/sh', 'launch.sh'] },
	};
	const active = await gate.reserve({
		kind: 'update', owner,
		predecessor: { priorRelease: 'legacy', candidateRelease: 'candidate', priorCommit: 'old', wasRunning: true,
			generation: null, pins: { prior, candidate }, legacy },
	});
	assert.equal(active.kind, 'update');
	if (active.kind !== 'update') throw new Error('fixture requires update reservation');

	const events: string[] = [];
	let selected = baseline;
	let oldRegistered = true;
	let oldRunning = true;
	let newRegistered = false;
	let generation: string | null = null;
	const exit = { kind: 'failed', code: 1, signal: null } as const;
	const job = { target: `gui/${owner.uid}/candidate`, pid: owner.pid, incarnation: owner };
	const managed = {
		async connect(pin: ManagedInstallation): Promise<ManagedSupervisorLink> {
			assert.equal(pin.releaseId, candidate.releaseId);
			assert.equal(newRegistered, true);
			return {
				close() {},
				async call(request) {
					if (request.op === 'start') {
						assert.equal(request.updateId, active.id);
						generation = 'candidate-generation';
						events.push('start candidate');
					}
					return { v: 1, id: 'reply', ok: true, generation,
						state: generation === null ? 'idle' : candidateReady ? 'running' : 'exited',
						...(generation !== null && !candidateReady ? { exit } : {}),
					};
				},
			};
		},
		async inspect() { return newRegistered ? job : undefined; },
		async incarnation() { return owner; },
		async verifySelector(first: ManagedInstallation, second = first) {
			assert.ok([first, second].some(pin => pin.releaseId === selected.releaseId && pin.enabled === selected.enabled));
		},
		async select(pin: ManagedInstallation, authorize: () => Promise<void>) {
			await authorize();
			assert.equal(newRegistered, false);
			selected = pin;
			events.push(pin.enabled ? 'select candidate provisionally' : 'restore disabled selector');
		},
		async register(_pin: ManagedInstallation, authorize: () => Promise<void>) {
			await authorize();
			assert.equal(selected.enabled, true);
			assert.equal(oldRegistered, false);
			newRegistered = true;
			events.push('register candidate');
			return job;
		},
		async remove(_pin: ManagedInstallation, authorize: () => Promise<void>, expected?: DarwinIncarnation) {
			await authorize();
			assert.deepEqual(expected, owner);
			assert.equal(newRegistered, true);
			newRegistered = false;
			events.push('remove candidate');
			return { job, startedAt: owner.startedAt };
		},
		async quiescent() { assert.equal(oldRunning, false); },
	};
	const legacyHost = {
		async inspect() { return oldRegistered ? { target: 'saved', pid: oldRunning ? owner.pid : null } : undefined; },
		async verify(pin: typeof legacy) {
			assert.deepEqual(pin, legacy);
			assert.equal(oldRegistered && oldRunning, true);
		},
		async drain(_pin: unknown, authorize: () => Promise<void>) {
			await authorize();
			oldRunning = false;
			events.push('observe legacy exit');
			return owner;
		},
		async remove(pin: typeof legacy, authorize: () => Promise<void>) {
			await authorize();
			assert.deepEqual(pin, legacy);
			assert.equal(oldRunning, false);
			oldRegistered = false;
			events.push('remove saved LaunchAgent');
		},
		async restore(pin: typeof legacy, _prior: ManagedInstallation, wasRunning: boolean, authorize: () => Promise<void>) {
			await authorize();
			assert.deepEqual(pin, legacy);
			assert.equal(newRegistered, false);
			assert.equal(selected.enabled, false);
			oldRegistered = true;
			oldRunning = wasRunning;
			events.push('restore saved LaunchAgent and verify readiness');
		},
	};
	const migrate = () => completeLegacyMigration(gate, active, { prior, candidate, compatibility }, managed, legacyHost, {
		...managed, async inspectStores() {
			assert.equal(oldRegistered, false);
			events.push('verify quiesced stores');
		},
	});
	return { gate, migrate, events };
}

test('Recovery job and legacy migration', mac, async t => {
	const { gate, migrate, events } = await legacyMigrationFixture(t, true);
	assert.equal((await migrate()).decision, 'committed');
	assert.deepEqual(events, [
		'observe legacy exit', 'remove saved LaunchAgent', 'verify quiesced stores',
		'select candidate provisionally', 'register candidate', 'start candidate',
	]);
	assert.equal((await gate.read()).active, null);
});

test('Rollback after legacy stop but before managed readiness restores the saved service', mac, async t => {
	const { gate, migrate, events } = await legacyMigrationFixture(t, false);
	const result = await migrate();
	assert.equal(result.decision, 'rolled-back');
	assert.match(result.detail, /before probation readiness/);
	assert.deepEqual(events, [
		'observe legacy exit', 'remove saved LaunchAgent', 'verify quiesced stores',
		'select candidate provisionally', 'register candidate', 'start candidate',
		'remove candidate', 'restore disabled selector', 'restore saved LaunchAgent and verify readiness',
	]);
	assert.equal((await gate.read()).active, null);
});

async function installedLegacyFixture(t: TestContext) {
	const scratch = await realpath(await mkdtemp('/tmp/insrc-legacy-transaction-'));
	t.after(() => rm(scratch, { recursive: true, force: true }));
	const root = join(scratch, '.insrc');
	const helper = join(scratch, 'lifecycle');
	execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror',
		fileURLToPath(new URL('../../native/darwin-lifecycle/identity.c', import.meta.url)), '-o', helper]);
	const runtime = await realpath(process.execPath);
	const common = { version: 1, stateRoot: root, runtime, pathEnv: '/usr/bin:/bin' } as const;
	const prior = { ...common, releaseId: 'old', releaseRoot: join(root, 'daemon'), enabled: false };
	const next = { ...common, releaseId: 'next', releaseRoot: join(root, 'next'), enabled: true };
	await mkdir(join(prior.releaseRoot, 'out', 'daemon'), { recursive: true });
	await mkdir(next.releaseRoot);
	const config = join(root, 'config.json');
	const configBytes = '{"existing":"configuration"}\n';
	await writeFile(config, configBytes);
	const graphPath = join(root, 'graph.lmdb');
	const graph = open({ path: graphPath, noSubdir: true, maxDbs: 32 });
	const meta = graph.openDB({ name: 'meta', keyEncoding: 'ordered-binary' });
	meta.putSync('schema_version', 10);
	meta.putSync('fixture_marker', 'keep graph row');
	await graph.close();
	const lancePath = join(root, 'lance');
	const lance = await connect(lancePath);
	const table = await lance.createTable('fixture', [{ id: 'keep lance row' }]);
	table.close();
	lance.close();
	const paths = installationPaths(root);
	const entry = join(prior.releaseRoot, 'out', 'daemon', 'index.js');
	let controller: DarwinIncarnation;
	for (let attempt = 0;; attempt++) {
		try { controller = await readDarwinIncarnation(process.pid, helper); break; }
		catch (error) {
			if (attempt >= 2 || (error as { killed?: boolean }).killed !== true) throw error;
			await delay(200);
		}
	}
	const gate = new InstallationMutationGate(root, helper);
	const profile = (releaseId: string) => readReleaseCompatibility({ version: 1, releaseId, graphSchema: 10,
		startup: 'rollback-compatible', formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' } });
	const pins = { prior, candidate: next, compatibility: { prior: profile(prior.releaseId), candidate: profile(next.releaseId) } };
	const handoff = {
		async connect(): Promise<ManagedSupervisorLink> { throw new Error('failed bootstrap has no candidate socket'); },
		async inspect() { return undefined; },
		incarnation: readDarwinIncarnation,
		async verifySelector() { assert.fail('legacy selector baseline was absent'); },
		async select() { assert.fail('first migration must exclusively publish its selector'); },
		async register() {
			assert.ok(runFileIdentity(paths.descriptor));
			assert.ok(runFileIdentity(paths.manifest));
			assert.ok(runFileIdentity(paths.runGuard));
			throw new Error('injected candidate bootstrap failure');
		},
		async remove() { return undefined; },
		quiescent: requireQuiescentInstallation,
		async inspectStores(_pins: unknown, guard?: { assertOwned(): void }) {
			assert.ok(guard);
			guard.assertOwned();
		},
	};
	const baseline = { ...next, enabled: false };
	const legacyHost = { helper, inspect: inspectLegacyJob, drain: drainLegacyDaemonForCutover,
		remove: removeLegacyJob, restore: restoreLegacyService, verify: verifyLegacyService,
		async discover(pin: ManagedInstallation, disabled: ManagedInstallation, deps?: { labels?: readonly string[] }) {
			return discoverLegacyLaunch(pin, disabled, { helper, ...deps });
		} };
	async function migrate(labels?: readonly string[]) {
		const discover = (pin: ManagedInstallation, disabled: ManagedInstallation) =>
			legacyHost.discover(pin, disabled, labels === undefined ? undefined : { labels });
		const route = await discover(prior, baseline);
		const reservation = await gate.reserve({ kind: 'update', owner: controller,
			predecessor: { ...route, selectorAbsent: true, priorRelease: prior.releaseId, priorCommit: 'old',
				candidateRelease: next.releaseId, generation: null, pins: { prior, candidate: next } } });
		if (reservation.kind !== 'update') throw new Error('expected update reservation');
		const services = { ...legacyHost, discover };
		const result = await completeLegacyMigration(gate, reservation, pins, handoff, services, handoff);
		assert.equal(result.decision, 'rolled-back', result.detail);
		assert.match(result.detail, /injected candidate bootstrap failure/);
		assert.equal((await gate.read()).active, null);
		assert.deepEqual(await recoverInstalledManagedUpdate(gate, reservation.id, controller, handoff, services), (await gate.read()).outcome);
		requireAbsentManagedSelector(root);
		assert.equal(runFileIdentity(paths.runGuard), undefined);
		assert.equal(await readFile(config, 'utf8'), configBytes);
		const stored = open({ path: graphPath, readOnly: true, maxDbs: 32 });
		try { assert.equal(stored.openDB({ name: 'meta', keyEncoding: 'ordered-binary' }).get('fixture_marker'), 'keep graph row'); }
		finally { await stored.close(); }
		const vectors = await connect(lancePath);
		const restored = await vectors.openTable('fixture');
		try { assert.equal((await restored.query().toArray())[0]?.id, 'keep lance row'); }
		finally { restored.close(); vectors.close(); }
	}
	return { scratch, root, gate, runtime, prior, baseline, controller, paths, entry, legacyHost, migrate };
}

test('Startup guard transfer, candidate bootstrap failure, rollback and repeated recovery', { ...mac, timeout: 120_000 }, async t => {
	const f = await installedLegacyFixture(t);
	await writeFile(f.entry, `
const { createServer } = require('node:net');
const { writeFileSync } = require('node:fs');
const root = ${JSON.stringify(f.root)};
writeFileSync(root + '/daemon.pid', String(process.pid));
createServer(socket => {
  socket.on('error', () => {});
  socket.on('data', data => {
    const request = JSON.parse(data.toString());
    if (request.method === 'daemon.shutdown') process.exit(0);
    if (request.method === 'daemon.status') socket.end(JSON.stringify({ id: request.id, result: { pid: process.pid } }) + '\\n');
  });
}).listen(root + '/daemon.sock', () => console.log('ready'));
`);
	const old = spawn(f.runtime, [f.entry], { cwd: f.prior.releaseRoot, stdio: ['ignore', 'pipe', 'inherit'] });
	const exited = once(old, 'exit');
	try {
		const [ready] = await Promise.race([once(old.stdout, 'data'), exited]);
		assert.match(String(ready), /ready/);
		await f.migrate();
		assert.deepEqual(await exited, [0, null]);
		const restored = await f.legacyHost.discover(f.prior, f.baseline);
		assert.ok(restored.launch?.kind === 'direct');
		assert.notEqual(restored.launch.process.pid, old.pid);
		assert.deepEqual(restored.launch.argv, [f.runtime, f.entry]);
		assert.equal(restored.launch.cwd, f.prior.releaseRoot);
	} finally {
		if (runFileIdentity(f.paths.daemonPid) !== undefined) {
			await drainLegacyDaemonForCutover({ stateRoot: f.root, runtime: f.runtime, entry: f.entry }, async () => {});
		}
		if (old.exitCode === null && old.signalCode === null) old.kill();
		await exited;
	}
});

test('Rollback restores an idle job without launching and refuses unqualified RunAtLoad', { ...mac, timeout: 120_000 }, async t => {
	const f = await installedLegacyFixture(t);
	const marker = join(f.root, 'started');
	await writeFile(f.entry, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started');\n`);
	const label = `ai.insrc.test.idle.${f.scratch.split('/').at(-1)}`;
	const descriptor = join(f.scratch, 'legacy.plist');
	const domain = `gui/${f.controller.uid}`;
	const target = `${domain}/${label}`;
	const plist = (runAtLoad: boolean) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${f.runtime}</string><string>${f.entry}</string></array>
<key>WorkingDirectory</key><string>${f.prior.releaseRoot}</string>
<key>RunAtLoad</key><${runAtLoad}/><key>KeepAlive</key><false/>
</dict></plist>`;
	await writeFile(descriptor, plist(true), { mode: 0o600 });
	await launchctl(['bootstrap', domain, descriptor]);
	try {
		for (let attempt = 0; attempt < 40; attempt++) {
			if (runFileIdentity(marker) !== undefined && (await launchctl(['print', target])).includes('\tstate = not running')) break;
			await delay(50);
		}
		assert.equal(await readFile(marker, 'utf8'), 'started');
		await assert.rejects(f.legacyHost.discover(f.prior, f.baseline, { labels: [label] }), /cannot be restored in its stopped state/);
		assert.equal((await f.gate.read()).active, null);
	} finally { await launchctl(['bootout', target]); }
	await rm(marker);
	await writeFile(descriptor, plist(false));
	await launchctl(['bootstrap', domain, descriptor]);
	try {
		const old = await f.legacyHost.discover(f.prior, f.baseline, { labels: [label] });
		assert.ok(old.legacy && old.launch?.kind === 'stopped');
		await f.migrate([label]);
		assert.deepEqual(await f.legacyHost.discover(f.prior, f.baseline, { labels: [label] }), old);
		assert.equal(runFileIdentity(marker), undefined);
	} finally { await launchctl(['bootout', target]); }
});
