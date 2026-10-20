/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Completion on a headless work item (s1/t7): with no head, no LLD and no earlier
 * record, ensureBuildRecordOnCompletion is the first writer and roots the anchor on
 * its own time instead of failing while it works out the workflow's own files.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/completion-anchor.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ensureBuildRecordOnCompletion } from '../completion-record.js';

const HASH = 'a3f4b8c9d1e2f3a4';

test('ensureBuildRecordOnCompletion on a headless work item writes the BUILD record through write intent', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-completion-anchor-'));
	try {
		const paths = await ensureBuildRecordOnCompletion(repo, { epicHash: HASH, storyId: 's1' }, async () => []);
		assert.ok(paths !== undefined, 'a record was written, not swallowed');
		assert.ok(existsSync(paths.md) && existsSync(paths.json));
		const rec = JSON.parse(readFileSync(paths.json, 'utf8')) as { meta: { createdAt: string; epicCreatedAt?: string } };
		assert.equal(rec.meta.epicCreatedAt, rec.meta.createdAt, 'the first writer stamps its own time as the anchor');
		assert.match(paths.md, new RegExp(`E${rec.meta.createdAt.slice(0, 10).replace(/-/g, '')}${HASH.slice(0, 8)}/S001/BUILD\\.md$`));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
