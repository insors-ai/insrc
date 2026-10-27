/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The code-review judges run their model in the REVIEWED repository, not the
 * daemon's own checkout (ISSUE-f9ced66a, LLD-f9ced66a-s1, task t2).
 */

import { syntheticReviewBudget } from '../../../review-pipeline/__tests__/test-budget.js';
import { sessionMessages } from '../../../review-pipeline/__tests__/enveloped.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { judgeAdherence } from '../adherence.js';
import { judgeConventions } from '../conventions.js';
import { judgeCoverage } from '../coverage.js';
import { judgeFunctionalCoverage } from '../functional-coverage.js';
import { judgeQuality } from '../quality.js';
import type { CodeReviewSubject, CodeReviewGrounding } from '../../types.js';
import type { LLMProvider, StructuredSchema, StructuredCompletionOpts } from '../../../../shared/types.js';
import { enveloped, unenveloped } from '../../../review-pipeline/__tests__/enveloped.js';

const REPO = '/work/the-reviewed-repo';

const subject: CodeReviewSubject = {
	repoPath: REPO, epicHash: 'e', storyId: 's1', changedFiles: ['src/a.ts'],
	approvedLld:  { body: { framework: 'x' } } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } }     as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
};

const grounding: CodeReviewGrounding = {
	symbols: [{ entityId: 'e0', file: 'src/a.ts', kind: 'function', name: 'fn', signature: 'fn(): void', callers: [], callees: [], testsReaching: [] }],
};

/** Records the opts of every completeStructured call and answers with no findings. */
function recordingProvider(): { provider: LLMProvider; seen: (StructuredCompletionOpts | undefined)[] } {
	const seen: (StructuredCompletionOpts | undefined)[] = [];
	const provider = { getReviewBudgetProfile: (kind: 'structured' | 'reviewer-session') => syntheticReviewBudget(kind).profile,
		runReviewSession: async (prompt: string, schema: StructuredSchema, opts: { cwd: string; deadlineMs: number; stallMs?: number | undefined }) => provider.completeStructured(sessionMessages(prompt), schema, { cwd: opts.cwd, timeoutMs: opts.deadlineMs, ...(opts.stallMs !== undefined ? { stallMs: opts.stallMs } : {}) }),
		completeStructured: async (_m: unknown, s: unknown, opts?: StructuredCompletionOpts) => { seen.push(opts); return enveloped(s, { findings: [] }); },
	} as unknown as LLMProvider;
	return { provider, seen };
}

test('every code-review dimension judge passes the reviewed repoPath as cwd', async () => {
	const judges = { judgeAdherence, judgeConventions, judgeCoverage, judgeFunctionalCoverage, judgeQuality };
	for (const [name, judge] of Object.entries(judges)) {
		const { provider, seen } = recordingProvider();
		await judge(subject, grounding, provider);
		assert.ok(seen.length > 0, `${name} called the model`);
		for (const opts of seen) assert.equal(opts?.cwd, REPO, `${name} ran its model in the reviewed repository`);
	}
});
