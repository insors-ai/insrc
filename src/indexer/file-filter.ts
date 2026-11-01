/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s6 (sc4) — the one rule for what the index leaves out.
 *
 * `FileFilter` is an in-process gitignore-grammar matcher built from a
 * repository's real ignore files: its nested `.gitignore` files (root
 * first), its clone's own `.git/info/exclude`, and the user's global
 * gitignore. It is unioned with git's own tracked-file list (`git
 * ls-files --cached`) so a file git tracks is always included even when a
 * pattern rule would otherwise exclude it — the stakeholder-decided
 * override this Story enforces. A non-git `repoPath` has no tracked-file
 * list, so inclusion is decided by the ignore-file rules alone.
 *
 * Two built-in exclusions apply inside `includes()` regardless of what the
 * rule sources say: a generated-or-minified file, and anything under the
 * daemon's own `.insrc` directory.
 *
 * Nested `.gitignore` files are composed into ONE `ignore` package matcher
 * by prefixing each file's patterns with its own directory (relative to
 * `repoPath`) before adding them — the standard technique for using the
 * `ignore` package across a multi-directory tree, and it reproduces git's
 * own precedence (a pattern added later — i.e. from a deeper directory —
 * wins over an earlier, shallower one for the same path). The walk that
 * collects these patterns does not descend into a directory the
 * accumulated rules so far already exclude, UNLESS git tracks something
 * under it: matching git's own real behaviour (once a directory is
 * ignored, git does not look inside it for more rules, tracked content
 * aside), and giving this filter the same performance shape (a `.gitignore`
 * that excludes `node_modules` early stops this walk from ever reading it).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ignore from 'ignore';

import { getLogger } from '../shared/logger.js';

type Ignore = ReturnType<typeof ignore>;

const log = getLogger('indexer:file-filter');

// ---------------------------------------------------------------------------
// sc4 public types
// ---------------------------------------------------------------------------

/** One named source of ignore rules. This Story supplies exactly one
 *  (`name: 'git'`); the shape allows a later Story to add a second source,
 *  which this Story does not. */
export interface RuleSource {
	readonly name: string;
	readonly ruleFiles: string[];
}

/** Applied inside `FileFilter.includes()` regardless of what the rule
 *  sources say. */
export type BuiltInExclusion = 'generated-or-minified' | 'insrc-directory';

export interface FileFilter {
	readonly repoPath: string;
	readonly sources: RuleSource[];
	readonly builtIn: BuiltInExclusion[];
	/** True for an included file, and for a directory that holds any
	 *  included file (so a directory query reads as git itself would). */
	includes(absolutePath: string): boolean;
	/** Every included file under `repoPath`. */
	listFiles(): string[];
}

/** The same pattern `GENERATED_FILE_PATTERN` in `file-selection.ts` tests —
 *  kept as its own copy here so this module does not depend on
 *  `file-selection.ts` (which, after Story s6's later tasks, depends on
 *  this one instead). */
const GENERATED_FILE_PATTERN = /\.(min|bundle|dist|production|prod)\.(js|mjs|cjs|css|html|json)$|[-_]min\.(js|mjs|cjs|css)$/i;

function isBuiltInExcluded(absPath: string, repoPath: string): boolean {
	if (GENERATED_FILE_PATTERN.test(absPath)) return true;
	const rel = relative(repoPath, absPath);
	return rel === '.insrc' || rel.startsWith(`.insrc${sep}`);
}

// ---------------------------------------------------------------------------
// git's tracked-file list
// ---------------------------------------------------------------------------

interface TrackedSets {
	readonly files: ReadonlySet<string>;
	readonly dirs: ReadonlySet<string>;
}

const EMPTY_TRACKED: TrackedSets = { files: new Set(), dirs: new Set() };

/** `git ls-files --cached` for `repoPath`, as absolute paths, plus every
 *  ancestor directory of a tracked file up to (and including) `repoPath` —
 *  so a directory query answers true when it holds a tracked descendant.
 *  Empty for a non-git `repoPath`, or when the git call fails (logged at
 *  warn — error path 3: a tracked file inside a corrupted/missing-git
 *  repo degrades, in this one failure case, to ignore-rules-alone, the
 *  same as a genuinely non-git folder). */
function trackedSetsFor(repoPath: string): TrackedSets {
	if (!existsSync(join(repoPath, '.git'))) return EMPTY_TRACKED;

	let stdout: string;
	try {
		stdout = execFileSync(
			'git',
			['ls-files', '--cached', '-z'],
			{ cwd: repoPath, maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' },
		);
	} catch (err) {
		log.warn({ repo: repoPath, err: String(err) }, 'git ls-files --cached failed; tracked-file override is empty');
		return EMPTY_TRACKED;
	}

	const files = new Set<string>();
	const dirs = new Set<string>();
	dirs.add(resolve(repoPath));
	for (const rel of stdout.split('\0').filter(Boolean)) {
		const abs = resolve(repoPath, rel);
		files.add(abs);
		let dir = dirname(abs);
		while (dir.length >= repoPath.length && !dirs.has(dir)) {
			dirs.add(dir);
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}
	return { files, dirs };
}

// ---------------------------------------------------------------------------
// Rule-file discovery (git's three ignore sources)
// ---------------------------------------------------------------------------

/** `git config --get core.excludesFile`, expanded; falls back to the XDG
 *  default (`~/.config/git/ignore`) when git is not configured with one.
 *  Never throws — a missing git binary or an unset config is simply "no
 *  global ignore file", not an error. */
function globalIgnoreFile(repoPath: string): string | undefined {
	try {
		const configured = execFileSync('git', ['config', '--get', 'core.excludesFile'], {
			cwd: repoPath, encoding: 'utf8',
		}).trim();
		if (configured.length > 0) {
			return configured.startsWith('~') ? join(homedir(), configured.slice(1)) : resolve(repoPath, configured);
		}
	} catch {
		// Not configured, or git itself unavailable — fall through to the default.
	}
	const xdgDefault = join(homedir(), '.config', 'git', 'ignore');
	return existsSync(xdgDefault) ? xdgDefault : undefined;
}

function readRuleLines(path: string): string[] {
	try {
		return readFileSync(path, 'utf8').split('\n');
	} catch {
		return [];
	}
}

/** Add `.gitignore` lines to `ig`, each pattern prefixed with `dirRelPath`
 *  (relative to the repo root, `''` for the root itself) so one combined
 *  matcher reproduces nested-`.gitignore` semantics — a negation's `!` stays
 *  first, the prefix moves after it. */
function addPrefixed(ig: Ignore, lines: readonly string[], dirRelPath: string): void {
	const prefix = dirRelPath === '' ? '' : `${dirRelPath.split(sep).join('/')}/`;
	for (const raw of lines) {
		const line = raw.trimEnd();
		if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue;
		if (prefix === '') { ig.add(line); continue; }
		const negated = line.startsWith('!');
		const body = negated ? line.slice(1) : line;
		// A pattern already anchored to the repo root (leading `/`) still
		// only ever meant "anchored to ITS OWN directory" in a nested
		// .gitignore, so the leading slash is dropped before prefixing.
		const anchored = body.startsWith('/') ? body.slice(1) : body;
		ig.add(`${negated ? '!' : ''}${prefix}${anchored}`);
	}
}

interface RuleWalkResult {
	readonly ig: Ignore;
	readonly files: string[];
	readonly dirsWithIncludedDescendant: Set<string>;
}

/** One combined walk: collects nested `.gitignore` rules top-down (not
 *  descending into a directory already excluded unless git tracks
 *  something under it), and — using the ruleset as it stands once a
 *  directory is reached, which is always complete for that directory and
 *  everything above it — decides every file's inclusion in the same pass,
 *  recording the ancestor directories of every included file. */
function walk(repoPath: string, ig: Ignore, tracked: TrackedSets): RuleWalkResult {
	const files: string[] = [];
	const dirsWithIncludedDescendant = new Set<string>();

	const markIncluded = (absFile: string): void => {
		files.push(absFile);
		let dir = dirname(absFile);
		while (dir.length >= repoPath.length && !dirsWithIncludedDescendant.has(dir)) {
			dirsWithIncludedDescendant.add(dir);
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	};

	const visit = (dir: string): void => {
		const relDir = relative(repoPath, dir);
		const giPath = join(dir, '.gitignore');
		if (existsSync(giPath)) addPrefixed(ig, readRuleLines(giPath), relDir);

		let entries;
		try { entries = readdirSync(dir, { withFileTypes: true }); }
		catch { return; }

		for (const entry of entries) {
			const abs = join(dir, entry.name);
			const rel = relative(repoPath, abs).split(sep).join('/');
			if (entry.isDirectory()) {
				const ruleExcluded = ig.ignores(`${rel}/`);
				if (ruleExcluded && !tracked.dirs.has(abs)) continue;
				visit(abs);
			} else if (entry.isFile()) {
				if (isBuiltInExcluded(abs, repoPath)) continue;
				const included = tracked.files.has(abs) || !ig.ignores(rel);
				if (included) markIncluded(abs);
			}
		}
	};
	visit(repoPath);

	return { ig, files, dirsWithIncludedDescendant };
}

// ---------------------------------------------------------------------------
// createFileFilter
// ---------------------------------------------------------------------------

interface FileFilterState {
	readonly ig: Ignore;
	readonly tracked: TrackedSets;
	files: string[];
	dirsWithIncludedDescendant: Set<string>;
}

const stateByFilter = new WeakMap<FileFilter, FileFilterState>();

/** The repo's real ignore sources: nested `.gitignore` files (root first),
 *  `.git/info/exclude`, and the user's global gitignore. */
function sourcesFor(repoPath: string): RuleSource[] {
	const ruleFiles: string[] = [];
	const excludeFile = join(repoPath, '.git', 'info', 'exclude');
	if (existsSync(excludeFile)) ruleFiles.push(excludeFile);
	const global = globalIgnoreFile(repoPath);
	if (global !== undefined) ruleFiles.push(global);
	ruleFiles.push(join(repoPath, '.gitignore'));   // the root one is always a candidate; nested ones are discovered by the walk
	return [{ name: 'git', ruleFiles }];
}

/**
 * Builds the filter by reading the repo's real ignore files from disk and
 * (when `repoPath/.git` exists) the tracked-file set via `git ls-files
 * --cached`. For a non-git `repoPath` the tracked-file override is simply
 * empty and the ignore-file rules alone decide inclusion (ac9).
 */
export function createFileFilter(repoPath: string): FileFilter {
	const absRepo = resolve(repoPath);
	const tracked = trackedSetsFor(absRepo);

	const ig = ignore();
	addPrefixed(ig, readRuleLines(join(absRepo, '.git', 'info', 'exclude')), '');
	const global = globalIgnoreFile(absRepo);
	if (global !== undefined) addPrefixed(ig, readRuleLines(global), '');

	const { files, dirsWithIncludedDescendant } = walk(absRepo, ig, tracked);

	const filter: FileFilter = {
		repoPath: absRepo,
		sources: sourcesFor(absRepo),
		builtIn: ['generated-or-minified', 'insrc-directory'],
		includes(absolutePath: string): boolean {
			const state = stateByFilter.get(filter);
			if (state === undefined) return false;
			const abs = resolve(absolutePath);
			if (isBuiltInExcluded(abs, absRepo)) return false;
			if (state.tracked.files.has(abs) || state.tracked.dirs.has(abs)) return true;
			if (state.dirsWithIncludedDescendant.has(abs)) return true;
			let isDir = false;
			try { isDir = statSync(abs).isDirectory(); } catch { /* path may not exist yet */ }
			if (isDir) return false;   // not tracked, no recorded included descendant: empty of included content
			const rel = relative(absRepo, abs).split(sep).join('/');
			return !state.ig.ignores(rel);
		},
		listFiles(): string[] {
			const state = stateByFilter.get(filter);
			return state === undefined ? [] : [...state.files];
		},
	};
	stateByFilter.set(filter, { ig, tracked, files, dirsWithIncludedDescendant });
	return filter;
}

/** Internal: lets `refreshFileFilter` (Story s6/t3) replace a filter's
 *  cached state in place after an ignore file changes on disk. */
export function _setFileFilterState(filter: FileFilter, state: FileFilterState): void {
	stateByFilter.set(filter, state);
}

/** Internal: lets `refreshFileFilter` read a filter's current cached state. */
export function _getFileFilterState(filter: FileFilter): FileFilterState | undefined {
	return stateByFilter.get(filter);
}

export { walk as _walkForFileFilter, trackedSetsFor as _trackedSetsFor };
