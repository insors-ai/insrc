/**
 * Daemon RPC surface for the session-scoped TODO framework (Phase 2).
 *
 * Exposes the `todos.*` wire API used by the browser service
 * (IInsrcTodosService, Phase 4). Agents consume the same data via
 * `deps.todos` (Phase 3) which talks directly to `db/todos.ts` --
 * this module is the browser's only entry point.
 *
 * Authorization rules (see plans/todo-framework.md "Ownership +
 * authorization"):
 *
 *   - `'user'` (default when no caller supplied)
 *     * Read everything, mutate nothing. Every list-mutation RPC
 *       responds with `{ error: 'owner_mismatch', list }`.
 *     * Comments (Phase 5d) are the one user write channel; those
 *       handlers land later.
 *
 *   - `'system'`
 *     * Reserved for daemon-internal maintenance (retention job,
 *       `agent.discard` sweep). Can only call `todos.cleanup` --
 *       list-mutation rejects with `system_cannot_write_lists`.
 *
 *   - `<AgentFamily>` (brainstorm, implementation, ...)
 *     * May mutate lists where `owner === caller`. Other lists
 *       respond with `owner_mismatch`. Agents don't normally reach
 *       this module -- they go through `deps.todos` instead -- but
 *       the check lives here so the wire surface is safe even if
 *       something ever invokes it with an agent caller.
 *
 * Stream events: every successful mutation (and every delete from
 * `cleanup`) posts a `TodoStreamEvent` to an in-process bus.
 * Subscribers (the `todos.subscribe` streaming handler) flush these
 * to listening sockets. There is no cross-process broadcast --
 * daemon-internal bus only.
 */

import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { IpcStreamMessage } from '../shared/types.js';
import type { DbClient } from '../db/client.js';
import type {
	TodoCleanupQuery, TodoComment, TodoInvocationResponseItem,
	TodoInvocationResult, TodoItem, TodoItemStatus, TodoList,
	TodoListStatus, TodoOwner, TodoSnapshot, TodoStreamEvent,
	TodoStreamEventKind,
} from '../shared/todos.js';
import { TODO_LIMITS, betweenOrderKeys } from '../shared/todos.js';
import { isAgentFamily } from '../shared/agent-registry.js';
import * as todos from '../db/todos.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('todos-rpc');

// ---------------------------------------------------------------------------
// Caller identity
// ---------------------------------------------------------------------------

/**
 * RPC caller identity. Optional on every request: the default when
 * absent is `'user'` (the browser). Agent-internal call sites pass
 * their family id; daemon maintenance passes `'system'`.
 */
export type TodoCaller = TodoOwner | 'user';

function resolveCaller(params: unknown): TodoCaller {
	if (params === null || typeof params !== 'object') return 'user';
	const c = (params as Record<string, unknown>)['caller'];
	if (typeof c !== 'string') return 'user';
	if (c === 'user' || c === 'system' || isAgentFamily(c)) return c;
	// Unknown -- default to user (read-only). Safer than accepting an
	// arbitrary string as an authenticated identity.
	return 'user';
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

interface OwnerMismatchError {
	readonly error: 'owner_mismatch';
	readonly list: TodoList;
}

interface UserCannotWriteError {
	readonly error: 'user_cannot_write_lists';
}

interface SystemCannotWriteError {
	readonly error: 'system_cannot_write_lists';
}

interface ListFullError {
	readonly error: 'list_full';
	readonly list: TodoList;
}

interface SessionFullError {
	readonly error: 'session_full';
}

interface FieldTooLargeError {
	readonly error: 'field_too_large';
	readonly field: string;
	readonly limit: number;
}

interface ValidationError {
	readonly error: 'invalid_cleanup_query' | 'invalid_owner' | 'invalid_status'
	| 'invalid_transition' | 'invalid_parent' | 'invalid_ids';
	readonly reason: string;
}

export type TodosRpcError =
	| OwnerMismatchError | UserCannotWriteError | SystemCannotWriteError
	| ListFullError | SessionFullError | FieldTooLargeError | ValidationError;

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------

const bus = new EventEmitter();
bus.setMaxListeners(0);  // UI + tests can subscribe freely

function emit(kind: TodoStreamEventKind, list: TodoList): void {
	const event: TodoStreamEvent = { kind, list };
	bus.emit('event', event);
}

/**
 * Post a todos stream event to the in-process bus. Re-exported so
 * the in-process `TodosApi` ([daemon/todos-api.ts](./todos-api.ts))
 * can emit from its own mutation paths without reaching into the
 * RPC layer. Subscribers (the `todos.subscribe` streaming handler,
 * future daemon-side retention diagnostics) receive events from
 * either origin uniformly.
 */
export function emitTodosEvent(kind: TodoStreamEventKind, list: TodoList): void {
	emit(kind, list);
}

/** Subscribe to the in-process todos event bus. Returns a disposer. */
export function subscribeToTodosBus(
	handler: (event: TodoStreamEvent) => void,
): () => void {
	const wrapped = (event: TodoStreamEvent): void => handler(event);
	bus.on('event', wrapped);
	return () => bus.off('event', wrapped);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
	return randomBytes(16).toString('hex');
}

function nowIso(): string {
	return new Date().toISOString();
}

function enforceBodyLimit(body: string | undefined, field: string, limit: number): FieldTooLargeError | null {
	if (body === undefined) return null;
	if (Buffer.byteLength(body, 'utf8') > limit) {
		return { error: 'field_too_large', field, limit };
	}
	return null;
}

/** Normalise unknown -> TodoListStatus[] with best-effort validation. */
function parseStatusArray(raw: unknown, kind: 'list' | 'item'): string[] | ValidationError {
	if (!Array.isArray(raw)) {
		return { error: 'invalid_status', reason: `expected array of ${kind} status, got ${typeof raw}` };
	}
	const out: string[] = [];
	const valid = kind === 'list'
		? new Set<string>(['active', 'completed', 'archived'])
		: new Set<string>(['pending', 'in_progress', 'blocked', 'completed', 'cancelled']);
	for (const v of raw) {
		if (typeof v !== 'string' || !valid.has(v)) {
			return { error: 'invalid_status', reason: `unknown ${kind} status '${String(v)}'` };
		}
		out.push(v);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Authorization primitives
// ---------------------------------------------------------------------------

/**
 * Guard a list-mutation RPC. Returns an error value to respond with,
 * or `null` if the caller is allowed to mutate the given list.
 * Reads the list up front so the error response can carry a fresh
 * snapshot.
 */
async function guardListMutation(
	db: DbClient,
	listId: string,
	caller: TodoCaller,
): Promise<{ list: TodoList; error: null } | { list: null; error: TodosRpcError }> {
	const list = await todos.getList(db, listId, { withItems: true });
	if (list === null) {
		return { list: null, error: { error: 'invalid_ids', reason: `list '${listId}' does not exist` } };
	}
	if (caller === 'system') {
		// `system` is allowed to cleanup but not to mutate list contents.
		return { list: null, error: { error: 'system_cannot_write_lists' } };
	}
	// `'user'` writes user-owned lists; agent families write their own.
	// Any mismatch returns owner_mismatch.
	if (list.owner !== caller) {
		return { list: null, error: { error: 'owner_mismatch', list } };
	}
	return { list, error: null };
}

async function guardListCreation(
	caller: TodoCaller,
	requestedOwner: TodoOwner,
): Promise<{ ok: true } | { ok: false; error: TodosRpcError }> {
	if (caller === 'system' && requestedOwner !== 'system') {
		// `system` may seed system-owned lists only.
		return { ok: false, error: { error: 'invalid_owner', reason: `system may only create system-owned lists` } };
	}
	// User can only create user-owned lists; agent families only lists
	// they own; system only system-owned (handled above).
	if (caller !== 'system' && requestedOwner !== caller) {
		return { ok: false, error: { error: 'invalid_owner', reason: `caller '${caller}' may not seed lists owned by '${requestedOwner}'` } };
	}
	// Owner must be a valid TodoOwner (agent family or 'user').
	const { isValidTodoOwner } = await import('../shared/todos.js');
	if (!isValidTodoOwner(requestedOwner)) {
		return { ok: false, error: { error: 'invalid_owner', reason: `unknown owner '${requestedOwner}'` } };
	}
	return { ok: true };
}

// ---------------------------------------------------------------------------
// RPC: read
// ---------------------------------------------------------------------------

export async function listForSession(db: DbClient, params: unknown): Promise<readonly TodoList[]> {
	const caller = resolveCaller(params);
	const { sessionId, includeArchived } =
		(params ?? {}) as { sessionId?: string; includeArchived?: boolean };
	if (typeof sessionId !== 'string' || sessionId.length === 0) {
		throw new Error('todos.listForSession: sessionId is required');
	}
	const opts: { includeArchived?: boolean } = {};
	if (includeArchived !== undefined) opts.includeArchived = includeArchived;
	const all = await todos.listListsBySession(db, sessionId, opts);
	// Agent families never see user-owned lists (Phase 9). 'user' and
	// 'system' see everything.
	if (caller !== 'user' && caller !== 'system') {
		return all.filter(list => list.owner !== 'user');
	}
	return all;
}

// ---------------------------------------------------------------------------
// RPC: create
// ---------------------------------------------------------------------------

export async function create(db: DbClient, params: unknown): Promise<TodoList | TodosRpcError> {
	const p = (params ?? {}) as Record<string, unknown>;
	const caller = resolveCaller(params);
	const sessionId = p['sessionId'];
	const title = p['title'];
	const ownerRaw = p['owner'] ?? (caller !== 'user' ? caller : undefined);
	const description = p['description'];
	const body = p['body'];
	const parentListId = p['parentListId'];
	const seedItems = p['items'];

	if (typeof sessionId !== 'string' || sessionId.length === 0) {
		return { error: 'invalid_ids', reason: 'sessionId is required' };
	}
	if (typeof title !== 'string' || title.length === 0) {
		return { error: 'invalid_ids', reason: 'title is required' };
	}
	if (typeof ownerRaw !== 'string') {
		return { error: 'invalid_owner', reason: 'owner is required' };
	}
	const owner = ownerRaw as TodoOwner;

	const guard = await guardListCreation(caller, owner);
	if (!guard.ok) return guard.error;

	if (description !== undefined && typeof description !== 'string') {
		return { error: 'invalid_ids', reason: 'description must be string' };
	}
	if (body !== undefined && typeof body !== 'string') {
		return { error: 'invalid_ids', reason: 'body must be string' };
	}
	const bodyErr = enforceBodyLimit(
		typeof body === 'string' ? body : undefined,
		'body', TODO_LIMITS.MAX_LIST_BODY_BYTES,
	);
	if (bodyErr !== null) return bodyErr;

	// Session list cap.
	const existing = await todos.listListsBySession(db, sessionId, { includeArchived: true });
	if (existing.length >= TODO_LIMITS.MAX_LISTS_PER_SESSION) {
		return { error: 'session_full' };
	}

	const id = generateId();
	const createdAt = nowIso();
	const opts: todos.InsertListOpts = {
		id,
		sessionId,
		title,
		owner,
		source: owner,
		createdAt,
		...(typeof description === 'string' ? { description } : {}),
		...(typeof body === 'string' ? { body } : {}),
		...(typeof parentListId === 'string' ? { parentListId } : {}),
	};

	let list: TodoList;
	try {
		list = await todos.insertList(db, opts);
	} catch (err) {
		return { error: 'invalid_parent', reason: (err as Error).message };
	}

	// Seed items, if provided.
	if (Array.isArray(seedItems) && seedItems.length > 0) {
		if (seedItems.length > TODO_LIMITS.MAX_ITEMS_PER_LIST) {
			// Roll back by deleting the freshly-created list.
			await todos.deleteList(db, id);
			return { error: 'list_full', list };
		}
		let orderCursor = 0;
		for (const raw of seedItems) {
			const ri = (raw ?? {}) as Record<string, unknown>;
			const iTitle = ri['title'];
			if (typeof iTitle !== 'string' || iTitle.length === 0) continue;
			const iDescription = ri['description'];
			const iTags = Array.isArray(ri['tags']) ? (ri['tags'] as unknown[]).filter(t => typeof t === 'string') as string[] : undefined;
			const iMeta = (ri['meta'] !== undefined && typeof ri['meta'] === 'object' && ri['meta'] !== null)
				? (ri['meta'] as Record<string, unknown>)
				: undefined;
			const insertOpts: todos.InsertItemOpts = {
				id: generateId(),
				listId: id,
				title: iTitle,
				orderKey: orderCursor++,
				createdAt,
				...(typeof iDescription === 'string' ? { description: iDescription } : {}),
				...(iTags !== undefined ? { tags: iTags } : {}),
				...(iMeta !== undefined ? { meta: iMeta } : {}),
			};
			await todos.insertItem(db, insertOpts);
		}
		const reloaded = await todos.getList(db, id);
		if (reloaded !== null) list = reloaded;
	}

	emit('listCreated', list);
	return list;
}

// ---------------------------------------------------------------------------
// RPC: update (list fields)
// ---------------------------------------------------------------------------

export async function update(db: DbClient, params: unknown): Promise<TodoList | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const listId = p['listId'];
	const patch = (p['patch'] ?? {}) as Record<string, unknown>;
	if (typeof listId !== 'string') {
		return { error: 'invalid_ids', reason: 'listId is required' };
	}

	const guard = await guardListMutation(db, listId, caller);
	if (guard.error !== null) return guard.error;

	const fields: todos.UpdateListFields = {
		...(typeof patch['title'] === 'string' ? { title: patch['title'] as string } : {}),
		...(typeof patch['description'] === 'string' ? { description: patch['description'] as string } : {}),
		...(typeof patch['status'] === 'string' ? { status: patch['status'] as TodoListStatus } : {}),
		...(typeof patch['body'] === 'string' ? { body: patch['body'] as string } : {}),
	};

	const bodyErr = enforceBodyLimit(fields.body, 'body', TODO_LIMITS.MAX_LIST_BODY_BYTES);
	if (bodyErr !== null) return bodyErr;

	let updated: TodoList;
	try {
		updated = await todos.updateList(db, listId, fields, nowIso());
	} catch (err) {
		return { error: 'invalid_transition', reason: (err as Error).message };
	}
	emit('listUpdated', updated);
	return updated;
}

// ---------------------------------------------------------------------------
// RPC: archive / unarchive
// ---------------------------------------------------------------------------

export async function archive(db: DbClient, params: unknown): Promise<TodoList | TodosRpcError> {
	return applyListStatus(db, params, 'archived', 'listArchived');
}

export async function unarchive(db: DbClient, params: unknown): Promise<TodoList | TodosRpcError> {
	return applyListStatus(db, params, 'active', 'listUpdated');
}

async function applyListStatus(
	db: DbClient,
	params: unknown,
	to: TodoListStatus,
	eventKind: TodoStreamEventKind,
): Promise<TodoList | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const listId = p['listId'];
	if (typeof listId !== 'string') {
		return { error: 'invalid_ids', reason: 'listId is required' };
	}
	const guard = await guardListMutation(db, listId, caller);
	if (guard.error !== null) return guard.error;

	let updated: TodoList;
	try {
		updated = await todos.updateList(db, listId, { status: to }, nowIso());
	} catch (err) {
		return { error: 'invalid_transition', reason: (err as Error).message };
	}
	emit(eventKind, updated);
	return updated;
}

// ---------------------------------------------------------------------------
// RPC: transfer / reparent
// ---------------------------------------------------------------------------

export async function transfer(db: DbClient, params: unknown): Promise<TodoList | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const listId = p['listId'];
	const to = p['to'];
	const reason = p['reason'];
	if (typeof listId !== 'string' || typeof to !== 'string' || typeof reason !== 'string') {
		return { error: 'invalid_ids', reason: 'listId, to, and reason are required' };
	}
	if (!isAgentFamily(to)) {
		return { error: 'invalid_owner', reason: `unknown target family '${to}'` };
	}
	const guard = await guardListMutation(db, listId, caller);
	if (guard.error !== null) return guard.error;

	const updated = await todos.transferList(db, listId, to as TodoOwner, reason, nowIso(), caller === 'user' ? undefined : caller);
	emit('listUpdated', updated);
	return updated;
}

export async function reparent(db: DbClient, params: unknown): Promise<TodoList | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const listId = p['listId'];
	const newParentRaw = p['newParentListId'];
	if (typeof listId !== 'string') {
		return { error: 'invalid_ids', reason: 'listId is required' };
	}
	const newParent: string | null =
		newParentRaw === null ? null : (typeof newParentRaw === 'string' ? newParentRaw : null);
	const guard = await guardListMutation(db, listId, caller);
	if (guard.error !== null) return guard.error;

	let updated: TodoList;
	try {
		updated = await todos.reparentList(db, listId, newParent, nowIso());
	} catch (err) {
		return { error: 'invalid_parent', reason: (err as Error).message };
	}
	emit('listUpdated', updated);
	return updated;
}

// ---------------------------------------------------------------------------
// RPC: items
// ---------------------------------------------------------------------------

export async function addItem(db: DbClient, params: unknown): Promise<TodoItem | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const listId = p['listId'];
	const title = p['title'];
	const description = p['description'];
	const insertAfterItemId = p['insertAfterItemId'];
	const tags = Array.isArray(p['tags']) ? (p['tags'] as unknown[]).filter(t => typeof t === 'string') as string[] : undefined;
	const meta = (p['meta'] !== undefined && typeof p['meta'] === 'object' && p['meta'] !== null)
		? (p['meta'] as Record<string, unknown>)
		: undefined;

	if (typeof listId !== 'string' || typeof title !== 'string') {
		return { error: 'invalid_ids', reason: 'listId and title are required' };
	}
	if (description !== undefined && typeof description !== 'string') {
		return { error: 'invalid_ids', reason: 'description must be string' };
	}
	const descErr = enforceBodyLimit(
		typeof description === 'string' ? description : undefined,
		'description', TODO_LIMITS.MAX_ITEM_DESCRIPTION_BYTES,
	);
	if (descErr !== null) return descErr;

	const guard = await guardListMutation(db, listId, caller);
	if (guard.error !== null) return guard.error;

	const existing = await todos.listItems(db, listId, false);
	if (existing.length >= TODO_LIMITS.MAX_ITEMS_PER_LIST) {
		return { error: 'list_full', list: guard.list };
	}

	// Compute fractional order key.
	let orderKey: number;
	if (typeof insertAfterItemId === 'string') {
		const idx = existing.findIndex(it => it.id === insertAfterItemId);
		if (idx < 0) {
			return { error: 'invalid_ids', reason: `insertAfterItemId '${insertAfterItemId}' not found in list` };
		}
		const prev = existing[idx]!.order;
		const next = idx + 1 < existing.length ? existing[idx + 1]!.order : undefined;
		orderKey = betweenOrderKeys(prev, next);
	} else {
		const last = existing.length > 0 ? existing[existing.length - 1]!.order : undefined;
		orderKey = betweenOrderKeys(last, undefined);
	}

	const insertOpts: todos.InsertItemOpts = {
		id: generateId(),
		listId,
		title,
		orderKey,
		createdAt: nowIso(),
		...(typeof description === 'string' ? { description } : {}),
		...(tags !== undefined ? { tags } : {}),
		...(meta !== undefined ? { meta } : {}),
	};
	const item = await todos.insertItem(db, insertOpts);
	const list = await todos.getList(db, listId);
	if (list !== null) emit('itemCreated', list);
	return item;
}

export async function updateItem(db: DbClient, params: unknown): Promise<TodoItem | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const itemId = p['itemId'];
	const patch = (p['patch'] ?? {}) as Record<string, unknown>;
	if (typeof itemId !== 'string') {
		return { error: 'invalid_ids', reason: 'itemId is required' };
	}

	const existingItem = await todos.getItem(db, itemId);
	if (existingItem === null) {
		return { error: 'invalid_ids', reason: `item '${itemId}' does not exist` };
	}
	const guard = await guardListMutation(db, existingItem.listId, caller);
	if (guard.error !== null) return guard.error;

	const descErr = enforceBodyLimit(
		typeof patch['description'] === 'string' ? patch['description'] as string : undefined,
		'description', TODO_LIMITS.MAX_ITEM_DESCRIPTION_BYTES,
	);
	if (descErr !== null) return descErr;

	const fields: todos.UpdateItemFields = {
		...(typeof patch['title'] === 'string' ? { title: patch['title'] as string } : {}),
		...(typeof patch['description'] === 'string' ? { description: patch['description'] as string } : {}),
		...(typeof patch['status'] === 'string' ? { status: patch['status'] as TodoItemStatus } : {}),
		...(typeof patch['blockedReason'] === 'string' ? { blockedReason: patch['blockedReason'] as string } : {}),
		...(Array.isArray(patch['tags']) ? { tags: (patch['tags'] as unknown[]).filter(t => typeof t === 'string') as string[] } : {}),
		...(patch['meta'] !== undefined && typeof patch['meta'] === 'object' && patch['meta'] !== null
			? { meta: patch['meta'] as Record<string, unknown> }
			: {}),
	};

	let updated: TodoItem;
	try {
		updated = await todos.updateItem(db, itemId, fields, nowIso());
	} catch (err) {
		return { error: 'invalid_transition', reason: (err as Error).message };
	}
	const list = await todos.getList(db, existingItem.listId);
	if (list !== null) emit('itemUpdated', list);

	// Auto-flip list to 'completed' when every item terminal.
	await maybeAutoCompleteList(db, existingItem.listId);

	return updated;
}

export async function reorderItem(db: DbClient, params: unknown): Promise<TodoItem | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const itemId = p['itemId'];
	const after = p['insertAfterItemId'];
	if (typeof itemId !== 'string') {
		return { error: 'invalid_ids', reason: 'itemId is required' };
	}
	const existing = await todos.getItem(db, itemId);
	if (existing === null) {
		return { error: 'invalid_ids', reason: `item '${itemId}' does not exist` };
	}
	const guard = await guardListMutation(db, existing.listId, caller);
	if (guard.error !== null) return guard.error;

	const siblings = (await todos.listItems(db, existing.listId, false)).filter(it => it.id !== itemId);
	let orderKey: number;
	if (after === null || after === undefined) {
		// Move to front
		const first = siblings.length > 0 ? siblings[0]!.order : undefined;
		orderKey = betweenOrderKeys(undefined, first);
	} else if (typeof after === 'string') {
		const idx = siblings.findIndex(it => it.id === after);
		if (idx < 0) {
			return { error: 'invalid_ids', reason: `insertAfterItemId '${after}' not found in list` };
		}
		const prev = siblings[idx]!.order;
		const next = idx + 1 < siblings.length ? siblings[idx + 1]!.order : undefined;
		orderKey = betweenOrderKeys(prev, next);
	} else {
		return { error: 'invalid_ids', reason: 'insertAfterItemId must be string or null' };
	}

	const updated = await todos.updateItem(db, itemId, { orderKey }, nowIso());
	const list = await todos.getList(db, existing.listId);
	if (list !== null) emit('itemUpdated', list);
	return updated;
}

export async function removeItem(db: DbClient, params: unknown): Promise<{ ok: true } | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const itemId = p['itemId'];
	if (typeof itemId !== 'string') {
		return { error: 'invalid_ids', reason: 'itemId is required' };
	}
	const existing = await todos.getItem(db, itemId);
	if (existing === null) {
		return { error: 'invalid_ids', reason: `item '${itemId}' does not exist` };
	}
	const guard = await guardListMutation(db, existing.listId, caller);
	if (guard.error !== null) return guard.error;

	await todos.deleteItem(db, itemId);
	const list = await todos.getList(db, existing.listId);
	if (list !== null) emit('itemRemoved', list);
	return { ok: true };
}

export async function clearCompleted(db: DbClient, params: unknown): Promise<TodoList | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const listId = p['listId'];
	if (typeof listId !== 'string') {
		return { error: 'invalid_ids', reason: 'listId is required' };
	}
	const guard = await guardListMutation(db, listId, caller);
	if (guard.error !== null) return guard.error;

	for (const item of guard.list.items) {
		if (item.status === 'completed' || item.status === 'cancelled') {
			await todos.deleteItem(db, item.id);
		}
	}
	const refreshed = await todos.getList(db, listId);
	if (refreshed === null) {
		return { error: 'invalid_ids', reason: `list '${listId}' vanished during clearCompleted` };
	}
	emit('listUpdated', refreshed);
	return refreshed;
}

async function maybeAutoCompleteList(db: DbClient, listId: string): Promise<void> {
	const list = await todos.getList(db, listId);
	if (list === null) return;
	if (list.items.length === 0) return;
	if (list.status !== 'active') return;
	const allTerminal = list.items.every(it => it.status === 'completed' || it.status === 'cancelled');
	if (!allTerminal) return;
	try {
		const updated = await todos.updateList(db, listId, { status: 'completed' }, nowIso());
		emit('listUpdated', updated);
	} catch {
		// transition rejected -- leave as-is
	}
}

// ---------------------------------------------------------------------------
// RPC: cleanup (system-only / discard)
// ---------------------------------------------------------------------------

export async function cleanup(
	db: DbClient,
	params: unknown,
): Promise<{ deletedListCount: number; deletedItemCount: number; dryRun: boolean } | TodosRpcError> {
	const caller = resolveCaller(params);
	// Only `'system'` may run a broad cleanup. A per-session discard
	// (sessionIds: [id]) is also allowed for any caller -- it's the
	// agent.discard path talking.
	const p = (params ?? {}) as Record<string, unknown>;
	const sessionIdsRaw = p['sessionIds'];
	const sessionIds = Array.isArray(sessionIdsRaw)
		? (sessionIdsRaw.filter(s => typeof s === 'string') as string[])
		: undefined;
	const updatedBefore = typeof p['updatedBefore'] === 'string' ? (p['updatedBefore'] as string) : undefined;
	const olderThanDays = typeof p['olderThanDays'] === 'number' ? (p['olderThanDays'] as number) : undefined;

	const statusesRaw = p['statuses'];
	let statuses: TodoListStatus[] | undefined;
	if (statusesRaw !== undefined) {
		const parsed = parseStatusArray(statusesRaw, 'list');
		if (!Array.isArray(parsed)) return parsed;
		statuses = parsed as TodoListStatus[];
	}

	const sourcesRaw = p['sources'];
	let sources: TodoOwner[] | undefined;
	if (sourcesRaw !== undefined) {
		if (!Array.isArray(sourcesRaw)) {
			return { error: 'invalid_cleanup_query', reason: 'sources must be array' };
		}
		sources = [];
		for (const s of sourcesRaw) {
			if (typeof s !== 'string' || !isAgentFamily(s)) {
				return { error: 'invalid_cleanup_query', reason: `unknown source family '${String(s)}'` };
			}
			sources.push(s);
		}
	}

	const dryRun = typeof p['dryRun'] === 'boolean' ? (p['dryRun'] as boolean) : false;

	// Safety rails:
	// (1) At least one non-empty filter must be present (no delete-everything).
	const hasScope =
		(sessionIds !== undefined && sessionIds.length > 0) ||
		(statuses !== undefined && statuses.length > 0) ||
		(sources !== undefined && sources.length > 0);
	if (!hasScope && updatedBefore === undefined && olderThanDays === undefined) {
		return { error: 'invalid_cleanup_query', reason: 'at least one filter is required' };
	}
	// (2) Age-only query requires at least one scope filter too.
	const isAgeOnly =
		(updatedBefore !== undefined || olderThanDays !== undefined) &&
		!hasScope;
	if (isAgeOnly) {
		return {
			error: 'invalid_cleanup_query',
			reason: 'age-only cleanup is not permitted -- require sessionIds / statuses / sources alongside updatedBefore / olderThanDays',
		};
	}
	// (3) Caller check: non-system callers must scope by sessionIds (the
	// `agent.discard` shape). Everything else is system-only.
	if (caller !== 'system') {
		if (sessionIds === undefined || sessionIds.length === 0) {
			return { error: 'invalid_cleanup_query', reason: 'non-system callers must pass sessionIds' };
		}
		if (statuses !== undefined || sources !== undefined || updatedBefore !== undefined || olderThanDays !== undefined) {
			return { error: 'invalid_cleanup_query', reason: 'non-system callers may only filter by sessionIds' };
		}
	}

	const query: TodoCleanupQuery = {
		...(sessionIds !== undefined ? { sessionIds } : {}),
		...(updatedBefore !== undefined ? { updatedBefore } : {}),
		...(olderThanDays !== undefined ? { olderThanDays } : {}),
		...(statuses !== undefined ? { statuses } : {}),
		...(sources !== undefined ? { sources } : {}),
		dryRun,
	};

	return executeCleanup(db, query);
}

async function executeCleanup(
	db: DbClient,
	query: TodoCleanupQuery,
): Promise<{ deletedListCount: number; deletedItemCount: number; dryRun: boolean }> {
	// Resolve `olderThanDays` into an absolute cutoff (shadow `updatedBefore`).
	const now = Date.now();
	let cutoff: string | undefined;
	if (query.olderThanDays !== undefined) {
		cutoff = new Date(now - query.olderThanDays * 24 * 60 * 60 * 1000).toISOString();
	} else if (query.updatedBefore !== undefined) {
		cutoff = query.updatedBefore;
	}

	// Collect the candidate list set.
	//
	//   - sessionIds given: enumerate by session (fast path for
	//     agent.discard / targeted purge).
	//   - sessionIds absent: table-scan via `listAllLists`, pushing
	//     status / source / updatedBefore into the scan so we don't
	//     load everything into memory just to discard most of it.
	let candidates: readonly TodoList[];
	if (query.sessionIds !== undefined && query.sessionIds.length > 0) {
		const collected: TodoList[] = [];
		for (const sid of query.sessionIds) {
			const lists = await todos.listListsBySession(db, sid, { includeArchived: true });
			collected.push(...lists);
		}
		candidates = collected;
	} else {
		const filter: {
			statuses?: readonly TodoListStatus[];
			sources?: readonly TodoOwner[];
			updatedBefore?: string;
		} = {};
		if (query.statuses !== undefined) filter.statuses = query.statuses;
		if (query.sources !== undefined) filter.sources = query.sources;
		if (cutoff !== undefined) filter.updatedBefore = cutoff;
		candidates = await todos.listAllLists(db, filter);
	}

	const matching = candidates.filter(list => {
		if (query.statuses !== undefined && query.statuses.length > 0 && !query.statuses.includes(list.status)) {
			return false;
		}
		if (query.sources !== undefined && query.sources.length > 0 && !query.sources.includes(list.source)) {
			return false;
		}
		if (cutoff !== undefined && list.updatedAt >= cutoff) {
			return false;
		}
		return true;
	});

	let deletedItemCount = 0;
	for (const list of matching) {
		deletedItemCount += list.items.length;
	}

	if (query.dryRun === true) {
		return {
			deletedListCount: matching.length,
			deletedItemCount,
			dryRun: true,
		};
	}

	for (const list of matching) {
		await todos.deleteList(db, list.id);
		emit('listDeleted', list);
	}

	return {
		deletedListCount: matching.length,
		deletedItemCount,
		dryRun: false,
	};
}

// ---------------------------------------------------------------------------
// RPC: deleteList (proper delete, distinct from archive)
// ---------------------------------------------------------------------------

/**
 * Permanently delete a list and every item + comment it owns. The
 * `'system'` caller is rejected here because broad deletions should
 * go through `cleanup` (which has the safety rails); this RPC is
 * for targeted owner-driven deletes (user wanting to remove a draft
 * list from the notepad; agent wanting to drop its own tracking
 * list after a run finishes).
 *
 * Emits `listDeleted` so the inline chat widget, runs-sidebar pill,
 * and editor panes prune their caches. Returns `{ ok: true }` on
 * success.
 */
export async function deleteList(
	db: DbClient,
	params: unknown,
): Promise<{ ok: true } | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const listId = p['listId'];
	if (typeof listId !== 'string') {
		return { error: 'invalid_ids', reason: 'listId is required' };
	}
	if (caller === 'system') {
		return { error: 'system_cannot_write_lists' };
	}
	const guard = await guardListMutation(db, listId, caller);
	if (guard.error !== null) { return guard.error; }

	// Snapshot for the stream event before the row disappears.
	const snapshot = guard.list;
	await todos.deleteList(db, listId);
	emit('listDeleted', snapshot);
	return { ok: true };
}

// ---------------------------------------------------------------------------
// RPC: comments (Phase 5d)
// ---------------------------------------------------------------------------

interface CommentAuthorError {
	readonly error: 'comment_author_mismatch';
}

interface CommentNotOwnerError {
	readonly error: 'comment_ack_not_owner';
}

type CommentRpcError = TodosRpcError | CommentAuthorError | CommentNotOwnerError;

/**
 * Resolve the parent list of an item id. Returns `null` when the item
 * doesn't exist. Used to scope comment mutations to a readable list
 * and to emit stream events keyed by list id.
 */
async function loadListForItem(
	db: DbClient,
	itemId: string,
): Promise<TodoList | null> {
	const item = await todos.getItem(db, itemId);
	if (item === null) { return null; }
	return todos.getList(db, item.listId);
}

export async function addComment(
	db: DbClient,
	params: unknown,
): Promise<TodoComment | CommentRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const itemId = p['itemId'];
	const body = p['body'];
	if (typeof itemId !== 'string' || typeof body !== 'string') {
		return { error: 'invalid_ids', reason: 'itemId and body are required' };
	}
	const tooLarge = enforceBodyLimit(body, 'body', TODO_LIMITS.MAX_COMMENT_BODY_BYTES);
	if (tooLarge !== null) { return tooLarge; }

	const list = await loadListForItem(db, itemId);
	if (list === null) {
		return { error: 'invalid_ids', reason: `item '${itemId}' does not exist` };
	}

	// `addComment` is the one channel open to the user -- authorisation
	// is just "can this caller read the list", which everyone on the
	// session can. Unknown callers default to 'user' via resolveCaller.
	const author: TodoOwner | 'user' = caller;
	const nowTs = nowIso();
	const id = generateId();
	const comment = await todos.insertComment(db, {
		id,
		itemId,
		author,
		body,
		createdAt: nowTs,
	});

	const refreshed = await todos.getList(db, list.id);
	if (refreshed !== null) { emit('commentAdded', refreshed); }
	return comment;
}

export async function editComment(
	db: DbClient,
	params: unknown,
): Promise<TodoComment | CommentRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const commentId = p['commentId'];
	const body = p['body'];
	if (typeof commentId !== 'string' || typeof body !== 'string') {
		return { error: 'invalid_ids', reason: 'commentId and body are required' };
	}
	const tooLarge = enforceBodyLimit(body, 'body', TODO_LIMITS.MAX_COMMENT_BODY_BYTES);
	if (tooLarge !== null) { return tooLarge; }

	const existing = await todos.getComment(db, commentId);
	if (existing === null) {
		return { error: 'invalid_ids', reason: `comment '${commentId}' does not exist` };
	}
	if (existing.author !== caller) {
		return { error: 'comment_author_mismatch' };
	}

	const nowTs = nowIso();
	const updated = await todos.updateComment(db, commentId, { body, editedAt: nowTs });
	const list = await loadListForItem(db, existing.itemId);
	if (list !== null) { emit('commentUpdated', list); }
	return updated;
}

export async function deleteCommentRpc(
	db: DbClient,
	params: unknown,
): Promise<{ ok: true } | CommentRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const commentId = p['commentId'];
	if (typeof commentId !== 'string') {
		return { error: 'invalid_ids', reason: 'commentId is required' };
	}
	const existing = await todos.getComment(db, commentId);
	if (existing === null) {
		return { error: 'invalid_ids', reason: `comment '${commentId}' does not exist` };
	}
	if (existing.author !== caller) {
		return { error: 'comment_author_mismatch' };
	}
	await todos.deleteComment(db, commentId);
	const list = await loadListForItem(db, existing.itemId);
	if (list !== null) { emit('commentRemoved', list); }
	return { ok: true };
}

export async function ackComment(
	db: DbClient,
	params: unknown,
): Promise<TodoComment | CommentRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const commentId = p['commentId'];
	if (typeof commentId !== 'string') {
		return { error: 'invalid_ids', reason: 'commentId is required' };
	}
	const existing = await todos.getComment(db, commentId);
	if (existing === null) {
		return { error: 'invalid_ids', reason: `comment '${commentId}' does not exist` };
	}
	const list = await loadListForItem(db, existing.itemId);
	if (list === null) {
		return { error: 'invalid_ids', reason: `parent list for comment '${commentId}' vanished` };
	}
	// Only the current list owner may ack. 'user' and 'system' cannot.
	if (caller === 'user' || caller === 'system' || list.owner !== caller) {
		return { error: 'comment_ack_not_owner' };
	}
	const updated = await todos.updateComment(db, commentId, { agentAcknowledged: true });
	emit('commentUpdated', list);
	return updated;
}

// ---------------------------------------------------------------------------
// RPC: forwardToAgent (withTodo primitive, plans/todo-framework.md Phase 9d)
// ---------------------------------------------------------------------------

/**
 * Forward a set of user-owned TODO snapshots to a target agent
 * family. Kicks off (or will kick off, once per-family consumers
 * land) an agent run whose `input.todos` is the snapshot array.
 *
 * **This phase lands the RPC + types + wire format only.** No
 * existing agent consumes `input.todos` yet; every forward
 * currently returns a placeholder response that flips each
 * source item to `in_progress` with a note indicating the agent
 * hasn't implemented a withTodo handler. Real per-family handlers
 * (planner first, per the plan) land in follow-up work.
 *
 * Ownership constraint: only `'user'` callers may forward. Agent-
 * to-agent forwarding is reserved for a future phase once the
 * user path is stable.
 */
export async function forwardToAgent(
	_db: DbClient,
	params: unknown,
): Promise<TodoInvocationResult | TodosRpcError> {
	const caller = resolveCaller(params);
	const p = (params ?? {}) as Record<string, unknown>;
	const targetFamily = p['targetFamily'];
	const sessionId = p['sessionId'];
	const itemsRaw = p['items'];

	if (typeof targetFamily !== 'string' || !isAgentFamily(targetFamily)) {
		return { error: 'invalid_owner', reason: `unknown target family '${String(targetFamily)}'` };
	}
	if (typeof sessionId !== 'string' || sessionId.length === 0) {
		return { error: 'invalid_ids', reason: 'sessionId is required' };
	}
	if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
		return { error: 'invalid_ids', reason: 'items array is required (at least one TodoSnapshot)' };
	}

	if (caller !== 'user') {
		return { error: 'invalid_owner', reason: 'only user callers may forwardToAgent at this phase' };
	}

	// Validate + normalize each snapshot.
	const snapshots: TodoSnapshot[] = [];
	for (const raw of itemsRaw) {
		if (raw === null || typeof raw !== 'object') {
			return { error: 'invalid_ids', reason: 'each item must be a TodoSnapshot object' };
		}
		const r = raw as Record<string, unknown>;
		const sourceRef = r['sourceRef'];
		const title = r['title'];
		if (typeof sourceRef !== 'string' || sourceRef.length === 0) {
			return { error: 'invalid_ids', reason: 'each item requires sourceRef' };
		}
		if (typeof title !== 'string' || title.length === 0) {
			return { error: 'invalid_ids', reason: 'each item requires title' };
		}
		const snap: TodoSnapshot = {
			sourceRef,
			title,
			...(typeof r['description'] === 'string' ? { description: r['description'] as string } : {}),
			...(Array.isArray(r['tags'])
				? { tags: (r['tags'] as unknown[]).filter(t => typeof t === 'string') as string[] }
				: {}),
			...(r['meta'] !== undefined && typeof r['meta'] === 'object' && r['meta'] !== null
				? { meta: r['meta'] as Record<string, unknown> }
				: {}),
		};
		snapshots.push(snap);
	}

	log.info(
		{ targetFamily, sessionId, snapshotCount: snapshots.length },
		'todos.forwardToAgent: Phase 9d stub -- returning in_progress placeholders (no withTodo consumers wired yet)',
	);

	const responseItems: TodoInvocationResponseItem[] = snapshots.map(snap => ({
		sourceRef: snap.sourceRef,
		status: 'in_progress' satisfies TodoItemStatus,
		note: `Forwarded to '${targetFamily}'. No withTodo handler wired yet; the agent will pick this up once its consumer ships.`,
	}));

	return { items: responseItems };
}

// ---------------------------------------------------------------------------
// RPC: subscribe (streaming)
// ---------------------------------------------------------------------------

/**
 * Streaming handler that holds the socket open and flushes every
 * `TodoStreamEvent` from the in-process bus until the caller cancels
 * (socket close / abort signal).
 */
export async function subscribe(
	_params: unknown,
	send: (msg: IpcStreamMessage) => void,
	signal: AbortSignal,
): Promise<void> {
	if (signal.aborted) return;

	const unsubscribe = subscribeToTodosBus(event => {
		send({ id: 0, stream: 'todos', data: event });
	});

	await new Promise<void>(resolve => {
		if (signal.aborted) { resolve(); return; }
		signal.addEventListener('abort', () => resolve(), { once: true });
	});

	unsubscribe();
	send({ id: 0, stream: 'done', data: {} });
}

// ---------------------------------------------------------------------------
// Retention job scheduler
// ---------------------------------------------------------------------------

/**
 * Schedule the daily retention sweep. Returns a disposer so the
 * daemon's shutdown path can stop the timer cleanly.
 *
 * Default policy: archived lists untouched for 90 days are dropped.
 * `retentionDays` is accepted as an argument so the caller can thread
 * a config value through; defaults to 90 when unset / invalid.
 */
export function scheduleTodosRetention(
	db: DbClient,
	opts: { retentionDays?: number } = {},
): () => void {
	const DAY_MS = 24 * 60 * 60 * 1000;
	const retentionDays = (opts.retentionDays !== undefined && opts.retentionDays > 0)
		? opts.retentionDays
		: 90;

	const run = async (): Promise<void> => {
		try {
			const result = await cleanup(db, {
				caller: 'system',
				statuses: ['archived'],
				olderThanDays: retentionDays,
			});
			if ('error' in result) {
				log.warn({ result }, 'todos retention sweep rejected');
				return;
			}
			if (result.deletedListCount > 0) {
				log.info(result, 'todos retention swept archived lists');
			}
		} catch (err) {
			log.warn({ err }, 'todos retention sweep failed');
		}
	};

	// Fire once at boot (best-effort, async), then every 24 h.
	void run();
	const timer = setInterval(() => void run(), DAY_MS);
	timer.unref();
	return () => clearInterval(timer);
}
