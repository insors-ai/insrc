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

import type { ChangeSetAttribution, CodeReviewGrounding, ChangedSymbolSummary } from './types.js';
import { buildDiffArgv, gitDiffTool } from '../../daemon/tools/builtins/git/diff.js';
import type { GitDiffData, GitDiffFileStat } from '../../daemon/tools/builtins/git/diff.js';
import { runShell } from '../../daemon/tools/shell-helper.js';
import type { DiffOpts } from '../../daemon/tools/builtins/git/diff.js';
import type { ToolDeps } from '../../daemon/tools/types.js';
import { splitDiffRow, validateDiffFragments } from './diff-spans.js';
import { getLogger } from '../../shared/logger.js';
import { storyChangeSet, type AttributedStoryChangeSet, type StoryAttribution, type StoryChangeSet } from '../runners/build/story-commits.js';

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

/** A defining file counts as a test file when it matches a supported
 *  language's test convention: a `__tests__/` or `src/test/` dir, a TS/JS
 *  `.test.` / `.spec.` suffix, Python `test_*.py` / `*_test.py`, Go `*_test.go`,
 *  JVM `*Test.java` / `*Test.kt` / `*Test.scala` and Scala `*Spec.scala`. */
export function isTestFile(file: string): boolean {
	return /(^|\/)(__tests__|src\/test)\//.test(file)
		|| /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
		|| /(^|\/)test_[^/]*\.py$/.test(file)
		|| /_test\.(py|go)$/.test(file)
		|| /Test\.(java|kt|scala)$|Spec\.scala$/.test(file);
}

/** Entity kinds the coverage dimension judges: code a test can exercise. */
const COVERAGE_KINDS: ReadonlySet<string> = new Set(['function', 'method', 'class']);

/** A function, method or class outside a test file (ISSUE-b47dadc7). Sections,
 *  documents, config, types, interfaces and a test file's own entities are not. */
export function isCoverageEligible(kind: string, file: string): boolean {
	return COVERAGE_KINDS.has(kind) && !isTestFile(file);
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
				// `<test file>#<caller>`: the file joins the entry to that file's runs in the
				// Story's test record (ISSUE-1102dc71); a caller is often a helper, not a test.
				testsReaching: testsReaching.map(c => `${c.file}#${c.name}`),
				coverageEligible: isCoverageEligible(ent.kind, ent.file),
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
// the Story's commits since its range base, plus uncommitted edits of the Story's
// own files (ISSUE-b97752e9), and emits a `CodeReviewGrounding`
// whose `symbols[]` is ONE synthesized `ChangedSymbolSummary` PER CHANGED FILE
// (kind:'file', name:the file, the file's unified-diff hunks carried in
// `signature`, caller/callee/test edges empty). The four dimension prompt
// builders serialize `grounding.symbols` UNCHANGED, so they consume this diff
// grounding exactly as they consume the graph grounding — the record is marked
// `groundingMode:'degraded'` so a downstream reader knows the review reasoned
// over hunks, not entities. Read-only throughout (git_diff never mutates).
// ---------------------------------------------------------------------------

/** One resolved diff: the per-file numstat + the raw unified-diff body (hunks). */
export interface DiffResult {
	readonly files: readonly GitDiffFileStat[];
	readonly body:  string;
	readonly truncated: boolean;
	/** Per-file hunk text already split by the producer (ISSUE-f9ced66a). When
	 *  present it is used instead of splitting `body`, so a file assembled from
	 *  several diffs keeps every section and a marker stays on its own file. */
	readonly hunksByFile?: ReadonlyMap<string, string> | undefined;
	/** How a committed-range diff chose the Story's commits (ISSUE-b47dadc7). */
	readonly attribution?: StoryAttribution | undefined;
	/** Story paths another Story's excluded commit also changed. */
	readonly sharedWithExcluded?: readonly string[] | undefined;
	/** Every path of the Story's own units (ISSUE-b97752e9), set by the range diff:
	 *  an uncommitted change counts as the Story's only for one of these. */
	readonly storyPaths?: readonly string[] | undefined;
}

/** Raised when a diff cannot be read at all (not a git repository, git failed,
 *  or no range base to anchor the Story's set on). The
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
	/** The working-tree changed set (unstaged ∪ staged) + its hunks; only the
	 *  Story's own files are kept from it. A git failure throws `DiffUnavailableError`. */
	readonly workingTreeDiff: (repoPath: string, excludeGlobs?: readonly string[]) => Promise<DiffResult>;
	/** The Story's committed range `base..HEAD` + its hunks (ISSUE-5f7a7cb9).
	 *  Without it the assembler has nothing to anchor on and throws
	 *  `DiffUnavailableError`, as for a git failure. */
	readonly rangeDiff?: ((repoPath: string, base: string, excludeGlobs?: readonly string[], storyKey?: string) => Promise<DiffResult>) | undefined;
}

/** What the degraded review knows about the Story it is reviewing. Both fields
 *  are optional; with neither, the assembler makes exactly the calls it made
 *  before they existed. */
export interface DiffGroundingOptions {
	/** The Story's range base: the reviewed set is the Story's commits since it.
	 *  Without it the diff-only review is unavailable. */
	readonly base?: string | undefined;
	/** Globs git leaves out of every diff, so excluded hunks never count against
	 *  the diff body cap. */
	readonly excludeGlobs?: readonly string[] | undefined;
	/** `<epicHash>/<storyId>` (ISSUE-b47dadc7): the committed range keeps only the
	 *  commits carrying the Story's `Insrc-Story` trailer. */
	readonly storyKey?: string | undefined;
}

/** The diff grounding plus how its changed set was scoped. */
export interface DiffGroundingResult {
	readonly grounding:    CodeReviewGrounding;
	readonly changedFiles: readonly string[];
	readonly changeSetAttribution?: ChangeSetAttribution | undefined;
	readonly sharedWithExcluded?: readonly string[] | undefined;
	/** Uncommitted paths left out because no Story commit changed them, sorted;
	 *  absent when none (ISSUE-b97752e9). */
	readonly excludedFromScope?: readonly string[] | undefined;
}

/** Validate every file and every declared unified hunk before captures are combined. */
export function assertCompleteDiff(diff: DiffResult): void {
	if (diff.truncated) throw new DiffUnavailableError('Incomplete diff capture: complete evidence is required before review');
	const sections = diff.hunksByFile ?? splitDiffByFile(diff.body);
	for (const file of diff.files) {
		if (file.change === 'binary') continue;
		const text = sections.get(file.path) ?? sections.get(file.origPath ?? '');
		if (!text) throw new DiffUnavailableError(`Missing complete diff evidence for ${file.path}`);
		let old = 0, next = 0, adds = 0, removes = 0, hunks = 0, headerZone = true;
		const bad = (): never => { throw new DiffUnavailableError(`Incomplete unified hunks for ${file.path}`); };
		for (const line of text.split('\n')) {
			if (line.startsWith('diff --git ')) { if (old !== 0 || next !== 0) bad(); headerZone = true; continue; }
			const header = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
			if (header !== null) {
				if (old !== 0 || next !== 0) bad();
				old = header[1] === undefined ? 1 : Number(header[1]); next = header[2] === undefined ? 1 : Number(header[2]); hunks++; headerZone = false;
				if (!Number.isSafeInteger(old) || !Number.isSafeInteger(next)) bad();
				continue;
			}
			if (line.startsWith('\\ No newline at end of file')) continue;
			if (old === 0 && next === 0) { if (!headerZone && /^[ +\-]/.test(line)) bad(); continue; }
			if (line.startsWith('+')) { next--; adds++; }
			else if (line.startsWith('-')) { old--; removes++; }
			else if (line.startsWith(' ')) { old--; next--; }
			else bad();
			if (old < 0 || next < 0) bad();
		}
		if (old !== 0 || next !== 0 || adds !== file.insertions || removes !== file.deletions) bad();
		if (hunks === 0) {
			const metadataOnly = (/^old mode /m.test(text) && /^new mode /m.test(text))
				|| (/^rename from /m.test(text) && /^rename to /m.test(text))
				|| (/^copy from /m.test(text) && /^copy to /m.test(text))
				|| /^(new file mode|deleted file mode) /m.test(text);
			if (!metadataOnly) bad();
		}
	}
}

/**
 * Assemble the diff-only (degraded) grounding for the Story's changed set.
 * Read-only. The Story's commits since its range base decide the set
 * (ISSUE-b97752e9): their hunks are read first, then the working tree, whose
 * hunks join only for a file those commits changed; every other uncommitted file
 * is reported as excludedFromScope, never reviewed. Emits one per-file
 * pseudo-`ChangedSymbolSummary` carrying the file's hunks. An empty result is a
 * valid grounding (`symbols:[]`), NOT an error. With no range base, or when git
 * fails, it throws `DiffUnavailableError`: there is no fallback to the working
 * tree or to the last commit, which would be somebody else's work.
 */
export async function assembleDiffCodeReviewGrounding(
	repoPath: string,
	deps:     DiffGroundingDeps = realDiffGroundingDeps(),
	opts?:    DiffGroundingOptions,
): Promise<DiffGroundingResult> {
	const globs = opts?.excludeGlobs !== undefined && opts.excludeGlobs.length > 0 ? opts.excludeGlobs : undefined;
	const base  = opts?.base !== undefined && opts.base.length > 0 ? opts.base : undefined;
	if (base === undefined || deps.rangeDiff === undefined) {
		throw new DiffUnavailableError(`no range base for the Story in ${repoPath}: the diff-only review has nothing to anchor on`);
	}

	const ranged = opts?.storyKey !== undefined
		? await deps.rangeDiff(repoPath, base, globs, opts.storyKey)
		: globs !== undefined ? await deps.rangeDiff(repoPath, base, globs) : await deps.rangeDiff(repoPath, base);
	const working = globs !== undefined ? await deps.workingTreeDiff(repoPath, globs) : await deps.workingTreeDiff(repoPath);

	// The Story's files, then each uncommitted change: a Story file's hunks are
	// added to its committed ones; any other file is only reported.
	const storyPaths = new Set(ranged.storyPaths ?? ranged.files.map(f => f.path));
	const rangedHunks = ranged.hunksByFile ?? splitDiffByFile(ranged.body);
	const workingHunks = working.hunksByFile ?? splitDiffByFile(working.body);
	assertCompleteDiff(ranged);
	assertCompleteDiff(working);
	const stats = new Map<string, GitDiffFileStat>();
	const hunks = new Map<string, string>();
	for (const f of ranged.files) {
		stats.set(f.path, f);
		const section = rangedHunks.get(f.path) ?? rangedHunks.get(f.origPath ?? '');
		if (section !== undefined) hunks.set(f.path, section);
	}
	const excluded: string[] = [];
	for (const f of working.files) {
		if (!storyPaths.has(f.path)) { excluded.push(f.path); continue; }
		const prior = stats.get(f.path);
		stats.set(f.path, prior === undefined ? f : { ...prior, insertions: prior.insertions + f.insertions, deletions: prior.deletions + f.deletions });
		const section = workingHunks.get(f.path) ?? workingHunks.get(f.origPath ?? '');
		if (section !== undefined) {
			const committed = hunks.get(f.path);
			hunks.set(f.path, `${committed !== undefined ? `${committed}\n` : ''}[uncommitted change]\n${section}`);
		}
	}
	const symbols = buildDiffSymbols({ files: [...stats.values()], body: '', truncated: ranged.truncated || working.truncated, hunksByFile: hunks });
	const changedFiles = [...new Set(symbols.map(s => s.file))];
	return {
		grounding: { symbols }, changedFiles,
		changeSetAttribution: ranged.attribution ?? 'first-parent-range',
		sharedWithExcluded:   (ranged.sharedWithExcluded ?? []).filter(p => changedFiles.includes(p)),
		...(excluded.length > 0 ? { excludedFromScope: excluded.sort() } : {}),
	};
}

/** Turn a resolved diff into one per-file pseudo-`ChangedSymbolSummary`. A binary
 *  file carries a marker in place of hunks; a text file carries its unified-diff
 *  section. Caller/callee/test edges are empty (there is no graph on this path). */
export function buildDiffSymbols(diff: DiffResult): ChangedSymbolSummary[] {
	const byFile = diff.hunksByFile ?? splitDiffByFile(diff.body);
	if (diff.truncated) throw new DiffUnavailableError('Cannot review a truncated diff');
	const rows = diff.files.flatMap((f): ChangedSymbolSummary[] => {
		const hunks = f.change === 'binary'
			? `[binary file changed — no textual hunks]`
			: (byFile.get(f.path) ?? byFile.get(f.origPath ?? '') ?? `[no hunk text for ${f.path}]`);
		const row: ChangedSymbolSummary = {
			entityId:      `diff:${f.path}`,
			file:          f.path,
			kind:          'file',
			name:          f.path,
			signature:     hunks,
			callers:       [],
			callees:       [],
			testsReaching: [],
			// A file's hunks carry no symbol: symbol coverage cannot be graded here.
			coverageEligible: false,
		};
		return f.change === 'binary' ? [row] : splitDiffRow(row, f.origPath ?? f.path);
	});
	validateDiffFragments(rows);
	return rows;
}

/** Split a unified-diff body into per-file sections keyed by the new (`b/`) path.
 *  A body joined from several diffs (unstaged and staged, or several units) can
 *  hold more than one section for a path: each is kept, in body order. Robust to
 *  the deterministic `git diff --no-color` output the builtin emits. */
export function splitDiffByFile(body: string): Map<string, string> {
	const map = new Map<string, string>();
	if (!body) return map;
	for (const section of body.split(/^(?=diff --git )/m)) {
		if (!section.startsWith('diff --git')) continue;
		const path = diffHeaderNewPath(section.slice(0, section.indexOf('\n') >= 0 ? section.indexOf('\n') : section.length));
		if (path) {
			const prior = map.get(path);
			map.set(path, prior === undefined ? section.replace(/\n$/, '') : `${prior}\n${section.replace(/\n$/, '')}`);
		}
	}
	return map;
}

/** The new (`b/`) path of a `diff --git` header line. Git writes a path plainly,
 *  or C-quoted when it holds a tab, newline, double quote, backslash or (with
 *  core.quotePath) a non-ASCII byte: `diff --git "a/x\ty" "b/x\ty"`. A quoted path
 *  is decoded to its literal form, octal escapes as UTF-8 bytes, so the section is
 *  keyed by the same path git_diff's -z numstat reports (ISSUE-b97752e9). */
function diffHeaderNewPath(line: string): string | undefined {
	const rest = line.startsWith('diff --git ') ? line.slice('diff --git '.length).trimEnd() : undefined;
	if (rest === undefined) return undefined;
	if (!rest.includes('"')) return rest.match(/^a\/(.+?) b\/(.+)$/)?.[2];
	// Two tokens, each plain or quoted; the second is the new path.
	const first = readHeaderToken(rest, 0);
	if (first === undefined || rest[first.end] !== ' ') return undefined;
	const second = readHeaderToken(rest, first.end + 1);
	return second !== undefined && second.value.startsWith('b/') ? second.value.slice(2) : undefined;
}

/** One header token from `pos`: a C-quoted string (decoded), or plain text up to
 *  the next ` b/` / ` "b/` boundary or the line's end. */
function readHeaderToken(s: string, pos: number): { value: string; end: number } | undefined {
	if (s[pos] !== '"') {
		const stop = [s.indexOf(' "b/', pos), s.indexOf(' b/', pos)].filter(i => i >= 0);
		const end = stop.length > 0 && s.slice(pos, pos + 2) === 'a/' ? Math.min(...stop) : s.length;
		return { value: s.slice(pos, end), end };
	}
	const bytes: number[] = [];
	const simple: Readonly<Record<string, number>> = { t: 9, n: 10, '"': 34, '\\': 92, a: 7, b: 8, f: 12, r: 13, v: 11 };
	for (let i = pos + 1; i < s.length; i++) {
		const c = s[i]!;
		if (c === '"') return { value: Buffer.from(bytes).toString('utf8'), end: i + 1 };
		if (c !== '\\') { bytes.push(...Buffer.from(c, 'utf8')); continue; }
		const n = s[i + 1];
		if (n === undefined) return undefined;
		if (/[0-7]/.test(n)) {
			const oct = s.slice(i + 1, i + 4);
			if (!/^[0-7]{3}$/.test(oct)) return undefined;
			bytes.push(parseInt(oct, 8));
			i += 3;
			continue;
		}
		const b = simple[n];
		if (b === undefined) return undefined;
		bytes.push(b);
		i += 1;
	}
	return undefined;
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
	const body = extractDiffBody(res.output);
	const sections = splitDiffByFile(body);
	if (!data.truncated && data.files.every(f => f.change === 'binary' || sections.has(f.path) || sections.has(f.origPath ?? ''))) {
		return { files: data.files, body, truncated: false };
	}
	// Keep ordinary tool limits unchanged. A review recaptures each exact file with
	// the same revisions/exclusions, increasing capture only until it is complete.
	const complete = new Map<string, string>();
	for (const file of data.files) {
		if (file.change === 'binary') continue;
		const opts: DiffOpts = { ...(input as DiffOpts), paths: [...new Set([file.path, ...(file.origPath !== undefined ? [file.origPath] : [])])] };
		delete opts.path;
		let captured: string | undefined;
		for (let maxBytes = 2 * 1024 * 1024; maxBytes <= 64 * 1024 * 1024; maxBytes *= 2) {
			const out = await runShell(buildDiffArgv(opts).argv, { cwd: repoPath, maxBytes, timeoutMs: 30_000 });
			if (out.spawnError || out.code !== 0 || out.timedOut) throw new DiffUnavailableError(`Complete diff read failed for ${file.path}`);
			if (out.stdoutTruncated) continue;
			const split = splitDiffByFile(out.stdout);
			captured = split.get(file.path) ?? split.get(file.origPath ?? '');
			break;
		}
		if (!captured) throw new DiffUnavailableError(`Complete diff unavailable for ${file.path}: missing hunks or per-file capture limit exceeded`);
		complete.set(file.path, captured);
	}
	return { files: data.files, body: [...complete.values()].join('\n'), truncated: false, hunksByFile: complete };
}

/** The `exclude` input for `git_diff`, or nothing at all when there are no
 *  globs — so a call without them sends exactly the input it always sent. */
function excludeInput(globs: readonly string[] | undefined): { exclude?: string[] | undefined } {
	return globs !== undefined && globs.length > 0 ? { exclude: [...globs] } : {};
}

/**
 * The Story's committed range as ONE {@link DiffResult} carrying only the
 * Story's own hunks (ISSUE-f9ced66a). Paths no merge touched get one net
 * `base..HEAD` diff limited to them. A path a merge also changed gets, instead,
 * the diff of each Story unit that touched it, in order, so no merged-in line
 * reaches the reviewer. A path edited inside a merge commit is marked. Every call
 * carries the same exclusions. An empty change set makes no git call at all.
 *
 * When the units were chosen from the range (`perUnit`: 'story-trailer'
 * attribution, ISSUE-b47dadc7, or a legacy range another Story's commit was left
 * out of, ISSUE-b97752e9) EVERY path takes the per-unit route: the left-out
 * commits sit inside base..HEAD, so a net diff of a file both Stories edited would
 * show the other Story's hunks too, or lose this Story's change to their revert.
 */
export async function storyRangeDiff(
	repoPath:     string,
	base:         string,
	set:          StoryChangeSet & { readonly attribution?: StoryAttribution | undefined; readonly perUnit?: boolean | undefined },
	excludeGlobs: readonly string[] | undefined,
	run:          (repoPath: string, input: Record<string, unknown>) => Promise<DiffResult> = runDiff,
): Promise<DiffResult> {
	if (set.paths.length === 0) return { files: [], body: '', truncated: false, hunksByFile: new Map() };

	const shared = new Set(set.perUnit === true || set.attribution === 'story-trailer' ? set.paths : set.sharedPaths);
	const sections = new Map<string, string[]>();
	const stats = new Map<string, GitDiffFileStat>();
	let truncated = false;
	const collect = (d: DiffResult): void => {
		assertCompleteDiff(d);
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
			// A file with staged AND unstaged edits: both counts, and (through the
			// accumulating splitDiffByFile) both sections.
			const byPath = new Map<string, GitDiffFileStat>();
			for (const f of [...unstaged.files, ...staged.files]) {
				const prior = byPath.get(f.path);
				byPath.set(f.path, prior === undefined ? f : { ...prior, insertions: prior.insertions + f.insertions, deletions: prior.deletions + f.deletions });
			}
			const body = [unstaged.body, staged.body].filter(Boolean).join('\n');
			return { files: [...byPath.values()], body, truncated: unstaged.truncated || staged.truncated };
		},
		async rangeDiff(repoPath, base, excludeGlobs, storyKey) {
			let set: AttributedStoryChangeSet;
			try {
				// Strict with a storyKey: a failed trailer read must not widen the set.
				set = storyChangeSet(repoPath, base, { storyKey, ...(storyKey !== undefined ? { strict: true } : {}) });
			} catch (err) {
				throw new DiffUnavailableError(`the Story's change set is unavailable for ${repoPath}: ${err instanceof Error ? err.message : String(err)}`);
			}
			const diff = await storyRangeDiff(repoPath, base, set, excludeGlobs);
			return { ...diff, attribution: set.attribution, sharedWithExcluded: set.sharedWithExcluded, storyPaths: set.paths };
		},
	};
}
