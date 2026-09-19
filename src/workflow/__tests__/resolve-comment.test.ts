/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 (Epic ide-artifact-review-panel-jetbrains-plugin) — daemon tests for
 * handleResolveComment (the a1 comment->resolution mapping) + parseArtifactId.
 *
 * The recordResolution seam is faked so the LOAD-BEARING mapping logic (which
 * comment resolves which qId, append-vs-resolve, recorded count, the failure
 * paths) is verified headlessly without recordResolution's full artifact
 * re-render (recordResolution itself is covered in questions.test.ts). The
 * append path writes REAL json, so body.openQuestions growth + read-only-except-
 * target are asserted against the filesystem.
 *
 * Run: npx tsx --test src/workflow/__tests__/resolve-comment.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	handleResolveComment,
	parseArtifactId,
	type ResolveCommentResult,
	type ReviewComment,
	type RecordResolutionFn,
} from '../resolve-comment.js';
import { questionId } from '../questions.js';
import { ARTIFACTS_DIR } from '../storage.js';

const HASH = '238917216d8fd532';
const ARTIFACT_ID = `LLD-${HASH}-s4`;
const EXISTING_Q = 'Which cache policy should we use?';

interface RecordedCall {
	kind: string; epicHash: string; storyId: string | undefined;
	qId: string; status: string; choice?: string; rationale?: string;
}

function fakeRecorder(): { fn: RecordResolutionFn; calls: RecordedCall[] } {
	const calls: RecordedCall[] = [];
	const fn = ((repoPath, kind, epicHash, storyId, qId, status, choice, rationale) => {
		calls.push({ kind, epicHash, storyId, qId, status, choice, rationale });
		return { jsonPath: '', mdPath: '', resolution: { question: '', status, resolvedAt: '' }, remainingOpen: [] };
	}) as RecordResolutionFn;
	return { fn, calls };
}

function makeFixture(opts: { openQuestions?: string[]; omitArtifact?: boolean } = {}): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolvecmt-'));
	if (opts.omitArtifact !== true) {
		const dir = join(repo, ARTIFACTS_DIR);
		mkdirSync(dir, { recursive: true });
		const art = { meta: {}, body: { openQuestions: opts.openQuestions ?? [] } };
		writeFileSync(join(dir, `${ARTIFACT_ID}.json`), JSON.stringify(art, null, 2) + '\n');
	}
	return repo;
}

function cleanup(repo: string): void { rmSync(repo, { recursive: true, force: true }); }

function readOpenQuestions(repo: string): string[] {
	const art = JSON.parse(readFileSync(join(repo, ARTIFACTS_DIR, `${ARTIFACT_ID}.json`), 'utf8')) as { body: { openQuestions: string[] } };
	return art.body.openQuestions;
}

function asResult(r: ResolveCommentResult | { error: string }): ResolveCommentResult {
	assert.ok(!('error' in r), `expected a result, got error: ${(r as { error?: string }).error}`);
	return r as ResolveCommentResult;
}

function comment(id: string, body: string, anchor: ReviewComment['anchor'] = {}): ReviewComment {
	return { id, anchor, body };
}

// ---- parseArtifactId -------------------------------------------------------

test('parseArtifactId: DEF/HLD/LLD decode to the (kind, epicHash, storyId) locator', () => {
	assert.deepEqual(parseArtifactId(`LLD-${HASH}-s4`), { kind: 'lld', epicHash: HASH, storyId: 's4' });
	assert.deepEqual(parseArtifactId(`DEF-${HASH}`), { kind: 'define', epicHash: HASH, storyId: undefined });
	assert.deepEqual(parseArtifactId(`HLD-${HASH}`), { kind: 'hld', epicHash: HASH, storyId: undefined });
});

test('parseArtifactId: malformed or unsupported ids return null', () => {
	for (const bad of ['', 'nonsense', `PLAN-${HASH}-s4`, `SPEC-${HASH}`, `CR-${HASH}-s4`, `LLD-${HASH}`, `DEF-${HASH}-s4`, `LLD--s4`]) {
		assert.equal(parseArtifactId(bad), null, `expected null for ${bad}`);
	}
});

// ---- happy paths -----------------------------------------------------------

test('an openQuestionId-anchored comment resolves that existing question (no append)', () => {
	const repo = makeFixture({ openQuestions: [EXISTING_Q] });
	const rec = fakeRecorder();
	try {
		const qid = questionId(EXISTING_Q);
		const r = asResult(handleResolveComment(
			{ repo, artifactId: ARTIFACT_ID, comments: [comment('c1', 'use LRU', { openQuestionId: qid })] },
			undefined, { record: rec.fn },
		));
		assert.equal(r.recorded, 1);
		assert.deepEqual(r.resolutions, [{ openQuestionId: qid, status: 'resolved' }]);
		assert.equal(rec.calls.length, 1);
		assert.equal(rec.calls[0]!.qId, qid);
		assert.equal(rec.calls[0]!.status, 'resolved');
		assert.equal(rec.calls[0]!.rationale, 'use LRU');
		// the existing question is resolved in place — body.openQuestions is unchanged
		assert.deepEqual(readOpenQuestions(repo), [EXISTING_Q]);
	} finally {
		cleanup(repo);
	}
});

test('a section/quote/general comment appends a new open question then resolves it (a1)', () => {
	const repo = makeFixture({ openQuestions: [] });
	const rec = fakeRecorder();
	try {
		const r = asResult(handleResolveComment(
			{ repo, artifactId: ARTIFACT_ID, comments: [comment('c1', 'this section is unclear', { sectionPath: 'Contract > api' })] },
			undefined, { record: rec.fn },
		));
		assert.equal(r.recorded, 1);
		// body.openQuestions grew by one; the recorded qId is that appended question's id
		const oqs = readOpenQuestions(repo);
		assert.equal(oqs.length, 1);
		assert.match(oqs[0]!, /this section is unclear/);
		assert.match(oqs[0]!, /Contract > api/);
		assert.equal(rec.calls[0]!.qId, questionId(oqs[0]!));
		assert.equal(rec.calls[0]!.choice, 'Contract > api'); // anchor summary as provenance
	} finally {
		cleanup(repo);
	}
});

test('a stale openQuestionId (not a current question) falls back to the append path', () => {
	const repo = makeFixture({ openQuestions: [] });
	const rec = fakeRecorder();
	try {
		const r = asResult(handleResolveComment(
			{ repo, artifactId: ARTIFACT_ID, comments: [comment('c1', 'stale anchor body', { openQuestionId: 'q-gone' })] },
			undefined, { record: rec.fn },
		));
		assert.equal(r.recorded, 1);
		const oqs = readOpenQuestions(repo);
		assert.equal(oqs.length, 1);                       // appended, not dropped
		assert.equal(rec.calls[0]!.qId, questionId(oqs[0]!));
	} finally {
		cleanup(repo);
	}
});

test('recorded === comments written; resolutions[] reports one entry per comment', () => {
	const repo = makeFixture({ openQuestions: [EXISTING_Q] });
	const rec = fakeRecorder();
	try {
		const qid = questionId(EXISTING_Q);
		const r = asResult(handleResolveComment(
			{ repo, artifactId: ARTIFACT_ID, comments: [
				comment('c1', 'answer', { openQuestionId: qid }),
				comment('c2', 'general one', { sectionPath: 'A' }),
				comment('c3', 'general two', { quote: 'some snippet' }),
			] },
			undefined, { record: rec.fn },
		));
		assert.equal(r.recorded, 3);
		assert.equal(r.resolutions.length, 3);
		assert.equal(rec.calls.length, 3);
		// the two general comments each appended a question (the anchored one did not)
		assert.equal(readOpenQuestions(repo).length, 3);
	} finally {
		cleanup(repo);
	}
});

// ---- failure paths (every one a RETURNED { error }) ------------------------

test('malformed/unsupported artifactId -> { error }, no write', () => {
	const repo = makeFixture();
	try {
		for (const bad of [`PLAN-${HASH}-s4`, 'garbage', '']) {
			const r = handleResolveComment({ repo, artifactId: bad, comments: [comment('c1', 'x', { sectionPath: 'A' })] }, undefined, { record: fakeRecorder().fn });
			assert.ok('error' in r, `expected error for '${bad}'`);
		}
	} finally {
		cleanup(repo);
	}
});

test('empty comments or a blank body -> { error }', () => {
	const repo = makeFixture();
	try {
		assert.ok('error' in handleResolveComment({ repo, artifactId: ARTIFACT_ID, comments: [] }, undefined, { record: fakeRecorder().fn }));
		assert.ok('error' in handleResolveComment({ repo, artifactId: ARTIFACT_ID, comments: [comment('c1', '   ', { sectionPath: 'A' })] }, undefined, { record: fakeRecorder().fn }));
	} finally {
		cleanup(repo);
	}
});

test('repo unresolved -> { error }', () => {
	const r = handleResolveComment({ artifactId: ARTIFACT_ID, comments: [comment('c1', 'x', { sectionPath: 'A' })] }, undefined, { record: fakeRecorder().fn });
	assert.ok('error' in r);
});

test('absent artifact json -> { error } (recorded 0, before any write)', () => {
	const repo = makeFixture({ omitArtifact: true });
	try {
		const r = handleResolveComment({ repo, artifactId: ARTIFACT_ID, comments: [comment('c1', 'x', { sectionPath: 'A' })] }, undefined, { record: fakeRecorder().fn });
		assert.ok('error' in r);
	} finally {
		cleanup(repo);
	}
});

test('a mid-batch record failure -> { error } naming recorded-so-far, no silent drop', () => {
	const repo = makeFixture({ openQuestions: [] });
	let n = 0;
	const throwingRecord = ((..._args: unknown[]) => {
		n += 1;
		if (n === 2) throw new Error('boom');
		return { jsonPath: '', mdPath: '', resolution: { question: '', status: 'resolved', resolvedAt: '' }, remainingOpen: [] };
	}) as RecordResolutionFn;
	try {
		const r = handleResolveComment(
			{ repo, artifactId: ARTIFACT_ID, comments: [comment('c1', 'one', { sectionPath: 'A' }), comment('c2', 'two', { sectionPath: 'B' })] },
			undefined, { record: throwingRecord },
		);
		assert.ok('error' in r);
		assert.match((r as { error: string }).error, /recorded 1 of 2/);
	} finally {
		cleanup(repo);
	}
});

test('re-submitting the SAME general comment is idempotent (no duplicate open question)', () => {
	const repo = makeFixture({ openQuestions: [] });
	try {
		const c = comment('c1', 'this section is unclear', { sectionPath: 'Contract > api' });
		asResult(handleResolveComment({ repo, artifactId: ARTIFACT_ID, comments: [c] }, undefined, { record: fakeRecorder().fn }));
		asResult(handleResolveComment({ repo, artifactId: ARTIFACT_ID, comments: [c] }, undefined, { record: fakeRecorder().fn }));
		// the identical comment is reused, not appended twice
		assert.equal(readOpenQuestions(repo).length, 1);
	} finally {
		cleanup(repo);
	}
});

test('read-only-except-target: only the target artifact json is written', () => {
	const repo = makeFixture({ openQuestions: [] });
	const rec = fakeRecorder();
	try {
		const before = readdirSync(join(repo, ARTIFACTS_DIR)).sort();
		handleResolveComment({ repo, artifactId: ARTIFACT_ID, comments: [comment('c1', 'x', { sectionPath: 'A' })] }, undefined, { record: rec.fn });
		const after = readdirSync(join(repo, ARTIFACTS_DIR)).sort();
		assert.deepEqual(after, before);   // no new files created in the artifacts dir
	} finally {
		cleanup(repo);
	}
});
