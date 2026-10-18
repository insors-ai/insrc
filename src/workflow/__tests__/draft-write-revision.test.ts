/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A draft written by the synthesize phase is revision 1 (sc3), and a re-draft
 * written over it keeps the whole prior tracker block.
 *
 * Run: npx tsx --test src/workflow/__tests__/draft-write-revision.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleWorkflowStep } from '../../daemon/steps/workflow-step/handler.js';
import { _clearWorkflowStateStoreForTests } from '../../daemon/steps/workflow-step/state-store.js';
import { registerWorkflowRunners } from '../index.js';
import { writeArtifact } from '../storage.js';
import { patchTrackerMeta } from '../tracker/refs.js';

type Doc = { meta: Record<string, any>; body: Record<string, unknown>; citations: unknown };
const payload = (env: { content: readonly { text: string }[] }): Record<string, unknown> => JSON.parse(env.content[0]!.text) as Record<string, unknown>;

test('a first draft has revision 1 and a re-draft keeps the whole prior tracker block', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-draft-rev-'));
	try {
		const start = payload(await handleWorkflowStep({ phase: 'start', workflow: 'stub', focus: 'draft revision', repo }));
		const plan = payload(await handleWorkflowStep({
			phase: 'plan', state: start['state'] as string,
			plan: { workflow: 'stub', steps: [{ id: 's1', runner: 'echo.a', params: {} }, { id: 's2', runner: 'echo.b', params: {} }, { id: 's3', runner: 'echo.c', params: {} }] },
		}));
		const done = payload(await handleWorkflowStep({
			phase: 'synthesize', state: plan['state'] as string,
			artifact: {
				body: { title: 'Stub draft', summary: 'Walked the stub workflow [[c1]].', bulletList: ['one [[c1]]'] },
				citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
			},
		}));
		assert.equal(done['next'], 'done');
		const json = (done['path'] as string).replace(/\.md$/, '.json');
		const first = JSON.parse(readFileSync(json, 'utf8')) as Doc;
		assert.equal(first.meta['revision'], 1, 'a first draft is revision 1');

		// The tracker block is added by a meta-only patch: the revision stays 1.
		patchTrackerMeta(json, { epicRef: 'o/r#1', storyRefs: { s1: 'o/r#2' }, pushedAt: 'p' });
		assert.equal((JSON.parse(readFileSync(json, 'utf8')) as Doc).meta['revision'], 1);

		// A re-draft replaces the file with a freshly rendered artifact (no tracker block).
		const redraft: Doc = { ...first, body: { ...first.body, summary: 'A different summary.' } };
		delete redraft.meta['revision'];
		delete redraft.meta['tracker'];
		writeArtifact(json, redraft, 'content');
		const second = JSON.parse(readFileSync(json, 'utf8')) as Doc;
		assert.equal(second.meta['revision'], 2);
		assert.equal(second.meta['tracker'].epicRef, 'o/r#1', 'epicRef survives the re-draft');
		assert.deepEqual(second.meta['tracker'].storyRefs, { s1: 'o/r#2' }, 'storyRefs survive the re-draft');
		assert.equal(second.meta['tracker'].pushedAt, 'p');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
