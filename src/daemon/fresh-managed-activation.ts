/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { accepted, openManagedSupervisorLink } from '../cli/services/managed-daemon-control.js';
import type { ManagedSupervisorLink } from '../cli/services/managed-daemon-control.js';
import { matchesDarwinPeer, readDarwinIncarnation } from '../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { SupervisorLifecycleError } from '../shared/daemon-supervisor-protocol.js';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import type { FreshActivation, MutationReservation } from '../shared/installation-mutation-gate.js';
import {
	ensureManagedJob, inspectManagedJob, installFreshSelectorMember, readInstallationSelector,
	removeFreshSelectorMember, removeManagedJob, requireQuiescentInstallation, verifyFreshSelectorOwnership,
	verifyManagedReleaseRuntime, verifyManagedSelectorFiles,
} from '../shared/managed-daemon-installation.js';
import type { ManagedInstallation } from '../shared/managed-daemon-installation.js';
import { verifyStagedReleasePin } from './managed-release-staging.js';

function conflict(message: string): never {
	throw new SupervisorLifecycleError('ownership-conflict', message);
}

type Active = Extract<MutationReservation, { kind: 'start' }>;

async function connect(installation: ManagedInstallation): Promise<ManagedSupervisorLink> {
	const deadline = performance.now() + 5_000;
	for (;;) {
		try { return await openManagedSupervisorLink(installation); }
		catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (performance.now() >= deadline || !['supervisor-unavailable', 'ENOENT', 'ECONNREFUSED'].includes(code ?? '')) throw error;
			await delay(100);
		}
	}
}

async function verifyRequestedState(link: ManagedSupervisorLink, startChild: boolean) {
	let status = accepted(await link.call({ op: 'status', generation: null }));
	if (!startChild) {
		if (status.state !== 'idle' || status.generation !== null) conflict('fresh no-start installation is not idle');
		return status;
	}
	if (status.state === 'idle' || status.state === 'exited') {
		status = accepted(await link.call({ op: 'start', generation: status.generation }));
	}
	if (status.generation === null) conflict('supervisor did not admit a daemon generation');
	const generation = status.generation;
	const deadline = performance.now() + 70_000;
	while (status.state === 'starting' && performance.now() < deadline) {
		await delay(100);
		status = accepted(await link.call({ op: 'status', generation }));
	}
	if (status.state === 'exited' && status.generation === generation && status.exit !== undefined) {
		throw new SupervisorLifecycleError('daemon-exit-failed', 'fresh daemon exited before readiness', generation, status.exit);
	}
	if (status.state !== 'running' || status.generation !== generation) conflict('fresh daemon readiness is unconfirmed');
	return status;
}

/** Re-run an interrupted fresh installation using the same pinned intent. */
export async function activateFreshManagedDaemon(activation: FreshActivation): Promise<void> {
	const { installation, startChild } = activation;
	const gate = new InstallationMutationGate(installation.stateRoot);
	await verifyManagedReleaseRuntime(installation);
	const owner = await readDarwinIncarnation(process.pid);
	const journal = await gate.read();
	let reservation: Active;
	if (journal.active === null) {
		if (await readInstallationSelector(installation.stateRoot) !== undefined
			|| await inspectManagedJob(installation) !== undefined) conflict('fresh activation requires an unused installation');
		await requireQuiescentInstallation(installation);
		const active = await gate.reserve({ kind: 'start', owner, activation });
		if (active.kind !== 'start') conflict('unexpected fresh activation reservation');
		reservation = active;
	} else {
		const previous = journal.active;
		if (previous.kind !== 'start' || !isDeepStrictEqual(previous.activation, activation)) {
			conflict('another installation operation owns this root');
		}
		await verifyStagedReleasePin({ root: installation.releaseRoot, runtime: installation.runtime,
			commit: installation.releaseId, fingerprint: activation.fingerprint });
		await gate.claimRecovery(previous.id, owner, async () => {
			await verifyFreshSelectorOwnership(installation, previous.id);
			const job = await inspectManagedJob(installation);
			return job === undefined || previous.entries.some(entry => entry.step === 'activation-job');
		});
		reservation = { ...previous, owner, recovery: true };
	}
	const revalidate = async () => { await gate.admit(reservation); };
	const step = async (name: string, effect: () => Promise<string>) => {
		const active = await gate.admit(reservation);
		const previous = active.entries.find(entry => entry.step === name);
		if (previous?.receipt !== undefined) return;
		if (previous === undefined) await gate.recordIntent(reservation, name, installation.releaseId);
		await gate.recordReceipt(reservation, name, await effect());
	};
	const recordedJob = async () => {
		const receipt = (await gate.admit(reservation)).entries.find(entry => entry.step === 'activation-job')?.receipt;
		return JSON.parse(receipt ?? 'null') as { target: string; incarnation: DarwinIncarnation } | null;
	};
	const rollback = async () => {
		await step('activation-rollback', async () => {
			const job = await inspectManagedJob(installation);
			if (job !== undefined) {
				const pinned = await recordedJob();
				if (pinned === null || pinned.target !== job.target || job.pid === null) {
					conflict('fresh rollback cannot verify the registered supervisor');
				}
				const link = await connect(installation);
				try {
					const status = accepted(await link.call({ op: 'status', generation: null }));
					if (status.state !== 'idle' && status.state !== 'exited') conflict('fresh rollback cannot remove an active generation');
				} finally { link.close(); }
				await requireQuiescentInstallation(installation);
				await removeManagedJob(installation, revalidate, pinned.incarnation);
			}
			await requireQuiescentInstallation(installation);
			await removeFreshSelectorMember(installation, 'manifest', revalidate);
			await removeFreshSelectorMember(installation, 'descriptor', revalidate);
			return 'owned fresh publications removed; prior absence verified';
		});
		await gate.release(reservation);
	};
	if (reservation.entries.some(entry => entry.step === 'activation-rollback')) {
		await rollback();
		throw new Error('interrupted fresh activation rolled back; retry installation');
	}
	try {
		for (const member of ['descriptor', 'manifest'] as const) {
			await step(`activation-${member}`, async () => {
				if (member === 'descriptor') await requireQuiescentInstallation(installation);
				await installFreshSelectorMember(installation, member, reservation.id, revalidate);
				return member;
			});
		}
		await verifyManagedSelectorFiles(installation);
		await step('activation-job', async () => {
			await ensureManagedJob(installation, revalidate, { intent: async () => {}, receipt: async () => {} });
			const job = await inspectManagedJob(installation);
			if (job?.pid == null) conflict('fresh supervisor registration is unconfirmed');
			return JSON.stringify({ target: job.target, incarnation: await readDarwinIncarnation(job.pid) });
		});
		const registered = await inspectManagedJob(installation);
		const pinnedJob = await recordedJob();
		if (registered?.pid == null || pinnedJob === null || registered.target !== pinnedJob.target) {
			conflict('fresh supervisor registration changed after admission');
		}
		const observed = await readDarwinIncarnation(registered.pid);
		if (!matchesDarwinPeer(observed, observed, pinnedJob.incarnation)) conflict('fresh supervisor incarnation changed after admission');
		const link = await connect(installation);
		try {
			await step('activation-state', async () => JSON.stringify(await verifyRequestedState(link, startChild)));
			// Re-read over the authenticated control socket before releasing a recovered receipt.
			const status = accepted(await link.call({ op: 'status', generation: null }));
			const receipt = (await gate.admit(reservation)).entries.find(entry => entry.step === 'activation-state')?.receipt;
			const confirmed = JSON.parse(receipt ?? 'null') as { state?: string; generation?: string | null } | null;
			if (confirmed?.state === 'running' && status.state === 'exited'
				&& status.generation === confirmed.generation && status.exit !== undefined) {
				throw new SupervisorLifecycleError('daemon-exit-failed', 'fresh daemon exited before activation settled', status.generation, status.exit);
			}
			if (status.state !== confirmed?.state || status.generation !== confirmed.generation) {
				conflict('fresh supervisor state changed after readiness was recorded');
			}
			await gate.release(reservation);
		} finally { link.close(); }
	} catch (error) {
		const last = (await gate.admit(reservation)).entries.at(-1);
		// Only a known pre-readiness failure can unwind. Other attempts can resume the original intent.
		if (last?.step === 'activation-state' && error instanceof SupervisorLifecycleError
			&& error.code === 'daemon-exit-failed') {
			if (last.receipt === undefined) await gate.recordReceipt(reservation, last.step, 'candidate exited before readiness');
			await rollback();
		}
		throw error;
	}
}
