/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The schema guard at the daemon entry points: each refuses an unconverted repository, naming the conversion; repo.convert is exempt.
 *
 * Run: npx tsx --test src/daemon/__tests__/repo-schema-entry-points.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IpcStreamMessage } from '../../shared/types.js';
import { handleAnalyzeStep } from '../steps/analyze-step/handler.js';
import { handleBuildStep } from '../steps/build-step/handler.js';
import { handleCodeReviewStep } from '../steps/code-review-step/handler.js';
import { handleReviewStep } from '../steps/review-step/handler.js';
import { handleTriageStep } from '../steps/triage-step/handler.js';
import { handleWorkflowStep } from '../steps/workflow-step/handler.js';
import { codeReviewRunStart } from '../code-review-rpc.js';
import { listTemplatesRpc } from '../artifacts-rpc.js';
import { repoSchemaRefusalOfInput } from '../repo-schema-guard.js';
import { handleRepoConvert } from '../repo-convert.js';
import { handleTrackerAttach } from '../tracker-attach.js';
import { handleTrackerSyncComments } from '../tracker-sync-comments.js';
import { prepareWorkflowRun } from '../workflow-rpc.js';
import { workflowReviewStart } from '../workflow-review-rpc.js';

const NAMING = /schema version 1 but version 2 is needed.*repo\.convert/s;
const text = (env: { content: readonly { text: string }[] }): string => env.content[0]?.text ?? '';

async function frames(run: (send: (m: IpcStreamMessage) => void) => Promise<void>): Promise<string> {
	const out: IpcStreamMessage[] = [];
	await run(m => out.push(m));
	return JSON.stringify(out);
}

test('repo-schema-entry-points.test.ts: each daemon entry point refuses an unconverted repository with the conversion message', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-entry-gate-'));
	try {
		execFileSync('git', ['init', '-q'], { cwd: repo });
		const signal = new AbortController().signal;
		const step = { phase: 'start', repo, focus: 'x' };
		for (const [name, out] of [
			['analyze-step', text(await handleAnalyzeStep(step))],
			['build-step', text(await handleBuildStep({ phase: 'implement', target: 's1/t1', repo }))],
			['code-review-step', text(await handleCodeReviewStep({ phase: 'start', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1', repo }))],
			['review-step', text(await handleReviewStep({ phase: 'start', repo, artifactPath: 'x.md' }))],
			['triage-step', text(await handleTriageStep(step))],
			['workflow-step', text(await handleWorkflowStep({ ...step, workflow: 'define' }))],
			['tracker.attach', JSON.stringify(handleTrackerAttach({ repo, epicHash: 'a3f4b8c9d1e2f3a4' }, undefined))],
			['tracker.syncComments', JSON.stringify(await handleTrackerSyncComments({ repo, epicHash: 'a3f4b8c9d1e2f3a4' }, undefined))],
			['codeReview.run', await frames(send => codeReviewRunStart({ repo, epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1' }, send, signal))],
			['workflow.review', await frames(send => workflowReviewStart({ repo, artifactPath: join(repo, 'x.md') }, send, signal))],
		] as const) assert.match(out.replace(/\\n/g, ' '), NAMING, `${name} refuses with the conversion message`);

		assert.throws(() => prepareWorkflowRun({ workflow: 'define', focus: 'x', repo }), NAMING, 'workflow.run refuses');
		await assert.rejects(listTemplatesRpc({ repoRoot: repo }), NAMING, 'artifacts.listTemplates refuses a repository root');

		// a later phase carries only the run's state token: it is not checked against another repository the fallback names
		assert.equal(repoSchemaRefusalOfInput({ phase: 'plan', state: 'tok' }, repo), undefined);
		assert.match(repoSchemaRefusalOfInput({ phase: 'start' }, repo) ?? '', NAMING);

		// repo.convert is exempt, and a converted repository passes the guard
		assert.equal('error' in (await handleRepoConvert({ repo }, undefined)), false, 'repo.convert previews an unconverted repository');
		mkdirSync(join(repo, '.insrc'), { recursive: true });
		writeFileSync(join(repo, '.insrc', 'schema.json'), JSON.stringify({ version: 2 }));
		assert.doesNotMatch(text(await handleTriageStep(step)), NAMING);
		assert.doesNotMatch(JSON.stringify(handleTrackerAttach({ repo, epicHash: 'a3f4b8c9d1e2f3a4' }, undefined)), NAMING);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
