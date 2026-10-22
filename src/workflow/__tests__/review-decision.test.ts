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
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import {
	handleReviewDecision, REVIEW_COMMENT_MAX, REVIEW_COMMENTS_MAX,
	type ReviewDecisionDeps, type ReviewDecisionRequest, type ReviewDecisionResult,
} from '../review-decision.js';
import { handleArtifactContent } from '../artifact-content.js';
import { ARTIFACTS_DIR } from '../storage.js';
import type { Feedback } from '../artifact-core/types.js';
import { IdentityService } from '../identity/identity-service.js';
import { lifecycleFor, resetLifecycleRegistry } from '../../daemon/lifecycle-registry.js';
import { approvalStateOf } from '../artifact-core/approval-view.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import type { ChangeLogEntry } from '../artifact-core/types.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';
import { approvedMeta, rejectedMeta } from './lifecycle-fixtures.js';

const HASH = '8d4b90c9ab301e66';
const ID = `LLD-${HASH}-s1`;
const DIR_REL = 'docs/standalone/demo-E202610138d4b90c9/S001';
const MD_REL = `${DIR_REL}/LLD.md`;
const HTML_REL = `${DIR_REL}/sequence-diagram.html`;
const MD_BODY = `<!-- insrc:artifact ${ID} -->\n\n# Demo\n\nThe header is cut to 8 lines.\n`;

const REVIEWER = { gitUserName: () => 'Rev Iewer\n', osUserName: () => 'rev' };
/** Who the current actor is when the request names none: no tracker, no git email, so the OS user. */
const IDENTITY = new IdentityService({
	path: join(tmpdir(), 'insrc-review-decision-no-identity.json'), hostId: 'h', osUser: () => 'dana', hostname: () => 'box',
	loadTracker: () => ({ ok: false, kind: 'rejected', reason: 'none' }),
	run: async () => ({ stdout: '', stderr: '', code: 1, spawnError: false, timedOut: false, stdoutTruncated: false }),
});
/** The comments are saved through the repository's real registry entry (its FeedbackService), as the daemon wires them. */
const feedbackFor: NonNullable<ReviewDecisionDeps['feedbackFor']> = repo => ({ feedback: lifecycleFor(repo).feedback, currentActor: p => IDENTITY.currentActor(p) });
const DEPS: ReviewDecisionDeps = { reviewer: REVIEWER, feedbackFor };

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
			workflow: 'design.story', runId: 'wf-lld', schemaVersion: 1, epicHash: HASH, storyId: 's1',
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

function cleanup(repo: string): void { resetLifecycleRegistry(); rmSync(repo, { recursive: true, force: true }); }

/** The comments stored for the fixture's artifact, however the reader orders them. */
const entriesOf = (fx: Fixture): Promise<Feedback[]> => lifecycleFor(fx.repo).feedback.entries(ID);
const byText = (all: readonly Feedback[], text: string): Feedback => all.find(e => e.text === text)!;

interface Stored {
	readonly meta: { approvedAt?: string; rejectedAt?: string; rejectReason?: string };
	readonly body: Record<string, unknown>;
}
/** The head as the decision left it, with the approval and the rejection read back from the lifecycle and the log (nothing is stamped in the head). */
function stored(jsonPath: string): Stored {
	const head = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
	const state = approvalStateOf(head.meta);
	const log = new FileSidecarStore(dirname(dirname(dirname(jsonPath)))).readRecordsSync<ChangeLogEntry>('log', basename(jsonPath).replace(/\.json$/, ''));
	const reject = state === 'rejected' ? [...log].reverse().find(e => e.operation === 'reject') : undefined;
	const approval = (head.meta['lifecycle'] as { approval?: { at: string } } | undefined)?.approval;
	for (const stamp of ['approvedAt', 'rejectedAt', 'rejectReason']) assert.equal(head.meta[stamp], undefined, `the head carries no ${stamp}`);
	return {
		meta: {
			...(state === 'approved' && approval !== undefined ? { approvedAt: approval.at } : {}),
			...(reject !== undefined ? { rejectedAt: reject.timestamp, ...(reject.outcome?.summary !== undefined ? { rejectReason: reject.outcome.summary } : {}) } : {}),
		},
		body: head.body,
	};
}

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
		const r = await decide(fx, { decision: 'approve', comments: [INLINE, WHOLE, ON_HTML] }, {
			...DEPS,
			approve: async (req, o) => { order.push('approve'); return approveWorkflowTarget(req, o); },
			feedbackFor: repo => {
				const through = feedbackFor(repo);
				return { ...through, feedback: { add: (id, input, actor) => {
					if (!order.includes('comments')) order.push('comments');
					assert.equal(typeof stored(fx.jsonPath).meta.approvedAt, 'string', 'the approval is on disk before the comments are written');
					return through.feedback.add(id, input, actor);
				} } };
			},
		});
		assert.deepEqual(order, ['approve', 'comments']);
		assert.equal(r.artifactId, ID);
		assert.equal(r.decision, 'approve');
		assert.equal(r.outcome, 'approved');
		assert.equal(r.recorded, 3);
		assert.equal(r.author, 'Rev Iewer');
		assert.equal('commentsError' in r, false);

		assert.equal(typeof stored(fx.jsonPath).meta.approvedAt, 'string');
		const fb = await entriesOf(fx);
		assert.deepEqual(fb.map(e => e.id).sort(), [...r.entryIds].sort(), 'entryIds are the stored Feedback ids');
		assert.deepEqual(fb.map(e => e.text).sort(), ['Say what the header shows.', WHOLE.comment, ON_HTML.comment].sort(), 'trimmed');
		assert.ok(fb.every(e => e.kind === 'comment' && e.actor.properties['name'] === 'Rev Iewer' && e.actor.id === 'os:dana@box'));
		assert.equal(new Set(fb.map(e => e.batchId)).size, 1, 'one batch id');
		assert.deepEqual(byText(fb, 'Say what the header shows.').anchor, { quote: 'cut to 8 lines', prefix: 'The header is ', suffix: '.', section: 'demo' });
		assert.equal(byText(fb, WHOLE.comment).anchor, undefined, 'the .md is the default file and a whole-document comment has no anchor');
		assert.deepEqual(byText(fb, ON_HTML.comment).anchor, { section: HTML_REL }, 'a companion file rides in anchor.section');
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
		assert.ok((await entriesOf(held)).every(e => e.kind === 'revision-request'), 'a comment is never saved with a decision that did not take effect');
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
		assert.ok((await entriesOf(fx)).every(e => e.kind === 'comment' && e.actor.properties['name'] === 'Rev Iewer'));
		assert.equal(handleArtifactContentState(fx), 'rejected');
	} finally { cleanup(fx.repo); }

	// Inline comments only: the default reason names the reviewer.
	const inlineOnly = makeFixture();
	try {
		const r = await decide(inlineOnly, { decision: 'reject', comments: [INLINE] });
		assert.equal(r.outcome, 'rejected');
		assert.equal(r.reason, 'Rejected in the review pane by Rev Iewer');
		assert.equal(stored(inlineOnly.jsonPath).meta.rejectReason, 'Rejected in the review pane by Rev Iewer');
		assert.equal((await entriesOf(inlineOnly)).length, 1);
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
		[approvedMeta(), 'approved'],
		[rejectedMeta(), 'rejected'],
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
			assert.ok((await entriesOf(fx)).every(e => e.kind === 'revision-request'));
		} finally { cleanup(fx.repo); }
	}

	// What was in body.feedback before stays where it is (the line files are separate until s9).
	const prior = [{ id: 'old1', author: 'A', timestamp: '2026-10-12T09:00:00.000Z', target: { file: MD_REL }, comment: 'Earlier.' }];
	const fx = makeFixture({ feedback: prior });
	try {
		await decide(fx, { decision: 'feedback', comments: [WHOLE] });
		assert.deepEqual(stored(fx.jsonPath).body['feedback'], prior);
		assert.equal((await entriesOf(fx)).length, 1);
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
		const r = await decide(approved, { decision: 'approve' }, { ...DEPS, feedbackFor: repo => { appended += 1; return feedbackFor(repo); } });
		assert.equal(r.outcome, 'approved');
		assert.equal(r.recorded, 0);
		assert.deepEqual(r.entryIds, []);
		assert.equal(appended, 0, 'the feedback service is not asked for');
		const s = stored(approved.jsonPath);
		assert.equal(typeof s.meta.approvedAt, 'string');
		assert.equal('feedback' in s.body, false);
		assert.deepEqual(await entriesOf(approved), []);
	} finally { cleanup(approved.repo); }

	const rejected = makeFixture();
	try {
		const r = await decide(rejected, { decision: 'reject', comments: [] });
		assert.equal(r.outcome, 'rejected');
		assert.equal(r.recorded, 0);
		assert.equal('feedback' in stored(rejected.jsonPath).body, false);
		assert.deepEqual(await entriesOf(rejected), []);
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
	for (const meta of [approvedMeta(), rejectedMeta()]) {
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
		const feedbackBefore = (await entriesOf(fx)).length;
		const thrown = await handleReviewDecision({ repo: fx.repo, mdPath: MD_REL, decision: 'reject', comments: [WHOLE] }, undefined, {
			...DEPS, reject: () => { throw new Error('disk full'); },
		});
		assert.ok('error' in thrown && /disk full/.test(thrown.error));
		assert.equal((await entriesOf(fx)).length, feedbackBefore);
		assert.equal(stored(fx.jsonPath).meta.rejectedAt, undefined);
	} finally { cleanup(fx.repo); }
});

test('review decision: a failing comment write after the decision took effect reports the outcome with commentsError', async () => {
	const failing: ReviewDecisionDeps = { ...DEPS, feedbackFor: () => ({ feedback: { add: async () => { throw new Error('cannot write the artifact'); } }, currentActor: async () => ({ id: 'os:dana@box', kind: 'person', properties: {} }) }) };

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
		assert.equal((await entriesOf(fx))[0]!.actor.properties['name'], 'Rev Iewer');
		assert.ok(!readFileSync(fx.jsonPath, 'utf8').includes('Mallory'));

		// With no git name the OS login is the author; with neither, 'unknown'.
		const os = await decide(fx, { decision: 'feedback', comments: [WHOLE] }, { reviewer: { ...REVIEWER, gitUserName: () => undefined }, feedbackFor });
		assert.equal(os.author, 'rev');
		const unknown = await decide(fx, { decision: 'feedback', comments: [WHOLE] }, { reviewer: { gitUserName: () => undefined, osUserName: () => undefined }, feedbackFor });
		assert.equal(unknown.author, 'unknown');
		assert.deepEqual((await entriesOf(fx)).map(e => e.actor.properties['name']).sort(), ['Rev Iewer', 'rev', 'unknown']);
	} finally { cleanup(fx.repo); }

	// The reject default reason names the same author.
	const rejected = makeFixture();
	try {
		const r = await decide(rejected, { decision: 'reject', author: 'Mallory' }, { reviewer: { ...REVIEWER, gitUserName: () => undefined } });
		assert.equal(r.reason, 'Rejected in the review pane by rev');
	} finally { cleanup(rejected.repo); }
});

test("handleReviewDecision stores its comments as Feedback entries by the request's actor or the current actor, with kind revision-request for send-feedback and one batchId, and still reports commentsError when saving fails after the decision", async () => {
	// send feedback: revision requests, by the request's actor
	const fb = makeFixture();
	try {
		const r = await decide(fb, { decision: 'feedback', actor: { id: 'github:erin' }, comments: [INLINE, WHOLE] });
		const all = await entriesOf(fb);
		assert.equal(all.length, 2);
		assert.deepEqual(all.map(e => e.id).sort(), [...r.entryIds].sort());
		assert.ok(all.every(e => e.kind === 'revision-request' && e.actor.id === 'github:erin' && e.actor.properties['name'] === 'Rev Iewer'));
		assert.equal(new Set(all.map(e => e.batchId)).size, 1);
		assert.ok(all[0]!.batchId !== undefined && all[0]!.batchId.length > 0);
	} finally { cleanup(fb.repo); }

	// approve and reject: comments, by the current actor when the request names none
	for (const decision of ['approve', 'reject'] as const) {
		const fx = makeFixture({ reviewed: true });
		try {
			await decide(fx, { decision, comments: [WHOLE] });
			const [e] = await entriesOf(fx);
			assert.equal(e?.kind, 'comment', decision);
			assert.equal(e?.actor.id, 'os:dana@box', decision);
		} finally { cleanup(fx.repo); }
	}

	// an actor that is not a namespaced lower-case id is refused before anything is written
	const bad = makeFixture({ reviewed: true });
	try {
		const before = readFileSync(bad.jsonPath);
		const res = await handleReviewDecision({ repo: bad.repo, mdPath: MD_REL, decision: 'approve', comments: [WHOLE], actor: { id: 'Erin' } } as never, undefined, DEPS);
		assert.ok('error' in res && /actor/.test(res.error));
		assert.ok(readFileSync(bad.jsonPath).equals(before));
	} finally { cleanup(bad.repo); }

	// a save that fails after the decision: commentsError, the decision stands, and the entries saved before it are reported
	const part = makeFixture();
	try {
		let calls = 0;
		const r = await decide(part, { decision: 'reject', comments: [WHOLE, { comment: 'second' }] }, {
			...DEPS,
			feedbackFor: repo => {
				const through = feedbackFor(repo);
				return { ...through, feedback: { add: (id, input, actor) => { if (++calls === 2) throw new Error('disk full'); return through.feedback.add(id, input, actor); } } };
			},
		});
		assert.equal(r.outcome, 'rejected');
		assert.equal(r.commentsError, 'disk full');
		assert.equal(typeof stored(part.jsonPath).meta.rejectedAt, 'string', 'the rejection stands');
		assert.equal(r.recorded, 1);
		assert.equal((await entriesOf(part)).length, 1);
	} finally { cleanup(part.repo); }

	// no feedback service at all: the decision stands and the comments are reported as not saved
	const none = makeFixture();
	try {
		const r = await decide(none, { decision: 'reject', comments: [WHOLE] }, { reviewer: REVIEWER });
		assert.equal(r.outcome, 'rejected');
		assert.match(r.commentsError ?? '', /no feedback service/);
		assert.equal(r.recorded, 0);
	} finally { cleanup(none.repo); }
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
	const src = readFileSync(join(import.meta.dirname, '..', '..', 'daemon', 'index.ts'), 'utf8');

	const decision = handlerSource(src, 'workflow.reviewDecision');
	assert.match(decision, /await import\('\.\.\/workflow\/review-decision\.js'\)/);
	assert.match(decision, /return handleReviewDecision\(/);
	assert.match(decision, /process\.env\['INSRC_REPO'\]/);
	assert.match(decision, /feedbackFor: repoPath => \{/, 'the comments are saved through the registry\'s FeedbackService');
	assert.match(decision, /feedback: entry\.feedback/);
	assert.match(decision, /advanceApprovedBugfixes/, 'the follow-on of an approval is the one workflow.approve runs');

	// The three existing handlers, as they were: each still delegates to its own
	// function and none goes through the new call.
	// 'workflow.approve' delegates to its own function (s4 moved the body to workflow-approve.ts so it can be tested), which runs
	// the same approval and the same bugfix follow-on.
	const approve = handlerSource(src, 'workflow.approve');
	assert.match(approve, /return handleWorkflowApprove\(params, process\.env\['INSRC_REPO'\]/);
	assert.match(approve, /advanceApprovedBugfixes\(approved, \{/);
	const approveSrc = readFileSync(join(import.meta.dirname, '..', '..', 'daemon', 'workflow-approve.ts'), 'utf8');
	assert.match(approveSrc, /await \(deps\.approve \?\? approveWorkflowTarget\)\(\{/);
	assert.match(approveSrc, /const followOn = await deps\.followOn\(result\.approved, repoForStore\);/);
	assert.equal(handlerSource(src, 'workflow.resolveComment'), [
		`\t\t'workflow.resolveComment': async (params) => {`,
		`\t\t\tconst { handleResolveComment } = await import('../workflow/resolve-comment.js');`,
		`\t\t\treturn handleResolveComment(`,
		`\t\t\t\tparams as Parameters<typeof handleResolveComment>[0],`,
		`\t\t\t\tprocess.env['INSRC_REPO'],`,
		`\t\t\t);`,
	].join('\n'));
	// s5 re-pointed the handler at the feedback service; it stays a one-call delegate and does not go through the new call.
	assert.equal(handlerSource(src, 'artifact.feedback.append'), [
		`\t\t'artifact.feedback.append': async (params) => {`,
		`\t\t\tconst { handleFeedbackAppend } = await import('./feedback-handlers.js');`,
		`\t\t\treturn handleFeedbackAppend(params);`,
	].join('\n'));
	for (const method of ['workflow.approve', 'workflow.resolveComment', 'artifact.feedback.append']) {
		assert.ok(!handlerSource(src, method).includes('review-decision'), `${method} does not go through the new call`);
	}
});

// Story E20261013dd277f9c:S001 — a BUILD record is decided from the pane like any record.
test("handleReviewDecision on a BUILD record: approve goes through the same approve call as any record and a result that call withholds is returned with its reason; reject stamps the record, after which it is not listed and the pane's call refuses a further decision on it", async () => {
	const { listPendingArtifacts } = await import('../pending.js');
	const repo = mkdtempSync(join(tmpdir(), 'insrc-review-decision-build-'));
	try {
		const id = `BUILD-${HASH}-s1`;
		const mdRel = `${DIR_REL}/BUILD.md`;
		const meta = { workflow: 'build', epicHash: HASH, storyId: 's1', standalone: true, epicSlug: 'demo', createdAt: '2026-10-13T08:00:00.000Z', epicCreatedAt: '2026-10-13T08:00:00.000Z' };
		mkdirSync(join(repo, DIR_REL), { recursive: true });
		writeFileSync(join(repo, mdRel), `<!-- insrc:artifact ${id} -->\n\n# Build — Story S001\n`);
		mkdirSync(join(repo, ARTIFACTS_DIR), { recursive: true });
		const jsonPath = join(repo, ARTIFACTS_DIR, `${id}.json`);
		writeFileSync(jsonPath, JSON.stringify({ meta, body: { summary: 'built' }, citations: [] }, null, 2) + '\n');
		writeFileSync(join(repo, ARTIFACTS_DIR, `CR-${HASH}-s1.json`), JSON.stringify({ meta: { ...meta, workflow: 'code-review' }, body: { verdict: 'pass' } }));
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
		assert.deepEqual(calls, [{ repoPath: repo, artifactPath: jsonPath, actor: { id: 'insrc:approval', kind: 'system', properties: {} } }], 'the same call as for any record: the repository, the record and who decides');
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

test('review-decision.test.ts: a review decision records its resolution as a log entry', async () => {
	// the rejection: an entry of the artifact's log with the reason, by the actor the decision names; the head carries no stamp
	const rejected = makeFixture();
	try {
		const r = await decide(rejected, { decision: 'reject', comments: [WHOLE, INLINE], actor: { id: 'github:alice', kind: 'person', properties: {} } });
		assert.equal(r.outcome, 'rejected');
		const log = await lifecycleFor(rejected.repo).store.readWithHistory(ID);
		const entry = log.changeLog.find(e => e.operation === 'reject');
		assert.deepEqual([entry?.outcome?.result, entry?.outcome?.summary, entry?.actor.id], ['rejected', WHOLE.comment, 'github:alice']);
		assert.equal(log.lifecycle.status, 'rejected');
		const head = JSON.parse(readFileSync(rejected.jsonPath, 'utf8')) as { meta: Record<string, unknown> };
		for (const stamp of ['approvedAt', 'rejectedAt', 'rejectReason']) assert.equal(head.meta[stamp], undefined, stamp);
		// and the comments went through the FeedbackService, as sidecar lines with the decision that took effect
		const lines = await entriesOf(rejected);
		assert.equal(lines.length, 2);
		assert.ok(lines.every(l => l.kind === 'comment'));
	} finally { cleanup(rejected.repo); }

	// the approval: an entry that names the approving actor; the feedback is saved after it
	const approved = makeFixture({ reviewed: true });
	try {
		const r = await decide(approved, { decision: 'approve', comments: [WHOLE], actor: { id: 'github:alice', kind: 'person', properties: {} } });
		assert.equal(r.outcome, 'approved');
		const log = await lifecycleFor(approved.repo).store.readWithHistory(ID);
		const entry = log.changeLog.find(e => e.operation === 'approve');
		assert.deepEqual([entry?.actor.id, entry?.status], ['github:alice', { from: 'draft', to: 'approved' }]);
		assert.equal(log.lifecycle.status, 'approved');
	} finally { cleanup(approved.repo); }
});
