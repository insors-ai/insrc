/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Approval / rejection gates for workflow chains.
 *
 * The gate helpers READ from artifact JSONs on disk and refuse
 * downstream work when the upstream artifact isn't approved. This
 * is the trust boundary between workflows — a downstream workflow
 * MUST call the corresponding gate before consuming an upstream
 * artifact.
 *
 * All Epic-scoped reads take the 16-char epicHash. The display slug
 * lives in `meta.epicSlug` and surfaces in error messages via the
 * artifact's own meta.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { basename, join } from 'node:path';

import { approvalStateOf, lifecycleReviewOf } from './artifact-core/approval-view.js';
import { createRepoLifecycle } from './artifact-core/repo-lifecycle.js';
import { staleAckOf } from './artifact-core/stale-ack.js';
import { getEffectiveHld } from './amendments/effective.js';
import { listApprovedAmendments } from './amendments/store.js';
import { renderDefineMarkdown } from './artifacts/define.js';
import type { DefineArtifact, DefineStory } from './artifacts/define.js';
import { enforceCodeReviewGate } from './code-review/gate.js';
import type { CodeReviewGateResult } from './code-review/gate.js';
import type { HldArtifact }    from './artifacts/hld.js';
import { computeHldEffectiveHash, extractHldContextSlice } from './artifacts/lld.js';
import type { HldContextSlice, LldArtifact } from './artifacts/lld.js';
import type { PlanArtifact } from './artifacts/plan.js';
import { decodeArtifactHead } from './artifact-core/decode.js';
import { checkHeadIntegrity } from './artifact-core/lifecycle.js';
import type { LifecycleService } from './artifact-core/lifecycle-service.js';
import { IllegalTransitionError, LifecycleConflictError, ReviewRequiredError } from './artifact-core/types.js';
import type { Actor, IntegrityReason, Review } from './artifact-core/types.js';
import { ArtifactIds } from './artifact-ids.js';
import { isSpecBody } from './artifacts/spec.js';
import type { SpecArtifact } from './artifacts/spec.js';
import { authorPartyOf, reviewerPartyOf } from './review/party.js';
import type { Party, PartyOrUnknown } from './review/party.js';
import { readReviewRecordOf } from './review/report-file.js';
import { effectiveReviewVerdict } from './review/resolve.js';
import type { ReviewVerdict } from './review/types.js';
import {
	ARTIFACT_ID_MARKER_RE,
	ARTIFACTS_DIR,
	STUB_DIR,
	artifactJsonPath,
	codeReviewArtifactId,
	defineArtifactId,
	defineArtifactPaths,
	hldArtifactId,
	hldArtifactPaths,
	lldArtifactId,
	lldArtifactPaths,
	planArtifactId,
	planArtifactPaths,
	specArtifactId,
	specArtifactPaths,
	TESTS_ID_PREFIX,
	workItemAnchorCreatedAt,
	workItemKindOf,
	writeArtifact,
	writeAtomic,
} from './storage.js';
import { ensureBuildRecordOnCompletion } from './runners/build/completion-record.js';
import { authorizeApproval } from './team/approval-gate.js';
import { TeamGateRefusedError } from './team/gate.js';

// ---------------------------------------------------------------------------
// Read + require-approved helpers
// ---------------------------------------------------------------------------

export class ArtifactMissingError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'ArtifactMissingError';
	}
}

export class ArtifactNotApprovedError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'ArtifactNotApprovedError';
	}
}

/** Thrown when approval is refused because the artifact's post-stage
 *  review verdict is `block` (unresolved HIGH/MED findings) and no
 *  override reason was supplied. Carries the findings summary so callers
 *  can show what to fix. */
export class ReviewBlockedError extends Error {
	constructor(msg: string, readonly summary: string) {
		super(msg);
		this.name = 'ReviewBlockedError';
	}
}

/** Thrown when approval or rejection is asked for something that is a record
 *  and not an approvable artifact: a Story's test record. The message begins
 *  'not-approvable:'. */
export class NotApprovableError extends Error {
	constructor(readonly jsonPath: string) {
		super(`${NOT_APPROVABLE_REASON} (${jsonPath})`);
		this.name = 'NotApprovableError';
	}
}

/** The reason a test record's approval is refused, on every route. */
export const NOT_APPROVABLE_REASON = 'not-approvable: a test record is not approved or rejected';

/** Whether the json at `jsonPath` is a Story's test record, by its id prefix. */
export function isTestRecordJsonPath(jsonPath: string): boolean {
	return basename(jsonPath).startsWith(TESTS_ID_PREFIX);
}

/** Thrown when a brainstorm SpecArtifact JSON does not exist at the
 *  hash-addressed path (never persisted / wrong specHash). The spec peer of
 *  `ArtifactMissingError`; kept distinct so the `spec.resolveApproved` IPC can
 *  map it to a `not-found` code (S007/sc4). */
export class SpecArtifactNotFoundError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'SpecArtifactNotFoundError';
	}
}

/** Thrown when a SpecArtifact is resolved as a consumable seed but its
 *  `meta.approvedAt` is unset/empty — the read-side approval gate (k12). The
 *  spec peer of `ArtifactNotApprovedError`; kept distinct so a consumer (and
 *  the `spec.resolveApproved` IPC's `not-approved` code) can tell the user
 *  approval is still outstanding rather than that the spec is missing
 *  (S007/ac4). */
export class SpecNotApprovedError extends Error {
	constructor(msg: string) {
		super(msg);
		this.name = 'SpecNotApprovedError';
	}
}

/** Read a stored head through the shared decoder (which checks its shape) and return it as the stage's artifact type. */
function readStoredHead<T>(id: string, jsonPath: string): T {
	return decodeArtifactHead(id, readFileSync(jsonPath, 'utf8')).head as unknown as T;
}

/** Read the canonical Define JSON from disk. */
export function readDefineArtifact(repoPath: string, epicHash: string): DefineArtifact {
	const jsonPath = artifactJsonPath(repoPath, defineArtifactId(epicHash));
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(
			`Define artifact not found at ${jsonPath}. Run \`insrc_workflow_step\` ` +
			`workflow='define' focus='...' first.`,
		);
	}
	return readStoredHead<DefineArtifact>(defineArtifactId(epicHash), jsonPath);
}

export interface EpicCatalogEntry {
	readonly epicHash: string;
	readonly epicSlug?: string;
	readonly problem:  string;
	readonly approved: boolean;
	readonly stories:  readonly { readonly id: string; readonly title: string }[];
}

/** Enumerate every Epic in the repo with its problem + story list — the
 *  catalog the `scope.assess` step hands the LLM to decide new-vs-extend. */
export function epicCatalog(repoPath: string): EpicCatalogEntry[] {
	const dir = join(repoPath, ARTIFACTS_DIR);
	if (!existsSync(dir)) return [];
	const out: EpicCatalogEntry[] = [];
	for (const name of readdirSync(dir).sort()) {
		const m = /^DEF-([0-9a-f]{16})\.json$/.exec(name);
		if (m === null) continue;
		try {
			const d = JSON.parse(readFileSync(join(dir, name), 'utf8')) as DefineArtifact;
			out.push({
				epicHash: m[1]!,
				...(d.meta.epicSlug !== undefined ? { epicSlug: d.meta.epicSlug } : {}),
				problem:  d.body.problem,
				approved: approvalStateOf(d.meta) === 'approved',
				stories:  d.body.stories.map(s => ({ id: s.id, title: s.title })),
			});
		} catch { /* skip malformed */ }
	}
	return out;
}

/** Next unused Story id (`s1`, `s2`, …) for a Define. */
export function nextStoryId(define: DefineArtifact): string {
	let max = 0;
	for (const s of define.body.stories) {
		const m = /^s(\d+)$/.exec(s.id);
		if (m !== null) max = Math.max(max, Number(m[1]));
	}
	return `s${max + 1}`;
}

/** Append a new Story to an approved Epic's Define (the extend path).
 *  Writes the JSON + re-renders the markdown; PRESERVES `meta.approvedAt`
 *  (the extend is the sanctioned edit). Throws on a duplicate story id. */
export function appendStoryToDefine(repoPath: string, epicHash: string, story: DefineStory): DefineArtifact {
	const jsonPath = artifactJsonPath(repoPath, defineArtifactId(epicHash));
	if (!existsSync(jsonPath)) throw new ArtifactMissingError(`Define not found at ${jsonPath}`);
	const define = JSON.parse(readFileSync(jsonPath, 'utf8')) as DefineArtifact;
	if (define.body.stories.some(s => s.id === story.id)) {
		throw new Error(`Story '${story.id}' already exists in Epic '${epicHash}'`);
	}
	const next: DefineArtifact = { ...define, body: { ...define.body, stories: [...define.body.stories, story] } };
	// The folder first: a Define with no Epic anchor fails here, before any file is written.
	const mdPath = defineArtifactPaths(repoPath, epicHash, workItemAnchorCreatedAt(next.meta), workItemKindOf(next.meta), next.meta.epicSlug).md;
	// content: the extend path changes body.stories of a Define a signoff may cover.
	const revision = writeArtifact(jsonPath, next, 'content');
	// raw-write: markdown render of the Define just written.
	writeAtomic(mdPath, renderDefineMarkdown(next));
	return { ...next, meta: { ...next.meta, revision } };
}

/** Same as `readDefineArtifact` but refuses when the artifact is
 *  not approved. Downstream runners (`design.epic` s1) call this. */
export function requireApprovedEpic(repoPath: string, epicHash: string): DefineArtifact {
	const define = readDefineArtifact(repoPath, epicHash);
	const label  = define.meta.epicSlug ?? epicHash;
	if (approvalStateOf(define.meta) === 'rejected') {
		throw new ArtifactNotApprovedError(
			`Epic '${label}' (${epicHash}) was rejected. ` +
			`Re-run define with --reopen first.`,
		);
	}
	if (approvalStateOf(define.meta) !== 'approved') {
		const path = defineArtifactPaths(repoPath, epicHash, workItemAnchorCreatedAt(define.meta), workItemKindOf(define.meta), define.meta.epicSlug).md;
		throw new ArtifactNotApprovedError(
			`Epic '${label}' (${epicHash}) is not approved. ` +
			`Run \`insrc workflow approve ${path}\` before starting design.epic.`,
		);
	}
	return define;
}

/** Read the canonical HLD JSON from disk. */
export function readHldArtifact(repoPath: string, epicHash: string): HldArtifact {
	const jsonPath = artifactJsonPath(repoPath, hldArtifactId(epicHash));
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(
			`HLD not found at ${jsonPath}. Run design.epic before design.story.`,
		);
	}
	return readStoredHead<HldArtifact>(hldArtifactId(epicHash), jsonPath);
}

/** Same as `readHldArtifact` but refuses when the artifact is not
 *  approved AND returns the EFFECTIVE HLD (base + approved
 *  amendments). Downstream workflows must go through this — they
 *  never see the raw base directly.
 *
 *  Amendments are only applied when the base is approved; a
 *  pending or rejected base short-circuits with
 *  `ArtifactNotApprovedError` as before. */
export function requireApprovedHld(repoPath: string, epicHash: string): HldArtifact {
	const hld   = readHldArtifact(repoPath, epicHash);
	const label = hld.meta.epicSlug ?? epicHash;
	if (approvalStateOf(hld.meta) !== 'approved') {
		const path = hldArtifactPaths(repoPath, epicHash, workItemAnchorCreatedAt(hld.meta), workItemKindOf(hld.meta), hld.meta.epicSlug).md;
		throw new ArtifactNotApprovedError(
			`HLD for Epic '${label}' (${epicHash}) is not approved. ` +
			`Run \`insrc workflow approve ${path}\` before starting design.story.`,
		);
	}
	return getEffectiveHld(repoPath, epicHash, hld);
}

/** Read the BASE HLD (no amendments applied). Used by amendment
 *  approval CLI + the effective-hash calculator + the staleness
 *  scanner. Downstream workflows should call `requireApprovedHld`
 *  instead. */
export function readBaseHld(repoPath: string, epicHash: string): HldArtifact {
	return readHldArtifact(repoPath, epicHash);
}

// ---------------------------------------------------------------------------
// LLD gate (sc3 — the `plan` workflow's upstream gate)
// ---------------------------------------------------------------------------

/** Read the canonical LLD JSON for a Story from disk. */
export function readLldArtifact(repoPath: string, epicHash: string, storyId: string): LldArtifact {
	const jsonPath = artifactJsonPath(repoPath, lldArtifactId(epicHash, storyId));
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(
			`LLD not found at ${jsonPath}. Run design.story for Story '${storyId}' before plan.`,
		);
	}
	return readStoredHead<LldArtifact>(lldArtifactId(epicHash, storyId), jsonPath);
}

/** Same as `readLldArtifact` but refuses when the LLD is unapproved,
 *  rejected, OR stale. Staleness is defined in exactly ONE place:
 *  this reuses `computeHldEffectiveHash` + the same base-runId/approved-
 *  amendment comparison `scanLldStaleness` uses, and honours a
 *  stale acknowledgement (an 'ack-stale' entry of the LLD's log). The `plan` workflow's upstream gate —
 *  the throwing peer of `requireApprovedHld`. */
export function requireApprovedLld(repoPath: string, epicHash: string, storyId: string): LldArtifact {
	const lld   = readLldArtifact(repoPath, epicHash, storyId);
	const label = lld.meta.epicSlug ?? epicHash;
	if (approvalStateOf(lld.meta) === 'rejected') {
		throw new ArtifactNotApprovedError(
			`LLD for Story '${storyId}' of Epic '${label}' (${epicHash}) was rejected. ` +
			`Re-run design.story before plan.`,
		);
	}
	if (approvalStateOf(lld.meta) !== 'approved') {
		const path = lldArtifactPaths(repoPath, epicHash, storyId, workItemAnchorCreatedAt(lld.meta), workItemKindOf(lld.meta), lld.meta.epicSlug).md;
		throw new ArtifactNotApprovedError(
			`LLD for Story '${storyId}' of Epic '${label}' (${epicHash}) is not approved. ` +
			`Run \`insrc workflow approve ${path}\` before starting plan.`,
		);
	}
	// Standalone LLDs (triage-routed non-Epic features) have no parent HLD, so
	// there is nothing to be stale against — skip the HLD-staleness check.
	if (lld.meta.standalone === true) {
		return lld;
	}
	// Staleness — recompute the current effective HLD hash the same way
	// `scanLldStaleness` does, and compare to the LLD's stored value.
	if (staleAckOf(repoPath, lldArtifactId(epicHash, storyId)) === undefined) {
		const baseHld = readBaseHld(repoPath, epicHash);
		const amendmentIds = listApprovedAmendments(repoPath, epicHash).map(a => a.id);
		const currentEffective = computeHldEffectiveHash(baseHld.meta.runId, amendmentIds);
		if (lld.meta.hldEffectiveHash !== currentEffective) {
			const reason = lld.meta.hldBaseRunId !== baseHld.meta.runId ? 'hld-rerun' : 'hld-amended';
			const path = lldArtifactPaths(repoPath, epicHash, storyId, workItemAnchorCreatedAt(lld.meta), workItemKindOf(lld.meta), lld.meta.epicSlug).md;
			throw new ArtifactNotApprovedError(
				`LLD for Story '${storyId}' of Epic '${label}' (${epicHash}) is stale (${reason}): ` +
				`its HLD effective state changed after approval. Re-run design.story against the current HLD, ` +
				`or ack-stale \`${path}\` before plan.`,
			);
		}
	}
	return lld;
}

/** The in-memory read-model the `plan` workflow's `context.assemble`
 *  step consumes: the approved+non-stale LLD, the Story's HLD context
 *  slice, and the Story's define dependency edges. Not persisted. */
export interface PlanUpstream {
	readonly lld:            LldArtifact;
	/** The HLD context slice for cross-cutting grounding, or `null` for a
	 *  standalone (no-HLD) story — the HLD read is skipped in that case. */
	readonly hldSlice:       HldContextSlice | null;
	readonly storyDependsOn: readonly string[];
}

/** Compose the plan's upstream inputs: `requireApprovedLld` (gates the
 *  LLD) + `requireApprovedHld` (for the HLD slice) + the Story's define
 *  `dependsOn`. Every input is sourced from the same approved
 *  DEF-/HLD-/LLD- artifacts the other gates read — no new data source.
 *  Throws (via the gates) when any upstream artifact is unusable. */
export function readPlanUpstream(repoPath: string, epicHash: string, storyId: string): PlanUpstream {
	const lld = requireApprovedLld(repoPath, epicHash, storyId);
	// Scope-aware upstream: the required documentation graph is dynamic, not
	// hardcoded to an HLD start point. A standalone (triage-routed) story has an
	// approved LLD but NO HLD/epic — skip those reads (mirroring the
	// `requireApprovedLld` standalone branch) and ground on the LLD alone.
	// Epic-scoped stories keep the full HLD + epic hard gate unchanged.
	if (lld.meta.standalone === true) {
		return { lld, hldSlice: null, storyDependsOn: [] };
	}
	const hld = requireApprovedHld(repoPath, epicHash);
	const hldSlice = extractHldContextSlice(hld, storyId);
	const define = requireApprovedEpic(repoPath, epicHash);
	const story = define.body.stories.find(s => s.id === storyId);
	const storyDependsOn = story?.dependsOn ?? [];
	return { lld, hldSlice, storyDependsOn };
}

// ---------------------------------------------------------------------------
// Build gate (the `build` workflow's upstream gate)
// ---------------------------------------------------------------------------

/** Read the canonical Plan JSON for a Story from disk. */
export function readPlanArtifact(repoPath: string, epicHash: string, storyId: string): PlanArtifact {
	const jsonPath = artifactJsonPath(repoPath, planArtifactId(epicHash, storyId));
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(
			`Plan not found at ${jsonPath}. Run \`plan\` for Story '${storyId}' before build.`,
		);
	}
	return readStoredHead<PlanArtifact>(planArtifactId(epicHash, storyId), jsonPath);
}

/** Same as `readPlanArtifact` but refuses when the plan is unapproved or
 *  rejected — the `build` workflow's upstream gate, the throwing peer of
 *  `requireApprovedLld`. The approved plan is `build`'s authorization
 *  boundary: its Tasks (and the test commands they carry) come verbatim
 *  from an approved plan.
 *
 *  TODO(s2): the FULL admission gate — plan freshness vs its upstream LLD
 *  (an amended/re-run LLD makes the plan stale) — is Story s2's job. s1
 *  gates on approval only. */
export function requireApprovedPlan(repoPath: string, epicHash: string, storyId: string): PlanArtifact {
	const plan  = readPlanArtifact(repoPath, epicHash, storyId);
	const label = plan.meta.epicSlug ?? epicHash;
	if (approvalStateOf(plan.meta) === 'rejected') {
		throw new ArtifactNotApprovedError(
			`Plan for Story '${storyId}' of Epic '${label}' (${epicHash}) was rejected. ` +
			`Re-run plan before build.`,
		);
	}
	if (approvalStateOf(plan.meta) !== 'approved') {
		const path = planArtifactPaths(repoPath, epicHash, storyId, workItemAnchorCreatedAt(plan.meta), workItemKindOf(plan.meta), plan.meta.epicSlug).md;
		throw new ArtifactNotApprovedError(
			`Plan for Story '${storyId}' of Epic '${label}' (${epicHash}) is not approved. ` +
			`Run \`insrc workflow approve ${path}\` before starting build.`,
		);
	}
	return plan;
}

/** Read the canonical brainstorm SpecArtifact JSON from disk (approved or
 *  not). The spec peer of `readDefineArtifact` / `readPlanArtifact`; a spec is
 *  NOT Epic-scoped, so it is keyed by its own 16-hex `specHash` (S006/sc1).
 *  Throws `SpecArtifactNotFoundError` when the JSON is absent and a plain
 *  `Error` when the JSON parses but its body fails the `isSpecBody` guard
 *  (corrupt / incompatible record). */
export function readSpecArtifact(repoPath: string, specHash: string): SpecArtifact {
	const jsonPath = artifactJsonPath(repoPath, specArtifactId(specHash));
	if (!existsSync(jsonPath)) {
		throw new SpecArtifactNotFoundError(
			`Spec ${specArtifactId(specHash)} not found at ${jsonPath}. ` +
			`Run the \`brainstorm\` stage to produce it before consuming it as a focus.`,
		);
	}
	const artifact = JSON.parse(readFileSync(jsonPath, 'utf8')) as SpecArtifact;
	if (!isSpecBody((artifact as { body?: unknown }).body)) {
		throw new Error(
			`Spec ${specArtifactId(specHash)} at ${jsonPath} is malformed — its body ` +
			`does not match the SpecArtifact shape. Re-run the \`brainstorm\` stage.`,
		);
	}
	return artifact;
}

/** Same as `readSpecArtifact` but refuses when the spec is unapproved — the
 *  read-side of sc4, the throwing peer of `requireApprovedPlan`. A downstream
 *  stage (`define` / standalone `design.story`) resolves an approved spec as
 *  its focus ONLY through this gate, so an unapproved spec is never consumed
 *  (k12). Throws `SpecNotApprovedError` (naming the SPEC id, stating approval
 *  is outstanding) when `meta.approvedAt` is unset/empty, so the caller can
 *  relay that to the user (ac4). */
export function requireApprovedSpec(repoPath: string, specHash: string): SpecArtifact {
	const spec = readSpecArtifact(repoPath, specHash);
	if (approvalStateOf(spec.meta) !== 'approved') {
		const path = specArtifactPaths(repoPath, specHash, workItemAnchorCreatedAt(spec.meta), 'standalone', spec.meta.epicSlug).md;
		throw new SpecNotApprovedError(
			`Spec ${specArtifactId(specHash)} is not approved — its approval is still outstanding. ` +
			`Review it and run \`insrc workflow approve ${path}\` before a stage consumes it.`,
		);
	}
	return spec;
}

/** The structured result the `spec.resolveApproved` IPC returns: either the
 *  approved spec, or an error carrying a stable `code` the consumer branches
 *  on (S007/sc4). */
export type SpecResolveResult =
	| { readonly spec: SpecArtifact }
	| { readonly error: string; readonly code: 'not-approved' | 'not-found' };

/** Pure resolver for the `spec.resolveApproved` IPC: wraps `requireApprovedSpec`
 *  and maps its throws to a structured `{ error, code }` — `SpecNotApprovedError`
 *  → `not-approved` (ac4), `SpecArtifactNotFoundError` → `not-found`. Any other
 *  error (e.g. a malformed body) propagates so it surfaces as a genuine fault
 *  rather than a resolvable "spec state". Kept as a standalone pure function so
 *  the mapping is unit-testable without standing up a daemon socket. */
export function resolveApprovedSpec(repoPath: string, specHash: string): SpecResolveResult {
	try {
		return { spec: requireApprovedSpec(repoPath, specHash) };
	} catch (err) {
		if (err instanceof SpecNotApprovedError)     return { error: err.message, code: 'not-approved' };
		if (err instanceof SpecArtifactNotFoundError) return { error: err.message, code: 'not-found' };
		throw err;
	}
}

/** The in-memory read-model the `build` workflow's `context.assemble`
 *  step consumes: the approved plan of ordered Tasks. Not persisted.
 *  TODO(s3): widen to carry the per-Task sequencing context the real
 *  implement loop needs. */
export interface BuildUpstream {
	readonly plan: PlanArtifact;
}

/** Compose the build's upstream inputs: `requireApprovedPlan` gates the
 *  plan. Throws (via the gate) when the plan is unusable. */
export function readBuildUpstream(repoPath: string, epicHash: string, storyId: string): BuildUpstream {
	return { plan: requireApprovedPlan(repoPath, epicHash, storyId) };
}

// ---------------------------------------------------------------------------
// Stale-ack helper
// ---------------------------------------------------------------------------

/**
 * Acknowledge that an LLD is stale against its HLD, with a reason. The lifecycle marks the artifact stale against the HLD first when
 * it is not marked yet, then takes the acknowledgement; the change log keeps the time and the reason, which the plan gate and the
 * staleness scan read.
 */
export async function ackStaleArtifact(jsonPath: string, reason: string, opts: DecisionOptions): Promise<{ readonly path: string; readonly ackedAt: string; readonly reason: string }> {
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
	}
	if (typeof reason !== 'string' || reason.trim().length === 0) throw new Error(`ack-stale reason is required`);
	const artifact = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { epicHash?: string } };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	const { lifecycle } = opts;
	const id = artifactIdOf(jsonPath);
	const actor = opts.actor ?? GATE_ACTOR;
	const seen = await lifecycle.inspect(id);
	if (seen !== undefined && seen.lifecycle.stale === undefined) {
		const hldId = typeof artifact.meta.epicHash === 'string' ? hldArtifactId(artifact.meta.epicHash) : undefined;
		if (hldId === undefined) throw new IllegalTransitionError(`${id} names no HLD it could be stale against`);
		const hld = await lifecycle.inspect(hldId);
		await lifecycle.apply(id, 'mark-stale', actor, { upstream: { upstream: { entityId: hldId, type: 'HLD', relation: 'derived-from' }, upstreamRevision: hld?.lifecycle.revision.number ?? 0 } });
	}
	const done = await lifecycle.apply(id, 'ack-stale', actor, { reason });
	return { path: jsonPath, ackedAt: done.entry.timestamp, reason };
}

// ---------------------------------------------------------------------------
// Approve / reject helpers (mutate artifact meta)
// ---------------------------------------------------------------------------

export interface ApprovalResult {
	readonly workflow:  string;
	readonly path:      string;
	readonly approvedAt: string;
}

/**
 * The artifact `meta` the approval gate reads and writes. Exported so a reader of
 * {@link ApprovableArtifactMeta.rangeBase} shares THIS declaration rather than
 * casting at its own read site.
 */
export interface ApprovableArtifactMeta {
	readonly workflow?:   string | undefined;
	/** `true` on a standalone (bugfix / Small) artifact, absent on an epic-route one. */
	readonly standalone?: boolean | undefined;
	/**
	 * FULL 40-hex sha of HEAD when this artifact was approved — the start of the
	 * Story's committed range. Stamped only on the artifacts a build treats as its
	 * upstream (see {@link stampsRangeBase}), so a later phase can derive what the
	 * Story changed without depending on anyone having committed the artifact.
	 * ABSENT when HEAD could not be read; never an empty string.
	 */
	readonly rangeBase?:  string | undefined;
	readonly lifecycle?:  unknown;
}

/** The meta field the approval stamps with the Story's range base. The one stamp the approval still writes into a head. */
const RANGE_BASE_KEY = 'rangeBase';

/**
 * Whether approving THIS artifact should stamp a range base.
 *
 * The approval site is generic across every artifact kind, so an ungated stamp
 * would write a base onto DEF / HLD / AMD / BUILD records that no build will ever
 * read. Only a build's genuine upstream is stamped: the `plan` for a planned
 * Story, or a STANDALONE `design.story` LLD, which is the only upstream the
 * no-plan (bugfix / Small) route has.
 */
function stampsRangeBase(meta: ApprovableArtifactMeta): boolean {
	if (meta.workflow === 'plan') return true;
	return meta.workflow === 'design.story' && meta.standalone === true;
}

/**
 * HEAD as a FULL 40-hex sha, or `undefined` when it cannot be read.
 *
 * Uses the synchronous `execFileSync` idiom already present in this directory
 * (tracker/github.ts) because the approval path is
 * synchronous. Deliberately NOT `revParse` from the git builtins: that helper
 * hard-codes `--short`, and an abbreviated sha in a PERSISTED range base can
 * collide as history grows — a base that silently resolves to the wrong commit is
 * the exact class of defect this stamp exists to remove. The 40-hex check means a
 * short sha could never be stored even if the command changed under us.
 */
function headFullSha(cwd: string): string | undefined {
	try {
		const out = execFileSync('git', ['rev-parse', 'HEAD'], {
			cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
		return /^[0-9a-f]{40}$/.test(out) ? out : undefined;
	} catch {
		return undefined;   // not a git repo, no commits yet, or git unavailable
	}
}

/**
 * The conflict of the head at `jsonPath`: its stored content hash no longer matches its content. The synchronous half of the
 * integrity check, for the paths that have no History. Undefined when the head has no stored hash, or cannot be decoded (those
 * gates behave as they always have).
 */
export function headConflict(jsonPath: string): { readonly artifactId: string; readonly reason: IntegrityReason } | undefined {
	try {
		const artifactId = basename(jsonPath).replace(/\.json$/, '');
		const { artifact } = decodeArtifactHead(artifactId, readFileSync(jsonPath, 'utf8'));
		const integrity = checkHeadIntegrity({ description: artifact.description, payload: artifact.payload, lifecycle: artifact.lifecycle });
		return integrity.ok ? undefined : { artifactId, reason: integrity.reason };
	} catch {
		return undefined;
	}
}

/** What the approval needs besides the path: the repository's lifecycle service, who approves, and an override reason. */
export interface ApproveOptions {
	readonly overrideReview?: string | undefined;
	readonly lifecycle:       LifecycleService;
	/** The actor the service records; the approval gate itself when absent. */
	readonly actor?:          Actor | undefined;
}

/**
 * Approve an artifact through the lifecycle. The head is checked against its change log first, the team gate and the review rules
 * are applied, and only then does the service take the head from draft to approved (an artifact already approved or beyond stays
 * as it is). The only thing written into the head besides the lifecycle is the Story's range base. Works generically for any
 * workflow: the artifact's JSON path is passed in verbatim.
 */
export async function approveArtifactByJsonPath(jsonPath: string, opts: ApproveOptions): Promise<ApprovalResult> {
	// A test record is a record, not an approvable artifact. Refused HERE because
	// this is the function every approval goes through, the TUI's included.
	if (isTestRecordJsonPath(jsonPath)) throw new NotApprovableError(jsonPath);
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
	}
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as { meta?: ApprovableArtifactMeta };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	const { lifecycle } = opts;
	const id = artifactIdOf(jsonPath);
	const actor = opts.actor ?? GATE_ACTOR;
	// A head that is out of step with its change log, or whose stored hash no longer matches its content, is not approved: a person has to resolve it first.
	const seen = await lifecycle.inspect(id);
	if (seen !== undefined && !seen.integrity.ok) throw new LifecycleConflictError(id, seen.integrity.reason);
	// Team gate: in a team repo a stage held by someone else is not approved here. Refused before any
	// review check or approval; a repo with no policy is untouched.
	const teamRefusal = authorizeApproval(jsonPath);
	if (teamRefusal !== undefined) throw new TeamGateRefusedError(teamRefusal.outcome, teamRefusal.subject);

	// Review gate: refuses approval while any HIGH/MED finding is UNRESOLVED
	// (the effective verdict, after the interactive resolutions in R3), unless
	// an explicit override reason is supplied. The report and the resolutions are the entries of the artifact's log.
	const override = opts.overrideReview;
	const overridden = override !== undefined && override.length > 0;
	const stored = readReviewRecordOf(jsonPath);
	const lifecycleVerdict = seen?.lifecycle.review?.verdict;
	const effective = stored !== undefined ? effectiveReviewVerdict(stored.report, stored.resolutions) : lifecycleVerdict;
	if (effective === 'block') {
		if (!overridden) {
			const res = stored?.resolutions ?? {};
			const pending = (stored?.report.findings ?? []).filter(f => (f.severity === 'HIGH' || f.severity === 'MED') && res[f.claimId] === undefined);
			const highs = pending.filter(f => f.severity === 'HIGH').length;
			const meds = pending.filter(f => f.severity === 'MED').length;
			const summary = stored !== undefined ? `${highs} HIGH · ${meds} MED unresolved` : 'the review verdict is block';
			throw new ReviewBlockedError(
				`Review blocks approval (${summary}). Resolve findings ('insrc workflow resolve <path> <id> <action>') or approve with an override reason.`,
				summary,
			);
		}
	}
	// The other-party review rule: a DEF, HLD or LLD must have been reviewed, a
	// BUILD record's Story must have a code review, and no review may have been
	// done by the party that authored the work. An override reason approves past
	// each and is recorded like any other override.
	const missing = otherPartyReviewGap(jsonPath, artifact.meta, seen?.lifecycle.review);
	if (missing !== undefined) {
		if (!overridden) throw new ReviewBlockedError(`${missing.message} Or approve with an override reason.`, missing.summary);
	}

	// The range base is read HERE, at approval, so it cannot depend on whether
	// anyone later remembered to commit the artifact. Absent when HEAD is
	// unreadable — the approval still completes; a build with no resolvable base
	// reports an empty change set rather than a wrong one.
	//
	// WRITE-ONCE (CR-3): an existing base is never recomputed. Re-approval is an
	// anticipated path, and "HEAD at approval time" on a SECOND approval means HEAD after the Story's
	// work has already landed. Re-stamping then moved the base forward onto the
	// Story's own commits and `base..HEAD` collapsed to empty, silently discarding
	// the change set. The first stamp is the one that means anything, so it wins.
	const priorBase = artifact.meta.rangeBase;
	const rangeBase = priorBase !== undefined && priorBase.length > 0
		? priorBase
		: stampsRangeBase(artifact.meta) ? headFullSha(dirname(jsonPath)) : undefined;

	let approvedAt: string;
	if (seen !== undefined && APPROVED_OR_BEYOND.includes(seen.status)) {
		approvedAt = seen.lifecycle.approval?.at ?? new Date().toISOString();   // approved already: it stays as it is
	} else {
		if (seen !== undefined && seen.status !== 'draft') throw new IllegalTransitionError(`${id} cannot be approved from ${seen.status}`);
		await bindEffectiveReview(lifecycle, id, seen, stored, effective);
		// an override the caller gave is recorded on the approval, whether or not this artifact needed it
		const done = await lifecycle.apply(id, 'approve', actor, overridden ? { override: { reason: override as string } } : {}, { overrideReview: overridden ? override : undefined });
		approvedAt = done.lifecycle.approval?.at ?? new Date().toISOString();
	}
	if (rangeBase !== undefined && priorBase !== rangeBase) {
		// raw patch of the one field: the lifecycle has taken the head to approved, and a meta-only write moves no revision
		const current = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta: Record<string, unknown> };
		writeArtifact(jsonPath, { ...current, meta: { ...current.meta, [RANGE_BASE_KEY]: rangeBase } }, 'meta-only');
	}
	return { workflow: artifact.meta.workflow ?? 'unknown', path: jsonPath, approvedAt };
}

/**
 * A design artifact is approved by the lifecycle only against a review bound to its revision whose verdict does not block. The
 * review is recorded with the verdict the reviewer gave; the user's resolutions came after, as entries of the log. So when the
 * resolutions lift a block, the review is bound again at the effective verdict (the same reviewer, counts and report) before the
 * approval. Nothing is written when the lifecycle already says what the effective verdict says.
 */
async function bindEffectiveReview(
	lifecycle: LifecycleService, id: string,
	seen: Awaited<ReturnType<LifecycleService['inspect']>>,
	stored: ReturnType<typeof readReviewRecordOf>,
	effective: ReviewVerdict | undefined,
): Promise<void> {
	const review = seen?.lifecycle.review;
	if (seen === undefined || review === undefined || stored === undefined || effective === undefined) return;
	if (!REVIEWED_KINDS.includes(ArtifactIds.parse(id)?.kind ?? '')) return;
	if (review.revision !== seen.lifecycle.revision.number || review.verdict === effective) return;
	await lifecycle.apply(id, 'review', review.reviewer, {
		review: { reviewer: review.reviewer, party: review.party, verdict: effective, counts: review.counts, ...(review.report !== undefined ? { report: review.report } : {}) },
	});
}

/** The artifact kinds whose approval requires a review, read from the
 *  hash-flat json's id prefix (the same key the BUILD completion check uses):
 *  a design review for DEF / HLD / LLD, a code review for BUILD. Every other
 *  kind (ISSUE, SPEC, PLAN, CR, EXT) is approved on the user's approval alone. */
function reviewRequiredFor(jsonPath: string): 'design' | 'code' | undefined {
	const id = basename(jsonPath);
	if (/^(DEF|HLD|LLD)-/.test(id)) return 'design';
	if (id.startsWith('BUILD-')) return 'code';
	return undefined;
}

const PARTY_REVIEW_TOOL: Record<Party, string> = {
	controller: 'a daemon review (run insrc_review_step: it sends controller-authored work to the daemon)',
	daemon:     'a controller review (run insrc_review_step)',
};

/**
 * What stops this artifact from being approved under the other-party review
 * rule, or undefined when nothing does:
 *
 *   - a DEF, HLD or LLD that has no review;
 *   - a BUILD record whose Story has no code-review record;
 *   - a review (for a BUILD record, its code review) done by the party that
 *     authored the work, when BOTH parties are known.
 *
 * An unknown author or an unknown reviewer never withholds approval by itself.
 * The BUILD record's code review is read from the artifact store beside it.
 */
function otherPartyReviewGap(jsonPath: string, meta: ApprovableArtifactMeta, lifecycleReview: Review | undefined): { readonly message: string; readonly summary: string } | undefined {
	const required = reviewRequiredFor(jsonPath);
	const author = authorPartyOf(meta);

	let reviewer: PartyOrUnknown | undefined;   // undefined = there is no review to speak of
	let what = 'review';
	if (required === 'code') {
		what = 'code review';
		const m = meta as { epicHash?: unknown; storyId?: unknown };
		const crPath = typeof m.epicHash === 'string' && typeof m.storyId === 'string'
			? join(dirname(jsonPath), `${codeReviewArtifactId(m.epicHash, m.storyId)}.json`)
			: undefined;
		const cr = crPath !== undefined ? readJsonOrUndefined(crPath) as { meta?: unknown } | undefined : undefined;
		if (cr === undefined) {
			return {
				message: 'Completion requires a code review of this Story, and none has been run. Run insrc_code_review_step first.',
				summary: 'completion requires a code review; none was run',
			};
		}
		// the party of a code review is its lifecycle review's, when it has one, else its own label
		reviewer = reviewerPartyOf(lifecycleReviewOf(cr.meta) ?? cr.meta);
	} else if (lifecycleReview !== undefined) {
		reviewer = reviewerPartyOf(lifecycleReview);
	} else if (required === 'design') {
		const need = author === 'unknown' ? 'a review (run insrc_review_step)' : PARTY_REVIEW_TOOL[author];
		return {
			message: `Approval requires a review of this artifact, and it has none. It needs ${need}.`,
			summary: 'approval requires a review; none was run',
		};
	}

	if (reviewer !== undefined && author !== 'unknown' && reviewer === author) {
		return {
			message:
				`This artifact's ${what} was done by the ${author}, which also authored the work. ` +
				`It needs ${what === 'code review' ? PARTY_REVIEW_TOOL[author].replace('insrc_review_step', 'insrc_code_review_step') : PARTY_REVIEW_TOOL[author]}.`,
			summary: `the ${what} was done by the party that authored the work (${author})`,
		};
	}
	return undefined;
}

function readJsonOrUndefined(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as unknown;
	} catch {
		return undefined;
	}
}

/** Raised when a batch approve targets an epic that has zero still-pending
 *  artifacts to sweep (all already approved, or the epic produced none) —
 *  distinct from a batch where pending artifacts exist but are all review-
 *  blocked (that returns approved=[] / skipped=[all], not this error). */
export class NoPendingArtifactsError extends Error {
	constructor(msg: string) { super(msg); this.name = 'NoPendingArtifactsError'; }
}

/** Request to approve a SINGLE artifact (by md/json path) or a BATCH (every
 *  still-pending DEF/HLD/LLD/PLAN artifact under an epic). Exactly one of
 *  artifactPath | epicHash. `repoPath` locates the epic's `.insrc/artifacts`
 *  dir for the batch path. */
export interface WorkflowApproveRequest {
	readonly repoPath:       string;
	readonly artifactPath?:  string;
	readonly epicHash?:      string;
	readonly overrideReview?: string;
	/**
	 * The lifecycle service. With it the full integrity check (the head against the change log) runs before a BUILD record is
	 * touched or anything is stamped, the approval is also applied through the service, the log is kept in step with the BUILD
	 * record hook, and a BUILD approval completes the Story (and then the Epic) once its roll-up is true. Without it the gates
	 * run the synchronous head-only check and behave as before.
	 */
	readonly lifecycle?:     LifecycleService | undefined;
	/** The actor the service records; the approval gate itself when absent. */
	readonly actor?:         Actor | undefined;
}

/** The code-review gate outcome for a single story-scoped artifact, projected
 *  from {@link CodeReviewGateResult} for the controller to PRESENT alongside the
 *  approval act. A SEPARATE surfacing from `meta.review` — it reflects the CODE
 *  review's `body.verdict`, never the design-artifact review. The `overrideReason`
 *  / `at` arm carries the OVERRIDE audit on `status === 'overridden'` so the
 *  presented outcome records a bypass, not only the stamped `approvedAt`. */
export interface CodeReviewApprovalOutcome {
	readonly path:    string;
	readonly storyId: string;
	readonly status:  CodeReviewGateResult['status'];
	readonly message?: string;
	readonly counts?:  { readonly high: number; readonly med: number; readonly low: number };
	readonly overrideReason?: string;
	readonly at?:     string;
}

/** A post-approval seam outcome, recorded when a COMPLETED artifact triggered a
 *  follow-on side effect (e.g. the bugfix chain advancing past an approved issue,
 *  or the bugfix tracker closing at BUILD completion). Additive + optional on the
 *  result — an approval that fires no seam simply omits `followOn`. `ok:false`
 *  surfaces a seam that threw WITHOUT failing the approval (the approvedAt stamp
 *  stands; the failure is reported, not swallowed). See `advanceApprovedBugfixes`
 *  (src/workflow/bugfix/mount.ts) — the daemon `workflow.approve` handler runs the
 *  seam AFTER this function returns and attaches the outcomes here. */
export interface FollowOnOutcome {
	readonly kind:        'bugfix-advance' | 'bugfix-complete' | 'tracker-attach' | 'tasks-sync';
	readonly artifactPath: string;
	readonly ok:          boolean;
	readonly note?:       string;
	/** For `tracker-attach`: the links posted, the links already recorded, and each file refused with its reason. */
	/** For `tasks-sync`: the Task ids the plan approval created, changed, withdrew and added. */
	readonly tasks?:      { readonly created: readonly string[]; readonly changed: readonly string[]; readonly withdrawn: readonly string[]; readonly added: readonly string[] };
	readonly attach?:     { readonly attached: readonly string[]; readonly reconciled: readonly string[]; readonly skipped: readonly string[]; readonly failed: readonly { readonly target: string; readonly reason: string }[] };
}

/** Non-lossy result: approved artifacts + review-blocked ones (kept distinct
 *  so a batch never silently drops a blocked artifact). `codeReview[]` is the
 *  additive code-review gate surfacing (one entry per story-scoped artifact the
 *  gate ran on) — `approved`/`skipped` shapes are unchanged. `followOn` is the
 *  additive post-approval-seam surfacing (attached by the daemon handler, not by
 *  approveWorkflowTarget itself, which stays synchronous); absent when no seam
 *  fired, so every existing caller is byte-for-byte unchanged. */
export interface WorkflowApproveResult {
	readonly approved: readonly { readonly path: string; readonly result: ApprovalResult }[];
	readonly skipped:  readonly { readonly path: string; readonly reason: string }[];
	readonly codeReview: readonly CodeReviewApprovalOutcome[];
	readonly followOn?: readonly FollowOnOutcome[];
}

/** JSON paths of every DEF/HLD/LLD/PLAN/BUILD artifact under `epicHash` that is
 *  not yet approved (its lifecycle is not approved). BUILD is the story-completion
 *  approval target, so it joins the batch sweep alongside the design artifacts.
 *  Sorted; malformed files skipped. */
function pendingArtifactJsonPaths(repoPath: string, epicHash: string): string[] {
	const dir = join(repoPath, ARTIFACTS_DIR);
	if (!existsSync(dir)) return [];
	const re = new RegExp(`^(DEF|HLD|LLD|PLAN|BUILD)-${epicHash}(-.*)?\\.json$`);
	const out: string[] = [];
	for (const name of readdirSync(dir).sort()) {
		if (!re.test(name)) continue;
		const jsonPath = join(dir, name);
		try {
			const meta = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: unknown }).meta;
			if (approvalStateOf(meta) !== 'approved') out.push(jsonPath);
		} catch { /* malformed — skip */ }
	}
	return out;
}

const GATE_ACTOR: Actor = { id: 'insrc:approval', kind: 'system', properties: {} };
const artifactIdOf = (jsonPath: string): string => basename(jsonPath).replace(/\.json$/, '');
const REVIEWED_KINDS: readonly string[] = ['DEF', 'HLD', 'LLD'];
const APPROVED_OR_BEYOND: readonly string[] = ['approved', 'in-signoff', 'changes-requested', 'signed-off', 'completed'];

/** Approve a single artifact or a whole epic's pending set — daemon-safe (no
 *  cli/services dependency). Each artifact goes through approveArtifactByJsonPath
 *  (the review block-verdict gate), so a `ReviewBlockedError` routes the artifact
 *  into `skipped[]` rather than being dropped (non-lossy). Stamp-only: it does
 *  NOT run the tracker (gh-push/commit) leg — that stays in the cli-services
 *  `approve()` used by the TUI. Throws ArtifactMissingError (single not found)
 *  or NoPendingArtifactsError (empty epic sweep). */
export async function approveWorkflowTarget(
	req: WorkflowApproveRequest,
	opts?: { readonly enforce?: boolean },
): Promise<WorkflowApproveResult> {
	const approveOpts = req.overrideReview !== undefined ? { overrideReview: req.overrideReview } : undefined;
	const approved:   { path: string; result: ApprovalResult }[] = [];
	const skipped:    { path: string; reason: string }[] = [];
	const codeReview: CodeReviewApprovalOutcome[] = [];

	/** A BUILD target the team gate refuses goes to skipped[] before its record is created or merged. */
	const refuseBeforeRecord = (jsonPath: string): boolean => {
		const refusal = authorizeApproval(jsonPath);
		if (refusal === undefined) return false;
		skipped.push({ path: jsonPath, reason: new TeamGateRefusedError(refusal.outcome, refusal.subject).reason });
		return true;
	};

	/** A BUILD target whose stored hash differs from its content goes to skipped[] before the hook rewrites its record. */
	const refuseConflict = (jsonPath: string): boolean => {
		const conflict = headConflict(jsonPath);
		if (conflict === undefined) return false;
		skipped.push({ path: jsonPath, reason: new LifecycleConflictError(conflict.artifactId, conflict.reason).message });
		return true;
	};

	// a caller that names no service gets one built over the repository's files
	const lifecycle: LifecycleService = req.lifecycle ?? createRepoLifecycle(req.repoPath).service;
	const actor = req.actor ?? GATE_ACTOR;
	/** The head and its change log must agree before a BUILD record is touched or anything is approved. */
	const refuseLogConflict = async (jsonPath: string): Promise<boolean> => {
		const seen = await lifecycle.inspect(artifactIdOf(jsonPath));
		if (seen === undefined || seen.integrity.ok) return false;
		skipped.push({ path: jsonPath, reason: new LifecycleConflictError(artifactIdOf(jsonPath), seen.integrity.reason).message });
		return true;
	};
	/** The BUILD record hook; with a service its content goes through the service's store, so the log stays in step. */
	const runBuildHook = async (jsonPath: string): Promise<void> => {
		const ref = buildRefFor(jsonPath);
		if (ref === undefined) return;
		await ensureBuildRecordOnCompletion(req.repoPath, ref, undefined, { writer: lifecycle, actor });
	};
	/** A BUILD approval completes the Story, and then the Epic, once their roll-up is true. The approval itself stands. */
	const completeThroughService = async (jsonPath: string): Promise<void> => {
		const key = ArtifactIds.parse(artifactIdOf(jsonPath));
		if (key?.kind === 'BUILD' && key.story !== undefined) {
			await lifecycle.completeIfRolledUp(ArtifactIds.make({ kind: 'STORY', epicHash: key.epicHash, story: key.story }), actor, { overrideReview: req.overrideReview });
		}
	};

	const approveOne = async (jsonPath: string): Promise<void> => {
		// A test record carries an Epic and a Story in its meta, so without this it
		// would be put through the code-review gate below and come back with that
		// gate's outcome. It is refused first, by kind, with no code-review outcome.
		if (isTestRecordJsonPath(jsonPath)) {
			skipped.push({ path: jsonPath, reason: NOT_APPROVABLE_REASON });
			return;
		}
		if (await refuseLogConflict(jsonPath)) return;
		// Code-review gate: a SEPARATE check over the CODE review's body.verdict —
		// runs BEFORE the meta.review approve and never merges into it. Story-scoped
		// artifacts (meta.epicHash && meta.storyId) only; a `blocked` verdict
		// withholds completion (routed to skipped[], no approvedAt stamp). Every
		// other status is advisory and falls through to the unchanged approve below.
		const meta = readArtifactMeta(jsonPath);
		if (meta !== undefined && meta.epicHash !== undefined && meta.storyId !== undefined) {
			const gate = enforceCodeReviewGate(req.repoPath, meta.epicHash, meta.storyId, {
				...(req.overrideReview !== undefined ? { overrideReview: req.overrideReview } : {}),
				...(opts?.enforce !== undefined ? { enforce: opts.enforce } : {}),
			});
			codeReview.push(projectGateOutcome(jsonPath, meta.storyId, gate));
			if (gate.status === 'blocked') {
				skipped.push({ path: jsonPath, reason: gate.message });
				return;   // withhold completion — no meta.review approve, no approvedAt
			}
			// A BUILD record whose Story has NO code review (or a same-party one) is
			// not decided here: approveArtifactByJsonPath refuses it, whatever the
			// enforcement setting, and the catch below routes it to skipped[]. That
			// function is the one every approval goes through (the TUI calls it
			// directly), so the rule cannot be bypassed by skipping this one.
		}
		let completeAfter = false;
		try {
			approved.push({ path: jsonPath, result: await approveArtifactByJsonPath(jsonPath, { ...(approveOpts ?? {}), lifecycle, actor }) });
			completeAfter = true;
		} catch (err) {
			if (err instanceof ReviewBlockedError) {
				skipped.push({ path: jsonPath, reason: err.summary });
			} else if (err instanceof TeamGateRefusedError) {
				skipped.push({ path: jsonPath, reason: err.reason });
			} else if (err instanceof LifecycleConflictError || err instanceof ReviewRequiredError || err instanceof IllegalTransitionError) {
				skipped.push({ path: jsonPath, reason: err.message });
			} else {
				throw err;   // ArtifactMissingError / no-meta — surface, not skip
			}
		}
		// The approval stands whatever completing the Story finds: a failure here surfaces to the caller, and a retry finishes it.
		if (completeAfter) await completeThroughService(jsonPath);
	};

	if (req.artifactPath !== undefined) {
		const jsonPath = jsonPathForMd(req.artifactPath);
		// Completion hook: a controller-side build skips the validate phase, so its
		// BUILD ledger record may not exist yet. CREATE-or-MERGE it from the changed
		// set BEFORE the existsSync/approve so the artifact is present to stamp.
		if (basename(jsonPath).startsWith('BUILD-')) {
			// Authorize BEFORE the record is created or merged: a refused target changes nothing.
			if (refuseBeforeRecord(jsonPath)) return { approved, skipped, codeReview };
			if (refuseConflict(jsonPath)) return { approved, skipped, codeReview };
			if (await refuseLogConflict(jsonPath)) return { approved, skipped, codeReview };
			await runBuildHook(jsonPath);
		}
		if (!existsSync(jsonPath)) throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
		await approveOne(jsonPath);
	} else if (req.epicHash !== undefined) {
		const pending = pendingArtifactJsonPaths(req.repoPath, req.epicHash);
		if (pending.length === 0) throw new NoPendingArtifactsError(`No pending artifacts under epic ${req.epicHash} to approve`);
		for (const p of pending) {
			if (basename(p).startsWith('BUILD-')) {
				if (refuseBeforeRecord(p)) continue;
				if (refuseConflict(p)) continue;
				if (await refuseLogConflict(p)) continue;
				await runBuildHook(p);
			}
			await approveOne(p);
		}
	} else {
		throw new Error('approveWorkflowTarget: exactly one of artifactPath | epicHash is required');
	}
	return { approved, skipped, codeReview };
}

/** Read `{ epicHash, storyId }` off an artifact JSON's meta. Returns undefined
 *  when the file is missing / unparseable / has no meta — the code-review gate
 *  then never runs (the subsequent approve surfaces the real error). */
function readArtifactMeta(jsonPath: string): { epicHash?: string; storyId?: string } | undefined {
	try {
		if (!existsSync(jsonPath)) return undefined;
		const meta = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { epicHash?: string; storyId?: string } }).meta;
		return typeof meta === 'object' && meta !== null ? meta : undefined;
	} catch {
		return undefined;
	}
}

/** Inverse of `buildArtifactId`: parse `{ epicHash, storyId }` out of a
 *  `BUILD-<epicHash>-<storyId>[.json|.md]` path basename. The FIRST `-`-segment is
 *  the epicHash and the REST (joined by `-`) is the storyId, so a hyphen-bearing
 *  storyId (`s2-x`) round-trips. Returns undefined for a non-BUILD basename or an
 *  empty component. Exported for the completion-record round-trip test. */
export function parseBuildArtifactRef(jsonOrMdPath: string): { epicHash: string; storyId: string } | undefined {
	const b = basename(jsonOrMdPath).replace(/\.(json|md)$/, '');
	if (!b.startsWith('BUILD-')) return undefined;
	const rest = b.slice('BUILD-'.length);
	const dash = rest.indexOf('-');
	if (dash < 0) return undefined;
	const epicHash = rest.slice(0, dash);
	const storyId = rest.slice(dash + 1);
	if (epicHash.length === 0 || storyId.length === 0) return undefined;
	return { epicHash, storyId };
}

/** Resolve the `{ epicHash, storyId }` for a BUILD artifact — prefer the on-disk
 *  meta (when the json exists with both fields), else parse it from the filename.
 *  Returns undefined when neither yields a complete ref. */
function buildRefFor(jsonPath: string): { epicHash: string; storyId: string } | undefined {
	const meta = readArtifactMeta(jsonPath);
	if (meta !== undefined && meta.epicHash !== undefined && meta.storyId !== undefined) {
		return { epicHash: meta.epicHash, storyId: meta.storyId };
	}
	return parseBuildArtifactRef(jsonPath);
}

/** Project a {@link CodeReviewGateResult} into the presented
 *  {@link CodeReviewApprovalOutcome}, carrying `message`/`counts` where the arm
 *  has them and the override audit (`overrideReason`/`at`) on `overridden`. */
function projectGateOutcome(path: string, storyId: string, gate: CodeReviewGateResult): CodeReviewApprovalOutcome {
	const base = { path, storyId, status: gate.status };
	switch (gate.status) {
		case 'no-review':
			return base;
		case 'pass':
			return { ...base, counts: gate.counts };
		case 'warn':
			return { ...base, counts: gate.counts, message: gate.message };
		case 'blocked':
			return { ...base, counts: gate.counts, message: gate.message };
		case 'overridden':
			return { ...base, counts: gate.counts, overrideReason: gate.overrideReason, at: gate.at };
	}
}

export interface RejectionResult {
	readonly workflow:    string;
	readonly path:        string;
	readonly rejectedAt:  string;
	readonly rejectReason: string;
}

/** What a decision other than an approval needs: the repository's lifecycle service, and who decides. */
export interface DecisionOptions {
	readonly lifecycle: LifecycleService;
	/** The actor the service records; the approval gate itself when absent. */
	readonly actor?:    Actor | undefined;
}

/** Same as `approveArtifactByJsonPath` but rejects: the lifecycle takes the artifact to rejected and its change log keeps the reason. */
export async function rejectArtifactByJsonPath(jsonPath: string, reason: string, opts: DecisionOptions): Promise<RejectionResult> {
	if (isTestRecordJsonPath(jsonPath)) throw new NotApprovableError(jsonPath);
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
	}
	if (typeof reason !== 'string' || reason.trim().length === 0) {
		throw new Error(`reject requires a non-empty --reason`);
	}
	const artifact = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { workflow?: string } };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	const done = await opts.lifecycle.apply(artifactIdOf(jsonPath), 'reject', opts.actor ?? GATE_ACTOR, { reason });
	return { workflow: artifact.meta.workflow ?? 'unknown', path: jsonPath, rejectedAt: done.entry.timestamp, rejectReason: reason };
}

/** Given a human-facing artifact path (which the CLI accepts),
 *  resolve the canonical `.json`. Users almost always have the `.md`
 *  path handy.
 *
 *  The markdown is named by SLUG while the JSON is named by HASH, so
 *  we can't just swap the extension — the basenames differ. Instead we
 *  read the `<!-- insrc:artifact <ID> -->` marker the renderer embeds
 *  and rebuild the JSON path from the repo root. Falls back to the
 *  legacy dir+extension swap when the marker is absent (a hand-written
 *  or pre-slug `.md`) and for the `docs/stub/*` layout, where md + json
 *  sit side by side under the same slug basename. */
export function jsonPathForMd(mdPath: string): string {
	if (mdPath.endsWith('.json')) return mdPath;
	if (!mdPath.endsWith('.md') && !mdPath.endsWith('.html')) {
		throw new Error(`Expected a .md, .html, or .json path, got '${mdPath}'`);
	}
	// Stub artifacts keep md + json side by side, both slug-named.
	if (mdPath.includes('/docs/stub/')) {
		return swapExt(mdPath);
	}
	// Nested work-item md (docs/{epics|standalone}/<slug>-E.../[S.../]<KIND>.md):
	// the bare <KIND>.md filename no longer encodes the hash id, so the ONLY
	// mapping to the hash-flat json is via the embedded insrc:artifact marker
	// (sc2/lc1 — identity from the marker, never the path). The companion JSON
	// store stays hash-flat under ARTIFACTS_DIR (out of scope, unchanged).
	const id = readArtifactIdMarker(mdPath);
	const repoRoot = repoRootFromDocsPath(mdPath);
	if (id !== undefined && repoRoot !== undefined) {
		return join(repoRoot, ARTIFACTS_DIR, `${id}.json`);
	}
	throw new Error(
		`jsonPathForMd: cannot resolve the canonical JSON for '${mdPath}' — a nested ` +
		`work-item artifact md must carry an insrc:artifact marker (its path no longer ` +
		`encodes the hash id). ${id === undefined ? 'No marker was found.' : 'Path is not under docs/epics|standalone/.'}`,
	);
}

/** Reads the embedded `insrc:artifact` marker from a rendered md/html
 *  file. Returns undefined if the file can't be read or has no marker. */
function readArtifactIdMarker(mdPath: string): string | undefined {
	try {
		const head = readFileSync(mdPath, 'utf8').slice(0, 4096);
		const m = ARTIFACT_ID_MARKER_RE.exec(head);
		return m?.[1];
	} catch {
		return undefined;
	}
}

/** `.../docs/epics/<slug>-E.../S<nnn>/LLD.md` → `.../` (the repo root). Returns
 *  undefined when the path has no recognised docs root. The nested work-item
 *  roots (docs/epics, docs/standalone — sc2) plus the side-by-side stub dir. */
function repoRootFromDocsPath(p: string): string | undefined {
	for (const dir of ['docs/epics', 'docs/standalone', STUB_DIR]) {
		const seg = `/${dir}/`;
		const i = p.indexOf(seg);
		if (i >= 0) return p.slice(0, i);
	}
	return undefined;
}

/** Swap a trailing `.md` / `.html` for `.json`. */
function swapExt(p: string): string {
	return p.replace(/\.(md|html)$/, '.json');
}
