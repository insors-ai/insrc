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
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import ignore from 'ignore';

import { getLogger } from '../shared/logger.js';
import type { CompletionOpts, LLMMessage, LLMResponse } from '../shared/types.js';
import { detectRepoType, repoTypeIgnoreDirs } from './repo-type.js';

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

/** True for a generated-or-minified file by this Story's own pattern. A
 *  caller that needs to tell "excluded because of the ignore rules /
 *  .insrc" apart from "excluded because it's generated" (e.g. the index's
 *  clean-up pass, which only ever removed a stale entity for the former —
 *  the full walk's OWN not-code/generated-file check, in file-selection.ts,
 *  already keeps such a file unindexed without deleting any pre-existing
 *  row for it) can subtract this from a `false` `includes()` result. */
export function isGeneratedOrMinifiedFile(absPath: string): boolean {
	return GENERATED_FILE_PATTERN.test(absPath);
}

function isBuiltInExcluded(absPath: string, repoPath: string): boolean {
	if (isGeneratedOrMinifiedFile(absPath)) return true;
	const rel = relative(repoPath, absPath);
	if (isGitDir(rel)) return true;
	return rel === '.insrc' || rel.startsWith(`.insrc${sep}`);
}

/** Git's own repository directory (and a submodule's or worktree's `.git`
 *  link file) at any depth: git never treats it as content and never reads
 *  ignore rules inside it, so neither does this filter. */
function isGitDir(rel: string): boolean {
	return rel.split(sep).includes('.git');
}

// ---------------------------------------------------------------------------
// git's tracked-file list
// ---------------------------------------------------------------------------

interface TrackedSets {
	readonly files: ReadonlySet<string>;
	readonly dirs: ReadonlySet<string>;
}

const EMPTY_TRACKED: TrackedSets = { files: new Set(), dirs: new Set() };

/** The git working tree `absPath` lies in: the nearest directory, itself
 *  or an ancestor, holding a `.git` entry (a directory, or the link file of
 *  a worktree or submodule). Undefined outside any git working tree. A
 *  repository registered at a subdirectory of a git working tree is judged
 *  by that tree's rules and tracked files, as `git ls-files` run there is. */
function gitRootOf(absPath: string): string | undefined {
	for (let d = absPath; ; d = dirname(d)) {
		if (existsSync(join(d, '.git'))) return d;
		if (dirname(d) === d) return undefined;
	}
}

/** `git ls-files --cached` for `repoPath`, as absolute paths, plus every
 *  ancestor directory of a tracked file up to (and including) `repoPath` —
 *  so a directory query answers true when it holds a tracked descendant.
 *  Empty outside a git working tree, or when the git call fails (logged at
 *  warn — error path 3: a tracked file inside a corrupted/missing-git
 *  repo degrades, in this one failure case, to ignore-rules-alone, the
 *  same as a genuinely non-git folder). Run in `repoPath`, git lists only
 *  the files under it, relative to it. */
function trackedSetsFor(repoPath: string): TrackedSets {
	if (gitRootOf(resolve(repoPath)) === undefined) return EMPTY_TRACKED;

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
 *  default (`$XDG_CONFIG_HOME/git/ignore`, `~/.config/git/ignore` when that
 *  is unset) when git is not configured with one.
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
	const xdgHome = process.env['XDG_CONFIG_HOME'];
	const xdgDefault = join(xdgHome !== undefined && xdgHome.length > 0 ? xdgHome : join(homedir(), '.config'), 'git', 'ignore');
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
		// git: a pattern with a separator at its start or in its middle is
		// relative to its own .gitignore's directory (a leading `/` is dropped
		// before prefixing); one with none -- a trailing `/` does not count --
		// matches at any level below that directory, so it gets `**/`.
		const relativeToDir = body.replace(/\/$/, '').includes('/');
		const anchored = body.startsWith('/') ? body.slice(1) : relativeToDir ? body : `**/${body}`;
		ig.add(`${negated ? '!' : ''}${prefix}${anchored}`);
	}
}

interface RuleWalkResult {
	readonly ig: Ignore;
	readonly files: string[];
	readonly dirsWithIncludedDescendant: Set<string>;
	/** Directories below `repoPath` holding their own `.git`: another
	 *  repository (a submodule, a vendored clone), whose files git does not
	 *  list as this one's, so neither does this filter. */
	readonly nestedRepos: Set<string>;
	/** Directories the walk did not enter: the rules exclude them and git
	 *  tracks nothing under them. */
	readonly prunedDirs: Set<string>;
}

/** One combined walk: collects nested `.gitignore` rules top-down (not
 *  descending into a directory already excluded unless git tracks
 *  something under it), and — using the ruleset as it stands once a
 *  directory is reached, which is always complete for that directory and
 *  everything above it — decides every file's inclusion in the same pass,
 *  recording the ancestor directories of every included file. */
function walk(repoPath: string, ruleRoot: string, ig: Ignore, tracked: TrackedSets): RuleWalkResult {
	const files: string[] = [];
	const dirsWithIncludedDescendant = new Set<string>();
	const nestedRepos = new Set<string>();
	const prunedDirs = new Set<string>();

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
		const relDir = relative(ruleRoot, dir);
		const giPath = join(dir, '.gitignore');
		if (existsSync(giPath)) addPrefixed(ig, readRuleLines(giPath), relDir);

		let entries;
		try { entries = readdirSync(dir, { withFileTypes: true }); }
		catch { return; }

		for (const entry of entries) {
			const abs = join(dir, entry.name);
			const rel = relative(ruleRoot, abs).split(sep).join('/');
			if (entry.name === '.git') continue;
			if (entry.isDirectory()) {
				const ruleExcluded = ig.ignores(`${rel}/`);
				if (ruleExcluded && !tracked.dirs.has(abs)) { prunedDirs.add(abs); continue; }
				if (existsSync(join(abs, '.git'))) { nestedRepos.add(abs); continue; }
				visit(abs);
			} else if (entry.isFile() || (entry.isSymbolicLink() && isFileTarget(abs))) {
				// git lists a symbolic link as an entry of its own and never
				// follows one into a directory: a link to a file is a file here.
				if (isBuiltInExcluded(abs, repoPath)) continue;
				const included = tracked.files.has(abs) || !ig.ignores(rel);
				if (included) markIncluded(abs);
			}
		}
	};
	visit(repoPath);

	return { ig, files, dirsWithIncludedDescendant, nestedRepos, prunedDirs };
}

function isFileTarget(absLink: string): boolean {
	try { return statSync(absLink).isFile(); } catch { return false; }
}

// ---------------------------------------------------------------------------
// createFileFilter
// ---------------------------------------------------------------------------

interface FileFilterState {
	readonly ig: Ignore;
	readonly tracked: TrackedSets;
	/** What patterns are matched relative to: the enclosing git working
	 *  tree's root, else `repoPath` itself. */
	readonly ruleRoot: string;
	readonly nestedRepos: ReadonlySet<string>;
	readonly prunedDirs: ReadonlySet<string>;
	files: string[];
	dirsWithIncludedDescendant: Set<string>;
	/** The content digest ('' when absent) of each rule file the walk does
	 *  not visit -- the clone's exclude file, the global ignore file, and the
	 *  .gitignore files of the git working tree above `repoPath` -- as read
	 *  when this state was built. */
	readonly outsideRuleDigests: ReadonlyMap<string, string>;
}

const stateByFilter = new WeakMap<FileFilter, FileFilterState>();

/** The repo's real ignore sources: nested `.gitignore` files (root first),
 *  `.git/info/exclude`, and the user's global gitignore. */
function sourcesFor(repoPath: string): RuleSource[] {
	const ruleFiles: string[] = [];
	const excludeFile = join(gitRootOf(repoPath) ?? repoPath, '.git', 'info', 'exclude');
	if (existsSync(excludeFile)) ruleFiles.push(excludeFile);
	const global = globalIgnoreFile(repoPath);
	if (global !== undefined) ruleFiles.push(global);
	ruleFiles.push(join(repoPath, '.gitignore'));   // the root one is always a candidate; nested ones are discovered by the walk
	return [{ name: 'git', ruleFiles }];
}

/** Reads every rule source from disk and walks `absRepo` to build a fresh
 *  `FileFilterState` — the full computation `createFileFilter` and
 *  `refreshFileFilter` (Story s6/t3) both need. */
function buildState(absRepo: string): FileFilterState {
	const tracked = trackedSetsFor(absRepo);
	const gitRoot = gitRootOf(absRepo);
	const ruleRoot = gitRoot ?? absRepo;

	// Lowest precedence first: in one `ignore` matcher the last matching
	// pattern wins, and git ranks the global file below the clone's exclude
	// file, both below every .gitignore.
	const ig = ignore();
	const global = globalIgnoreFile(absRepo);
	const exclude = gitRoot !== undefined ? join(gitRoot, '.git', 'info', 'exclude') : undefined;
	if (global !== undefined) addPrefixed(ig, readRuleLines(global), '');
	if (exclude !== undefined) addPrefixed(ig, readRuleLines(exclude), '');
	// A repository registered below its git working tree's root: the
	// .gitignore files above it, root first, as git reads them.
	const above: string[] = [];
	for (let d = dirname(absRepo); gitRoot !== undefined && d.length >= gitRoot.length; d = dirname(d)) {
		above.unshift(join(d, '.gitignore'));
		if (d === gitRoot) break;
	}
	for (const gi of above) addPrefixed(ig, readRuleLines(gi), relative(ruleRoot, dirname(gi)));

	const { files, dirsWithIncludedDescendant, nestedRepos, prunedDirs } = walk(absRepo, ruleRoot, ig, tracked);
	// Rule files a watcher event may never name (the exclude file lies under
	// .git, the others outside the repository): a change is found by content.
	const outside = [...(exclude !== undefined ? [exclude] : []), ...(global !== undefined ? [global] : []), ...above];
	return {
		ig, tracked, ruleRoot, nestedRepos, prunedDirs, files, dirsWithIncludedDescendant,
		outsideRuleDigests: new Map(outside.map(f => [f, fileDigest(f)])),
	};
}

/** `abs` relative to the state's rule root, '/'-separated; undefined for a
 *  path outside `repoPath`, or inside a nested repository. */
function ruleRelative(state: FileFilterState, absRepo: string, abs: string): string | undefined {
	const inRepo = relative(absRepo, abs);
	if (inRepo.startsWith('..') || resolve(absRepo, inRepo) !== abs) return undefined;
	for (const nested of state.nestedRepos) {
		if (abs === nested || abs.startsWith(`${nested}${sep}`)) return undefined;
	}
	return relative(state.ruleRoot, abs).split(sep).join('/');
}

function fileDigest(path: string): string {
	try { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
	catch { return ''; }
}

/**
 * Builds the filter by reading the repo's real ignore files from disk and
 * (when `repoPath/.git` exists) the tracked-file set via `git ls-files
 * --cached`. For a non-git `repoPath` the tracked-file override is simply
 * empty and the ignore-file rules alone decide inclusion (ac9).
 */
export function createFileFilter(repoPath: string): FileFilter {
	const absRepo = resolve(repoPath);

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
			// A path outside repoPath (e.g. a watcher event reported under a
			// different resolution of a symlinked temp dir than absRepo), or in
			// a nested repository, is never included -- and `ignore` throws on
			// a `..`-escaping pathname.
			const rel = ruleRelative(state, absRepo, abs);
			if (rel === undefined || abs === absRepo) return false;
			// The rules first: a path they exclude needs no stat (a burst of
			// events under node_modules/ costs no file-system call).
			if (state.ig.ignores(rel)) return false;
			let isDir = false;
			try { isDir = statSync(abs).isDirectory(); } catch { /* path may not exist yet */ }
			return !isDir;   // a directory: not tracked, no recorded included descendant, so empty of included content
		},
		listFiles(): string[] {
			const state = stateByFilter.get(filter);
			return state === undefined ? [] : [...state.files];
		},
	};
	stateByFilter.set(filter, buildState(absRepo));
	return filter;
}

/**
 * Whether a walker should not descend into `absDir`: the same pruning
 * decision the filter's own walk makes -- a built-in exclusion, or a
 * directory the ignore rules exclude that holds nothing git tracks. Unlike
 * `includes()` on a directory, an empty or unreadable directory is NOT
 * excluded here, so a walker still reports a directory it could not read
 * (Epic c2ba6fa6 s6/t8: the analyzer's walkers).
 */
export function excludesDirectory(filter: FileFilter, absDir: string): boolean {
	const state = stateByFilter.get(filter);
	if (state === undefined) return true;
	const abs = resolve(absDir);
	if (isBuiltInExcluded(abs, filter.repoPath)) return true;
	if (state.tracked.dirs.has(abs) || state.dirsWithIncludedDescendant.has(abs)) return false;
	if (abs === filter.repoPath) return false;
	const rel = ruleRelative(state, filter.repoPath, abs);
	if (rel === undefined) return true;
	return state.ig.ignores(`${rel}/`);
}

/**
 * The directories a file watcher need not watch at all, as absolute paths,
 * sorted: every directory the filter's walk did not enter (excluded by the
 * rules, nothing tracked under it), every nested repository, and the daemon's
 * own `.insrc`. Nothing below them is ever included while the rules stand, so
 * native ignores lose no event the filter would pass -- and a large
 * `node_modules/` costs no watches (s6 code review). The answer changes when
 * the filter is refreshed; the watcher re-reads it then.
 */
export function nativelyIgnoredPaths(filter: FileFilter): string[] {
	const state = stateByFilter.get(filter);
	if (state === undefined) return [];
	return [...new Set([...state.prunedDirs, ...state.nestedRepos, join(filter.repoPath, '.insrc')])].sort();
}

// ---------------------------------------------------------------------------
// refreshFileFilter
// ---------------------------------------------------------------------------

/** `{ left, entered }` — the files that newly left and newly entered the
 *  included set, per sc4's own `FilterChange` shape. */
/**
 * The ignore file whose change requires `refreshFileFilter` before a batch of
 * file events is evaluated (Epic c2ba6fa6 s6/t10, ac5), or undefined: a
 * `.gitignore` at any depth of the repository among `changedPaths`, else the
 * clone's exclude file or the global ignore file when its content differs
 * from what the filter was built from.
 */
export function changedIgnoreFile(filter: FileFilter, changedPaths: readonly string[]): string | undefined {
	for (const p of changedPaths) {
		const abs = resolve(p);
		const rel = relative(filter.repoPath, abs);
		if (rel === '' || rel.startsWith('..') || isGitDir(rel)) continue;
		// One inside a directory the rules already exclude (a tool's cache
		// writes its own) changes nothing git reads.
		if (basename(abs) === '.gitignore' && !excludesDirectory(filter, dirname(abs))) return abs;
	}
	// The paths resolved when the filter was built: no git subprocess per batch.
	for (const [f, digest] of stateByFilter.get(filter)?.outsideRuleDigests ?? []) {
		if (digest !== fileDigest(f)) return f;
	}
	return undefined;
}

export interface FilterChange {
	readonly left: string[];
	readonly entered: string[];
}

/**
 * Recomputes `filter`'s rules + tracked-file override from disk, in place,
 * after `changedIgnoreFile` (one of its `.gitignore` files, the clone's
 * `.git/info/exclude`, or the user's global gitignore) changed content —
 * no repo re-registration. `filter.includes()` reflects the new content for
 * every call that follows (ac5). A full rebuild is the smallest correct
 * implementation here: rebuilding only the changed directory's own rules
 * is not enough, because a nested `.gitignore` change can also move the
 * tracked-file / built-in-independent decision for files the walk would
 * now (or no longer) reach by itself.
 */
export function refreshFileFilter(filter: FileFilter, changedIgnoreFile: string): FilterChange {
	const prevFiles = new Set(stateByFilter.get(filter)?.files ?? []);
	const next = buildState(filter.repoPath);
	stateByFilter.set(filter, next);

	const nextFiles = new Set(next.files);
	const left = [...prevFiles].filter(f => !nextFiles.has(f));
	const entered = [...nextFiles].filter(f => !prevFiles.has(f));
	log.debug({ repo: filter.repoPath, changedIgnoreFile, left: left.length, entered: entered.length }, 'file filter refreshed');
	return { left, entered };
}

export { walk as _walkForFileFilter, trackedSetsFor as _trackedSetsFor };

// ---------------------------------------------------------------------------
// proposeIgnoreFile
// ---------------------------------------------------------------------------

/** The narrow slice of `LLMProvider` (`shared/types.ts`) `proposeIgnoreFile`
 *  needs — any real cheap-tier provider satisfies this structurally, with
 *  no adapter. */
export interface CheapTierModel {
	complete(messages: LLMMessage[], opts?: CompletionOpts): Promise<LLMResponse>;
}

export interface IgnoreFileProposal {
	readonly written: boolean;
	readonly source: 'model' | 'fallback';
	readonly reason?: string;
}

/** The universal base entries every repo gets, written when a repo has no
 *  root ignore file and the model proposal is unavailable or unusable. */
function fallbackIgnoreContent(repoPath: string): string {
	const base = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.insrc']);
	for (const d of repoTypeIgnoreDirs(detectRepoType(repoPath))) base.add(d);
	return [...base].sort().map(d => `${d}/`).join('\n') + '\n';
}

/** A pattern that would leave out the whole repository (or every file). */
const CATCH_ALL_PATTERNS = new Set(['*', '**', '/*', '/**', '**/*', '/', '.', './', '*/', '**/']);

/** The model's reply as ignore-file content, or undefined when it is not
 *  usable: markdown fence lines are dropped; what is left must have at least
 *  one pattern, no line that reads as prose (a line with whitespace in it is
 *  not a valid gitignore pattern), and no pattern that would leave out the
 *  whole repository. */
function usableIgnoreContent(text: string): string | undefined {
	const kept = text.split('\n').filter(l => !l.trim().startsWith('```'));
	const patterns = kept.map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
	if (patterns.length === 0) return undefined;
	if (!patterns.every(l => !/\s/.test(l) && !CATCH_ALL_PATTERNS.has(l))) return undefined;
	return `${kept.join('\n').trim()}\n`;
}

/** How long a repository add waits for the model's proposal before it
 *  writes the plain fallback file instead. */
const PROPOSAL_TIMEOUT_MS = 120_000;

/**
 * Proposes a root ignore file for `repoPath` when none exists, asking
 * `model` (the cheap tier) for entries fit to the repo's detected
 * languages/tools. Never touches an existing root ignore file (ac8) and
 * never throws: a model failure, timeout, or malformed response falls
 * back to a plain universal-base ignore file instead (ac7, lc2) — the
 * repository add this gates is never failed by it.
 */
export async function proposeIgnoreFile(repoPath: string, model: CheapTierModel, timeoutMs: number = PROPOSAL_TIMEOUT_MS): Promise<IgnoreFileProposal> {
	const rootIgnorePath = join(repoPath, '.gitignore');
	if (existsSync(rootIgnorePath)) {
		return { written: false, source: 'fallback', reason: 'a root ignore file already exists' };
	}

	const types = detectRepoType(repoPath);
	let modelText: string | undefined;
	const abort = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const timedOut = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => {
				abort.abort();
				reject(new Error(`no proposal within ${timeoutMs} ms`));
			}, timeoutMs);
		});
		const response = await Promise.race([model.complete([
			{
				role: 'system',
				content: 'You write .gitignore files. Reply with ONLY the file content: one pattern per line, no prose, no markdown fences.',
			},
			{
				role: 'user',
				content: `Propose a .gitignore for a repository at "${repoPath}"${types.length > 0 ? ` detected as: ${types.join(', ')}` : ''}. Cover build output, dependency, and cache directories typical for these languages/tools.`,
			},
		], { signal: abort.signal }), timedOut]);
		modelText = response.text;
	} catch (err) {
		log.warn({ repoPath, err: err instanceof Error ? err.message : String(err) }, 'proposeIgnoreFile: model call failed; writing fallback ignore file');
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}

	const proposed = modelText !== undefined ? usableIgnoreContent(modelText) : undefined;
	const usable = proposed !== undefined;
	const content = proposed ?? fallbackIgnoreContent(repoPath);
	const source: IgnoreFileProposal['source'] = usable ? 'model' : 'fallback';
	const reason = usable ? undefined : (modelText === undefined ? 'the model call failed' : 'the model response was not usable ignore-file content');

	try {
		writeFileSync(rootIgnorePath, content, 'utf8');
	} catch (err) {
		// A write failure must not fail the repo add -- the filter still
		// works without a root ignore file (sources[0].ruleFiles simply
		// has nothing to read), just as a non-git folder does.
		log.warn({ repoPath, err: err instanceof Error ? err.message : String(err) }, 'proposeIgnoreFile: could not write the ignore file');
		return { written: false, source, reason: reason ?? 'the ignore file could not be written' };
	}

	return reason === undefined ? { written: true, source } : { written: true, source, reason };
}
