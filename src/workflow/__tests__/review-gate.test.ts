/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { approvalStateOf, lifecycleOfMeta } from '../artifact-core/approval-view.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import { ReviewBlockedError } from '../gates.js';
import { resolutionEntryOf } from '../review/report-log.js';
import { approveJson } from './helpers/approve.js';
import { blockedMeta, recordReviewSync, reviewedMeta } from './lifecycle-fixtures.js';

const HASH = 'abcd1234ef567890';
const ID = `PLAN-${HASH}-s1`;

/** A PLAN head whose lifecycle review names the report in its log. A 'block' review carries an unresolved HIGH finding. */
function writeArtifact(repo: string, verdict: 'block' | 'pass', id = ID): string {
	const dir = join(repo, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	const p = join(dir, `${id}.json`);
	const findings = verdict === 'block'
		? [{ claimId: 'f1', kind: 'inventory', severity: 'HIGH', premise: 'p', evidence: 'e', action: 'a', fixability: 'manual' }]
		: [];
	const report = recordReviewSync(repo, id, { artifact: 'PLAN', stage: 'plan', verdict, findings: findings as never, counts: { high: findings.length, med: 0, low: 0 }, reviewedAt: '2026-10-05T00:00:00.000Z', model: 'm', reviewedBy: 'daemon' });
	const lifecycle = verdict === 'block' ? blockedMeta({ report }) : reviewedMeta({ report });
	writeFileSync(p, JSON.stringify({ meta: { workflow: id.startsWith('PLAN') ? 'plan' : 'design.story', epicHash: HASH, storyId: 's1', ...lifecycle }, body: {}, citations: [] }, null, 2) + '\n');
	return p;
}

const metaOf = (p: string) => JSON.parse(readFileSync(p, 'utf8')).meta as Record<string, unknown>;

test('approve is refused when the review verdict is block and no override', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const p = writeArtifact(dir, 'block');
		await assert.rejects(approveJson(p), (e: unknown) => {
			assert.ok(e instanceof ReviewBlockedError);
			assert.match(e.summary, /1 HIGH · 0 MED unresolved/);
			return true;
		});
		// artifact stays un-approved
		assert.equal(approvalStateOf(metaOf(p)), 'pending');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('approve proceeds with an override reason and records it on the approval', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const p = writeArtifact(dir, 'block');
		const res = await approveJson(p, 'accepted: findings are non-material');
		assert.equal(res.workflow, 'plan');
		assert.ok(res.approvedAt);
		const meta = metaOf(p);
		assert.equal(approvalStateOf(meta), 'approved');
		assert.equal((lifecycleOfMeta(meta)?.['approval'] as { override: { reason: string } }).override.reason, 'accepted: findings are non-material');
		assert.equal(meta['reviewOverride'], undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('approve proceeds normally when the verdict is not block', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		const p = writeArtifact(dir, 'pass');
		const res = await approveJson(p);
		assert.ok(res.approvedAt);
		const meta = metaOf(p);
		assert.equal(approvalStateOf(meta), 'approved');
		assert.equal((lifecycleOfMeta(meta)?.['approval'] as { override?: unknown }).override, undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('review-gate.test.ts: a blocking lifecycle review withholds approval', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-gate-'));
	try {
		// the head says block and the report in the log has an unresolved HIGH: approval is withheld, and nothing is written
		const p = writeArtifact(dir, 'block');
		const before = readFileSync(p, 'utf8');
		await assert.rejects(approveJson(p), ReviewBlockedError);
		assert.equal(readFileSync(p, 'utf8'), before);

		// the finding is resolved by a later entry of the log: the effective verdict passes and the approval goes through
		const resolve = (id: string): void => new FileSidecarStore(dir).appendRecordSync('log', {
			artifactId: id,
			entry: resolutionEntryOf({ id: 'res-1', actor: { id: 'github:alice', kind: 'person', properties: {} }, timestamp: '2026-10-06T00:00:00.000Z', findingId: 'f1', resolution: { findingId: 'f1', status: 'resolved', resolvedAt: '2026-10-06T00:00:00.000Z' } }),
		});
		resolve(ID);
		const res = await approveJson(p);
		assert.ok(res.approvedAt);
		assert.equal(lifecycleOfMeta(metaOf(p))?.['status'], 'approved');
		assert.equal((lifecycleOfMeta(metaOf(p))?.['approval'] as { override?: unknown }).override, undefined, 'and the approval needed no override');

		// a design record's approval needs the lifecycle review itself to pass, so the review is bound again at the effective verdict
		const lld = `LLD-${HASH}-s1`;
		const q = writeArtifact(dir, 'block', lld);
		await assert.rejects(approveJson(q), ReviewBlockedError);
		resolve(lld);
		await approveJson(q);
		const lifecycle = lifecycleOfMeta(metaOf(q));
		assert.equal(lifecycle?.['status'], 'approved');
		assert.equal((lifecycle?.['review'] as { verdict: string }).verdict, 'pass');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
