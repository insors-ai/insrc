/**
 * Phase 1.1 smoke test for the LMDB graph store scaffolding.
 *
 * Verifies that:
 *   - The env opens cleanly under a tmpdir path (via `setGraphStorePath`)
 *   - All 19 sub-DBs are accessible
 *   - Each sub-DB accepts a basic put/get round-trip with the
 *     expected key shape (binary buffers per design doc)
 *   - Composite-key encoders produce sortable, decodable keys
 *   - Lifecycle (close + reopen) works
 *   - Concurrent first-callers share the same init promise
 *
 * Phase 1.4 (test path injection via `setGraphStorePath`) is landed
 * alongside 1.1 since 1.1's tests structurally require it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	encodeEntityKey,
	decodeEntityKey,
	encodeRepoKey,
	decodeRepoKey,
	encodeOutEdgeKey,
	encodeInEdgeKey,
	decodeOutEdgeKey,
	decodeInEdgeKey,
	encodeOutEdgePrefix,
	prefixSuccessor,
	encodeNameIndexKey,
	encodePlanStepKey,
	encodePlanStepPrefix,
	encodeConversationTurnKey,
	encodeTodoItemKey,
	encodeTodoItemPrefix,
	encodeConfigByScopeKey,
	encodeConfigByScopePrefix,
	RELATION_KIND_BYTE,
	ENTITY_KIND_BYTE,
	kindByteToName,
	entityKindByteToName,
} from '../keys.js';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../store.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-graph-store-1.1-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Key codec tests (don't require an env)
// ---------------------------------------------------------------------------

test('encodeEntityKey + decode round-trips u64 values including edges', () => {
	for (const v of [0n, 1n, 0x7fffffffffffffffn, 0xffffffffffffffffn]) {
		const buf = encodeEntityKey(v);
		assert.equal(buf.length, 8);
		assert.equal(decodeEntityKey(buf), v);
	}
});

test('encodeRepoKey + decode round-trips u32', () => {
	for (const v of [0, 1, 0x7fffffff, 0xffffffff]) {
		const buf = encodeRepoKey(v);
		assert.equal(buf.length, 4);
		assert.equal(decodeRepoKey(buf), v);
	}
});

test('encodeOutEdgeKey produces 17 bytes; round-trips', () => {
	const buf = encodeOutEdgeKey(42n, RELATION_KIND_BYTE.CALLS, 7n);
	assert.equal(buf.length, 17);
	const dec = decodeOutEdgeKey(buf);
	assert.equal(dec.from, 42n);
	assert.equal(dec.kind, RELATION_KIND_BYTE.CALLS);
	assert.equal(dec.to, 7n);
});

test('encodeInEdgeKey produces 17 bytes; round-trips', () => {
	const buf = encodeInEdgeKey(7n, RELATION_KIND_BYTE.CALLS, 42n);
	assert.equal(buf.length, 17);
	const dec = decodeInEdgeKey(buf);
	assert.equal(dec.to, 7n);
	assert.equal(dec.kind, RELATION_KIND_BYTE.CALLS);
	assert.equal(dec.from, 42n);
});

test('encodeOutEdgePrefix + prefixSuccessor bracket a single (from,kind) range', () => {
	const a = encodeOutEdgeKey(100n, 5, 1n);
	const b = encodeOutEdgeKey(100n, 5, 999n);
	const prefix = encodeOutEdgePrefix(100n, 5);
	const succ = prefixSuccessor(prefix);
	// All edges with this (from,kind) lexicographically lie in [prefix, succ)
	assert.ok(Buffer.compare(prefix, a) <= 0, 'prefix <= a');
	assert.ok(Buffer.compare(b, succ) < 0, 'b < succ');
	// An edge with a different kind falls outside the range
	const otherKind = encodeOutEdgeKey(100n, 6, 1n);
	assert.ok(Buffer.compare(otherKind, succ) >= 0, 'other-kind edge >= succ');
});

test('encodeOutEdgePrefix without kind brackets all kinds for a (from)', () => {
	const a = encodeOutEdgeKey(100n, 0, 0n);
	const b = encodeOutEdgeKey(100n, 0xff, 0xffffffffffffffffn);
	const prefix = encodeOutEdgePrefix(100n);
	const succ = prefixSuccessor(prefix);
	assert.ok(Buffer.compare(prefix, a) <= 0);
	assert.ok(Buffer.compare(b, succ) < 0);
});

test('big-endian u64 key ordering matches numeric ordering', () => {
	const k1 = encodeEntityKey(1n);
	const k2 = encodeEntityKey(2n);
	const k1000 = encodeEntityKey(1000n);
	assert.ok(Buffer.compare(k1, k2) < 0);
	assert.ok(Buffer.compare(k2, k1000) < 0);
});

test('composite name_index key includes repo + kind + name', () => {
	const k = encodeNameIndexKey(7, ENTITY_KIND_BYTE.function, 'foo.bar.baz');
	assert.equal(k.readUInt32BE(0), 7);
	assert.equal(k.readUInt8(4), ENTITY_KIND_BYTE.function);
	assert.equal(k.subarray(5).toString('utf8'), 'foo.bar.baz');
});

test('plan_step key range scans return idx-ordered steps', () => {
	const a = encodePlanStepKey('plan-1', 0);
	const b = encodePlanStepKey('plan-1', 1);
	const c = encodePlanStepKey('plan-1', 100);
	assert.ok(Buffer.compare(a, b) < 0);
	assert.ok(Buffer.compare(b, c) < 0);
	const prefix = encodePlanStepPrefix('plan-1');
	const succ = prefixSuccessor(prefix);
	assert.ok(Buffer.compare(prefix, a) <= 0);
	assert.ok(Buffer.compare(c, succ) < 0);
	// A step from a different plan falls outside
	const other = encodePlanStepKey('plan-2', 0);
	assert.ok(Buffer.compare(other, succ) >= 0);
});

test('conversation_turn key orders by idx within session', () => {
	const a = encodeConversationTurnKey('session-x', 0);
	const b = encodeConversationTurnKey('session-x', 5);
	assert.ok(Buffer.compare(a, b) < 0);
});

test('todo_item key respects orderKey lex order', () => {
	const a = encodeTodoItemKey('list-1', 'a', 'item-1');
	const b = encodeTodoItemKey('list-1', 'b', 'item-2');
	const c = encodeTodoItemKey('list-1', 'c', 'item-3');
	assert.ok(Buffer.compare(a, b) < 0);
	assert.ok(Buffer.compare(b, c) < 0);
	const prefix = encodeTodoItemPrefix('list-1');
	const succ = prefixSuccessor(prefix);
	assert.ok(Buffer.compare(prefix, a) <= 0);
	assert.ok(Buffer.compare(c, succ) < 0);
});

test('config_by_scope key supports hierarchical prefix scans', () => {
	const a = encodeConfigByScopeKey('s1', 'n1', 'c1', 'e1');
	const b = encodeConfigByScopeKey('s1', 'n1', 'c2', 'e2');
	const c = encodeConfigByScopeKey('s2', 'n1', 'c1', 'e3');
	const scopePrefix = encodeConfigByScopePrefix('s1');
	const scopeSucc = prefixSuccessor(scopePrefix);
	// a + b are under s1; c is under s2
	assert.ok(Buffer.compare(scopePrefix, a) <= 0);
	assert.ok(Buffer.compare(b, scopeSucc) < 0);
	assert.ok(Buffer.compare(c, scopeSucc) >= 0);
});

test('relation-kind enum byte mapping is bidirectional', () => {
	for (const [name, byte] of Object.entries(RELATION_KIND_BYTE)) {
		assert.equal(kindByteToName(byte), name);
	}
});

test('entity-kind enum byte mapping is bidirectional', () => {
	for (const [name, byte] of Object.entries(ENTITY_KIND_BYTE)) {
		assert.equal(entityKindByteToName(byte), name);
	}
});

test('utf8 segment with null byte is rejected', () => {
	assert.throws(
		() => encodeNameIndexKey(1, 1, 'foo\0bar'),
		/null byte/,
	);
});

// ---------------------------------------------------------------------------
// Env scaffolding (route through HOME override to land at our tmpdir)
// ---------------------------------------------------------------------------

test('all 20 sub-DBs open and accept basic put/get', async () => {

	process.env['INSRC_LMDB_MAPSIZE_GIB'] = '1';
	const store = await getGraphStore();

	const handles = [
		['meta',                store.meta],
		['repo',                store.repo],
		['entity',              store.entity],
		['entityIdByString',    store.entityIdByString],
		['nameIndex',           store.nameIndex],
		['outEdge',             store.outEdge],
		['inEdge',              store.inEdge],
		['unresolved',          store.unresolved],
		['unresolvedByFile',    store.unresolvedByFile],
		['plan',                store.plan],
		['planStep',            store.planStep],
		['conversationSession', store.conversationSession],
		['conversationTurn',    store.conversationTurn],
		['conversationTurnByRepo', store.conversationTurnByRepo],
		['todoList',            store.todoList],
		['todoListBySession',   store.todoListBySession],
		['todoItem',            store.todoItem],
		['todoComment',         store.todoComment],
		['configEntry',         store.configEntry],
		['configByScope',       store.configByScope],
	] as const;

	assert.equal(handles.length, 20, 'expected 20 sub-DBs');

	// Validate each sub-DB by writing a sentinel value + reading it back.
	// `meta`, `entityIdByString`, and `unresolved` use ordered-binary key
	// encoding which accepts plain strings; everything else uses binary
	// (Buffer keys).
	const stringKeyDbs = new Set([
		'meta', 'entityIdByString', 'unresolved',
		'plan', 'conversationSession',
		'todoList', 'todoItem', 'configEntry',
	]);
	for (const [name, db] of handles) {
		const key = stringKeyDbs.has(name) ? `sentinel-${name}` : Buffer.from(`k-${name}`);
		const value = Buffer.from(`v-${name}`);
		await db.put(key as never, value as never);
		const got = db.get(key as never);
		assert.ok(got !== undefined, `${name}: get returned undefined`);
		assert.equal(Buffer.from(got as Buffer).toString('utf8'), `v-${name}`, `${name}: round-trip`);
	}

	await closeGraphStore();
});

test('lifecycle close + reopen preserves data', async () => {

	const a = await getGraphStore();
	await a.entity.put(encodeEntityKey(42n), Buffer.from('persist'));
	await closeGraphStore();

	const b = await getGraphStore();
	const got = b.entity.get(encodeEntityKey(42n));
	assert.ok(got !== undefined);
	assert.equal(Buffer.from(got as Buffer).toString('utf8'), 'persist');
	await closeGraphStore();
});

test('concurrent first-callers share the same init promise', async () => {

	const [a, b, c] = await Promise.all([getGraphStore(), getGraphStore(), getGraphStore()]);
	assert.equal(a, b);
	assert.equal(b, c);
	await closeGraphStore();
});

test('write transaction is atomic', async () => {

	await getGraphStore();
	await withWriteTxn(s => {
		s.entity.put(encodeEntityKey(1n), Buffer.from('a'));
		s.entity.put(encodeEntityKey(2n), Buffer.from('b'));
		s.entity.put(encodeEntityKey(3n), Buffer.from('c'));
	});
	const s = await getGraphStore();
	assert.equal(Buffer.from(s.entity.get(encodeEntityKey(1n)) as Buffer).toString('utf8'), 'a');
	assert.equal(Buffer.from(s.entity.get(encodeEntityKey(2n)) as Buffer).toString('utf8'), 'b');
	assert.equal(Buffer.from(s.entity.get(encodeEntityKey(3n)) as Buffer).toString('utf8'), 'c');
	await closeGraphStore();
});

test('cursor range scan over out_edge prefix returns kind-scoped neighbors', async () => {

	await getGraphStore();
	const FROM = 100n;
	const KIND = RELATION_KIND_BYTE.CALLS;
	await withWriteTxn(s => {
		s.outEdge.put(encodeOutEdgeKey(FROM, KIND, 1n), Buffer.alloc(0));
		s.outEdge.put(encodeOutEdgeKey(FROM, KIND, 2n), Buffer.alloc(0));
		s.outEdge.put(encodeOutEdgeKey(FROM, KIND, 3n), Buffer.alloc(0));
		// Different kind, same from -- must NOT appear in our scan
		s.outEdge.put(encodeOutEdgeKey(FROM, RELATION_KIND_BYTE.IMPORTS, 99n), Buffer.alloc(0));
		// Different from, same kind -- must NOT appear
		s.outEdge.put(encodeOutEdgeKey(101n, KIND, 1n), Buffer.alloc(0));
	});
	const s = await getGraphStore();
	const prefix = encodeOutEdgePrefix(FROM, KIND);
	const succ = prefixSuccessor(prefix);
	const tos: bigint[] = [];
	for (const { key } of s.outEdge.getRange({ start: prefix, end: succ })) {
		const dec = decodeOutEdgeKey(key as Buffer);
		tos.push(dec.to);
	}
	assert.deepEqual(tos.sort(), [1n, 2n, 3n]);
	await closeGraphStore();
});
