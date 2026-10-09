/**
 * The code tasks keep to the area their scope names (Story s7, task t5).
 *
 * The three code tasks that have a scope of their own resolve it through the
 * one scope function and read only the entities of that area; the adherence
 * check, shared by three families, takes its repo from the same function.
 *
 * A temporary LMDB graph store; a stand-in model; no network.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getDb } from '../../../../db/client.js';
import { upsertEntities } from '../../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';
import { addRepo } from '../../../../db/repos.js';
import { makeEntityId } from '../../../../indexer/parser/base.js';
import type { AnalyzeScopeRef, ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { Entity, EntityKind, LLMProvider } from '../../../../shared/types.js';
import { ScopeNotIndexedError } from '../../../context/invariants.js';
import { runWithRoutingContext } from '../../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../../context/shaper-provider.js';
import type { PlannedTask, TemplateExecuteArgs, TemplateRuntime } from '../../../executor/types.js';
import { dataAdherenceCheckRuntime } from '../../data/adherence-check.js';
import { infraAdherenceCheckRuntime } from '../../infra/adherence-check.js';
import { codeAdherenceCheckRuntime } from '../adherence-check.js';
import { codeDiscoveryEntrypointsRuntime } from '../discovery-entrypoints.js';
import { codeDiscoveryModulesRuntime } from '../discovery-modules.js';
import { codeStructureModuleTreeRuntime } from '../structure-module-tree.js';

const NOW = '2026-10-09T10:00:00.000Z';

let dir: string;
let REPO: string;
let ids: Record<string, string> = {};

function ent(kind: EntityKind, name: string, rel: string, extra: Partial<Entity> = {}): Entity {
	const file = join(REPO, rel);
	const e = {
		id: makeEntityId(REPO, file, kind, name), kind, name, language: 'typescript', repoId: 0, repo: REPO, file,
		startLine: 1, endLine: 5, body: `// ${name} settles a refund`, embedding: [], indexedAt: NOW, ...extra,
	} as Entity;
	ids[name] = e.id;
	return e;
}

function args(templateId: string, scopeRef: AnalyzeScopeRef, params: Record<string, unknown> = { scopeRef }): TemplateExecuteArgs {
	const task = { taskId: 't01', template: templateId, kind: 'leaf', params, produces: [], rationale: 'test' } as unknown as PlannedTask;
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: true, focus: 'refunds', scopeRef, reasoning: 'test' };
	return { task, intent, upstreamOutputs: new Map(), runId: 'r1' };
}

/** The names a code task returned under one of its outputs. */
async function names(runtime: TemplateRuntime, scopeRef: AnalyzeScopeRef, output: string): Promise<string[]> {
	const result = await runtime.execute(args(runtime.templateId, scopeRef));
	return (result.outputs.get(output) as Array<{ name: string }>).map(r => r.name).sort();
}

/** The names of the module tree's nodes. */
async function treeNodes(scopeRef: AnalyzeScopeRef): Promise<string[]> {
	const result = await codeStructureModuleTreeRuntime.execute(args('code.structure.module-tree', scopeRef));
	return (result.outputs.get('module-tree') as { modules: Array<{ name: string }> }).modules.map(m => m.name).sort();
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-scope-area-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'ready' });
	ids = {};
	// Two modules, each with a file and exported functions; `pay` has a second file.
	// `payments` shares the prefix `pay` and must not be taken for part of it.
	await upsertEntities(await getDb(), [
		ent('module', 'pay', 'pay/package.json'),
		ent('file', 'settle.ts', 'pay/settle.ts'),
		ent('function', 'settleRefund', 'pay/settle.ts', { isExported: true, startLine: 3 }),
		ent('function', 'settleInvoice', 'pay/settle.ts', { isExported: true, startLine: 9 }),
		ent('file', 'ledger.ts', 'pay/ledger.ts'),
		ent('function', 'postLedger', 'pay/ledger.ts', { isExported: true }),
		ent('module', 'payments', 'payments/package.json'),
		ent('file', 'report.ts', 'payments/report.ts'),
		ent('function', 'reportRefunds', 'payments/report.ts', { isExported: true }),
		// What the data and the infra adherence checks read: a schema and a manifest.
		ent('document', 'schema.prisma', 'prisma/schema.prisma', { language: 'prisma', artifact: true, body: 'model Refund { id Int } // settleRefund table' }),
		ent('document', 'deploy.yaml', 'k8s/deploy.yaml', { language: 'yaml', artifact: true, body: 'kind: Deployment # settleRefund worker' }),
	]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test("a code task with a module scope uses only the entities under that directory, with a file scope only that file's, with a symbol scope the one entity", async () => {
	const repo:    AnalyzeScopeRef = { kind: 'repo', value: REPO };
	const module_: AnalyzeScopeRef = { kind: 'module', value: join(REPO, 'pay') };
	const file:    AnalyzeScopeRef = { kind: 'file', value: join(REPO, 'pay/settle.ts') };
	const symbol:  AnalyzeScopeRef = { kind: 'symbol', value: `${join(REPO, 'pay/settle.ts')}#settleRefund` };

	// --- entry points: the exported functions of the area ---
	const entry = (s: AnalyzeScopeRef) => names(codeDiscoveryEntrypointsRuntime, s, 'entrypoints');
	assert.deepEqual(await entry(repo), ['postLedger', 'reportRefunds', 'settleInvoice', 'settleRefund'], 'a repo scope: everything, as before');
	assert.deepEqual(await entry(module_), ['postLedger', 'settleInvoice', 'settleRefund'], 'a module scope: under pay/, not under payments/');
	assert.deepEqual(await entry(file), ['settleInvoice', 'settleRefund'], "a file scope: that file's");
	assert.deepEqual(await entry(symbol), ['settleRefund'], 'a symbol scope: the one entity');

	// The one entity is the one the scope resolved to, by id.
	const one = await codeDiscoveryEntrypointsRuntime.execute(args('code.discovery.entrypoints', symbol));
	assert.deepEqual((one.outputs.get('entrypoints') as Array<{ entityId: string }>).map(e => e.entityId), [ids['settleRefund']]);

	// --- modules ---
	const mods = (s: AnalyzeScopeRef) => names(codeDiscoveryModulesRuntime, s, 'modules');
	assert.deepEqual(await mods(repo), ['pay', 'payments']);
	assert.deepEqual(await mods(module_), ['pay']);
	assert.deepEqual(await mods(file), [], 'no module entity is in the one source file');
	assert.deepEqual(await mods(symbol), []);

	// --- the module tree: its nodes are the modules of the area ---
	const tree = (s: AnalyzeScopeRef) => treeNodes(s);
	assert.deepEqual(await tree(repo), ['pay', 'payments']);
	assert.deepEqual(await tree(module_), ['pay']);
	assert.deepEqual(await tree(file), []);
	assert.deepEqual(await tree(symbol), []);

	// A workspace scope on the repo's directory reads everything, as a repo scope does.
	const workspace: AnalyzeScopeRef = { kind: 'workspace', value: REPO };
	assert.deepEqual(await entry(workspace), await entry(repo));
	assert.deepEqual(await mods(workspace), ['pay', 'payments']);
	assert.deepEqual(await tree(workspace), ['pay', 'payments']);

	// A directory scope that IS a module directory but is given as a manifest directory keeps to it too.
	assert.deepEqual(await entry({ kind: 'manifest-dir', value: join(REPO, 'payments') }), ['reportRefunds']);
});

// ---------------------------------------------------------------------------
// The adherence check
// ---------------------------------------------------------------------------

/** A model that keeps what it was asked and judges nothing. */
function recordingModel(): { routing: RoutingSeamContext; prompts: string[] } {
	const prompts: string[] = [];
	const model = {
		completeStructured: async (messages: ReadonlyArray<{ content: unknown }>) => {
			prompts.push(messages.map(m => String(m.content)).join('\n'));
			return { summary: 'judged', matches: [], drifts: [], missingImpl: [], contradictions: [] };
		},
	} as unknown as LLMProvider;
	return { routing: { router: { resolveProviderForRole: () => ({ provider: model }) } } as unknown as RoutingSeamContext, prompts };
}

const CONSTRAINTS = [{ constraint: 'refunds MUST be issued within 30 days' }];
/** Each family's check, the parameter that names its subject, and the entity of the repo it reads for it. */
const CHECKS: ReadonlyArray<[TemplateRuntime, string, RegExp]> = [
	[codeAdherenceCheckRuntime, 'codeSubject', /settleRefund settles a refund/],
	[dataAdherenceCheckRuntime, 'dataSubject', /model Refund \{ id Int \} \/\/ settleRefund table/],
	[infraAdherenceCheckRuntime, 'infraSubject', /kind: Deployment # settleRefund worker/],
];

test('the adherence check gives the same result for a repo scope as before, as a code, a data and an infra template, and as a data template on an unregistered directory is not refused', async () => {
	const repo: AnalyzeScopeRef = { kind: 'repo', value: REPO };

	// A repo scope: each family's check reads the repo the scope names, as it did
	// when it took the scope's value: the model is shown that repo's entity.
	for (const [runtime, subjectKey, excerpt] of CHECKS) {
		const { routing, prompts } = recordingModel();
		const result = await runWithRoutingContext(routing, () =>
			runtime.execute(args(runtime.templateId, repo, { [subjectKey]: 'settleRefund', constraints: CONSTRAINTS })));
		assert.equal(prompts.length, 1, `${runtime.templateId}: the model judged once`);
		assert.match(prompts[0]!, excerpt, `${runtime.templateId}: the excerpt of the repo's entity`);
		assert.match(prompts[0]!, /refunds MUST be issued within 30 days/, runtime.templateId);
		const report = result.outputs.get('adherence-report') as Record<string, unknown>;
		assert.equal(report[subjectKey], 'settleRefund', runtime.templateId);
		assert.deepEqual([report['matches'], report['drifts'], report['contradictions']], [[], [], []], runtime.templateId);
	}

	// A directory that no registered repo contains (the registry is read and holds one).
	const elsewhere: AnalyzeScopeRef = { kind: 'repo', value: join(dir, 'elsewhere') };
	// A data check and an infra check do not read the stored graph for their own
	// work, so they are not checked for an index: they go on with the directory.
	for (const [runtime, subjectKey] of CHECKS.slice(1)) {
		const { routing, prompts } = recordingModel();
		const result = await runWithRoutingContext(routing, () =>
			runtime.execute(args(runtime.templateId, elsewhere, { [subjectKey]: 'settleRefund', constraints: CONSTRAINTS })));
		assert.ok(result.outputs.size > 0, `${runtime.templateId}: not refused`);
		assert.doesNotMatch(prompts.join('\n'), /settleRefund (table|worker)/, `${runtime.templateId}: nothing of the registered repo is read for another directory`);
	}
	// A code check on that directory is refused: its scope has to be indexed.
	const { routing } = recordingModel();
	await assert.rejects(
		runWithRoutingContext(routing, () =>
			codeAdherenceCheckRuntime.execute(args('code.adherence.check', elsewhere, { codeSubject: 'settleRefund', constraints: CONSTRAINTS }))),
		(err: Error) => err instanceof ScopeNotIndexedError,
	);
});
