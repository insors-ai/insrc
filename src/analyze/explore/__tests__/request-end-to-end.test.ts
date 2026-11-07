/**
 * The anchor through the real dependent runners (Story
 * 65b643840a294422/s1, task t9): the plans the decomposer prompt now
 * describes, executed by the real executor against a real graph store and
 * directory tree. No model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { measureResolvedScope } from '../../measure.js';
import { resolveScopeForTarget } from '../../context/scope.js';
import { savedAnalysisExecution } from '../../connection-access.js';
import type { Entity } from '../../../shared/types.js';
import { executeSavedPlan } from '../../__tests__/fixtures/saved-exploration-executor.js';
import type { ExecutedPlan, Exploration, ExplorationPlan } from '../types.js';

let sandbox: string;
let repo: string;
const file = (...parts: string[]): string => join(repo, ...parts);

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'request-end-to-end-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	mkdirSync(file('src', 'pay'), { recursive: true });
	mkdirSync(file('src', 'big'), { recursive: true });
	writeFileSync(file('src', 'pay', 'settle.ts'), 'export function settle() {}\n');
	writeFileSync(file('src', 'big', 'large.ts'), Array.from({ length: 6 }, (_, i) => `export function f${i}() {}`).join('\n'));
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	const fn = (id: string, f: string, name: string, line: number): Record<string, unknown> =>
		({ id, repo, file: file(f), kind: 'function', name, language: 'typescript', startLine: line, endLine: line, exported: true });
	await upsertEntities(null, [
		fn('e-settle', 'src/pay/settle.ts', 'settle', 1),
		...Array.from({ length: 6 }, (_, i) => fn(`e-big-${i}`, 'src/big/large.ts', `f${i}`, i + 1)),
	] as unknown as Entity[]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

const exp = (id: string, type: string, params: Record<string, unknown>, dependsOn?: string[]): Exploration =>
	({ id, type, purpose: 'p', params, ...(dependsOn !== undefined ? { dependsOn } : {}) }) as Exploration;

async function execute(scope: Awaited<ReturnType<typeof resolveScopeForTarget>>, explorations: Exploration[]): Promise<ExecutedPlan> {
	const plan = { answerType: 'structural-map', synthesisHint: 'h', explorations } as ExplorationPlan;
	return executeSavedPlan({
		connectionExecution: savedAnalysisExecution(repo), runId: 'r1', repoPath: repo, closureRepos: [repo],
		repoLastIndexedAtMs: 1n, plan, scope,
	});
}

const outputOf = (plan: ExecutedPlan, id: string): Record<string, unknown> =>
	plan.results.find(r => r.exploration.id === id)!.output as unknown as Record<string, unknown>;

test('a module-scope request profiles the named module through the real dependent runners even when the question shares no word with it', async () => {
	const dir = file('src', 'pay');
	const scope = await resolveScopeForTarget({ kind: 'module', value: dir }, 'code');

	// the structural-map recipe, as the decomposer prompt now writes it
	const recipe = (ref: string): Exploration[] => [
		exp('e1', 'concept.resolve', { query: 'zebra crossing' }),
		exp('e2', 'module.profile', { path: ref }, ['e1']),
		exp('e3', 'convention.detect', { path: ref }, ['e1']),
		exp('e4', 'import.graph', { path: ref }, ['e1']),
	];
	const anchored = await execute(scope, recipe('$e1.anchor.path'));
	assert.deepEqual(outputOf(anchored, 'e1')['hits'], [], 'nothing in the area shares a word with the question');
	assert.equal((outputOf(anchored, 'e1')['anchor'] as { path: string }).path, dir);
	const profile = (outputOf(anchored, 'e2')['profile'] as { path: string; entityCount: number });
	assert.equal(profile.path, dir, 'the named module was profiled');
	assert.equal(profile.entityCount, 1, 'through the containing repository');
	for (const id of ['e3', 'e4']) assert.notEqual(outputOf(anchored, id)['type'], 'failed', `${id} ran on the named module`);

	// the earlier recipe (hits[0]) had nothing to chain on and did not profile the module
	const ranked = await execute(scope, recipe('$e1.hits[0].path'));
	assert.notEqual(outputOf(ranked, 'e2')['type'], 'module.profile', 'the hits[0] recipe does not reach the module when no hit matches');
});

test('a small symbol in a large file is sized and searched as the one entity; file-level explorations are contextual', async () => {
	const large = file('src', 'big', 'large.ts');
	const scope = await resolveScopeForTarget({ kind: 'symbol', value: `${large}#f2` }, 'code');
	assert.equal(scope.entityId, 'e-big-2');

	// sized as the one entity
	const measure = await measureResolvedScope(scope, 'code');
	assert.equal(measure.items, 1, 'the symbol is one entity, not the six of its file');

	const executed = await execute(scope, [
		exp('e1', 'concept.resolve', { query: 'f2 large' }),
		exp('e2', 'usage.example', { entityId: '$e1.anchor.entityId' }, ['e1']),
		exp('e3', 'module.profile', { path: '$e1.anchor.path' }, ['e1']),
	]);
	const resolved = outputOf(executed, 'e1');
	assert.deepEqual(resolved['anchor'], { path: large, kind: 'symbol', source: 'named-scope', entityId: 'e-big-2', filePath: large });
	assert.ok((resolved['hits'] as Array<{ entityId?: string }>).every(h => h.entityId === 'e-big-2'), 'searched as the one entity');
	// the symbol-aware exploration took the entity id from the anchor
	assert.notEqual(outputOf(executed, 'e2')['type'], 'failed', 'usage.example ran on the anchor\'s entity id');
	// the file-level exploration sees the whole file: it is the contextual expansion the prompt labels, not the subject
	const fileProfile = outputOf(executed, 'e3')['profile'] as { kind: string; entityCount: number };
	assert.equal(fileProfile.kind, 'file');
	assert.ok(fileProfile.entityCount > 1, `the file-level profile covers the whole file (${fileProfile.entityCount} entities), unlike the symbol`);
});

test('legacy repo and workspace plans behave as before: the anchor path is the top hit\'s path', async () => {
	for (const kind of ['repo', 'workspace'] as const) {
		const scope = await resolveScopeForTarget({ kind, value: repo }, 'code');
		const viaAnchor = await execute(scope, [exp('e1', 'concept.resolve', { query: 'pay' }), exp('e2', 'module.profile', { path: '$e1.anchor.path' }, ['e1'])]);
		const viaHits   = await execute(scope, [exp('e1', 'concept.resolve', { query: 'pay' }), exp('e2', 'module.profile', { path: '$e1.hits[0].path' }, ['e1'])]);
		assert.ok((outputOf(viaAnchor, 'e1')['hits'] as unknown[]).length > 0, kind);
		assert.deepEqual(outputOf(viaAnchor, 'e2'), outputOf(viaHits, 'e2'), `${kind}: the same profile either way`);
	}
});

test('the planning and synthesis prompts name the anchor: no recipe chains on hits[0].path of a concept.resolve, symbol anchors chain on the entity id and label file-level results', () => {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'prompts', 'analyze');
	const decompose = readFileSync(join(root, 'decompose.system.md'), 'utf8');
	const synthesize = readFileSync(join(root, 'synthesize.code.system.md'), 'utf8');
	assert.ok(!/\$e\d+\.hits\[0\]\.path/.test(decompose), 'no recipe chains a path on hits[0].path');
	assert.match(decompose, /\$e1\.anchor\.path/);
	assert.match(decompose, /\$eN\.anchor\.entityId/);
	assert.match(decompose, /Contextual file expansion/);
	assert.match(decompose, /named-scope/);
	assert.match(synthesize, /Centre on the anchor/);
	assert.match(synthesize, /A symbol anchor is one entity/);
	assert.match(synthesize, /contextual file expansion/);
	assert.ok(!/Trust the resolver's ranking/.test(synthesize));
});
