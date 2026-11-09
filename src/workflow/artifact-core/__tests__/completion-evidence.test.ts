import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { artifactJsonPath, buildArtifactId, codeReviewArtifactId, defineArtifactId, planArtifactId } from '../../storage.js';
import { createCompletionEvidence } from '../completion-evidence.js';
import { approvedMeta, draftMeta } from '../../__tests__/lifecycle-fixtures.js';
import { FileSidecarStore } from '../sidecar-store.js';
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

			// the Task side reads the Task's own build rounds: the latest round decides, and no head has no round
			const round = (n: number, result: 'pass' | 'fail', id: string): void => new FileSidecarStore(repo).appendRecordSync('log', {
				artifactId: id,
				entry: { id: `round-${id}-${n}`, actor: { id: 'insrc:build', kind: 'system', properties: {} }, timestamp: `2026-10-0${n}T00:00:00.000Z`, operation: 'update', outcome: { result, summary: 'round', data: { kind: 'build-round' } } },
			});
			for (const n of [1, 2, 3]) put(repo, `TASK-${H}-s1-t${n}`, { meta: { workflow: 'plan', ...draftMeta() }, body: { planTaskId: `t${n}` } });
			round(1, 'pass', `TASK-${H}-s1-t1`);
			round(1, 'pass', `TASK-${H}-s1-t2`); round(2, 'fail', `TASK-${H}-s1-t2`);
			// a BUILD record's per-task results do not stand in for the rounds
			put(repo, buildArtifactId(H, 's1'), { meta: { workflow: 'build' }, body: { tasks: [{ id: 't1', passed: true }, { id: 't3', passed: true }, { id: 't9', passed: true }] } });
			const evidence = createCompletionEvidence(repo);
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s1-t1`), true);
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s1-t2`), false, 'the latest round failed');
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s1-t3`), false, 'no round, whatever the BUILD record says');
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s1-t9`), false, 'no head: the BUILD record is not read');
			assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s2-t1`), false, 'no head and no BUILD record');
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

	describe('storyTasks', () => {
		const plan = (status: string, number: number) => ({ meta: { workflow: 'plan', lifecycle: { status, revision: { number } } }, body: {} });
		const tasks = (planRevision: number, taskIds: string[]) => ({ meta: { workflow: 'plan' }, body: { planRevision, taskIds, nextNumber: 9 } });
		const TASKS = `TASKS-${H}-s1`;
		const T1 = `TASK-${H}-s1-t1`;
		const withRepo = async (run: (repo: string, answer: () => ReturnType<ReturnType<typeof createCompletionEvidence>['storyTasks']>) => Promise<void>): Promise<void> => {
			const repo = mkdtempSync(join(tmpdir(), 'evidence-tasks-'));
			try { await run(repo, () => createCompletionEvidence(repo).storyTasks(H, 's1')); }
			finally { rmSync(repo, { recursive: true, force: true }); }
		};

		it('a qualifying PLAN at stored revision 0 matches a TASKS head at planRevision 1', () => withRepo(async (repo, answer) => {
			put(repo, planArtifactId(H, 's1'), plan('approved', 0));
			put(repo, TASKS, tasks(1, ['t1']));
			assert.deepEqual(await answer(), { kind: 'listed', taskIds: [T1] });
		}));

		it('an empty current listing answers not-created', () => withRepo(async (repo, answer) => {
			put(repo, planArtifactId(H, 's1'), plan('approved', 1));
			put(repo, TASKS, tasks(1, []));
			assert.deepEqual(await answer(), { kind: 'not-created' });
		}));

		it('a TASKS head from an older plan revision, and an approved PLAN with only some Task heads, answer not-created', () => withRepo(async (repo, answer) => {
			put(repo, planArtifactId(H, 's1'), plan('completed', 2));
			put(repo, T1, { meta: { workflow: 'plan', ...draftMeta() }, body: { planTaskId: 't1' } });
			assert.deepEqual(await answer(), { kind: 'not-created' }, 'a part-way set');
			put(repo, TASKS, tasks(1, ['t1']));
			assert.deepEqual(await answer(), { kind: 'not-created' }, 'an older plan revision');
			put(repo, TASKS, tasks(2, ['t1']));
			assert.deepEqual(await answer(), { kind: 'listed', taskIds: [T1] }, 'a PLAN past approved still qualifies');
		}));

		it('with no qualifying PLAN a TASKS listing, then child TASK heads, then none-required apply in that order', () => withRepo(async (repo, answer) => {
			assert.deepEqual(await answer(), { kind: 'none-required' });
			put(repo, planArtifactId(H, 's1'), plan('draft', 1));
			assert.deepEqual(await answer(), { kind: 'none-required' }, 'a draft PLAN does not qualify');
			put(repo, T1, { meta: { workflow: 'plan', ...draftMeta() }, body: { planTaskId: 't1' } });
			assert.deepEqual(await answer(), { kind: 'listed', taskIds: [T1] }, 'the child TASK heads');
			put(repo, TASKS, tasks(7, ['t2']));
			assert.deepEqual(await answer(), { kind: 'listed', taskIds: [`TASK-${H}-s1-t2`] }, 'the TASKS listing comes first');
		}));

		it('the override, approval and declared Stories are read from the records', async () => {
			const repo = mkdtempSync(join(tmpdir(), 'evidence-approval-'));
			try {
				const evidence = createCompletionEvidence(repo);
				assert.equal(await evidence.storyBuildApproved(H, 's1'), false);
				assert.equal(await evidence.storyApprovalOverride(H, 's1'), undefined);
				assert.deepEqual(await evidence.declaredStories(H), []);
				put(repo, buildArtifactId(H, 's1'), { meta: { workflow: 'build', ...approvedMeta() }, body: {} });
				assert.equal(await evidence.storyBuildApproved(H, 's1'), true);
				assert.equal(await evidence.storyApprovalOverride(H, 's1'), undefined, 'an approval without a reason is not an override');
				put(repo, buildArtifactId(H, 's1'), { meta: { workflow: 'build', ...approvedMeta({ override: 'accepted' }) }, body: {} });
				assert.equal(await evidence.storyApprovalOverride(H, 's1'), 'accepted');
				put(repo, defineArtifactId(H), { meta: { workflow: 'define' }, body: { stories: [{ id: 's1' }, { id: 's2' }] } });
				assert.deepEqual(await evidence.declaredStories(H), ['s1', 's2']);
			} finally { rmSync(repo, { recursive: true, force: true }); }
		});
	});
});
