/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S001 · T003 — `assembleCodeReviewGrounding` (the sc2 producer).
 *
 * Turns the Story's changed-file set into structured `ChangedSymbolSummary`
 * rows from the LMDB graph — signatures + caller/callee + test-reaching edges,
 * NEVER raw file contents (k6). The producer is daemon-internal; consumers reach
 * it only via IPC (T004), so no other surface opens the stores (k5).
 *
 * Behaviour the LLD pins:
 *   - one row PER ENTITY, keyed by entityId (a file with multiple entities
 *     yields multiple rows sharing the same file path);
 *   - a changed file with NO indexed entities is OMITTED from the rows but is
 *     NOT dropped from the subject (the omission is observable, not silently
 *     treated as "no changes");
 *   - test-reaching = the callers whose defining file is a test file (there is
 *     no dedicated TESTS relation; test entities call the code they exercise via
 *     CALLS, and are identified by their file path).
 *
 * The graph reads are factored behind an injectable `GroundingDeps` seam so the
 * unit tests exercise the assembly logic against a small in-memory graph fixture
 * (the fake seam); the default wires the real `getGraphStore` scan +
 * `inNeighbors`/`outNeighbors`. All reads only — nothing mutates the store.
 */

import type { CodeReviewGrounding, ChangedSymbolSummary } from './types.js';
import { gitDiffTool } from '../../daemon/tools/builtins/git/diff.js';
import type { GitDiffData, GitDiffFileStat } from '../../daemon/tools/builtins/git/diff.js';
import type { ToolDeps } from '../../daemon/tools/types.js';
import { getLogger } from '../../shared/logger.js';
import { storyChangeSet, type StoryChangeSet } from '../runners/build/story-commits.js';

const log = getLogger('workflow:code-review:grounding');

/** A graph entity, flattened to just what a summary/edge needs. */
export interface GroundedEntity {
	readonly id:        string;   // stable entity identity (the u64 id, stringified)
	readonly file:      string;   // repo-relative defining file
	readonly kind:      string;
	readonly name:      string;
	readonly signature: string;
}

/** The graph-read seams `assembleCodeReviewGrounding` composes. */
export interface GroundingDeps {
	/** Entities DEFINED in `file` (empty when the file has no indexed entities). */
	readonly entitiesInFile: (repoPath: string, file: string) => Promise<readonly GroundedEntity[]>;
	/** Entities that CALL the entity `entityId`. */
	readonly callersOf:      (repoPath: string, entityId: string) => Promise<readonly GroundedEntity[]>;
	/** Entities the entity `entityId` CALLS. */
	readonly calleesOf:      (repoPath: string, entityId: string) => Promise<readonly GroundedEntity[]>;
}

/** A defining file counts as a test file when it matches the repo's test
 *  convention (`__tests__/` dir or a `.test.` / `.spec.` suffix). */
export function isTestFile(file: string): boolean {
	return /(^|\/)__tests__\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

/**
 * Assemble the daemon-served grounding for the Story's changed files. Read-only.
 * The dimension stories (s2-s5) reason over these summaries, never raw text.
 */
export async function assembleCodeReviewGrounding(
	repoPath:     string,
	changedFiles: readonly string[],
	deps:         GroundingDeps,
): Promise<CodeReviewGrounding> {
	const symbols: ChangedSymbolSummary[] = [];

	// Serial (no Promise.all): keep provider/store access ordered (k4 discipline).
	for (const file of changedFiles) {
		const entities = await deps.entitiesInFile(repoPath, file);
		for (const ent of entities) {
			const callers = await deps.callersOf(repoPath, ent.id);
			const callees = await deps.calleesOf(repoPath, ent.id);
			const testsReaching = callers.filter(c => isTestFile(c.file));
			symbols.push({
				entityId:      ent.id,
				file:          ent.file,
				kind:          ent.kind,
				name:          ent.name,
				signature:     ent.signature,
				callers:       callers.map(c => c.name),
				callees:       callees.map(c => c.name),
				testsReaching: testsReaching.map(c => c.name),
			});
		}
	}

	return { symbols };
}

// ---------------------------------------------------------------------------
// Real default seam — wires the LMDB graph. Read-only.
// ---------------------------------------------------------------------------

/** Build the real `GroundingDeps` backed by the graph store. Lazy-imports the
 *  graph layer so the pure assembler + its unit tests never open the env. */
export async function realGroundingDeps(): Promise<GroundingDeps> {
	const { getGraphStore }              = await import('../../db/graph/store.js');
	const { decodeEntityRow }            = await import('../../db/graph/codec.js');
	const { decodeEntityKey }            = await import('../../db/graph/keys.js');
	const { inNeighbors, outNeighbors }  = await import('../../db/graph/edges.js');

	const toGrounded = (idU64: bigint, row: { filePath: string; kind: string; name: string; signature: string }): GroundedEntity => ({
		id:        idU64.toString(),
		file:      row.filePath,
		kind:      String(row.kind),
		name:      row.name,
		signature: row.signature,
	});

	const rowById = async (idU64: bigint): Promise<GroundedEntity | null> => {
		const store = await getGraphStore();
		const { encodeEntityKey } = await import('../../db/graph/keys.js');
		const val = store.entity.get(encodeEntityKey(idU64));
		if (!val) return null;
		return toGrounded(idU64, decodeEntityRow(val as Buffer));
	};

	return {
		async entitiesInFile(_repoPath, file) {
			const store = await getGraphStore();
			const out: GroundedEntity[] = [];
			for (const { key, value } of store.entity.getRange()) {
				const row = decodeEntityRow(value as Buffer);
				if (row.filePath === file) out.push(toGrounded(decodeEntityKey(key as Buffer), row));
			}
			return out;
		},
		async callersOf(_repoPath, entityId) {
			const ids = await inNeighbors(BigInt(entityId), { kindFilter: ['CALLS'] });
			const out: GroundedEntity[] = [];
			for (const id of ids) { const r = await rowById(id); if (r) out.push(r); }
			return out;
		},
		async calleesOf(_repoPath, entityId) {
			const ids = await outNeighbors(BigInt(entityId), { kindFilter: ['CALLS'] });
			const out: GroundedEntity[] = [];
			for (const id of ids) { const r = await rowById(id); if (r) out.push(r); }
			return out;
		},
	};
}

// ---------------------------------------------------------------------------
// s10 — the DIFF-ONLY (degraded) grounding assembler.
//
// When the index cannot be made fresh and the user declines to wait (the s9
// confirm_wait/timeout decline), the code-review stage falls back to reviewing
// the changed-file DIFF directly rather than graph symbol summaries. This
// assembler is the sc2 producer for that path: it derives the changed set from
// the working-tree diff, falls back to the last commit (`git_diff {from:'HEAD^'}`,
// then the root commit) when the tree is clean, and emits a `CodeReviewGrounding`
// whose `symbols[]` is ONE synthesized `ChangedSymbolSummary` PER CHANGED FILE
// (kind:'file', name:the file, the file's unified-diff hunks carried in
// `signature`, caller/callee/test edges empty). The four dimension prompt
// builders serialize `grounding.symbols` UNCHANGED, so they consume this diff
// grounding exactly as they consume the graph grounding — the record is marked
// `groundingMode:'degraded'` so a downstream reader knows the review reasoned
// over hunks, not entities. Read-only throughout (git_diff never mutates).
// ---------------------------------------------------------------------------

/** Git's canonical empty-tree object — diffing it against HEAD yields the whole
 *  root commit, so a single-commit repo (no HEAD^) is still reviewable. */
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** One resolved diff: the per-file numstat + the raw unified-diff body (hunks). */
export interface DiffResult {
	readonly files: readonly GitDiffFileStat[];
	readonly body:  string;
	readonly truncated: boolean;
	/** Per-file hunk text already split by the producer (ISSUE-f9ced66a). When
	 *  present it is used instead of splitting `body`, so a file assembled from
	 *  several diffs keeps every section and a marker stays on its own file. */
	readonly hunksByFile?: ReadonlyMap<string, string> | undefined;
}

/** Raised by a diff seam that cannot read a diff at all (not a git repository /
 *  git failed on BOTH the working-tree read and the last-commit fallback). The
 *  caller maps it to a `diff-unavailable` error — a diff that cannot be read must
 *  never silently produce an empty degraded pass. */
export class DiffUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DiffUnavailableError';
	}
}

/** The injectable git seams the diff assembler composes. Defaults wire the real
 *  `git_diff` builtin; tests supply fakes so the assembler is exercised without a
 *  real repo. Both are READ-ONLY. */
export interface DiffGroundingDeps {
	/** The working-tree changed set (unstaged ∪ staged) + its hunks. Empty `files`
	 *  ⇒ a clean tree (the caller falls back to `lastCommitDiff`); a git failure
	 *  throws `DiffUnavailableError`. */
	readonly workingTreeDiff: (repoPath: string, excludeGlobs?: readonly string[]) => Promise<DiffResult>;
	/** The last commit's changed set + hunks (`HEAD^..HEAD`, else the root commit
	 *  vs the empty tree). A git failure throws `DiffUnavailableError`. */
	readonly lastCommitDiff:  (repoPath: string, excludeGlobs?: readonly string[]) => Promise<DiffResult>;
	/** The Story's committed range `base..HEAD` + its hunks (ISSUE-5f7a7cb9).
	 *  OPTIONAL so seams written before it existed stay valid; without it the
	 *  assembler behaves as if no base were known. A git failure throws
	 *  `DiffUnavailableError`. */
	readonly rangeDiff?: ((repoPath: string, base: string, excludeGlobs?: readonly string[]) => Promise<DiffResult>) | undefined;
}

/** What the degraded review knows about the Story it is reviewing. Both fields
 *  are optional; with neither, the assembler makes exactly the calls it made
 *  before they existed. */
export interface DiffGroundingOptions {
	/** The Story's range base. With a clean (after exclusion) working tree the
	 *  reviewed diff is `base..HEAD` instead of only the last commit. */
	readonly base?: string | undefined;
	/** Globs git leaves out of every diff, so excluded hunks never count against
	 *  the diff body cap. */
	readonly excludeGlobs?: readonly string[] | undefined;
}

/**
 * Assemble the diff-only (degraded) grounding for the Story's changed set.
 * Read-only. Derives the changed set from the working-tree diff; when that is
 * empty (a clean tree, e.g. after build → commit → review) it falls back to the
 * last commit. Emits one per-file pseudo-`ChangedSymbolSummary` carrying the
 * file's hunks. An empty result is a valid grounding (`symbols:[]`), NOT an
 * error; a git failure on both paths propagates as `DiffUnavailableError`.
 */
export async function assembleDiffCodeReviewGrounding(
	repoPath: string,
	deps:     DiffGroundingDeps = realDiffGroundingDeps(),
	opts?:    DiffGroundingOptions,
): Promise<{ grounding: CodeReviewGrounding; changedFiles: readonly string[] }> {
	const globs = opts?.excludeGlobs !== undefined && opts.excludeGlobs.length > 0 ? opts.excludeGlobs : undefined;
	const base  = opts?.base !== undefined && opts.base.length > 0 && deps.rangeDiff !== undefined ? opts.base : undefined;

	// One sequence, run with progressively less asked of git. With neither a
	// base nor globs every call below passes ONE argument, so it is exactly the
	// sequence this function has always run.
	const sequence = async (b: string | undefined, g: readonly string[] | undefined): Promise<DiffResult> => {
		const working = g !== undefined ? await deps.workingTreeDiff(repoPath, g) : await deps.workingTreeDiff(repoPath);
		if (working.files.length > 0) return working;
		// Clean working tree. With the Story's base, review its whole committed
		// range — and let that result STAND even when it is empty: a Story that
		// changed only ledger files has nothing to review, and the last commit
		// would be somebody else's.
		if (b !== undefined && deps.rangeDiff !== undefined) return deps.rangeDiff(repoPath, b, g);
		// No base: fall back to the last commit (HEAD^..HEAD, else root).
		return g !== undefined ? deps.lastCommitDiff(repoPath, g) : deps.lastCommitDiff(repoPath);
	};

	// The base and the exclusions each ask more of git than the old sequence did
	// (a resolvable commit; exclude pathspecs it accepts). Neither may become a
	// new way for the review to be unavailable, so a failure steps down, and the
	// last step is the old sequence. Only ITS failure leaves this function.
	const attempts: ReadonlyArray<{ readonly label: string; readonly base: string | undefined; readonly globs: readonly string[] | undefined }> = [
		...(base !== undefined ? [{ label: 'range base + exclusions', base, globs }] : []),
		...(globs !== undefined ? [{ label: 'exclusions only', base: undefined, globs }] : []),
		{ label: 'plain working-tree / last-commit sequence', base: undefined, globs: undefined },
	];
	let diff: DiffResult | undefined;
	for (const [i, attempt] of attempts.entries()) {
		try {
			diff = await sequence(attempt.base, attempt.globs);
			break;
		} catch (err) {
			const next = attempts[i + 1];
			if (!(err instanceof DiffUnavailableError) || next === undefined) throw err;
			log.warn(
				{ repoPath, failed: attempt.label, fallingBackTo: next.label, err: err.message },
				'assembleDiffCodeReviewGrounding: diff derivation failed; falling back to a plainer one',
			);
		}
	}
	const symbols = buildDiffSymbols(diff as DiffResult);
	return { grounding: { symbols }, changedFiles: symbols.map(s => s.file) };
}

/** Turn a resolved diff into one per-file pseudo-`ChangedSymbolSummary`. A binary
 *  file carries a marker in place of hunks; a text file carries its unified-diff
 *  section. Caller/callee/test edges are empty (there is no graph on this path). */
function buildDiffSymbols(diff: DiffResult): ChangedSymbolSummary[] {
	const byFile = diff.hunksByFile ?? splitDiffByFile(diff.body);
	const truncNote = diff.truncated ? '\n[diff truncated — reviewed over a bounded slice]' : '';
	return diff.files.map((f): ChangedSymbolSummary => {
		const hunks = f.change === 'binary'
			? `[binary file changed — no textual hunks]`
			: (byFile.get(f.path) ?? byFile.get(f.origPath ?? '') ?? `[no hunk text for ${f.path}]`);
		return {
			entityId:      `diff:${f.path}`,
			file:          f.path,
			kind:          'file',
			name:          f.path,
			signature:     hunks + truncNote,
			callers:       [],
			callees:       [],
			testsReaching: [],
		};
	});
}

/** Split a unified-diff body into per-file sections keyed by the new (`b/`) path.
 *  Robust to the deterministic `git diff --no-color` output the builtin emits. */
function splitDiffByFile(body: string): Map<string, string> {
	const map = new Map<string, string>();
	if (!body) return map;
	for (const section of body.split(/^(?=diff --git )/m)) {
		if (!section.startsWith('diff --git')) continue;
		const m = section.match(/^diff --git a\/(.+?) b\/(.+?)\s*$/m);
		const path = m?.[2];
		if (path) map.set(path, section.trimEnd());
	}
	return map;
}

/** Extract the raw unified-diff body from a `git_diff` builtin result. The builtin
 *  renders the hunks inside a ```diff fenced block in its `output`; this pulls
 *  that block back out verbatim. */
function extractDiffBody(output: string): string {
	const m = output.match(/```diff\n([\s\S]*?)\n```/);
	return m?.[1] ?? '';
}

/** Run one `git_diff` invocation and return its resolved {@link DiffResult}. Throws
 *  {@link DiffUnavailableError} when the builtin reports a git failure. */
async function runDiff(repoPath: string, input: Record<string, unknown>): Promise<DiffResult> {
	const toolDeps: ToolDeps = { sessionId: 'code-review', repoPath, send: () => {}, requestId: 0 };
	const res = await gitDiffTool.execute({ cwd: repoPath, ...input }, toolDeps);
	if (!res.success) {
		throw new DiffUnavailableError(`git_diff failed for ${repoPath}: ${res.error ?? res.output}`);
	}
	const data = res.data as GitDiffData | undefined;
	if (!data) throw new DiffUnavailableError(`git_diff returned no data for ${repoPath}`);
	return { files: data.files, body: extractDiffBody(res.output), truncated: data.truncated };
}

/** The `exclude` input for `git_diff`, or nothing at all when there are no
 *  globs — so a call without them sends exactly the input it always sent. */
function excludeInput(globs: readonly string[] | undefined): { exclude?: string[] } {
	return globs !== undefined && globs.length > 0 ? { exclude: [...globs] } : {};
}

/**
 * The Story's committed range as ONE {@link DiffResult} carrying only the
 * Story's own hunks (ISSUE-f9ced66a). Paths no merge touched get one net
 * `base..HEAD` diff limited to them. A path a merge also changed gets, instead,
 * the diff of each Story unit that touched it, in order, so no merged-in line
 * reaches the reviewer. A path edited inside a merge commit is marked. Every call
 * carries the same exclusions. An empty change set makes no git call at all.
 */
export async function storyRangeDiff(
	repoPath:     string,
	base:         string,
	set:          StoryChangeSet,
	excludeGlobs: readonly string[] | undefined,
	run:          (repoPath: string, input: Record<string, unknown>) => Promise<DiffResult> = runDiff,
): Promise<DiffResult> {
	if (set.paths.length === 0) return { files: [], body: '', truncated: false, hunksByFile: new Map() };

	const shared = new Set(set.sharedPaths);
	const sections = new Map<string, string[]>();
	const stats = new Map<string, GitDiffFileStat>();
	let truncated = false;
	const collect = (d: DiffResult): void => {
		truncated ||= d.truncated;
		const split = splitDiffByFile(d.body);
		for (const f of d.files) {
			const prior = stats.get(f.path);
			stats.set(f.path, prior === undefined ? f : { ...prior, insertions: prior.insertions + f.insertions, deletions: prior.deletions + f.deletions });
			const section = split.get(f.path) ?? split.get(f.origPath ?? '');
			if (section !== undefined) sections.set(f.path, [...(sections.get(f.path) ?? []), section]);
		}
	};

	const plain = set.paths.filter(p => !shared.has(p));
	if (plain.length > 0) collect(await run(repoPath, { from: base, paths: plain, ...excludeInput(excludeGlobs) }));
	for (const unit of set.units) {
		const own = unit.paths.filter(p => shared.has(p));
		if (own.length > 0) collect(await run(repoPath, { from: unit.from, to: unit.to, paths: own, ...excludeInput(excludeGlobs) }));
	}

	const foldedIn = new Map<string, string>();
	for (const unit of set.units) {
		if (unit.kind !== 'merge-edit') continue;
		for (const p of unit.paths) if (!foldedIn.has(p)) foldedIn.set(p, unit.ref.slice(0, 12));
	}
	const hunksByFile = new Map<string, string>();
	for (const [path, parts] of sections) {
		const merge = foldedIn.get(path);
		hunksByFile.set(path, `${merge !== undefined ? `[edited inside merge commit ${merge}]\n` : ''}${parts.join('\n')}`);
	}
	const files = set.paths.flatMap(p => { const f = stats.get(p); return f !== undefined ? [f] : []; });
	return { files, body: [...sections.values()].flat().join('\n'), truncated, hunksByFile };
}

/** The real diff seams, backed by the `git_diff` builtin. Read-only. */
export function realDiffGroundingDeps(): DiffGroundingDeps {
	return {
		async workingTreeDiff(repoPath, excludeGlobs) {
			// Union the unstaged + staged diffs (matches subject.ts's changed set).
			const unstaged = await runDiff(repoPath, { staged: false, ...excludeInput(excludeGlobs) });
			const staged   = await runDiff(repoPath, { staged: true, ...excludeInput(excludeGlobs) });
			const byPath = new Map<string, GitDiffFileStat>();
			for (const f of [...unstaged.files, ...staged.files]) byPath.set(f.path, f);
			const body = [unstaged.body, staged.body].filter(Boolean).join('\n');
			return { files: [...byPath.values()], body, truncated: unstaged.truncated || staged.truncated };
		},
		async lastCommitDiff(repoPath, excludeGlobs) {
			// HEAD^..HEAD (the last commit). If HEAD has no parent (a single-commit
			// repo), diff the empty tree against HEAD so the root commit is reviewable.
			try {
				return await runDiff(repoPath, { from: 'HEAD^', ...excludeInput(excludeGlobs) });
			} catch (err) {
				if (!(err instanceof DiffUnavailableError)) throw err;
				return await runDiff(repoPath, { from: EMPTY_TREE_HASH, ...excludeInput(excludeGlobs) });
			}
		},
		async rangeDiff(repoPath, base, excludeGlobs) {
			let set: StoryChangeSet;
			try {
				set = storyChangeSet(repoPath, base);
			} catch (err) {
				throw new DiffUnavailableError(`the Story's change set is unavailable for ${repoPath}: ${err instanceof Error ? err.message : String(err)}`);
			}
			return storyRangeDiff(repoPath, base, set, excludeGlobs);
		},
	};
}
