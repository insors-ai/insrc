/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Storage helpers for workflow artifacts + run logs.
 *
 * Split between two on-disk locations:
 *
 *   docs/                    — human-facing markdown only
 *     defines/DEF-<h16>.md
 *     designs/HLD-<h16>.md
 *     designs/LLD-<h16>-<storyId>.md
 *
 *   .insrc/artifacts/        — canonical JSON, hidden, git-tracked
 *     DEF-<h16>.json
 *     HLD-<h16>.json
 *     LLD-<h16>-<storyId>.json
 *     AMD-<h16>-<n>.json     — Phase E amendments
 *
 *   ~/.insrc/workflow-runs/  — trace logs, OUTSIDE the repo, ephemeral
 *     <epicHash>/<workflow>-<runId>.jsonl
 *
 * `<h16>` is the canonical 16-char Epic hash (see `workflow/hash.ts`).
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
// Artifact paths — per workflow shape
// ---------------------------------------------------------------------------

/** `stub` writes to `docs/stub/<slug>.{md,json}` since it's a demo
 *  workflow that doesn't have an Epic hash. */
export function stubArtifactPaths(repoPath: string, slug: string): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   join(repoPath, STUB_DIR, `${slug}.md`),
		json: join(repoPath, STUB_DIR, `${slug}.json`),
	};
}

/** Paths for a Define artifact: markdown in `docs/defines/`,
 *  canonical JSON in `.insrc/artifacts/`. */
export function defineArtifactPaths(repoPath: string, epicHash: string): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   join(repoPath, DEFINES_DIR,   `DEF-${epicHash}.md`),
		json: join(repoPath, ARTIFACTS_DIR, `DEF-${epicHash}.json`),
	};
}

/** Paths for an HLD (design.epic) artifact. */
export function hldArtifactPaths(repoPath: string, epicHash: string): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   join(repoPath, DESIGNS_DIR,   `HLD-${epicHash}.md`),
		json: join(repoPath, ARTIFACTS_DIR, `HLD-${epicHash}.json`),
	};
}

/** Paths for an LLD (design.story) artifact — one per Story. */
export function lldArtifactPaths(
	repoPath: string,
	epicHash: string,
	storyId:  string,
): {
	readonly md:   string;
	readonly json: string;
} {
	return {
		md:   join(repoPath, DESIGNS_DIR,   `LLD-${epicHash}-${storyId}.md`),
		json: join(repoPath, ARTIFACTS_DIR, `LLD-${epicHash}-${storyId}.json`),
	};
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
