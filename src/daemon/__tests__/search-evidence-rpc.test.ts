/**
 * Epic c2ba6fa6, Story s7, t6 -- the daemon's caller/callee requests and the
 * graph tools carry each relationship's evidence. In process: the real handler
 * runtime and the real graph tools over a temporary store (no daemon is
 * started). search.callers / search.callees return each entity with its
 * evidence; search.callers_nhop's callers carry it at every hop; graph_callers
 * / graph_callees include it in each short entity; no existing field changes.
 *
 * Run: npx tsx --test src/daemon/__tests__/search-evidence-rpc.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import type { Entity, Relation, RelationEvidence } from '../../shared/types.js';
import type { ToolDeps } from '../tools/types.js';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-search-evidence-rpc-'));
mkdirSync(join(HOME, '.insrc'), { recursive: true });
process.env['HOME'] = HOME;
const { buildHandlerRuntime } = await import('../handler-runtime.js');
const { closeGraphStore, setGraphStorePath, withWriteTxn } = await import('../../db/graph/store.js');
const { setLanceConnPath, closeLanceConn } = await import('../../db/lance/conn.js');
const { upsertEntities } = await import('../../db/entities.js');
const { upsertResolvedRelationsInTxn } = await import('../../db/relations.js');
const { addRepo } = await import('../../db/repos.js');
const graph = await import('../tools/builtins/graph/index.js');

const REPO = join(HOME, 'repo');

function untouchable(name: string): never {
	return new Proxy({}, { get: (_t, prop) => { throw new Error(`the request read ${name}.${String(prop)}`); } }) as never;
}
function entity(name: string): Entity {
	const file = `${REPO}/src/${name}.ts`;
	return {
		id: createHash('sha256').update(`${REPO}\x00${file}\x00function\x00${name}`).digest('hex').slice(0, 32),
		kind: 'function', name, language: 'typescript', repoId: 1, repo: REPO, file,
		startLine: 1, endLine: 2, body: `function ${name}() {}`, embedding: [], indexedAt: '2026-11-02T00:00:00.000Z',
	};
}
const calls = (from: Entity, to: Entity, evidence?: RelationEvidence): Relation =>
	({ kind: 'CALLS', from: from.id, to: to.id, resolved: true, meta: { repo: REPO }, ...(evidence !== undefined && { evidence }) });
type WithEvidence = Entity & { evidence: RelationEvidence };
const byName = (es: readonly unknown[]) => (es as WithEvidence[]).map(e => `${e.name}: ${e.evidence}`).sort();

// target <- a (extracted), target <- b (inferred); a <- c (inferred), a <- d (no evidence)
const [target, a, b, c, d] = ['target', 'a', 'b', 'c', 'd'].map(entity) as [Entity, Entity, Entity, Entity, Entity];

test.before(async () => {
	await closeGraphStore();
	setGraphStorePath(join(HOME, 'store', 'graph.lmdb'));
	setLanceConnPath(join(HOME, 'store', 'lance'));
	await addRepo(null, { path: REPO, name: 'repo', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready', lastIndexed: '2026-11-02T00:00:00.000Z' });
	await upsertEntities(null, [target, a, b, c, d]);
	await withWriteTxn(s => { upsertResolvedRelationsInTxn(s, [calls(a, target, 'extracted'), calls(b, target, 'inferred'), calls(c, a, 'inferred'), calls(d, a)]); });
});
test.after(async () => {
	await closeGraphStore();
	await closeLanceConn();
	rmSync(HOME, { recursive: true, force: true });
});

function runtime() {
	return buildHandlerRuntime({
		db: null as never, configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
		startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
	});
}

test('s7 t6: search.callers, search.callees and every hop of search.callers_nhop return each entity with its relationship evidence, existing fields unchanged', async () => {
	const rt = runtime();
	try {
		const callers = await rt.rpcHandlers['search.callers']!({ entityId: target.id }) as WithEvidence[];
		assert.deepEqual(byName(callers), ['a: extracted', 'b: inferred']);
		const first = callers.find(e => e.name === 'a')!;
		for (const field of ['id', 'kind', 'name', 'file', 'repo', 'startLine', 'endLine', 'body'] as const) {
			assert.deepEqual(first[field], a[field], field);
		}

		assert.deepEqual(byName(await rt.rpcHandlers['search.callees']!({ entityId: a.id }) as WithEvidence[]), ['target: extracted']);

		// Two hops: a and b call target; c and d call a.
		const nhop = await rt.rpcHandlers['search.callers_nhop']!({ entityId: target.id, hops: 2 }) as WithEvidence[];
		assert.deepEqual(byName(nhop), ['a: extracted', 'b: inferred', 'c: inferred', 'd: unknown']);
	} finally {
		rt.understandingRoutes.stop();
	}
});

test('s7 t6: graph_callers and graph_callees include the evidence in each short entity', async () => {
	const deps = { closureRepos: [REPO] } as unknown as ToolDeps;
	const callers = await graph.graphCallersTool.execute({ entityId: target.id }, deps);
	assert.equal(callers.success, true, callers.output);
	const results = (callers.data as { results: Array<Record<string, unknown>> }).results;
	assert.deepEqual(results.map(r => `${String(r['name'])}: ${String(r['evidence'])}`).sort(), ['a: extracted', 'b: inferred']);
	assert.deepEqual(Object.keys(results[0]!).sort(), ['endLine', 'evidence', 'file', 'id', 'kind', 'name', 'repo', 'signature', 'startLine'].sort());
	// The markdown an agent reads says it too (s7 review).
	assert.match(callers.output, /`a`.*— extracted/);
	assert.match(callers.output, /`b`.*— inferred/);

	const callees = await graph.graphCalleesTool.execute({ entityId: d.id }, deps);
	assert.deepEqual((callees.data as { results: Array<Record<string, unknown>> }).results.map(r => `${String(r['name'])}: ${String(r['evidence'])}`), ['a: unknown']);
});
