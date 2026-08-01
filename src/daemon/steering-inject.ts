/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Steering-block injection — the daemon-side writer that `repo.add` uses to
 * install the insrc steering block into a target repo's `CLAUDE.md` /
 * `AGENTS.md`, so controllers (Claude Code / Codex) are steered to use
 * `insrc_triage` / `insrc_workflow_run` / `insrc_review_step`.
 *
 * Design (LLD `make-repo-add-write-insrc-steering`, alternative a2 —
 * orchestration-layer writer; `db/repos.ts` stays free of fs side effects):
 *
 *  - SAFE idempotent marker-delimited upsert. The block is written ONLY between
 *    `<!-- insrc:steering:start -->` / `<!-- insrc:steering:end -->` markers:
 *    create the file if absent; if the markers are present, replace ONLY the
 *    region between them; if the file exists without markers, APPEND the marked
 *    block after the existing content. Surrounding user content is never
 *    clobbered. Malformed markers (open without close, or duplicate opens) leave
 *    the file byte-for-byte untouched.
 *  - PER-FILE selection: the caller (client prompt) chooses CLAUDE.md and/or
 *    AGENTS.md independently — nothing is written unless explicitly selected.
 *  - The block content is the shipped `prompts/steering-block.md` asset (copied
 *    to `out/prompts/` by copy-assets), resolved relative to this module.
 */

import { existsSync, readFileSync } from 'node:fs';
import { readFile as fsReadFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listRepos as listRegisteredRepos } from '../db/repos.js';
import { getLogger } from '../shared/logger.js';
import type { RegisteredRepo, SteeringSelection } from '../shared/types.js';

export type { SteeringSelection };

const log = getLogger('daemon:steering-inject');

export const STEERING_MARKER_START = '<!-- insrc:steering:start -->';
export const STEERING_MARKER_END   = '<!-- insrc:steering:end -->';

export type SteeringAction = 'created' | 'replaced' | 'unchanged' | 'skipped';

export interface SteeringFileOutcome {
	readonly file:   string;   // absolute path
	readonly action: SteeringAction;
	readonly note?:  string;   // present for a guarded no-op (malformed / duplicate markers)
}

// ---------------------------------------------------------------------------
// Block content (shipped asset)
// ---------------------------------------------------------------------------

/** `out/daemon/steering-inject.js` → `out/prompts/steering-block.md`
 *  (and `src/daemon/…` → `src/prompts/…` under tsx). copy-assets ships
 *  `prompts/` as a sibling of `daemon/` in both trees. */
function steeringBlockPath(): string {
	return join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'steering-block.md');
}

/** Read the canonical steering block body (trimmed). Throws if the asset is
 *  missing or empty — the caller guards so registration never fails on it. */
export function readSteeringBlock(): string {
	const path = steeringBlockPath();
	const raw = readFileSync(path, 'utf8').trim();
	if (raw.length === 0) throw new Error(`steering block asset is empty: ${path}`);
	return raw;
}

/** Wrap the block body in the insrc:steering markers. */
export function renderMarkedSection(block: string): string {
	return `${STEERING_MARKER_START}\n${block}\n${STEERING_MARKER_END}`;
}

// ---------------------------------------------------------------------------
// Pure upsert — the marker logic + never-clobber invariant (fully testable)
// ---------------------------------------------------------------------------

export interface UpsertResult {
	readonly content: string | null;   // null ⇒ do not write (unchanged / guarded)
	readonly action:  SteeringAction;
	readonly note?:   string;
}

/** Compute the new file content for a marker-delimited steering upsert.
 *  `existing` is the current file text, or `null` when the file is absent.
 *  PURE — no filesystem. Returns `content:null` when nothing should be written
 *  (idempotent no-op or a guarded malformed/duplicate-marker case). */
export function upsertMarkedSection(existing: string | null, block: string): UpsertResult {
	const section = renderMarkedSection(block);

	// Absent file → create with only the marked section.
	if (existing === null) {
		return { content: section + '\n', action: 'created' };
	}

	const opens  = countOccurrences(existing, STEERING_MARKER_START);
	const closes = countOccurrences(existing, STEERING_MARKER_END);

	// No marker yet → append the marked section, preserving existing content.
	if (opens === 0 && closes === 0) {
		const sep = existing.endsWith('\n') ? '\n' : '\n\n';
		return { content: existing + sep + section + '\n', action: 'created' };
	}

	// Guard: ambiguous / malformed markers → never guess, never clobber.
	if (opens > 1 || closes > 1) {
		return { content: null, action: 'unchanged', note: 'duplicate insrc:steering markers — left untouched; de-duplicate manually' };
	}
	const startIdx = existing.indexOf(STEERING_MARKER_START);
	const endIdx   = existing.indexOf(STEERING_MARKER_END);
	if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
		return { content: null, action: 'unchanged', note: 'malformed insrc:steering markers (open without matching close) — left untouched' };
	}

	// Replace ONLY the region between (and including) the markers.
	const before = existing.slice(0, startIdx);
	const after  = existing.slice(endIdx + STEERING_MARKER_END.length);
	const next   = before + section + after;
	if (next === existing) {
		return { content: null, action: 'unchanged' };   // idempotent — block already current
	}
	return { content: next, action: 'replaced' };
}

function countOccurrences(haystack: string, needle: string): number {
	let n = 0;
	let i = haystack.indexOf(needle);
	while (i !== -1) { n++; i = haystack.indexOf(needle, i + needle.length); }
	return n;
}

/** REPLACE-ONLY sibling of `upsertMarkedSection`. Same marker-detection +
 *  duplicate/malformed guards, but a repo that has NOT opted in — an absent
 *  file, or a file with no insrc:steering markers — is left alone
 *  (`action:'skipped'`, `content:null`) instead of gaining a block. This is the
 *  refresh path: `daemon-ctl.sh update` re-stamps the block into repos that
 *  ALREADY carry it, and never silently installs it into a repo that opted out.
 *  PURE — no filesystem. */
export function refreshMarkedSection(existing: string | null, block: string): UpsertResult {
	// Opt-out: absent file → never create on refresh.
	if (existing === null) {
		return { content: null, action: 'skipped' };
	}

	const opens  = countOccurrences(existing, STEERING_MARKER_START);
	const closes = countOccurrences(existing, STEERING_MARKER_END);

	// Opt-out: file present but no marker → never append on refresh.
	if (opens === 0 && closes === 0) {
		return { content: null, action: 'skipped' };
	}

	// Guard: ambiguous / malformed markers → never guess, never clobber.
	if (opens > 1 || closes > 1) {
		return { content: null, action: 'unchanged', note: 'duplicate insrc:steering markers — left untouched; de-duplicate manually' };
	}
	const startIdx = existing.indexOf(STEERING_MARKER_START);
	const endIdx   = existing.indexOf(STEERING_MARKER_END);
	if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
		return { content: null, action: 'unchanged', note: 'malformed insrc:steering markers (open without matching close) — left untouched' };
	}

	// Replace ONLY the region between (and including) the markers.
	const section = renderMarkedSection(block);
	const before  = existing.slice(0, startIdx);
	const after   = existing.slice(endIdx + STEERING_MARKER_END.length);
	const next    = before + section + after;
	if (next === existing) {
		return { content: null, action: 'unchanged' };   // idempotent — block already current
	}
	return { content: next, action: 'replaced' };
}

// ---------------------------------------------------------------------------
// injectSteeringBlock — the file writer
// ---------------------------------------------------------------------------

/** Upsert the steering block into the selected files at `repoRoot`. Only the
 *  files the caller selected are considered; each is handled independently so
 *  one file's I/O failure never aborts the sibling. Never throws for a per-file
 *  I/O error (records the outcome + logs). The block-asset read failure DOES
 *  throw — the caller (repo.add) guards it so registration never fails. */
export async function injectSteeringBlock(
	repoRoot:  string,
	selection: SteeringSelection,
): Promise<{ files: SteeringFileOutcome[] }> {
	const targets: Array<{ file: string; selected: boolean }> = [
		{ file: join(repoRoot, 'CLAUDE.md'),  selected: selection.claude === true },
		{ file: join(repoRoot, 'AGENTS.md'),  selected: selection.agents === true },
	];
	if (!targets.some(t => t.selected)) {
		return { files: targets.map(t => ({ file: t.file, action: 'skipped' as const })) };
	}

	const block = readSteeringBlock();   // throws → caller guards (no partial write)
	const files: SteeringFileOutcome[] = [];

	for (const t of targets) {
		if (!t.selected) { files.push({ file: t.file, action: 'skipped' }); continue; }
		try {
			const existing = existsSync(t.file) ? readFileSync(t.file, 'utf8') : null;
			const res = upsertMarkedSection(existing, block);
			if (res.content !== null) {
				await writeFile(t.file, res.content, 'utf8');
			}
			files.push({ file: t.file, action: res.action, ...(res.note !== undefined ? { note: res.note } : {}) });
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log.warn({ file: t.file, err: msg }, 'steering injection failed for a file (registration unaffected)');
			files.push({ file: t.file, action: 'skipped', note: `write failed: ${msg}` });
		}
	}
	return { files };
}

// ---------------------------------------------------------------------------
// refreshSteeringAcrossRepos — re-stamp the block into every opted-in repo
// ---------------------------------------------------------------------------

/** Injectable seams for the across-repos refresh walk. All four are overridable
 *  so the walk is testable without touching the registry or the filesystem;
 *  `refreshSteeringAcrossRepos` fills any omitted member with a production
 *  default (registry `listRepos`, shipped `readSteeringBlock`, node fs). */
export interface SteeringRefreshDeps {
	/** The registered workspace repos to walk. */
	readonly listRepos: () => Promise<readonly RegisteredRepo[]>;
	/** The canonical steering-block body to stamp. */
	readonly readBlock: () => string;
	/** Read a repo file; resolve `null` when it is absent (an opt-out signal). */
	readonly readFile:  (path: string) => Promise<string | null>;
	/** Persist refreshed file content. */
	readonly writeFile: (path: string, content: string) => Promise<void>;
}

/** Flat per-file outcome list across every walked repo. */
export type SteeringRefreshReport = readonly SteeringFileOutcome[];

/** Production defaults for the refresh walk — the real registry + node fs. The
 *  default `readFile` maps ENOENT to `null` (opt-out), rethrowing every other
 *  error so the walk's per-file guard records it as a skipped note. */
function defaultSteeringRefreshDeps(): SteeringRefreshDeps {
	return {
		listRepos: () => listRegisteredRepos(undefined),
		readBlock: readSteeringBlock,
		readFile:  async (path) => {
			try {
				return await fsReadFile(path, 'utf8');
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
				throw err;
			}
		},
		writeFile: (path, content) => writeFile(path, content, 'utf8'),
	};
}

/** Re-stamp the current steering block into the `CLAUDE.md` / `AGENTS.md` of
 *  every registered repo that ALREADY carries the markers — the refresh
 *  counterpart to `injectSteeringBlock`. REPLACE-only (via `refreshMarkedSection`):
 *  a repo that opted out (file absent or unmarked) is never given a block.
 *
 *  Each repo's two files are handled independently: a per-file read/write
 *  failure is caught, recorded as a `skipped` outcome with a note, and the walk
 *  CONTINUES to the remaining files/repos rather than aborting. Writes happen
 *  ONLY when a file's block is stale (`action === 'replaced'`).
 *
 *  `readBlock` / `listRepos` failures propagate (the caller,
 *  `runUpdateSteeringRefresh`, wraps the whole call best-effort). */
export async function refreshSteeringAcrossRepos(
	deps: Partial<SteeringRefreshDeps> = {},
): Promise<SteeringRefreshReport> {
	const d: SteeringRefreshDeps = { ...defaultSteeringRefreshDeps(), ...deps };
	const block = d.readBlock();                 // may throw → caller guards
	const repos = await d.listRepos();           // may reject → caller guards
	const outcomes: SteeringFileOutcome[] = [];

	for (const repo of repos) {
		for (const name of ['CLAUDE.md', 'AGENTS.md'] as const) {
			const file = join(repo.path, name);
			try {
				const existing = await d.readFile(file);
				const res = refreshMarkedSection(existing, block);
				if (res.action === 'replaced' && res.content !== null) {
					await d.writeFile(file, res.content);
				}
				outcomes.push({ file, action: res.action, ...(res.note !== undefined ? { note: res.note } : {}) });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				log.warn({ file, err: msg }, 'steering refresh failed for a file (walk continues)');
				outcomes.push({ file, action: 'skipped', note: `refresh failed: ${msg}` });
			}
		}
	}
	return outcomes;
}
