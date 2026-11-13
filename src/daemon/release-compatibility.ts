/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { recordedReleaseQualification } from '../shared/installation-mutation-gate.js';
import { releaseMetadataDigest } from '../shared/managed-release-trust.js';
import type { MutationReservation } from '../shared/installation-mutation-gate.js';

const FORMAT_KEYS = ['lance', 'repoAndIndexQueue', 'config', 'workflowAndSession'] as const;
export const COMPATIBILITY_STEP = 'release-compatibility';
export const COMPATIBILITY_RECEIPT = 'qualified';

export interface ReleaseCompatibility {
	readonly version: 1;
	readonly releaseId: string;
	readonly graphSchema: number;
	readonly formats: Readonly<Record<(typeof FORMAT_KEYS)[number], string>>;
	readonly startup: 'rollback-compatible';
}

/** An ordered pair explicitly qualified against the shipped release declarations. */
export interface QualifiedReleasePair {
	readonly prior: ReleaseCompatibility;
	readonly candidate: ReleaseCompatibility;
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readReleaseCompatibility(value: unknown): ReleaseCompatibility {
	if (!object(value) || value.version !== 1 || typeof value.releaseId !== 'string'
		|| !/^[a-zA-Z0-9._-]+$/.test(value.releaseId)
		|| typeof value.graphSchema !== 'number' || !Number.isSafeInteger(value.graphSchema) || value.graphSchema < 1
		|| value.startup !== 'rollback-compatible' || !object(value.formats)) {
		throw new Error('unknown or migration-bearing release compatibility declaration');
	}
	const formats = value.formats;
	if (Object.keys(formats).length !== FORMAT_KEYS.length || FORMAT_KEYS.some(key =>
		typeof formats[key] !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(formats[key]))) {
		throw new Error('release compatibility declaration is missing a known writable format');
	}
	return value as unknown as ReleaseCompatibility;
}

function sameFormats(left: ReleaseCompatibility, right: ReleaseCompatibility): boolean {
	return left.graphSchema === right.graphSchema
		&& FORMAT_KEYS.every(key => left.formats[key] === right.formats[key]);
}

/** The caller supplies qualifications from trusted release metadata, never from the candidate. */
export function requireQualifiedReleasePair(
	prior: ReleaseCompatibility, candidate: ReleaseCompatibility, qualified: readonly QualifiedReleasePair[],
): QualifiedReleasePair {
	if (prior.releaseId === candidate.releaseId) throw new Error('update must identify distinct pinned releases');
	if (!sameFormats(prior, candidate)) throw new Error('release pair would change a writable format');
	if (!qualified.some(pair => pair.prior.releaseId === prior.releaseId && pair.candidate.releaseId === candidate.releaseId
		&& sameFormats(pair.prior, prior) && sameFormats(pair.candidate, candidate))) {
		throw new Error('release pair is not qualified for rollback');
	}
	return { prior, candidate };
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
