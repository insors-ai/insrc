import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { artifactJsonPath, buildArtifactId, codeReviewArtifactId } from '../../storage.js';
import { createCompletionEvidence } from '../completion-evidence.js';
import { approvedMeta } from '../../__tests__/lifecycle-fixtures.js';
import { H } from './store-kit.js';

function put(repo: string, id: string, head: object): void {
	const path = artifactJsonPath(repo, id);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(head));
}
const cr = (verdict: string, meta: object = {}) => ({ meta: { workflow: 'code-review', ...meta }, body: { verdict, counts: { high: 1, med: 0, low: 0 } } });

describe('createCompletionEvidence', () => {
	it('storyCodeReview maps the gate, an explicit override wins over a stored one and an advisory warn is blocked without an override', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'evidence-'));
		try {
			const kind = async (options: { overrideReview?: string | undefined; enforce?: boolean | undefined } = {}, story = 's1') => createCompletionEvidence(repo, options).storyCodeReview(H, story);

			// no record: missing
			assert.deepEqual(await kind(), { kind: 'missing' });
			// pass and a genuine warn are clean
			put(repo, codeReviewArtifactId(H, 's1'), cr('pass'));
			assert.deepEqual(await kind(), { kind: 'clean' });
			put(repo, codeReviewArtifactId(H, 's1'), cr('warn'));
			assert.deepEqual(await kind(), { kind: 'clean' });
			// a block with enforcement on is blocked; an explicit override makes it overridden
			put(repo, codeReviewArtifactId(H, 's1'), cr('block'));
			assert.deepEqual(await kind({ enforce: true }), { kind: 'blocked' });
			assert.deepEqual(await kind({ enforce: true, overrideReview: 'known gap' }), { kind: 'overridden', overrideReason: 'known gap' });
			// a block with enforcement off is an advisory warn: blocked unless an override says otherwise
			assert.deepEqual(await kind({ enforce: false }), { kind: 'blocked' });
			assert.deepEqual(await kind({ enforce: false, overrideReview: 'accepted' }), { kind: 'overridden', overrideReason: 'accepted' });

			// the override a stored approval carries is used when the call carries none, and the explicit one wins over it
			put(repo, codeReviewArtifactId(H, 's2'), cr('block', approvedMeta({ override: 'stored on the CR' })));
			assert.deepEqual(await kind({ enforce: false }, 's2'), { kind: 'overridden', overrideReason: 'stored on the CR' });
			assert.deepEqual(await kind({ enforce: true }, 's2'), { kind: 'overridden', overrideReason: 'stored on the CR' });
			assert.deepEqual(await kind({ enforce: false, overrideReview: 'explicit' }, 's2'), { kind: 'overridden', overrideReason: 'explicit' });
			// the BUILD record's override counts too, and an empty reason does not
			put(repo, codeReviewArtifactId(H, 's3'), cr('block'));
			put(repo, buildArtifactId(H, 's3'), { meta: { workflow: 'build', ...approvedMeta({ override: 'stored on the BUILD' }) }, body: {} });
			assert.deepEqual(await kind({ enforce: false }, 's3'), { kind: 'overridden', overrideReason: 'stored on the BUILD' });
			assert.deepEqual(await kind({ enforce: false, overrideReview: '  ' }, 's3'), { kind: 'overridden', overrideReason: 'stored on the BUILD' });
			put(repo, codeReviewArtifactId(H, 's4'), cr('block', approvedMeta({ override: ' ' })));
			assert.deepEqual(await kind({ enforce: false }, 's4'), { kind: 'blocked' });

			// the Task side reads the BUILD record's per-task results
			put(repo, buildArtifactId(H, 's1'), { meta: { workflow: 'build' }, body: { tasks: [{ id: 't1', passed: true }, { id: 't2', passed: false }, { id: 't3' }] } });
			const evidence = createCompletionEvidence(repo);
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s1-t1`), true);
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s1-t2`), false);
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s1-t3`), false, 'not yet validated');
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s1-t9`), false, 'not in the record');
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s2-t1`), false, 'no BUILD record');
			assert.equal(await evidence.taskBuildPassed(`LLD-${H}-s1`), false, 'not a Task');
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});

	it('completion-evidence.test.ts: completion evidence reads the lifecycle', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'evidence-lifecycle-'));
		try {
			const kind = async (story: string, options: { enforce?: boolean | undefined } = { enforce: false }) => createCompletionEvidence(repo, options).storyCodeReview(H, story);
			// an approval given over the block, on the code review or on the BUILD record, is the override
			put(repo, codeReviewArtifactId(H, 's1'), cr('block', approvedMeta({ override: 'accepted on the CR' })));
			assert.deepEqual(await kind('s1'), { kind: 'overridden', overrideReason: 'accepted on the CR' });
			put(repo, codeReviewArtifactId(H, 's2'), cr('block'));
			put(repo, buildArtifactId(H, 's2'), { meta: { workflow: 'build', ...approvedMeta({ override: 'accepted on the BUILD' }) }, body: {} });
			assert.deepEqual(await kind('s2'), { kind: 'overridden', overrideReason: 'accepted on the BUILD' });
			// an approval without an override, and the old stamp, are not overrides
			put(repo, codeReviewArtifactId(H, 's3'), cr('block', approvedMeta()));
			assert.deepEqual(await kind('s3'), { kind: 'blocked' });
			put(repo, codeReviewArtifactId(H, 's4'), cr('block', { reviewOverride: { reason: 'the stamp the conversion removes', at: 't' } }));
			assert.deepEqual(await kind('s4'), { kind: 'blocked' });
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});
});
