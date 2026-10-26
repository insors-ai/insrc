import assert from 'node:assert/strict';
import { test } from 'node:test';

import { reviewBuildGap, reviewedBuildFingerprint } from '../code-review/build-freshness.js';
import { validCodeReview } from './helpers/valid-code-review.js';

const REPO = '/tmp/repo';
const BUILD = {
	meta: { workflow: 'build', storyId: 's1', createdAt: '2026-01-01T00:00:00.000Z' },
	body: { commit: 'abc', tasks: [{ id: 't1', passed: true }], changeLog: [{ target: { file: 'src/a.ts' } }, { target: { file: 'src/b.ts' } }] },
};

test('review-record-builder.test.ts: the builder\'s record passes reviewBuildGap for a BUILD with a two-file changeLog', () => {
	for (const verdict of ['pass', 'warn', 'block'] as const) {
		const review = validCodeReview(BUILD, verdict);
		assert.deepEqual((review.body['subject'] as { changedFiles: string[] }).changedFiles, ['src/a.ts', 'src/b.ts']);
		assert.equal(reviewBuildGap(BUILD, review, REPO), undefined, verdict);
	}
	const parties = validCodeReview(BUILD, 'pass', { meta: { authoredBy: 'controller' } });
	assert.deepEqual(parties.meta, { authoredBy: 'controller' });
});

test('review-record-builder.test.ts: reviewBuildGap still refuses a review with no verdict, no changedFiles, no buildFingerprint, a stale fingerprint or an uncovered changeLog file', () => {
	const good = validCodeReview(BUILD, 'pass');
	const subject = good.body['subject'] as Record<string, unknown>;
	const withBody = (body: Record<string, unknown>) => ({ meta: {}, body });
	const { verdict: _v, ...noVerdict } = good.body;
	const { changedFiles: _c, ...noFiles } = subject;
	const { buildFingerprint: _f, ...noFingerprint } = subject;
	assert.match(reviewBuildGap(BUILD, withBody(noVerdict), REPO) ?? '', /code review structure cannot be verified/, 'no verdict');
	assert.match(reviewBuildGap(BUILD, withBody({ ...good.body, subject: noFiles }), REPO) ?? '', /code review structure cannot be verified/, 'no changedFiles');
	assert.match(reviewBuildGap(BUILD, withBody({ ...good.body, subject: noFingerprint }), REPO) ?? '', /no BUILD binding/, 'no buildFingerprint');
	assert.match(reviewBuildGap(BUILD, withBody({ ...good.body, subject: { ...subject, buildFingerprint: 'stale' } }), REPO) ?? '', /BUILD content has changed/, 'stale fingerprint');
	const moved = { ...BUILD, body: { ...BUILD.body, changeLog: [...BUILD.body.changeLog, { target: { file: 'src/c.ts' } }] } };
	const stillBound = withBody({ ...good.body, subject: { ...subject, buildFingerprint: reviewedBuildFingerprint(moved) } });
	assert.match(reviewBuildGap(moved, stillBound, REPO) ?? '', /does not cover BUILD file 'src\/c\.ts'/, 'uncovered changeLog file');
});
