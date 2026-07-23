/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-repo ignore config — the externalized source of truth for which
 * directories the indexer's file-walker + the file-watcher skip.
 *
 * Lives at `<repo>/.insrc/config.json` under an `ignore` array. Because the
 * watcher/walker now skip the `.insrc` directory itself, the config file never
 * self-indexes. On `repo.add` it is INITIALIZED (idempotent — never overwrites
 * an existing `ignore`):
 *   - always the universal base (`IGNORE_DIRS`: .git, .insrc, node_modules, out …)
 *   - PLUS, if the repo has a `.gitignore`, its directory entries (so the
 *     watcher matches what the git-aware walker already honours), ELSE the
 *     repo-type defaults (java → target/build, python → __pycache__/.venv, …).
 *
 * `resolveRepoIgnore` is the read path used by the indexer; it falls back to
 * `IGNORE_DIRS` when a repo has no config yet (older registrations).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getLogger } from '../shared/logger.js';
import { projectConfigBase } from '../config/paths.js';
import { writeAtomic } from '../workflow/storage.js';
import { IGNORE_DIRS } from './watcher.js';
import { detectRepoType, repoTypeIgnoreDirs } from './repo-type.js';

const log = getLogger('repo-ignore-config');

interface RepoConfigFile {
	ignore?: string[];
	[key: string]: unknown;   // preserve unrelated keys on write-back
}

/** `<repo>/.insrc/config.json`. */
export function repoConfigPath(repoRoot: string): string {
	return join(projectConfigBase(repoRoot), 'config.json');
}

function loadRepoConfig(repoRoot: string): RepoConfigFile | null {
	const path = repoConfigPath(repoRoot);
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
		return typeof parsed === 'object' && parsed !== null ? parsed as RepoConfigFile : null;
	} catch (err) {
		log.warn({ repoRoot, err: err instanceof Error ? err.message : String(err) }, 'repo config unreadable; using defaults');
		return null;
	}
}

/** The ignore dir-name list for `repoRoot` — the persisted config's `ignore`
 *  if present + non-empty, else the universal `IGNORE_DIRS` default. */
export function resolveRepoIgnore(repoRoot: string): string[] {
	const cfg = loadRepoConfig(repoRoot);
	if (cfg?.ignore !== undefined && cfg.ignore.length > 0) return cfg.ignore;
	return [...IGNORE_DIRS];
}

/** Parse directory-style entries from `<repo>/.gitignore` (bare dir names only —
 *  strip leading/trailing `/`, skip negations, comments, globs, and nested
 *  paths; the git-aware walker already handles the full grammar, this just
 *  feeds the watcher the coarse dir names). */
export function gitignoreDirs(repoRoot: string): string[] {
	const path = join(repoRoot, '.gitignore');
	if (!existsSync(path)) return [];
	const dirs = new Set<string>();
	for (const raw of readFileSync(path, 'utf8').split('\n')) {
		const line = raw.trim();
		if (line.length === 0 || line.startsWith('#') || line.startsWith('!')) continue;
		const name = line.replace(/^\//, '').replace(/\/$/, '');
		if (name.length === 0 || name.includes('/') || name.includes('*') || name.startsWith('.') && name.length === 1) continue;
		dirs.add(name);
	}
	return [...dirs];
}

/** Initialize (idempotently) the repo's ignore config. Returns the effective
 *  ignore list. Never overwrites an existing non-empty `ignore`. */
export function initRepoIgnore(repoRoot: string): string[] {
	const existing = loadRepoConfig(repoRoot);
	if (existing?.ignore !== undefined && existing.ignore.length > 0) {
		return existing.ignore;   // respect a user-authored / prior config
	}

	const ignore = new Set<string>(IGNORE_DIRS);   // universal base — always
	const gi = gitignoreDirs(repoRoot);
	if (gi.length > 0) {
		for (const d of gi) ignore.add(d);          // precedence: .gitignore
	} else {
		for (const d of repoTypeIgnoreDirs(detectRepoType(repoRoot))) ignore.add(d);  // else repo-type
	}
	const list = [...ignore].sort();

	try {
		writeAtomic(repoConfigPath(repoRoot), JSON.stringify({ ...(existing ?? {}), ignore: list }, null, 2) + '\n');
		log.info({ repoRoot, count: list.length, source: gi.length > 0 ? 'gitignore' : 'repo-type' }, 'initialized repo ignore config');
	} catch (err) {
		// A write failure must not fail repo registration — fall back to the
		// in-memory list (resolveRepoIgnore will use IGNORE_DIRS next time).
		log.warn({ repoRoot, err: err instanceof Error ? err.message : String(err) }, 'could not persist repo ignore config');
	}
	return list;
}
