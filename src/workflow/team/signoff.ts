/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Signoff decisions (Story s7, HLD contract sc5).
 *
 * This part is pure over an injected policy and the heads it is given: which stage an attempt follows, whether a head
 * counts as signed off (or grandfathered), what a head's signoff looks like, and the SignoffRecord derived from the heads'
 * lifecycle facts. No stored stamp is read or written: the facts are in each head's `meta.lifecycle.signoffs`.
 */

import { existsSync, readFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import type { Reference } from '../artifact-core/types.js';
import { approvedAtOf, lifecycleOfMeta } from '../artifact-core/approval-view.js';
import { artifactJsonPath, buildArtifactId, defineArtifactId, hldArtifactId, lldArtifactId } from '../storage.js';
import type { SignoffRequestRef } from '../tracker/port.js';
import type { UnitRef } from '../tracker/refs.js';
import type { GuardedAction } from './gate.js';
import { policyReader } from './policy-reader.js';
import type { PolicyResult, SignoffStage, TeamPolicy } from './types.js';

const log = getLogger('team-signoff');

/** The stage a next attempt follows, and the unit whose artifacts hold it. */
export interface FollowedStage {
	readonly stage: Exclude<SignoffStage, 'BUILD'>;
	readonly unit:  UnitRef;
}

/**
 * Which signed-off stage does this attempt follow? Author design.epic follows DEF on the epic; author design.story follows the
 * HLD on the epic of the story; author plan and build follow the LLD on the story (a task's build follows its Story's LLD).
 * Anything else follows nothing, including every attempt that would follow a BUILD.
 */
export function followedStageOf(action: GuardedAction, authoring: string | undefined, unit: UnitRef): FollowedStage | null {
	const epic: UnitRef = { unit: 'epic', repoPath: unit.repoPath, epicHash: unit.epicHash };
	if (action === 'author') {
		if (authoring === 'design.epic' && unit.unit === 'epic') return { stage: 'DEF', unit: epic };
		if (authoring === 'design.story' && unit.storyId !== undefined) return { stage: 'HLD', unit: epic };
		if (authoring === 'plan' && unit.storyId !== undefined) return { stage: 'LLD', unit: storyOf(unit, unit.storyId) };
		return null;
	}
	if (action === 'build' && unit.storyId !== undefined) return { stage: 'LLD', unit: storyOf(unit, unit.storyId) };
	return null;
}

const storyOf = (unit: UnitRef, storyId: string): UnitRef => ({ unit: 'story', repoPath: unit.repoPath, epicHash: unit.epicHash, storyId });

/**
 * Does this head count as signed off? It does when it is signed off, or completed (completion freezes a unit's members, and a
 * listed member only completes once it is signed off or grandfathered), or, when the policy anchor is known, when it was
 * approved before the policy first appeared on the default branch. With the anchor unknown nothing is grandfathered.
 */
export function isSignedOffOrGrandfathered(policy: TeamPolicy, meta: unknown): boolean {
	const status = lifecycleOfMeta(meta)?.['status'];
	if (status === 'signed-off' || status === 'completed') return true;
	return isGrandfathered(policy, meta);
}

/** Approved before the policy anchor, with the anchor known. */
export function isGrandfathered(policy: TeamPolicy, meta: unknown): boolean {
	if (!policy.source.anchorKnown) return false;
	const approvedAt = approvedAtOf(meta);
	if (approvedAt === undefined) return false;
	const approved = Date.parse(approvedAt);
	const anchor = Date.parse(policy.source.firstCommitTime);
	return Number.isFinite(approved) && Number.isFinite(anchor) && approved < anchor;
}

// ---------------------------------------------------------------------------
// The request Reference stored on each Signoff
// ---------------------------------------------------------------------------

/** The type every stored request Reference carries. */
export const SIGNOFF_REFERENCE_TYPE = 'signoff-request';

/** The Reference stored on a Signoff for a request: an existing relation, so the Reference type is unchanged. */
export function signoffReferenceOf(request: SignoffRequestRef): Reference {
	return { entityId: request.ref, type: SIGNOFF_REFERENCE_TYPE, relation: 'tracked-by' };
}

/** The request a stored Reference names, or null when it is not a request Reference. */
export function signoffRefOf(reference: Reference): SignoffRequestRef | null {
	if (reference.type !== SIGNOFF_REFERENCE_TYPE || reference.entityId.length === 0) return null;
	return { ref: reference.entityId };
}

// ---------------------------------------------------------------------------
// What a head says about its signoff
// ---------------------------------------------------------------------------

export type SignoffViewState = 'none' | 'open' | 'changes-requested' | 'completed';

export interface SignoffView {
	readonly state:    SignoffViewState;
	readonly request:  SignoffRequestRef | null;
	readonly revision: number | null;
}

const NO_SIGNOFF: SignoffView = { state: 'none', request: null, revision: null };

/** One Signoff entry of a head, as stored. */
interface StoredSignoff { readonly revision: number; readonly request: Reference; readonly state: SignoffViewState; readonly at: string }

function signoffsOfMeta(meta: unknown): readonly StoredSignoff[] {
	const raw = lifecycleOfMeta(meta)?.['signoffs'];
	if (!Array.isArray(raw)) return [];
	const out: StoredSignoff[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item === null) continue;
		const s = item as Record<string, unknown>;
		const request = s['request'] as Reference | undefined;
		if (typeof s['revision'] !== 'number' || typeof request !== 'object' || request === null) continue;
		if (s['state'] !== 'open' && s['state'] !== 'changes-requested' && s['state'] !== 'completed') continue;
		out.push({ revision: s['revision'], request, state: s['state'], at: typeof s['at'] === 'string' ? s['at'] : '' });
	}
	return out;
}

/** The revision number of the head's lifecycle, or undefined. */
function revisionOfMeta(meta: unknown): number | undefined {
	const revision = lifecycleOfMeta(meta)?.['revision'];
	const n = typeof revision === 'object' && revision !== null ? (revision as Record<string, unknown>)['number'] : undefined;
	return typeof n === 'number' ? n : undefined;
}

/** The signoff the head carries for its current revision, shown apart from its review and approval; never counted as a review. */
export function signoffViewOf(meta: unknown): SignoffView {
	const current = revisionOfMeta(meta);
	if (current === undefined) return NO_SIGNOFF;
	let found: StoredSignoff | undefined;
	for (const s of signoffsOfMeta(meta)) if (s.revision === current && signoffRefOf(s.request) !== null) found = s;
	if (found === undefined) return NO_SIGNOFF;
	return { state: found.state, request: signoffRefOf(found.request), revision: found.revision };
}

// ---------------------------------------------------------------------------
// sc5: the SignoffRecord, derived from the heads
// ---------------------------------------------------------------------------

/** sc5. `request.ref` is empty for a record that rests on grandfathering alone. */
export interface SignoffRecord {
	readonly request:        SignoffRequestRef;
	readonly artifacts:      ReadonlyArray<{ readonly artifactId: string; readonly revision: number }>;
	readonly completedAt:    string;
	readonly grandfathered?: boolean;
}

/** A head as read from its file: the id and its `meta`. */
export interface HeadMeta { readonly artifactId: string; readonly meta: unknown }

/**
 * The records of some heads: one per completed request, grouping the artifacts it covered, and one per head that counts only by
 * grandfathering. A Signoff whose Reference is not a request Reference is skipped and logged.
 */
export function signoffRecordsFromHeads(policy: TeamPolicy, heads: readonly HeadMeta[]): SignoffRecord[] {
	const byRequest = new Map<string, { artifacts: Array<{ artifactId: string; revision: number }>; completedAt: string }>();
	const records: SignoffRecord[] = [];
	for (const head of heads) {
		let covered = false;
		for (const s of signoffsOfMeta(head.meta)) {
			if (s.state !== 'completed') continue;
			const request = signoffRefOf(s.request);
			if (request === null) { log.warn({ artifactId: head.artifactId }, 'a signoff names no request; skipped'); continue; }
			covered = true;
			const group = byRequest.get(request.ref) ?? { artifacts: [], completedAt: s.at };
			if (!group.artifacts.some(a => a.artifactId === head.artifactId && a.revision === s.revision)) group.artifacts.push({ artifactId: head.artifactId, revision: s.revision });
			if (s.at > group.completedAt) group.completedAt = s.at;
			byRequest.set(request.ref, group);
		}
		if (!covered && isGrandfathered(policy, head.meta)) {
			records.push({ request: { ref: '' }, artifacts: [{ artifactId: head.artifactId, revision: revisionOfMeta(head.meta) ?? 0 }], completedAt: approvedAtOf(head.meta) ?? '', grandfathered: true });
		}
	}
	for (const [ref, group] of byRequest) records.unshift({ request: { ref }, artifacts: group.artifacts, completedAt: group.completedAt });
	return records;
}

// ---------------------------------------------------------------------------
// Reading a unit's heads
// ---------------------------------------------------------------------------

/** The stages whose artifacts a unit holds: the epic holds DEF and HLD, a story holds LLD and its BUILD (the BUILD record is Story-scoped). */
export function stagesOfUnit(unit: UnitRef): readonly SignoffStage[] {
	return unit.unit === 'epic' ? ['DEF', 'HLD'] : unit.unit === 'story' ? ['LLD', 'BUILD'] : [];
}

/** The artifact id of a stage of a unit, or undefined when the unit holds no such stage. */
export function stageArtifactId(unit: UnitRef, stage: SignoffStage): string | undefined {
	if (unit.unit === 'epic') return stage === 'DEF' ? defineArtifactId(unit.epicHash) : stage === 'HLD' ? hldArtifactId(unit.epicHash) : undefined;
	if (unit.unit === 'story' && unit.storyId !== undefined) return stage === 'LLD' ? lldArtifactId(unit.epicHash, unit.storyId) : stage === 'BUILD' ? buildArtifactId(unit.epicHash, unit.storyId) : undefined;
	return undefined;
}

/** What reading a unit's heads and the policy needs, injectable for tests. */
export interface SignoffDeps {
	readonly readPolicy?: ((repo: string) => PolicyResult<TeamPolicy | 'none'>) | undefined;
	readonly readHead?:   ((repo: string, artifactId: string) => unknown | undefined) | undefined;
}

/** A head's `meta` read from the artifact store file; undefined when the file is absent or unreadable. */
export function readHeadMeta(repo: string, artifactId: string): unknown | undefined {
	const path = artifactJsonPath(repo, artifactId);
	if (!existsSync(path)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as { meta?: unknown };
		return parsed.meta;
	} catch (err) {
		log.warn({ artifactId, err: err instanceof Error ? err.message : String(err) }, 'a head could not be read');
		return undefined;
	}
}

/** The heads of the stages a unit holds that exist on disk. */
export function headsOfUnit(repo: string, unit: UnitRef, deps: SignoffDeps = {}): HeadMeta[] {
	const read = deps.readHead ?? readHeadMeta;
	const heads: HeadMeta[] = [];
	for (const stage of stagesOfUnit(unit)) {
		const artifactId = stageArtifactId(unit, stage);
		if (artifactId === undefined) continue;
		const meta = read(repo, artifactId);
		if (meta !== undefined) heads.push({ artifactId, meta });
	}
	return heads;
}

/** The SignoffRecords of a unit's heads (none outside team mode or with no policy). */
export function signoffRecordsOf(repo: string, unit: UnitRef, deps: SignoffDeps = {}): SignoffRecord[] {
	const policy = (deps.readPolicy ?? policyReader)(repo);
	if (!policy.ok || policy.value === 'none') return [];
	return signoffRecordsFromHeads(policy.value, headsOfUnit(repo, unit, deps));
}
