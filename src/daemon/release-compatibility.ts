/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { recordedReleaseQualification } from '../shared/installation-mutation-gate.js';
import { releaseMetadataDigest } from '../shared/managed-release-trust.js';
import type { MutationReservation } from '../shared/installation-mutation-gate.js';

import { readReleaseCompatibility, sameReleaseFormats as sameFormats } from '../shared/source-release-compatibility.js';
import type { QualifiedReleasePair } from '../shared/source-release-compatibility.js';
export { readReleaseCompatibility, readTaggedReleaseCompatibility, requireQualifiedReleasePair } from '../shared/source-release-compatibility.js';
export type { ReleaseCompatibility, QualifiedReleasePair } from '../shared/source-release-compatibility.js';

export const COMPATIBILITY_STEP = 'release-compatibility';
export const COMPATIBILITY_RECEIPT = 'qualified';

function object(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read the exact pair the update owner qualified before displacing the predecessor. */
export function qualifiedPairFromReservation(reservation: Extract<MutationReservation, { kind: 'update' }>): QualifiedReleasePair {
	const admitted = recordedReleaseQualification(reservation);
	const step = reservation.entries.find(entry => entry.step === COMPATIBILITY_STEP);
	if (step?.receipt !== COMPATIBILITY_RECEIPT) throw new Error('update lacks durable release qualification');
	if (admitted !== undefined && admitted.qualification.compatibilityDigest !== releaseMetadataDigest(Buffer.from(step.intent))) {
		throw new Error('durable writable formats differ from the signed qualification');
	}
	const value: unknown = JSON.parse(step.intent);
	if (!object(value)) throw new Error('invalid release qualification');
	const prior = readReleaseCompatibility(value.prior);
	const candidate = readReleaseCompatibility(value.candidate);
	if (prior.releaseId === candidate.releaseId || prior.releaseId !== reservation.predecessor.priorRelease
		|| candidate.releaseId !== reservation.predecessor.candidateRelease) {
		throw new Error('release qualification does not match the update');
	}
	if (!sameFormats(prior, candidate)) throw new Error('release pair would change a writable format');
	return { prior, candidate };
}

/** Run under exclusive update admission after verified predecessor exit. */
export async function verifyQuiescedReleaseStores(stateRoot: string, pair: QualifiedReleasePair): Promise<void> {
	const { inspectQuiescedGraphSchema } = await import('../db/graph/store.js');
	const version = await inspectQuiescedGraphSchema(join(stateRoot, 'graph.lmdb'));
	if (version !== pair.prior.graphSchema || version !== pair.candidate.graphSchema) {
		throw new Error('quiesced graph schema does not match the qualified release pair');
	}

	const lance = join(stateRoot, 'lance');
	if (!(await lstat(lance)).isDirectory()) throw new Error('quiesced Lance store is not an existing directory');
	const { connect } = await import('@lancedb/lancedb');
	const connection = await connect(lance, { readConsistencyInterval: 0 });
	try {
		for (const name of await connection.tableNames()) {
			const table = await connection.openTable(name);
			try { await table.schema(); }
			finally { table.close(); }
		}
	} finally { connection.close(); }
}
