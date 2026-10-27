/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A design review is ONE reviewer session against its template, under ONE
 * deadline; every other artifact keeps the extract → probe → verify pipeline.
 * The reviewer session is faked here; the real CLIs are covered by the live test.
 * (LLD-f2f08ccf89f8ab25-S001, tests T9, T10, T11, T12 and T16.)
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { after as afterAll } from 'node:test';
import { mkdtempSync as mkdtempSyncRaw, rmSync as rmSyncForStore } from 'node:fs';
import { tmpdir as tmpdirForStore } from 'node:os';
import { join as joinForStore } from 'node:path';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';

// This file reaches the graph store through code that takes no path. Give it a
// temporary one: the store at the default path belongs to the daemon alone
// (Epic c2ba6fa6, Story s4).
const STORE_DIR = mkdtempSyncRaw(joinForStore(tmpdirForStore(), 'insrc-test-store-'));
setGraphStorePath(joinForStore(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmSyncForStore(STORE_DIR, { recursive: true, force: true });
});

import { CliStallError } from '../../../agent/providers/cli-provider.js';
import type { LLMProvider } from '../../../shared/types.js';
import { artifactJsonPath } from '../../storage.js';
import { reviewArtifactFile, runReview } from '../index.js';
import { DEFAULT_DESIGN_REVIEW_SETTINGS, reviewDeadlineMs, reviewTemplateFor } from '../template.js';

// The limit a review gets by default comes from the settings file of the machine
// the suite runs on (`designReview.timeLimitMs.*`), so these tests ask for the
// configured limit of each kind instead of assuming the shipped defaults.
const LIMIT = { issue: reviewDeadlineMs('issue'), feature: reviewDeadlineMs('feature'), epic: reviewDeadlineMs('epic') };
import type { ReviewTemplate } from '../template.js';
import { envelopeProvider } from '../../review-pipeline/__tests__/enveloped.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import { lifecycleReviewOf } from '../../artifact-core/approval-view.js';
import { readReviewRecordOf } from '../report-file.js';

const MIN = 60_000;
const SPEC = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);
const ISSUE = reviewTemplateFor('issue', DEFAULT_DESIGN_REVIEW_SETTINGS);

interface SessionCall { prompt: string; cwd: string; deadlineMs: number }

/** A valid answer: one holding premise per item, plus any extras. */
function answer(template: ReviewTemplate, extra: Record<string, Record<string, unknown>> = {}): { items: unknown[] } {
	return {
		items: template.items.map(it => ({
			item: it.id,
			premises: [extra[it.id] ?? { premise: `claim under ${it.id}`, outcome: 'holds', evidence: 'read the function body', action: '' }],
		})),
	};
}

/**
 * A fake review provider. `runReviewSession` plays `script` one entry per call:
 * a value is returned, an Error is thrown. `takesMs` advances the fake clock.
 * The one-shot calls throw: a design review must never reach them.
 */
function fakeProvider(script: readonly unknown[], opts: { takesMs?: number; withSession?: boolean } = {}) {
	const sessions: SessionCall[] = [];
	const oneShot: string[] = [];
	let clock = 1_000_000;
	const base = {
		capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
		async complete() { oneShot.push('complete'); throw new Error('complete() must not be called'); },
		async completeStructured() { oneShot.push('completeStructured'); throw new Error('completeStructured() must not be called'); },
	};
	const session = {
		async runReviewSession(prompt: string, _schema: unknown, o: { cwd: string; deadlineMs: number }) {
			sessions.push({ prompt, cwd: o.cwd, deadlineMs: o.deadlineMs });
			clock += opts.takesMs ?? 0;
			const step = script[Math.min(sessions.length - 1, script.length - 1)];
			if (step instanceof Error) throw step;
			return step;
		},
	};
	const provider = envelopeProvider((opts.withSession === false ? base : { ...base, ...session }) as unknown as LLMProvider);
	return { provider, sessions, oneShot, nowMs: () => clock };
}

function timeoutError(): Error {
	const e = new Error('review session passed its time limit');
	e.name = 'ReviewSessionTimeoutError';
	return e;
}

const DESIGN = '# LLD\n\nThe design body.';

function run(f: ReturnType<typeof fakeProvider>, over: Record<string, unknown> = {}) {
	return runReview(DESIGN, {
		repo: '/the/repo', stage: 'design.story', provider: f.provider, model: 'cli-claude:opus',
		reviewedAt: '2026-10-05T00:00:00.000Z', nowMs: f.nowMs, ...over,
	});
}

// --- T9 ------------------------------------------------------------------------

test('T9 a design stage runs ONE reviewer session and no extract, probe or per-premise call', async () => {
	const f = fakeProvider([answer(SPEC, {
		'change-sites': { premise: 'the phase list is complete', outcome: 'does-not-hold', severity: 'MED', evidence: 'server.ts:635 also lists it', action: 'add it', files: ['src/mcp/server.ts'] },
		'error-paths':  { premise: 'both CLIs can do it', outcome: 'could-not-verify', evidence: 'no live run was possible', action: 'probe' },
	})]);
	const phases: string[] = [];
	const report = await run(f, { onProgress: (p: string) => phases.push(p) });

	assert.equal(f.sessions.length, 1);
	assert.deepEqual(f.oneShot, [], 'no extraction call and no per-premise judge call');
	assert.deepEqual(phases, ['template', 'done']);
	assert.equal(f.sessions[0]!.cwd, '/the/repo');

	assert.equal(report.template, 'design-spec');
	assert.equal(report.stage, 'design.story');
	assert.equal(report.model, 'cli-claude:opus');
	assert.equal(report.verdict, 'block');
	assert.deepEqual(report.counts, { high: 0, med: 1, low: 7, unverified: 1 });
	assert.equal(report.findings.length, 8);
	assert.deepEqual(report.findings.map(x => x.outcome).filter(o => o !== 'holds').sort(), ['could-not-verify', 'does-not-hold']);
});

test('T9 the prompt carries the template for the intent, the insrc analyze instruction, and the design last', async () => {
	const spec = fakeProvider([answer(SPEC)]);
	await run(spec);
	const p = spec.sessions[0]!.prompt;
	assert.ok(p.includes('checklist `design-spec`') && p.includes('`boundaries`'));
	assert.ok(p.includes('insrc analyze') && p.includes('insrc_analyze_step'));
	assert.ok(p.endsWith(DESIGN), 'the design is the tail of the prompt');

	const issue = fakeProvider([answer(ISSUE)]);
	const report = await run(issue, { intent: 'issue' });
	assert.equal(report.template, 'design-issue');
	assert.ok(issue.sessions[0]!.prompt.includes('`fix-targets-defect`'));
	assert.ok(!issue.sessions[0]!.prompt.includes('`boundaries`'));
});

test('T9 an HLD is a design stage too', async () => {
	const f = fakeProvider([answer(SPEC)]);
	const report = await run(f, { stage: 'design.epic' });
	assert.equal(f.sessions.length, 1);
	assert.equal(report.verdict, 'pass');
});

// --- T10 -----------------------------------------------------------------------

test('T10 an invalid first answer causes exactly one repeat carrying the validation errors', async () => {
	const bad = answer(SPEC);
	bad.items.pop();   // `tests` unanswered
	const f = fakeProvider([bad, answer(SPEC)]);
	const report = await run(f);
	assert.equal(f.sessions.length, 2);
	assert.equal(report.verdict, 'pass');
	const repeat = f.sessions[1]!.prompt;
	assert.ok(repeat.includes('REJECTED') && repeat.includes('check item `tests` is not answered'));
	assert.ok(repeat.endsWith(DESIGN), 'the design is still last in the repeat');
	assert.ok(!f.sessions[0]!.prompt.includes('REJECTED'));
});

test('T10 a second invalid answer fails the review', async () => {
	const bad = answer(SPEC);
	bad.items.pop();
	const f = fakeProvider([bad, bad, answer(SPEC)]);
	await assert.rejects(run(f), /failed checklist design-spec \(2 of 2 attempts were invalid answers\)[\s\S]*semantic-validation-failed/);
	assert.equal(f.sessions.length, 2, 'never a third session');
});

test('a template review that stalls twice and then gets an invalid answer fails with a message naming three attempts, and two invalid answers report two attempts', async () => {
	const bad = answer(SPEC);
	bad.items.pop();
	const stalled = fakeProvider([new CliStallError('codex', 300_000, 't-stall'), new CliStallError('codex', 300_000, 't-stall'), bad, answer(SPEC)]);
	const err = await run(stalled).then(() => undefined, (e: unknown) => e as Error);
	assert.ok(err !== undefined, 'the review fails');
	assert.match(err.message, /failed checklist design-spec \(1 of 3 attempts were invalid answers\)/);
	assert.doesNotMatch(err.message, /twice/);
	assert.equal(stalled.sessions.length, 3, 'two stalls re-issued, then the invalid answer ends it');
	const twice = fakeProvider([bad, bad, answer(SPEC)]);
	await assert.rejects(run(twice), /failed checklist design-spec \(2 of 2 attempts were invalid answers\)/);
	assert.equal(twice.sessions.length, 2);
});

// --- T11 -----------------------------------------------------------------------

test('T11 a session failure fails the review', async () => {
	const f = fakeProvider([new Error('claude review session failed: boom')]);
	await assert.rejects(run(f), /transient/);
	// The provider makes one attempt (internalRetry false); the review pipeline re-issues
	// a failed session once, then fails the review (Epic 8315a11f): two sessions in all.
	assert.equal(f.sessions.length, 2);
	assert.deepEqual(f.oneShot, []);
});

test('T11 a timeout fails the review with a message naming the limit that applied', async () => {
	for (const [deadlineMs, named] of [[4 * MIN, '4 minutes'], [6 * MIN, '6 minutes'], [8 * MIN, '8 minutes']] as const) {
		const f = fakeProvider([timeoutError()]);
		await assert.rejects(run(f, { deadlineMs }), new RegExp(`passed its time limit of ${named} \\(template design-spec\\)`));
		assert.equal(f.sessions.length, 1);
	}
});

test('T11 a provider with no session capability fails at once and the old pipeline is not run', async () => {
	const f = fakeProvider([answer(SPEC)], { withSession: false });
	await assert.rejects(run(f), /needs a tool-capable reviewer/);
	assert.deepEqual(f.oneShot, [], 'no fallback to extract, probe and verify');
});

test('a review cancelled before or during its session returns no report', async () => {
	// Cancelled before it starts: no session is run at all.
	const before = fakeProvider([answer(SPEC)]);
	const early = new AbortController();
	early.abort();
	await assert.rejects(run(before, { signal: early.signal }), /review: aborted/);
	assert.equal(before.sessions.length, 0);

	// Cancelled while the session runs: the valid answer it returns is not turned into a report.
	const during = new AbortController();
	const f = fakeProvider([answer(SPEC)]);
	const session = f.provider as unknown as { runReviewSession: (...a: unknown[]) => Promise<unknown> };
	const inner = session.runReviewSession.bind(session);
	session.runReviewSession = async (...a: unknown[]) => { const r = await inner(...a); during.abort(); return r; };
	await assert.rejects(run(f, { signal: during.signal }), /review: aborted/);
	assert.equal(f.sessions.length, 1);
});

// --- T12 -----------------------------------------------------------------------

/** sha256 of the extraction prompt for `# BODY`, taken BEFORE this change. */
const EXTRACT_PROMPT_BEFORE: Record<string, string> = {
	define: 'eb79af5bcf59365c660d61fe9be2eadf911c8a7dec12de2ac194ca75e7df4a9f',
	issue:  'c68faa753cb1bc2906e3fc3f1bc9bab58247c96121cf1842da4a2656ab7e8748',
	plan:   '57f217a0ab02758e9db61a6e0c2fe7e62dc217b5fe495081467386a35db6fe6e',
};

test('T12 a DEF review and an ISSUE review still run extract, probe and verify with the same extraction prompt, byte for byte', async () => {
	for (const stage of ['define', 'issue', 'plan']) {
		const calls: { system: string; user: string }[] = [];
		let sessions = 0;
		const provider = envelopeProvider({
			capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
			async complete() { throw new Error('unused'); },
			// The provider CAN run a session; a non-design review must still not use it.
			async runReviewSession() { sessions++; throw new Error('a non-design review must not start a reviewer session'); },
			async completeStructured(messages: { role: string; content: string }[]) {
				calls.push({ system: messages[0]!.content, user: messages[1]!.content });
				// 1st call = extraction (one premise); every later call = that premise's verdict.
				return calls.length === 1
					? { claims: [{ id: 'p1', kind: 'semantic', text: 'a premise', anchors: [], probe: {} }] }
					: { severity: 'LOW', evidence: 'ok', action: 'none', fixability: 'manual' };
			},
		} as unknown as LLMProvider);
		const report = await runReview('# BODY', { repo: tmpdir(), stage, provider, model: 'm', reviewedAt: '2026-10-05T00:00:00.000Z' });

		assert.equal(sessions, 0, `${stage}: no reviewer session`);
		assert.equal(calls.length, 2, `${stage}: one extraction call and one call for the one premise`);
		const digest = createHash('sha256').update(calls[0]!.system + '\u0000' + calls[0]!.user).digest('hex');
		assert.equal(digest, EXTRACT_PROMPT_BEFORE[stage], `${stage}: the extraction prompt is unchanged`);
		assert.equal(report.template, undefined);
		assert.deepEqual(report.counts, { high: 0, med: 0, low: 1 });
		assert.equal(report.findings[0]!.outcome, undefined);
	}
});

// --- T16 -----------------------------------------------------------------------

test('T16 the first session gets the whole limit, and the limit defaults by intent', async () => {
	const spec = fakeProvider([answer(SPEC)]);
	await run(spec);
	assert.equal(spec.sessions[0]!.deadlineMs, LIMIT.feature, 'a standalone feature design by default');
	const issue = fakeProvider([answer(ISSUE)]);
	await run(issue, { intent: 'issue' });
	assert.equal(issue.sessions[0]!.deadlineMs, LIMIT.issue);
	const epic = fakeProvider([answer(SPEC)]);
	await run(epic, { deadlineMs: 8 * MIN });
	assert.equal(epic.sessions[0]!.deadlineMs, 8 * MIN);
});

test('role-specific attempt ceilings remain distinct from dynamic chunk-scaled total time', async () => {
	const f = fakeProvider([answer(SPEC)]);
	await run(f, { deadlineMs: 45 * MIN });
	assert.equal(f.sessions[0]!.deadlineMs, 10 * MIN);
});

test('T16 the validation repeat is started with only the time that remains', async () => {
	const bad = answer(SPEC);
	bad.items.pop();
	const f = fakeProvider([bad, answer(SPEC)], { takesMs: 150_000 });
	await run(f, { deadlineMs: 6 * MIN });
	assert.deepEqual(f.sessions.map(s => s.deadlineMs), [6 * MIN, 6 * MIN]);
});

test('T16 a review whose deadline has passed fails before a repeat is started', async () => {
	const bad = answer(SPEC);
	bad.items.pop();
	const f = fakeProvider([bad, answer(SPEC)], { takesMs: 5 * MIN });
	// Today's error, exactly: a plain Error with today's message, not ReviewSessionTimeoutError (s1 LLD 2.20).
	await assert.rejects(run(f, { deadlineMs: 4 * MIN }), (e: unknown) => e instanceof Error && e.name === 'Error' && e.constructor === Error && /passed its time limit of 4 minutes \(template design-spec\)\. No review was recorded\./.test(e.message));
	assert.equal(f.sessions.length, 1, 'the repeat was never started');
});

// --- reviewArtifactFile ----------------------------------------------------------

const HASH = 'abcd1234ef567890';

function designRepo(opts: { issue?: boolean; def?: boolean } = {}): { repo: string; md: string; json: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-design-review-'));
	const json = artifactJsonPath(repo, `LLD-${HASH}-s1`);
	mkdirSync(dirname(json), { recursive: true });
	writeFileSync(json, JSON.stringify({ meta: { workflow: 'design.story', epicHash: HASH, storyId: 's1' }, body: { note: 'untouched' }, citations: [] }, null, 2) + '\n');
	if (opts.issue === true) writeFileSync(artifactJsonPath(repo, `ISSUE-${HASH}`), '{}');
	if (opts.def === true) writeFileSync(artifactJsonPath(repo, `DEF-${HASH}`), '{}');
	const md = join(repo, 'LLD.md');
	writeFileSync(md, DESIGN + '\n');
	return { repo, md, json, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function reviewFile(d: ReturnType<typeof designRepo>, f: ReturnType<typeof fakeProvider>) {
	return reviewArtifactFile({ mdPath: d.md, jsonPath: d.json, repo: d.repo, lifecycle: createRepoLifecycle(d.repo).service, provider: f.provider, model: 'cli-claude:opus', reviewedAt: '2026-10-05T00:00:00.000Z' });
}

test('a design answering an ISSUE is reviewed once with the ISSUE template and the ISSUE limit, and is not edited', async () => {
	const d = designRepo({ issue: true });
	try {
		const f = fakeProvider([answer(ISSUE, {
			'change-sites': { premise: 'the list is complete', outcome: 'could-not-verify', evidence: 'tried insrc analyze; daemon down', action: 'retry' },
		})]);
		const res = await reviewFile(d, f);
		assert.equal(f.sessions.length, 1, 'one session, no second pass');
		// Real clock: the session gets the ISSUE limit less the moment before it starts, never more.
		assert.ok(f.sessions[0]!.deadlineMs <= LIMIT.issue && f.sessions[0]!.deadlineMs > LIMIT.issue - 1_000, `${f.sessions[0]!.deadlineMs} of ${LIMIT.issue}`);
		assert.equal(f.sessions[0]!.cwd, d.repo);
		assert.equal(res.report.template, 'design-issue');
		assert.equal(res.report.verdict, 'warn');
		assert.deepEqual(res.applied, [], 'a design is never edited by its review');

		const stored = JSON.parse(readFileSync(d.json, 'utf8'));
		const recorded = readReviewRecordOf(d.json)?.report;
		assert.equal(recorded?.template, 'design-issue');
		// T4 (LLD-1716f77ba9ba017b-S001): reviewArtifactFile is the daemon's review,
		// on its template path (this LLD) as on its pipeline path (a DEF, below).
		assert.equal(lifecycleReviewOf(stored.meta)?.['party'], 'daemon');
		assert.equal(res.report.reviewedBy, 'daemon', 'the returned report says so too');
		assert.equal(recorded?.counts.unverified, 1);
		assert.deepEqual(stored.body, { note: 'untouched' });
		const md = readFileSync(d.md, 'utf8');
		assert.ok(md.startsWith(DESIGN));
		assert.ok(md.includes('#### Does not hold (blocks approval)') && md.includes('#### Could not verify (does not block)'));
		assert.deepEqual(res.pendingUser.map(x => x.outcome), ['could-not-verify']);
	} finally { d.cleanup(); }
});

test('a design under an Epic gets the SPEC template and the Epic limit; a standalone feature design the feature limit', async () => {
	for (const [opts, limit] of [[{ def: true }, LIMIT.epic], [{}, LIMIT.feature]] as const) {
		const d = designRepo(opts);
		try {
			const f = fakeProvider([answer(SPEC)]);
			const res = await reviewFile(d, f);
			assert.equal(res.report.template, 'design-spec');
			// The real clock runs between the review's start and its first session (the
			// injected-clock T16 tests pin the exact arithmetic): the session gets the limit
			// less that moment, never more.
			const given = f.sessions[0]!.deadlineMs;
			assert.ok(given <= limit && given > limit - 1_000, `${given} of ${limit}`);
		} finally { d.cleanup(); }
	}
});

test('a failed design review stamps nothing', async () => {
	for (const script of [[new Error('boom')], [timeoutError()], [{ items: [] }, { items: [] }]]) {
		const d = designRepo();
		try {
			const beforeJson = readFileSync(d.json, 'utf8');
			const beforeMd = readFileSync(d.md, 'utf8');
			await assert.rejects(reviewFile(d, fakeProvider(script)));
			assert.equal(readFileSync(d.json, 'utf8'), beforeJson);
			assert.equal(readFileSync(d.md, 'utf8'), beforeMd);
		} finally { d.cleanup(); }
	}
});

test('T4 reviewArtifactFile stamps the daemon on its pipeline path too (a DEF)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-def-review-'));
	try {
		const json = artifactJsonPath(repo, `DEF-${HASH}`);
		mkdirSync(dirname(json), { recursive: true });
		writeFileSync(json, JSON.stringify({ meta: { workflow: 'define', epicHash: HASH }, body: { note: 'x' }, citations: [] }, null, 2) + '\n');
		const md = join(repo, 'DEF.md');
		writeFileSync(md, '# DEF\n\nThe definition.\n');
		// The pipeline's extract step finds no premises, so no probe or verify call follows.
		const sessions: string[] = [];
		const provider = envelopeProvider({
			capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
			async completeStructured() { return { claims: [] }; },
			async runReviewSession() { sessions.push('session'); throw new Error('a DEF is not reviewed in a session'); },
		} as unknown as LLMProvider);
		const res = await reviewArtifactFile({ mdPath: md, jsonPath: json, repo, lifecycle: createRepoLifecycle(repo).service, provider, model: 'cli-claude:opus' });
		assert.equal(res.report.stage, 'define');
		assert.equal(res.report.template, undefined, 'the pipeline path, not a template review');
		assert.deepEqual(sessions, []);
		assert.equal(res.report.reviewedBy, 'daemon');
		assert.equal(lifecycleReviewOf(JSON.parse(readFileSync(json, 'utf8')).meta)?.['party'], 'daemon');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
