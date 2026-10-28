/**
 * The terminal's approve rebuilds its ApproveOutcome from the pipeline's follow-on entries without loss (Story s10): the whole Task
 * reconciliation (close failures included), the publication, both commits, the attachment (an error or a skipped reason included), and a step
 * stopped by a denial as the failed outcome of that step.
 * Run: npx tsx --test-force-exit src/cli/__tests__/workflow-approve-adapter.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { approveOutcomeOf } from '../services/workflow.js';
import type { FollowOnOutcome } from '../../workflow/gates.js';

const APPROVAL = { workflow: 'plan', path: '/r/.insrc/artifacts/PLAN-x.json', approvedAt: '2026-10-28T00:00:00.000Z' };
const P = APPROVAL.path;
const e = (o: Partial<FollowOnOutcome> & Pick<FollowOnOutcome, 'kind'>): FollowOnOutcome => ({ artifactPath: P, ok: true, ...o });

test('workflow-approve-adapter.test.ts: the client adapter rebuilds ApproveOutcome losslessly from the follow-on entries', () => {
	const taskSync = { created: ['t1'], changed: [], withdrawn: ['t2'], added: ['t3'], closeFailed: [{ taskId: 't2', issue: 'acme/demo#9', reason: 'gh timed out' }] };
	const tracker = { status: 'created', epicRef: 'acme/demo#1' };
	const commit = { committed: true, pushed: false, reason: 'committed locally; push failed: no upstream' };
	const second = { committed: false, pushed: false, reason: 'nothing to commit (already up to date)' };
	const attach = { attached: ['https://x/1'], reconciled: [], skipped: [], failed: [{ target: 'docs/a.md', reason: 'has uncommitted changes' }] };
	const out = approveOutcomeOf({
		approval: APPROVAL,
		followOn: [
			e({ kind: 'tasks-sync', ok: false, taskSync }), e({ kind: 'tracker-push', tracker }), e({ kind: 'artifact-commit', commit }),
			e({ kind: 'document-attach', attach }), e({ kind: 'attach-commit', commit: second }),
			e({ kind: 'bugfix-advance' }),   // not an approve-outcome entry: ignored
		],
	});
	assert.deepEqual(out, { approval: APPROVAL, tasks: taskSync, tracker, commit, attach, attachCommit: second });

	// an attachment error and a skipped reason come through as they were
	assert.deepEqual(approveOutcomeOf({ approval: APPROVAL, followOn: [e({ kind: 'document-attach', ok: false, attach: { error: 'the unit is not bound' } })] }).attach, { error: 'the unit is not bound' });
	assert.deepEqual(approveOutcomeOf({ approval: APPROVAL, followOn: [e({ kind: 'document-attach', attach: { skipped: 'attachments skipped: the artifacts are not committed' } })] }).attach, { skipped: 'attachments skipped: the artifacts are not committed' });

	// withTracker false: only the approval and the reconciliation
	assert.deepEqual(approveOutcomeOf({ approval: APPROVAL, followOn: [e({ kind: 'tasks-sync', taskSync })] }), { approval: APPROVAL, tasks: taskSync });
	assert.deepEqual(approveOutcomeOf({ approval: APPROVAL, followOn: [] }), { approval: APPROVAL });

	// a step stopped by a denial is the failed outcome of that step, with the entry's note
	const denied = (kind: FollowOnOutcome['kind']): FollowOnOutcome => e({ kind, ok: false, note: `${kind} stopped: gh_tracker was denied (declined)`, denied: { toolId: 'gh_tracker', reason: 'declined' } });
	const stopped = approveOutcomeOf({ approval: APPROVAL, followOn: [denied('tasks-sync'), denied('tracker-push'), denied('artifact-commit'), denied('document-attach'), denied('attach-commit')] });
	assert.deepEqual(stopped.tasks, { error: 'tasks-sync stopped: gh_tracker was denied (declined)' });
	assert.deepEqual(stopped.tracker, { status: 'failed', reason: 'tracker-push stopped: gh_tracker was denied (declined)' });
	assert.deepEqual(stopped.commit, { committed: false, pushed: false, reason: 'artifact-commit stopped: gh_tracker was denied (declined)' });
	assert.deepEqual(stopped.attach, { error: 'document-attach stopped: gh_tracker was denied (declined)' });
	assert.deepEqual(stopped.attachCommit, { committed: false, pushed: false, reason: 'attach-commit stopped: gh_tracker was denied (declined)' });
});
