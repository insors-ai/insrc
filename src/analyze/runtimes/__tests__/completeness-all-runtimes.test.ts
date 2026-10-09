/**
 * Every plan-task result carries a completeness record
 * (LLD-b9d5c5c40df5a574-s1, task t9).
 *
 * The REAL runtimes run: against a temporary graph seeded with entities and
 * document summaries, a temporary repository holding real infra files, a
 * stand-in connection pool for the data runtimes, and a stand-in model
 * reached through the routing seam every runtime resolves its provider by.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { getDb } from '../../../db/client.js';
import { writeDocSummary } from '../../../db/doc-summaries.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import type { ClassifiedIntent, DocSummary } from '../../../shared/analyze-types.js';
import type { Entity, EntityKind, LLMProvider } from '../../../shared/types.js';
import { isCompletenessRecord } from '../../completeness.js';
import type { Completeness } from '../../completeness.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import type { PlannedTask, TemplateExecuteArgs, TemplateExecuteResult, TemplateRuntime } from '../../executor/types.js';
import { GRAPH_BASIS_NOTE } from '../../explore/completeness-facts.js';

import { CODE_RUNTIMES } from '../code/index.js';
import { _setDataPoolSourceForTest } from '../data/_shared.js';
import { DATA_RUNTIMES } from '../data/index.js';
import { DOCS_RUNTIMES } from '../docs/index.js';
import { GENERIC_RUNTIMES } from '../generic/index.js';
import { DEFAULT_FILE_CAP, fileWalkCompleteness } from '../infra/_shared.js';
import { INFRA_RUNTIMES } from '../infra/index.js';

const NOW = '2026-10-08T10:00:00.000Z';
const ALL: readonly TemplateRuntime[] = [...CODE_RUNTIMES, ...DATA_RUNTIMES, ...DOCS_RUNTIMES, ...GENERIC_RUNTIMES, ...INFRA_RUNTIMES];

let dir: string;
let REPO: string;
let moduleId = '';

function ent(kind: EntityKind, name: string, rel: string, extra: Partial<Entity> = {}): Entity {
	const file = join(REPO, rel);
	const id = createHash('sha256').update(`${REPO}\x00${file}\x00${kind}\x00${name}`).digest('hex').slice(0, 32);
	return { id, kind, name, language: 'typescript', repoId: 1, repo: REPO, file, startLine: 1, endLine: 5, body: `// ${name} pays`, embedding: [], indexedAt: NOW, ...extra };
}

function write(rel: string, content: string): void {
	const p = join(REPO, rel);
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, content);
}

function summary(title: string, extra: Partial<DocSummary> = {}): DocSummary {
	return {
		title, family: 'docs', kind: 'reference' as DocSummary['kind'], subjects: ['refunds'], summary: `${title} in brief`,
		keyDecisions: ['refund in full'], keyConstraints: ['refunds MUST be issued within 30 days'], relatedEntities: [],
		status: 'current', summarisedAt: NOW, modelId: 'm', contentHash: 'h', ...extra,
	};
}

function intent(): ClassifiedIntent {
	return { target: 'code', scope: 'M', focused: true, focus: 'payments', scopeRef: { kind: 'repo', value: REPO }, reasoning: 'test' };
}

function args(templateId: string, params: Record<string, unknown>, upstream: Record<string, unknown> = {}): TemplateExecuteArgs {
	const task: PlannedTask = { taskId: 't01', template: templateId, kind: 'leaf', params, produces: [], rationale: 'test' } as PlannedTask;
	return { task, intent: intent(), upstreamOutputs: new Map(Object.entries(upstream)), runId: 'r1' };
}

/** One answer that fits every schema a runtime asks the model for. */
const MODEL_ANSWER = {
	summary: 'a summary', findings: [],
	codeSubject: 'pay', dataSubject: 'pay', infraSubject: 'pay',
	matches: [], drifts: [], missingImpl: [], contradictions: [],
	subject: 'refund', topic: 'refund', constraints: [], decisions: [], notFoundNote: 'none',
};
const model = { completeStructured: async () => MODEL_ANSWER } as unknown as LLMProvider;
const routing = { router: { resolveProviderForRole: () => ({ provider: model }) } } as unknown as RoutingSeamContext;

/** Run a runtime with the stand-in model. */
function run(runtime: TemplateRuntime, a: TemplateExecuteArgs): Promise<TemplateExecuteResult> {
	return runWithRoutingContext(routing, () => runtime.execute(a));
}

/** A connection pool with one rdbms connection. */
function standInPool(opts: { truncated?: boolean } = {}): Parameters<typeof _setDataPoolSourceForTest>[0] {
	const driver = {
		family: 'rdbms', kind: 'sqlite',
		listTables: async () => ({ tables: [{ name: 'payments', kind: 'table' }, { name: 'refunds', kind: 'table' }], truncated: opts.truncated === true }),
		describe: async () => ({ columns: [{ name: 'id', type: 'INTEGER' }, { name: 'amount', type: 'REAL' }], source: 'catalog' }),
	};
	const pool = {
		reload: async () => undefined,
		list: () => [{ id: 'app', kind: 'sqlite', family: 'rdbms', label: 'app' }],
		acquire: async () => driver,
	};
	return (async () => pool) as unknown as Parameters<typeof _setDataPoolSourceForTest>[0];
}

const CONSTRAINTS = [{ constraint: 'refunds MUST be issued within 30 days' }];

/** The arguments each registered runtime is run with, by template id. */
function rowFor(templateId: string): TemplateExecuteArgs {
	const scopeRef = { kind: 'repo', value: REPO };
	const rows: Record<string, () => TemplateExecuteArgs> = {
		'code.discovery.modules':     () => args(templateId, { scopeRef }),
		'code.discovery.entrypoints': () => args(templateId, { scopeRef }),
		'code.surface.functional':    () => args(templateId, { module: moduleId }),
		'code.structure.module-tree': () => args(templateId, { scopeRef }),
		'code.adherence.check':       () => args(templateId, { codeSubject: 'pay', constraints: CONSTRAINTS }),
		'code.aggregate.report':      () => args(templateId, {}, { modules: [] }),
		'data.discovery.connections': () => args(templateId, {}),
		'data.discovery.objects':     () => args(templateId, { connectionId: 'app' }),
		'data.schema.table':          () => args(templateId, { connectionId: 'app', table: 'payments' }),
		'data.adherence.check':       () => args(templateId, { dataSubject: 'pay', constraints: CONSTRAINTS }),
		'data.aggregate.report':      () => args(templateId, {}, { connections: [] }),
		'docs.discovery.inventory':   () => args(templateId, { scopeRef }),
		'docs.family.summarise':      () => args(templateId, { family: 'docs' }),
		'docs.constraint.enumerate':  () => args(templateId, { subject: 'refund' }),
		'docs.decision.trace':        () => args(templateId, { topic: 'refund' }),
		'docs.aggregate.report':      () => args(templateId, {}, { inventory: [] }),
		'generic.aggregate.report':   () => args(templateId, {}, { anything: [] }),
		'infra.discovery.families':   () => args(templateId, { scopeRef }),
		'infra.inventory.ci':         () => args(templateId, { scopeRef }),
		'infra.inventory.docker':     () => args(templateId, { scopeRef }),
		'infra.inventory.helm':       () => args(templateId, { scopeRef }),
		'infra.inventory.kubernetes': () => args(templateId, { scopeRef }),
		'infra.inventory.terraform':  () => args(templateId, { scopeRef }),
		'infra.adherence.check':      () => args(templateId, { infraSubject: 'pay', constraints: CONSTRAINTS }),
		'infra.aggregate.report':     () => args(templateId, {}, { families: [] }),
	};
	const row = rows[templateId];
	assert.ok(row, `the table has a row for the registered runtime '${templateId}'`);
	return row();
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-completeness-runtimes-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
	_setDataPoolSourceForTest(standInPool());

	// --- real infra files, for the walk-based runtimes ---
	write('Dockerfile', 'FROM node:22\nEXPOSE 8080\n');
	write('docker-compose.yml', 'services:\n  web:\n    image: web:1\n');
	write('k8s/deploy.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: pay\n');
	write('charts/web/Chart.yaml', 'apiVersion: v2\nname: web\nversion: 1.0.0\n');
	write('charts/web/values.yaml', 'replicas: 2\n');
	write('.github/workflows/ci.yml', 'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n');
	write('infra/main.tf', 'resource "aws_s3_bucket" "pay" {\n  bucket = "pay"\n}\nvariable "region" {}\n');

	// --- graph: a module, its files and symbols, and two documents with summaries ---
	const mod = ent('module', 'pay', 'src/pay/index.ts');
	moduleId = mod.id;
	const docA = ent('section', 'Refund policy', 'docs/policy.md', { language: 'markdown', artifact: true, body: '## Refund policy\n\nRefunds MUST be issued within 30 days. We decided to refund in full.' });
	const docB = ent('document', 'pay-deploy', 'k8s/deploy.yaml', { language: 'yaml', artifact: true, body: 'kind: Deployment\n# pay service\n' });
	await upsertEntities(await getDb(), [
		mod,
		ent('file', 'index.ts', 'src/pay/index.ts'),
		ent('function', 'payInvoice', 'src/pay/index.ts', { isExported: true, startLine: 3 }),
		ent('function', 'payHelper', 'src/pay/index.ts', { startLine: 9 }),
		ent('document', 'schema.prisma', 'prisma/schema.prisma', { artifact: true, body: 'model Payment { id Int }  // pay' }),
		docA, docB,
	]);
	write('docs/policy.md', docA.body);
	await writeDocSummary(await getDb(), docA.id, REPO, summary('Refund policy'));
});

test.afterEach(async () => {
	_setDataPoolSourceForTest(undefined);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

test('a table test over every registered plan-task runtime finds a completeness record on each result', async () => {
	assert.equal(ALL.length, 25, 'twenty-five runtimes in five families (the twenty-sixth file is the aggregator they share)');
	assert.equal(new Set(ALL.map(r => r.templateId)).size, 25);

	const basisOf: Record<string, Completeness['basis']> = {};
	for (const runtime of ALL) {
		const result = await run(runtime, rowFor(runtime.templateId));
		const c = result.completeness;
		assert.ok(isCompletenessRecord(c), `${runtime.templateId}: returns a completeness record`);
		assert.ok(result.outputs.size >= 1, `${runtime.templateId}: and its output`);
		const leftOut = (c.limited?.length ?? 0) + (c.skipped?.length ?? 0) + (c.partlyRead?.length ?? 0);
		if (leftOut > 0) assert.equal(c.complete, false, `${runtime.templateId}: lists something left out, so it is not complete`);
		if (c.basis === 'graph') assert.ok(c.basisNote?.startsWith(GRAPH_BASIS_NOTE), `${runtime.templateId}: carries the graph's coverage note`);
		basisOf[runtime.templateId] = c.basis;
	}

	// What each family's results rest on.
	for (const [id, basis] of Object.entries(basisOf)) {
		const expected: Completeness['basis'] =
			id.endsWith('.aggregate.report') ? 'model-directed'
			: id.endsWith('.adherence.check') ? 'graph'
			: id.startsWith('code.') ? 'graph'
			: id.startsWith('data.') ? 'data-source'
			: id.startsWith('docs.') ? 'doc-index'
			: 'filesystem';
		assert.equal(basis, expected, id);
	}
});

test('a table test over every registered plan-task runtime still finds a completeness record on each result, with the functional-surface task given a directory path', async () => {
	// The table above gives the functional-surface task a stored module entity's id.
	// A plan writes a directory path: the same task, the same record.
	const surface = ALL.find(r => r.templateId === 'code.surface.functional')!;
	const byId = await run(surface, rowFor('code.surface.functional'));
	for (const value of [join(REPO, 'src/pay'), 'src/pay', 'src']) {
		const result = await run(surface, args('code.surface.functional', { module: value }));
		const c = result.completeness;
		assert.ok(isCompletenessRecord(c), value);
		assert.equal(c.basis, 'graph', value);
		assert.ok(c.basisNote?.startsWith(GRAPH_BASIS_NOTE), value);
		assert.equal(c.complete, true, value);
		// The directory holds the two functions the module entity's surface holds.
		const out = result.outputs.get('functional-surface') as { module: { directory: string; entityId?: string }; exports: unknown[]; internalHelpers: unknown[] };
		assert.equal(c.returned, 2, value);
		assert.equal(out.exports.length + out.internalHelpers.length, 2, value);
		assert.ok(!('entityId' in out.module), value);
	}
	assert.equal(byId.completeness.returned, 2);
	// Every other runtime of the table is run as before by the test above; the count of runtimes is unchanged.
	assert.equal(ALL.length, 25);
});

test('the fixture gives the inventories and listings something to return', async () => {
	const returned: Record<string, number> = {};
	for (const runtime of ALL) returned[runtime.templateId] = (await run(runtime, rowFor(runtime.templateId))).completeness.returned;
	// The adherence checks return what the model judged, and the stand-in model judges nothing.
	const empty = Object.entries(returned).filter(([id, n]) => n === 0 && !id.endsWith('.adherence.check')
		&& id !== 'docs.constraint.enumerate' && id !== 'docs.decision.trace').map(([id]) => id);
	assert.deepEqual(empty, [], JSON.stringify(returned));
});

// ---------------------------------------------------------------------------
// The infra inventories and the file walk's cap
// ---------------------------------------------------------------------------

test('no output of the five infra inventories has a `truncated` field; a walk that stops at its cap is a limit in the record', async () => {
	const inventories = INFRA_RUNTIMES.filter(r => r.templateId.startsWith('infra.inventory.'));
	assert.equal(inventories.length, 5);
	for (const runtime of inventories) {
		const result = await run(runtime, rowFor(runtime.templateId));
		const [output] = [...result.outputs.values()] as Record<string, unknown>[];
		assert.equal('truncated' in output!, false, `${runtime.templateId}: the output has no truncated field`);
		assert.equal(result.completeness.limited, undefined, `${runtime.templateId}: the walk did not reach its cap`);
		assert.match(result.completeness.basisNote ?? '', /^Not walked, by rule: symbolic links, and directories named .*node_modules/);
	}

	// The record every one of them builds, for a walk that stopped at its cap.
	const cut = fileWalkCompleteness(12, true);
	assert.equal(cut.complete, false);
	assert.deepEqual(cut.limited, [{
		what: 'files walked', limit: DEFAULT_FILE_CAP, scope: 'source',
		reason: `the file walk stops at ${DEFAULT_FILE_CAP} files; files beyond that were not inspected`,
	}]);
	assert.equal(cut.total, null);
	assert.equal(fileWalkCompleteness(12, false).complete, true);

	// And a runtime really takes that path when its walk stops: a repository with more files than the cap.
	const big = join(dir, 'big');
	mkdirSync(big);
	for (let i = 0; i < DEFAULT_FILE_CAP + 5; i++) writeFileSync(join(big, `f${String(i).padStart(5, '0')}.txt`), '');
	writeFileSync(join(big, 'Dockerfile'), 'FROM node:22\n');
	const docker = INFRA_RUNTIMES.find(r => r.templateId === 'infra.inventory.docker')!;
	const a = args('infra.inventory.docker', { scopeRef: { kind: 'repo', value: big } });
	const walked = await run(docker, { ...a, intent: { ...a.intent, scopeRef: { kind: 'repo', value: big } } });
	assert.equal(walked.completeness.limited?.[0]?.what, 'files walked');
	assert.equal(walked.completeness.complete, false);
});

test('discovery-families reports its per-family sample as a per-group limit and is not rejected by the builder', async () => {
	// Twelve workflow files: one family with more files than the eight it names.
	for (let i = 0; i < 12; i++) write(`.github/workflows/w${i}.yml`, 'name: w\non: [push]\njobs: {}\n');
	const families = INFRA_RUNTIMES.find(r => r.templateId === 'infra.discovery.families')!;
	const result = await run(families, rowFor('infra.discovery.families'));
	const list = result.outputs.get('families') as { name: string; fileCount: number; sampleFiles: string[] }[];
	const biggest = [...list].sort((a, b) => b.fileCount - a.fileCount)[0]!;
	assert.ok(biggest.fileCount >= 13, `a family holds ${biggest.fileCount} files`);
	assert.equal(biggest.sampleFiles.length, 8, 'the sample is still eight');

	const limit = result.completeness.limited?.find(l => l.what === 'sample files per family');
	assert.ok(limit, 'the sample is a reached limit');
	assert.deepEqual([limit.limit, limit.scope], [8, 'per-group']);
	assert.match(limit.reason, new RegExp(`a family has ${biggest.fileCount} files and 8 are named for each`));
	// `returned` counts families, which is below the per-family limit's count: no contradiction.
	assert.equal(result.completeness.returned, list.length);
	assert.equal(result.completeness.complete, false);
});

// ---------------------------------------------------------------------------
// The data runtimes
// ---------------------------------------------------------------------------

test("the object-listing plan task reads the data driver's cut flag into a limit", async () => {
	const objects = DATA_RUNTIMES.find(r => r.templateId === 'data.discovery.objects')!;

	const whole = await run(objects, rowFor('data.discovery.objects'));
	assert.equal(whole.completeness.limited, undefined);
	assert.equal(whole.completeness.complete, true);
	assert.equal(whole.completeness.returned, 2);

	_setDataPoolSourceForTest(standInPool({ truncated: true }));
	const cut = await run(objects, rowFor('data.discovery.objects'));
	assert.deepEqual(cut.completeness.limited, [{
		what: 'tables', limit: 2, scope: 'source',
		reason: 'the driver stopped its listing at 2 tables; how many more exist is not known',
	}]);
	assert.equal(cut.completeness.complete, false);
	assert.equal(cut.completeness.total, null);
	assert.equal((cut.outputs.get('objects') as unknown[]).length, 2, 'the listing itself is what it was');
});

// ---------------------------------------------------------------------------
// The aggregate-report runtimes
// ---------------------------------------------------------------------------

test("an aggregate-report runtime's record says its completeness is that of the tasks it summarises", async () => {
	const aggregates = ALL.filter(r => r.templateId.endsWith('.aggregate.report'));
	assert.equal(aggregates.length, 5);
	for (const runtime of aggregates) {
		const c = (await run(runtime, rowFor(runtime.templateId))).completeness;
		assert.equal(c.basis, 'model-directed', runtime.templateId);
		assert.equal(c.returned, 1);
		assert.match(c.basisNote ?? '', /its completeness is that of the tasks it summarises/);
	}
});
