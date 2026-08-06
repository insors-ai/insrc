/**
 * S001 (sc1 — ExternalEndpoint graph vocabulary) tests.
 * Epic E20260806914cbf5e:S001.
 *
 * Covers the graph-layer half of the LLD test strategy:
 *   - codec round-trip of an externalEndpoint EntityRow (resolved + unresolved)
 *   - forward-compatible decode of a pre-S001 row (endpoint fields undefined)
 *   - RELATION_KIND_BYTE / ENTITY_KIND_BYTE append-only + collision-free
 *   - the four boundary edge-kind bytes round-trip via kindByteToName
 *   - DEPENDS_ON_CLOSURE_KINDS reachability + additive (unchanged) closure
 *   - the v3 -> v4 no-op migration advances schema_version, rows untouched
 *
 * Run: npx tsx --test src/db/graph/__tests__/sc1-external-endpoint.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	closeGraphStore,
	getGraphStore,
	setGraphStorePath,
	withWriteTxn,
} from '../store.js';
import {
	encodeEntityKey,
	encodeOutEdgeKey,
	encodeInEdgeKey,
	RELATION_KIND_BYTE,
	ENTITY_KIND_BYTE,
	kindByteToName,
	entityKindByteToName,
	type RelationKind,
	type EntityKind,
} from '../keys.js';
import { encodeEntityRow, decodeEntityRow, type EntityRow } from '../codec.js';
import { transitiveClosure, DEPENDS_ON_CLOSURE_KINDS } from '../traversal.js';
import { runMigrations, MIGRATIONS } from '../migrations.js';
import type {
	ExternalProtocol,
	ExternalBoundaryRelation,
} from '../../../shared/types.js';

const BOUNDARY_KINDS: readonly ExternalBoundaryRelation[] = [
	'CALLS_HTTP', 'PUBLISHES_TO', 'SUBSCRIBES_TO', 'CALLS_RPC',
];

function baseRow(kind: EntityKind): EntityRow {
	return {
		repoId: 1, kind, name: 'n',
		filePath: '', startLine: 0, endLine: 0, language: 'typescript',
		rootPath: '', body: '', signature: '', summary: '',
		isExported: false, isAsync: false, isAbstract: false, artifact: false,
		contentHash: '', embeddingModel: '', indexedAt: 0,
	};
}

// ---------------------------------------------------------------------------
// Vocabulary — byte maps (t1)
// ---------------------------------------------------------------------------

test('RELATION_KIND_BYTE: no duplicate byte; boundary kinds appended at 13-16', () => {
	const bytes = Object.values(RELATION_KIND_BYTE);
	assert.equal(new Set(bytes).size, bytes.length, 'duplicate relation-kind byte');
	assert.equal(RELATION_KIND_BYTE.CALLS_HTTP, 13);
	assert.equal(RELATION_KIND_BYTE.PUBLISHES_TO, 14);
	assert.equal(RELATION_KIND_BYTE.SUBSCRIBES_TO, 15);
	assert.equal(RELATION_KIND_BYTE.CALLS_RPC, 16);
	// existing kinds unchanged (append-only)
	assert.equal(RELATION_KIND_BYTE.DEPENDS_ON, 8);
	assert.equal(RELATION_KIND_BYTE.STEP_DEPENDS_ON, 12);
});

test('ENTITY_KIND_BYTE: no duplicate byte; externalEndpoint appended at 13', () => {
	const bytes = Object.values(ENTITY_KIND_BYTE);
	assert.equal(new Set(bytes).size, bytes.length, 'duplicate entity-kind byte');
	assert.equal(ENTITY_KIND_BYTE.externalEndpoint, 13);
	assert.equal(ENTITY_KIND_BYTE.config, 12); // existing unchanged
});

test('each boundary RelationKind byte round-trips via kindByteToName', () => {
	for (const k of BOUNDARY_KINDS) {
		assert.equal(kindByteToName(RELATION_KIND_BYTE[k]), k);
	}
	assert.equal(entityKindByteToName(ENTITY_KIND_BYTE.externalEndpoint), 'externalEndpoint');
});

test('frozen sc1 vocabulary: protocol enum + boundary names', () => {
	const protocols: readonly ExternalProtocol[] = ['http', 'messaging', 'rpc'];
	assert.deepEqual([...protocols], ['http', 'messaging', 'rpc']);
	assert.deepEqual([...BOUNDARY_KINDS], ['CALLS_HTTP', 'PUBLISHES_TO', 'SUBSCRIBES_TO', 'CALLS_RPC']);
});

// ---------------------------------------------------------------------------
// Codec — endpoint fields round-trip + forward-compat (t2)
// ---------------------------------------------------------------------------

test('externalEndpoint EntityRow round-trips (resolved variant)', () => {
	const e: EntityRow = {
		...baseRow('externalEndpoint'),
		name: 'http:api.example.com/v1/users',
		protocol: 'http', resolved: true, target: 'api.example.com/v1/users',
	};
	assert.deepEqual(decodeEntityRow(encodeEntityRow(e)), e);
});

test('externalEndpoint EntityRow round-trips (unresolved variant with rawExpression)', () => {
	const e: EntityRow = {
		...baseRow('externalEndpoint'),
		name: 'http:${cfg.baseUrl}/users',
		protocol: 'http', resolved: false, target: '', rawExpression: '`${cfg.baseUrl}/users`',
	};
	assert.deepEqual(decodeEntityRow(encodeEntityRow(e)), e);
});

test('forward-compat: a pre-S001 row (no endpoint fields) decodes unchanged, endpoint fields undefined', () => {
	const legacy: EntityRow = { ...baseRow('function'), name: 'foo', signature: 'foo()' };
	const round = decodeEntityRow(encodeEntityRow(legacy));
	assert.deepEqual(round, legacy);
	assert.equal(round.protocol, undefined);
	assert.equal(round.resolved, undefined);
	assert.equal(round.target, undefined);
	assert.equal(round.rawExpression, undefined);
});

// ---------------------------------------------------------------------------
// Traversal — closure reachability + additive (t4)
// ---------------------------------------------------------------------------

test('graph closure', async (t) => {
	await closeGraphStore();
	const dir = mkdtempSync(join(tmpdir(), 'insrc-sc1-closure-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	t.after(async () => { await closeGraphStore(); rmSync(dir, { recursive: true, force: true }); });

	async function wireEdge(from: bigint, kind: RelationKind, to: bigint): Promise<void> {
		const b = RELATION_KIND_BYTE[kind];
		await withWriteTxn(s => {
			s.outEdge.put(encodeOutEdgeKey(from, b, to), Buffer.alloc(0));
			s.inEdge.put(encodeInEdgeKey(to, b, from), Buffer.alloc(0));
		});
	}

	await getGraphStore();

	// ac2: a code entity (1) --CALLS_HTTP--> endpoint (2) is reachable under the
	// canonical closure set, but NOT under a plain ['DEPENDS_ON'] filter.
	await wireEdge(1n, 'CALLS_HTTP', 2n);
	const underCanonical = await transitiveClosure([1n], { kindFilter: DEPENDS_ON_CLOSURE_KINDS });
	assert.ok(underCanonical.has(2n), 'endpoint reachable under DEPENDS_ON_CLOSURE_KINDS');
	const underDependsOnly = await transitiveClosure([1n], { kindFilter: ['DEPENDS_ON'] });
	assert.ok(!underDependsOnly.has(2n), 'boundary edge is invisible to a DEPENDS_ON-only closure');

	// Additive (k1): a DEPENDS_ON-only subgraph yields the SAME closure whether
	// filtered by the canonical set or by ['DEPENDS_ON'] alone — the added kinds
	// never alter traversal over existing kinds.
	await wireEdge(10n, 'DEPENDS_ON', 11n);
	await wireEdge(11n, 'DEPENDS_ON', 12n);
	const canon = await transitiveClosure([10n], { kindFilter: DEPENDS_ON_CLOSURE_KINDS });
	const depOnly = await transitiveClosure([10n], { kindFilter: ['DEPENDS_ON'] });
	assert.deepEqual([...canon].sort(), [...depOnly].sort());
	assert.deepEqual([...depOnly].sort(), [10n, 11n, 12n].sort());
});

// ---------------------------------------------------------------------------
// Migration — v3 -> v4 no-op advances schema_version, rows untouched (t5)
// ---------------------------------------------------------------------------

test('v3 -> v4 no-op migration advances schema_version leaving rows byte-identical', async (t) => {
	await closeGraphStore();
	const dir = mkdtempSync(join(tmpdir(), 'insrc-sc1-migration-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	t.after(async () => { await closeGraphStore(); rmSync(dir, { recursive: true, force: true }); });

	const store = await getGraphStore();

	// Seed a pre-S001 (v3) row + a stored version of 3.
	const legacy: EntityRow = { ...baseRow('function'), name: 'legacy', signature: 'legacy()' };
	const before = encodeEntityRow(legacy);
	await withWriteTxn(s => {
		s.entity.put(encodeEntityKey(1n), before);
		s.meta.put('schema_version', 3);
	});

	const applied = await runMigrations(store, 3, 4, MIGRATIONS);
	assert.equal(applied, 1, 'exactly the 3->4 step ran');
	assert.equal(store.meta.get('schema_version'), 4);

	// The no-op migration rewrote nothing: the row is byte-identical.
	const after = store.entity.get(encodeEntityKey(1n)) as Buffer;
	assert.deepEqual(Buffer.from(after), before);
	assert.deepEqual(decodeEntityRow(Buffer.from(after)), legacy);
});
