/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { accepted } from '../cli/services/managed-daemon-control.js';
import type { ManagedSupervisorLink } from '../cli/services/managed-daemon-control.js';
import { matchesDarwinPeer, readDarwinIncarnation } from '../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../shared/darwin-lifecycle.js';
import type { RunFileGuard } from '../shared/daemon-run-files.js';
import { measureManagedReleaseInventory } from './managed-release-inventory.js';
import { recordedReleaseQualification } from '../shared/installation-mutation-gate.js';
import type { InstallationMutationGate, MutationReservation } from '../shared/installation-mutation-gate.js';
import {
	inspectManagedJob, publishManagedSelector, registerManagedJob, removeManagedJob,
	readManagedInstallation, requireAbsentManagedSelector, requireQuiescentInstallation, restoreAbsentManagedSelector, verifyFreshSelectorOwnership, verifyManagedSelectorFiles,
} from '../shared/managed-daemon-installation.js';
import type { ManagedInstallation, RegisteredManagedJob } from '../shared/managed-daemon-installation.js';
import { connectManagedSupervisor, recordManagedUpdatePins, stageManagedCandidate, stageManagedUpdate, verifyManagedUpdateInventory, waitForGeneration } from './managed-update-handoff.js';
import type { HandoffEffects, HandoffReceipt, ManagedUpdatePins } from './managed-update-handoff.js';
import { recoverManagedTransaction, settleManagedUpdate } from './managed-update-transaction.js';
import { drainLegacyDaemonForCutover, observeLegacyDrain } from './legacy-daemon-cutover.js';
import { discoverLegacyLaunch, fenceLegacyLauncher, restoreLegacyLauncher } from './legacy-cutover-admission.js';
import { inspectLegacyJob, removeLegacyJob, restoreDirectLegacyService, restoreLegacyService, verifyDirectLegacyService, verifyLegacyService } from './legacy-launch-job.js';
import { holdLegacyRunGuard, settleLegacyRunGuard } from './legacy-run-guard.js';
import { qualifiedPairFromReservation } from './release-compatibility.js';

type Update = Extract<MutationReservation, { kind: 'update' }>;
type Purpose = 'lifecycle' | 'reconcile';
type Pins = NonNullable<Update['predecessor']['pins']>;
type Gate = Pick<InstallationMutationGate, 'admit' | 'recordIntent' | 'recordReceipt' | 'read' | 'claimRecovery' | 'release' | 'publishOutcome'>;
type Status = ReturnType<typeof accepted>;

interface RecoveryHost {
	readonly connect: typeof connectManagedSupervisor;
	readonly inspect: typeof inspectManagedJob;
	readonly incarnation: typeof readDarwinIncarnation;
	readonly select: typeof publishManagedSelector;
	readonly verifySelector: typeof verifyManagedSelectorFiles;
	readonly remove: typeof removeManagedJob;
	readonly register: typeof registerManagedJob;
	readonly quiescent: typeof requireQuiescentInstallation;
}

const host: RecoveryHost = {
	connect: connectManagedSupervisor, inspect: inspectManagedJob, incarnation: readDarwinIncarnation,
	select: publishManagedSelector, verifySelector: verifyManagedSelectorFiles, remove: removeManagedJob,
	register: registerManagedJob, quiescent: requireQuiescentInstallation,
};

interface LegacyHost {
	readonly helper?: string;
	readonly discover?: typeof discoverLegacyLaunch;
	readonly inspect: typeof inspectLegacyJob;
	readonly drain: typeof drainLegacyDaemonForCutover;
	readonly remove: typeof removeLegacyJob;
	readonly restore: typeof restoreLegacyService;
	readonly verify: typeof verifyLegacyService;
}

const legacyHost: LegacyHost = {
	inspect: inspectLegacyJob, drain: drainLegacyDaemonForCutover, remove: removeLegacyJob,
	restore: restoreLegacyService, verify: verifyLegacyService,
};

function entry(update: Update, step: string) {
	return update.entries.find(item => item.step === step);
}

function evidence<T>(update: Update, step: string): T | null {
	return JSON.parse(entry(update, step)?.receipt ?? 'null') as T | null;
}

function pinsOf(update: Update): Pins {
	const pins = update.predecessor.pins;
	if (pins === undefined) throw new Error('managed recovery requires the original release pins');
	return pins;
}

function rollbackSelector(update: Update): ManagedInstallation {
	const { prior, candidate } = pinsOf(update);
	return update.predecessor.legacy?.baseline ?? (update.predecessor.launch === undefined ? prior : { ...candidate, enabled: false });
}

async function verifyRollbackSelector(update: Update, operations: RecoveryHost, candidateMayBeSelected = false): Promise<void> {
	const { prior, candidate } = pinsOf(update);
	if (update.predecessor.selectorAbsent) {
		if (candidateMayBeSelected) await verifyFreshSelectorOwnership(candidate, update.id);
		else requireAbsentManagedSelector(prior.stateRoot);
	} else {
		const baseline = rollbackSelector(update);
		await operations.verifySelector(baseline, candidateMayBeSelected ? candidate : baseline);
	}
}

async function verifyOriginalLegacyRoute(update: Update, legacyOperations: LegacyHost): Promise<void> {
	const { prior } = pinsOf(update);
	const { legacy, launch, wasRunning } = update.predecessor;
	if (legacy !== undefined) await legacyOperations.verify(legacy, prior, wasRunning);
	if (launch !== undefined) {
		const observed = await (legacyOperations.discover ?? discoverLegacyLaunch)(prior, rollbackSelector(update));
		const expected = { launch, wasRunning, ...(legacy === undefined ? {} : { legacy }) };
		if (!isDeepStrictEqual(observed, expected)) throw new Error('legacy launch route changed after update reservation');
	}
}

function inactive(status: Status): boolean {
	return status.state === 'idle' || (status.state === 'exited' && status.exit !== undefined);
}

async function statusOf(link: ManagedSupervisorLink, generation: string | null = null): Promise<Status> {
	return accepted(await link.call({ op: 'status', generation }));
}

async function withLink<T>(operations: RecoveryHost, installation: ManagedInstallation, action: (link: ManagedSupervisorLink) => Promise<T>): Promise<T> {
	const link = await operations.connect(installation);
	try { return await action(link); }
	finally { link.close(); }
}

async function requireJob(
	operations: RecoveryHost, installation: ManagedInstallation, expected?: RegisteredManagedJob | null,
): Promise<RegisteredManagedJob | undefined> {
	const actual = await operations.inspect(installation);
	if (actual === undefined || actual.pid === null) return actual;
	const incarnation = await operations.incarnation(actual.pid);
	if (expected != null && (expected.target !== actual.target || expected.pid !== actual.pid || expected.incarnation === undefined
		|| !matchesDarwinPeer(incarnation, incarnation, expected.incarnation))) {
		throw new Error('registered job does not match the recorded supervisor incarnation');
	}
	return { ...actual, incarnation };
}

async function requireReady(
	operations: RecoveryHost, installation: ManagedInstallation, wasRunning: boolean, generation?: string | null,
): Promise<void> {
	await operations.verifySelector(installation);
	await withLink(operations, installation, async link => {
		const status = await statusOf(link, generation ?? null);
		if (wasRunning ? status.state !== 'running' || status.generation === null : !inactive(status)) {
			throw new Error('pinned release did not return the expected daemon readiness');
		}
	});
	if (!wasRunning) await operations.quiescent(installation);
}

class Rollback {
	constructor(
		private readonly gate: Gate, private readonly authority: Update, private readonly operations: RecoveryHost,
		private readonly purpose: Purpose, private readonly legacyOperations = legacyHost,
	) {}

	private async state(): Promise<Update> {
		return await this.gate.admit(this.authority, this.purpose) as Update;
	}

	private revalidate = async () => { await this.state(); };

	private receipt(step: string, evidence: string): Promise<void> {
		return this.gate.recordReceipt(this.authority, step, evidence, this.purpose);
	}

	private async journal(step: string, detail: string, effect: () => Promise<string>): Promise<void> {
		const previous = entry(await this.state(), step);
		if (previous?.receipt !== undefined) return;
		if (previous === undefined) await this.gate.recordIntent(this.authority, step, detail, this.purpose);
		await this.revalidate();
		await this.receipt(step, await effect());
	}

	async run(): Promise<void> {
		const initial = await this.state();
		const { prior, candidate } = pinsOf(initial);
		const { legacy, launch, wasRunning } = initial.predecessor;
		const legacyUpdate = legacy !== undefined || launch !== undefined;
		const provisional = entry(initial, 'provisional-selector');
		await verifyRollbackSelector(initial, this.operations, provisional !== undefined);
		if (legacyUpdate && entry(initial, 'predecessor-stop') === undefined) {
			if (entry(initial, 'legacy-launcher-fence') !== undefined) {
				await restoreLegacyLauncher(this.gate, initial, this.legacyOperations.helper, this.purpose);
			}
			const pending = initial.entries.at(-1);
			if (pending !== undefined && pending.receipt === undefined) {
				await this.receipt(pending.step, 'preflight interrupted before legacy drain');
			}
			await verifyRollbackSelector(initial, this.operations);
			await verifyOriginalLegacyRoute(initial, this.legacyOperations);
			return;
		}
		const candidateAttempt = entry(initial, 'candidate-job');
		const priorRemoval = entry(initial, 'predecessor-job-removal');

		if (candidateAttempt !== undefined && entry(initial, 'rollback-selector') === undefined) {
			await this.removeCandidate(initial, candidate);
		} else if (priorRemoval !== undefined && provisional === undefined) {
			// A crash while unloading the predecessor may leave no exact exit receipt.
			// Absence alone does not prove the formerly registered process exited.
			if (priorRemoval.receipt === undefined && launch === undefined && (legacy === undefined
				? await this.operations.inspect(prior) : await this.legacyOperations.inspect(legacy)) === undefined) {
				throw new Error('predecessor job removal is unconfirmed');
			}
		}

		const pending = (await this.state()).entries.at(-1);
		if (pending?.receipt === undefined && pending !== undefined && !pending.step.startsWith('rollback-')) {
			if (pending.step === 'predecessor-stop' && legacyUpdate) {
				if (entry(initial, 'legacy-launcher-fence') !== undefined) {
					if (launch !== undefined && launch.kind !== 'stopped'
						&& !matchesDarwinPeer(launch.process, await readDarwinIncarnation(launch.process.pid), launch.process)) {
						throw new Error('predecessor exit is unconfirmed during recovery');
					}
					await restoreLegacyLauncher(this.gate, initial, this.legacyOperations.helper, this.purpose);
				}
				await verifyOriginalLegacyRoute(initial, this.legacyOperations);
				await this.receipt(pending.step, 'verified original legacy readiness');
			} else if (pending.step === 'predecessor-stop') {
				await withLink(this.operations, prior, async link => {
					const status = await statusOf(link, initial.predecessor.generation ?? null);
					if (status.state !== 'running' && !inactive(status)) throw new Error('predecessor stop is still unresolved');
					await this.receipt(pending.step, JSON.stringify(status));
				});
			} else {
				if (pending.step === 'legacy-run-guard') {
					await settleLegacyRunGuard(this.gate, initial, prior.stateRoot, this.purpose, this.legacyOperations.helper);
				}
				await this.receipt(pending.step, 'reconciled to the pinned predecessor by rollback');
			}
		}
		if (provisional !== undefined) {
			await this.journal('rollback-selector', prior.releaseId, async () => {
				if (initial.predecessor.selectorAbsent) await restoreAbsentManagedSelector(candidate, initial.id, this.revalidate);
				else await this.operations.select(rollbackSelector(initial), this.revalidate);
				return prior.releaseId;
			});
		}
		await verifyRollbackSelector(initial, this.operations);
		const releaseProof = recordedReleaseQualification(initial);
		const verifyPrior = async () => {
			if (releaseProof !== undefined
				&& await measureManagedReleaseInventory(prior.releaseRoot, prior.runtime) !== releaseProof.priorFingerprint) {
				throw new Error('pinned rollback inventory changed');
			}
		};

		if (legacyUpdate) {
			await this.journal('rollback-legacy-service', prior.releaseId, async () => {
				if (entry(initial, 'legacy-launcher-fence') !== undefined) {
					await settleLegacyRunGuard(this.gate, initial, prior.stateRoot, this.purpose, this.legacyOperations.helper);
					await restoreLegacyLauncher(this.gate, initial, this.legacyOperations.helper, this.purpose);
				}
				await verifyPrior();
				if (legacy !== undefined) await this.legacyOperations.restore(legacy, prior, wasRunning, this.revalidate);
				else if (launch?.kind === 'direct') await restoreDirectLegacyService(prior, launch, this.revalidate);
				else await this.operations.quiescent(prior);
				return prior.releaseId;
			});
			if (legacy !== undefined) await this.legacyOperations.verify(legacy, prior, wasRunning);
			else if (launch?.kind === 'direct') await verifyDirectLegacyService(prior, launch);
			else await this.operations.quiescent(prior);
			return;
		}

		await this.journal('rollback-job', prior.releaseId, async () => {
			await verifyPrior();
			const job = await this.operations.inspect(prior);
			if (job?.pid == null) {
				if (job !== undefined) await this.operations.remove(prior, this.revalidate);
				await this.operations.quiescent(prior);
				const restored = await this.operations.register(prior, this.revalidate);
				if (restored?.pid == null) throw new Error('prior job was not restored');
			}
			return prior.releaseId;
		});
		if (initial.predecessor.wasRunning) {
			await this.journal('rollback-start', prior.releaseId, async () => withLink(this.operations, prior, async link => {
				const status = await statusOf(link);
				if (status.state === 'running' && status.generation !== null) return status.generation;
				if (!inactive(status)) throw new Error('prior generation is in transition');
				await this.revalidate();
				const start = accepted(await link.call({ op: 'start', generation: status.generation, updateId: initial.id }));
				if (start.generation === null) throw new Error('prior daemon did not start');
				const ready = await waitForGeneration(link, start.generation, 'running', 70_000);
				if (ready.state !== 'running') throw new Error('restored daemon exited before readiness');
				return start.generation;
			}));
		}
		const restored = entry(await this.state(), 'rollback-start')?.receipt;
		await requireReady(this.operations, prior, initial.predecessor.wasRunning, restored);
	}

	private async removeCandidate(initial: Update, candidate: ManagedInstallation): Promise<void> {
		const previousRemoval = entry(initial, 'rollback-candidate-job');
		if (previousRemoval?.receipt !== undefined) {
			if (await this.operations.inspect(candidate) !== undefined) throw new Error('removed candidate job reappeared');
			return;
		}
		const startup = entry(initial, 'candidate-start');
		const expected = evidence<RegisteredManagedJob>(initial, 'candidate-job');
		const job = await requireJob(this.operations, candidate, expected);
		if (job === undefined && (startup !== undefined || expected?.pid != null) && previousRemoval?.receipt === undefined) {
			throw new Error('candidate job disappeared without exact exit evidence');
		}
		const pending = initial.entries.at(-1);
		if (pending?.step === 'candidate-job' && pending.receipt === undefined) {
			await this.receipt(pending.step, JSON.stringify(job ?? null));
		}
		if (startup !== undefined) {
			const recorded = evidence<{ generation?: string }>(initial, 'candidate-start')?.generation;
			if (job?.pid == null) throw new Error('candidate supervisor unavailable for exact child reconciliation');
			await withLink(this.operations, candidate, async link => {
				const status = await statusOf(link, recorded ?? null);
				if (startup.receipt === undefined) await this.receipt('candidate-start', JSON.stringify(status));
				await this.journal('rollback-candidate-stop', status.generation ?? 'no child', async () => {
					if (inactive(status)) return JSON.stringify(status);
					if (status.generation === null) throw new Error('candidate generation is unverified');
					await this.revalidate();
					accepted(await link.call({ op: 'stop', generation: status.generation, updateId: initial.id }));
					const exit = await waitForGeneration(link, status.generation, 'exited', 40_000);
					if (exit.exit === undefined) throw new Error('candidate child exit is unconfirmed');
					return JSON.stringify(exit);
				});
			});
		}
		await settleLegacyRunGuard(this.gate, initial, candidate.stateRoot, this.purpose, this.legacyOperations.helper);
		if (pending?.step === 'legacy-guard-transfer' && pending.receipt === undefined) {
			await this.receipt(pending.step, 'candidate was idle and its guard was retired');
		}
		await this.journal('rollback-candidate-job', candidate.releaseId, async () => {
			await this.operations.quiescent(candidate);
			const removed = await this.operations.remove(candidate, this.revalidate, job?.incarnation);
			if (job !== undefined && removed === undefined) throw new Error('candidate job removal was not verified');
			return JSON.stringify({ removed, absent: true });
		});
	}
}

export async function completeManagedUpdate(
	gate: Gate, update: Update, pins: ManagedUpdatePins, operations = host, stage = stageManagedUpdate,
) {
	return settleManagedUpdate(gate, update, {
		stage: () => stage(gate, update, pins),
		verifyCandidate: (receipt: HandoffReceipt) => verifyCandidate(pins.candidate, update, receipt, operations),
		rollback: () => new Rollback(gate, update, operations, 'lifecycle').run(),
	});
}

export async function completeLegacyMigration(
	gate: Gate, update: Update, pins: ManagedUpdatePins, operations = host, legacyOperations = legacyHost,
	handoff?: HandoffEffects,
) {
	const { legacy, launch, wasRunning } = update.predecessor;
	if (legacy === undefined && launch === undefined) throw new Error('legacy migration requires a saved launch route');
	const { prior } = pins;
	const entry = legacy?.entry ?? join(prior.releaseRoot, 'out/daemon/index.js');
	const authorize = async () => { await gate.admit(update); };
	return settleManagedUpdate(gate, update, {
		async stage() {
			await verifyRollbackSelector(update, operations);
			await verifyOriginalLegacyRoute(update, legacyOperations);
			await verifyManagedUpdateInventory(pins);
			if (pins.releaseQualification !== undefined) await recordManagedUpdatePins(gate, update, pins);
			if (launch !== undefined) {
				const archive = await fenceLegacyLauncher(gate, update, legacyOperations.helper);
				await verifyManagedUpdateInventory(pins, archive);
			}
			if (pins.releaseQualification === undefined) await recordManagedUpdatePins(gate, update, pins);
			await gate.recordIntent(update, 'predecessor-stop', entry);
			let guard: RunFileGuard | undefined;
			if (launch === undefined) {
				const target = await legacyOperations.drain({ stateRoot: prior.stateRoot, runtime: prior.runtime, entry }, authorize);
				if (wasRunning !== (target !== undefined)) throw new Error('legacy daemon state changed before its drain');
				await operations.quiescent(prior);
				await gate.recordReceipt(update, 'predecessor-stop', JSON.stringify({
					state: target === undefined ? 'idle' : 'exited', generation: null,
					...(target === undefined ? {} : { exit: target }),
				}));
			} else if (launch.kind === 'stopped') {
				await operations.quiescent(prior);
				await gate.recordReceipt(update, 'predecessor-stop', JSON.stringify({ state: 'idle', generation: null }));
				guard = await holdLegacyRunGuard(gate, update, prior.stateRoot, legacyOperations.helper);
			} else {
				await observeLegacyDrain({ stateRoot: prior.stateRoot, runtime: prior.runtime, entry, launch }, authorize, {
					async acquireCleanupGuard(receipt) {
						if (receipt.drain !== 'graceful') qualifiedPairFromReservation(await gate.admit(update) as Update);
						await gate.recordReceipt(update, 'predecessor-stop', JSON.stringify({ state: 'exited', generation: null, ...receipt }));
						guard = await holdLegacyRunGuard(gate, update, prior.stateRoot, legacyOperations.helper);
						return guard;
					},
				});
			}
			await gate.recordIntent(update, 'predecessor-job-removal', legacy?.job.label ?? 'no registered legacy job');
			if (legacy !== undefined) await legacyOperations.remove(legacy, authorize);
			await gate.recordReceipt(update, 'predecessor-job-removal', 'saved legacy LaunchAgent verified absent');
			return stageManagedCandidate(gate, update, pins, handoff, guard);
		},
		verifyCandidate: receipt => verifyCandidate(pins.candidate, update, receipt, operations),
		rollback: () => new Rollback(gate, update, operations, 'lifecycle', legacyOperations).run(),
	});
}

async function verifyCandidate(candidate: ManagedInstallation, update: Update, receipt: HandoffReceipt, operations: RecoveryHost): Promise<void> {
	const job = await requireJob(operations, candidate, receipt.job);
	if (job?.pid == null) throw new Error('candidate job stopped before outcome publication');
	await requireReady(operations, candidate, update.predecessor.wasRunning, receipt.generation);
}

export async function recoverInstalledManagedUpdate(
	gate: Gate, updateId: string, owner: DarwinIncarnation, operations = host, legacyOperations = legacyHost,
) {
	return recoverManagedTransaction(gate, updateId, owner, {
		async verifyOwnership({ active, outcome, root }) {
			if (active?.kind !== 'update') return false;
			if (active.predecessor.preparing) {
				return active.entries.length === 0 && (await readManagedInstallation(root))?.releaseId === active.predecessor.priorRelease;
			}
			const { prior, candidate } = pinsOf(active);
			const { legacy, launch } = active.predecessor;
			await verifyRollbackSelector(active, operations, entry(active, 'provisional-selector') !== undefined);
			const candidateMayOwnJob = entry(active, 'candidate-job') !== undefined && entry(active, 'rollback-selector') === undefined;
			const expected = candidateMayOwnJob && outcome?.id !== active.id ? evidence<RegisteredManagedJob>(active, 'candidate-job') : undefined;
			if (legacy !== undefined && !candidateMayOwnJob) await legacyOperations.inspect(legacy);
			else if (candidateMayOwnJob || launch === undefined) await requireJob(operations, candidateMayOwnJob ? candidate : prior, expected);
			return true;
		},
		async verifyCommitted(update) {
			// The selection is already final. A later runtime failure is ordinary
			// daemon health and cannot undo the recorded commit.
			await operations.verifySelector(pinsOf(update).candidate);
		},
		async verifyRolledBack(update) {
			if (!update.predecessor.preparing) await verifyRollbackSelector(update, operations);
		},
		async rollback(update, purpose) {
			if (!update.predecessor.preparing) await new Rollback(gate, update, operations, purpose, legacyOperations).run();
		},
	});
}
