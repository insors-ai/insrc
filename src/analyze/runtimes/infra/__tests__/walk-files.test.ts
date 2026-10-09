/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The file walk with no cap (LLD-b9d5c5c40df5a574-s2, task t2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_FILE_CAP, walkFiles } from '../_shared.js';

test('the file walk goes to the end with a null cap and stops at its cap, as before, with a number or with none given', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-walk-files-'));
	try {
		for (const sub of ['a', 'a/deep', 'b', 'node_modules/pkg']) mkdirSync(join(dir, sub), { recursive: true });
		for (let i = 0; i < 12; i++) writeFileSync(join(dir, ['a', 'a/deep', 'b'][i % 3]!, `f${String(i).padStart(2, '0')}.yaml`), 'k: v\n');
		writeFileSync(join(dir, 'node_modules/pkg/skipped.yaml'), 'k: v\n');

		// No cap: every file the walk visits, with its exclusions still applied, and nothing cut.
		const whole = await walkFiles(dir, null);
		assert.deepEqual([whole.files.length, whole.truncated, whole.unreadable.length], [12, false, 0]);
		assert.ok(whole.files.every(f => !f.relPath.startsWith('node_modules/')));

		// A cap: as before.
		const cut = await walkFiles(dir, 5);
		assert.deepEqual([cut.files.length, cut.truncated], [5, true]);
		assert.deepEqual(cut.files, whole.files.slice(0, 5), 'the same files in the same order');
		// A cap the tree does not reach, and the default: nothing cut.
		assert.deepEqual([(await walkFiles(dir, 12)).files.length, (await walkFiles(dir, 13)).truncated], [12, false]);
		const byDefault = await walkFiles(dir);
		assert.deepEqual([byDefault.files.length, byDefault.truncated], [12, false]);
		assert.equal(DEFAULT_FILE_CAP, 5000, 'the cap every existing caller walks with');

		// A root that cannot be read still throws, with or without a cap.
		await assert.rejects(walkFiles(join(dir, 'missing'), null));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
