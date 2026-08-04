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

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { getEffectiveHld } from './amendments/effective.js';
import { makeStaleAck } from './amendments/staleness.js';
import { listApprovedAmendments } from './amendments/store.js';
import { renderDefineMarkdown } from './artifacts/define.js';
import type { DefineArtifact, DefineStory } from './artifacts/define.js';
import { enforceCodeReviewGate, resolveEnforce } from './code-review/gate.js';
import type { CodeReviewGateResult } from './code-review/gate.js';
import type { HldArtifact }    from './artifacts/hld.js';
import { computeHldEffectiveHash, extractHldContextSlice } from './artifacts/lld.js';
import type { HldContextSlice, LldArtifact } from './artifacts/lld.js';
import type { PlanArtifact } from './artifacts/plan.js';
import { isSpecBody } from './artifacts/spec.js';
import type { SpecArtifact } from './artifacts/spec.js';
import { effectiveReviewVerdict } from './review/resolve.js';
import type { ReviewReport } from './review/types.js';
import type { ReviewResolution } from './types.js';
import {
	ARTIFACT_ID_MARKER_RE,
	ARTIFACTS_DIR,
	DOCS_ARTIFACT_DIRS,
	STUB_DIR,
	defineArtifactPaths,
	hldArtifactPaths,
	lldArtifactPaths,
	planArtifactPaths,
	specArtifactId,
	specArtifactPaths,
	writeAtomic,
} from './storage.js';

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

/** Read the canonical Define JSON from disk. */
export function readDefineArtifact(repoPath: string, epicHash: string): DefineArtifact {
	const paths = defineArtifactPaths(repoPath, epicHash);
	if (!existsSync(paths.json)) {
		throw new ArtifactMissingError(
			`Define artifact not found at ${paths.json}. Run \`insrc_workflow_step\` ` +
			`workflow='define' focus='...' first.`,
		);
	}
	const raw = readFileSync(paths.json, 'utf8');
	return JSON.parse(raw) as DefineArtifact;
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
				approved: typeof d.meta.approvedAt === 'string' && d.meta.approvedAt.length > 0,
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
	const paths = defineArtifactPaths(repoPath, epicHash);
	if (!existsSync(paths.json)) throw new ArtifactMissingError(`Define not found at ${paths.json}`);
	const define = JSON.parse(readFileSync(paths.json, 'utf8')) as DefineArtifact;
	if (define.body.stories.some(s => s.id === story.id)) {
		throw new Error(`Story '${story.id}' already exists in Epic '${epicHash}'`);
	}
	const next: DefineArtifact = { ...define, body: { ...define.body, stories: [...define.body.stories, story] } };
	writeAtomic(paths.json, JSON.stringify(next, null, 2) + '\n');
	writeAtomic(defineArtifactPaths(repoPath, epicHash, next.meta.epicSlug).md, renderDefineMarkdown(next));
	return next;
}

/** Same as `readDefineArtifact` but refuses when the artifact is
 *  not approved. Downstream runners (`design.epic` s1) call this. */
export function requireApprovedEpic(repoPath: string, epicHash: string): DefineArtifact {
	const define = readDefineArtifact(repoPath, epicHash);
	const label  = define.meta.epicSlug ?? epicHash;
	if (define.meta.approvedAt === undefined || define.meta.approvedAt.length === 0) {
		const path = defineArtifactPaths(repoPath, epicHash, define.meta.epicSlug).md;
		throw new ArtifactNotApprovedError(
			`Epic '${label}' (${epicHash}) is not approved. ` +
			`Run \`insrc workflow approve ${path}\` before starting design.epic.`,
		);
	}
	if (define.meta.rejectedAt !== undefined && define.meta.rejectedAt.length > 0) {
		throw new ArtifactNotApprovedError(
			`Epic '${label}' (${epicHash}) was rejected on ${define.meta.rejectedAt}. ` +
			`Re-run define with --reopen first.`,
		);
	}
	return define;
}

/** Read the canonical HLD JSON from disk. */
export function readHldArtifact(repoPath: string, epicHash: string): HldArtifact {
	const paths = hldArtifactPaths(repoPath, epicHash);
	if (!existsSync(paths.json)) {
		throw new ArtifactMissingError(
			`HLD not found at ${paths.json}. Run design.epic before design.story.`,
		);
	}
	const raw = readFileSync(paths.json, 'utf8');
	return JSON.parse(raw) as HldArtifact;
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
	if (hld.meta.approvedAt === undefined || hld.meta.approvedAt.length === 0) {
		const path = hldArtifactPaths(repoPath, epicHash, hld.meta.epicSlug).md;
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
	const paths = lldArtifactPaths(repoPath, epicHash, storyId);
	if (!existsSync(paths.json)) {
		throw new ArtifactMissingError(
			`LLD not found at ${paths.json}. Run design.story for Story '${storyId}' before plan.`,
		);
	}
	return JSON.parse(readFileSync(paths.json, 'utf8')) as LldArtifact;
}

/** Same as `readLldArtifact` but refuses when the LLD is unapproved,
 *  rejected, OR stale. Staleness is defined in exactly ONE place:
 *  this reuses `computeHldEffectiveHash` + the same base-runId/approved-
 *  amendment comparison `scanLldStaleness` uses, and honours a
 *  `meta.staleAckedAt` override. The `plan` workflow's upstream gate —
 *  the throwing peer of `requireApprovedHld`. */
export function requireApprovedLld(repoPath: string, epicHash: string, storyId: string): LldArtifact {
	const lld   = readLldArtifact(repoPath, epicHash, storyId);
	const label = lld.meta.epicSlug ?? epicHash;
	if (lld.meta.approvedAt === undefined || lld.meta.approvedAt.length === 0) {
		const path = lldArtifactPaths(repoPath, epicHash, storyId, lld.meta.epicSlug).md;
		throw new ArtifactNotApprovedError(
			`LLD for Story '${storyId}' of Epic '${label}' (${epicHash}) is not approved. ` +
			`Run \`insrc workflow approve ${path}\` before starting plan.`,
		);
	}
	if (lld.meta.rejectedAt !== undefined && lld.meta.rejectedAt.length > 0) {
		throw new ArtifactNotApprovedError(
			`LLD for Story '${storyId}' of Epic '${label}' (${epicHash}) was rejected on ${lld.meta.rejectedAt}. ` +
			`Re-run design.story before plan.`,
		);
	}
	// Standalone LLDs (triage-routed non-Epic features) have no parent HLD, so
	// there is nothing to be stale against — skip the HLD-staleness check.
	if (lld.meta.standalone === true) {
		return lld;
	}
	// Staleness — recompute the current effective HLD hash the same way
	// `scanLldStaleness` does, and compare to the LLD's stored value.
	const staleAckedAt = (lld.meta as { staleAckedAt?: string }).staleAckedAt;
	if (staleAckedAt === undefined || staleAckedAt.length === 0) {
		const baseHld = readBaseHld(repoPath, epicHash);
		const amendmentIds = listApprovedAmendments(repoPath, epicHash).map(a => a.id);
		const currentEffective = computeHldEffectiveHash(baseHld.meta.runId, amendmentIds);
		if (lld.meta.hldEffectiveHash !== currentEffective) {
			const reason = lld.meta.hldBaseRunId !== baseHld.meta.runId ? 'hld-rerun' : 'hld-amended';
			const path = lldArtifactPaths(repoPath, epicHash, storyId, lld.meta.epicSlug).md;
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
	const paths = planArtifactPaths(repoPath, epicHash, storyId);
	if (!existsSync(paths.json)) {
		throw new ArtifactMissingError(
			`Plan not found at ${paths.json}. Run \`plan\` for Story '${storyId}' before build.`,
		);
	}
	return JSON.parse(readFileSync(paths.json, 'utf8')) as PlanArtifact;
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
	if (plan.meta.approvedAt === undefined || plan.meta.approvedAt.length === 0) {
		const path = planArtifactPaths(repoPath, epicHash, storyId, plan.meta.epicSlug).md;
		throw new ArtifactNotApprovedError(
			`Plan for Story '${storyId}' of Epic '${label}' (${epicHash}) is not approved. ` +
			`Run \`insrc workflow approve ${path}\` before starting build.`,
		);
	}
	if (plan.meta.rejectedAt !== undefined && plan.meta.rejectedAt.length > 0) {
		throw new ArtifactNotApprovedError(
			`Plan for Story '${storyId}' of Epic '${label}' (${epicHash}) was rejected on ${plan.meta.rejectedAt}. ` +
			`Re-run plan before build.`,
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
	const paths = specArtifactPaths(repoPath, specHash);
	if (!existsSync(paths.json)) {
		throw new SpecArtifactNotFoundError(
			`Spec ${specArtifactId(specHash)} not found at ${paths.json}. ` +
			`Run the \`brainstorm\` stage to produce it before consuming it as a focus.`,
		);
	}
	const artifact = JSON.parse(readFileSync(paths.json, 'utf8')) as SpecArtifact;
	if (!isSpecBody((artifact as { body?: unknown }).body)) {
		throw new Error(
			`Spec ${specArtifactId(specHash)} at ${paths.json} is malformed — its body ` +
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
	if (spec.meta.approvedAt === undefined || spec.meta.approvedAt.length === 0) {
		const path = specArtifactPaths(repoPath, specHash, spec.meta.epicSlug).md;
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

/** Record a stale-ack override on an LLD artifact meta. Reads
 *  `<lldJsonPath>`, adds `staleAckedAt` + `staleAckedReason`,
 *  writes atomically. */
export function ackStaleArtifact(jsonPath: string, reason: string): { readonly path: string; readonly ackedAt: string; readonly reason: string } {
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
	}
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as { meta?: Record<string, unknown> };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	const ack = makeStaleAck(reason);
	const next = { ...artifact, meta: { ...artifact.meta, ...ack } };
	writeAtomic(jsonPath, JSON.stringify(next, null, 2) + '\n');
	return { path: jsonPath, ackedAt: ack.staleAckedAt, reason: ack.staleAckedReason };
}

// ---------------------------------------------------------------------------
// Approve / reject helpers (mutate artifact meta)
// ---------------------------------------------------------------------------

export interface ApprovalResult {
	readonly workflow:  string;
	readonly path:      string;
	readonly approvedAt: string;
}

/** Mark an artifact approved by writing `meta.approvedAt` into its
 *  JSON. Works generically for any workflow — the artifact's JSON
 *  path is passed in verbatim. */
export function approveArtifactByJsonPath(jsonPath: string, opts?: { readonly overrideReview?: string }): ApprovalResult {
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
	}
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as {
		meta?: {
			workflow?: string; approvedAt?: string; rejectedAt?: string; rejectReason?: string;
			review?: ReviewReport;
			reviewResolutions?: Record<string, ReviewResolution>;
			reviewOverride?: { reason: string; at: string };
		};
	};
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	// Review gate: refuses approval while any HIGH/MED finding is UNRESOLVED
	// (the effective verdict, after the interactive resolutions in R3), unless
	// an explicit override reason is supplied. Auto-fixes + per-finding
	// resolutions clear the block one finding at a time.
	const override = opts?.overrideReview;
	const review = artifact.meta.review;
	let reviewOverride: { reason: string; at: string } | undefined;
	if (review !== undefined && effectiveReviewVerdict(review, artifact.meta.reviewResolutions) === 'block') {
		if (override === undefined || override.length === 0) {
			const res = artifact.meta.reviewResolutions ?? {};
			const pending = review.findings.filter(f => (f.severity === 'HIGH' || f.severity === 'MED') && res[f.claimId] === undefined);
			const highs = pending.filter(f => f.severity === 'HIGH').length;
			const meds = pending.filter(f => f.severity === 'MED').length;
			const summary = `${highs} HIGH · ${meds} MED unresolved`;
			throw new ReviewBlockedError(
				`Review blocks approval (${summary}). Resolve findings ('insrc workflow resolve <path> <id> <action>') or approve with an override reason.`,
				summary,
			);
		}
		reviewOverride = { reason: override, at: new Date().toISOString() };
	}
	const approvedAt = new Date().toISOString();
	const nextMeta = { ...artifact.meta, approvedAt, ...(reviewOverride !== undefined ? { reviewOverride } : {}) };
	// Clear any prior rejection if we're re-approving.
	delete nextMeta.rejectedAt;
	delete nextMeta.rejectReason;
	const next = { ...artifact, meta: nextMeta };
	writeAtomic(jsonPath, JSON.stringify(next, null, 2) + '\n');
	return { workflow: nextMeta.workflow ?? 'unknown', path: jsonPath, approvedAt };
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

/** Non-lossy result: approved artifacts + review-blocked ones (kept distinct
 *  so a batch never silently drops a blocked artifact). `codeReview[]` is the
 *  additive code-review gate surfacing (one entry per story-scoped artifact the
 *  gate ran on) — `approved`/`skipped` shapes are unchanged. */
export interface WorkflowApproveResult {
	readonly approved: readonly { readonly path: string; readonly result: ApprovalResult }[];
	readonly skipped:  readonly { readonly path: string; readonly reason: string }[];
	readonly codeReview: readonly CodeReviewApprovalOutcome[];
}

/** JSON paths of every DEF/HLD/LLD/PLAN/BUILD artifact under `epicHash` that is
 *  not yet approved (meta.approvedAt absent). BUILD is the story-completion
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
			const meta = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { approvedAt?: string } }).meta;
			if (meta?.approvedAt === undefined) out.push(jsonPath);
		} catch { /* malformed — skip */ }
	}
	return out;
}

/** Approve a single artifact or a whole epic's pending set — daemon-safe (no
 *  cli/services dependency). Each artifact goes through approveArtifactByJsonPath
 *  (the review block-verdict gate), so a `ReviewBlockedError` routes the artifact
 *  into `skipped[]` rather than being dropped (non-lossy). Stamp-only: it does
 *  NOT run the tracker (gh-push/commit) leg — that stays in the cli-services
 *  `approve()` used by the TUI. Throws ArtifactMissingError (single not found)
 *  or NoPendingArtifactsError (empty epic sweep). */
export function approveWorkflowTarget(
	req: WorkflowApproveRequest,
	opts?: { readonly enforce?: boolean },
): WorkflowApproveResult {
	const approveOpts = req.overrideReview !== undefined ? { overrideReview: req.overrideReview } : undefined;
	const approved:   { path: string; result: ApprovalResult }[] = [];
	const skipped:    { path: string; reason: string }[] = [];
	const codeReview: CodeReviewApprovalOutcome[] = [];
	// Resolve enforcement ONCE with the same resolver the gate uses, so the gate
	// call and the BUILD-completion withhold below never disagree.
	const effectiveEnforce = resolveEnforce(opts?.enforce);

	const approveOne = (jsonPath: string): void => {
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
			// Story-completion (BUILD approval) requires a code review to have RUN
			// when enforcing: a BUILD with no CR record (gate 'no-review') is withheld
			// rather than silently completing. Scoped to the BUILD artifact — keyed on
			// the 'BUILD-' id prefix (buildArtifactId), NOT meta.workflow — and only
			// under effective enforcement with no explicit override. Every other kind,
			// enforce-off, and an overrideReview bypass fall through unchanged (fail-open).
			if (
				effectiveEnforce &&
				gate.status === 'no-review' &&
				req.overrideReview === undefined &&
				basename(jsonPath).startsWith('BUILD-')
			) {
				skipped.push({ path: jsonPath, reason: 'completion requires a code review; none was run' });
				return;   // withhold completion — no approvedAt
			}
		}
		try {
			approved.push({ path: jsonPath, result: approveArtifactByJsonPath(jsonPath, approveOpts) });
		} catch (err) {
			if (err instanceof ReviewBlockedError) {
				skipped.push({ path: jsonPath, reason: err.summary });
			} else {
				throw err;   // ArtifactMissingError / no-meta — surface, not skip
			}
		}
	};

	if (req.artifactPath !== undefined) {
		const jsonPath = jsonPathForMd(req.artifactPath);
		if (!existsSync(jsonPath)) throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
		approveOne(jsonPath);
	} else if (req.epicHash !== undefined) {
		const pending = pendingArtifactJsonPaths(req.repoPath, req.epicHash);
		if (pending.length === 0) throw new NoPendingArtifactsError(`No pending artifacts under epic ${req.epicHash} to approve`);
		for (const p of pending) approveOne(p);
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

/** Same as `approveArtifactByJsonPath` but records a rejection. */
export function rejectArtifactByJsonPath(jsonPath: string, reason: string): RejectionResult {
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
	}
	if (typeof reason !== 'string' || reason.trim().length === 0) {
		throw new Error(`reject requires a non-empty --reason`);
	}
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as { meta?: { workflow?: string; approvedAt?: string; rejectedAt?: string; rejectReason?: string } };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	const rejectedAt = new Date().toISOString();
	const nextMeta = { ...artifact.meta, rejectedAt, rejectReason: reason };
	delete nextMeta.approvedAt;
	const next = { ...artifact, meta: nextMeta };
	writeAtomic(jsonPath, JSON.stringify(next, null, 2) + '\n');
	return { workflow: nextMeta.workflow ?? 'unknown', path: jsonPath, rejectedAt, rejectReason: reason };
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
	// Designs / defines: slug-named md → hash-named json via the marker.
	const id = readArtifactIdMarker(mdPath);
	const repoRoot = repoRootFromDocsPath(mdPath);
	if (id !== undefined && repoRoot !== undefined) {
		return join(repoRoot, ARTIFACTS_DIR, `${id}.json`);
	}
	// Fallback: legacy hash-named md — swap dir + extension.
	return swapExt(swapDocsToArtifacts(mdPath));
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

/** `.../docs/defines/DEF-<slug>.md` → `.../` (the repo root). Returns
 *  undefined when the path has no recognised `docs/` segment. */
function repoRootFromDocsPath(p: string): string | undefined {
	// Every docs artifact dir (defines/designs/plans/builds/specs/reviews) PLUS
	// the side-by-side stub dir — derived from the storage.ts constants so the
	// allow-list can't drift (S001).
	for (const dir of [...DOCS_ARTIFACT_DIRS, STUB_DIR]) {
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

/** `.../docs/defines/DEF-<x>.md` → `.../.insrc/artifacts/DEF-<x>.md`.
 *  Only the first matching `docs/{defines,designs}/` segment gets
 *  swapped. If no such segment is present, the path is returned as-
 *  is (older layouts / non-standard callers). */
function swapDocsToArtifacts(p: string): string {
	// Every docs artifact dir maps into .insrc/artifacts (derived from the
	// storage.ts constants, S001). STUB_DIR is excluded — its md + json sit
	// side by side; no swap.
	for (const dir of DOCS_ARTIFACT_DIRS) {
		const seg = `/${dir}/`;
		const i = p.indexOf(seg);
		if (i >= 0) {
			return p.slice(0, i) + '/' + ARTIFACTS_DIR + '/' + p.slice(i + seg.length);
		}
	}
	// `docs/stub/*` files keep md + json side by side; no swap.
	return p;
}
