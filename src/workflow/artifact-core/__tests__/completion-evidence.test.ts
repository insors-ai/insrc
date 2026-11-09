import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { artifactJsonPath, buildArtifactId, codeReviewArtifactId, defineArtifactId, planArtifactId } from '../../storage.js';
import { reviewedBuildFingerprint } from '../../code-review/build-freshness.js';
import { createCompletionEvidence } from '../completion-evidence.js';
import { rollUp } from '../lifecycle.js';
import type { ChildStatusReader } from '../lifecycle.js';
import type { Status } from '../types.js';
import { approvedMeta, draftMeta } from '../../__tests__/lifecycle-fixtures.js';
import { FileSidecarStore } from '../sidecar-store.js';
import { H } from './store-kit.js';

function put(repo: string, id: string, head: object): void {
	const path = artifactJsonPath(repo, id);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(head));
}
const buildRecord = (meta: object = {}) => ({ meta: { workflow: 'build', epicHash: H, storyId: 's1', createdAt: '2026-11-03T00:00:00.000Z', ...meta }, body: { commit: 'abc1234', focus: 'Change it', summary: 'Changed', tasks: [{ id: 's1', passed: true }], changeLog: [{ target: { file: 'src/a.ts' } }] } });
/** A task-based code review of `build`, passing unless its BUILD binding is `fingerprint`. */
function review(build: unknown, story: string, meta: object = {}, fingerprint: string = reviewedBuildFingerprint(build)): object {
	const commit = 'a'.repeat(40);
	const scope = { storyId: story, documents: {}, reviewSet: [{ commit, parent: 'b'.repeat(40), files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }] };
	const task = { taskId: 's1', status: 'passed', summary: 'Correct', findings: [], testCoverage: { assessment: 'verified', explanation: 'Covered', evidenceReferences: ['ref:test'] }, limitations: [], advice: [], inspectedReferences: ['ref:code'], executedTests: [] };
	const summary = { reviewId: 'review-1', attempt: 1, storyId: story, reviewer: 'daemon', status: 'passed', scope, tasks: [task], summary: 'Reviewed', completedAt: '2026-11-03T01:00:00.000Z', buildFingerprint: fingerprint };
	return { meta: { workflow: 'code-review', schemaVersion: 2, epicHash: H, storyId: story, reviewedBy: 'daemon', ...meta }, body: { kind: 'code-review', format: 'task-based', storyId: story, status: 'passed', reviews: [summary] } };
}
const round = (repo: string, n: number, result: 'pass' | 'fail', id: string): void => new FileSidecarStore(repo).appendRecordSync('log', {
	artifactId: id,
	entry: { id: `round-${id}-${n}`, actor: { id: 'insrc:build', kind: 'system', properties: {} }, timestamp: `2026-10-0${n}T00:00:00.000Z`, operation: 'update', outcome: { result, summary: 'round', data: { kind: 'build-round' } } },
});

describe('createCompletionEvidence', () => {
	it('storyCodeReview maps the gate, an explicit override wins over a stored one, and an empty reason is not an override', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'evidence-'));
		try {
			const kind = async (story: string, overrideReview?: string) => createCompletionEvidence(repo, { overrideReview }).storyCodeReview(H, story);
			const build = buildRecord();

			// no record: missing
			assert.deepEqual(await kind('s1'), { kind: 'missing' });
			// a review bound to the current BUILD is clean
			put(repo, buildArtifactId(H, 's1'), build);
			put(repo, codeReviewArtifactId(H, 's1'), review(build, 's1'));
			assert.deepEqual(await kind('s1'), { kind: 'clean' });
			// a review of another BUILD is blocked; an explicit override makes it overridden
			put(repo, codeReviewArtifactId(H, 's1'), review(build, 's1', {}, 'another-build'));
			assert.deepEqual(await kind('s1'), { kind: 'blocked' });
			assert.deepEqual(await kind('s1', 'known gap'), { kind: 'overridden', overrideReason: 'known gap' });

			// the override a stored approval carries is used when the call carries none, and the explicit one wins over it
			put(repo, buildArtifactId(H, 's2'), build);
			put(repo, codeReviewArtifactId(H, 's2'), review(build, 's2', approvedMeta({ override: 'stored on the CR' }), 'another-build'));
			assert.deepEqual(await kind('s2'), { kind: 'overridden', overrideReason: 'stored on the CR' });
			assert.deepEqual(await kind('s2', 'explicit'), { kind: 'overridden', overrideReason: 'explicit' });
			// the BUILD record's override counts too, and an empty reason does not
			put(repo, buildArtifactId(H, 's3'), buildRecord(approvedMeta({ override: 'stored on the BUILD' })));
			put(repo, codeReviewArtifactId(H, 's3'), review(build, 's3', {}, 'another-build'));
			assert.deepEqual(await kind('s3'), { kind: 'overridden', overrideReason: 'stored on the BUILD' });
			assert.deepEqual(await kind('s3', '  '), { kind: 'overridden', overrideReason: 'stored on the BUILD' });
			put(repo, buildArtifactId(H, 's4'), build);
			put(repo, codeReviewArtifactId(H, 's4'), review(build, 's4', approvedMeta({ override: ' ' }), 'another-build'));
			assert.deepEqual(await kind('s4'), { kind: 'blocked' });
			// an approval without an override, and the old stamp, are not overrides
			put(repo, buildArtifactId(H, 's5'), build);
			put(repo, codeReviewArtifactId(H, 's5'), review(build, 's5', approvedMeta(), 'another-build'));
			assert.deepEqual(await kind('s5'), { kind: 'blocked' });
			put(repo, buildArtifactId(H, 's6'), build);
			put(repo, codeReviewArtifactId(H, 's6'), review(build, 's6', { reviewOverride: { reason: 'the stamp the conversion removes', at: 't' } }, 'another-build'));
			assert.deepEqual(await kind('s6'), { kind: 'blocked' });
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});

	it('taskBuildPassed reads the Task own build rounds: the latest round decides, and no head has no round', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'evidence-rounds-'));
		try {
			for (const n of [1, 2, 3]) put(repo, `TASK-${H}-s1-t${n}`, { meta: { workflow: 'plan', ...draftMeta() }, body: { planTaskId: `t${n}` } });
			round(repo, 1, 'pass', `TASK-${H}-s1-t1`);
			round(repo, 1, 'pass', `TASK-${H}-s1-t2`); round(repo, 2, 'fail', `TASK-${H}-s1-t2`);
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

	describe('rollUp over real records', () => {
		const STORY = `STORY-${H}-s1`;
		const T1 = `TASK-${H}-s1-t1`;
		const TASKS = `TASKS-${H}-s1`;
		const plan = (status: string, number: number) => ({ meta: { workflow: 'plan', lifecycle: { status, revision: { number } } }, body: {} });
		const tasks = (planRevision: number, taskIds: string[]) => ({ meta: { workflow: 'plan' }, body: { planRevision, taskIds, nextNumber: 9 } });
		const taskHead = (repo: string, id: string) => put(repo, id, { meta: { workflow: 'plan', ...approvedMeta() }, body: { planTaskId: 't1' } });
		/** Statuses come from the heads, as the store's reader answers them. */
		const reader = (repo: string): ChildStatusReader => ({
			childrenOfStrict: async () => ({ children: [], unreadable: [] }),
			statusOf: async id => {
				const path = artifactJsonPath(repo, id);
				return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { meta: { lifecycle: { status: Status } } }).meta.lifecycle.status : undefined;
			},
		});
		/** An approved BUILD with a passing review; with `override`, the approval carries that reason. */
		function approved(repo: string, override?: string): void {
			const build = buildRecord(approvedMeta(override === undefined ? {} : { override }));
			put(repo, buildArtifactId(H, 's1'), build);
			put(repo, codeReviewArtifactId(H, 's1'), review(build, 's1'));
		}
		const answer = (repo: string) => rollUp(STORY, reader(repo), createCompletionEvidence(repo));
		const withRepo = async (run: (repo: string) => Promise<void>): Promise<void> => {
			const repo = mkdtempSync(join(tmpdir(), 'evidence-rollup-'));
			try { await run(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
		};

		it('an earlier pass followed by a failing latest round holds back, and an explicit override completes it', () => withRepo(async repo => {
			approved(repo);
			put(repo, planArtifactId(H, 's1'), plan('approved', 1));
			put(repo, TASKS, tasks(1, ['t1']));
			taskHead(repo, T1);
			round(repo, 1, 'pass', T1);
			assert.equal(await answer(repo), 'completed', 'the first round passed');
			round(repo, 2, 'fail', T1);
			assert.equal(await answer(repo), undefined, 'the latest round failed');
			approved(repo, 'accepted by the owner');
			assert.equal(await answer(repo), 'completed');
		}));

		it('an approved PLAN with no TASKS head holds back, with no TASK heads and with a part-way set whose Tasks passed', () => withRepo(async repo => {
			approved(repo);
			put(repo, planArtifactId(H, 's1'), plan('approved', 1));
			assert.equal(await answer(repo), undefined, 'no TASK heads');
			taskHead(repo, T1);
			round(repo, 1, 'pass', T1);
			assert.equal(await answer(repo), undefined, 'a part-way set whose Task passed');
		}));

		it('a TASKS head from an older plan revision holds back even when every listed Task passed, and an explicit override completes it', () => withRepo(async repo => {
			approved(repo);
			put(repo, planArtifactId(H, 's1'), plan('approved', 2));
			put(repo, TASKS, tasks(1, ['t1']));
			taskHead(repo, T1);
			round(repo, 1, 'pass', T1);
			assert.equal(await answer(repo), undefined);
			approved(repo, 'the re-plan is abandoned');
			assert.equal(await answer(repo), 'completed');
		}));

		it('child TASK heads with no PLAN are the listed set', () => withRepo(async repo => {
			approved(repo);
			taskHead(repo, T1);
			assert.equal(await answer(repo), undefined, 'the Task has no passing round');
			round(repo, 1, 'pass', T1);
			assert.equal(await answer(repo), 'completed');
		}));
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
