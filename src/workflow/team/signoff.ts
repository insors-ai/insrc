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
import { approvalStateOf, approvedAtOf, lifecycleOfMeta, lifecycleReviewOf } from '../artifact-core/approval-view.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId, defineArtifactId, hldArtifactId, lldArtifactId } from '../storage.js';
import type { SignoffRequestRef } from '../tracker/port.js';
import type { UnitRef } from '../tracker/refs.js';
import type { GuardedAction } from './gate.js';
import { ArtifactIds } from '../artifact-ids.js';
import type { LifecycleService } from '../artifact-core/lifecycle-service.js';
import { createRepoLifecycle } from '../artifact-core/repo-lifecycle.js';
import type { Actor } from '../artifact-core/types.js';
import { authorPartyOf, reviewerPartyOf } from '../review/party.js';
import { loadTracker } from '../tracker/github-adapter.js';
import { commitAndPushArtifacts } from '../tracker/github.js';
import type { Capability, IssueRef, PortResult, TrackerPort } from '../tracker/port.js';
import { resolveUnitIssueLocal } from '../tracker/unit-issue.js';
import { registerCompletionHook, TeamGateRefusedError, type GateOutcome } from './gate.js';
import { runGit } from './git.js';
import { pickRemote, policyReader, remoteHeadBranch } from './policy-reader.js';
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
	readonly loadTracker?:   ((repo: string, needed: ReadonlySet<Capability>) => PortResult<TrackerPort>) | undefined;
	/** The issue recorded for a unit, or null. */
	readonly resolveIssue?:  ((unit: UnitRef) => IssueRef | null) | undefined;
	readonly lifecycleFor?:  ((repo: string) => LifecycleService) | undefined;
	/** Commit and push the artifact files and answer the branch that holds them. */
	readonly publishBranch?: ((repo: string, paths: readonly string[], message: string) => PortResult<string>) | undefined;
	/** A Story's code-review record: its verdict and the party that ran it; undefined when there is none. */
	readonly readCodeReview?: ((repo: string, epicHash: string, storyId: string) => CodeReviewRecord | undefined) | undefined;
}

/** What openSignoff needs from a Story's code-review record. */
export interface CodeReviewRecord {
	readonly verdict: string;
	readonly party:   'controller' | 'daemon' | 'unknown';
}

let testDeps: SignoffDeps = {};

/** Test seam: inject the policy reader and the head reader; no argument resets. */
export function _setSignoffDepsForTests(deps: SignoffDeps = {}): void { testDeps = deps; }

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
	const read = deps.readHead ?? testDeps.readHead ?? readHeadMeta;
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
	const policy = (deps.readPolicy ?? testDeps.readPolicy ?? policyReader)(repo);
	if (!policy.ok || policy.value === 'none') return [];
	return signoffRecordsFromHeads(policy.value, headsOfUnit(repo, unit, deps));
}

// ---------------------------------------------------------------------------
// The read-only decision and the completion hook
// ---------------------------------------------------------------------------

/** The team policy when signoff applies at all: team mode with claims enforced; undefined otherwise or when the policy cannot be read. */
function teamPolicyOf(repo: string, deps: SignoffDeps): TeamPolicy | undefined {
	const policy = (deps.readPolicy ?? testDeps.readPolicy ?? policyReader)(repo);
	if (!policy.ok || policy.value === 'none' || !policy.value.teamMode || !policy.value.claimsEnforced) return undefined;
	return policy.value;
}

const refused = (reason: string): GateOutcome => ({ kind: 'refused', reason });

/**
 * Does signoff block this attempt? It judges the attempt by the stage it follows: awaiting-signoff with the open request, a
 * refusal when changes were requested, when the stage was never submitted or when a completed request is not yet recorded;
 * null when nothing blocks (no policy, a stage the policy does not list, no artifact yet, or a head that is signed off or
 * grandfathered). It reads the policy and the followed stage's head and never writes or touches a tracker.
 */
export function blockedBySignoff(repo: string, unit: UnitRef, action: GuardedAction, authoring?: string, deps: SignoffDeps = {}): GateOutcome | null {
	const followed = followedStageOf(action, authoring, unit);
	if (followed === null) return null;
	const policy = teamPolicyOf(repo, deps);
	if (policy === undefined || !policy.signoffStages.includes(followed.stage)) return null;
	const artifactId = stageArtifactId(followed.unit, followed.stage);
	if (artifactId === undefined) return null;
	const meta = (deps.readHead ?? testDeps.readHead ?? readHeadMeta)(repo, artifactId);
	if (meta === undefined || isSignedOffOrGrandfathered(policy, meta)) return null;
	const view = signoffViewOf(meta);
	switch (view.state) {
		case 'open':
			return view.request === null ? null : { kind: 'awaiting-signoff', request: view.request };
		case 'changes-requested':
			return refused(`changes were requested on the signoff request ${view.request?.ref ?? ''} for the ${followed.stage}: revise it and submit it again`);
		case 'completed':
			return refused(`the signoff request ${view.request?.ref ?? ''} for the ${followed.stage} is completed but not yet recorded: settle it first`);
		case 'none':
			return refused(`the ${followed.stage} needs signoff before this can start: submit it for signoff first`);
	}
}

/**
 * The sc4 completion hook: the blockedBySignoff answer for author and build; open-signoff, revise and release always continue,
 * so a submission and its retry never meet the hook's own refusal. The tracker port is not used: the decision is read-only.
 */
export function signoffCompletionHook(repo: string, unit: UnitRef, _port: unknown, action: GuardedAction, authoring?: string): GateOutcome | 'continue' {
	if (action !== 'author' && action !== 'build') return 'continue';
	return blockedBySignoff(repo, unit, action, authoring) ?? 'continue';
}

/** Register the signoff hook in this process; the daemon and the terminal each run the gate, so each registers it. */
export function registerSignoffHook(): void { registerCompletionHook(signoffCompletionHook); }

/**
 * Does signoff hold this unit's completion? True for a Story whose listed LLD or BUILD, or an Epic whose listed DEF or HLD, is
 * neither signed off nor grandfathered. Always false outside team mode, with no policy or for another unit. Reads only.
 */
export function signoffHoldsCompletion(repo: string, unitId: string, deps: SignoffDeps = {}): boolean {
	const key = ArtifactIds.parse(unitId);
	if (key === undefined || (key.kind !== 'STORY' && key.kind !== 'EPIC')) return false;
	const policy = teamPolicyOf(repo, deps);
	if (policy === undefined) return false;
	const unit: UnitRef = key.kind === 'STORY' && key.story !== undefined
		? { unit: 'story', repoPath: repo, epicHash: key.epicHash, storyId: key.story }
		: { unit: 'epic', repoPath: repo, epicHash: key.epicHash };
	const read = deps.readHead ?? testDeps.readHead ?? readHeadMeta;
	for (const stage of stagesOfUnit(unit)) {
		if (!policy.signoffStages.includes(stage)) continue;
		const artifactId = stageArtifactId(unit, stage);
		const meta = artifactId === undefined ? undefined : read(repo, artifactId);
		if (meta !== undefined && !isSignedOffOrGrandfathered(policy, meta)) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// Submitting artifacts for signoff
// ---------------------------------------------------------------------------

const rejected = (reason: string): PortResult<never> => ({ ok: false, kind: 'rejected', reason });

/** The id of an artifact as a signoff stage of this unit, or undefined when the unit does not hold it. */
function stageOfArtifact(unit: UnitRef, artifactId: string): SignoffStage | undefined {
	for (const stage of stagesOfUnit(unit)) if (stageArtifactId(unit, stage) === artifactId) return stage;
	return undefined;
}

/** A Story's code-review record read from its file; undefined when there is none or it cannot be read. */
export function readCodeReviewRecord(repo: string, epicHash: string, storyId: string): CodeReviewRecord | undefined {
	const path = artifactJsonPath(repo, codeReviewArtifactId(epicHash, storyId));
	if (!existsSync(path)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as { meta?: unknown; body?: { verdict?: unknown } };
		const verdict = typeof parsed.body?.verdict === 'string' ? parsed.body.verdict : '';
		return { verdict, party: reviewerPartyOf(parsed.meta) };
	} catch (err) {
		log.warn({ epicHash, storyId, err: err instanceof Error ? err.message : String(err) }, 'the code-review record could not be read');
		return undefined;
	}
}

/**
 * The branch that holds the committed artifacts: stage, commit and push the artifact files, then check the current branch is not
 * the default branch, is pushed and has no unpushed commits. A request is a pull request from that branch.
 */
export function publishArtifactsBranch(repo: string, paths: readonly string[], message: string): PortResult<string> {
	const pushed = commitAndPushArtifacts(repo, paths, message);
	if (pushed.committed && !pushed.pushed) return rejected(pushed.reason ?? 'the artifacts were committed but not pushed');
	if (!pushed.committed && !/nothing to commit/.test(pushed.reason ?? '')) return rejected(`the artifacts could not be committed: ${pushed.reason ?? 'unknown reason'}`);
	const head = runGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
	if (!head.ok) return rejected(`the current branch cannot be read: ${head.stderr}`);
	const branch = head.stdout.trim();
	if (branch === 'HEAD' || branch.length === 0) return rejected('a signoff request needs a branch: this checkout has a detached HEAD');
	const remote = pickRemote(repo);
	const defaultBranch = remote === undefined ? undefined : remoteHeadBranch(repo, remote);
	if (defaultBranch !== undefined && branch === defaultBranch) return rejected(`a signoff request needs a branch other than the default branch ('${branch}'): commit the artifacts on a feature branch`);
	const ahead = runGit(repo, ['rev-list', '--count', '@{u}..HEAD']);
	if (!ahead.ok) return rejected(`the branch '${branch}' has no upstream: push it first`);
	if (ahead.stdout.trim() !== '0') return rejected(`the branch '${branch}' has ${ahead.stdout.trim()} unpushed commit(s): push it first`);
	return { ok: true, value: branch };
}

let lifecycleProvider: ((repo: string) => LifecycleService) | undefined;

/** The daemon registers its repository registry's service, so a signoff is recorded through the same write queue as every other change. */
export function registerSignoffLifecycle(provider: ((repo: string) => LifecycleService) | undefined): void { lifecycleProvider = provider; }

const personOf = (login: string): Actor => ({ id: `github:${login}`, kind: 'person', properties: {} });

/** Why one artifact cannot be submitted, or undefined when its prerequisites hold. */
function prerequisiteFailure(repo: string, unit: UnitRef, artifactId: string, stage: SignoffStage, meta: unknown, d: SignoffDeps): string | undefined {
	if (approvalStateOf(meta) !== 'approved' || lifecycleOfMeta(meta)?.['status'] !== 'approved') {
		return `${artifactId} is not approved (status ${String(lifecycleOfMeta(meta)?.['status'] ?? 'unknown')}): approve it locally first`;
	}
	const lifecycle = lifecycleOfMeta(meta);
	const approval = lifecycle?.['approval'];
	const approvedRevision = typeof approval === 'object' && approval !== null ? (approval as Record<string, unknown>)['revision'] : undefined;
	const revision = revisionOfMeta(meta);
	if (typeof approvedRevision === 'number' && revision !== undefined && approvedRevision !== revision) {
		return `${artifactId} was approved at revision ${approvedRevision} but is at revision ${revision}: approve it again first`;
	}
	const author = authorPartyOf(meta);
	if (stage === 'BUILD') {
		if (unit.storyId === undefined) return `${artifactId} is a BUILD but its unit names no Story`;
		const review = (d.readCodeReview ?? readCodeReviewRecord)(repo, unit.epicHash, unit.storyId);
		if (review === undefined) return `${artifactId} has no code review: run the code review first (a BUILD's review is the Story's code-review record)`;
		if (review.verdict !== 'pass' && review.verdict !== 'warn') return `the code review of ${artifactId} is ${review.verdict === 'block' ? 'blocking' : 'unreadable'}: resolve it first`;
		if (author !== 'unknown' && review.party === author) return `the code review of ${artifactId} was run by the ${author}, who wrote the code: it needs the other party`;
		return undefined;
	}
	const review = lifecycleReviewOf(meta);
	if (review === undefined) return `${artifactId} has no other-party review: review it first`;
	const reviewer = reviewerPartyOf(review);
	if (author !== 'unknown' && reviewer === author) return `the review of ${artifactId} was run by the ${author}, who wrote it: it needs the other party`;
	return undefined;
}

/**
 * Submit artifacts of a unit for signoff as one request. The submitter must hold the issue of the unit that holds the stage (for
 * a BUILD, the Story's issue): a unit nobody holds has to be claimed first. Each artifact must be approved at its current
 * revision and reviewed by the other party (the lifecycle review, or for a BUILD the Story's code-review record). One request is
 * opened through the tracker and every artifact is recorded open-signoff with its Reference. A repeat after a partial recording
 * finds the open request on the recorded artifacts and records only the rest; it never opens a second request.
 */
export async function openSignoff(repo: string, unit: UnitRef, artifactIds: readonly string[], deps: SignoffDeps = {}): Promise<PortResult<SignoffRequestRef>> {
	const d: SignoffDeps = { ...testDeps, ...deps };
	const policy = teamPolicyOf(repo, d);
	if (policy === undefined) return rejected('this repository does not use team signoff (no team policy, or team mode and claims are not enforced)');
	if (artifactIds.length === 0) return rejected('choose at least one artifact to submit for signoff');

	// the artifacts: each is a stage this unit holds, the policy lists that stage, and its head exists
	const read = d.readHead ?? readHeadMeta;
	const artifacts: Array<{ artifactId: string; stage: SignoffStage; meta: unknown }> = [];
	for (const artifactId of [...new Set(artifactIds)]) {
		const stage = stageOfArtifact(unit, artifactId);
		if (stage === undefined) return rejected(`${artifactId} is not an artifact this unit holds for signoff`);
		if (!policy.signoffStages.includes(stage)) return rejected(`the policy does not ask for signoff at the ${stage}: ${artifactId} needs local approval only`);
		const meta = read(repo, artifactId);
		if (meta === undefined) return rejected(`${artifactId} does not exist`);
		artifacts.push({ artifactId, stage, meta });
	}

	// the tracker, the actor and the holder of the unit's issue
	const loaded = (d.loadTracker ?? loadTracker)(repo, new Set<Capability>(['claim', 'signoff-request']));
	if (!loaded.ok) return loaded;
	const port = loaded.value;
	const who = port.whoAmI();
	if (!who.ok) return who;
	const issue = (d.resolveIssue ?? ((u: UnitRef) => resolveUnitIssueLocal(u)))(unit);
	if (issue === null) throw new TeamGateRefusedError({ kind: 'no-issue', allowFirstAuthor: false }, 'signoff');
	const holder = port.readAssignee(issue);
	if (!holder.ok) return holder;
	if (holder.value === null) throw new TeamGateRefusedError({ kind: 'refused', reason: `nobody holds ${issue}: claim it before submitting for signoff` }, 'signoff');
	if (holder.value.toLowerCase() !== who.value.toLowerCase()) throw new TeamGateRefusedError({ kind: 'held-by-other', holder: holder.value, offerPark: false }, 'signoff');

	// a request already open on some of these artifacts is the request for all of them
	const openRefs = new Set<string>();
	const unrecorded: typeof artifacts = [];
	for (const a of artifacts) {
		const status = lifecycleOfMeta(a.meta)?.['status'];
		if (status === 'in-signoff') {
			const view = signoffViewOf(a.meta);
			if (view.state !== 'open' || view.request === null) return rejected(`${a.artifactId} is in signoff but names no open request`);
			openRefs.add(view.request.ref);
		} else {
			const failure = prerequisiteFailure(repo, unit, a.artifactId, a.stage, a.meta, d);
			if (failure !== undefined) return rejected(failure);
			unrecorded.push(a);
		}
	}
	if (openRefs.size > 1) return rejected(`these artifacts belong to different open requests (${[...openRefs].join(', ')}): submit them separately`);
	let request: SignoffRequestRef;
	if (openRefs.size === 1) {
		request = { ref: [...openRefs][0] as string };
		if (unrecorded.length === 0) return { ok: true, value: request };
	} else {
		const paths = artifacts.map(a => ({ artifactId: a.artifactId, path: `.insrc/artifacts/${a.artifactId}.json` }));
		const stages = [...new Set(artifacts.map(a => a.stage))].join(', ');
		const message = `docs: submit the ${stages} of ${unit.unit} ${unit.storyId ?? unit.epicHash} for signoff`;
		const published = (d.publishBranch ?? publishArtifactsBranch)(repo, paths.map(p => `${repo}/${p.path}`), message);
		if (!published.ok) return published;
		const opened = port.openSignoffRequest({
			title: `Signoff: ${stages} of ${unit.storyId ?? unit.epicHash}`,
			body: `Please review and approve to sign off:\n\n${artifacts.map(a => `- ${a.stage} \`${a.artifactId}\` at revision ${revisionOfMeta(a.meta) ?? 0}`).join('\n')}\n\nMerging this pull request records the signoff.`,
			unit,
			artifacts: artifacts.map(a => ({ artifactId: a.artifactId, revision: revisionOfMeta(a.meta) ?? 0, path: `.insrc/artifacts/${a.artifactId}.json` })),
			branch: published.value,
			issue,
		});
		if (!opened.ok) return opened;
		request = opened.value;
	}

	// every artifact is recorded with the same request; a failure part-way is finished by a repeat
	const service = (d.lifecycleFor ?? lifecycleProvider ?? ((r: string) => createRepoLifecycle(r).service))(repo);
	const by = personOf(who.value);
	for (const a of unrecorded) {
		try {
			await service.apply(a.artifactId, 'open-signoff', by, { request: signoffReferenceOf(request) });
		} catch (err) {
			return rejected(`${a.artifactId} could not be recorded in signoff (${err instanceof Error ? err.message : String(err)}); the request ${request.ref} is open, submit again to record the rest`);
		}
	}
	return { ok: true, value: request };
}
