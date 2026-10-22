import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodeArtifactHead } from '../artifact-core/decode.js';
import { History } from '../artifact-core/history.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import { readReviewReport } from '../review/report-log.js';
import type { ReviewReport } from '../review/types.js';
import { artifactJsonPath } from '../storage.js';
import { LEGACY_META_FIELDS } from '../convert/backfill.js';
import { sweepHeads } from '../convert/sweep.js';
import { readFileSync } from 'node:fs';
import { approvedMeta, blockedMeta, draftMeta, recordReview, rejectedMeta, reviewedMeta, staleMeta, writeHead } from './lifecycle-fixtures.js';

const H = '0123456789abcdef';
const REPORT: ReviewReport = {
	artifact: 'LLD', stage: 'design.story', verdict: 'block', findings: [], counts: { high: 1, med: 0, low: 0 },
	reviewedAt: '2026-10-22T00:00:00.000Z', model: 'cli-claude:opus', reviewedBy: 'daemon',
};

describe('lifecycle-fixtures', () => {
	it('lifecycle-fixtures.test.ts: each helper produces a head the lifecycle readers see in that state', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'lifecycle-fixtures-'));
		try {
			const base = { workflow: 'design.story', epicHash: H, createdAt: '2026-01-01T00:00:00.000Z', epicCreatedAt: '2026-01-01T00:00:00.000Z' };
			const ref = await recordReview(repo, `LLD-${H}-s6`, REPORT);
			const heads: Record<string, Record<string, unknown>> = {
				[`LLD-${H}-s1`]: approvedMeta(),
				[`LLD-${H}-s2`]: rejectedMeta(),
				[`LLD-${H}-s3`]: staleMeta(`HLD-${H}`),
				[`LLD-${H}-s4`]: reviewedMeta(),
				[`LLD-${H}-s5`]: draftMeta({ revision: 3 }),
				[`LLD-${H}-s6`]: blockedMeta({ report: ref }),
				[`LLD-${H}-s7`]: reviewedMeta({ verdict: 'warn', status: 'approved' }),
			};
			for (const [id, meta] of Object.entries(heads)) writeHead(repo, id, { meta: { ...base, storyId: id.slice(-2), ...meta } });

			const lifecycle = (n: number) => decodeArtifactHead(`LLD-${H}-s${n}`, readFileSync(artifactJsonPath(repo, `LLD-${H}-s${n}`), 'utf8')).artifact.lifecycle;
			const a = lifecycle(1);
			assert.deepEqual([a.status, a.approval?.revision, a.revision.number], ['approved', 1, 1]);
			assert.equal(lifecycle(2).status, 'rejected');
			const s = lifecycle(3);
			assert.deepEqual([s.status, s.stale?.upstream.entityId, s.stale?.upstreamRevision], ['approved', `HLD-${H}`, 2]);
			const r = lifecycle(4);
			assert.deepEqual([r.status, r.review?.verdict, r.review?.party], ['draft', 'pass', 'daemon']);
			assert.deepEqual([lifecycle(5).status, lifecycle(5).revision.number], ['draft', 3]);
			const b = lifecycle(6);
			assert.deepEqual([b.review?.verdict, b.review?.counts], ['block', { high: 1, med: 0, low: 0 }]);
			assert.deepEqual([lifecycle(7).status, lifecycle(7).review?.verdict], ['approved', 'warn']);

			// the report a blocked head names reads back from its entry
			const history = new History(new FileSidecarStore(repo));
			const read = await readReviewReport(history, `LLD-${H}-s6`, b.review!);
			assert.equal(read?.report.verdict, 'block');

			// none of the legacy fields is stamped, and the sweep of the conversion finds every head clean
			for (const id of Object.keys(heads)) {
				const meta = (JSON.parse(readFileSync(artifactJsonPath(repo, id), 'utf8')) as { meta: Record<string, unknown> }).meta;
				assert.deepEqual(LEGACY_META_FIELDS.filter(f => meta[f] !== undefined), [], id);
			}
			assert.deepEqual((await sweepHeads(repo, history)).problems, []);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});
});
