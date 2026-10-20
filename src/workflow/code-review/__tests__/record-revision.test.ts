/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The code-review record is signoff-covered (sc3): every regeneration mints a
 * revision, through the runner's default writer and through the step handler's.
 *
 * Run: npx tsx --test src/workflow/code-review/__tests__/record-revision.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { LLMProvider } from '../../../shared/types.js';
import { DEFAULT_DEPS as RUNNER_DEPS, runCodeReview, type CodeReviewRunnerDeps, type JudgeSlot } from '../runner.js';
import { DEFAULT_DEPS as STEP_DEPS } from '../../../daemon/steps/code-review-step/handler.js';
import type { CodeReviewSubject, ReviewDimension } from '../types.js';

const HASH = '5a6b7c8d9e0f1a2b';
const ANCHOR = '2026-10-01T09:00:00.000Z';

function withRepo(fn: (repo: string) => Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-cr-revision-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(repo, '.insrc', 'artifacts', `LLD-${HASH}-s1.json`), JSON.stringify({ meta: { workflow: 'design.story', epicHash: HASH, storyId: 's1', createdAt: ANCHOR, epicCreatedAt: ANCHOR, epicSlug: 'cr-rev', standalone: true }, body: {} }, null, 2) + '\n');
	return fn(repo).finally(() => rmSync(repo, { recursive: true, force: true }));
}

async function review(repo: string, runId: string, write: CodeReviewRunnerDeps['write']): Promise<string> {
	const subject: CodeReviewSubject = {
		repoPath: repo, epicHash: HASH, storyId: 's1', changedFiles: ['src/a.ts'],
		approvedLld: { meta: { epicHash: HASH, storyId: 's1', epicSlug: 'cr-rev', createdAt: ANCHOR, epicCreatedAt: ANCHOR, standalone: true }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
		approvedPlan: null as unknown as CodeReviewSubject['approvedPlan'],
		buildRecord: null,
	};
	const judges: JudgeSlot[] = (['adherence', 'conventions', 'coverage', 'quality'] as ReviewDimension[])
		.map(dimension => ({ dimension, judge: async () => ({ dimension, findings: [] }) }));
	const written: string[] = [];
	const out = await runCodeReview(subject, {} as unknown as LLMProvider, { runId, modelLabel: 'test' }, {
		...RUNNER_DEPS, judges, assembleGrounding: async () => ({ symbols: [] }),
		write: (path, content) => { written.push(path); write(path, content); },
	});
	assert.equal(out.ok, true);
	return written.find(p => p.endsWith('.json'))!;
}

const revisionOf = (json: string): unknown => (JSON.parse(readFileSync(json, 'utf8')) as { meta: Record<string, unknown> }).meta['revision'];

test('a second code review bumps the record revision through the default and the injected writer', async () => {
	// the runner's default writer
	await withRepo(async (repo) => {
		const json = await review(repo, 'r1', RUNNER_DEPS.write);
		assert.equal(revisionOf(json), 1, 'the first record is revision 1');
		await review(repo, 'r2', RUNNER_DEPS.write);
		assert.equal(revisionOf(json), 2, 'a regenerated record mints the next revision');
	});
	// the step handler's writer, which the handler injects into the runner
	await withRepo(async (repo) => {
		const json = await review(repo, 'r1', STEP_DEPS.write);
		assert.equal(revisionOf(json), 1);
		await review(repo, 'r2', STEP_DEPS.write);
		assert.equal(revisionOf(json), 2);
	});
});
