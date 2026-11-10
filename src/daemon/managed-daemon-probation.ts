/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { setTimeout as delay } from 'node:timers/promises';
import { realpath } from 'node:fs/promises';
import { getDb } from '../db/client.js';
import { SCHEMA_VERSION } from '../db/graph/store.js';
import { IndexerService } from '../indexer/index.js';
import { Watcher } from '../indexer/watcher.js';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import { PATHS } from '../shared/paths.js';
import type { DaemonStatus } from '../shared/types.js';
import { writePid } from './lifecycle.js';
import type { ManagedDaemonLifecycle } from './managed-daemon-lifecycle.js';
import { IndexQueue } from './queue.js';
import { qualifiedPairFromReservation, verifyQuiescedReleaseStores } from './release-compatibility.js';
import { directDispatch, IpcServer } from './server.js';
import type { ForwardRequest } from './server.js';
import { readUpdateOutcome } from './update-runner.js';

export interface DaemonProbation {
	readonly server: IpcServer;
	waitForCommit(): Promise<void>;
	activate(forward: ForwardRequest): void;
}

/** Called only after the inherited supervisor grants startup run-file ownership. */
export async function startManagedDaemonProbation(
	managed: Pick<ManagedDaemonLifecycle, 'assertProbationActive'>,
): Promise<DaemonProbation | undefined> {
	const updateId = process.env['INSRC_PROBATION_UPDATE'];
	const releaseId = process.env['INSRC_PROBATION_RELEASE'];
	if (updateId === undefined && releaseId === undefined) return undefined;
	const gate = new InstallationMutationGate(await realpath(PATHS.insrc));
	const { active, outcome } = await gate.read();
	if (updateId === undefined || releaseId === undefined || active?.kind !== 'update' || active.id !== updateId
		|| active.predecessor.candidateRelease !== releaseId || outcome?.id === updateId) {
		throw new Error('candidate startup lacks matching update admission');
	}
	const pair = qualifiedPairFromReservation(active);
	if (pair.candidate.graphSchema !== SCHEMA_VERSION) throw new Error('candidate graph code disagrees with release qualification');
	await verifyQuiescedReleaseStores(PATHS.insrc, pair);

	// Initialize the actual indexing components without opening watchers,
	// reconciling vectors or starting a queue drain. Normal boot owns those.
	const queue = new IndexQueue();
	await queue.pause();
	const indexer = new IndexerService(await getDb(), queue, new Watcher());
	indexer.disposeSubsystemScheduler();

	const startedAt = Date.now();
	const probationStatus = async (): Promise<DaemonStatus> => ({
		uptime: Math.floor((Date.now() - startedAt) / 1000),
		repos: [], queueDepth: 0, embeddingsPending: 0,
		installedCommit: active.predecessor.priorCommit,
	});
	let forward = directDispatch({
		'daemon.status': probationStatus,
		'daemon.updateOutcome': async () => readUpdateOutcome(),
	});
	const server = new IpcServer((request, deliver) => forward(request, deliver));
	writePid();
	await server.listen();

	return {
		server,
		async waitForCommit() {
			for (;;) {
				managed.assertProbationActive();
				const journal = await gate.read();
				if (journal.outcome?.id === updateId) {
					if (journal.outcome.decision === 'committed') return;
					throw new Error('probation update did not commit');
				}
				if (journal.active?.id !== updateId) throw new Error('probation lost its update admission');
				await delay(100);
			}
		},
		activate(normalForward) { forward = normalForward; },
	};
}
