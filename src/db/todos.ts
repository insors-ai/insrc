/**
 * LMDB-backed persistence for the session-scoped TODO framework.
 *
 * Phase 2.7 of plans/storage-migration-lmdb-lance.md. Public surface
 * preserved verbatim from the prior DuckDB-backed implementation so
 * callers (`daemon/todos-api.ts`, `daemon/todos-rpc.ts`, etc.) don't
 * change in this phase. The `db: DbClient` parameter is retained but
 * unused.
 *
 * Storage:
 *   - `todo_list` sub-DB: utf8 list_id -> msgpack(TodoListRow)
 *   - `todo_list_by_session` sub-DB: dupsort (utf8 session_id) -> utf8 list_id
 *   - `todo_item` sub-DB: utf8 item_id -> msgpack(TodoItemRow with `order: number`)
 *     Per-list scan iterates the whole sub-DB filtering by listId; sort
 *     by `order` in memory (small N per list -- typically dozens).
 *   - `todo_comment` sub-DB: composite (utf8 item_id, \0, utf8 comment_id)
 *     -> msgpack(TodoCommentRow). Per-item range scan via prefix(item_id).
 *
 * **No Lance involvement** -- the prior B.0 audit confirmed the todos
 * vector column was always zero-filled and never queried.
 */

import {
	getGraphStore,
	withWriteTxn,
} from './graph/store.js';
import {
	encodeTodoCommentKey,
	encodeTodoCommentPrefix,
	encodeTodoListBySessionKey,
	encodeTodoListBySessionPrefix,
	prefixSuccessor,
} from './graph/keys.js';
import {
	encodeTodoListRow,
	decodeTodoListRow,
	encodeTodoItemRow,
	decodeTodoItemRow,
	encodeTodoCommentRow,
	decodeTodoCommentRow,
	type TodoListRow,
	type TodoItemRow,
	type TodoCommentRow,
} from './graph/codec.js';
import type {
	TodoComment, TodoItem, TodoItemStatus, TodoList, TodoListStatus, TodoOwner,
	TodoTransfer,
} from '../shared/todos.js';
import { canTransitionItem, canTransitionList, isValidTodoOwner } from '../shared/todos.js';

type DbClient = unknown;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function initTodosTables(_db: DbClient): Promise<void> {
	// LMDB sub-DBs are created at env open (in store.ts); nothing to do
	// here. Kept for back-compat with daemon/index.ts call site.
}

// ---------------------------------------------------------------------------
// Insert helpers
// ---------------------------------------------------------------------------

export interface InsertListOpts {
	readonly id:            string;
	readonly sessionId:     string;
	readonly parentListId?: string | undefined;
	readonly title:         string;
	readonly description?:  string | undefined;
	readonly owner:         TodoOwner;
	readonly source:        TodoOwner;
	readonly body?:         string | undefined;
	readonly createdAt:     string;
}

export async function insertList(_db: DbClient, opts: InsertListOpts): Promise<TodoList> {
	if (!isValidTodoOwner(opts.owner)) {
		throw new Error(`insertList: unknown owner '${opts.owner}'`);
	}
	if (!isValidTodoOwner(opts.source)) {
		throw new Error(`insertList: unknown source '${opts.source}'`);
	}

	if (opts.parentListId !== undefined) {
		await assertParentAllowed(_db, opts.parentListId, opts.id, opts.sessionId);
	}

	const seedTransfer: TodoTransfer = {
		from:      opts.source,
		to:        opts.owner,
		reason:    'created',
		at:        opts.createdAt,
		initiator: opts.source,
	};

	const createdAtMs = parseTs(opts.createdAt);
	const row: TodoListRow = {
		id:           opts.id,
		sessionId:    opts.sessionId,
		parentListId: opts.parentListId ?? '',
		title:        opts.title,
		description:  opts.description ?? '',
		status:       'active',
		owner:        opts.owner,
		source:       opts.source,
		transfers:    [seedTransfer],
		body:         opts.body ?? '',
		createdAt:    createdAtMs,
		updatedAt:    createdAtMs,
	};
	await withWriteTxn(s => {
		s.todoList.put(row.id, encodeTodoListRow(row));
		s.todoListBySession.put(
			encodeTodoListBySessionKey(row.sessionId, row.id),
			Buffer.alloc(0),
		);
	});

	const list = await getList(_db, opts.id);
	if (list === null) {
		throw new Error(`insertList: failed to read back list '${opts.id}' after insert`);
	}
	return list;
}

export interface InsertItemOpts {
	readonly id:             string;
	readonly listId:         string;
	readonly title:          string;
	readonly description?:   string | undefined;
	readonly orderKey:       number;
	readonly tags?:          readonly string[] | undefined;
	readonly meta?:          Readonly<Record<string, unknown>> | undefined;
	readonly createdAt:      string;
}

export async function insertItem(_db: DbClient, opts: InsertItemOpts): Promise<TodoItem> {
	const list = await getList(_db, opts.listId, { withItems: false });
	if (list === null) {
		throw new Error(`insertItem: list '${opts.listId}' does not exist`);
	}
	const createdAtMs = parseTs(opts.createdAt);
	const row: TodoItemRow = {
		id:            opts.id,
		listId:        opts.listId,
		title:         opts.title,
		description:   opts.description ?? '',
		status:        'pending',
		order:         opts.orderKey,
		createdAt:     createdAtMs,
		updatedAt:     createdAtMs,
		completedAt:   0,
		blockedReason: '',
		tags:          [...(opts.tags ?? [])],
		meta:          opts.meta !== undefined ? { ...opts.meta } : {},
	};
	await withWriteTxn(s => {
		s.todoItem.put(opts.id, encodeTodoItemRow(row));
	});

	const item = await getItem(_db, opts.id);
	if (item === null) {
		throw new Error(`insertItem: failed to read back item '${opts.id}' after insert`);
	}
	return item;
}

export interface InsertCommentOpts {
	readonly id:         string;
	readonly itemId:     string;
	readonly author:     TodoOwner | 'user';
	readonly body:       string;
	readonly createdAt:  string;
}

export async function insertComment(_db: DbClient, opts: InsertCommentOpts): Promise<TodoComment> {
	const row: TodoCommentRow = {
		id:                opts.id,
		itemId:            opts.itemId,
		author:            opts.author,
		body:              opts.body,
		createdAt:         parseTs(opts.createdAt),
		editedAt:          0,
		agentAcknowledged: false,
	};
	await withWriteTxn(s => {
		s.todoComment.put(encodeTodoCommentKey(opts.itemId, opts.id), encodeTodoCommentRow(row));
	});

	const comment = await getComment(_db, opts.id);
	if (comment === null) {
		throw new Error(`insertComment: failed to read back comment '${opts.id}' after insert`);
	}
	return comment;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export interface GetListOpts {
	readonly withItems?: boolean;
	readonly withComments?: boolean;
}

export async function getList(
	_db: DbClient,
	listId: string,
	opts: GetListOpts = {},
): Promise<TodoList | null> {
	const store = await getGraphStore();
	const buf = store.todoList.get(listId);
	if (buf === undefined) return null;
	const row = decodeTodoListRow(buf as Buffer);

	const includeComments = opts.withComments !== false;
	const items = opts.withItems === false
		? []
		: await listItems(_db, listId, includeComments);
	return rowToList(row, items);
}

export async function getItem(_db: DbClient, itemId: string): Promise<TodoItem | null> {
	const store = await getGraphStore();
	const buf = store.todoItem.get(itemId);
	if (buf === undefined) return null;
	return rowToItem(decodeTodoItemRow(buf as Buffer), undefined);
}

export async function getComment(_db: DbClient, commentId: string): Promise<TodoComment | null> {
	const store = await getGraphStore();
	// Comments are keyed by (item_id, comment_id) -- O(N) scan to find
	// by comment_id alone. Comment counts are typically a handful per
	// item; full table scan stays fast.
	for (const { value } of store.todoComment.getRange()) {
		const row = decodeTodoCommentRow(value as Buffer);
		if (row.id === commentId) return rowToComment(row);
	}
	return null;
}

export async function listItems(
	_db: DbClient,
	listId: string,
	withComments: boolean,
): Promise<readonly TodoItem[]> {
	const store = await getGraphStore();
	const rows: TodoItemRow[] = [];
	for (const { value } of store.todoItem.getRange()) {
		const row = decodeTodoItemRow(value as Buffer);
		if (row.listId === listId) rows.push(row);
	}
	rows.sort((a, b) => a.order - b.order);

	if (!withComments) return rows.map(r => rowToItem(r, undefined));

	const itemIds = rows.map(r => r.id);
	const commentsByItem = await listCommentsByItems(itemIds);
	return rows.map(r => rowToItem(r, commentsByItem.get(r.id) ?? []));
}

async function listCommentsByItems(itemIds: readonly string[]): Promise<Map<string, TodoComment[]>> {
	const by = new Map<string, TodoComment[]>();
	if (itemIds.length === 0) return by;
	const store = await getGraphStore();
	const wantSet = new Set(itemIds);
	const collected: TodoCommentRow[] = [];
	for (const itemId of wantSet) {
		const prefix = encodeTodoCommentPrefix(itemId);
		const succ = prefixSuccessor(prefix);
		for (const { value } of store.todoComment.getRange({ start: prefix, end: succ })) {
			collected.push(decodeTodoCommentRow(value as Buffer));
		}
	}
	collected.sort((a, b) => a.createdAt - b.createdAt);
	for (const row of collected) {
		const list = by.get(row.itemId);
		if (list === undefined) by.set(row.itemId, [rowToComment(row)]);
		else list.push(rowToComment(row));
	}
	return by;
}

export async function listAllLists(
	_db: DbClient,
	filter: {
		readonly statuses?: readonly TodoListStatus[];
		readonly sources?: readonly TodoOwner[];
		readonly updatedBefore?: string;
	} = {},
): Promise<readonly TodoList[]> {
	const store = await getGraphStore();
	const wantStatuses = filter.statuses && filter.statuses.length > 0
		? new Set(filter.statuses)
		: null;
	const wantSources = filter.sources && filter.sources.length > 0
		? new Set(filter.sources)
		: null;
	const updatedBefore = filter.updatedBefore !== undefined ? parseTs(filter.updatedBefore) : null;

	const matched: TodoListRow[] = [];
	for (const { value } of store.todoList.getRange()) {
		const row = decodeTodoListRow(value as Buffer);
		if (wantStatuses !== null && !wantStatuses.has(row.status)) continue;
		if (wantSources  !== null && !wantSources.has(row.source))   continue;
		if (updatedBefore !== null && row.updatedAt >= updatedBefore) continue;
		matched.push(row);
	}
	const out: TodoList[] = [];
	for (const row of matched) {
		const items = await listItems(_db, row.id, true);
		out.push(rowToList(row, items));
	}
	return out;
}

export async function listListsBySession(
	_db: DbClient,
	sessionId: string,
	opts: { includeArchived?: boolean } = {},
): Promise<readonly TodoList[]> {
	const store = await getGraphStore();
	// Walk the (sessionId, listId) dupsort index for O(matches)
	const prefix = encodeTodoListBySessionPrefix(sessionId);
	const succ = prefixSuccessor(prefix);
	const ids: string[] = [];
	for (const { key } of store.todoListBySession.getRange({ start: prefix, end: succ })) {
		const k = key as Buffer;
		const sep = k.indexOf(0);
		if (sep < 0) continue;
		ids.push(k.subarray(sep + 1).toString('utf8'));
	}

	const rows: TodoListRow[] = [];
	for (const id of ids) {
		const buf = store.todoList.get(id);
		if (buf === undefined) continue;
		const row = decodeTodoListRow(buf as Buffer);
		if (opts.includeArchived !== true && row.status === 'archived') continue;
		rows.push(row);
	}

	// Roots first (parentListId = ''), then children; secondary sort by createdAt
	rows.sort((a, b) => {
		const aRoot = a.parentListId === '' ? 0 : 1;
		const bRoot = b.parentListId === '' ? 0 : 1;
		if (aRoot !== bRoot) return aRoot - bRoot;
		return a.createdAt - b.createdAt;
	});

	const out: TodoList[] = [];
	for (const row of rows) {
		const items = await listItems(_db, row.id, true);
		out.push(rowToList(row, items));
	}
	return out;
}

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

export async function assertParentAllowed(
	_db: DbClient,
	proposedParentId: string,
	childId: string,
	childSessionId: string,
): Promise<void> {
	const store = await getGraphStore();
	const seen = new Set<string>();
	let cursor: string | null = proposedParentId;
	let depth = 0;
	const MAX_DEPTH = 1024;

	while (cursor !== null) {
		if (cursor === childId) {
			throw new Error(`parent-cycle: list '${proposedParentId}' is a descendant of '${childId}'`);
		}
		if (seen.has(cursor)) {
			throw new Error(`parent-cycle: pre-existing cycle detected at '${cursor}'`);
		}
		if (depth++ > MAX_DEPTH) {
			throw new Error(`parent-depth-exceeded: walking '${proposedParentId}' reached max depth`);
		}
		seen.add(cursor);

		const buf = store.todoList.get(cursor);
		if (buf === undefined) {
			throw new Error(`parent-missing: list '${cursor}' does not exist`);
		}
		const row = decodeTodoListRow(buf as Buffer);
		if (row.sessionId !== childSessionId) {
			throw new Error(`parent-session-mismatch: parent '${cursor}' is in a different session`);
		}
		cursor = row.parentListId !== '' ? row.parentListId : null;
	}
}

// ---------------------------------------------------------------------------
// Update helpers
// ---------------------------------------------------------------------------

export interface UpdateListFields {
	readonly title?:       string | undefined;
	readonly description?: string | undefined;
	readonly status?:      TodoListStatus | undefined;
	readonly body?:        string | undefined;
}

export async function updateList(
	_db: DbClient,
	listId: string,
	fields: UpdateListFields,
	now: string,
): Promise<TodoList> {
	const store = await getGraphStore();
	const buf = store.todoList.get(listId);
	if (buf === undefined) throw new Error(`updateList: list '${listId}' does not exist`);
	const cur = decodeTodoListRow(buf as Buffer);

	if (fields.status !== undefined && !canTransitionList(cur.status, fields.status)) {
		throw new Error(`updateList: illegal list-status transition '${cur.status}' -> '${fields.status}'`);
	}

	const next: TodoListRow = {
		...cur,
		updatedAt: parseTs(now),
		...(fields.title       !== undefined ? { title:       fields.title } : {}),
		...(fields.description !== undefined ? { description: fields.description } : {}),
		...(fields.status      !== undefined ? { status:      fields.status } : {}),
		...(fields.body        !== undefined ? { body:        fields.body } : {}),
	};
	await withWriteTxn(s => {
		s.todoList.put(listId, encodeTodoListRow(next));
	});

	const refreshed = await getList(_db, listId);
	if (refreshed === null) throw new Error(`updateList: list '${listId}' vanished during update`);
	return refreshed;
}

export interface UpdateItemFields {
	readonly title?:         string | undefined;
	readonly description?:   string | undefined;
	readonly status?:        TodoItemStatus | undefined;
	readonly blockedReason?: string | undefined;
	readonly tags?:          readonly string[] | undefined;
	readonly meta?:          Readonly<Record<string, unknown>> | undefined;
	readonly orderKey?:      number | undefined;
}

export async function updateItem(
	_db: DbClient,
	itemId: string,
	fields: UpdateItemFields,
	now: string,
): Promise<TodoItem> {
	const store = await getGraphStore();
	const buf = store.todoItem.get(itemId);
	if (buf === undefined) throw new Error(`updateItem: item '${itemId}' does not exist`);
	const cur = decodeTodoItemRow(buf as Buffer);

	if (fields.status !== undefined && !canTransitionItem(cur.status, fields.status)) {
		throw new Error(`updateItem: illegal item-status transition '${cur.status}' -> '${fields.status}'`);
	}
	if (fields.status === 'blocked') {
		const reason = fields.blockedReason ?? cur.blockedReason ?? '';
		if (reason.trim().length === 0) {
			throw new Error(`updateItem: transition to 'blocked' requires a non-empty blockedReason`);
		}
	}

	const nowMs = parseTs(now);
	const next: TodoItemRow = {
		...cur,
		updatedAt: nowMs,
		...(fields.title         !== undefined ? { title:         fields.title } : {}),
		...(fields.description   !== undefined ? { description:   fields.description } : {}),
		...(fields.status        !== undefined ? { status:        fields.status } : {}),
		...(fields.blockedReason !== undefined ? { blockedReason: fields.blockedReason } : {}),
		...(fields.tags          !== undefined ? { tags:          [...fields.tags] } : {}),
		...(fields.meta          !== undefined ? { meta:          { ...fields.meta } } : {}),
		...(fields.orderKey      !== undefined ? { order:         fields.orderKey } : {}),
		...(fields.status === 'completed' ? { completedAt: nowMs } : {}),
	};
	await withWriteTxn(s => {
		s.todoItem.put(itemId, encodeTodoItemRow(next));
	});

	const refreshed = await getItem(_db, itemId);
	if (refreshed === null) throw new Error(`updateItem: item '${itemId}' vanished during update`);
	return refreshed;
}

export async function transferList(
	_db: DbClient,
	listId: string,
	to: TodoOwner,
	reason: string,
	now: string,
	initiator?: TodoOwner,
): Promise<TodoList> {
	if (!isValidTodoOwner(to)) throw new Error(`transferList: unknown target owner '${to}'`);
	const store = await getGraphStore();
	const buf = store.todoList.get(listId);
	if (buf === undefined) throw new Error(`transferList: list '${listId}' does not exist`);
	const cur = decodeTodoListRow(buf as Buffer);

	const entry: TodoTransfer = {
		from:      cur.owner,
		to,
		reason,
		at:        now,
		initiator: initiator ?? cur.owner,
	};
	const next: TodoListRow = {
		...cur,
		owner:     to,
		transfers: [...cur.transfers, entry],
		updatedAt: parseTs(now),
	};
	await withWriteTxn(s => {
		s.todoList.put(listId, encodeTodoListRow(next));
	});

	const refreshed = await getList(_db, listId);
	if (refreshed === null) throw new Error(`transferList: list '${listId}' vanished during transfer`);
	return refreshed;
}

export async function reparentList(
	_db: DbClient,
	listId: string,
	newParentListId: string | null,
	now: string,
): Promise<TodoList> {
	const store = await getGraphStore();
	const buf = store.todoList.get(listId);
	if (buf === undefined) throw new Error(`reparentList: list '${listId}' does not exist`);
	const cur = decodeTodoListRow(buf as Buffer);

	if (newParentListId !== null) {
		await assertParentAllowed(_db, newParentListId, listId, cur.sessionId);
	}

	const next: TodoListRow = {
		...cur,
		parentListId: newParentListId ?? '',
		updatedAt:    parseTs(now),
	};
	await withWriteTxn(s => {
		s.todoList.put(listId, encodeTodoListRow(next));
	});

	const refreshed = await getList(_db, listId);
	if (refreshed === null) throw new Error(`reparentList: list '${listId}' vanished during reparent`);
	return refreshed;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export interface UpdateCommentFields {
	readonly body?: string | undefined;
	readonly agentAcknowledged?: boolean | undefined;
	readonly editedAt?: string | undefined;
}

export async function updateComment(
	_db: DbClient,
	commentId: string,
	fields: UpdateCommentFields,
): Promise<TodoComment> {
	const store = await getGraphStore();
	// Find the comment row + its key
	let foundKey: Buffer | null = null;
	let cur: TodoCommentRow | null = null;
	for (const { key, value } of store.todoComment.getRange()) {
		const row = decodeTodoCommentRow(value as Buffer);
		if (row.id === commentId) {
			foundKey = key as Buffer;
			cur = row;
			break;
		}
	}
	if (cur === null || foundKey === null) {
		throw new Error(`updateComment: comment '${commentId}' does not exist`);
	}

	let mutated = false;
	const next: TodoCommentRow = { ...cur };
	if (fields.body !== undefined) { next.body = fields.body; mutated = true; }
	if (fields.editedAt !== undefined) { next.editedAt = parseTs(fields.editedAt); mutated = true; }
	if (fields.agentAcknowledged !== undefined) { next.agentAcknowledged = fields.agentAcknowledged; mutated = true; }
	if (!mutated) return rowToComment(cur);

	await withWriteTxn(s => {
		s.todoComment.put(foundKey as Buffer, encodeTodoCommentRow(next));
	});
	return rowToComment(next);
}

export async function deleteComment(_db: DbClient, commentId: string): Promise<void> {
	const store = await getGraphStore();
	let foundKey: Buffer | null = null;
	for (const { key, value } of store.todoComment.getRange()) {
		const row = decodeTodoCommentRow(value as Buffer);
		if (row.id === commentId) { foundKey = key as Buffer; break; }
	}
	if (foundKey === null) return;
	await withWriteTxn(s => { s.todoComment.remove(foundKey as Buffer); });
}

export async function listCommentsForItem(
	_db: DbClient,
	itemId: string,
): Promise<readonly TodoComment[]> {
	const store = await getGraphStore();
	const prefix = encodeTodoCommentPrefix(itemId);
	const succ = prefixSuccessor(prefix);
	const rows: TodoCommentRow[] = [];
	for (const { value } of store.todoComment.getRange({ start: prefix, end: succ })) {
		rows.push(decodeTodoCommentRow(value as Buffer));
	}
	rows.sort((a, b) => a.createdAt - b.createdAt);
	return rows.map(rowToComment);
}

// ---------------------------------------------------------------------------
// Deletes
// ---------------------------------------------------------------------------

export async function deleteItem(_db: DbClient, itemId: string): Promise<void> {
	await withWriteTxn(s => {
		// Drop all comments on the item
		const prefix = encodeTodoCommentPrefix(itemId);
		const succ = prefixSuccessor(prefix);
		const commentKeys: Buffer[] = [];
		for (const { key } of s.todoComment.getRange({ start: prefix, end: succ })) {
			commentKeys.push(key as Buffer);
		}
		for (const k of commentKeys) s.todoComment.remove(k);
		s.todoItem.remove(itemId);
	});
}

export async function deleteList(_db: DbClient, listId: string): Promise<void> {
	const store = await getGraphStore();
	// Collect item ids belonging to this list
	const itemIds: string[] = [];
	for (const { value } of store.todoItem.getRange()) {
		const row = decodeTodoItemRow(value as Buffer);
		if (row.listId === listId) itemIds.push(row.id);
	}

	// Get the session_id so we can clean the by_session index
	const buf = store.todoList.get(listId);
	const sessionId = buf !== undefined ? decodeTodoListRow(buf as Buffer).sessionId : null;

	await withWriteTxn(s => {
		for (const itemId of itemIds) {
			const prefix = encodeTodoCommentPrefix(itemId);
			const succ = prefixSuccessor(prefix);
			const commentKeys: Buffer[] = [];
			for (const { key } of s.todoComment.getRange({ start: prefix, end: succ })) {
				commentKeys.push(key as Buffer);
			}
			for (const k of commentKeys) s.todoComment.remove(k);
			s.todoItem.remove(itemId);
		}
		s.todoList.remove(listId);
		if (sessionId !== null) {
			s.todoListBySession.remove(
				encodeTodoListBySessionKey(sessionId, listId),
				Buffer.alloc(0),
			);
		}
	});
}

export async function deleteListsBySession(_db: DbClient, sessionId: string): Promise<number> {
	const lists = await listListsBySession(_db, sessionId, { includeArchived: true });
	for (const list of lists) {
		await deleteList(_db, list.id);
	}
	return lists.length;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function rowToList(row: TodoListRow, items: readonly TodoItem[]): TodoList {
	return {
		id:           row.id,
		sessionId:    row.sessionId,
		...(row.parentListId !== '' ? { parentListId: row.parentListId } : {}),
		title:        row.title,
		...(row.description !== '' ? { description: row.description } : {}),
		status:       row.status,
		owner:        row.owner,
		source:       row.source,
		transfers:    row.transfers,
		...(row.body !== '' ? { body: row.body } : {}),
		createdAt:    formatTs(row.createdAt),
		updatedAt:    formatTs(row.updatedAt),
		items,
	};
}

function rowToItem(row: TodoItemRow, comments: readonly TodoComment[] | undefined): TodoItem {
	return {
		id:            row.id,
		listId:        row.listId,
		title:         row.title,
		...(row.description !== '' ? { description: row.description } : {}),
		status:        row.status,
		order:         row.order,
		createdAt:     formatTs(row.createdAt),
		updatedAt:     formatTs(row.updatedAt),
		...(row.completedAt > 0 ? { completedAt: formatTs(row.completedAt) } : {}),
		...(row.blockedReason !== '' ? { blockedReason: row.blockedReason } : {}),
		...(row.tags.length > 0 ? { tags: row.tags } : {}),
		...(Object.keys(row.meta).length > 0 ? { meta: row.meta } : {}),
		...(comments !== undefined ? { comments } : {}),
	};
}

function rowToComment(row: TodoCommentRow): TodoComment {
	return {
		id:                 row.id,
		itemId:             row.itemId,
		author:             row.author,
		body:               row.body,
		createdAt:          formatTs(row.createdAt),
		...(row.editedAt > 0 ? { editedAt: formatTs(row.editedAt) } : {}),
		agentAcknowledged:  row.agentAcknowledged,
	};
}

function parseTs(s: string | undefined): number {
	if (s === undefined || s === '') return 0;
	const n = Date.parse(s);
	return Number.isFinite(n) ? n : 0;
}

function formatTs(ms: number): string {
	if (ms === 0) return '';
	return new Date(ms).toISOString();
}
