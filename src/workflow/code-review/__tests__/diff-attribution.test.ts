/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-b47dadc7 S001/t5 — the diff review is attributed per commit: with the
 * Story's key, every path's hunks come from the Story's own trailered commits,
 * so another Story's edits to a shared file are not shown; both diff callers
 * (codeReview.run and insrc_code_review_step) pass the key and record the
 * attribution on the subject. Real temporary repositories.
 *
 * Run: npx tsx --test src/workflow/code-review/__tests__/diff-attribution.test.ts
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';

// codeReview.run reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => { await closeGraphStore(); rmSync(STORE_DIR, { recursive: true, force: true }); });

import type { IpcStreamMessage, LLMProvider } from '../../../shared/types.js';
import { assembleDiffCodeReviewGrounding, realDiffGroundingDeps, type DiffGroundingOptions } from '../grounding.js';
import { DEFAULT_DEPS, runCodeReview, type RunCodeReviewOpts } from '../runner.js';
import type { CodeReviewSubject, DimensionResult, ReviewDimension } from '../types.js';
import { changedFiles, LEDGER_EXCLUDE_GLOBS } from '../../runners/build/changed-files.js';
import { storyChangeSet } from '../../runners/build/story-commits.js';
import { resolveCodeReviewSubject } from '../subject.js';
import { ArtifactMissingError } from '../../gates.js';
import { stampBuildStart } from '../../runners/build/range-base.js';
import { artifactJsonPath, buildArtifactId } from '../../storage.js';
import { codeReviewRunStart, type CodeReviewRunDeps } from '../../../daemon/code-review-rpc.js';
import { handleCodeReviewStep, type CodeReviewStepDeps } from '../../../daemon/steps/code-review-step/handler.js';
import { _clearCodeReviewStateStoreForTests } from '../../../daemon/steps/code-review-step/state-store.js';
import type { CodeReviewStepOutput } from '../../../daemon/steps/code-review-step/types.js';
import '../../__tests__/helpers/converted-repos.js';

const EPIC = 'b47dadc7cf0cccb1';
const STORY = 's1';
const KEY = `${EPIC}/${STORY}`;
const CREATED = '2026-10-18T00:00:00.000Z';
const LINES = (edit: Readonly<Record<number, string>> = {}): string =>
	Array.from({ length: 12 }, (_, i) => edit[i] ?? `line ${i}`).join('\n') + '\n';

/** A repo where Story S001 edits line 1 of src/shared.ts and adds src/mine.ts,
 *  and another Story, in between, edits line 10 of the same file and adds src/theirs.ts. */
function repo(): { repo: string; base: string; cleanup: () => void } {
	const r = mkdtempSync(join(tmpdir(), 'insrc-diff-attr-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: r, encoding: 'utf8' }).trim();
	const commit = (files: Record<string, string>, msg: string): void => {
		for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(r, f)), { recursive: true }); writeFileSync(join(r, f), body); }
		git('add', '-A'); git('commit', '-qm', msg);
	};
	git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
	commit({ 'src/shared.ts': LINES() }, 'base');
	const base = git('rev-parse', 'HEAD');
	commit({ 'src/shared.ts': LINES({ 1: 'MINE-EDIT' }), 'src/mine.ts': 'mine\n' }, `feat(build): S001/t1 mine\n\nInsrc-Story: ${KEY}`);
	commit({ 'src/shared.ts': LINES({ 1: 'MINE-EDIT', 10: 'THEIRS-EDIT' }), 'src/theirs.ts': 'theirs\n' }, 'feat(build): s3/t1 theirs\n\nInsrc-Story: c2ba6fa6aaaaaaaa/s3');
	return { repo: r, base, cleanup: () => rmSync(r, { recursive: true, force: true }) };
}

const sig = (res: Awaited<ReturnType<typeof assembleDiffCodeReviewGrounding>>, file: string): string =>
	res.grounding.symbols.find(s => s.file === file)?.signature ?? '';

test('a diff review of a trailered Story shows only its own hunks in a file another Story also edited', async () => {
	const r = repo();
	try {
		const res = await assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: r.base, excludeGlobs: LEDGER_EXCLUDE_GLOBS, storyKey: KEY });
		assert.deepEqual([...res.changedFiles].sort(), ['src/mine.ts', 'src/shared.ts']);
		assert.match(sig(res, 'src/shared.ts'), /^\+MINE-EDIT$/m);
		assert.doesNotMatch(sig(res, 'src/shared.ts'), /THEIRS-EDIT/, "the other Story's hunk in the shared file is not shown");
		assert.equal(res.changeSetAttribution, 'story-trailer');
		assert.deepEqual(res.sharedWithExcluded, ['src/shared.ts']);
	} finally { r.cleanup(); }
});

const NO_FINDINGS = (dims: readonly ReviewDimension[]): { judgements: DimensionResult[] } => ({ judgements: dims.map(d => ({ dimension: d, findings: [] })) });

const subjectFor = (repoPath: string): CodeReviewSubject => ({
	repoPath, epicHash: EPIC, storyId: STORY, changedFiles: ['src/old.ts'],
	approvedLld:  { meta: { epicSlug: 'scope-code-review', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: null, buildRecord: null, testRecord: null,
});

/** The real assembler, with the options each call received kept. */
function spyAssembler(seen: (DiffGroundingOptions | undefined)[]): typeof assembleDiffCodeReviewGrounding {
	return async (repoPath, deps, opts) => { seen.push(opts); return assembleDiffCodeReviewGrounding(repoPath, deps, opts); };
}

test("without a story key the diff is today's, and both diff callers record the attribution and what was left out on the subject", async () => {
	const r = repo();
	try {
		// Without a key: today's diff — the net range over every first-parent commit.
		const today = await assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: r.base, excludeGlobs: LEDGER_EXCLUDE_GLOBS });
		assert.deepEqual([...today.changedFiles].sort(), ['src/mine.ts', 'src/shared.ts', 'src/theirs.ts']);
		assert.match(sig(today, 'src/shared.ts'), /THEIRS-EDIT/);
		assert.equal(today.changeSetAttribution, 'first-parent-range');


		// Both callers resolve the range base from the Story's build-start file.
		writeFileSync(join(r.repo, '.git', 'info', 'exclude'), '.insrc/\n');
		const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: r.repo, encoding: 'utf8' }).trim();
		execFileSync('git', ['checkout', '-q', r.base], { cwd: r.repo });
		assert.equal(stampBuildStart(r.repo, EPIC, STORY), 'stamped');
		execFileSync('git', ['checkout', '-q', 'main'], { cwd: r.repo });
		assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: r.repo, encoding: 'utf8' }).trim(), head);

		// An uncommitted edit of the other Story's file: both callers leave it out
		// and put it on the record as excludedFromScope (ISSUE-b97752e9).
		writeFileSync(join(r.repo, 'src/theirs.ts'), 'theirs, edited\n');

		// 1. codeReview.run, degraded.
		const json = artifactJsonPath(r.repo, buildArtifactId(EPIC, STORY));
		mkdirSync(dirname(json), { recursive: true });
		writeFileSync(json, JSON.stringify({ meta: { workflow: 'build', epicHash: EPIC, storyId: STORY, createdAt: CREATED, authoredBy: 'controller' }, body: {} }));
		const rpcSeen: (DiffGroundingOptions | undefined)[] = [];
		const rpcWrites: { path: string; content: string }[] = [];
		const judges = DEFAULT_DEPS.judges.slice(0, 4).map(slot => ({ dimension: slot.dimension, judge: async (): Promise<DimensionResult> => ({ dimension: slot.dimension, findings: [] }) }));
		const rpcDeps: CodeReviewRunDeps = {
			resolveSubject: async (repoPath) => ({ ok: true, subject: subjectFor(repoPath) }),
			resolveProvider: () => ({ provider: {} as LLMProvider, modelLabel: 'cli-codex:gpt' }),
			assembleDiffGrounding: spyAssembler(rpcSeen),
			write: (path, content) => { rpcWrites.push({ path, content }); },
			runReview: (async (subject: CodeReviewSubject, provider: LLMProvider, o: RunCodeReviewOpts, runnerDeps: typeof DEFAULT_DEPS | undefined) =>
				runCodeReview(subject, provider, o, { judges: judges as never, assembleGrounding: runnerDeps!.assembleGrounding, write: runnerDeps!.write })) as never,
		};
		const frames: IpcStreamMessage[] = [];
		await codeReviewRunStart({ repo: r.repo, epicHash: EPIC, storyId: STORY, groundingMode: 'degraded' }, m => frames.push(m), new AbortController().signal, rpcDeps);
		assert.equal(frames[frames.length - 1]!.stream, 'done', JSON.stringify(frames[frames.length - 1]!.data));
		assert.equal(rpcSeen[0]?.storyKey, KEY);
		const rpcBody = (JSON.parse(rpcWrites.find(w => w.path.endsWith('.json'))!.content) as { body: { subject: Record<string, unknown> } }).body;
		assert.deepEqual(rpcBody.subject, { changedFiles: ['src/mine.ts', 'src/shared.ts'], changeSetAttribution: 'story-trailer', sharedWithExcluded: ['src/shared.ts'], excludedFromScope: ['src/theirs.ts'] });

		// 2. insrc_code_review_step: a hollow graph grounding diverts to the diff review.
		await _clearCodeReviewStateStoreForTests();
		const stepSeen: (DiffGroundingOptions | undefined)[] = [];
		const stepWrites: { path: string; content: string }[] = [];
		const stepDeps: CodeReviewStepDeps = {
			resolveSubject: async () => ({ ok: true, subject: subjectFor(r.repo) }),
			fetchGrounding: async () => ({ ok: true, grounding: { symbols: [] } }),
			fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: [] }),
			assembleDiffGrounding: spyAssembler(stepSeen),
			runReview: runCodeReview,
			write: (path, content) => { stepWrites.push({ path, content }); },
			sleep: async () => {}, now: () => 0, freshnessTimeoutMs: () => 120000,
			readBuildAuthor: () => 'daemon',
		};
		const parse = (env: { content: readonly { text: string }[] }): CodeReviewStepOutput => JSON.parse(env.content[0]!.text) as CodeReviewStepOutput;
		const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: r.repo }, stepDeps));
		assert.ok(start.next === 'emit_judgements', JSON.stringify(start));
		assert.equal(stepSeen[0]?.storyKey, KEY);
		const done = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: NO_FINDINGS(['adherence', 'conventions', 'coverage', 'quality']), state: start.state }, stepDeps));
		assert.ok(done.next === 'done', JSON.stringify(done));
		const stepBody = (JSON.parse(stepWrites.find(w => w.path.endsWith('.json'))!.content) as { body: { subject: Record<string, unknown> } }).body;
		assert.deepEqual(stepBody.subject, { changedFiles: ['src/mine.ts', 'src/shared.ts'], changeSetAttribution: 'story-trailer', sharedWithExcluded: ['src/shared.ts'], excludedFromScope: ['src/theirs.ts'] });
	} finally { r.cleanup(); }
});

// ---------------------------------------------------------------------------
// ISSUE-b97752e9: the Story's commits decide the diff-only review's scope; the
// working tree only adds hunks of the Story's own files.
// ---------------------------------------------------------------------------

test("the diff-only grounding carries the Story's units and the working-tree hunks of its own files only, never an unrelated file's hunks or another Story's last commit", async () => {
	const r = repo();   // HEAD is the OTHER Story's commit
	try {
		writeFileSync(join(r.repo, 'src/mine.ts'), 'mine\nUNCOMMITTED-MINE\n');          // the Story's file, in progress
		writeFileSync(join(r.repo, 'src/theirs.ts'), 'theirs\nUNCOMMITTED-THEIRS\n');    // another Story's file
		writeFileSync(join(r.repo, 'notes.md'), 'unrelated\n');
		execFileSync('git', ['add', 'notes.md'], { cwd: r.repo });                        // staged, unrelated
		const res = await assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: r.base, excludeGlobs: LEDGER_EXCLUDE_GLOBS, storyKey: KEY });
		assert.deepEqual([...res.changedFiles].sort(), ['src/mine.ts', 'src/shared.ts']);
		assert.match(sig(res, 'src/mine.ts'), /^\+mine$/m, 'the committed hunk');
		assert.match(sig(res, 'src/mine.ts'), /\[uncommitted change\][\s\S]*^\+UNCOMMITTED-MINE$/m, 'and the uncommitted one');
		for (const s of res.grounding.symbols) assert.doesNotMatch(s.signature, /THEIRS|unrelated/, `${s.file} carries nothing of the others`);
		assert.deepEqual(res.excludedFromScope, ['notes.md', 'src/theirs.ts']);
		assert.equal(res.changeSetAttribution, 'story-trailer');
	} finally { r.cleanup(); }
});

test("storyRangeDiff on a filtered legacy range grounds only the kept units' hunks of a file another Story also edited", async () => {
	const r = mkdtempSync(join(tmpdir(), 'insrc-diff-legacy-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: r, encoding: 'utf8' }).trim();
	const commit = (files: Record<string, string>, msg: string): void => {
		for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(r, f)), { recursive: true }); writeFileSync(join(r, f), body); }
		git('add', '-A'); git('commit', '-qm', msg);
	};
	try {
		git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
		commit({ 'src/shared.ts': LINES() }, 'base');
		const base = git('rev-parse', 'HEAD');
		// A Story built before the trailer: its commit carries none.
		commit({ 'src/shared.ts': LINES({ 1: 'LEGACY-EDIT' }) }, 'feat: legacy work, untrailed');
		commit({ 'src/shared.ts': LINES({ 1: 'LEGACY-EDIT', 10: 'THEIRS-EDIT' }) }, 'feat(build): s3/t1 theirs\n\nInsrc-Story: c2ba6fa6aaaaaaaa/s3');
		const res = await assembleDiffCodeReviewGrounding(r, realDiffGroundingDeps(), { base, storyKey: KEY });
		assert.deepEqual(res.changedFiles, ['src/shared.ts']);
		assert.match(sig(res, 'src/shared.ts'), /^\+LEGACY-EDIT$/m);
		assert.doesNotMatch(sig(res, 'src/shared.ts'), /THEIRS-EDIT/, "the other Story's hunk is not grounded");
		assert.equal(res.changeSetAttribution, 'first-parent-range');
		assert.deepEqual(res.sharedWithExcluded, ['src/shared.ts']);
	} finally { rmSync(r, { recursive: true, force: true }); }
});

test('a Story file with distinct staged and unstaged edits keeps both sets of hunks, and its stats are their sum, in the diff-only grounding', async () => {
	const r = repo();
	try {
		writeFileSync(join(r.repo, 'src/mine.ts'), 'STAGED-EDIT\nmine\n');
		execFileSync('git', ['add', 'src/mine.ts'], { cwd: r.repo });
		writeFileSync(join(r.repo, 'src/mine.ts'), 'STAGED-EDIT\nmine\nUNSTAGED-EDIT\n');
		const working = await realDiffGroundingDeps().workingTreeDiff(r.repo);
		const stat = working.files.find(f => f.path === 'src/mine.ts');
		assert.deepEqual([stat?.insertions, stat?.deletions], [2, 0], 'one staged line plus one unstaged line');
		const res = await assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: r.base, storyKey: KEY });
		const s = sig(res, 'src/mine.ts');
		assert.match(s, /^\+STAGED-EDIT$/m);
		assert.match(s, /^\+UNSTAGED-EDIT$/m);
	} finally { r.cleanup(); }
});

test('a Story commit that renames a file, to a path with a tab in it, is reviewed at the new path, and its committed, staged and unstaged hunks are all grounded there', async () => {
	const r = mkdtempSync(join(tmpdir(), 'insrc-diff-rename-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: r, encoding: 'utf8' }).trim();
	const NEW = 'src/re\tnamed.ts';
	try {
		git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
		mkdirSync(join(r, 'src'), { recursive: true });
		writeFileSync(join(r, 'src/original.ts'), LINES());
		git('add', '-A'); git('commit', '-qm', 'base');
		const base = git('rev-parse', 'HEAD');
		// The Story renames the file and edits it in the same commit.
		git('mv', 'src/original.ts', NEW);
		writeFileSync(join(r, NEW), LINES({ 2: 'COMMITTED-EDIT' }));
		git('add', '-A'); git('commit', '-qm', `feat(build): S001/t1 rename\n\nInsrc-Story: ${KEY}`);
		// Then a staged and a different unstaged edit at the new path.
		writeFileSync(join(r, NEW), LINES({ 2: 'COMMITTED-EDIT', 5: 'STAGED-EDIT' }));
		git('add', '-A');
		writeFileSync(join(r, NEW), LINES({ 2: 'COMMITTED-EDIT', 5: 'STAGED-EDIT', 9: 'UNSTAGED-EDIT' }));

		const res = await assembleDiffCodeReviewGrounding(r, realDiffGroundingDeps(), { base, storyKey: KEY });
		assert.deepEqual(res.changedFiles, [NEW], 'the new, literal path, and not the old one');
		assert.equal(res.excludedFromScope, undefined, 'the uncommitted edits at the new path are the Story\'s');
		const s = sig(res, NEW);
		for (const edit of ['COMMITTED-EDIT', 'STAGED-EDIT', 'UNSTAGED-EDIT']) assert.match(s, new RegExp(`^\\+.*${edit}`, 'm'), `${edit} is grounded`);
		assert.doesNotMatch(s, /\[no hunk text/);
	} finally { rmSync(r, { recursive: true, force: true }); }
});

test('a Story file whose path has multibyte characters is in the Story set, the review subject and the diff-only grounding with its hunks', async () => {
	const r = mkdtempSync(join(tmpdir(), 'insrc-diff-utf8-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: r, encoding: 'utf8' }).trim();
	const FILE = 'src/café/naïve-文件.ts';
	try {
		git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
		writeFileSync(join(r, 'README.md'), 'base\n');
		git('add', '-A'); git('commit', '-qm', 'base');
		const base = git('rev-parse', 'HEAD');
		mkdirSync(join(r, 'src/café'), { recursive: true });
		writeFileSync(join(r, FILE), LINES({ 1: 'COMMITTED-EDIT' }));
		git('add', '-A'); git('commit', '-qm', `feat(build): S001/t1 utf8\n\nInsrc-Story: ${KEY}`);
		writeFileSync(join(r, FILE), LINES({ 1: 'COMMITTED-EDIT', 7: 'UNSTAGED-EDIT' }));
		// Precondition: git quotes this path in its own displays.
		assert.match(git('diff', '--name-only'), /^"src\/caf\\303\\251/);

		assert.deepEqual(storyChangeSet(r, base, { storyKey: KEY, strict: true }).paths, [FILE]);
		let excluded: readonly string[] | undefined;
		assert.deepEqual([...await changedFiles(r, { base, storyKey: KEY, onAttribution: a => { excluded = a.excludedUncommitted; } })], [FILE]);
		assert.deepEqual(excluded, [], 'its uncommitted edit is the Story\'s, not excluded');
		// The review subject itself, through the resolver.
		const missing = (): never => { throw new ArtifactMissingError('none'); };
		const subject = await resolveCodeReviewSubject(r, EPIC, STORY, {
			requireApprovedLld: missing, requireApprovedPlan: missing, changedFiles,
			resolveRangeBase: () => base, readBuildRecord: () => null, readTestRecord: () => null,
		});
		assert.ok(subject.ok, JSON.stringify(subject));
		assert.deepEqual(subject.subject.changedFiles, [FILE]);
		assert.equal(subject.subject.excludedFromScope, undefined);
		const res = await assembleDiffCodeReviewGrounding(r, realDiffGroundingDeps(), { base, storyKey: KEY });
		assert.deepEqual(res.changedFiles, [FILE]);
		assert.match(sig(res, FILE), /^\+COMMITTED-EDIT$/m);
		assert.match(sig(res, FILE), /^\+UNSTAGED-EDIT$/m);
	} finally { rmSync(r, { recursive: true, force: true }); }
});

test('Story-attributed graph and diff subjects exclude generated sidecars before freshness', async () => {
	const r = repo();
	const git = (...args: string[]): string => execFileSync('git', args, { cwd: r.repo, encoding: 'utf8' }).trim();
	const histories = ['.insrc/artifacts/LLD-x.log.jsonl', '.insrc/artifacts/LLD-x.feedback.jsonl'];
	const nested = ['.insrc/artifacts/templates/user.jsonl', '.insrc/artifacts/formats/user.jsonl'];
	try {
		git('checkout', '-q', r.base);
		assert.equal(stampBuildStart(r.repo, EPIC, STORY), 'stamped');
		git('checkout', '-q', 'main');
		for (const file of [...histories, ...nested]) {
			mkdirSync(dirname(join(r.repo, file)), { recursive: true });
			writeFileSync(join(r.repo, file), 'committed\n');
		}
		git('add', '-A'); git('commit', '-qm', `feat: review fixtures\n\nInsrc-Story: ${KEY}`);
		for (const file of [...histories, ...nested]) writeFileSync(join(r.repo, file), 'committed\nstaged\n');
		git('add', '-A');
		for (const file of [...histories, ...nested]) writeFileSync(join(r.repo, file), 'committed\nstaged\nunstaged\n');
		const expected = [...nested, 'src/mine.ts', 'src/shared.ts'].sort();
		const missing = (): never => { throw new ArtifactMissingError('none'); };
		const resolveSubject = () => resolveCodeReviewSubject(r.repo, EPIC, STORY, {
			requireApprovedLld: missing, requireApprovedPlan: missing, changedFiles,
			resolveRangeBase: () => r.base, readBuildRecord: () => null, readTestRecord: () => null,
		});
		const subject = await resolveSubject();
		assert.ok(subject.ok);
		assert.deepEqual([...subject.subject.changedFiles].sort(), expected);
		const diff = await assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: r.base, excludeGlobs: LEDGER_EXCLUDE_GLOBS, storyKey: KEY });
		assert.deepEqual([...diff.changedFiles].sort(), expected);
		assert.ok(diff.grounding.symbols.every(s => !histories.includes(s.file)));
		for (const full of [true, false]) {
			await _clearCodeReviewStateStoreForTests();
			let freshnessCalls = 0;
			const deps: CodeReviewStepDeps = {
				resolveSubject,
				fetchFreshness: async params => {
					freshnessCalls++;
					assert.deepEqual([...params.changedFiles].sort(), expected);
					return { ok: true, isProcessing: false, staleFiles: [] };
				},
				fetchGrounding: async () => ({ ok: true, grounding: { symbols: full ? [{ entityId: 'mine', file: 'src/mine.ts', kind: 'function', name: 'mine', signature: 'mine()', callers: [], callees: [], testsReaching: [] }] : [] } }),
				assembleDiffGrounding: assembleDiffCodeReviewGrounding, runReview: runCodeReview, write: () => {},
				sleep: async () => {}, now: () => 0, freshnessTimeoutMs: () => 120000, readBuildAuthor: () => 'daemon',
			};
			const response = await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: r.repo }, deps);
			const output = JSON.parse(response.content[0]!.text) as CodeReviewStepOutput;
			assert.equal(output.next, 'emit_judgements', JSON.stringify(output));
			assert.equal(freshnessCalls, 1);
			for (const file of histories) assert.ok(!JSON.stringify(output).includes(file), 'generated history never enters emitted grounding');
		}
	} finally { await _clearCodeReviewStateStoreForTests(); r.cleanup(); }
});
