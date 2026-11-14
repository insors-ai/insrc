import { executeSavedPlan as executePlan, stepSavedPlan as stepPlan } from '../../__tests__/fixtures/saved-exploration-executor.js';
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

import { savedAnalysisExecution } from '../../connection-access.js';
import { leasedDataPool } from '../../__tests__/fixtures/leased-data-pool.js';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
import { carriedCompleteness, GRAPH_BASIS_NOTE, graphCompleteness } from '../completeness-facts.js';
import { withWriteTxn } from '../../../db/graph/store.js';
import { updateIndexStateRowInTxn } from '../../../db/graph/index-state-rows.js';
import { lookupRepoId } from '../../../db/repos.js';
import { completenessOf, readIndexState } from '../../../db/index-state.js';
import type { RepoCompleteness } from '../../../shared/types.js';
import { readFileSync } from 'node:fs';
import { runConceptResolve } from '../concept-resolve.js';
import { runConfigTrace } from '../config-trace.js';
import { LookupFailedError } from '../lookup-failed.js';
import { runConventionDetect } from '../convention-detect.js';
import { runDataModelTrace } from '../data-model-trace.js';
import { runDbConnectionsList } from '../db-connections-list.js';
import { runDbTableDescribe } from '../db-table-describe.js';
import { runDbTablesList } from '../db-tables-list.js';
import { finalizeDocConstraintEnumerate, prepareDocConstraintEnumerate } from '../doc-constraint-enumerate.js';
import { finalizeDocDecisionTrace, prepareDocDecisionTrace } from '../doc-decision-trace.js';
import { runDocMention } from '../doc-mention.js';
import { _getRunnersForTest, _overrideNarrowRunnerForTest, _overrideRunnerForTest, failedOutput } from '../executor.js';
import { runFreeformProbe } from '../freeform-probe.js';
import { runImportGraph } from '../import-graph.js';
import { runManifestsLocate } from '../manifests-locate.js';
import { runModuleProfile } from '../module-profile.js';
import { runCompleteSearch, runSearchText } from '../search-text.js';
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
		connectionExecution: savedAnalysisExecution(REPO),
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
 return async root=>leasedDataPool(root,[{id:'app',kind:'sqlite',family:'rdbms',label:'app'}],connectionId=>{if(connectionId!=='app')throw new Error(`unknown connection '${connectionId}'`);return driver;});

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
		// The record is the ONE statement of completeness: the flags it replaced are gone.
		for (const gone of ['truncated', 'totalCallers', 'exhaustedNote']) {
			assert.equal(gone in out, false, `${type}: has no \`${gone}\` field`);
		}
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

test('each document and capability lookup that stops at a count reports the limit with its scope', async () => {
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
	assert.equal(((await docConstraints()) as { completeness: Completeness }).completeness.limited, undefined);

	// capability.reuse-check: more distinct candidates match than the one checked.
	const cap = await capability(1) as { completeness: Completeness; candidates: unknown[] };
	assert.equal(cap.candidates.length, 1);
	assert.equal(limitOf(cap.completeness, 'candidate modules').limit, 1);
});

// ---------------------------------------------------------------------------
// The graph and symbol lookups return every result
// ---------------------------------------------------------------------------

/** Seed entities and relations on top of the fixture. */
async function seed(entities: Entity[], relations: Relation[] = []): Promise<void> {
	await upsertEntities(await getDb(), entities);
	if (relations.length > 0) await upsertRelations(await getDb(), relations);
}

/** A lookup's record states no limit, and says so by listing none. */
function noLimit(c: Completeness, who: string): void {
	assert.equal(c.limited, undefined, `${who}: no limited entry`);
}

test('symbol-locate, test-locate, import-graph, usage-example, concept-resolve, manifests-locate, data-model-trace and convention-detect return every result at, one over and zero versus the former limit with no limited entry', async () => {
	// symbol.locate: former limit 50. A limit a plan passes is ignored.
	for (const [n, word] of [[50, 'bulksyma'], [51, 'bulksymb']] as const) {
		await seed(Array.from({ length: n }, (_, i) => ent('function', word, `src/bulk/${word}${i}.ts`)));
		const out = await runSymbolLocate(exp('symbol.locate', { names: [word], limit: 3 }), ctx);
		assert.equal(out.hits.length, n, `symbol.locate with ${n}`);
		noLimit(out.completeness, `symbol.locate with ${n}`);
		assert.equal(out.completeness.total, n);
		assert.equal(out.completeness.complete, true);
	}
	const symNone = await runSymbolLocate(exp('symbol.locate', { names: ['nosuchsymbolzz'] }), ctx);
	assert.deepEqual([symNone.hits.length, symNone.completeness.complete], [0, true]);
	noLimit(symNone.completeness, 'symbol.locate with 0');

	// test.locate: former limit 20. Test functions that name the subject.
	for (const [n, word] of [[20, 'zzalpha'], [21, 'zzbravo']] as const) {
		await seed(Array.from({ length: n }, (_, i) => ent('function', `test${word}${i}`, `src/bulk/__tests__/t${word}${i}.test.ts`)));
		const out = await runTestLocate(exp('test.locate', { subject: word, topK: 2 }), ctx);
		assert.equal(out.hits.filter(h => h.kind !== 'file').length, n, `test.locate with ${n}`);
		noLimit(out.completeness, `test.locate with ${n}`);
	}
	const tstNone = await runTestLocate(exp('test.locate', { subject: 'zznothingmatches' }), ctx);
	assert.equal(tstNone.hits.length, 0);
	noLimit(tstNone.completeness, 'test.locate with 0');

	// usage.example: former limit 12 callers.
	for (const [n, word] of [[12, 'zztargeta'], [13, 'zztargetb']] as const) {
		const target = ent('function', word, `src/bulk/${word}.ts`);
		const callers = Array.from({ length: n }, (_, i) => ent('function', `${word}Caller${i}`, `src/bulk/${word}c${i}.ts`));
		await seed([target, ...callers], callers.map(c => edge('CALLS', c, target)));
		const out = await runUsageExample(exp('usage.example', { entityId: target.id, topK: 2 }), ctx);
		assert.equal(out.callers.length, n, `usage.example with ${n}`);
		noLimit(out.completeness, `usage.example with ${n}`);
		assert.equal(out.completeness.total, n);
	}
	const lonely = ent('function', 'zzlonely', 'src/bulk/zzlonely.ts');
	await seed([lonely]);
	const useNone = await runUsageExample(exp('usage.example', { entityId: lonely.id }), ctx);
	assert.equal(useNone.callers.length, 0);
	noLimit(useNone.completeness, 'usage.example with 0');

	// import.graph: former limit 15 on each of the two lists.
	for (const [n, word] of [[15, 'zzimpa'], [16, 'zzimpb']] as const) {
		const inside = ent('file', `${word}.ts`, `src/${word}/${word}.ts`);
		const importers = Array.from({ length: n }, (_, i) => ent('file', `imp${i}.ts`, `src/${word}out/importer${i}.ts`));
		const importees = Array.from({ length: n }, (_, i) => ent('file', `dep${i}.ts`, `src/${word}out/dep${i}.ts`));
		await seed([inside, ...importers, ...importees], [
			...importers.map(f => edge('IMPORTS', f, inside)),
			...importees.map(f => edge('IMPORTS', inside, f)),
		]);
		const out = await runImportGraph(exp('import.graph', { path: join(REPO, `src/${word}`), topK: 2 }), ctx);
		assert.equal(out.summary.topImporters.length, n, `import.graph importers with ${n}`);
		assert.equal(out.summary.topImportees.length, n, `import.graph importees with ${n}`);
		noLimit(out.completeness, `import.graph with ${n}`);
	}
	const alone = ent('file', 'zzalone.ts', 'src/zzalone/zzalone.ts');
	await seed([alone]);
	const impNone = await runImportGraph(exp('import.graph', { path: join(REPO, 'src/zzalone') }), ctx);
	assert.deepEqual([impNone.summary.topImporters.length, impNone.summary.topImportees.length], [0, 0]);
	noLimit(impNone.completeness, 'import.graph with 0');

	// concept.resolve: former limit 20. Every match is returned, and the record says how many.
	for (const [n, word] of [[20, 'zzconcepta'], [21, 'zzconceptb']] as const) {
		await seed(Array.from({ length: n }, (_, i) => ent('function', `${word}${i}`, `src/${word}/f${i}.ts`)));
		const out = await runConceptResolve(exp('concept.resolve', { query: word, limit: 3 }), ctx);
		assert.ok(out.hits.length >= n, `concept.resolve with ${n} returned ${out.hits.length}`);
		assert.equal(out.completeness.total, out.hits.length, 'every match found is returned');
		noLimit(out.completeness, `concept.resolve with ${n}`);
	}
	const conNone = await runConceptResolve(exp('concept.resolve', { query: 'zznoconceptmatch' }), ctx);
	assert.equal(conNone.hits.length, 0);
	noLimit(conNone.completeness, 'concept.resolve with 0');

	// manifests.locate: former limit 200. Two manifests are in the fixture already, none of them terraform.
	assert.equal((await runManifestsLocate(exp('manifests.locate', { topK: 1 }), ctx)).hits.length, 2, 'a topK is ignored');
	let seededSoFar = 0;
	for (const [n, word] of [[200, 'zzmania'], [201, 'zzmanb']] as const) {
		await seed(Array.from({ length: n }, (_, i) => ent('document', `m${i}.tf`, `infra/${word}/m${i}.tf`, { language: 'hcl', artifact: true, body: 'resource "x" "y" {}\n' })));
		seededSoFar += n;
		const out = await runManifestsLocate(exp('manifests.locate', { families: ['terraform'] }), ctx);
		assert.equal(out.hits.filter(h => h.file.includes(`/${word}/`)).length, n, `manifests.locate with ${n}`);
		assert.equal(out.hits.length, seededSoFar, 'every terraform manifest is returned');
		noLimit(out.completeness, `manifests.locate with ${n}`);
		assert.equal(out.completeness.total, seededSoFar);
	}
	const manNone = await runManifestsLocate(exp('manifests.locate', { families: ['helm'] }), ctx);
	assert.equal(manNone.hits.length, 0);
	noLimit(manNone.completeness, 'manifests.locate with 0');

	// data-model.trace: former limits 4 targets, 12 fields and 6 callers for each target.
	for (const [n, word] of [[4, 'ZzTargetsA'], [5, 'ZzTargetsB']] as const) {
		await seed(Array.from({ length: n }, (_, i) => ent('class', word, `src/models/${word}${i}.ts`)));
		const out = await runDataModelTrace(exp('data-model.trace', { entityName: word }), ctx);
		assert.equal(out.nodes.length, n, `data-model.trace targets with ${n}`);
		noLimit(out.completeness, `data-model.trace targets with ${n}`);
	}
	for (const [n, word] of [[12, 'ZzFieldsA'], [13, 'ZzFieldsB']] as const) {
		const model = ent('class', word, `src/models/${word}.ts`);
		const fields = Array.from({ length: n }, (_, i) => ent('property' as EntityKind, `${word}f${i}`, `src/models/${word}.ts`, { startLine: 40 + i }));
		await seed([model, ...fields], fields.map(f => edge('DEFINES', model, f)));
		const out = await runDataModelTrace(exp('data-model.trace', { entityName: word }), ctx);
		assert.equal(out.nodes[0]!.fields.length, n, `data-model.trace fields with ${n}`);
		noLimit(out.completeness, `data-model.trace fields with ${n}`);
	}
	for (const [n, word] of [[6, 'ZzCallersA'], [7, 'ZzCallersB']] as const) {
		const model = ent('class', word, `src/models/${word}.ts`);
		const callers = Array.from({ length: n }, (_, i) => ent('function', `${word}Caller${i}`, `src/other/${word}c${i}.ts`));
		await seed([model, ...callers], callers.map(c => edge('CALLS', c, model)));
		const out = await runDataModelTrace(exp('data-model.trace', { entityName: word }), ctx);
		assert.equal(out.nodes[0]!.topCallers.length, n, `data-model.trace callers with ${n}`);
		noLimit(out.completeness, `data-model.trace callers with ${n}`);
	}
	const dmNone = await runDataModelTrace(exp('data-model.trace', { entityName: 'ZzNoSuchModel' }), ctx);
	assert.equal(dmNone.nodes.length, 0);
	noLimit(dmNone.completeness, 'data-model.trace with 0');

	// convention.detect: former limits 8 base-class idioms and 5 named subclasses for each. The fixture's nine bases,
	// one with six subclasses, are one over both.
	const conv = await runConventionDetect(exp('convention.detect', { path: join(REPO, 'src/pay') }), ctx);
	assert.equal(conv.baseClassIdioms.length, 9);
	assert.equal(Math.max(...conv.baseClassIdioms.map(i => i.representativeSubclasses.length)), 6);
	noLimit(conv.completeness, 'convention.detect over');
	for (const [n, word] of [[8, 'ZzBasesA'], [5, 'ZzSubsB']] as const) {
		const dir = `src/zz${word}`;
		const bases = word === 'ZzBasesA'
			? Array.from({ length: n }, (_, i) => ent('class', `${word}Base${i}`, `src/lib/${word}${i}.ts`))
			: [ent('class', `${word}Base`, `src/lib/${word}.ts`)];
		const subs = word === 'ZzBasesA'
			? bases.map((_, i) => ent('class', `${word}Sub${i}`, `${dir}/s${i}.ts`))
			: Array.from({ length: n }, (_, i) => ent('class', `${word}Sub${i}`, `${dir}/s${i}.ts`));
		await seed([...bases, ...subs], subs.map((sub, i) => edge('INHERITS', sub, bases[word === 'ZzBasesA' ? i : 0]!)));
		const out = await runConventionDetect(exp('convention.detect', { path: join(REPO, dir) }), ctx);
		assert.equal(out.baseClassIdioms.length, word === 'ZzBasesA' ? n : 1, `convention.detect with ${n} ${word}`);
		assert.equal(out.baseClassIdioms[0]!.representativeSubclasses.length, word === 'ZzBasesA' ? 1 : n);
		noLimit(out.completeness, `convention.detect with ${n} ${word}`);
	}
	const convNone = await runConventionDetect(exp('convention.detect', { path: join(REPO, 'src/zznothing') }), ctx);
	assert.equal(convNone.baseClassIdioms.length, 0);
	noLimit(convNone.completeness, 'convention.detect with 0');
});

// ---------------------------------------------------------------------------
// The text lookups and the search's omissions
// ---------------------------------------------------------------------------

test('search.text and config.trace return every hit with its whole line and no limited entry, and a timed-out search is the failed lookup output with its gathered hits', async () => {
	// A topK is ignored: all six lines match, the 907-character one whole, and the 2 MB file is searched.
	const all = await runSearchText(exp('search.text', { pattern: 'needle', topK: 3 }), ctx);
	assert.equal(all.hits.length, 6);
	assert.ok(all.hits.some(h => h.text.length === 907), 'the 907-character line is whole');
	assert.ok(all.hits.some(h => h.file.endsWith('big.bin')), 'a file over 2 MB is searched');
	assert.equal(all.completeness.limited, undefined);
	assert.equal(all.completeness.partlyRead, undefined);
	assert.equal(all.completeness.skipped, undefined);
	assert.equal(all.completeness.complete, true);
	assert.equal(all.completeness.total, 6);
	// What the backend never reads is stated once, whichever backend ran.
	assert.equal((all.completeness.basisNote ?? '').split('Not searched, by rule:').length, 2);

	const cfg = await runConfigTrace(exp('config.trace', { key: 'pay.key', topK: 1 }), ctx);
	assert.equal(cfg.hits.length, 2);
	assert.deepEqual(cfg.hits.map(h => h.text).sort(), ['const PAY_KEY = "pay.key";', 'pay.key again'], 'each line is whole');
	assert.equal(cfg.completeness.limited, undefined);
	assert.equal(cfg.completeness.complete, true);
	assert.equal(cfg.completeness.basis, 'text');

	// A search that runs past its deadline is the failed lookup, with the hits it gathered.
	const bin = mkdtempSync(join(tmpdir(), 'insrc-slow-rg-'));
	try {
		const rg = join(bin, 'rg');
		writeFileSync(rg, `#!/bin/sh\necho "${REPO}/src/pay/refund.ts:1:needle in refund"\nsleep 30\n`);
		chmodSync(rg, 0o755);
		let caught: unknown;
		await runCompleteSearch('search.text', { pattern: 'needle', root: REPO, _backend: { rgCommand: rg, rgTimeoutMs: 300 } }).catch(e => { caught = e; });
		assert.ok(caught instanceof LookupFailedError, 'the search is the failed lookup');
		// The executor turns it into the failed output: not an empty or a complete result.
		const failed = failedOutput(exp('search.text', { pattern: 'needle' }), caught);
		assert.equal(failed.type, 'failed');
		assert.equal(failed.requested, 'search.text');
		assert.match(failed.message, /did not finish/);
		assert.deepEqual(failed.partial, [{ source: "src/pay/refund.ts:1", content: 'needle in refund' }]);
	} finally {
		rmSync(bin, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// The data lookups
// ---------------------------------------------------------------------------

test("the table-listing lookup reads the data driver's cut flag into a limit", async () => {
	const tables = [{ name: 'a', kind: 'table' }, { name: 'b', kind: 'table' }];

	const cut = await runDbTablesList(exp('db.tables.list', { connectionId: 'app', limit: 2 }), ctx, standInPool({ tables, truncated: true }));
	assert.deepEqual(limitOf(cut.completeness, 'tables'), {
		what: 'tables', limit: 2, scope: 'overall', reason: 'the lookup stops at 2 tables; how many exist is not known',
	});
	assert.equal(cut.completeness.total, null);
	assert.equal(cut.completeness.complete, false);

	const whole = await runDbTablesList(exp('db.tables.list', { connectionId: 'app', limit: 2 }), ctx, standInPool({ tables, truncated: false }));
	assert.equal(whole.completeness.limited, undefined);
	assert.equal(whole.completeness.complete, true);
	assert.equal(whole.completeness.total, 2);

	// A connection that cannot be opened is a lookup that could not run: it throws
	// (the executor reports it as failed), where it used to return an empty listing.
	await assert.rejects(
		runDbTablesList(exp('db.tables.list', { connectionId: 'nope' }), ctx, standInPool({ tables, truncated: false })),
		/unknown connection 'nope'/,
	);

	// A driver that cannot list: named as skipped in the record, and the note is left empty.
	const noList = (async root => leasedDataPool(root, [], async () => ({ family: 'rdbms', kind: 'odd' }))) as unknown as Parameters<typeof runDbTablesList>[2];
	const unsupported = await runDbTablesList(exp('db.tables.list', { connectionId: 'app' }), ctx, noList);
	assert.deepEqual(unsupported.completeness.skipped, [{ what: 'the listing', reason: "Driver kind 'odd' does not implement listTables." }]);
	assert.equal(unsupported.notFoundNote, '');
	assert.equal(unsupported.completeness.complete, false);

	// A file connection has one target and no listing: that is an empty result that IS complete, and the note stays.
	const fileConn = (async root => leasedDataPool(root, [], async () => ({ family: 'file', kind: 'csv' }))) as unknown as Parameters<typeof runDbTablesList>[2];
	const single = await runDbTablesList(exp('db.tables.list', { connectionId: 'app' }), ctx, fileConn);
	assert.equal(single.completeness.complete, true);
	assert.match(single.notFoundNote, /single target/);
});

// ---------------------------------------------------------------------------
// Paths off the main one
// ---------------------------------------------------------------------------

test('every graph-based record carries the coverage note, on the paths that return early as well', async () => {
	const records: Record<string, Completeness> = {
		// No query can be formed from the words.
		'concept.resolve, no distinctive word': (await runConceptResolve(exp('concept.resolve', { query: 'the' }), ctx)).completeness,
		'test.locate, no distinctive word':     (await runTestLocate(exp('test.locate', { subject: 'the test' }), ctx)).completeness,
		// Nothing in the graph matches.
		'symbol.locate, no match':    (await runSymbolLocate(exp('symbol.locate', { names: ['noSuchSymbolAnywhere'] }), ctx)).completeness,
		'usage.example, no target':   (await runUsageExample(exp('usage.example', { symbolName: 'noSuchSymbolAnywhere' }), ctx)).completeness,
		'class.hierarchy, no target': (await runClassHierarchy(exp('class.hierarchy', { symbolName: 'NoSuchClass' }), ctx)).completeness,
		'data-model.trace, no target': (await runDataModelTrace(exp('data-model.trace', { entityName: 'NoSuchClass' }), ctx)).completeness,
		'import.graph, no file':      (await runImportGraph(exp('import.graph', { path: join(REPO, 'no/such/dir') }), ctx)).completeness,
		'convention.detect, no entity': (await runConventionDetect(exp('convention.detect', { path: join(REPO, 'no/such/dir') }), ctx)).completeness,
	};
	// The capability check when the model call did not run, and when prepare's facts were not carried.
	const prep = await prepareCapabilityReuseCheck(exp('capability.reuse-check', { capability: 'pay charge' }), ctx);
	if (prep.kind !== 'narrow-llm') throw new Error('the fixture has candidates');
	records['capability.reuse-check, model call skipped'] = finalizeCapabilityReuseCheck(prep.prepared, undefined, 'model unavailable').completeness;
	const { completenessFacts: _dropped, ...oldPrepared } = prep.prepared;
	void _dropped;
	records['capability.reuse-check, facts not carried'] = finalizeCapabilityReuseCheck(oldPrepared, { verdicts: [] } as Parameters<typeof finalizeCapabilityReuseCheck>[1], undefined).completeness;

	for (const [path, c] of Object.entries(records)) {
		assert.equal(c.basis, 'graph', path);
		assert.ok(c.basisNote?.startsWith(GRAPH_BASIS_NOTE), `${path}: carries the graph's coverage note; got "${c.basisNote}"`);
	}
	// The two that could not search say so and are not complete; the "nothing matches" ones are complete.
	assert.equal(records['concept.resolve, no distinctive word']!.complete, false);
	assert.equal(records['test.locate, no distinctive word']!.complete, false);
	assert.equal(records['symbol.locate, no match']!.complete, true);
	assert.equal(records['capability.reuse-check, model call skipped']!.complete, false);
	assert.match(records['capability.reuse-check, facts not carried']!.basisNote ?? '', /was not carried from its first step/);
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

// ---------------------------------------------------------------------------
// Epic c2ba6fa6 s1/t16 -- the relationship lookups state an incomplete repository
// ---------------------------------------------------------------------------

const COUNTS = { pending: { 'awaiting-target': 3, ambiguous: 0, 'no-candidate': 0, 'external-endpoint': 0 }, unwritable: 1, unembedded: 0, uncommittedFiles: 0 };
const INCOMPLETE: RepoCompleteness = {
	complete: false,
	reasons: ['3 relationships point at files an ignore rule excludes', '1 relationship could not be stored (source-missing: 1)'],
	counts: COUNTS, uncommittedFiles: [], generation: 2,
};
const COMPLETE: RepoCompleteness = { complete: true, reasons: [], counts: { ...COUNTS, pending: { ...COUNTS.pending, 'awaiting-target': 0 }, unwritable: 0 }, uncommittedFiles: [], generation: 2 };

/** The five lookups that walk relationships, on a found target and on their early-return path. */
const RELATIONSHIP_LOOKUPS: Record<string, (c: ExplorationRunnerContext) => Promise<ExplorationOutput>> = {
	'usage.example':              c => runUsageExample(exp('usage.example', { entityId: seeded['charge']!.id }), c),
	'usage.example, no target':   c => runUsageExample(exp('usage.example', { symbolName: 'noSuchSymbolAnywhere' }), c),
	'import.graph':               c => runImportGraph(exp('import.graph', { path: join(REPO, 'src/pay') }), c),
	'import.graph, no file':      c => runImportGraph(exp('import.graph', { path: join(REPO, 'no/such/dir') }), c),
	'class.hierarchy':            c => runClassHierarchy(exp('class.hierarchy', { symbolName: 'Base0' }), c),
	'class.hierarchy, no target': c => runClassHierarchy(exp('class.hierarchy', { symbolName: 'NoSuchClass' }), c),
	'data-model.trace':           c => runDataModelTrace(exp('data-model.trace', { entityName: 'Model' }), c),
	'data-model.trace, no target': c => runDataModelTrace(exp('data-model.trace', { entityName: 'NoSuchClass' }), c),
	'convention.detect':          c => runConventionDetect(exp('convention.detect', { path: join(REPO, 'src/pay') }), c),
	'convention.detect, no entity': c => runConventionDetect(exp('convention.detect', { path: join(REPO, 'no/such/dir') }), c),
};

const recordOf = (out: ExplorationOutput): Completeness => (out as unknown as { completeness: Completeness }).completeness;

test('s1/t16: the five relationship lookups report notEstablished with the reasons and their counts for an incomplete repository, and as today for a complete one or with no repository facts', async () => {
	for (const [name, run] of Object.entries(RELATIONSHIP_LOOKUPS)) {
		const today = recordOf(await run(ctx));
		const complete = recordOf(await run({ ...ctx, repoCompleteness: COMPLETE }));
		assert.deepEqual(complete, today, `${name}: a complete repository reports as today`);

		const incomplete = recordOf(await run({ ...ctx, repoCompleteness: INCOMPLETE }));
		assert.equal(incomplete.complete, false, `${name}: not established`);
		assert.equal(incomplete.returned, today.returned, `${name}: the same result`);
		assert.ok(incomplete.basisNote?.startsWith(GRAPH_BASIS_NOTE), `${name}: the coverage note stays first`);
		for (const reason of INCOMPLETE.reasons) assert.ok(incomplete.basisNote?.includes(reason), `${name}: names "${reason}" with its count: ${incomplete.basisNote}`);
	}
});

test('s1/t16: the executor sets the repository completeness at all three context constructions (executePlan, and stepPlan for a narrow and a deterministic lookup); none for an unregistered repository', async () => {
	// Make the repository's index complete, so the context carries a record a lookup can tell from an absent one.
	// No embedding backend runs in this test: say so, as the backfill records it (Epic c2ba6fa6 s2).
	const repoId = (await lookupRepoId(REPO))!;
	await withWriteTxn(s => { updateIndexStateRowInTxn(s, repoId, row => { row.fullIndexFinished = true; row.embeddingAvailable = false; }); });
	const expected = completenessOf(await readIndexState(REPO));
	assert.equal(expected.complete, true);

	const seen: Record<string, unknown> = {};
	const restoreRunner = _getRunnersForTest()['concept.resolve'];
	_overrideRunnerForTest('concept.resolve', async (e, c) => {
		seen[String(e.params['label'])] = c.repoCompleteness;
		return { type: 'concept.resolve', query: 'stub', hits: [] } as unknown as ExplorationOutput;
	});
	const restoreNarrow = _overrideNarrowRunnerForTest('doc.decision.trace', {
		schema: {},
		async prepare(_e: Exploration, c: ExplorationRunnerContext) { seen['narrow'] = c.repoCompleteness; throw new Error('probe: context read'); },
		finalize() { throw new Error('not reached'); },
	} as never);
	try {
		const plan = (label: string, type: ExplorationType = 'concept.resolve') => ({
			answerType: 'structural-map' as const, synthesisHint: 't',
			explorations: [{ id: `e-${label}`, type, purpose: 'test', params: { label, topic: 'x', query: 'q' } }],
		});
		await executePlan({ runId: 't16', repoPath: REPO, closureRepos: [REPO], repoLastIndexedAtMs: 1n, plan: plan('executePlan') });
		await stepPlan({ runId: 't16', repoPath: REPO, closureRepos: [REPO], repoLastIndexedAtMs: 1n, plan: plan('stepPlan') });
		await stepPlan({ runId: 't16', repoPath: REPO, closureRepos: [REPO], repoLastIndexedAtMs: 1n, plan: plan('narrow', 'doc.decision.trace') });
		const unregistered = join(dir, 'not-registered');
		await executePlan({ runId: 't16', repoPath: unregistered, closureRepos: [unregistered], repoLastIndexedAtMs: 1n, plan: plan('unregistered') });

		assert.deepEqual(seen['executePlan'], expected, 'executePlan');
		assert.deepEqual(seen['stepPlan'], expected, 'stepPlan, deterministic lookup');
		assert.deepEqual(seen['narrow'], expected, 'stepPlan, narrow lookup');
		assert.ok('unregistered' in seen && seen['unregistered'] === undefined, 'an unregistered repository has no repository facts');
	} finally {
		_overrideRunnerForTest('concept.resolve', restoreRunner);
		restoreNarrow();
	}
});

test('s1/t16: graphCompleteness gives the same record for its existing arguments, and the nine lookups that do not walk relationships do not pass repoCompleteness', () => {
	const limit = { what: 'callers', limit: 5, scope: 'overall' as const, reason: '9 callers were found and 5 are kept' };
	const cases = [
		{ returned: 0 },
		{ returned: 3, found: 3 },
		{ returned: 5, found: 9, limited: [limit] },
		{ returned: 2, skipped: [{ what: 'a.ts', reason: 'unreadable' }], rule: 'Only the closure is read.' },
		{ returned: 1, found: null },
	];
	for (const args of cases) {
		const r = graphCompleteness(args);
		assert.deepEqual(graphCompleteness({ ...args, repoCompleteness: undefined }), r, 'absent repository facts change nothing');
		assert.deepEqual(graphCompleteness({ ...args, repoCompleteness: COMPLETE }), r, 'a complete repository changes nothing');
		assert.equal(r.basis, 'graph');
		assert.equal(r.basisNote, args.rule !== undefined ? `${GRAPH_BASIS_NOTE}. ${args.rule}` : GRAPH_BASIS_NOTE);
	}
	assert.deepEqual(graphCompleteness({ returned: 0 }), { complete: true, total: 0, returned: 0, basis: 'graph', basisNote: GRAPH_BASIS_NOTE });
	assert.deepEqual(graphCompleteness({ returned: 5, found: 9, limited: [limit] }), { complete: false, total: 9, returned: 5, limited: [limit], basis: 'graph', basisNote: GRAPH_BASIS_NOTE });

	const analyze = join(dirname(new URL(import.meta.url).pathname), '..', '..');
	const nonRelationship = [
		'explore/concept-resolve.ts', 'explore/manifests-locate.ts', 'explore/symbol-locate.ts', 'explore/test-locate.ts',
		'runtimes/code/discovery-entrypoints.ts', 'runtimes/code/discovery-modules.ts', 'runtimes/code/structure-module-tree.ts',
		'runtimes/code/surface-functional.ts', 'runtimes/shared/adherence.ts',
	];
	for (const f of nonRelationship) {
		const src = readFileSync(join(analyze, f), 'utf8');   // a missing file fails the test
		assert.match(src, /graphCompleteness\(/, `${f} is a graphCompleteness caller`);
		assert.doesNotMatch(src, /repoCompleteness/, `${f} does not pass repoCompleteness`);
	}
	for (const f of ['usage-example', 'import-graph', 'class-hierarchy', 'data-model-trace', 'convention-detect']) {
		const src = readFileSync(join(analyze, 'explore', `${f}.ts`), 'utf8');
		assert.equal((src.match(/repoCompleteness: ctx\.repoCompleteness/g) ?? []).length, 2, `${f}.ts passes it at both of its calls`);
	}
});
