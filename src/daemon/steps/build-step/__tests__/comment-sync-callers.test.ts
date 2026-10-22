/**
 * The comment sync's callers (s8): implement and validate run it for the Task and say what it recorded and posted, the daemon method
 * runs it on request and says why when it cannot, and a failing sync or a repository with no tracker leaves both turns as they were.
 *
 * Run: npx tsx --test src/daemon/steps/build-step/__tests__/comment-sync-callers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBuildStep } from '../handler.js';
import { _setBuildValidateCheckRunnerForTests, _setBuildValidateProviderForTests } from '../phases/validate.js';
import type { ValidationCheckResults } from '../validation-checks.js';
import { handleTrackerSyncComments } from '../../../tracker-sync-comments.js';
import { approvedMeta, markApprovedSync } from '../../../../workflow/__tests__/lifecycle-fixtures.js';
import { approveJson } from '../../../../workflow/__tests__/helpers/approve.js';
import { approvalStateOf } from '../../../../workflow/artifact-core/approval-view.js';
import { _setAutoPushDepsForTests } from '../../../../workflow/tracker-auto.js';
import { ARTIFACTS_DIR, lldArtifactId, planArtifactId } from '../../../../workflow/storage.js';
import { bindArtifact } from '../../../../workflow/tracker/binding.js';
import { comment, fakeTracker } from '../../../../workflow/tracker/__tests__/comment-sync-kit.js';
import { lifecycleFor } from '../../../lifecycle-registry.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const AT = '2026-07-18T00:00:00.000Z';
const TASK = `TASK-${HASH}-s1-t1`;
const ISSUE = 'acme/demo#42';

const PASSING: ValidationCheckResults = {
	typecheck: { ok: true, command: 'npx tsc --noEmit', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' },
	tests:     { ok: true, command: 'npx tsx --test x.test.ts', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' },
};
_setBuildValidateCheckRunnerForTests(async () => PASSING);

/** A git repository with an approved plan of one Task (t1), and the Task's own artifact. */
function repoWithTask(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-comment-sync-callers-'));
	execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
	const dir = join(repo, ARTIFACTS_DIR);
	mkdirSync(dir, { recursive: true });
	const meta = { epicHash: HASH, epicSlug: 'tag-filtering', createdAt: AT, epicCreatedAt: AT };
	writeFileSync(join(dir, `DEF-${HASH}.json`), JSON.stringify({ meta: { workflow: 'define', ...meta, ...approvedMeta({ at: AT }) }, body: { problem: 'p', stories: [{ id: 's1', title: 'Story one' }] }, citations: [] }));
	writeFileSync(join(dir, `${lldArtifactId(HASH, 's1')}.json`), JSON.stringify({ meta: { workflow: 'design.story', runId: 'l', schemaVersion: 1, ...meta, storyId: 's1', hldBaseRunId: 'h', hldEffectiveHash: 'x', hldAmendmentsApplied: [], ...approvedMeta({ at: AT }) }, body: { openQuestions: [] }, citations: [] }));
	const plan = join(dir, `${planArtifactId(HASH, 's1')}.json`);
	writeFileSync(plan, JSON.stringify({
		meta: { workflow: 'plan', runId: 'p', schemaVersion: 1, ...meta, storyId: 's1', lldRunId: 'l', lldEffectiveHash: 'x', tracker: { taskRefs: { t1: ISSUE } } },
		body: { tasks: [{ id: 't1', title: 'Wire the filter', summary: 'Add the filter.', size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['narrows'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: 'unit: narrows' }] }] },
		citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD' }],
	}));
	markApprovedSync(plan);
	writeFileSync(join(dir, `${TASK}.json`), JSON.stringify({
		meta: { workflow: 'plan', runId: 't', schemaVersion: 1, ...meta, storyId: 's1', repoPath: repo, revision: 1 },
		body: { title: 'Wire the filter', summary: 'Add the filter.', size: 'M', order: 1, acceptanceChecks: ['narrows'], tests: [{ level: 'unit', name: 'unit: narrows' }], planTaskId: 't1' }, citations: [],
	}));
	return repo;
}

const call = async (input: Record<string, unknown>): Promise<Record<string, unknown>> => {
	const env = await handleBuildStep(input as never);
	return JSON.parse(env.content[0]!.text) as Record<string, unknown>;
};
const validate = async (repo: string): Promise<Record<string, unknown>> => {
	_setBuildValidateProviderForTests({ async runReviewSession<T>() { return { taskId: 't1', passed: true, checks: [], scopeRespected: true, reason: 'ok' } as T; } });
	try { return await call({ phase: 'validate', target: 's1/t1', repo }); }
	finally { _setBuildValidateProviderForTests(undefined); }
};

test('comment-sync-callers.test.ts: implement and validate run the comment sync for the Task and the daemon method tracker.syncComments runs it on request, and neither is failed by it', async () => {
	const repo = repoWithTask();
	const t = fakeTracker();
	const cfg = join(repo, 'github.json');
	const prior = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = cfg;
	try {
		writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'github', owner: 'acme', repo: 'demo' } } }));
		_setAutoPushDepsForTests({ port: t.port });
		lifecycleFor(repo);
		assert.equal(bindArtifact(repo, TASK, ISSUE).ok, true);
		t.comments = [comment(1, 'please also cover the empty case')];

		// implement runs the sync and names what it recorded
		const impl = await call({ phase: 'implement', target: 's1/t1', repo });
		assert.equal(impl['next'], 'implement');
		assert.match(String(impl['commentSync']), /recorded 1, posted 0/);

		// validate runs it again: the comment is known now, so nothing more is recorded
		const done = await validate(repo);
		assert.equal(done['next'], 'done');
		assert.equal(done['passed'], true);
		assert.match(String(done['commentSync']), /recorded 0, posted 0/);

		// the method runs it on request and answers the result
		t.comments.push(comment(2, '/revise tighten the title'));
		const r = await handleTrackerSyncComments({ repo, epicHash: HASH, storyId: 's1', taskId: 't1' }, undefined) as { recorded: string[]; artifactId: string };
		assert.deepEqual(r.recorded, ['2']);
		assert.equal(r.artifactId, TASK);

		// and says why when nothing could be attempted
		assert.match((await handleTrackerSyncComments({ epicHash: HASH }, undefined) as { error: string }).error, /repo is required/);
		assert.match((await handleTrackerSyncComments({ repo }, undefined) as { error: string }).error, /epicHash is required/);
		assert.match((await handleTrackerSyncComments({ repo, epicHash: HASH, unit: 'task', storyId: 's1' }, undefined) as { error: string }).error, /taskId is required/);

		// a failing read is in the result, and the turns are as they were
		t.failList = true;
		const failing = await handleTrackerSyncComments({ repo, epicHash: HASH, storyId: 's1', taskId: 't1' }, undefined) as { failed: unknown[] };
		assert.equal(failing.failed.length, 1);
		const impl2 = await call({ phase: 'implement', target: 's1/t1', repo });
		assert.equal(impl2['next'], 'implement');
		assert.equal((await validate(repo))['passed'], true);

		// no tracker for the repository: no sync, the turns work, and the method says why
		_setAutoPushDepsForTests();
		writeFileSync(cfg, JSON.stringify({ repos: { [repo]: { type: 'none' } } }));
		const bare = await call({ phase: 'implement', target: 's1/t1', repo });
		assert.equal(bare['next'], 'implement');
		assert.equal(bare['commentSync'], undefined);
		assert.match((await handleTrackerSyncComments({ repo, epicHash: HASH, storyId: 's1', taskId: 't1' }, undefined) as { error: string }).error, /no GitHub tracker/);
	} finally {
		if (prior === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prior;
		_setAutoPushDepsForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});
