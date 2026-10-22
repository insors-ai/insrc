/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story s7: the completion walk stops at a unit the `holds` predicate names, so a held Story does not complete and neither does the Epic above it.
 *
 * Run: npx tsx --test src/workflow/artifact-core/__tests__/completion-holds.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { H, bob, kit } from './store-kit.js';
import type { Kit } from './store-kit.js';
import { EPIC, STORY, T1, T2, seedEpic, service, stubEvidence } from './lifecycle-kit.js';

const status = async (k: Kit, id: string) => (await k.store.read(id)).lifecycle.status;

describe('LifecycleService.completeIfRolledUp holds', () => {
	it('completeIfRolledUp with a holds predicate stops the walk at a held Story so the Epic is not completed, completes an unheld Story and then stops at a held Epic, and with no predicate behaves as before', async () => {
		const k = kit();
		try {
			await seedEpic(k);
			const svc = service(k, stubEvidence([T1, T2]));
			await svc.completeIfRolledUp(T1, bob);

			// a held Story is left as it is, and the Epic above it is not completed either
			const asked: string[] = [];
			const heldStory = await svc.completeIfRolledUp(T2, bob, { holds: id => { asked.push(id); return id === STORY; } });
			assert.deepEqual(heldStory.completed, [T2], 'only the Task completes');
			assert.equal(await status(k, STORY), 'draft');
			assert.equal(await status(k, EPIC), 'draft');
			assert.ok(asked.includes(STORY), 'the walk asks about the Story');
			assert.ok(asked.includes(T2), 'every unit the walk is about to complete is asked, Tasks included');

			// the Story is released but the Epic is held: the Story completes, the walk stops at the Epic
			const heldEpic = await svc.completeIfRolledUp(T2, bob, { holds: id => id === EPIC });
			assert.deepEqual(heldEpic.completed, [STORY]);
			assert.equal(await status(k, STORY), 'completed');
			assert.equal(await status(k, EPIC), 'draft');
			assert.equal(await status(k, `DEF-${H}`), 'draft', 'the Epic members are not frozen while it is held');

			// nothing held: the walk finishes as it always did
			assert.deepEqual((await svc.completeIfRolledUp(STORY, bob, { holds: () => false })).completed, [EPIC]);
			assert.equal(await status(k, EPIC), 'completed');
		} finally { k.done(); }
	});

	it('with no predicate the walk behaves as before', async () => {
		const k = kit();
		try {
			await seedEpic(k);
			const svc = service(k, stubEvidence([T1, T2]));
			await svc.completeIfRolledUp(T1, bob);
			assert.deepEqual((await svc.completeIfRolledUp(T2, bob)).completed, [T2, STORY, EPIC]);
		} finally { k.done(); }
	});
});
