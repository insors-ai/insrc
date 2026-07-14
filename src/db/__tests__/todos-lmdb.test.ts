/**
 * Phase 2.7 tests for the LMDB-backed `db/todos.ts`.
 *
 * Verifies the public surface preserves the prior DuckDB-backed
 * behaviour: list/item/comment CRUD, hierarchical scoping by session,
 * cycle detection on parent assignment, status transitions,
 * transfers, cascade deletes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import {
	insertList,
	insertItem,
	insertComment,
	getList,
	getItem,
	getComment,
	listItems,
	listAllLists,
	listListsBySession,
	updateList,
	updateItem,
	updateComment,
	deleteComment,
	listCommentsForItem,
	deleteItem,
	deleteList,
	deleteListsBySession,
	transferList,
	reparentList,
	assertParentAllowed,
} from '../todos.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-todos-lmdb-2.7-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const NOW = '2026-05-05T10:00:00.000Z';
const LATER = '2026-05-05T11:00:00.000Z';

// ---------------------------------------------------------------------------
// insertList
// ---------------------------------------------------------------------------

test('insertList creates a list with a seed transfer entry', async () => {
	const list = await insertList(null, {
		id: 'l1', sessionId: 's1',
		title: 'Tasks', owner: 'planner', source: 'user',
		createdAt: NOW,
	});
	assert.equal(list.id, 'l1');
	assert.equal(list.title, 'Tasks');
	assert.equal(list.status, 'active');
	assert.equal(list.owner, 'planner');
	assert.equal(list.source, 'user');
	assert.equal(list.transfers.length, 1);
	assert.equal(list.transfers[0]!.from, 'user');
	assert.equal(list.transfers[0]!.to, 'planner');
	assert.equal(list.transfers[0]!.reason, 'created');
});

test('insertList rejects unknown owner / source', async () => {
	await assert.rejects(
		insertList(null, {
			id: 'l1', sessionId: 's1', title: 't',
			owner: 'bogus' as unknown as 'planner', source: 'user', createdAt: NOW,
		}),
		/unknown owner/,
	);
});

test('insertList with parentListId validates session match', async () => {
	await insertList(null, { id: 'parent', sessionId: 's1', title: 'p', owner: 'planner', source: 'user', createdAt: NOW });
	await assert.rejects(
		insertList(null, { id: 'child', sessionId: 's2', parentListId: 'parent', title: 'c', owner: 'planner', source: 'user', createdAt: NOW }),
		/parent-session-mismatch/,
	);
});

test('insertList with missing parent rejects', async () => {
	await assert.rejects(
		insertList(null, { id: 'child', sessionId: 's1', parentListId: 'no-such', title: 'c', owner: 'planner', source: 'user', createdAt: NOW }),
		/parent-missing/,
	);
});

// ---------------------------------------------------------------------------
// insertItem + listItems ordering
// ---------------------------------------------------------------------------

test('insertItem creates an item under an existing list', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	const item = await insertItem(null, {
		id: 'i1', listId: 'l1', title: 'Do it',
		orderKey: 100, createdAt: NOW,
	});
	assert.equal(item.id, 'i1');
	assert.equal(item.status, 'pending');
	assert.equal(item.order, 100);
});

test('insertItem on missing list rejects', async () => {
	await assert.rejects(
		insertItem(null, { id: 'i1', listId: 'no-such', title: 't', orderKey: 0, createdAt: NOW }),
		/does not exist/,
	);
});

test('listItems returns items sorted by order', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'a', listId: 'l1', title: 'A', orderKey: 200, createdAt: NOW });
	await insertItem(null, { id: 'b', listId: 'l1', title: 'B', orderKey: 100, createdAt: NOW });
	await insertItem(null, { id: 'c', listId: 'l1', title: 'C', orderKey: 300, createdAt: NOW });
	const items = await listItems(null, 'l1', false);
	assert.deepEqual(items.map(i => i.id), ['b', 'a', 'c']);
});

test('listItems supports fractional ordering for insert-between', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'a', listId: 'l1', title: 'A', orderKey: 100, createdAt: NOW });
	await insertItem(null, { id: 'c', listId: 'l1', title: 'C', orderKey: 200, createdAt: NOW });
	await insertItem(null, { id: 'b', listId: 'l1', title: 'B', orderKey: 150, createdAt: NOW });
	const items = await listItems(null, 'l1', false);
	assert.deepEqual(items.map(i => i.id), ['a', 'b', 'c']);
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

test('insertComment + listCommentsForItem round-trip', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'Item', orderKey: 0, createdAt: NOW });
	await insertComment(null, { id: 'c1', itemId: 'i1', author: 'user', body: 'hello', createdAt: NOW });
	const comments = await listCommentsForItem(null, 'i1');
	assert.equal(comments.length, 1);
	assert.equal(comments[0]!.body, 'hello');
});

test('listCommentsForItem returns comments sorted by createdAt', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I', orderKey: 0, createdAt: NOW });
	await insertComment(null, { id: 'b', itemId: 'i1', author: 'user', body: '2nd', createdAt: '2026-05-05T11:00:00.000Z' });
	await insertComment(null, { id: 'a', itemId: 'i1', author: 'user', body: '1st', createdAt: '2026-05-05T10:00:00.000Z' });
	const comments = await listCommentsForItem(null, 'i1');
	assert.deepEqual(comments.map(c => c.id), ['a', 'b']);
});

test('updateComment updates body + agentAcknowledged', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I', orderKey: 0, createdAt: NOW });
	await insertComment(null, { id: 'c1', itemId: 'i1', author: 'user', body: 'orig', createdAt: NOW });
	const updated = await updateComment(null, 'c1', { body: 'edited', editedAt: LATER, agentAcknowledged: true });
	assert.equal(updated.body, 'edited');
	assert.equal(updated.editedAt, LATER);
	assert.equal(updated.agentAcknowledged, true);
});

test('deleteComment removes the comment', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I', orderKey: 0, createdAt: NOW });
	await insertComment(null, { id: 'c1', itemId: 'i1', author: 'user', body: 'x', createdAt: NOW });
	await deleteComment(null, 'c1');
	const comments = await listCommentsForItem(null, 'i1');
	assert.equal(comments.length, 0);
});

// ---------------------------------------------------------------------------
// Status transitions + side effects
// ---------------------------------------------------------------------------

test('updateItem rejects illegal status transitions', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I', orderKey: 0, createdAt: NOW });
	// pending -> completed is not allowed (must go through in_progress)
	await assert.rejects(
		updateItem(null, 'i1', { status: 'completed' }, LATER),
		/illegal item-status transition/,
	);
});

test('updateItem -> completed sets completedAt', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I', orderKey: 0, createdAt: NOW });
	await updateItem(null, 'i1', { status: 'in_progress' }, LATER);
	const completed = await updateItem(null, 'i1', { status: 'completed' }, LATER);
	assert.equal(completed.status, 'completed');
	assert.ok(completed.completedAt);
});

test('updateItem -> blocked requires non-empty blockedReason', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I', orderKey: 0, createdAt: NOW });
	await updateItem(null, 'i1', { status: 'in_progress' }, LATER);
	await assert.rejects(
		updateItem(null, 'i1', { status: 'blocked' }, LATER),
		/non-empty blockedReason/,
	);
	const blocked = await updateItem(null, 'i1', { status: 'blocked', blockedReason: 'depends on X' }, LATER);
	assert.equal(blocked.status, 'blocked');
	assert.equal(blocked.blockedReason, 'depends on X');
});

test('updateList rejects illegal status transitions', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	// First archive the list (active -> archived is valid)
	await updateList(null, 'l1', { status: 'archived' }, LATER);
	// archived -> completed is invalid (archived only transitions back to active)
	await assert.rejects(
		updateList(null, 'l1', { status: 'completed' }, LATER),
		/illegal list-status transition/,
	);
});

// ---------------------------------------------------------------------------
// transferList
// ---------------------------------------------------------------------------

test('transferList changes owner + appends transfer history', async () => {
	const list = await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	assert.equal(list.transfers.length, 1);
	const transferred = await transferList(null, 'l1', 'tester', 'ready to test', LATER);
	assert.equal(transferred.owner, 'tester');
	assert.equal(transferred.transfers.length, 2);
	assert.equal(transferred.transfers[1]!.reason, 'ready to test');
});

// ---------------------------------------------------------------------------
// reparentList + cycle detection
// ---------------------------------------------------------------------------

test('reparentList sets the parent', async () => {
	await insertList(null, { id: 'p', sessionId: 's1', title: 'P', owner: 'planner', source: 'user', createdAt: NOW });
	await insertList(null, { id: 'c', sessionId: 's1', title: 'C', owner: 'planner', source: 'user', createdAt: NOW });
	const updated = await reparentList(null, 'c', 'p', LATER);
	assert.equal(updated.parentListId, 'p');
});

test('reparentList rejects cycles', async () => {
	await insertList(null, { id: 'a', sessionId: 's1', title: 'A', owner: 'planner', source: 'user', createdAt: NOW });
	await insertList(null, { id: 'b', sessionId: 's1', parentListId: 'a', title: 'B', owner: 'planner', source: 'user', createdAt: NOW });
	// a -> b (b's parent is a). Reparenting a under b would cycle.
	await assert.rejects(
		reparentList(null, 'a', 'b', LATER),
		/parent-cycle/,
	);
});

test('assertParentAllowed accepts valid hierarchies', async () => {
	await insertList(null, { id: 'gp', sessionId: 's1', title: 'GP', owner: 'planner', source: 'user', createdAt: NOW });
	await insertList(null, { id: 'p', sessionId: 's1', parentListId: 'gp', title: 'P', owner: 'planner', source: 'user', createdAt: NOW });
	await assertParentAllowed(null, 'p', 'fresh-id', 's1');
});

// ---------------------------------------------------------------------------
// Listing + filtering
// ---------------------------------------------------------------------------

test('listListsBySession returns roots first then children', async () => {
	await insertList(null, { id: 'root', sessionId: 's1', title: 'R', owner: 'planner', source: 'user', createdAt: NOW });
	await insertList(null, { id: 'child', sessionId: 's1', parentListId: 'root', title: 'C', owner: 'planner', source: 'user', createdAt: LATER });
	const list = await listListsBySession(null, 's1');
	assert.deepEqual(list.map(l => l.id), ['root', 'child']);
});

test('listListsBySession filters by includeArchived flag', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 'A', owner: 'planner', source: 'user', createdAt: NOW });
	await insertList(null, { id: 'l2', sessionId: 's1', title: 'B', owner: 'planner', source: 'user', createdAt: NOW });
	await updateList(null, 'l2', { status: 'completed' }, LATER);
	await updateList(null, 'l2', { status: 'archived' }, LATER);
	const noArchived = await listListsBySession(null, 's1');
	assert.equal(noArchived.length, 1);
	const withArchived = await listListsBySession(null, 's1', { includeArchived: true });
	assert.equal(withArchived.length, 2);
});

test('listAllLists filters by status + source', async () => {
	await insertList(null, { id: 'p1', sessionId: 's1', title: 'A', owner: 'planner', source: 'user', createdAt: NOW });
	await insertList(null, { id: 'p2', sessionId: 's1', title: 'B', owner: 'planner', source: 'planner', createdAt: NOW });
	const userOnly = await listAllLists(null, { sources: ['user'] });
	assert.equal(userOnly.length, 1);
	assert.equal(userOnly[0]!.id, 'p1');
});

// ---------------------------------------------------------------------------
// Cascade deletes
// ---------------------------------------------------------------------------

test('deleteItem removes the item + its comments', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I', orderKey: 0, createdAt: NOW });
	await insertComment(null, { id: 'c1', itemId: 'i1', author: 'user', body: 'x', createdAt: NOW });
	await deleteItem(null, 'i1');
	assert.equal(await getItem(null, 'i1'), null);
	assert.equal(await getComment(null, 'c1'), null);
});

test('deleteList cascades through items + comments', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I1', orderKey: 0, createdAt: NOW });
	await insertItem(null, { id: 'i2', listId: 'l1', title: 'I2', orderKey: 1, createdAt: NOW });
	await insertComment(null, { id: 'c1', itemId: 'i1', author: 'user', body: 'x', createdAt: NOW });
	await deleteList(null, 'l1');
	assert.equal(await getList(null, 'l1'), null);
	assert.equal(await getItem(null, 'i1'), null);
	assert.equal(await getItem(null, 'i2'), null);
	assert.equal(await getComment(null, 'c1'), null);
});

test('deleteListsBySession returns the count', async () => {
	await insertList(null, { id: 'a', sessionId: 's1', title: 'A', owner: 'planner', source: 'user', createdAt: NOW });
	await insertList(null, { id: 'b', sessionId: 's1', title: 'B', owner: 'planner', source: 'user', createdAt: NOW });
	await insertList(null, { id: 'c', sessionId: 's2', title: 'C', owner: 'planner', source: 'user', createdAt: NOW });
	const n = await deleteListsBySession(null, 's1');
	assert.equal(n, 2);
	assert.equal((await listListsBySession(null, 's1')).length, 0);
	assert.equal((await listListsBySession(null, 's2')).length, 1);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('lists + items + comments survive close + reopen', async () => {
	await insertList(null, { id: 'l1', sessionId: 's1', title: 't', owner: 'planner', source: 'user', createdAt: NOW });
	await insertItem(null, { id: 'i1', listId: 'l1', title: 'I', orderKey: 0, createdAt: NOW });
	await insertComment(null, { id: 'c1', itemId: 'i1', author: 'user', body: 'x', createdAt: NOW });
	await closeGraphStore();

	const list = await getList(null, 'l1');
	assert.ok(list);
	assert.equal(list.items.length, 1);
	const items = await listItems(null, 'l1', true);
	assert.equal(items[0]!.comments?.length ?? 0, 1);
});
