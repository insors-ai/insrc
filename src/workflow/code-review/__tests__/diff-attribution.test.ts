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
import { LEDGER_EXCLUDE_GLOBS } from '../../runners/build/changed-files.js';
import { stampBuildStart } from '../../runners/build/range-base.js';
import { artifactJsonPath, buildArtifactId } from '../../storage.js';
import { codeReviewRunStart, type CodeReviewRunDeps } from '../../../daemon/code-review-rpc.js';
import { handleCodeReviewStep, type CodeReviewStepDeps } from '../../../daemon/steps/code-review-step/handler.js';
import { _clearCodeReviewStateStoreForTests } from '../../../daemon/steps/code-review-step/state-store.js';
import type { CodeReviewStepOutput } from '../../../daemon/steps/code-review-step/types.js';

const EPIC = 'b47dadc7cf0cccb1';
const STORY = 'S001';
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

test("without a story key the diff is today's, and both diff callers record the attribution on the subject", async () => {
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
		assert.deepEqual(rpcBody.subject, { changedFiles: ['src/mine.ts', 'src/shared.ts'], changeSetAttribution: 'story-trailer', sharedWithExcluded: ['src/shared.ts'] });

		// 2. insrc_code_review_step: a hollow graph grounding diverts to the diff review.
		_clearCodeReviewStateStoreForTests();
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
		assert.deepEqual(stepBody.subject, { changedFiles: ['src/mine.ts', 'src/shared.ts'], changeSetAttribution: 'story-trailer', sharedWithExcluded: ['src/shared.ts'] });
	} finally { r.cleanup(); }
});
