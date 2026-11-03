/**
 * Epic c2ba6fa6, Story s7, t7 -- the analyzer's lookups say how each listed
 * relationship was established. Over a real temporary store: usage.example
 * lists each caller with its evidence and states how many are inferred or
 * chosen and how many of unknown origin (ac4); an all-unknown list says the
 * origin is unknown instead of implying it was read from the source;
 * class.hierarchy and import.graph carry evidence on each parent/child and on
 * each importer/importee file.
 *
 * Run: npx tsx --test src/analyze/explore/__tests__/evidence-lookups.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath, withWriteTxn } from '../../../db/graph/store.js';
import { upsertResolvedRelationsInTxn } from '../../../db/relations.js';
import { addRepo } from '../../../db/repos.js';
import type { Entity, EntityKind, Relation, RelationEvidence, RelationKind } from '../../../shared/types.js';
import { savedAnalysisExecution } from '../../connection-access.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';
import { runClassHierarchy } from '../class-hierarchy.js';
import { runImportGraph } from '../import-graph.js';
import type { Exploration, ExplorationRunnerContext, ExplorationType } from '../types.js';
import { evidenceOrigin, runUsageExample } from '../usage-example.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const NOW = '2026-11-02T00:00:00.000Z';
let dir: string;
let REPO: string;
let ctx: ExplorationRunnerContext;

function ent(kind: EntityKind, name: string, rel: string, startLine = 1): Entity {
	const file = join(REPO, rel);
	return {
		id: createHash('sha256').update(`${REPO}\x00${file}\x00${kind}\x00${name}`).digest('hex').slice(0, 32),
		kind, name, language: 'typescript', repoId: 1, repo: REPO, file,
		startLine, endLine: startLine + 2, body: `// ${name}`, embedding: [], indexedAt: NOW,
	};
}
const edge = (kind: RelationKind, from: Entity, to: Entity, evidence?: RelationEvidence): Relation =>
	({ kind, from: from.id, to: to.id, resolved: true, meta: { repo: REPO }, ...(evidence !== undefined && { evidence }) });
const exp = (type: ExplorationType, params: Record<string, unknown>): Exploration => ({ id: `e-${type}`, type, purpose: 'test', params });
async function seed(entities: Entity[], relations: Relation[]): Promise<void> {
	await upsertEntities(null, entities);
	await withWriteTxn(s => { upsertResolvedRelationsInTxn(s, relations); });
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s7-lookups-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'ready', lastIndexed: NOW });
	ctx = {
		connectionExecution: savedAnalysisExecution(REPO),
		runId: 'test', repoPath: REPO, closureRepos: [REPO],
		readDep: () => undefined,
		ignoreFilter: permissiveIgnoreFilter(REPO),
	} as ExplorationRunnerContext;
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('s7 t7: usage.example lists each caller with its evidence and states how many are inferred and how many of unknown origin (ac4)', async () => {
	const target = ent('function', 'charge', 'src/pay.ts');
	const [read, resolved, old] = [ent('function', 'local', 'src/pay.ts', 10), ent('function', 'remote', 'src/user.ts', 20), ent('function', 'legacy', 'src/zz.ts', 30)];
	await seed([target, read, resolved, old], [edge('CALLS', read, target, 'extracted'), edge('CALLS', resolved, target, 'inferred'), edge('CALLS', old, target)]);

	const out = await runUsageExample(exp('usage.example', { entityId: target.id }), ctx);

	assert.deepEqual(out.callers.map(c => `${c.name}: ${c.evidence}`).sort(), ['legacy: unknown', 'local: extracted', 'remote: inferred']);
	assert.deepEqual(out.origin.counts, { extracted: 1, inferred: 1, unknown: 1 });
	assert.match(out.origin.note, /1 of 3 listed callers inferred by resolution across files/);
	assert.match(out.origin.note, /1 of 3 listed callers of unknown origin/);
	assert.match(out.origin.note, /1 of 3 listed callers read directly from the source/);
});

test('s7 t7: an all-unknown caller list says the origin is unknown and none is known to be read from the source; a chosen relationship is named', async () => {
	const target = ent('function', 'charge', 'src/pay.ts');
	const [x, y] = [ent('function', 'x', 'src/x.ts'), ent('function', 'y', 'src/y.ts')];
	await seed([target, x, y], [edge('CALLS', x, target), edge('CALLS', y, target)]);

	const out = await runUsageExample(exp('usage.example', { entityId: target.id }), ctx);

	assert.deepEqual(out.origin.counts, { unknown: 2 });
	assert.match(out.origin.note, /origin of all 2 listed callers is unknown/);
	assert.doesNotMatch(out.origin.note, /read directly from the source/);
	assert.match(evidenceOrigin(['chosen', 'extracted']).note, /1 of 2 listed callers chosen among several candidates/);
});

test('s7 t7: class.hierarchy carries evidence on each supertype, interface, subclass and implementer; import.graph on each importer and importee file', async () => {
	const base = ent('class', 'Base', 'src/base.ts');
	const iface = ent('interface', 'Shape', 'src/shape.ts');
	const mid = ent('class', 'Mid', 'src/mid.ts');
	const leaf = ent('class', 'Leaf', 'src/leaf.ts');
	const impl = ent('class', 'Impl', 'src/impl.ts');
	const [fScope, fIn, fOut] = [ent('file', 'scope.ts', 'src/scope/scope.ts'), ent('file', 'user.ts', 'src/user.ts'), ent('file', 'lib.ts', 'src/lib.ts')];
	await seed([base, iface, mid, leaf, impl, fScope, fIn, fOut], [
		edge('INHERITS', mid, base, 'inferred'),
		edge('IMPLEMENTS', mid, iface, 'extracted'),
		edge('INHERITS', leaf, mid, 'extracted'),
		edge('IMPLEMENTS', impl, mid),
		edge('IMPORTS', fIn, fScope, 'inferred'),
		edge('IMPORTS', fScope, fOut, 'extracted'),
	]);

	const h = await runClassHierarchy(exp('class.hierarchy', { symbolName: 'Mid' }), ctx);
	const node = h.nodes.find(n => n.name === 'Mid')!;
	assert.deepEqual(node.extendsList.map(e => `${e.name}: ${e.evidence}`), ['Base: inferred']);
	assert.deepEqual(node.implementsList.map(e => `${e.name}: ${e.evidence}`), ['Shape: extracted']);
	assert.deepEqual(node.subclasses.map(e => `${e.name}: ${e.evidence}`), ['Leaf: extracted']);
	assert.deepEqual(node.implementers.map(e => `${e.name}: ${e.evidence}`), ['Impl: unknown']);

	const g = await runImportGraph(exp('import.graph', { path: join(REPO, 'src/scope') }), ctx);
	assert.deepEqual(g.summary.topImporters, [{ file: fIn.file, edges: 1, evidence: { inferred: 1 } }]);
	assert.deepEqual(g.summary.topImportees, [{ file: fOut.file, edges: 1, evidence: { extracted: 1 } }]);
});
