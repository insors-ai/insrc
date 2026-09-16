/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Storage helpers for workflow artifacts + run logs.
 *
 * Split between two on-disk locations:
 *
 *   docs/                    — human-facing markdown, in a NESTED, work-item-first
 *                              tree keyed by identity (sc2, see `./path-scheme.js`)
 *     epics/<slug>-E<date><hash8>/DEF.md HLD.md      — item-root singletons
 *     epics/<slug>-E<date><hash8>/S<nnn>/LLD.md …    — per-story artifacts
 *     standalone/<slug>-E<date><hash8>/…             — triage-routed features
 *
 *   .insrc/artifacts/        — canonical JSON, hidden, git-tracked,
 *                              named by HASH (the stable identity) — UNCHANGED
 *     DEF-<h16>.json
 *     HLD-<h16>.json
 *     LLD-<h16>-<storyId>.json
 *     AMD-<h16>-<n>.json     — Phase E amendments
 *
 *   ~/.insrc/workflow-runs/  — trace logs, OUTSIDE the repo, ephemeral
 *     <epicHash>/<workflow>-<runId>.jsonl
 *
 * `<h16>` is the canonical 16-char Epic hash (see `workflow/hash.ts`);
 * `<slug>` is the human-readable `meta.epicSlug` (a LABEL only — identity comes
 * from the `E<date><hash8>` segment, never the filename). The bare `<KIND>.md`
 * carries an `<!-- insrc:artifact <ID> -->` marker (see `artifactIdMarker`) so it
 * resolves back to its hash-named canonical `.json` (see `gates.jsonPathForMd`).
 * A caller that only needs the JSON uses `artifactJsonPath` (identity-free).
 *
 * Every write goes through `writeAtomic` — write to `<path>.tmp` then
 * rename — so a mid-write crash leaves the previous version intact.
 * Directories are created on demand.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { PATHS } from '../shared/paths.js';
import { deriveWorkItemIdentity } from './id.js';
import { fileSeg, resolveArtifactMdPath, type WorkItemKind } from './path-scheme.js';

// ---------------------------------------------------------------------------
// Repo-relative dir constants
// ---------------------------------------------------------------------------

/** Root for canonical JSON artifacts INSIDE the repo. Hidden (dot-
 *  prefix) so it doesn't clutter the repo tree, but git-tracked so
 *  a shared reviewer sees exactly what the daemon produced. */
export const ARTIFACTS_DIR = '.insrc/artifacts';

/** Side-by-side stub dir (demo `stub` workflow). Retained: a stub's md + json
 *  sit side-by-side under one slug basename and it carries no work-item identity,
 *  so it stays flat rather than joining the nested sc2 tree. */
export const STUB_DIR    = 'docs/stub';

// The six flat per-type docs dirs (DEFINES/DESIGNS/PLANS/BUILDS/SPECS/REVIEWS)
// and their DOCS_ARTIFACT_DIRS allow-list are RETIRED (S002 sc2): every
// work-item artifact md now lives in the nested tree resolved by
// `./path-scheme.js` (docs/{epics|standalone}/<slug>-E<date><hash8>/[S<nnn>/]).

// ---------------------------------------------------------------------------
// Atomic write
// ---------------------------------------------------------------------------

/** Write `content` to `absPath` atomically. Creates parent dirs as
 *  needed. Uses `renameSync` which is atomic within a single
 *  filesystem — no partial writes visible to a concurrent reader.
 *
 *  Refuses when `absPath` looks suspicious (relative, or empty).
 *  Callers should validate paths themselves for the gitignore + is-
 *  under-repo checks; this function is a low-level primitive.
 */
export function writeAtomic(absPath: string, content: string): void {
	if (typeof absPath !== 'string' || absPath.length === 0) {
		throw new Error(`writeAtomic: empty path`);
	}
	if (!absPath.startsWith('/')) {
		throw new Error(`writeAtomic: path must be absolute (got '${absPath}')`);
	}
	mkdirSync(dirname(absPath), { recursive: true });
	const tmp = `${absPath}.tmp`;
	writeFileSync(tmp, content, 'utf8');
	renameSync(tmp, absPath);
}

// ---------------------------------------------------------------------------
// Workflow-runs jsonl
// ---------------------------------------------------------------------------

/** Directory holding this Epic's jsonl traces. Keyed by the Epic
 *  hash — every workflow for the Epic (define / design.epic /
 *  design.story per Story / tracker.*) writes into the same dir. */
export function runsDirFor(epicHash: string): string {
	return join(PATHS.insrc, 'workflow-runs', epicHash);
}

/** Path to the jsonl trace for a single (workflow, runId). */
export function runLogPathFor(
	epicHash: string,
	workflow: string,
	runId:    string,
): string {
	return join(runsDirFor(epicHash), `${workflow}-${runId}.jsonl`);
}

/** Append one line to the run's jsonl. Records are best-effort: a
 *  failing append never aborts the run (logging failure is worse
 *  than losing a trace line). */
export function appendRunLog(
	epicHash: string,
	workflow: string,
	runId:    string,
	record:   Record<string, unknown>,
): void {
	const path = runLogPathFor(epicHash, workflow, runId);
	try {
		mkdirSync(dirname(path), { recursive: true });
		appendFileSync(path, JSON.stringify(record) + '\n', 'utf8');
	} catch { /* trace is best-effort */ }
}

/** Rolling, tailable progress log at `~/.insrc/progress.log`. Long
 *  `workflow.run` / `analyze.run` operations append one human line per phase
 *  here so a user can WATCH progress live (`tail -f ~/.insrc/progress.log`, or
 *  a controller relays it via a monitor) — independent of whether the calling
 *  MCP client surfaces `notifications/progress`. Best-effort. */
export function appendProgressLog(runId: string, op: string, phase: string, detail?: string): void {
	try {
		const ts = new Date().toISOString().slice(11, 19);
		const line = `[${ts}] ${op} ${runId} · ${phase}${detail !== undefined && detail.length > 0 ? ' — ' + detail : ''}\n`;
		appendFileSync(join(PATHS.insrc, 'progress.log'), line, 'utf8');
	} catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Canonical artifact IDs (hash-based) + in-markdown resolution marker
// ---------------------------------------------------------------------------

// `fileSeg` is homed in `./path-scheme.js` (imported above) so this module can
// delegate its md paths to the resolver without an import cycle.

/** Canonical `.json` basename ID for a Define artifact (hash-based —
 *  this is the stable identity, independent of the display slug). */
export function defineArtifactId(epicHash: string): string { return `DEF-${epicHash}`; }
/** Canonical `.json` basename ID for an HLD artifact. */
export function hldArtifactId(epicHash: string): string { return `HLD-${epicHash}`; }
/** Canonical `.json` basename ID for an LLD artifact. */
export function lldArtifactId(epicHash: string, storyId: string): string {
	return `LLD-${epicHash}-${storyId}`;
}
/** Canonical `.json` basename ID for a Plan artifact — one per Story. */
export function planArtifactId(epicHash: string, storyId: string): string {
	return `PLAN-${epicHash}-${storyId}`;
}
/** Canonical `.json` basename ID for a Build artifact — one per Story. */
export function buildArtifactId(epicHash: string, storyId: string): string {
	return `BUILD-${epicHash}-${storyId}`;
}
/** Canonical `.json` basename ID for a brainstorm SpecArtifact (S006/sc1) —
 *  hash-based identity, independent of the display slug. Not Epic-scoped. */
export function specArtifactId(specHash: string): string { return `SPEC-${specHash}`; }
/** Canonical `.json` basename ID for a code-review record (code-review S006 /
 *  sc4) — one per Story, in its OWN `CR-` namespace so it never collides with
 *  or overwrites the design-artifact review or the `BUILD-` record. */
export function codeReviewArtifactId(epicHash: string, storyId: string): string {
	return `CR-${epicHash}-${storyId}`;
}

/** The work item's stable anchor createdAt — `meta.epicCreatedAt` when the
 *  finalize step stamped it, else the artifact's own `createdAt`. This is the
 *  value the sc2 md-path resolver keys the `E<date>` folder segment on, so every
 *  artifact of one work item lands in one folder. Pure — reads meta only. */
export function workItemAnchorCreatedAt(meta: { readonly epicCreatedAt?: string | undefined; readonly createdAt: string }): string {
	return meta.epicCreatedAt ?? meta.createdAt;
}

/** The sc2 top-level split for an artifact: `standalone` for a triage-routed
 *  feature (`meta.standalone === true`), else `epic`. A brainstorm SpecArtifact
 *  precedes the Epic chain and is always its own standalone work item, so SPEC
 *  callers pass `'standalone'` directly rather than through this. */
export function workItemKindOf(meta: { readonly standalone?: boolean | undefined }): WorkItemKind {
	return meta.standalone === true ? 'standalone' : 'epic';
}

/** Read an Epic's anchor createdAt = its `define` artifact's `meta.createdAt`,
 *  the stable timestamp every epic-parented artifact's folder segment is keyed
 *  on. Best-effort: returns `undefined` when the DEF is absent or unreadable
 *  (callers fall back to the artifact's own createdAt). Reads the hash-flat JSON
 *  store — the epic's DEF always pre-exists before any HLD/LLD/PLAN/BUILD/CR, so
 *  this is a finalize-time stamp helper, never called during path resolution. */
export function readEpicCreatedAt(repoPath: string, epicHash: string): string | undefined {
	const json = artifactJsonPath(repoPath, defineArtifactId(epicHash));
	if (!existsSync(json)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(json, 'utf8')) as { meta?: { createdAt?: unknown } };
		const c = parsed.meta?.createdAt;
		return typeof c === 'string' && c.length > 0 ? c : undefined;
	} catch {
		return undefined;
	}
}

/** Read `meta.createdAt` + `meta.epicSlug` from a canonical artifact JSON.
 *  Best-effort — returns `{}` when absent/unreadable. */
function readArtifactCore(repoPath: string, artifactId: string): { createdAt?: string; epicSlug?: string } {
	const json = join(repoPath, ARTIFACTS_DIR, `${artifactId}.json`);
	if (!existsSync(json)) return {};
	try {
		const parsed = JSON.parse(readFileSync(json, 'utf8')) as { meta?: { createdAt?: unknown; epicSlug?: unknown } };
		const createdAt = typeof parsed.meta?.createdAt === 'string' ? parsed.meta.createdAt : undefined;
		const epicSlug  = typeof parsed.meta?.epicSlug  === 'string' ? parsed.meta.epicSlug  : undefined;
		return { ...(createdAt !== undefined ? { createdAt } : {}), ...(epicSlug !== undefined ? { epicSlug } : {}) };
	} catch {
		return {};
	}
}

/** Resolve the sc2 folder args (anchor createdAt + top-level split + slug label)
 *  for a BUILD record, which carries only minimal meta. The build must land in
 *  the SAME work-item folder as the story it builds, so the anchor + slug come
 *  from the upstream artifact — the parent Epic's `define` for an epic build, or
 *  the standalone LLD for a standalone build (both always pre-exist a build) —
 *  falling back to the record's own createdAt (Trivial standalone with no LLD). */
export function buildRecordFolderArgs(
	repoPath:     string,
	epicHash:     string,
	storyId:      string,
	standalone:   boolean,
	ownCreatedAt: string,
): { readonly createdAtISO: string; readonly workItemKind: WorkItemKind; readonly epicSlug: string | undefined } {
	const upstream = standalone
		? readArtifactCore(repoPath, lldArtifactId(epicHash, storyId))
		: readArtifactCore(repoPath, defineArtifactId(epicHash));
	return {
		createdAtISO: upstream.createdAt ?? ownCreatedAt,
		workItemKind: standalone ? 'standalone' : 'epic',
		epicSlug:     upstream.epicSlug,
	};
}

/** Absolute path to a canonical artifact JSON from its (hash-based) id. The
 *  JSON store is hash-flat and identity-free, so a caller that only needs to
 *  READ the canonical record — before it knows the artifact's `createdAt` —
 *  resolves it from just the id, without the `createdAtISO` / `workItemKind`
 *  the md side (sc2) requires. `<x>ArtifactPaths().json` is byte-identical to
 *  `artifactJsonPath(repoPath, <x>ArtifactId(...))`; this is the JSON-only door. */
export function artifactJsonPath(repoPath: string, artifactId: string): string {
	return join(repoPath, ARTIFACTS_DIR, `${artifactId}.json`);
}

/** HTML-comment marker embedded at the top of every rendered markdown
 *  artifact. Because the `.md` is named by slug while the `.json` is
 *  named by hash, the marker is what lets `gates.jsonPathForMd` map a
 *  slug-named `.md` back to its canonical hash-named `.json`. */
export function artifactIdMarker(id: string): string {
	return `<!-- insrc:artifact ${id} -->`;
}

/** Extracts the `<ID>` from an `artifactIdMarker` line. */
export const ARTIFACT_ID_MARKER_RE = /<!--\s*insrc:artifact\s+([A-Za-z0-9._-]+)\s*-->/;

// ---------------------------------------------------------------------------
// Artifact paths — per workflow shape
// ---------------------------------------------------------------------------

/** `stub` writes to `docs/stub/<slug>.{md,json}` since it's a demo
 *  workflow that doesn't have an Epic hash. */
export function stubArtifactPaths(repoPath: string, slug: string): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   join(repoPath, STUB_DIR, `${fileSeg(slug)}.md`),
		json: join(repoPath, STUB_DIR, `${fileSeg(slug)}.json`),
	};
}

/** Paths for a Define artifact: md at the Epic's nested item-root
 *  `DEF.md` (sc2, via resolveArtifactMdPath), canonical JSON (named by `epicHash`) in
 *  `.insrc/artifacts/`. Omit `epicSlug` when only the JSON is needed —
 *  the markdown half then falls back to the hash. */
export function defineArtifactPaths(
	repoPath:     string,
	epicHash:     string,
	createdAtISO: string,
	workItemKind: WorkItemKind,
	epicSlug?:    string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   resolveArtifactMdPath(repoPath, deriveWorkItemIdentity(epicHash, createdAtISO), 'DEF', workItemKind, epicSlug ?? epicHash),
		json: join(repoPath, ARTIFACTS_DIR, `${defineArtifactId(epicHash)}.json`),
	};
}

/** Paths for a brainstorm SpecArtifact (S006/sc1): md at the standalone
 *  item's nested `SPEC.md` (sc2), canonical JSON (named by `specHash`) in
 *  `.insrc/artifacts/`. A Spec precedes the Epic chain, so it is keyed by
 *  its own run-derived `specHash`, not an `epicHash`. Omit `slug` when only
 *  the JSON is needed — the markdown half then falls back to the hash. */
export function specArtifactPaths(
	repoPath:     string,
	specHash:     string,
	createdAtISO: string,
	workItemKind: WorkItemKind,
	slug?:        string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   resolveArtifactMdPath(repoPath, deriveWorkItemIdentity(specHash, createdAtISO), 'SPEC', workItemKind, slug ?? specHash),
		json: join(repoPath, ARTIFACTS_DIR, `${specArtifactId(specHash)}.json`),
	};
}

/** Paths for an HLD (design.epic) artifact. See `defineArtifactPaths`
 *  for the slug-vs-hash split. */
export function hldArtifactPaths(
	repoPath:     string,
	epicHash:     string,
	createdAtISO: string,
	workItemKind: WorkItemKind,
	epicSlug?:    string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   resolveArtifactMdPath(repoPath, deriveWorkItemIdentity(epicHash, createdAtISO), 'HLD', workItemKind, epicSlug ?? epicHash),
		json: join(repoPath, ARTIFACTS_DIR, `${hldArtifactId(epicHash)}.json`),
	};
}

/** Paths for an LLD (design.story) artifact — one per Story. See
 *  `defineArtifactPaths` for the slug-vs-hash split; `epicSlug` is the
 *  trailing optional so existing `(repo, hash, storyId)` callers that
 *  only read the JSON keep working. */
export function lldArtifactPaths(
	repoPath:     string,
	epicHash:     string,
	storyId:      string,
	createdAtISO: string,
	workItemKind: WorkItemKind,
	epicSlug?:    string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   resolveArtifactMdPath(repoPath, deriveWorkItemIdentity(epicHash, createdAtISO, storyId), 'LLD', workItemKind, epicSlug ?? epicHash),
		json: join(repoPath, ARTIFACTS_DIR, `${lldArtifactId(epicHash, storyId)}.json`),
	};
}

/** Paths for a Plan (`plan`) artifact — one per Story. Nested
 *  `S<nnn>/PLAN.md` (sc2), canonical hash-named JSON under
 *  `.insrc/artifacts/`. The direct peer of `lldArtifactPaths`; `epicSlug`
 *  is the trailing optional so `(repo, hash, storyId)` JSON-only callers
 *  keep working. */
export function planArtifactPaths(
	repoPath:     string,
	epicHash:     string,
	storyId:      string,
	createdAtISO: string,
	workItemKind: WorkItemKind,
	epicSlug?:    string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   resolveArtifactMdPath(repoPath, deriveWorkItemIdentity(epicHash, createdAtISO, storyId), 'PLAN', workItemKind, epicSlug ?? epicHash),
		json: join(repoPath, ARTIFACTS_DIR, `${planArtifactId(epicHash, storyId)}.json`),
	};
}

/** Paths for a Build (`build`) artifact — one per Story. Nested
 *  `S<nnn>/BUILD.md` (sc2), canonical hash-named JSON under
 *  `.insrc/artifacts/`. The direct peer of `planArtifactPaths`; `epicSlug`
 *  is the trailing optional so `(repo, hash, storyId)` JSON-only callers
 *  keep working. */
export function buildArtifactPaths(
	repoPath:     string,
	epicHash:     string,
	storyId:      string,
	createdAtISO: string,
	workItemKind: WorkItemKind,
	epicSlug?:    string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   resolveArtifactMdPath(repoPath, deriveWorkItemIdentity(epicHash, createdAtISO, storyId), 'BUILD', workItemKind, epicSlug ?? epicHash),
		json: join(repoPath, ARTIFACTS_DIR, `${buildArtifactId(epicHash, storyId)}.json`),
	};
}

/** Paths for a code-review record (code-review S006/sc4) — one per Story. The
 *  direct peer of `buildArtifactPaths`: nested `S<nnn>/CR.md` (sc2),
 *  canonical hash-named JSON under `.insrc/artifacts/` in the `CR-` namespace.
 *  `epicSlug` is the trailing optional so `(repo, hash, storyId)` JSON-only
 *  callers keep working. */
export function codeReviewArtifactPaths(
	repoPath:     string,
	epicHash:     string,
	storyId:      string,
	createdAtISO: string,
	workItemKind: WorkItemKind,
	epicSlug?:    string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   resolveArtifactMdPath(repoPath, deriveWorkItemIdentity(epicHash, createdAtISO, storyId), 'CR', workItemKind, epicSlug ?? epicHash),
		json: join(repoPath, ARTIFACTS_DIR, `${codeReviewArtifactId(epicHash, storyId)}.json`),
	};
}

/** Canonical id + paths for an Extend artifact (`define` extend branch).
 *  One per (Epic, new Story). Md at the nested `S<nnn>/EXT.md` (sc2), JSON
 *  under `.insrc/artifacts/` (hash). */
export function extendArtifactId(epicHash: string, storyId: string): string { return `EXT-${epicHash}-${storyId}`; }
export function extendArtifactPaths(
	repoPath:     string,
	epicHash:     string,
	storyId:      string,
	createdAtISO: string,
	workItemKind: WorkItemKind,
	epicSlug?:    string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   resolveArtifactMdPath(repoPath, deriveWorkItemIdentity(epicHash, createdAtISO, storyId), 'EXT', workItemKind, epicSlug ?? epicHash),
		json: join(repoPath, ARTIFACTS_DIR, `${extendArtifactId(epicHash, storyId)}.json`),
	};
}

/** Where the `scope.assess` step caches its analyze bundles (outside the
 *  repo, keyed by Epic hash) so the later design phase can reuse the
 *  exploration instead of re-running analyze. */
export function scopeAnalyzeCachePath(epicHash: string): string {
	return join(runsDirFor(epicHash), 'scope-analyze.json');
}

/** Repo-relative markdown paths (nested, identity-keyed), for links embedded in
 *  GitHub issue bodies. Single source of the doc-path naming so the links can't
 *  drift from the actual filenames — they delegate to the same `resolveArtifactMdPath`
 *  as the writer helpers, with an empty repo root so the result is repo-relative
 *  (`docs/<epics|standalone>/<slug>-<epicSegment>/[S<nnn>/]<KIND>.md`). */
export function defineMdRel(epicHash: string, createdAtISO: string, workItemKind: WorkItemKind, epicSlug: string): string {
	return resolveArtifactMdPath('', deriveWorkItemIdentity(epicHash, createdAtISO), 'DEF', workItemKind, epicSlug);
}
export function hldMdRel(epicHash: string, createdAtISO: string, workItemKind: WorkItemKind, epicSlug: string): string {
	return resolveArtifactMdPath('', deriveWorkItemIdentity(epicHash, createdAtISO), 'HLD', workItemKind, epicSlug);
}
export function lldMdRel(epicHash: string, createdAtISO: string, workItemKind: WorkItemKind, epicSlug: string, storyId: string): string {
	return resolveArtifactMdPath('', deriveWorkItemIdentity(epicHash, createdAtISO, storyId), 'LLD', workItemKind, epicSlug);
}
export function planMdRel(epicHash: string, createdAtISO: string, workItemKind: WorkItemKind, epicSlug: string, storyId: string): string {
	return resolveArtifactMdPath('', deriveWorkItemIdentity(epicHash, createdAtISO, storyId), 'PLAN', workItemKind, epicSlug);
}
export function buildMdRel(epicHash: string, createdAtISO: string, workItemKind: WorkItemKind, epicSlug: string, storyId: string): string {
	return resolveArtifactMdPath('', deriveWorkItemIdentity(epicHash, createdAtISO, storyId), 'BUILD', workItemKind, epicSlug);
}
export function specMdRel(specHash: string, createdAtISO: string, workItemKind: WorkItemKind, slug: string): string {
	return resolveArtifactMdPath('', deriveWorkItemIdentity(specHash, createdAtISO), 'SPEC', workItemKind, slug);
}

/** Path for a single amendment record. The amendmentId is already
 *  `AMD-<epicHash>-<n>` (see `amendments/store.ts`). */
export function amendmentArtifactPath(repoPath: string, amendmentId: string): string {
	return join(repoPath, ARTIFACTS_DIR, `${amendmentId}.json`);
}

/** Directory holding every amendment for an Epic. Amendments are
 *  flat files under `.insrc/artifacts/AMD-<epicHash>-*.json`, so
 *  the "dir" is really just the artifacts root — kept as a helper
 *  for callers that need to `readdir` amendments by prefix. */
export function amendmentsRootDir(repoPath: string): string {
	return join(repoPath, ARTIFACTS_DIR);
}

/** Filename prefix that identifies every amendment belonging to an
 *  Epic. Callers filter `readdir(amendmentsRootDir(...))` by this
 *  prefix + `.json` suffix. */
export function amendmentFilenamePrefix(epicHash: string): string {
	return `AMD-${epicHash}-`;
}

/** Filename prefix that identifies every LLD belonging to an Epic. */
export function lldFilenamePrefix(epicHash: string): string {
	return `LLD-${epicHash}-`;
}

// ---------------------------------------------------------------------------
// Workflow → on-disk artifact paths (shared router)
// ---------------------------------------------------------------------------

/** Route a finalized workflow run to its `{md, json}` paths. The single
 *  source of truth for where each workflow's artifact lands — used by both
 *  the MCP `synthesize` phase and the daemon workflow runner so the two
 *  can't diverge. `epicHash`/`epicSlug`/`storyId` come from the finalized
 *  artifact's meta; `storyIdParam` is `intent.params.storyId` (design.story
 *  reads it from params). `epicKey` is the trace-log dir key (stub uses it
 *  as the slug). */
export function pathsForWorkflow(args: {
	readonly workflow:      string;
	readonly repoPath:      string;
	readonly epicKey:       string;
	readonly runId:         string;
	readonly createdAtISO:  string;                // from finalized meta.createdAt — supplies the E<date> folder segment
	readonly epicHash?:     string | undefined;
	readonly epicSlug?:     string | undefined;
	readonly specHash?:     string | undefined;   // from finalized meta (brainstorm)
	readonly storyId?:      string | undefined;   // from finalized meta
	readonly storyIdParam?: string | undefined;   // from intent.params
	readonly standalone?:   boolean | undefined;  // from finalized meta — triage-routed feature (no Epic parent)
}): { readonly md: string; readonly json: string } {
	const { workflow, repoPath, epicKey, runId, createdAtISO, epicHash, epicSlug, specHash, storyId, storyIdParam, standalone } = args;
	// Epic-parented vs triage-routed standalone selects the docs/epics vs
	// docs/standalone top-level (sc2). A brainstorm spec precedes the Epic chain,
	// so it is always a standalone work item.
	const workItemKind: WorkItemKind = standalone === true ? 'standalone' : 'epic';
	if (workflow === 'stub') return stubArtifactPaths(repoPath, epicKey);
	// A brainstorm SpecArtifact is NOT Epic-scoped — it is keyed by its own
	// run-derived specHash (S006/sc1). Routed before the epicHash guard.
	if (workflow === 'brainstorm') {
		if (specHash === undefined) {
			throw new Error(`pathsForWorkflow: workflow 'brainstorm' finalized without meta.specHash`);
		}
		return specArtifactPaths(repoPath, specHash, createdAtISO, 'standalone', epicSlug);
	}
	if (epicHash === undefined) {
		throw new Error(`pathsForWorkflow: workflow '${workflow}' finalized without meta.epicHash`);
	}
	if (workflow === 'define') {
		// The `define` extend branch emits an ExtendArtifact (meta carries a
		// storyId) → route to EXT-*, not DEF-*.
		if (typeof storyId === 'string' && storyId.length > 0) {
			return extendArtifactPaths(repoPath, epicHash, storyId, createdAtISO, workItemKind, epicSlug);
		}
		return defineArtifactPaths(repoPath, epicHash, createdAtISO, workItemKind, epicSlug);
	}
	if (workflow === 'design.epic') return hldArtifactPaths(repoPath, epicHash, createdAtISO, workItemKind, epicSlug);
	if (workflow === 'design.story') {
		if (typeof storyIdParam !== 'string' || storyIdParam.length === 0) {
			throw new Error(`design.story synthesize requires params.storyId`);
		}
		return lldArtifactPaths(repoPath, epicHash, storyIdParam, createdAtISO, workItemKind, epicSlug);
	}
	if (workflow === 'plan') {
		const sid = storyId ?? storyIdParam;
		if (typeof sid !== 'string' || sid.length === 0) {
			throw new Error(`plan synthesize requires params.storyId`);
		}
		return planArtifactPaths(repoPath, epicHash, sid, createdAtISO, workItemKind, epicSlug);
	}
	if (workflow === 'build') {
		const sid = storyId ?? storyIdParam;
		if (typeof sid !== 'string' || sid.length === 0) {
			throw new Error(`build synthesize requires params.storyId`);
		}
		return buildArtifactPaths(repoPath, epicHash, sid, createdAtISO, workItemKind, epicSlug);
	}
	if (workflow === 'tracker.push' || workflow === 'tracker.sync' || workflow === 'tracker.post') {
		const dir = runsDirFor(epicHash);
		return {
			md:   join(dir, `${workflow}-${runId}.md`),
			json: join(dir, `${workflow}-${runId}.json`),
		};
	}
	throw new Error(`pathsForWorkflow: workflow '${workflow}' not yet supported`);
}
