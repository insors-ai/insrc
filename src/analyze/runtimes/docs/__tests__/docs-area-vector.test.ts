/**
 * The vector pass of document retrieval keeps to the area (Story s7, task t8).
 *
 * For an area, retrieval asks the vector search for the nearest AMONG the
 * area's candidates. Asking for the nearest of the repo and dropping what lies
 * outside leaves a small area with no vector score at all when its sections
 * are not among the repo's nearest.
 *
 * A temporary LMDB graph store and a temporary Lance store with real vectors;
 * the embedding of the query and the model are stand-ins.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { loadLocalProviderConfig } from '../../../../config/local.js';
import { getDb } from '../../../../db/client.js';
import { upsertEntities } from '../../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../../../db/lance/conn.js';
import { _resetEntityVecCache, addEntityEmbeddings, searchEntityVecs } from '../../../../db/lance/entity-vec.js';
import type { EntityVecFilter } from '../../../../db/lance/entity-vec.js';
import { addRepo } from '../../../../db/repos.js';
import { makeEntityId } from '../../../../indexer/parser/base.js';
import type { AnalyzeScopeRef, ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../../shared/types.js';
import { runWithRoutingContext } from '../../../context/shaper-provider.js';
import type { RoutingSeamContext } from '../../../context/shaper-provider.js';
import { _setVectorPassForTest, retrieveDocSections } from '../../../docs-retrieval.js';
import type { PlannedTask, TemplateExecuteArgs, TemplateExecuteResult, TemplateRuntime } from '../../../executor/types.js';
import { docsConstraintEnumerateRuntime } from '../constraint-enumerate.js';
import { docsDecisionTraceRuntime } from '../decision-trace.js';

const NOW = '2026-10-09T10:00:00.000Z';
const DIM = loadLocalProviderConfig().embeddingDim;
/** Sections outside the area, all nearer to the query than any section of the area. */
const OUTSIDE = 60;

function vec(seed: number): Float32Array {
	const v = new Float32Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = Math.sin(seed * (i + 1) * 0.001) * 0.1;
	return v;
}

let dir: string;
let REPO: string;
let prompts: string[] = [];
let filters: EntityVecFilter[] = [];
let limitsAsked: number[] = [];

function section(name: string, rel: string, body: string): Entity {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, body);
	return {
		id: makeEntityId(REPO, file, 'section', name), kind: 'section', name, language: 'markdown', repoId: 0, repo: REPO, file,
		startLine: 1, endLine: 5, body, embedding: [], indexedAt: NOW, artifact: true,
	} as Entity;
}

const model = {
	completeStructured: async (messages: ReadonlyArray<{ content: unknown }>) => {
		prompts.push(String(messages[1]!.content));
		return { subject: 'x', topic: 'x', constraints: [], decisions: [], notFoundNote: 'none' };
	},
} as unknown as LLMProvider;
const routing = { router: { resolveProviderForRole: () => ({ provider: model }) } } as unknown as RoutingSeamContext;

function runTask(runtime: TemplateRuntime, scopeRef: AnalyzeScopeRef, params: Record<string, unknown>): Promise<TemplateExecuteResult> {
	const task = { taskId: 't01', template: runtime.templateId, kind: 'leaf', params, produces: [], rationale: 'test' } as unknown as PlannedTask;
	const intent: ClassifiedIntent = { target: 'docs', scope: 'M', focused: true, focus: 'x', scopeRef, reasoning: 'test' };
	const args: TemplateExecuteArgs = { task, intent, upstreamOutputs: new Map(), runId: 'r1' };
	return runWithRoutingContext(routing, () => runtime.execute(args));
}

const AREA_MARKERS = ['AREA-ONE', 'AREA-TWO', 'AREA-THREE'];
const areaShown = (prompt: string): string[] => AREA_MARKERS.filter(m => prompt.includes(m));
const outsideShown = (prompt: string): number => (prompt.match(/OUTSIDE-\d+/g) ?? []).length;

test.beforeEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-docs-area-vector-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	setLanceConnPath(join(dir, 'lance'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'ready' });
	prompts = [];
	filters = [];
	limitsAsked = [];

	// No body holds a word of the query ('quarterly settlement'): the keyword
	// pass finds nothing, so every result comes from the vector pass.
	const area = [
		section('One', 'docs/pay/one.md', 'AREA-ONE The ledger MUST balance.'),
		section('Two', 'docs/pay/two.md', 'AREA-TWO Entries MUST be double.'),
		section('Three', 'docs/pay/three.md', 'AREA-THREE Postings MUST be dated.'),
	];
	const outside = Array.from({ length: OUTSIDE }, (_, i) =>
		section(`Other ${i}`, `docs/other/o${i}.md`, `OUTSIDE-${i} Something else MUST hold.`));
	await upsertEntities(await getDb(), [...area, ...outside]);
	// The query's vector is vec(1). The sections outside sit next to it; the
	// area's three are farther from it than every one of those, and still near
	// enough to score (the similarity is 1 - distance / 2, floored at 0).
	await addEntityEmbeddings([
		...outside.map((e, i) => ({ id: e.id, embedding: vec(1 + (i + 1) * 0.001), repo: REPO, kind: 'section', artifact: true })),
		...area.map((e, i) => ({ id: e.id, embedding: vec(1.3 + i * 0.05), repo: REPO, kind: 'section', artifact: true })),
	]);

	// The query is embedded by a stand-in; the search is the real one, watched.
	_setVectorPassForTest({
		embedQuery: async () => Array.from(vec(1)),
		searchEntityVecs: async (queryVec, repos, limit, filter) => {
			filters.push(filter ?? 'all');
			limitsAsked.push(limit);
			return searchEntityVecs(queryVec, repos, limit, filter);
		},
	});
});

test.afterEach(async () => {
	_setVectorPassForTest(undefined);
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	rmSync(dir, { recursive: true, force: true });
});

test("a docs task with a module scope whose sections are not among the repository's nearest matches still gets them from the vector pass (mutation: search the whole repository and drop what lies outside)", async () => {
	const db = await getDb();
	const q = { db, query: 'quarterly settlement', closureRepos: [REPO], maxResults: 5, kinds: ['document', 'section'], previewChars: 0 } as const;
	const area = { directory: join(REPO, 'docs/pay') };

	// --- the premise: the area's sections are not among the repo's nearest ---
	const whole = await retrieveDocSections(q);
	assert.equal(whole.length, 5);
	assert.ok(whole.every(r => r.file.includes('/docs/other/')), 'the five nearest of the repo are all outside the area');
	// With no area the vector query is the one it was: the kinds, and no list of ids.
	assert.deepEqual(filters, [{ kinds: ['document', 'section'] }]);
	assert.deepEqual(limitsAsked, [15]);

	// --- retrieval with the area: its three sections, each scored by the vector pass ---
	filters = [];
	const within = await retrieveDocSections({ ...q, area });
	assert.deepEqual(within.map(r => r.heading).sort(), ['One', 'Three', 'Two']);
	for (const r of within) {
		assert.ok((r.diagnostics?.vectorScore ?? 0) > 0, `${r.heading}: has a vector score`);
		assert.equal(r.diagnostics?.keywordScore, undefined, `${r.heading}: no keyword of the query is in it`);
	}
	// Ranked by the vector pass: the nearest of the area first.
	assert.deepEqual(within.map(r => r.heading), ['One', 'Two', 'Three']);
	// The search was asked for the area's candidates, all of them and nothing else.
	assert.equal(filters.length, 1);
	const asked = filters[0] as { kinds: readonly string[]; ids?: readonly string[] };
	assert.deepEqual(asked.kinds, ['document', 'section']);
	assert.deepEqual([...(asked.ids ?? [])].sort(), within.map(r => r.entityId).sort());

	// --- the docs tasks with a module scope: the model is shown the area's sections ---
	const module_: AnalyzeScopeRef = { kind: 'module', value: join(REPO, 'docs/pay') };
	for (const [runtime, key, output] of [
		[docsConstraintEnumerateRuntime, 'subject', 'constraints'],
		[docsDecisionTraceRuntime, 'topic', 'decision-trace'],
	] as const) {
		prompts = [];
		const result = await runTask(runtime, module_, { [key]: 'quarterly settlement', maxSources: 5 });
		assert.equal(prompts.length, 1, `${runtime.templateId}: sections were found, so the model was asked`);
		assert.deepEqual(areaShown(prompts[0]!), AREA_MARKERS, runtime.templateId);
		assert.equal(outsideShown(prompts[0]!), 0, runtime.templateId);
		assert.equal((result.outputs.get(output) as { retrievedSectionCount: number }).retrievedSectionCount, 3, runtime.templateId);

		// A repo scope: the five nearest of the repo, as before, none of them the area's.
		prompts = [];
		await runTask(runtime, { kind: 'repo', value: REPO }, { [key]: 'quarterly settlement', maxSources: 5 });
		assert.deepEqual([areaShown(prompts[0]!), outsideShown(prompts[0]!)], [[], 5], runtime.templateId);
	}

	// --- an area with no document: no candidates, and no vector query at all ---
	filters = [];
	assert.deepEqual(await retrieveDocSections({ ...q, area: { directory: join(REPO, 'docs/none') } }), []);
	assert.deepEqual(filters, []);
});
