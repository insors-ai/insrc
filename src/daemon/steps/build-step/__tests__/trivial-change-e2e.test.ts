/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story c5b49ff953a9a295/s1, t4: a trivial change runs through its ISSUE. Triage routes it to
 * the issue stage; the approved ISSUE (kind 'change') advances to a no-LLD build under the
 * ISSUE's own hash; approving that BUILD completes the Story and the Epic under the ISSUE.
 *
 * Run: npx tsx --test src/daemon/steps/build-step/__tests__/trivial-change-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBuildStep } from '../handler.js';
import { _setBuildValidateCheckRunnerForTests, _setBuildValidateProviderForTests } from '../phases/validate.js';
import type { ValidationCheckResults } from '../validation-checks.js';
import { handleTriageStep } from '../../triage-step/handler.js';
import type { TriageDone, TriageEmitClassification } from '../../triage-step/types.js';
import { finalizeArtifact } from '../../../../workflow/orchestrator.js';
import { advanceBugfixAfterIssue } from '../../../../workflow/bugfix/advance.js';
import { defaultStampDeps } from '../../../../workflow/bugfix/stamp.js';
import type { IssueArtifact } from '../../../../workflow/artifacts/issue.js';
import { approvalStateOf } from '../../../../workflow/artifact-core/approval-view.js';
import { artifactJsonPath, buildArtifactId, issueArtifactId } from '../../../../workflow/storage.js';
import { draftMeta, writeHead } from '../../../../workflow/__tests__/lifecycle-fixtures.js';
import { reviewedBuildFingerprint } from '../../../../workflow/code-review/build-freshness.js';
import { seedSidecarRules } from '../../../../workflow/artifact-core/__tests__/seed-rules.js';
import { approveJson, approveTarget } from '../../../../workflow/__tests__/helpers/approve.js';
import type { WorkflowIntent } from '../../../../workflow/types.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

const PASSING_CHECKS: ValidationCheckResults = {
	typecheck: { ok: true, command: 'npx tsc --noEmit', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' },
	tests:     { ok: true, command: 'npx tsx --test --test-force-exit x.test.ts', exitCode: 0, timedOut: false, durationMs: 1, outputTail: '' },
};

const FOCUS = 'Raise the per-repository chat turn limit from 2 to 6';

const json = (env: { content: { text: string }[] }): Record<string, unknown> => JSON.parse(env.content[0]!.text) as Record<string, unknown>;
const statusOf = (repo: string, id: string): unknown => {
	const path = artifactJsonPath(repo, id);
	if (!existsSync(path)) return undefined;
	return ((JSON.parse(readFileSync(path, 'utf8')) as { meta: { lifecycle?: { status?: unknown } } }).meta.lifecycle ?? {}).status;
};

test('a trivial change: ISSUE approved, build under its hash, BUILD approved completes STORY and EPIC', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-trivial-change-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	_setBuildValidateCheckRunnerForTests(async () => PASSING_CHECKS);
	_setBuildValidateProviderForTests({ async runReviewSession<T>() { return { taskId: 's1', passed: true, checks: [], scopeRespected: true, reason: 'ok' } as T; } });
	try {
		git('init', '-q');
		seedSidecarRules(repo); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
		writeFileSync(join(repo, 'limit.ts'), 'export const LIMIT = 2;\n');
		git('add', '-A'); git('commit', '-qm', 'before the change');

		// 1. Triage routes the trivial change to the issue stage.
		const started = json(await handleTriageStep({ phase: 'start', focus: FOCUS, repo })) as unknown as TriageEmitClassification;
		const triaged = json(await handleTriageStep({
			phase: 'classify', state: started.state,
			result: { sizeClass: 'trivial', rationale: 'one constant', storyTitle: 'Raise the chat turn limit', signals: [{ kind: 'modules-touched', detail: 'one file', evidence: ['limit.ts'] }] },
		})) as unknown as TriageDone;
		assert.equal(triaged.nextCall.tool, 'insrc_workflow_step');
		assert.equal(triaged.nextCall.params['workflow'], 'issue');
		const issueParams = triaged.nextCall.params['params'] as Record<string, unknown>;

		// 2. The issue stage writes a change ISSUE from those params; a person approves it.
		const intent: WorkflowIntent = { workflow: 'issue', focus: FOCUS, repoPath: repo, repoIndexedAt: null, params: issueParams };
		const finalized = await finalizeArtifact(intent, {}, 'wf-trivial-change', 5, {
			body: { title: 'Raise the chat turn limit', reproduction: FOCUS, rootCause: 'Two turns queue up too often.', fixIntent: 'Six turns can run at once.' },
			citations: [{ id: 'c1', kind: 'code', ref: 'limit.ts:1' }],
		}, 'client');
		assert.equal(finalized.ok, true, finalized.ok ? '' : JSON.stringify(finalized.failure));
		if (!finalized.ok) return;
		const issue = finalized.finalized.artifact as IssueArtifact;
		assert.equal(issue.meta.kind, 'change');
		assert.equal(issue.meta.magnitude, 'small');
		const hash = issue.meta.issueHash!;
		const issueJson = artifactJsonPath(repo, issueArtifactId(hash));
		writeHead(repo, issueArtifactId(hash), issue as unknown as { meta: Record<string, unknown>; body: unknown; citations: unknown });
		await approveJson(issueJson);
		assert.equal(approvalStateOf((JSON.parse(readFileSync(issueJson, 'utf8')) as { meta: unknown }).meta), 'approved');

		// 3. The advance hands the build the ISSUE's hash.
		const advanced = await advanceBugfixAfterIssue({ repoPath: repo, issueHash: hash, repo }, defaultStampDeps(async () => ({ tier: 'none', parentRef: null, confidence: 0, evidence: [] }) as never));
		assert.equal(advanced.nextCall?.tool, 'insrc_build_step');
		const standalone = advanced.nextCall!.params['standalone'] as Record<string, unknown>;
		assert.equal(standalone['epicHash'], hash, 'the build runs under the ISSUE');
		git('add', '-A'); git('commit', '-qm', 'the approved ISSUE');

		// 4. Build it: implement, the change, validate.
		const impl = json(await handleBuildStep({ phase: 'implement', target: '(standalone-bugfix)', repo, standalone: standalone as never }));
		assert.equal(impl['next'], 'implement', JSON.stringify(impl));
		writeFileSync(join(repo, 'limit.ts'), 'export const LIMIT = 6;\n');
		git('add', 'limit.ts'); git('commit', '-qm', `raise the limit\n\nInsrc-Story: ${hash}/s1`);
		const val = json(await handleBuildStep({ phase: 'validate', target: '(standalone-bugfix)', repo, standalone: standalone as never }));
		assert.equal(val['next'], 'done', JSON.stringify(val));
		const buildJson = artifactJsonPath(repo, buildArtifactId(hash, 's1'));
		assert.ok(existsSync(buildJson), 'the BUILD record is under the ISSUE hash');

		// 5. The other party's code review passes, bound to the BUILD as it is now.
		const build = JSON.parse(readFileSync(buildJson, 'utf8')) as unknown;
		const scope = { storyId: 's1', documents: {}, reviewSet: [{ commit: 'a'.repeat(40), parent: 'b'.repeat(40), files: [{ path: 'limit.ts', segments: [{ after: [1, 1] }] }] }] };
		const task = { taskId: 's1', status: 'passed', summary: 'Correct', findings: [], testCoverage: { assessment: 'verified', explanation: 'Covered', evidenceReferences: ['ref:test'] }, limitations: [], advice: [], inspectedReferences: ['ref:code'], executedTests: [] };
		writeHead(repo, `CR-${hash}-s1`, {
			meta: { workflow: 'code-review', schemaVersion: 2, repoPath: repo, epicHash: hash, storyId: 's1', reviewedBy: 'daemon', ...draftMeta() },
			body: { kind: 'code-review', format: 'task-based', storyId: 's1', status: 'passed', reviews: [{
				reviewId: 'review-1', attempt: 1, storyId: 's1', reviewer: 'daemon', status: 'passed', scope, tasks: [task],
				summary: 'Reviewed', completedAt: '2026-11-15T01:00:00.000Z', buildFingerprint: reviewedBuildFingerprint(build),
			}] },
		});

		// 6. Approving the BUILD completes the Story and the Epic the ISSUE heads.
		const approved = await approveTarget({ repoPath: repo, artifactPath: buildJson });
		assert.equal(approved.approved.length, 1, JSON.stringify(approved));
		assert.equal(statusOf(repo, `STORY-${hash}-s1`), 'completed', `the Story completes: ${JSON.stringify(approved.followOn)}`);
		assert.equal(statusOf(repo, `EPIC-${hash}`), 'completed', 'and the Epic the ISSUE heads');
	} finally {
		_setBuildValidateCheckRunnerForTests(undefined);
		_setBuildValidateProviderForTests(undefined);
		rmSync(repo, { recursive: true, force: true });
	}
});
