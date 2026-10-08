/**
 * Every lookup output carries a completeness record (LLD-b9d5c5c40df5a574-s1,
 * task t4).
 *
 * The REAL runners run against a temporary LMDB graph seeded with entities
 * and edges, and a temporary repository on disk for the lookups that read
 * files. Three kinds of lookup need a stand-in for the one thing a unit test
 * cannot have: the lookups that pause for a model call are driven through
 * their own prepare and finalize with a hand-written model answer; the data
 * lookups get a stand-in connection pool; the free-form lookup gets a
 * stand-in tool loop.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { getDb } from '../../../db/client.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { upsertRelations } from '../../../db/relations.js';
import { addRepo } from '../../../db/repos.js';
import type { Entity, EntityKind, Relation, RelationKind } from '../../../shared/types.js';
import type { Completeness } from '../../completeness.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';

import { finalizeCapabilityReuseCheck, prepareCapabilityReuseCheck } from '../capability-reuse-check.js';
import { runClassHierarchy } from '../class-hierarchy.js';
import { carriedCompleteness, GRAPH_BASIS_NOTE } from '../completeness-facts.js';
import { runConceptResolve } from '../concept-resolve.js';
import { runConfigTrace } from '../config-trace.js';
import { runConventionDetect } from '../convention-detect.js';
import { runDataModelTrace } from '../data-model-trace.js';
import { runDbConnectionsList } from '../db-connections-list.js';
import { runDbTableDescribe } from '../db-table-describe.js';
import { runDbTablesList } from '../db-tables-list.js';
import { finalizeDocConstraintEnumerate, prepareDocConstraintEnumerate } from '../doc-constraint-enumerate.js';
import { finalizeDocDecisionTrace, prepareDocDecisionTrace } from '../doc-decision-trace.js';
import { runDocMention } from '../doc-mention.js';
import { _getRunnersForTest } from '../executor.js';
import { runFreeformProbe } from '../freeform-probe.js';
import { runImportGraph } from '../import-graph.js';
import { runManifestsLocate } from '../manifests-locate.js';
import { runModuleProfile } from '../module-profile.js';
import { runSearchText } from '../search-text.js';
import { runSymbolLocate } from '../symbol-locate.js';
import { runTestLocate } from '../test-locate.js';
import type { Exploration, ExplorationOutput, ExplorationRunnerContext, ExplorationType } from '../types.js';
import { runUsageExample } from '../usage-example.js';

const NOW = '2026-10-08T10:00:00.000Z';

let dir: string;
let REPO: string;
let ctx: ExplorationRunnerContext;

function id(file: string, kind: string, name: string): string {
	return createHash('sha256').update(`${REPO}\x00${file}\x00${kind}\x00${name}`).digest('hex').slice(0, 32);
}

function ent(kind: EntityKind, name: string, rel: string, extra: Partial<Entity> = {}): Entity {
	const file = join(REPO, rel);
	return {
		id: id(file, kind, name), kind, name, language: 'typescript', repoId: 1, repo: REPO, file,
		startLine: 1, endLine: 5, body: `// ${name}`, embedding: [], indexedAt: NOW, ...extra,
	};
}

function edge(kind: RelationKind, from: Entity, to: Entity): Relation {
	return { kind, from: from.id, to: to.id, resolved: true };
}

function exp(type: ExplorationType, params: Record<string, unknown>): Exploration {
	return { id: `e-${type}`, type, purpose: 'test', params };
}

function write(rel: string, content: string): void {
	const p = join(REPO, rel);
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, content);
}

/** The reached limit named `what`, or a failure that lists the ones present. */
function limitOf(c: Completeness, what: string): NonNullable<Completeness['limited']>[number] {
	const l = (c.limited ?? []).find(x => x.what === what);
	assert.ok(l, `a reached limit on "${what}"; got [${(c.limited ?? []).map(x => x.what).join(', ')}]`);
	return l;
}

// ---------------------------------------------------------------------------
// One fixture for every lookup
// ---------------------------------------------------------------------------

const seeded: Record<string, Entity> = {};

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-completeness-lookups-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
	ctx = {
		runId: 'test', repoPath: REPO, closureRepos: [REPO],
		readDep: () => undefined,
		ignoreFilter: permissiveIgnoreFilter(REPO),
	} as ExplorationRunnerContext;

	// --- files on disk, for the text lookups and module.profile ---
	write('src/pay/index.ts', 'export const charge = 1;\nconst PAY_KEY = "pay.key";\n');
	write('src/pay/charge.ts', ['needle one', 'needle two', 'needle three', `needle ${'x'.repeat(900)}`, 'pay.key again'].join('\n') + '\n');
	write('src/pay/refund.ts', 'needle in refund\n');
	write('src/other/user.ts', 'import "../pay/charge";\n');
	write('src/other/admin.ts', 'import "../pay/charge";\n');
	write('big.bin', 'needle\n' + 'y'.repeat(2 * 1024 * 1024 + 10));

	const E: Entity[] = [];
	const R: Relation[] = [];
	const add = (key: string, e: Entity): Entity => { E.push(e); seeded[key] = e; return e; };

	// --- files and imports: two outside files import one inside src/pay ---
	const fIndex  = add('fIndex',  ent('file', 'index.ts',  'src/pay/index.ts'));
	const fCharge = add('fCharge', ent('file', 'charge.ts', 'src/pay/charge.ts'));
	add('fRefund', ent('file', 'refund.ts', 'src/pay/refund.ts'));
	const fUser   = add('fUser',  ent('file', 'user.ts',  'src/other/user.ts'));
	const fAdmin  = add('fAdmin', ent('file', 'admin.ts', 'src/other/admin.ts'));
	R.push(edge('IMPORTS', fUser, fCharge), edge('IMPORTS', fAdmin, fCharge), edge('IMPORTS', fIndex, fUser), edge('IMPORTS', fIndex, fAdmin));

	// --- functions: three named chargeCard-ish, and callers of one of them ---
	const charge = add('charge', ent('function', 'chargeCard', 'src/pay/charge.ts', { startLine: 10 }));
	add('charge2', ent('function', 'chargeCardLater', 'src/pay/charge.ts', { startLine: 20 }));
	add('chargeTwin', ent('function', 'chargeCard', 'src/pay/refund.ts', { startLine: 3 }));
	for (const n of ['callA', 'callB', 'callC']) {
		R.push(edge('CALLS', add(n, ent('function', n, 'src/other/user.ts', { startLine: 30 + E.length })), charge));
	}

	// --- classes: five named Model (data-model.trace keeps 4), one with 13 fields and 7 callers ---
	const models: Entity[] = [];
	for (let i = 0; i < 5; i++) models.push(add(`model${i}`, ent('class', 'Model', `src/models/m${i}.ts`)));
	for (let i = 0; i < 13; i++) {
		R.push(edge('DEFINES', models[0]!, add(`field${i}`, ent('property' as EntityKind, `field${i}`, 'src/models/m0.ts', { startLine: 40 + i }))));
	}
	for (let i = 0; i < 7; i++) {
		R.push(edge('CALLS', add(`mcall${i}`, ent('function', `useModel${i}`, 'src/other/admin.ts', { startLine: 60 + i })), models[0]!));
	}

	// --- base classes: nine distinct bases outside src/pay (convention.detect keeps 8), one with six subclasses ---
	for (let b = 0; b < 9; b++) {
		const base = add(`base${b}`, ent('class', `Base${b}`, `src/lib/base${b}.ts`));
		const subs = b === 0 ? 6 : 1;
		for (let s = 0; s < subs; s++) {
			R.push(edge('INHERITS', add(`sub${b}_${s}`, ent('class', `Sub${b}x${s}`, 'src/pay/charge.ts', { startLine: 100 + b * 10 + s })), base));
		}
	}

	// --- tests: two test entities and a test file naming the subject ---
	add('t1', ent('function', 'testChargeCardOk', 'src/pay/__tests__/charge.test.ts'));
	add('t2', ent('function', 'testChargeCardFails', 'src/pay/__tests__/charge.test.ts', { startLine: 9 }));

	// --- documents: two sections that mention refunds ---
	const doc = (name: string, rel: string, body: string): Entity =>
		add(name, ent('section', name, rel, { language: 'markdown', artifact: true, body }));
	doc('Refund policy', 'docs/policy.md', '## Refund policy\n\nRefunds MUST be issued within 30 days. We decided to refund in full.');
	doc('Refund flow', 'docs/flow.md', '## Refund flow\n\nA refund SHALL be logged. The team chose to refund through the original card.');

	// --- manifests: two indexed infra files ---
	add('k8s', ent('document', 'deploy.yaml', 'k8s/deploy.yaml', { language: 'yaml', artifact: true, body: 'apiVersion: v1\nkind: Deployment\n' }));
	add('docker', ent('document', 'Dockerfile', 'Dockerfile', { language: 'dockerfile', artifact: true, body: 'FROM node:22\n' }));

	await upsertEntities(await getDb(), E);
	await upsertRelations(await getDb(), R);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The lookups that need a stand-in
// ---------------------------------------------------------------------------

async function docConstraints(maxSources?: number): Promise<ExplorationOutput> {
	const prep = await prepareDocConstraintEnumerate({ subject: 'refund', repoPath: REPO, db: await getDb(), ...(maxSources !== undefined ? { maxSources } : {}) });
	assert.equal(prep.kind, 'narrow-llm');
	if (prep.kind !== 'narrow-llm') throw new Error('unreachable');
	const src = prep.prepared.validEntityIds[0]!;
	return finalizeDocConstraintEnumerate(prep.prepared, {
		subject: 'refund', notFoundNote: '',
		constraints: [1, 2, 3].map(n => ({ constraint: `rule ${n}`, kind: 'must' as const, sourceEntityId: src, file: 'docs/policy.md', heading: 'Refund policy', rationale: '' })),
	});
}

async function docDecisions(maxSources?: number): Promise<ExplorationOutput> {
	const prep = await prepareDocDecisionTrace({ topic: 'refund', repoPath: REPO, db: await getDb(), ...(maxSources !== undefined ? { maxSources } : {}) });
	assert.equal(prep.kind, 'narrow-llm');
	if (prep.kind !== 'narrow-llm') throw new Error('unreachable');
	const src = prep.prepared.validEntityIds[0]!;
	return finalizeDocDecisionTrace(prep.prepared, {
		topic: 'refund', notFoundNote: '',
		decisions: [1, 2].map(n => ({ decision: `decision ${n}`, sourceEntityId: src, file: 'docs/policy.md', heading: 'Refund policy', rationale: '' })),
	} as Parameters<typeof finalizeDocDecisionTrace>[1]);
}

async function capability(limit?: number): Promise<ExplorationOutput> {
	const prep = await prepareCapabilityReuseCheck(exp('capability.reuse-check', { capability: 'pay charge', ...(limit !== undefined ? { limit } : {}) }), ctx);
	assert.equal(prep.kind, 'narrow-llm');
	if (prep.kind !== 'narrow-llm') throw new Error('unreachable');
	return finalizeCapabilityReuseCheck(prep.prepared, {
		verdicts: prep.prepared.profiles.map(p => ({ path: p.path, verdict: 'partial-match' as const, rationale: 'r' })),
	} as Parameters<typeof finalizeCapabilityReuseCheck>[1], undefined);
}

/** A connection pool holding one rdbms connection whose listing the driver cut. */
function standInPool(listing: { tables: { name: string; kind: string }[]; truncated: boolean }): Parameters<typeof runDbTablesList>[2] {
	const driver = {
		family: 'rdbms', kind: 'sqlite',
		listTables: async () => listing,
		describe: async () => ({ columns: [{ name: 'id', type: 'INTEGER' }, { name: 'amount', type: 'REAL' }] }),
	};
	const pool = {
		list: () => [{ id: 'app', kind: 'sqlite', family: 'rdbms', label: 'app' }],
		acquire: async (connectionId: string) => {
			if (connectionId !== 'app') throw new Error(`unknown connection '${connectionId}'`);
			return driver;
		},
	};
	return (async () => pool) as unknown as Parameters<typeof runDbTablesList>[2];
}

const loopStandIn = (async () => ({
	rawBundle: { system: 's', focus: 'f', summary: 'found things', structure: '', surface: '', artefacts: '', upstream: '' },
	toolCallCount: 4,
})) as unknown as Parameters<typeof runFreeformProbe>[2];

// ---------------------------------------------------------------------------
// The table: all twenty lookup types
// ---------------------------------------------------------------------------

const TABLE: Record<Exclude<ExplorationType, never>, { basis: Completeness['basis']; run: () => Promise<ExplorationOutput> }> = {
	'concept.resolve':          { basis: 'graph',          run: () => runConceptResolve(exp('concept.resolve', { query: 'pay charge' }), ctx) },
	'module.profile':           { basis: 'filesystem',     run: () => runModuleProfile(exp('module.profile', { path: join(REPO, 'src/pay') }), ctx) },
	'symbol.locate':            { basis: 'graph',          run: () => runSymbolLocate(exp('symbol.locate', { names: ['chargeCard'] }), ctx) },
	'import.graph':             { basis: 'graph',          run: () => runImportGraph(exp('import.graph', { path: join(REPO, 'src/pay') }), ctx) },
	'doc.mention':              { basis: 'doc-index',      run: () => runDocMention(exp('doc.mention', { subject: 'refund' }), ctx) },
	'doc.decision.trace':       { basis: 'doc-index',      run: () => docDecisions() },
	'doc.constraint.enumerate': { basis: 'doc-index',      run: () => docConstraints() },
	'usage.example':            { basis: 'graph',          run: () => runUsageExample(exp('usage.example', { entityId: seeded['charge']!.id }), ctx) },
	'class.hierarchy':          { basis: 'graph',          run: () => runClassHierarchy(exp('class.hierarchy', { symbolName: 'Base0' }), ctx) },
	'capability.reuse-check':   { basis: 'graph',          run: () => capability() },
	'search.text':              { basis: 'text',           run: () => runSearchText(exp('search.text', { pattern: 'needle' }), ctx) },
	'convention.detect':        { basis: 'graph',          run: () => runConventionDetect(exp('convention.detect', { path: join(REPO, 'src/pay') }), ctx) },
	'config.trace':             { basis: 'text',           run: () => runConfigTrace(exp('config.trace', { key: 'pay.key' }), ctx) },
	'test.locate':              { basis: 'graph',          run: () => runTestLocate(exp('test.locate', { subject: 'chargeCard' }), ctx) },
	'data-model.trace':         { basis: 'graph',          run: () => runDataModelTrace(exp('data-model.trace', { entityName: 'Model' }), ctx) },
	'db.connections.list':      { basis: 'data-source',    run: () => runDbConnectionsList(exp('db.connections.list', {}), ctx, standInPool({ tables: [], truncated: false })) },
	'db.tables.list':           { basis: 'data-source',    run: () => runDbTablesList(exp('db.tables.list', { connectionId: 'app' }), ctx, standInPool({ tables: [{ name: 't1', kind: 'table' }], truncated: false })) },
	'db.table.describe':        { basis: 'data-source',    run: () => runDbTableDescribe(exp('db.table.describe', { connectionId: 'app', target: 't1' }), ctx, standInPool({ tables: [], truncated: false })) },
	'manifests.locate':         { basis: 'graph',          run: () => runManifestsLocate(exp('manifests.locate', {}), ctx) },
	'freeform.probe':           { basis: 'model-directed', run: () => runFreeformProbe(exp('freeform.probe', { purpose: 'find things', shaperId: 'code' }), ctx, loopStandIn) },
};

test('a table test over all twenty lookup types finds a completeness record with its stated basis', async () => {
	// The table is the executor's registry: a lookup registered later fails here until it is given a row.
	assert.deepEqual(Object.keys(TABLE).sort(), Object.keys(_getRunnersForTest()).sort());
	assert.equal(Object.keys(TABLE).length, 20);

	for (const [type, row] of Object.entries(TABLE)) {
		const out = await row.run();
		assert.equal(out.type, type, `${type}: the runner returned its own output type`);
		const c = (out as { completeness?: Completeness }).completeness;
		assert.ok(c !== undefined, `${type}: carries a completeness record`);
		assert.equal(typeof c.complete, 'boolean', `${type}: complete is stated`);
		assert.equal(typeof c.returned, 'number', `${type}: returned is stated`);
		assert.ok(c.total === null || typeof c.total === 'number', `${type}: total is a number or null`);
		assert.equal(c.basis, row.basis, `${type}: rests on ${row.basis}`);
		// The record was built by the builder: `complete` agrees with what it lists.
		const leftOut = (c.limited?.length ?? 0) + (c.skipped?.length ?? 0) + (c.partlyRead?.length ?? 0);
		if (leftOut > 0) assert.equal(c.complete, false, `${type}: lists something left out, so it is not complete`);
		// Every graph-based result says what the graph itself does not establish.
		if (row.basis === 'graph') {
			assert.ok(c.basisNote?.startsWith(GRAPH_BASIS_NOTE), `${type}: carries the graph's coverage note`);
		}
	}
});

test('the fixture gives every lookup something to return, so the table is not a table of empty results', async () => {
	const returned: Record<string, number> = {};
	for (const [type, row] of Object.entries(TABLE)) {
		returned[type] = ((await row.run()) as { completeness: Completeness }).completeness.returned;
	}
	const empty = Object.entries(returned).filter(([, n]) => n === 0).map(([t]) => t);
	assert.deepEqual(empty, [], `lookups that returned nothing: ${JSON.stringify(returned)}`);
});

// ---------------------------------------------------------------------------
// Count limits, each with its scope
// ---------------------------------------------------------------------------

test('each lookup that stops at a count reports the limit with its scope', async () => {
	// symbol.locate: two functions are named chargeCard, one is kept.
	const sym = await runSymbolLocate(exp('symbol.locate', { names: ['chargeCard'], limit: 1 }), ctx);
	assert.equal(sym.hits.length, 1);
	assert.deepEqual(limitOf(sym.completeness, 'symbols'), { what: 'symbols', limit: 1, scope: 'overall', reason: '2 symbols were found and 1 are kept' });
	assert.equal(sym.completeness.total, 2);
	assert.equal(sym.completeness.complete, false);
	// ...and within the limit nothing is reported and the result is complete.
	const symAll = await runSymbolLocate(exp('symbol.locate', { names: ['chargeCard'] }), ctx);
	assert.equal(symAll.completeness.limited, undefined);
	assert.equal(symAll.completeness.complete, true);
	assert.equal(symAll.completeness.total, 2);

	// usage.example: three callers, two kept. The total the old `totalCallers` field held is in the record.
	const use = await runUsageExample(exp('usage.example', { entityId: seeded['charge']!.id, topK: 2 }), ctx);
	assert.equal(use.callers.length, 2);
	assert.equal(limitOf(use.completeness, 'callers').scope, 'overall');
	assert.equal(use.completeness.total, 3);
	assert.equal(use.completeness.total, use.totalCallers);

	// usage.example by an ambiguous name: the callers of one definition are read and the other is named as skipped.
	const amb = await runUsageExample(exp('usage.example', { symbolName: 'chargeCard' }), ctx);
	assert.equal(amb.completeness.complete, false);
	assert.match(amb.completeness.skipped![0]!.what, /^1 other entity named chargeCard$/);

	// import.graph: two lists, each cut to topK: a limit on each list, not on their sum.
	const imp = await runImportGraph(exp('import.graph', { path: join(REPO, 'src/pay'), topK: 1 }), ctx);
	assert.equal(imp.summary.topImporters.length, 1);
	assert.equal(imp.summary.topImportees.length, 1);
	assert.equal(limitOf(imp.completeness, 'importing files').scope, 'per-group');
	assert.equal(limitOf(imp.completeness, 'imported files').scope, 'per-group');
	assert.equal(imp.completeness.returned, 2);
	assert.equal(imp.completeness.total, 4);

	// test.locate: three hits (two test functions and their file), one kept; the rest are still counted.
	const tst = await runTestLocate(exp('test.locate', { subject: 'chargeCard', topK: 1 }), ctx);
	assert.equal(tst.hits.length, 1);
	assert.equal(limitOf(tst.completeness, 'tests').limit, 1);
	assert.equal(tst.completeness.total, 3);

	// concept.resolve: more candidates match than the one kept.
	const con = await runConceptResolve(exp('concept.resolve', { query: 'pay charge', limit: 1 }), ctx);
	assert.equal(con.hits.length, 1);
	assert.equal(limitOf(con.completeness, 'matches').scope, 'overall');
	assert.ok(con.completeness.total! > 1);

	// manifests.locate: two manifests, one kept; `families` still counts the ones returned.
	const man = await runManifestsLocate(exp('manifests.locate', { topK: 1 }), ctx);
	assert.equal(man.hits.length, 1);
	assert.equal(limitOf(man.completeness, 'manifests').limit, 1);
	assert.equal(man.completeness.total, 2);
	assert.equal(Object.values(man.families).reduce((a, b) => a + b, 0), 1);

	// convention.detect: nine bases, eight kept; one base has six subclasses and five are named.
	const conv = await runConventionDetect(exp('convention.detect', { path: join(REPO, 'src/pay') }), ctx);
	assert.equal(conv.baseClassIdioms.length, 8);
	assert.equal(limitOf(conv.completeness, 'base-class idioms').scope, 'overall');
	assert.equal(conv.completeness.total, 9);
	const named = limitOf(conv.completeness, 'named subclasses per base');
	assert.deepEqual([named.limit, named.scope], [5, 'per-group']);

	// doc.mention: the retrieval returns a full page and cannot say how many more match.
	const men = await runDocMention(exp('doc.mention', { subject: 'refund', limit: 1 }), ctx);
	assert.equal(men.hits.length, 1);
	assert.equal(limitOf(men.completeness, 'document sections').scope, 'overall');
	assert.equal(men.completeness.total, null, 'how many sections exist is not known');

	// The document lookups read at most maxSources sections: a limit on what was READ.
	// Three constraints come back from one section, and that is not a contradiction.
	const cons = await docConstraints(1) as { completeness: Completeness; constraints: unknown[] };
	assert.equal(cons.constraints.length, 3);
	assert.deepEqual([limitOf(cons.completeness, 'document sections').limit, limitOf(cons.completeness, 'document sections').scope], [1, 'source']);
	const decs = await docDecisions(1) as { completeness: Completeness };
	assert.equal(limitOf(decs.completeness, 'document sections').scope, 'source');
	// With room for every section, neither reports a limit.
	assert.equal(((await docConstraints()) as { completeness: Completeness }).completeness.complete, true);

	// capability.reuse-check: more distinct candidates match than the one checked.
	const cap = await capability(1) as { completeness: Completeness; candidates: unknown[] };
	assert.equal(cap.candidates.length, 1);
	assert.equal(limitOf(cap.completeness, 'candidate modules').limit, 1);
});

test('data-model.trace reports its overall limit and both per-target limits', async () => {
	const out = await runDataModelTrace(exp('data-model.trace', { entityName: 'Model' }), ctx);
	assert.equal(out.nodes.length, 4, 'five classes are named Model and four are traced');
	const first = out.nodes.find(n => n.entityId === seeded['model0']!.id)!;
	assert.equal(first.fields.length, 12, 'thirteen fields, twelve kept');
	assert.equal(first.topCallers.length, 6, 'seven callers, six kept');

	assert.deepEqual(limitOf(out.completeness, 'targets'), { what: 'targets', limit: 4, scope: 'overall', reason: '5 targets were found and 4 are kept' });
	assert.deepEqual(limitOf(out.completeness, 'fields per target'), { what: 'fields per target', limit: 12, scope: 'per-group', reason: 'a target has 13 fields and 12 are kept for each' });
	assert.deepEqual(limitOf(out.completeness, 'callers per target'), { what: 'callers per target', limit: 6, scope: 'per-group', reason: 'a target has 7 callers and 6 are kept for each' });
	assert.equal(out.completeness.limited!.length, 3);
	assert.equal(out.completeness.total, 5);
	assert.equal(out.completeness.complete, false);
});

// ---------------------------------------------------------------------------
// The text lookups and the search's omissions
// ---------------------------------------------------------------------------

test("search.text and config.trace turn the search's omissions into skipped, partlyRead and limited", async () => {
	// Limit reached: six lines match in files the search reads, three are kept.
	const cut = await runSearchText(exp('search.text', { pattern: 'needle', topK: 3 }), ctx);
	assert.equal(cut.hits.length, 3);
	assert.equal(cut.completeness.complete, false);
	const hitLimit = limitOf(cut.completeness, 'hits');
	assert.deepEqual([hitLimit.limit, hitLimit.scope], [3, 'overall']);
	assert.equal(cut.completeness.total, null, 'the search stopped, so how many lines match is not known');
	assert.equal(cut.completeness.returned, 3);

	// Room for every hit: the long line is a hit, cut to 500, and named with its real length.
	const all = await runSearchText(exp('search.text', { pattern: 'needle', topK: 50 }), ctx);
	const longHit = all.hits.find(h => h.text.length === 500);
	assert.ok(longHit, 'the 907-character line is among the hits, cut to 500');
	const partly = all.completeness.partlyRead ?? [];
	assert.deepEqual(partly, [{ what: 'src/pay/charge.ts:4', readChars: 500, totalChars: 907 }]);
	assert.equal(all.completeness.complete, false, 'a shortened line makes the result incomplete');
	// What the backend never reads is stated, whichever backend ran.
	assert.match(all.completeness.basisNote ?? '', /^Not searched, by rule: /);
	if (all.backend === 'node') {
		// The Node search skips the file over 2 MB and says so.
		assert.deepEqual(all.completeness.skipped, [{ what: 'big.bin', reason: 'the file is over the 2 MB size limit' }]);
	}

	// config.trace goes through the same search and the same record.
	const cfg = await runConfigTrace(exp('config.trace', { key: 'pay.key', topK: 1 }), ctx);
	assert.equal(cfg.hits.length, 1);
	assert.equal(limitOf(cfg.completeness, 'hits').limit, 1);
	assert.equal(cfg.completeness.basis, 'text');
	const cfgAll = await runConfigTrace(exp('config.trace', { key: 'pay.key' }), ctx);
	assert.equal(cfgAll.hits.length, 2);
	assert.equal(cfgAll.completeness.limited, undefined, 'both hits fit, so no limit is reported');
	assert.equal(cfgAll.completeness.partlyRead, undefined);
	// Within the limit the result is complete, unless the search itself skipped a
	// file: the Node search skips big.bin for its size, and that is not complete.
	assert.equal(cfgAll.completeness.complete, cfgAll.completeness.skipped === undefined);
	if (cfgAll.backend === 'node') {
		assert.deepEqual(cfgAll.completeness.skipped, [{ what: 'big.bin', reason: 'the file is over the 2 MB size limit' }]);
	}
});

// ---------------------------------------------------------------------------
// The data lookups
// ---------------------------------------------------------------------------

test("the table-listing lookup reads the data driver's cut flag into a limit", async () => {
	const tables = [{ name: 'a', kind: 'table' }, { name: 'b', kind: 'table' }];

	const cut = await runDbTablesList(exp('db.tables.list', { connectionId: 'app', limit: 2 }), ctx, standInPool({ tables, truncated: true }));
	assert.equal(cut.truncated, true, 'the old flag is still there in this task');
	assert.deepEqual(limitOf(cut.completeness, 'tables'), {
		what: 'tables', limit: 2, scope: 'overall', reason: 'the lookup stops at 2 tables; how many exist is not known',
	});
	assert.equal(cut.completeness.total, null);
	assert.equal(cut.completeness.complete, false);

	const whole = await runDbTablesList(exp('db.tables.list', { connectionId: 'app', limit: 2 }), ctx, standInPool({ tables, truncated: false }));
	assert.equal(whole.completeness.limited, undefined);
	assert.equal(whole.completeness.complete, true);
	assert.equal(whole.completeness.total, 2);

	// A connection that cannot be opened: what it holds is not known, and the record says why.
	const missing = await runDbTablesList(exp('db.tables.list', { connectionId: 'nope' }), ctx, standInPool({ tables, truncated: false }));
	assert.deepEqual(missing.tables, []);
	assert.equal(missing.completeness.complete, false);
	assert.match(missing.completeness.basisNote ?? '', /unknown connection 'nope'/);
});

// ---------------------------------------------------------------------------
// The facts a lookup carries from prepare to finalize
// ---------------------------------------------------------------------------

test('a prepared value without the carried facts gives a record that is not established', () => {
	const c = carriedCompleteness(3, 'doc-index', undefined);
	assert.equal(c.complete, false);
	assert.equal(c.returned, 3);
	assert.match(c.basisNote ?? '', /was not carried from its first step/);
	// With the facts carried and nothing left out, the record is complete.
	assert.equal(carriedCompleteness(3, 'doc-index', { limited: [], skipped: [] }).complete, true);
});
