/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E202610138d4b90c9:S001 t4 — handleReviewDecision and its daemon handler.
 *
 * Over a temp docs/ + .insrc/artifacts fixture (no socket), with the real approve,
 * reject and feedback writers unless a case pins one: the decision is recorded
 * first, the comments second with the decision that took effect; every refusal
 * writes nothing; the author is the daemon's.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/review-decision.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	handleReviewDecision, REVIEW_COMMENT_MAX, REVIEW_COMMENTS_MAX,
	type ReviewDecisionDeps, type ReviewDecisionRequest, type ReviewDecisionResult,
} from '../review-decision.js';
import { handleArtifactContent } from '../artifact-content.js';
import { ARTIFACTS_DIR } from '../storage.js';
import type { FeedbackEntry } from '../artifacts/provenance/types.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';

const HASH = '8d4b90c9ab301e66';
const ID = `LLD-${HASH}-S001`;
const DIR_REL = 'docs/standalone/demo-E202610138d4b90c9/S001';
const MD_REL = `${DIR_REL}/LLD.md`;
const HTML_REL = `${DIR_REL}/sequence-diagram.html`;
const MD_BODY = `<!-- insrc:artifact ${ID} -->\n\n# Demo\n\nThe header is cut to 8 lines.\n`;

const REVIEWER = { gitUserName: () => 'Rev Iewer\n', osUserName: () => 'rev' };
const DEPS: ReviewDecisionDeps = { reviewer: REVIEWER };

interface Fixture { readonly repo: string; readonly jsonPath: string }

/** A standalone LLD with one HTML companion. `reviewed` gives it the other-party
 *  review its approval needs; without it the review gate withholds the approval. */
function makeFixture(opts: { meta?: Record<string, unknown>; reviewed?: boolean; feedback?: unknown } = {}): Fixture {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-review-decision-'));
	mkdirSync(join(repo, DIR_REL), { recursive: true });
	writeFileSync(join(repo, MD_REL), MD_BODY);
	writeFileSync(join(repo, HTML_REL), '<!doctype html><title>x</title>');
	mkdirSync(join(repo, ARTIFACTS_DIR), { recursive: true });
	const jsonPath = join(repo, ARTIFACTS_DIR, `${ID}.json`);
	writeFileSync(jsonPath, JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'wf-lld', schemaVersion: 1, epicHash: HASH, storyId: 'S001',
			standalone: true, createdAt: '2026-10-13T08:00:00.000Z', ...(opts.meta ?? {}),
		},
		body: {
			openQuestions: [],
			companions: [{ kind: 'diagram-mermaid', relPath: HTML_REL, title: 'Sequence diagram' }],
			...(opts.feedback !== undefined ? { feedback: opts.feedback } : {}),
		},
		citations: [],
	}, null, 2) + '\n');
	if (opts.reviewed === true) stampOtherPartyReview(jsonPath);
	return { repo, jsonPath };
}

function cleanup(repo: string): void { rmSync(repo, { recursive: true, force: true }); }

interface Stored {
	readonly meta: { approvedAt?: string; rejectedAt?: string; rejectReason?: string };
	readonly body: { feedback?: FeedbackEntry[] };
}
function stored(jsonPath: string): Stored { return JSON.parse(readFileSync(jsonPath, 'utf8')) as Stored; }

async function decide(fx: Fixture, req: Omit<ReviewDecisionRequest, 'repo' | 'mdPath'> & Record<string, unknown>, deps: ReviewDecisionDeps = DEPS): Promise<ReviewDecisionResult> {
	const r = await handleReviewDecision({ repo: fx.repo, mdPath: MD_REL, ...req } as ReviewDecisionRequest, undefined, deps);
	assert.ok(!('error' in r), `expected a result, got error: ${(r as { error?: string }).error}`);
	return r as ReviewDecisionResult;
}

const INLINE = { comment: '  Say what the header shows.  ', version: 'abcdef0123456789', anchor: { quote: 'cut to 8 lines', sectionSlug: 'demo', prefix: 'The header is ', suffix: '.' } };
const WHOLE = { comment: 'The second phase needs an owner.' };
const ON_HTML = { comment: 'The arrow to the daemon is missing.', file: HTML_REL };

test('review decision: approve approves first and then saves the comments with decision approve; a withheld approval saves them as feedback and reports the reason', async () => {
	// Approved: the state is written before the comments are appended.
	const fx = makeFixture({ reviewed: true });
	try {
		const order: string[] = [];
		const { approveWorkflowTarget } = await import('../gates.js');
		const { appendFeedbackBatch } = await import('../artifacts/provenance/writer.js');
		const r = await decide(fx, { decision: 'approve', comments: [INLINE, WHOLE, ON_HTML] }, {
			...DEPS,
			approve: async (req, o) => { order.push('approve'); return approveWorkflowTarget(req, o); },
			appendBatch: req => {
				order.push('comments');
				assert.equal(typeof stored(fx.jsonPath).meta.approvedAt, 'string', 'the approval is on disk before the comments are written');
				return appendFeedbackBatch(req);
			},
		});
		assert.deepEqual(order, ['approve', 'comments']);
		assert.equal(r.artifactId, ID);
		assert.equal(r.decision, 'approve');
		assert.equal(r.outcome, 'approved');
		assert.equal(r.recorded, 3);
		assert.equal(r.author, 'Rev Iewer');
		assert.equal('commentsError' in r, false);

		const s = stored(fx.jsonPath);
		assert.equal(typeof s.meta.approvedAt, 'string');
		const fb = s.body.feedback!;
		assert.deepEqual(fb.map(e => e.id), r.entryIds);
		assert.deepEqual(fb.map(e => e.comment), ['Say what the header shows.', WHOLE.comment, ON_HTML.comment], 'in order, trimmed');
		assert.ok(fb.every(e => e.decision === 'approve' && e.kind === 'comment' && e.author === 'Rev Iewer'));
		assert.equal(new Set(fb.map(e => e.batchId)).size, 1, 'one batch id');
		assert.equal(new Set(fb.map(e => e.timestamp)).size, 1, 'one write, one timestamp');
		assert.deepEqual(fb[0]!.target, { file: MD_REL, version: 'abcdef0123456789' });
		assert.deepEqual(fb[0]!.anchor, INLINE.anchor);
		assert.deepEqual(fb[1]!.target, { file: MD_REL }, 'the .md is the default file');
		assert.equal('anchor' in fb[1]!, false);
		assert.deepEqual(fb[2]!.target, { file: HTML_REL });
	} finally { cleanup(fx.repo); }

	// Withheld: the review gate holds the approval back (no other-party review).
	const held = makeFixture();
	try {
		const r = await decide(held, { decision: 'approve', comments: [INLINE, WHOLE] });
		assert.equal(r.decision, 'approve');
		assert.equal(r.outcome, 'withheld');
		assert.ok(typeof r.reason === 'string' && r.reason.length > 0, 'the skip reason is reported');
		assert.equal(r.recorded, 2);
		const s = stored(held.jsonPath);
		assert.equal(s.meta.approvedAt, undefined, 'the artifact stays pending');
		assert.ok(s.body.feedback!.every(e => e.decision === 'feedback'), 'a comment is never saved with a decision that did not take effect');
	} finally { cleanup(held.repo); }
});

test('review decision: reject records the rejection with the first whole-document comment as the reason, or the default reason when there is none, and saves the comments with decision reject', async () => {
	const fx = makeFixture();
	try {
		const r = await decide(fx, { decision: 'reject', comments: [INLINE, WHOLE, { comment: 'A later whole-document one.' }] });
		assert.equal(r.outcome, 'rejected');
		assert.equal(r.reason, WHOLE.comment, 'the first comment without an anchor');
		assert.equal(r.recorded, 3);
		const s = stored(fx.jsonPath);
		assert.equal(typeof s.meta.rejectedAt, 'string');
		assert.equal(s.meta.rejectReason, WHOLE.comment);
		assert.equal(s.meta.approvedAt, undefined);
		assert.ok(s.body.feedback!.every(e => e.decision === 'reject' && e.author === 'Rev Iewer'));
		assert.equal(handleArtifactContentState(fx), 'rejected');
	} finally { cleanup(fx.repo); }

	// Inline comments only: the default reason names the reviewer.
	const inlineOnly = makeFixture();
	try {
		const r = await decide(inlineOnly, { decision: 'reject', comments: [INLINE] });
		assert.equal(r.outcome, 'rejected');
		assert.equal(r.reason, 'Rejected in the review pane by Rev Iewer');
		assert.equal(stored(inlineOnly.jsonPath).meta.rejectReason, 'Rejected in the review pane by Rev Iewer');
		assert.equal(stored(inlineOnly.jsonPath).body.feedback!.length, 1);
	} finally { cleanup(inlineOnly.repo); }

	// No comments at all: the default reason too.
	const none = makeFixture();
	try {
		const r = await decide(none, { decision: 'reject' });
		assert.equal(r.reason, 'Rejected in the review pane by Rev Iewer');
		assert.equal(stored(none.jsonPath).meta.rejectReason, 'Rejected in the review pane by Rev Iewer');
	} finally { cleanup(none.repo); }
});

function handleArtifactContentState(fx: Fixture): string {
	const v = handleArtifactContent({ repo: fx.repo, mdPath: MD_REL }, undefined, REVIEWER);
	assert.ok(!('error' in v));
	return (v as { state: string }).state;
}

test('review decision: feedback saves the comments and changes no state, in any state of the artifact; with no comments it is refused', async () => {
	const states: readonly [Record<string, unknown>, string][] = [
		[{}, 'pending'],
		[{ approvedAt: '2026-10-13T09:00:00.000Z' }, 'approved'],
		[{ rejectedAt: '2026-10-13T09:00:00.000Z', rejectReason: 'no' }, 'rejected'],
	];
	for (const [meta, state] of states) {
		const fx = makeFixture({ meta });
		try {
			const metaBefore = JSON.stringify(stored(fx.jsonPath).meta);
			const r = await decide(fx, { decision: 'feedback', comments: [INLINE, WHOLE] });
			assert.equal(r.outcome, 'recorded', state);
			assert.equal(r.decision, 'feedback');
			assert.equal(r.recorded, 2);
			assert.equal('reason' in r, false);
			const s = stored(fx.jsonPath);
			assert.equal(JSON.stringify(s.meta), metaBefore, `${state}: the meta is untouched`);
			assert.equal(handleArtifactContentState(fx), state);
			assert.ok(s.body.feedback!.every(e => e.decision === 'feedback'));
		} finally { cleanup(fx.repo); }
	}

	// Appended after what was already there.
	const prior = [{ id: 'old1', author: 'A', timestamp: '2026-10-12T09:00:00.000Z', target: { file: MD_REL }, comment: 'Earlier.' }];
	const fx = makeFixture({ feedback: prior });
	try {
		await decide(fx, { decision: 'feedback', comments: [WHOLE] });
		const fb = stored(fx.jsonPath).body.feedback!;
		assert.deepEqual(fb[0], prior[0]);
		assert.equal(fb.length, 2);
	} finally { cleanup(fx.repo); }

	// With no comments it is refused, and nothing is written.
	for (const comments of [undefined, []]) {
		const empty = makeFixture();
		try {
			const before = readFileSync(empty.jsonPath);
			const r = await handleReviewDecision({ repo: empty.repo, mdPath: MD_REL, decision: 'feedback', ...(comments !== undefined ? { comments } : {}) }, undefined, DEPS);
			assert.ok('error' in r && /at least one comment/.test(r.error));
			assert.ok(readFileSync(empty.jsonPath).equals(before));
		} finally { cleanup(empty.repo); }
	}
});

test('review decision: a decision with no comments writes no feedback entry', async () => {
	const approved = makeFixture({ reviewed: true });
	try {
		let appended = 0;
		const { appendFeedbackBatch } = await import('../artifacts/provenance/writer.js');
		const r = await decide(approved, { decision: 'approve' }, { ...DEPS, appendBatch: req => { appended += 1; return appendFeedbackBatch(req); } });
		assert.equal(r.outcome, 'approved');
		assert.equal(r.recorded, 0);
		assert.deepEqual(r.entryIds, []);
		assert.equal(appended, 0, 'the feedback writer is not called');
		const s = stored(approved.jsonPath);
		assert.equal(typeof s.meta.approvedAt, 'string');
		assert.equal('feedback' in s.body, false);
	} finally { cleanup(approved.repo); }

	const rejected = makeFixture();
	try {
		const r = await decide(rejected, { decision: 'reject', comments: [] });
		assert.equal(r.outcome, 'rejected');
		assert.equal(r.recorded, 0);
		assert.equal('feedback' in stored(rejected.jsonPath).body, false);
	} finally { cleanup(rejected.repo); }
});

test('review decision: an invalid request (unknown decision, blank or over-long comment, a file that is not the artifact\'s document, too many comments, a non-pending artifact for approve or reject) answers an error and writes nothing', async () => {
	const many = Array.from({ length: REVIEW_COMMENTS_MAX + 1 }, (_, i) => ({ comment: `c${i}` }));
	const bad: readonly [string, Record<string, unknown>, RegExp][] = [
		['unknown decision', { decision: 'maybe', comments: [WHOLE] }, /decision/],
		['no decision', { comments: [WHOLE] }, /decision/],
		['blank comment', { decision: 'approve', comments: [WHOLE, { comment: '   ' }] }, /comment 2 is blank/],
		['a comment that is not text', { decision: 'reject', comments: [{ comment: 7 }] }, /comment 1 is blank/],
		['over-long comment', { decision: 'feedback', comments: [{ comment: 'x'.repeat(REVIEW_COMMENT_MAX + 1) }] }, /longer than/],
		['a file outside the artifact', { decision: 'feedback', comments: [{ comment: 'x', file: 'docs/other/LLD.md' }] }, /not this artifact's document/],
		['a file that escapes', { decision: 'approve', comments: [{ comment: 'x', file: '../../etc/passwd' }] }, /not this artifact's document/],
		['a sibling that is not a listed companion', { decision: 'reject', comments: [{ comment: 'x', file: `${DIR_REL}/er-model.html` }] }, /not this artifact's document/],
		['too many comments', { decision: 'feedback', comments: many }, /at most 200/],
		['comments that are not a list', { decision: 'feedback', comments: 'x' }, /must be a list/],
		['a malformed anchor', { decision: 'feedback', comments: [{ comment: 'x', anchor: { quote: '' } }] }, /anchor/],
		['an over-long quote', { decision: 'feedback', comments: [{ comment: 'x', anchor: { quote: 'q'.repeat(501) } }] }, /anchor/],
	];
	for (const [name, req, pattern] of bad) {
		const fx = makeFixture({ reviewed: true });
		try {
			const before = readFileSync(fx.jsonPath);
			const r = await handleReviewDecision({ repo: fx.repo, mdPath: MD_REL, ...req } as ReviewDecisionRequest, undefined, DEPS);
			assert.ok('error' in r, `${name}: an error`);
			assert.match((r as { error: string }).error, pattern, name);
			assert.match((r as { error: string }).error, /^workflow\.reviewDecision: /);
			assert.ok(readFileSync(fx.jsonPath).equals(before), `${name}: nothing is written`);
			assert.equal(readFileSync(join(fx.repo, MD_REL), 'utf8'), MD_BODY);
		} finally { cleanup(fx.repo); }
	}

	// The comment at the limit and the comment count at the limit are accepted.
	const edge = makeFixture();
	try {
		const r = await decide(edge, { decision: 'feedback', comments: [{ comment: 'x'.repeat(REVIEW_COMMENT_MAX) }, ...many.slice(0, REVIEW_COMMENTS_MAX - 1)] });
		assert.equal(r.recorded, REVIEW_COMMENTS_MAX);
	} finally { cleanup(edge.repo); }

	// approve and reject need a pending artifact.
	for (const meta of [{ approvedAt: '2026-10-13T09:00:00.000Z' }, { rejectedAt: '2026-10-13T09:00:00.000Z', rejectReason: 'no' }]) {
		for (const decision of ['approve', 'reject'] as const) {
			const fx = makeFixture({ meta, reviewed: true });
			try {
				const before = readFileSync(fx.jsonPath);
				const r = await handleReviewDecision({ repo: fx.repo, mdPath: MD_REL, decision, comments: [WHOLE] }, undefined, DEPS);
				assert.ok('error' in r && /not awaiting review/.test(r.error), `${decision} on ${Object.keys(meta)[0]}`);
				assert.ok(readFileSync(fx.jsonPath).equals(before));
			} finally { cleanup(fx.repo); }
		}
	}

	// The path guard and the missing arguments, as workflow.artifactContent.
	const fx = makeFixture();
	try {
		const before = readFileSync(fx.jsonPath);
		const guard: readonly [ReviewDecisionRequest | undefined, string | undefined, RegExp][] = [
			[undefined, undefined, /`repo` is required/],
			[{ mdPath: MD_REL, decision: 'feedback', comments: [WHOLE] }, undefined, /`repo` is required/],
			[{ repo: fx.repo, decision: 'feedback', comments: [WHOLE] }, undefined, /`mdPath` is required/],
			[{ repo: fx.repo, mdPath: '../outside.md', decision: 'feedback', comments: [WHOLE] }, undefined, /under docs\//],
			[{ repo: fx.repo, mdPath: HTML_REL, decision: 'feedback', comments: [WHOLE] }, undefined, /\.md/],
			[{ repo: fx.repo, mdPath: `${DIR_REL}/missing.md`, decision: 'feedback', comments: [WHOLE] }, undefined, /cannot read/],
		];
		for (const [req, env, pattern] of guard) {
			const r = await handleReviewDecision(req, env, DEPS);
			assert.ok('error' in r);
			assert.match((r as { error: string }).error, pattern);
		}
		assert.ok(readFileSync(fx.jsonPath).equals(before));
		// The repo falls back to the daemon's.
		const viaEnv = await handleReviewDecision({ mdPath: MD_REL, decision: 'feedback', comments: [WHOLE] }, fx.repo, DEPS);
		assert.ok(!('error' in viaEnv));

		// An approve or reject call that throws is an error, and no comment is saved.
		const feedbackBefore = stored(fx.jsonPath).body.feedback!.length;
		const thrown = await handleReviewDecision({ repo: fx.repo, mdPath: MD_REL, decision: 'reject', comments: [WHOLE] }, undefined, {
			...DEPS, reject: () => { throw new Error('disk full'); },
		});
		assert.ok('error' in thrown && /disk full/.test(thrown.error));
		assert.equal(stored(fx.jsonPath).body.feedback!.length, feedbackBefore);
		assert.equal(stored(fx.jsonPath).meta.rejectedAt, undefined);
	} finally { cleanup(fx.repo); }
});

test('review decision: a failing comment write after the decision took effect reports the outcome with commentsError', async () => {
	const failing: ReviewDecisionDeps = { ...DEPS, appendBatch: () => { throw new Error('cannot write the artifact'); } };

	const approved = makeFixture({ reviewed: true });
	try {
		const r = await decide(approved, { decision: 'approve', comments: [INLINE, WHOLE] }, failing);
		assert.equal(r.outcome, 'approved');
		assert.equal(r.commentsError, 'cannot write the artifact');
		assert.equal(r.recorded, 0);
		assert.deepEqual(r.entryIds, []);
		const s = stored(approved.jsonPath);
		assert.equal(typeof s.meta.approvedAt, 'string', 'the approval stands');
		assert.equal('feedback' in s.body, false);
	} finally { cleanup(approved.repo); }

	const rejected = makeFixture();
	try {
		const r = await decide(rejected, { decision: 'reject', comments: [WHOLE] }, failing);
		assert.equal(r.outcome, 'rejected');
		assert.equal(r.reason, WHOLE.comment);
		assert.equal(r.commentsError, 'cannot write the artifact');
		assert.equal(r.recorded, 0);
		assert.equal(typeof stored(rejected.jsonPath).meta.rejectedAt, 'string', 'the rejection stands');
	} finally { cleanup(rejected.repo); }
});

test('review decision: the author is the one resolveReviewer gives and is never taken from the request', async () => {
	const fx = makeFixture();
	try {
		const r = await decide(fx, {
			decision: 'feedback', author: 'Mallory',
			comments: [{ ...WHOLE, author: 'Mallory' } as never],
		});
		assert.equal(r.author, 'Rev Iewer');
		assert.equal(stored(fx.jsonPath).body.feedback![0]!.author, 'Rev Iewer');
		assert.ok(!readFileSync(fx.jsonPath, 'utf8').includes('Mallory'));

		// With no git name the OS login is the author; with neither, 'unknown'.
		const os = await decide(fx, { decision: 'feedback', comments: [WHOLE] }, { reviewer: { ...REVIEWER, gitUserName: () => undefined } });
		assert.equal(os.author, 'rev');
		const unknown = await decide(fx, { decision: 'feedback', comments: [WHOLE] }, { reviewer: { gitUserName: () => undefined, osUserName: () => undefined } });
		assert.equal(unknown.author, 'unknown');
		assert.deepEqual(stored(fx.jsonPath).body.feedback!.map(e => e.author), ['Rev Iewer', 'rev', 'unknown']);
	} finally { cleanup(fx.repo); }

	// The reject default reason names the same author.
	const rejected = makeFixture();
	try {
		const r = await decide(rejected, { decision: 'reject', author: 'Mallory' }, { reviewer: { ...REVIEWER, gitUserName: () => undefined } });
		assert.equal(r.reason, 'Rejected in the review pane by rev');
	} finally { cleanup(rejected.repo); }
});

/** The source of one handler in the daemon's handler map: from its key to the next key. */
function handlerSource(src: string, method: string): string {
	const key = `\t\t'${method}': async (params) => {`;
	const start = src.indexOf(key);
	assert.ok(start >= 0, `${method} is registered`);
	assert.equal(src.indexOf(key, start + 1), -1, `${method} is registered once`);
	const end = src.indexOf('\n\t\t},\n', start);
	return src.slice(start, end);
}

test('daemon handlers: \'workflow.reviewDecision\' is registered and delegates to handleReviewDecision, and the \'workflow.approve\', \'workflow.resolveComment\' and \'artifact.feedback.append\' handlers are unchanged', () => {
	const src = readFileSync(join(import.meta.dirname, '..', '..', 'daemon', 'handler-runtime.ts'), 'utf8');   // the handler map (Epic 86197ac6 s2/t1)

	const decision = handlerSource(src, 'workflow.reviewDecision');
	assert.match(decision, /await import\('\.\.\/workflow\/review-decision\.js'\)/);
	assert.match(decision, /return handleReviewDecision\(/);
	assert.match(decision, /process\.env\['INSRC_REPO'\]/);
	assert.match(decision, /advanceApprovedBugfixes/, 'the follow-on of an approval is the one workflow.approve runs');

	// The three existing handlers, as they were: each still delegates to its own
	// function and none goes through the new call.
	const approve = handlerSource(src, 'workflow.approve');
	assert.match(approve, /const result = await approveWorkflowTarget\(\{/);
	assert.match(approve, /const followOn = await advanceApprovedBugfixes\(result\.approved, \{/);
	assert.match(approve, /return followOn\.length > 0 \? \{ \.\.\.result, followOn \} : result;/);
	assert.equal(handlerSource(src, 'workflow.resolveComment'), [
		`\t\t'workflow.resolveComment': async (params) => {`,
		`\t\t\tconst { handleResolveComment } = await import('../workflow/resolve-comment.js');`,
		`\t\t\treturn handleResolveComment(`,
		`\t\t\t\tparams as Parameters<typeof handleResolveComment>[0],`,
		`\t\t\t\tprocess.env['INSRC_REPO'],`,
		`\t\t\t);`,
	].join('\n'));
	assert.equal(handlerSource(src, 'artifact.feedback.append'), [
		`\t\t'artifact.feedback.append': async (params) => {`,
		`\t\t\tconst { appendFeedback, ArtifactFeedbackError } = await import('../workflow/artifacts/provenance/writer.js');`,
		`\t\t\tconst { coerceRequest } = await import('../workflow/artifacts/provenance/tool.js');`,
		`\t\t\ttry {`,
		`\t\t\t\tconst req = coerceRequest((params ?? {}) as Record<string, unknown>);`,
		`\t\t\t\treturn appendFeedback(req);`,
		`\t\t\t} catch (err) {`,
		`\t\t\t\tconst msg = err instanceof ArtifactFeedbackError ? err.message : (err as Error).message;`,
		`\t\t\t\treturn { error: \`artifact.feedback.append: \${msg}\` };`,
		`\t\t\t}`,
	].join('\n'));
	for (const method of ['workflow.approve', 'workflow.resolveComment', 'artifact.feedback.append']) {
		assert.ok(!handlerSource(src, method).includes('review-decision'), `${method} does not go through the new call`);
	}
});

// Story E20261013dd277f9c:S001 — a BUILD record is decided from the pane like any record.
test("handleReviewDecision on a BUILD record: approve goes through the same approve call as any record and a result that call withholds is returned with its reason; reject stamps the record, after which it is not listed and the pane's call refuses a further decision on it", async () => {
	const { listPendingArtifacts } = await import('../pending.js');
	// The real path: the handler resolves the record's path (/var is /private/var on macOS) and the
	// approve call is asserted with it.
	const repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-review-decision-build-')));
	try {
		const id = `BUILD-${HASH}-S001`;
		const mdRel = `${DIR_REL}/BUILD.md`;
		const meta = { workflow: 'build', epicHash: HASH, storyId: 'S001', standalone: true, epicSlug: 'demo', createdAt: '2026-10-13T08:00:00.000Z', epicCreatedAt: '2026-10-13T08:00:00.000Z' };
		mkdirSync(join(repo, DIR_REL), { recursive: true });
		writeFileSync(join(repo, mdRel), `<!-- insrc:artifact ${id} -->\n\n# Build — Story S001\n`);
		mkdirSync(join(repo, ARTIFACTS_DIR), { recursive: true });
		const jsonPath = join(repo, ARTIFACTS_DIR, `${id}.json`);
		writeFileSync(jsonPath, JSON.stringify({ meta, body: { summary: 'built' }, citations: [] }, null, 2) + '\n');
		writeFileSync(join(repo, ARTIFACTS_DIR, `CR-${HASH}-S001.json`), JSON.stringify({ meta: { ...meta, workflow: 'code-review' }, body: { verdict: 'pass' } }));
		const listed = (): boolean => listPendingArtifacts(repo).some(a => a.artifactId === id);
		assert.equal(listed(), true);
		const ask = async (req: Record<string, unknown>, deps: ReviewDecisionDeps): Promise<ReviewDecisionResult | { error: string }> =>
			handleReviewDecision({ repo, mdPath: mdRel, ...req } as ReviewDecisionRequest, undefined, deps);

		// APPROVE, WITHHELD: the approve call (where a build's code-review rule lives) holds it back.
		const calls: unknown[] = [];
		const held = await ask({ decision: 'approve', comments: [] }, {
			...DEPS,
			approve: async (req) => { calls.push(req); return { approved: [], skipped: [{ path: jsonPath, reason: 'code review: reviewed by the party that built it' }] }; },
		}) as ReviewDecisionResult;
		assert.deepEqual(calls, [{ repoPath: repo, artifactPath: jsonPath }], 'the same call as for any record: the repository and the record');
		assert.equal(held.artifactId, id);
		assert.equal(held.outcome, 'withheld');
		assert.equal(held.reason, 'code review: reviewed by the party that built it', 'the reason is relayed');
		assert.equal(stored(jsonPath).meta.approvedAt, undefined, 'nothing is stamped');
		assert.equal(listed(), true, 'still awaiting a decision');

		// APPROVE, GIVEN: the approve call's result is the outcome.
		const ok = await ask({ decision: 'approve', comments: [] }, {
			...DEPS,
			approve: async () => ({ approved: [{ path: jsonPath, result: { workflow: 'build', path: jsonPath, approvedAt: '2026-10-14T00:00:00.000Z' } }], skipped: [] }) as never,
		}) as ReviewDecisionResult;
		assert.equal(ok.outcome, 'approved');

		// REJECT: stamped by the real reject; the record leaves the list, and the pane's call
		// refuses a further decision on it.
		const no = await ask({ decision: 'reject', comments: [{ comment: 'Task 3 is not done.' }] }, DEPS) as ReviewDecisionResult;
		assert.equal(no.outcome, 'rejected');
		const s = stored(jsonPath);
		assert.equal(typeof s.meta.rejectedAt, 'string');
		assert.equal(s.meta.rejectReason, 'Task 3 is not done.');
		assert.equal(listed(), false, 'a rejected build record is not listed');
		for (const decision of ['approve', 'reject'] as const) {
			const again = await ask({ decision, comments: [] }, DEPS);
			assert.ok('error' in again, `${decision} is refused`);
			assert.match((again as { error: string }).error, /it is already rejected, not awaiting review/);
		}
	} finally { cleanup(repo); }
});
