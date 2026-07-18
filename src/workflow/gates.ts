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
import { join } from 'node:path';

import { getEffectiveHld } from './amendments/effective.js';
import { makeStaleAck } from './amendments/staleness.js';
import { listApprovedAmendments } from './amendments/store.js';
import { renderDefineMarkdown } from './artifacts/define.js';
import type { DefineArtifact, DefineStory } from './artifacts/define.js';
import type { HldArtifact }    from './artifacts/hld.js';
import { computeHldEffectiveHash, extractHldContextSlice } from './artifacts/lld.js';
import type { HldContextSlice, LldArtifact } from './artifacts/lld.js';
import type { PlanArtifact } from './artifacts/plan.js';
import { BUILD_ARTIFACT_KIND, type BuildArtifact } from './artifacts/build.js';
import {
	ARTIFACT_ID_MARKER_RE,
	ARTIFACTS_DIR,
	buildArtifactPaths,
	defineArtifactPaths,
	hldArtifactPaths,
	lldArtifactPaths,
	planArtifactPaths,
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
	readonly hldSlice:       HldContextSlice;
	readonly storyDependsOn: readonly string[];
}

/** Compose the plan's upstream inputs: `requireApprovedLld` (gates the
 *  LLD) + `requireApprovedHld` (for the HLD slice) + the Story's define
 *  `dependsOn`. Every input is sourced from the same approved
 *  DEF-/HLD-/LLD- artifacts the other gates read — no new data source.
 *  Throws (via the gates) when any upstream artifact is unusable. */
export function readPlanUpstream(repoPath: string, epicHash: string, storyId: string): PlanUpstream {
	const lld = requireApprovedLld(repoPath, epicHash, storyId);
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
// Build artifact reader / require-approved (s5, sc7 — the terminal record)
//
// The finalized BuildArtifact enters the IDENTICAL sign-off path as every
// sibling kind: `approveArtifactByJsonPath` / `rejectArtifactByJsonPath` +
// `jsonPathForMd` (which already resolves `docs/builds/` via the shared
// `insrc:artifact` marker). This pairing is the read-back peer of
// `readPlanArtifact`/`requireApprovedPlan`, keyed on BUILD_ARTIFACT_KIND — an
// ADDITIONAL kind, never a change to how the existing kinds are approved.
// Build is the terminal stage, so an unapproved build artifact is simply
// treated as absent downstream (the throwing read below), exactly as for
// every other kind.
// ---------------------------------------------------------------------------

/** Read the canonical BuildArtifact JSON for a Story from disk. Asserts the
 *  `kind` discriminant so a mistyped record is caught here rather than
 *  downstream. */
export function readBuildArtifact(repoPath: string, epicHash: string, storyId: string): BuildArtifact {
	const paths = buildArtifactPaths(repoPath, epicHash, storyId);
	if (!existsSync(paths.json)) {
		throw new ArtifactMissingError(
			`Build artifact not found at ${paths.json}. Run \`build\` for Story '${storyId}' first.`,
		);
	}
	const artifact = JSON.parse(readFileSync(paths.json, 'utf8')) as BuildArtifact;
	if (artifact.kind !== BUILD_ARTIFACT_KIND) {
		throw new ArtifactMissingError(
			`Artifact at ${paths.json} is not a '${BUILD_ARTIFACT_KIND}' record (kind='${String(artifact.kind)}').`,
		);
	}
	return artifact;
}

/** Same as `readBuildArtifact` but refuses when the build record is unapproved
 *  or rejected — the throwing peer of `requireApprovedPlan`. An unapproved
 *  finalized build is treated as absent downstream, exactly as for every other
 *  artifact kind. */
export function requireApprovedBuild(repoPath: string, epicHash: string, storyId: string): BuildArtifact {
	const build = readBuildArtifact(repoPath, epicHash, storyId);
	const label = build.meta.epicSlug ?? epicHash;
	if (build.meta.approvedAt === undefined || build.meta.approvedAt.length === 0) {
		const path = buildArtifactPaths(repoPath, epicHash, storyId, build.meta.epicSlug).md;
		throw new ArtifactNotApprovedError(
			`Build for Story '${storyId}' of Epic '${label}' (${epicHash}) is not approved. ` +
			`Run \`insrc workflow approve ${path}\` to sign it off.`,
		);
	}
	if (build.meta.rejectedAt !== undefined && build.meta.rejectedAt.length > 0) {
		throw new ArtifactNotApprovedError(
			`Build for Story '${storyId}' of Epic '${label}' (${epicHash}) was rejected on ${build.meta.rejectedAt}.`,
		);
	}
	return build;
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
export function approveArtifactByJsonPath(jsonPath: string): ApprovalResult {
	if (!existsSync(jsonPath)) {
		throw new ArtifactMissingError(`No artifact at ${jsonPath}`);
	}
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as { meta?: { workflow?: string; approvedAt?: string; rejectedAt?: string; rejectReason?: string } };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	const approvedAt = new Date().toISOString();
	const nextMeta = { ...artifact.meta, approvedAt };
	// Clear any prior rejection if we're re-approving.
	delete nextMeta.rejectedAt;
	delete nextMeta.rejectReason;
	const next = { ...artifact, meta: nextMeta };
	writeAtomic(jsonPath, JSON.stringify(next, null, 2) + '\n');
	return { workflow: nextMeta.workflow ?? 'unknown', path: jsonPath, approvedAt };
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
	for (const seg of ['/docs/defines/', '/docs/designs/', '/docs/plans/', '/docs/builds/', '/docs/stub/']) {
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
	for (const seg of ['/docs/defines/', '/docs/designs/', '/docs/plans/', '/docs/builds/']) {
		const i = p.indexOf(seg);
		if (i >= 0) {
			return p.slice(0, i) + '/.insrc/artifacts/' + p.slice(i + seg.length);
		}
	}
	// `docs/stub/*` files keep md + json side by side; no swap.
	return p;
}
