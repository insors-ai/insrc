/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The shared test helper that gives a fixture the review its approval requires.
 * (LLD-1716f77ba9ba017b-S001, test T18; plan task t9.)
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { authorPartyOf, reviewerPartyOf } from '../review/party.js';
import { effectiveReviewVerdict } from '../review/resolve.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';

const HASH = 'abcd1234ef567890';

function fixture(name: string, meta: Record<string, unknown>) {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-review-helper-'));
	const dir = join(repo, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	const json = join(dir, name);
	writeFileSync(json, JSON.stringify({ meta: { epicHash: HASH, storyId: 'S001', ...meta }, body: { keep: 'me' }, citations: [] }, null, 2));
	return { dir, json, read: () => JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown>; body: unknown }, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const DESIGN = [['DEF', `DEF-${HASH}.json`, 'define'], ['HLD', `HLD-${HASH}.json`, 'design.epic'], ['LLD', `LLD-${HASH}-S001.json`, 'design.story']] as const;

for (const [kind, name, workflow] of DESIGN) {
	for (const [author, reviewer] of [['controller', 'daemon'], ['daemon', 'controller']] as const) {
		test(`T18 a ${kind} authored by the ${author} is stamped with a passing review by the ${reviewer}`, () => {
			const f = fixture(name, { workflow, authoredBy: author });
			try {
				const out = stampOtherPartyReview(f.json);
				assert.deepEqual(out, { reviewedBy: reviewer, path: f.json });
				const stored = f.read();
				const review = stored.meta['review'] as Record<string, unknown>;
				assert.equal(reviewerPartyOf(review), reviewer);
				assert.notEqual(reviewerPartyOf(review), authorPartyOf(stored.meta), 'never the party that authored it');
				assert.equal(review['stage'], workflow);
				assert.equal(effectiveReviewVerdict(review as never, undefined), 'pass');
				// The model label agrees with the party, so a reader that only has the label says the same.
				assert.equal(reviewerPartyOf({ model: review['model'] }), reviewer);
				assert.deepEqual(stored.body, { keep: 'me' }, 'the artifact itself is untouched');
				assert.equal(stored.meta['authoredBy'], author);
			} finally { f.cleanup(); }
		});
	}

	test(`T18 a ${kind} with no author gets a daemon review, which no known author can match`, () => {
		const f = fixture(name, { workflow });
		try {
			assert.equal(stampOtherPartyReview(f.json).reviewedBy, 'daemon');
			const stored = f.read();
			assert.equal(authorPartyOf(stored.meta), 'unknown');
			assert.equal(reviewerPartyOf(stored.meta['review']), 'daemon');
		} finally { f.cleanup(); }
	});
}

test('T18 an older fixture is read by its attribution labels: written by `client`, reviewed by the daemon', () => {
	const f = fixture(`DEF-${HASH}.json`, { workflow: 'define', attribution: { outputs: [{ role: 'synthesize', tier: 'core', runner: 'cli-claude', model: 'client' }] } });
	try {
		assert.equal(stampOtherPartyReview(f.json).reviewedBy, 'daemon');
	} finally { f.cleanup(); }
});

for (const [author, reviewer] of [['controller', 'daemon'], ['daemon', 'controller'], [undefined, 'daemon']] as const) {
	test(`T18 a BUILD record (author: ${author ?? 'none'}) gets a passing code-review record beside it, by the ${reviewer}`, () => {
		const f = fixture(`BUILD-${HASH}-S001.json`, { workflow: 'build', ...(author !== undefined ? { authoredBy: author } : {}) });
		try {
			const before = readFileSync(f.json, 'utf8');
			const out = stampOtherPartyReview(f.json);
			const crPath = join(f.dir, `CR-${HASH}-S001.json`);
			assert.deepEqual(out, { reviewedBy: reviewer, path: crPath });
			assert.ok(existsSync(crPath));
			const cr = JSON.parse(readFileSync(crPath, 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
			assert.equal(reviewerPartyOf(cr.meta), reviewer);
			assert.equal(cr.meta['workflow'], 'code-review');
			assert.equal(cr.meta['epicHash'], HASH);
			assert.equal(cr.meta['storyId'], 'S001');
			assert.equal(cr.body['kind'], 'code-review');
			assert.equal(cr.body['verdict'], 'pass');
			assert.equal(readFileSync(f.json, 'utf8'), before, 'the BUILD record itself is not rewritten');
		} finally { f.cleanup(); }
	});
}
