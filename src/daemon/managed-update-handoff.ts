/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { setTimeout as delay } from 'node:timers/promises';
import { accepted, openManagedSupervisorLink } from '../cli/services/managed-daemon-control.js';
import type { ManagedSupervisorLink } from '../cli/services/managed-daemon-control.js';
import type { SupervisorReply } from '../shared/daemon-supervisor-protocol.js';
import type { AdmittedReleaseQualification, MutationReservation, InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import type { RunFileGuard } from '../shared/daemon-run-files.js';
import { releaseMetadataDigest } from '../shared/managed-release-trust.js';
import { measureManagedReleaseInventory } from './managed-release-inventory.js';
import {
	installFreshSelectorMember, publishManagedSelector, registerManagedJob, removeManagedJob, requireQuiescentInstallation,
} from '../shared/managed-daemon-installation.js';
import type { ManagedInstallation } from '../shared/managed-daemon-installation.js';
import {
	COMPATIBILITY_RECEIPT, COMPATIBILITY_STEP, requireQualifiedReleasePair, verifyQuiescedReleaseStores,
} from './release-compatibility.js';
import type { QualifiedReleasePair, ReleaseCompatibility } from './release-compatibility.js';
import { giveLegacyRunGuard, settleLegacyRunGuard } from './legacy-run-guard.js';

type Update = Extract<MutationReservation, { kind: 'update' }>;
type Gate = Pick<InstallationMutationGate, 'admit' | 'recordIntent' | 'recordReceipt'>;

export interface ManagedUpdatePins {
	readonly prior: ManagedInstallation;
	readonly candidate: ManagedInstallation;
	readonly compatibility: QualifiedReleasePair;
	readonly releaseQualification?: Omit<AdmittedReleaseQualification, 'updateId'>;
}

/** Recheck signed raw pins at the live mutation boundary. The prior may have been archived. */
export async function verifyManagedUpdateInventory(pins: ManagedUpdatePins, priorRoot = pins.prior.releaseRoot): Promise<void> {
	const proof = pins.releaseQualification;
	if (proof === undefined) return;
	if (await measureManagedReleaseInventory(priorRoot, pins.prior.runtime) !== proof.priorFingerprint
		|| await measureManagedReleaseInventory(pins.candidate.releaseRoot, pins.candidate.runtime) !== proof.candidateFingerprint) {
		throw new Error('pinned runtime inventory changed before cutover');
	}
}

export function qualifyManagedUpdate(
	prior: ManagedInstallation, candidate: ManagedInstallation, priorProfile: ReleaseCompatibility,
	candidateProfile: ReleaseCompatibility, qualified: readonly QualifiedReleasePair[],
): ManagedUpdatePins {
	if (!prior.enabled || !candidate.enabled || prior.stateRoot !== candidate.stateRoot
		|| prior.releaseRoot === candidate.releaseRoot || prior.releaseId !== priorProfile.releaseId
		|| candidate.releaseId !== candidateProfile.releaseId) {
		throw new Error('update must name two pinned releases for the same enabled installation');
	}
	return { prior, candidate, compatibility: requireQualifiedReleasePair(priorProfile, candidateProfile, qualified) };
}

export interface HandoffEffects {
	readonly connect: (installation: ManagedInstallation) => Promise<ManagedSupervisorLink>;
	readonly remove: typeof removeManagedJob;
	readonly select: typeof publishManagedSelector;
	readonly register: typeof registerManagedJob;
	readonly inspectStores: (pins: ManagedUpdatePins, guard?: RunFileGuard) => Promise<void>;
}

export async function connectManagedSupervisor(installation: ManagedInstallation): Promise<ManagedSupervisorLink> {
	const deadline = performance.now() + 4_000;
	for (;;) {
		try { return await openManagedSupervisorLink(installation); }
		catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (performance.now() >= deadline || !['ENOENT', 'ECONNREFUSED'].includes(code ?? '')) throw error;
			await delay(100);
		}
	}
}

const effects: HandoffEffects = {
	connect: connectManagedSupervisor,
	async remove(installation, revalidate) {
		await requireQuiescentInstallation(installation);
		return removeManagedJob(installation, revalidate);
	},
	select: publishManagedSelector,
	register: registerManagedJob,
	async inspectStores({ prior, candidate, compatibility }, guard) {
		await requireQuiescentInstallation(prior, guard);
		await requireQuiescentInstallation(candidate, guard);
		// The detached daemon updater owns the stopped store for this inspection.
		const { declareLiveStoreOwner } = await import('../db/graph/store.js');
		declareLiveStoreOwner();
		await verifyQuiescedReleaseStores(prior.stateRoot, compatibility);
		guard?.assertOwned();
	},
};

export async function waitForGeneration(
	link: ManagedSupervisorLink, generation: string, expected: 'exited' | 'running', milliseconds: number,
): Promise<Extract<SupervisorReply, { ok: true }>> {
	const until = performance.now() + milliseconds;
	for (;;) {
		const status = accepted(await link.call({ op: 'status', generation }));
		if (status.generation !== generation) throw new Error('supervisor returned an unrelated generation');
		if (status.state === expected || status.state === 'exited') return status;
		if (performance.now() >= until) throw new Error(`supervisor did not verify generation ${expected}`);
		await delay(125);
	}
}

export interface HandoffReceipt {
	readonly job: NonNullable<Awaited<ReturnType<typeof registerManagedJob>>>;
	readonly generation: string | null;
}

export async function recordManagedUpdatePins(
	gate: Gate & Partial<Pick<InstallationMutationGate, 'admitReleaseQualification'>>, update: Update, pins: ManagedUpdatePins,
): Promise<void> {
	const { prior, candidate, compatibility } = pins;
	const { predecessor } = update;
	if (predecessor.priorRelease !== prior.releaseId || predecessor.candidateRelease !== candidate.releaseId
		|| (predecessor.pins !== undefined && JSON.stringify(predecessor.pins) !== JSON.stringify({ prior, candidate }))) {
		throw new Error('update reservation does not match pinned releases');
	}
	await gate.admit(update);
	const compatibilityIntent = JSON.stringify(compatibility);
	if (pins.releaseQualification !== undefined) {
		if (gate.admitReleaseQualification === undefined) throw new Error('signed release admission is unavailable');
		if (pins.releaseQualification.qualification.compatibilityDigest !== releaseMetadataDigest(Buffer.from(compatibilityIntent))) {
			throw new Error('writable formats differ from the signed qualification');
		}
		await gate.admitReleaseQualification(update, { updateId: update.id, ...pins.releaseQualification });
	}
	await gate.recordIntent(update, 'release-pins', JSON.stringify({ prior, candidate }));
	await gate.recordReceipt(update, 'release-pins', 'pinned for this transaction');
	await gate.recordIntent(update, COMPATIBILITY_STEP, compatibilityIntent);
	await gate.recordReceipt(update, COMPATIBILITY_STEP, COMPATIBILITY_RECEIPT);
}

/** The acknowledged update owner runs this phase. A later phase commits or recovers its durable receipts. */
export async function stageManagedUpdate(
	gate: Gate, update: Update, pins: ManagedUpdatePins, operations: HandoffEffects = effects,
): Promise<HandoffReceipt> {
	const { prior } = pins;
	const { predecessor } = update;
	const revalidate = async () => { await gate.admit(update); };
	const intent = (step: string, detail: string) => gate.recordIntent(update, step, detail);
	const receipt = (step: string, detail: string) => gate.recordReceipt(update, step, detail);
	await recordManagedUpdatePins(gate, update, pins);

	const previous = await operations.connect(prior);
	try {
		const status = accepted(await previous.call({ op: 'status', generation: null }));
		if ((predecessor.wasRunning && (status.state !== 'running' || status.generation === null))
			|| (!predecessor.wasRunning && status.state !== 'idle' && status.state !== 'exited')
			|| (predecessor.generation !== undefined && predecessor.generation !== status.generation)) {
			throw new Error('predecessor state changed after update reservation');
		}
		await verifyManagedUpdateInventory(pins);
		await intent('predecessor-stop', JSON.stringify({ generation: status.generation, state: status.state }));
		let stopped = status;
		if (status.state === 'running' && status.generation !== null) {
			await revalidate();
			const stop = accepted(await previous.call({ op: 'stop', generation: status.generation, updateId: update.id }));
			stopped = stop.state === 'exited' ? stop : await waitForGeneration(previous, status.generation, 'exited', 40_000);
			if (stopped.generation !== status.generation || stopped.exit === undefined) throw new Error('predecessor exit is unconfirmed');
		}
		await receipt('predecessor-stop', JSON.stringify({ generation: stopped.generation, state: stopped.state, exit: stopped.exit }));
	} finally { previous.close(); }

	await intent('predecessor-job-removal', prior.releaseId);
	const removed = await operations.remove(prior, revalidate);
	if (removed === undefined) throw new Error('predecessor job disappeared before exact removal was verified');
	await receipt('predecessor-job-removal', JSON.stringify({ removed, absent: true }));
	return stageManagedCandidate(gate, update, pins, operations);
}

export async function stageManagedCandidate(
	gate: Gate, update: Update, pins: ManagedUpdatePins, operations = effects, guard?: RunFileGuard,
): Promise<HandoffReceipt> {
	const { candidate } = pins;
	const revalidate = async () => { await gate.admit(update); };
	const intent = (step: string, detail: string) => gate.recordIntent(update, step, detail);
	const receipt = (step: string, detail: string) => gate.recordReceipt(update, step, detail);
	await revalidate();
	await operations.inspectStores(pins, guard);
	await intent('provisional-selector', candidate.releaseId);
	if (update.predecessor.selectorAbsent) {
		await installFreshSelectorMember(candidate, 'descriptor', update.id, revalidate);
		await installFreshSelectorMember(candidate, 'manifest', update.id, revalidate);
	} else await operations.select(candidate, revalidate);
	await receipt('provisional-selector', candidate.releaseId);

	await intent('candidate-job', candidate.releaseId);
	const job = await operations.register(candidate, revalidate);
	await receipt('candidate-job', JSON.stringify(job ?? null));
	if (job === undefined) throw new Error('candidate launch job is absent after registration');
	const link = await operations.connect(candidate);
	try {
		const idle = accepted(await link.call({ op: 'status', generation: null }));
		if (idle.state !== 'idle' || idle.generation !== null) throw new Error('candidate supervisor is not idle after handshake');
		if (guard !== undefined) {
			if (job.incarnation === undefined) throw new Error('candidate supervisor lacks an authenticated incarnation');
			await giveLegacyRunGuard(gate, update, candidate.stateRoot, job.incarnation);
		}
		if (!update.predecessor.wasRunning) {
			if (guard !== undefined) await settleLegacyRunGuard(gate, update, candidate.stateRoot);
			return { job, generation: null };
		}
		await intent('candidate-start', candidate.releaseId);
		await revalidate();
		const started = accepted(await link.call({ op: 'start', generation: null, updateId: update.id }));
		if (started.generation === null) throw new Error('candidate supervisor returned no generation');
		const ready = started.state === 'running' ? started : await waitForGeneration(link, started.generation, 'running', 70_000);
		if (ready.state !== 'running') {
			await receipt('candidate-start', JSON.stringify({ generation: started.generation, state: ready.state, exit: ready.exit }));
			throw new Error('candidate exited before probation readiness');
		}
		await receipt('candidate-start', JSON.stringify({ generation: started.generation, state: ready.state }));
		return { job, generation: started.generation };
	} finally { link.close(); }
}
