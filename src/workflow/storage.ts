/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Storage helpers for workflow artifacts + run logs.
 *
 * Split between two on-disk locations:
 *
 *   docs/                    — human-facing markdown, named by SLUG
 *     defines/DEF-<slug>.md
 *     designs/HLD-<slug>.md
 *     designs/LLD-<slug>-<storyId>.md
 *
 *   .insrc/artifacts/        — canonical JSON, hidden, git-tracked,
 *                              named by HASH (the stable identity)
 *     DEF-<h16>.json
 *     HLD-<h16>.json
 *     LLD-<h16>-<storyId>.json
 *     AMD-<h16>-<n>.json     — Phase E amendments
 *
 *   ~/.insrc/workflow-runs/  — trace logs, OUTSIDE the repo, ephemeral
 *     <epicHash>/<workflow>-<runId>.jsonl
 *
 * `<h16>` is the canonical 16-char Epic hash (see `workflow/hash.ts`);
 * `<slug>` is the human-readable `meta.epicSlug`. The markdown carries
 * an `<!-- insrc:artifact <ID> -->` marker (see `artifactIdMarker`) so
 * a slug-named `.md` still resolves back to its hash-named canonical
 * `.json` (see `gates.jsonPathForMd`). Callers that only need the JSON
 * omit the slug and the `.md` half falls back to the hash.
 *
 * Every write goes through `writeAtomic` — write to `<path>.tmp` then
 * rename — so a mid-write crash leaves the previous version intact.
 * Directories are created on demand.
 */

import { appendFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { PATHS } from '../shared/paths.js';

// ---------------------------------------------------------------------------
// Repo-relative dir constants
// ---------------------------------------------------------------------------

/** Root for canonical JSON artifacts INSIDE the repo. Hidden (dot-
 *  prefix) so it doesn't clutter the repo tree, but git-tracked so
 *  a shared reviewer sees exactly what the daemon produced. */
export const ARTIFACTS_DIR = '.insrc/artifacts';

/** Human-facing markdown roots. */
export const DEFINES_DIR = 'docs/defines';
export const DESIGNS_DIR = 'docs/designs';
export const PLANS_DIR   = 'docs/plans';
export const STUB_DIR    = 'docs/stub';

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

// ---------------------------------------------------------------------------
// Canonical artifact IDs (hash-based) + in-markdown resolution marker
// ---------------------------------------------------------------------------

/** Filename-safe segment. Slugs from `deriveSlug` are already
 *  `[a-z0-9-]`; this only guards the hash fallback and any stray
 *  caller input against path separators / odd characters. */
function fileSeg(s: string): string {
	const cleaned = s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
	return cleaned.length > 0 ? cleaned : 'artifact';
}

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

/** Paths for a Define artifact: markdown (named by `epicSlug`) in
 *  `docs/defines/`, canonical JSON (named by `epicHash`) in
 *  `.insrc/artifacts/`. Omit `epicSlug` when only the JSON is needed —
 *  the markdown half then falls back to the hash. */
export function defineArtifactPaths(repoPath: string, epicHash: string, epicSlug?: string): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   join(repoPath, DEFINES_DIR,   `DEF-${fileSeg(epicSlug ?? epicHash)}.md`),
		json: join(repoPath, ARTIFACTS_DIR, `${defineArtifactId(epicHash)}.json`),
	};
}

/** Paths for an HLD (design.epic) artifact. See `defineArtifactPaths`
 *  for the slug-vs-hash split. */
export function hldArtifactPaths(repoPath: string, epicHash: string, epicSlug?: string): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   join(repoPath, DESIGNS_DIR,   `HLD-${fileSeg(epicSlug ?? epicHash)}.md`),
		json: join(repoPath, ARTIFACTS_DIR, `${hldArtifactId(epicHash)}.json`),
	};
}

/** Paths for an LLD (design.story) artifact — one per Story. See
 *  `defineArtifactPaths` for the slug-vs-hash split; `epicSlug` is the
 *  trailing optional so existing `(repo, hash, storyId)` callers that
 *  only read the JSON keep working. */
export function lldArtifactPaths(
	repoPath: string,
	epicHash: string,
	storyId:  string,
	epicSlug?: string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   join(repoPath, DESIGNS_DIR,   `LLD-${fileSeg(epicSlug ?? epicHash)}-${storyId}.md`),
		json: join(repoPath, ARTIFACTS_DIR, `${lldArtifactId(epicHash, storyId)}.json`),
	};
}

/** Paths for a Plan (`plan`) artifact — one per Story. Slug-named
 *  markdown under `docs/plans/`, canonical hash-named JSON under
 *  `.insrc/artifacts/`. The direct peer of `lldArtifactPaths`; `epicSlug`
 *  is the trailing optional so `(repo, hash, storyId)` JSON-only callers
 *  keep working. */
export function planArtifactPaths(
	repoPath: string,
	epicHash: string,
	storyId:  string,
	epicSlug?: string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   join(repoPath, PLANS_DIR,     `PLAN-${fileSeg(epicSlug ?? epicHash)}-${storyId}.md`),
		json: join(repoPath, ARTIFACTS_DIR, `${planArtifactId(epicHash, storyId)}.json`),
	};
}

/** Filename prefix that identifies every Plan belonging to an Epic. */
export function planFilenamePrefix(epicHash: string): string {
	return `PLAN-${epicHash}-`;
}

/** Canonical id + paths for an Extend artifact (`define` extend branch).
 *  One per (Epic, new Story). Markdown under `docs/designs/` (slug), JSON
 *  under `.insrc/artifacts/` (hash). */
export function extendArtifactId(epicHash: string, storyId: string): string { return `EXT-${epicHash}-${storyId}`; }
export function extendArtifactPaths(repoPath: string, epicHash: string, storyId: string, epicSlug?: string): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   join(repoPath, DESIGNS_DIR,   `EXT-${fileSeg(epicSlug ?? epicHash)}-${storyId}.md`),
		json: join(repoPath, ARTIFACTS_DIR, `${extendArtifactId(epicHash, storyId)}.json`),
	};
}

/** Where the `scope.assess` step caches its analyze bundles (outside the
 *  repo, keyed by Epic hash) so the later design phase can reuse the
 *  exploration instead of re-running analyze. */
export function scopeAnalyzeCachePath(epicHash: string): string {
	return join(runsDirFor(epicHash), 'scope-analyze.json');
}

/** Repo-relative markdown paths (slug-based), for links embedded in
 *  GitHub issue bodies. Single source of the doc-path naming so the
 *  links can't drift from the actual filenames. */
export function defineMdRel(epicSlug: string): string { return `${DEFINES_DIR}/DEF-${fileSeg(epicSlug)}.md`; }
export function hldMdRel(epicSlug: string): string { return `${DESIGNS_DIR}/HLD-${fileSeg(epicSlug)}.md`; }
export function lldMdRel(epicSlug: string, storyId: string): string { return `${DESIGNS_DIR}/LLD-${fileSeg(epicSlug)}-${storyId}.md`; }

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
