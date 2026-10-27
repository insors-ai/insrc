/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The verdicts phase and the revision (sc3): the controller's review mints a
 * revision only when its auto-fixes change the body.
 *
 * Run: npx tsx --test src/daemon/steps/review-step/__tests__/verdicts-revision.test.ts
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after as afterAll, test } from 'node:test';
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';

const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmSync(STORE_DIR, { recursive: true, force: true });
});

import { readReviewRecordOf } from '../../../../workflow/review/report-file.js';
import { fixtureReviewClient as handleReviewStep } from './terminal-client.js';
import { idOfWorkflow, writeDesign } from './review-fixture.js';
import { _clearReviewStateStoreForTests } from '../state-store.js';
import { createRepoLifecycle } from '../../../../workflow/artifact-core/repo-lifecycle.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

const MD = '# Story s1\n\n- t1: extend the two exported constants in foo.\n- t2: beta constant defined at src/foo.ts:2.\n';

const CLAIMS = {
	claims: [
		{ id: 'c-inv', ref: 's1/t1', kind: 'inventory', text: 'There are exactly two exported constants in foo.', anchors: ['src/foo.ts'], probe: { greps: ['^export const'] } },
		{ id: 'c-cite', ref: 's1/t2', kind: 'citation', text: 'beta constant defined at src/foo.ts:2.', anchors: ['src/foo.ts:2'], probe: { reads: ['src/foo.ts:2'] } },
	],
};

const WITH_AUTO_FIX = {
	verdicts: [
		{ claimId: 'c-inv', severity: 'HIGH', evidence: 'ripgrep re-derived THREE `export const` sites.', action: 'Correct the count.', fixability: 'auto',
			proposedFix: { rationale: 'three', artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }] } },
		{ claimId: 'c-cite', severity: 'LOW', evidence: 'confirmed.', action: 'none — verified sound', fixability: 'manual' },
	],
};
const REPORT_ONLY = {
	verdicts: [
		{ claimId: 'c-inv', severity: 'LOW', evidence: 'fine.', action: 'none — verified sound', fixability: 'manual' },
		{ claimId: 'c-cite', severity: 'LOW', evidence: 'confirmed.', action: 'none — verified sound', fixability: 'manual' },
	],
};

function fixture() {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-verdicts-rev-'));
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, 'src', 'foo.ts'), 'export const alpha = 1;\nexport const beta = 2;\nexport const gamma = 3;\n');
	const { mdPath, jsonPath } = writeDesign(repo, idOfWorkflow('plan'), { meta: { workflow: 'plan', storyId: 's1', authoredBy: 'daemon', revision: 2 }, body: { tasks: ['extend the two exported constants in foo.'] } }, MD);
	return { repo, mdPath, jsonPath, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

async function review(fx: ReturnType<typeof fixture>, verdicts: unknown): Promise<void> {
	_clearReviewStateStoreForTests();
	const start = JSON.parse((await handleReviewStep({ phase: 'start', artifact: fx.mdPath, repo: fx.repo })).content[0]!.text) as { state: string };
	await handleReviewStep({ phase: 'claims', claims: CLAIMS, state: start.state });
	const done = JSON.parse((await handleReviewStep({ phase: 'verdicts', verdicts, state: start.state } as never, { lifecycleFor: repo => createRepoLifecycle(repo).service })).content[0]!.text) as { next: string };
	assert.equal(done.next, 'done');
}

test('the verdicts path bumps the revision only when auto-fixes change the body', async () => {
	const fixed = fixture();
	try {
		await review(fixed, WITH_AUTO_FIX);
		const after = JSON.parse(readFileSync(fixed.jsonPath, 'utf8')) as { meta: Record<string, unknown>; body: unknown };
		assert.equal(after.meta['revision'], 3, 'an applied auto-fix mints the next revision');
		assert.match(JSON.stringify(after.body), /three exported constants/);
	} finally { fixed.cleanup(); }

	const only = fixture();
	try {
		const before = JSON.parse(readFileSync(only.jsonPath, 'utf8')) as { body: unknown };
		await review(only, REPORT_ONLY);
		const after = JSON.parse(readFileSync(only.jsonPath, 'utf8')) as { meta: Record<string, unknown>; body: unknown };
		assert.equal(after.meta['revision'], 2, 'a report-only review keeps the revision');
		assert.equal(JSON.stringify(after.body), JSON.stringify(before.body));
		assert.ok(readReviewRecordOf(only.jsonPath), 'and the review is recorded');
		assert.equal(after.meta['review'], undefined);
	} finally { only.cleanup(); }
});
