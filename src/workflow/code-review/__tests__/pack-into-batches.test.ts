/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-aef82b03 S001/t3 — packIntoBatches puts every atom in exactly one
 * batch, in order, each batch's built prompt within the budget, and names an
 * atom that cannot fit even alone.
 *
 * Run: npx tsx --test src/workflow/code-review/__tests__/pack-into-batches.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AtomTooLargeError, packIntoBatches } from '../pack-into-batches.js';

/** A built prompt: a fixed header, then the batch's items as JSON. */
const HEADER = 'Judge these symbols:\n';
const prompt = (batch: readonly { id: string; body: string }[]): string => HEADER + JSON.stringify(batch);

test('every item in exactly one batch, every batch fits, and an item that alone does not fit raises AtomTooLargeError naming it', () => {
	const items = Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, body: 'x'.repeat((i * 37) % 300 + 1) }));
	const budget = 2_000;
	const batches = packIntoBatches(items, b => prompt(b).length, budget, it => it.id);

	assert.ok(batches.length > 1, 'the items do not fit one prompt, so there are several batches');
	assert.deepEqual(batches.flat(), items, 'every item, exactly once, in order');
	for (const b of batches) {
		assert.ok(b.length > 0);
		assert.ok(prompt(b).length <= budget, `a batch of ${prompt(b).length} characters`);
	}
	// Greedy: no batch could have taken the next batch's first item.
	for (let i = 0; i + 1 < batches.length; i++) {
		assert.ok(prompt([...batches[i]!, batches[i + 1]![0]!]).length > budget);
	}
	assert.deepEqual(packIntoBatches([], b => prompt(b).length, budget), []);

	// An item whose prompt alone exceeds the budget is named, with both sizes.
	const huge = { id: 'src/big.ts#hugeFn', body: 'y'.repeat(budget) };
	assert.throws(
		() => packIntoBatches([items[0]!, huge, items[1]!], b => prompt(b).length, budget, it => it.id),
		(e: unknown) => e instanceof AtomTooLargeError
			&& e.atom === 'src/big.ts#hugeFn'
			&& e.size === prompt([huge]).length
			&& e.budget === budget
			&& e.message.includes('src/big.ts#hugeFn')
			&& e.message.includes(String(budget)),
	);
});
