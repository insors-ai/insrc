/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-7d42920d S001 — the docs migration realigns each artifact's stored label,
 * anchor and standalone flag with the work item it was moved into.
 *
 * UNIT over seeded mkdtemp fixtures for planMigration's metaRewrites; INTEGRATION
 * over a `git init` tmp repo for applyMigration. Seeding mirrors
 * migrate-docs-tree.test.ts.
 *
 *   npx tsx --test src/workflow/__tests__/migrate-docs-meta-rewrite.test.ts
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { epicShortName, type DefineArtifact } from '../artifacts/define.js';
import { hldShortName, type HldArtifact } from '../artifacts/hld.js';
import { planMigration } from '../migrate-docs-tree.js';

// ---------------------------------------------------------------------------
// t1 — the plan shape and the exported short-name helpers
// ---------------------------------------------------------------------------

test('t1 — a repo with no artifact store plans an empty metaRewrites list', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-meta-'));
	try {
		const plan = planMigration(repo);
		assert.deepEqual(plan.metaRewrites, []);
		assert.deepEqual(plan.moves, []);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('t1 — epicShortName and hldShortName: the slug when set, else the first sentence / first line', () => {
	const def = (epicSlug: string | undefined) =>
		({ meta: epicSlug === undefined ? {} : { epicSlug }, body: { problem: 'Folders drift. Labels too.' } }) as unknown as DefineArtifact;
	const hld = (epicSlug: string | undefined) =>
		({ meta: epicSlug === undefined ? {} : { epicSlug }, body: { frameworkSummary: 'One folder per item. More detail.' } }) as unknown as HldArtifact;
	assert.equal(epicShortName(def('the-label')), 'the-label');
	assert.equal(epicShortName(def(undefined)), 'Folders drift.');
	assert.equal(hldShortName(hld('the-label')), 'the-label');
	assert.equal(hldShortName(hld(undefined)), 'One folder per item');
});
