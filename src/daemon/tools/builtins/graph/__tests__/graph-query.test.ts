/**
 * Phase 5.4 tests for the LLM-facing `graph_query` tool.
 *
 * Exercises every op (defined_in / imports / closure / unreachable /
 * scc) via a real LMDB graph fixture. Each test seeds entities +
 * resolved edges through the public db/* surfaces, then invokes
 * graphQueryTool.execute() directly and inspects the returned `data`
 * payload (the structured side that downstream LLM tool-loops use).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../../../../../db/graph/store.js';
import { upsertEntities } from '../../../../../db/entities.js';
import { upsertRelations } from '../../../../../db/relations.js';
import { graphQueryTool } from '../index.js';
import type { Entity, EntityKind } from '../../../../../shared/types.js';
import type { ToolDeps } from '../../../types.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-graph-query-5.4-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const { addRepo } = await import('../../../../../db/repos.js');
	await addRepo(null, { path: '/repo/foo', name: '', addedAt: new Date().toISOString(), status: 'pending' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const REPO = '/repo/foo';

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeEntity(
	name: string,
	opts: { kind?: EntityKind; file?: string } = {},
): Entity {
	const kind = opts.kind ?? 'function';
	const file = opts.file ?? `${REPO}/src/${name}.ts`;
	return {
		id: makeEntityId(REPO, file, kind, name),
		kind, name,
		language: 'typescript',
		repoId: 1,
		repo: REPO,
		file,
		startLine: 1, endLine: 5,
		body: `function ${name}() {}`,
		embedding: [],
		indexedAt: '2026-05-06T10:00:00.000Z',
	};
}

/** Minimal ToolDeps stub: graph_query never reads from deps. */
const stubDeps: ToolDeps = {
	session: { id: 'test', closureRepos: [REPO] } as ToolDeps['session'],
	send: () => { /* drop */ },
	requestId: 0,
};

interface GraphQueryData {
	op:           string;
	total:        number;
	entities?:    Array<{ id: string; name: string; kind: string }>;
	components?:  Array<Array<{ id: string; name: string; kind: string }>>;
}

function dataOf(result: { data?: unknown }): GraphQueryData {
	return result.data as GraphQueryData;
}

// ---------------------------------------------------------------------------
// op: defined_in
// ---------------------------------------------------------------------------

test('graph_query op=defined_in returns DEFINES out-neighbors', async () => {
	const file = makeEntity('file.ts', { kind: 'file' });
	const fn1  = makeEntity('fn1');
	const fn2  = makeEntity('fn2');
	await upsertEntities(null, [file, fn1, fn2]);
	await upsertRelations(null, [
		{ kind: 'DEFINES', from: file.id, to: fn1.id, resolved: true },
		{ kind: 'DEFINES', from: file.id, to: fn2.id, resolved: true },
	]);

	const result = await graphQueryTool.execute(
		{ op: 'defined_in', fileEntityId: file.id },
		stubDeps,
	);
	assert.equal(result.success, true);
	const d = dataOf(result);
	assert.equal(d.op, 'defined_in');
	assert.equal(d.total, 2);
	assert.deepEqual(d.entities!.map(e => e.name).sort(), ['fn1', 'fn2']);
});

test('graph_query op=defined_in errors without fileEntityId', async () => {
	const result = await graphQueryTool.execute({ op: 'defined_in' }, stubDeps);
	assert.equal(result.success, false);
	assert.match(result.error ?? '', /fileEntityId/);
});

// ---------------------------------------------------------------------------
// op: imports
// ---------------------------------------------------------------------------

test('graph_query op=imports returns IMPORTS out-neighbors', async () => {
	const file = makeEntity('file.ts', { kind: 'file' });
	const m1   = makeEntity('m1', { kind: 'module' });
	const m2   = makeEntity('m2', { kind: 'module' });
	await upsertEntities(null, [file, m1, m2]);
	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: file.id, to: m1.id, resolved: true },
		{ kind: 'IMPORTS', from: file.id, to: m2.id, resolved: true },
	]);

	const result = await graphQueryTool.execute(
		{ op: 'imports', fileEntityId: file.id },
		stubDeps,
	);
	assert.equal(result.success, true);
	const d = dataOf(result);
	assert.equal(d.op, 'imports');
	assert.equal(d.total, 2);
});

// ---------------------------------------------------------------------------
// op: closure
// ---------------------------------------------------------------------------

test('graph_query op=closure walks transitive edges with kindFilter', async () => {
	const a = makeEntity('a');
	const b = makeEntity('b');
	const c = makeEntity('c');
	const d = makeEntity('d');
	await upsertEntities(null, [a, b, c, d]);
	await upsertRelations(null, [
		{ kind: 'CALLS',   from: a.id, to: b.id, resolved: true },
		{ kind: 'CALLS',   from: b.id, to: c.id, resolved: true },
		{ kind: 'IMPORTS', from: a.id, to: d.id, resolved: true },
	]);

	// CALLS only: closure from a -> {a, b, c}
	const callsOnly = await graphQueryTool.execute(
		{ op: 'closure', roots: [a.id], kindFilter: ['CALLS'] },
		stubDeps,
	);
	assert.equal(callsOnly.success, true);
	const dCalls = dataOf(callsOnly);
	assert.deepEqual(
		dCalls.entities!.map(e => e.name).sort(),
		['a', 'b', 'c'],
	);

	// All kinds: closure from a -> {a, b, c, d}
	const allKinds = await graphQueryTool.execute(
		{ op: 'closure', roots: [a.id] },
		stubDeps,
	);
	assert.equal(dataOf(allKinds).total, 4);
});

test('graph_query op=closure respects maxDepth', async () => {
	const a = makeEntity('a');
	const b = makeEntity('b');
	const c = makeEntity('c');
	await upsertEntities(null, [a, b, c]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },
		{ kind: 'CALLS', from: b.id, to: c.id, resolved: true },
	]);
	const result = await graphQueryTool.execute(
		{ op: 'closure', roots: [a.id], maxDepth: 1 },
		stubDeps,
	);
	const d = dataOf(result);
	assert.deepEqual(d.entities!.map(e => e.name).sort(), ['a', 'b']);
});

test('graph_query op=closure errors without roots', async () => {
	const result = await graphQueryTool.execute({ op: 'closure' }, stubDeps);
	assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// op: unreachable
// ---------------------------------------------------------------------------

test('graph_query op=unreachable yields entities outside the closure', async () => {
	const a = makeEntity('a');
	const b = makeEntity('b');
	const orphan = makeEntity('orphan');
	await upsertEntities(null, [a, b, orphan]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },
	]);

	const result = await graphQueryTool.execute(
		{ op: 'unreachable', roots: [a.id], candidateKinds: ['function'] },
		stubDeps,
	);
	assert.equal(result.success, true);
	const d = dataOf(result);
	assert.deepEqual(d.entities!.map(e => e.name), ['orphan']);
});

test('graph_query op=unreachable errors without candidateKinds', async () => {
	const result = await graphQueryTool.execute(
		{ op: 'unreachable', roots: [] },
		stubDeps,
	);
	assert.equal(result.success, false);
	assert.match(result.error ?? '', /candidateKinds/);
});

test('graph_query op=unreachable empty roots yields every candidate-kind entity', async () => {
	const a = makeEntity('a');
	const b = makeEntity('b');
	await upsertEntities(null, [a, b]);

	const result = await graphQueryTool.execute(
		{ op: 'unreachable', roots: [], candidateKinds: ['function'] },
		stubDeps,
	);
	const d = dataOf(result);
	assert.deepEqual(d.entities!.map(e => e.name).sort(), ['a', 'b']);
});

// ---------------------------------------------------------------------------
// op: scc
// ---------------------------------------------------------------------------

test('graph_query op=scc finds a 2-node cycle as one component', async () => {
	const a = makeEntity('a');
	const b = makeEntity('b');
	await upsertEntities(null, [a, b]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },
		{ kind: 'CALLS', from: b.id, to: a.id, resolved: true },
	]);

	const result = await graphQueryTool.execute(
		{ op: 'scc', roots: [a.id] },
		stubDeps,
	);
	assert.equal(result.success, true);
	const d = dataOf(result);
	assert.equal(d.total, 1);
	assert.equal(d.components!.length, 1);
	assert.equal(d.components![0]!.length, 2);
});

test('graph_query op=scc with two acyclic nodes reports two singletons', async () => {
	const a = makeEntity('a');
	const b = makeEntity('b');
	await upsertEntities(null, [a, b]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },
	]);

	const result = await graphQueryTool.execute(
		{ op: 'scc', roots: [a.id] },
		stubDeps,
	);
	const d = dataOf(result);
	assert.equal(d.total, 2);
});

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

test('graph_query rejects unknown op', async () => {
	const result = await graphQueryTool.execute({ op: 'totally_made_up' }, stubDeps);
	assert.equal(result.success, false);
});

test('graph_query rejects missing op', async () => {
	const result = await graphQueryTool.execute({}, stubDeps);
	assert.equal(result.success, false);
	assert.match(result.error ?? '', /op required/);
});

test('graph_query maxDepth is capped at 20', async () => {
	// Just exercise that a maxDepth above the cap doesn't crash; 100
	// gets clamped to 20 by clampDepth().
	const a = makeEntity('a');
	await upsertEntities(null, [a]);
	const result = await graphQueryTool.execute(
		{ op: 'closure', roots: [a.id], maxDepth: 100 },
		stubDeps,
	);
	assert.equal(result.success, true);
});

test('graph_query limit is capped at 500 and applied to entities array', async () => {
	// Build 10 functions, ask for 3 unreachable. The limit cap doesn't
	// fire (10 < 500); the per-call limit does.
	const ents: Entity[] = [];
	for (let i = 0; i < 10; i++) ents.push(makeEntity(`e${i}`));
	await upsertEntities(null, ents);

	const result = await graphQueryTool.execute(
		{ op: 'unreachable', roots: [], candidateKinds: ['function'], limit: 3 },
		stubDeps,
	);
	const d = dataOf(result);
	assert.equal(d.total, 10);
	assert.equal(d.entities!.length, 3);
});
