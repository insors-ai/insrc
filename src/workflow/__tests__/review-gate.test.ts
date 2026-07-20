/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { approveArtifactByJsonPath, ReviewBlockedError } from '../gates.js';

function writeArtifact(dir: string, verdict: 'block' | 'pass'): string {
	const p = join(dir, 'PLAN-x.json');
	writeFileSync(p, JSON.stringify({
		meta: {
			workflow: 'plan',
			review: { verdict, counts: { high: 1, med: 2, low: 3 } },
		},
		body: {},
		citations: [],
	}, null, 2) + '\n');
	return p;
}

test('approve is refused when the review verdict is block and no override', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const p = writeArtifact(dir, 'block');
		assert.throws(() => approveArtifactByJsonPath(p), (e: unknown) => {
			assert.ok(e instanceof ReviewBlockedError);
			assert.match(e.summary, /1 HIGH · 2 MED · 3 LOW/);
			return true;
		});
		// artifact stays un-approved
		const meta = JSON.parse(readFileSync(p, 'utf8')).meta;
		assert.equal(meta.approvedAt, undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('approve proceeds with an override reason and records reviewOverride', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const p = writeArtifact(dir, 'block');
		const res = approveArtifactByJsonPath(p, { overrideReview: 'accepted: findings are non-material' });
		assert.equal(res.workflow, 'plan');
		assert.ok(res.approvedAt);
		const meta = JSON.parse(readFileSync(p, 'utf8')).meta;
		assert.ok(meta.approvedAt);
		assert.equal(meta.reviewOverride.reason, 'accepted: findings are non-material');
		assert.ok(meta.reviewOverride.at);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('approve proceeds normally when the verdict is not block', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const p = writeArtifact(dir, 'pass');
		const res = approveArtifactByJsonPath(p);
		assert.ok(res.approvedAt);
		const meta = JSON.parse(readFileSync(p, 'utf8')).meta;
		assert.ok(meta.approvedAt);
		assert.equal(meta.reviewOverride, undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
