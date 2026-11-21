/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { readSourceReleaseTarget } from './source-release-target.js';
import type { SourceReleaseTarget } from './source-release-target.js';

const FORMAT_KEYS = ['lance', 'repoAndIndexQueue', 'config', 'workflowAndSession'] as const;

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

export function sameReleaseFormats(left: ReleaseCompatibility, right: ReleaseCompatibility): boolean {
	return left.graphSchema === right.graphSchema
		&& FORMAT_KEYS.every(key => left.formats[key] === right.formats[key]);
}

const LAUNCH_PROFILES = new Set(['managed', 'legacy-direct', 'legacy-stopped', 'legacy-shell-job', 'legacy-node-job']);
const LINUX_LAUNCH_PROFILES = new Set(['linux-source-running', 'linux-source-stopped']);

/** The verified source tree owns the exact predecessor declarations and permitted launch profiles. */
export function readTaggedReleaseCompatibility(value: unknown, priorCommit: string, candidateCommit: string,
	target: SourceReleaseTarget = 'darwin',
) {
	readSourceReleaseTarget(target);
	if (target !== 'darwin' && (!object(value) || value.target !== target)) {
		throw new Error('signed source compatibility does not name the requested Linux target');
	}
	const profiles = target === 'darwin' ? LAUNCH_PROFILES : LINUX_LAUNCH_PROFILES;
	if (!object(value) || value.version !== 1 || !object(value.candidate) || !object(value.predecessors)
		|| Object.hasOwn(value.candidate, 'releaseId') || !Object.hasOwn(value.predecessors, priorCommit)) {
		throw new Error('signed source does not declare compatibility with the installed commit');
	}
	const predecessor = value.predecessors[priorCommit];
	if (!object(predecessor) || !object(predecessor.declaration) || Object.hasOwn(predecessor.declaration, 'releaseId')
		|| predecessor.crashConsistentReopening !== true || !Array.isArray(predecessor.launchProfiles)
		|| predecessor.launchProfiles.length === 0 || new Set(predecessor.launchProfiles).size !== predecessor.launchProfiles.length
		|| !predecessor.launchProfiles.every((item: unknown) => typeof item === 'string' && profiles.has(item))) {
		throw new Error('signed source does not qualify crash-consistent reopening for the installed commit');
	}
	const prior = readReleaseCompatibility({ ...predecessor.declaration, releaseId: priorCommit });
	const candidate = readReleaseCompatibility({ ...value.candidate, releaseId: candidateCommit });
	return { ...requireQualifiedReleasePair(prior, candidate, [{ prior, candidate }]),
		launchProfiles: predecessor.launchProfiles as readonly string[] };
}

/** The caller supplies qualifications from trusted release metadata, never from the candidate. */
export function requireQualifiedReleasePair(
	prior: ReleaseCompatibility, candidate: ReleaseCompatibility, qualified: readonly QualifiedReleasePair[],
): QualifiedReleasePair {
	if (prior.releaseId === candidate.releaseId) throw new Error('update must identify distinct pinned releases');
	if (!sameReleaseFormats(prior, candidate)) throw new Error('release pair would change a writable format');
	if (!qualified.some(pair => pair.prior.releaseId === prior.releaseId && pair.candidate.releaseId === candidate.releaseId
		&& sameReleaseFormats(pair.prior, prior) && sameReleaseFormats(pair.candidate, candidate))) {
		throw new Error('release pair is not qualified for rollback');
	}
	return { prior, candidate };
}

