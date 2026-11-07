/**
 * The one-shot bundle cache is keyed on the scope, the question, the context
 * and who named the scope (Story 65b643840a294422/s1, task t14), and a cached
 * bundle renders its own scope line. Real graph store and bundle cache; the
 * pipeline's model steps are stand-ins.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import { PATHS } from '../../../shared/paths.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import { renderScopeLine } from '../../completeness.js';
import type { ExecutedPlan, ExplorationPlan } from '../../explore/types.js';
import { _runShaperAtEntryForTest as runShaper } from '../index.js';
import { _computeCacheKeyForTest, _realPipelineStepsForTest, type PipelineSteps } from '../driver.js';
import { buildCompleteness } from '../../completeness.js';

useTemporaryLance();

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const PROMPT = readFileSync(join(REPO_ROOT, 'src/prompts/analyze/code.system.md'), 'utf8');
let sandbox: string;
let repo: string;
const runIds: string[] = [];

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'cache-key-scope-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	mkdirSync(join(repo, 'src'), { recursive: true });
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await upsertEntities(null, [{ id: 'e1', repo, file: join(repo, 'src', 'a.ts'), kind: 'function', name: 'fn', language: 'typescript', startLine: 1, endLine: 2 } as unknown as Entity]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
	for (const id of runIds.splice(0)) rmSync(PATHS.analyzeContext(id), { recursive: true, force: true });
});

const base = (over: Partial<ClassifiedIntent> = {}): ClassifiedIntent => ({
	target: 'code', scope: 'M', focused: true, focus: 'how does it work', scopeRef: { kind: 'repo', value: repo }, reasoning: 'r', ...over,
});
const keyOf = (intent: ClassifiedIntent): string => _computeCacheKeyForTest(PROMPT, { intent });

test('the one-shot cache key differs for a different scope, question, context or scopeSource and is equal for the same request', () => {
	const request = base({ scopeSource: 'request', context: 'background' });
	assert.equal(keyOf(request), keyOf(base({ scopeSource: 'request', context: 'background' })), 'the same request, the same key');
	const keys = new Set([
		keyOf(request),
		keyOf(base({ scopeSource: 'request', context: 'background', scopeRef: { kind: 'module', value: join(repo, 'src') } })),
		keyOf(base({ scopeSource: 'request', context: 'background', focus: 'another question' })),
		keyOf(base({ scopeSource: 'request', context: 'other background' })),
		keyOf(base({ scopeSource: 'request' })),
		keyOf(base({ scopeSource: 'prompt', context: 'background' })),
		keyOf(base({ context: 'background' })),
	]);
	assert.equal(keys.size, 7, 'scope, question, context, scopeSource (and its absence) each change the key');
	// the size, which is measured, does not
	assert.equal(keyOf({ ...request, scope: 'XL' }), keyOf(request), 'the intent\'s size is not part of the key');
});

const plan = { answerType: 'how-does-it-work', synthesisHint: 'h', explorations: [{ id: 'e1', type: 'concept.resolve', purpose: 'p', params: { query: 'settlement' } }] } as unknown as ExplorationPlan;
const RAW = { system: 'sys', focus: 'f', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u' };
const provider = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => { throw new Error(`the tool loop was reached (${String(prop)})`); }) }) as unknown as LLMProvider;

function standIns(): { steps: PipelineSteps; built: () => number } {
	let built = 0;
	const steps: PipelineSteps = {
		..._realPipelineStepsForTest,
		decompose: async () => plan,
		executePlan: async (a) => ({
			plan: a.plan, elapsedMs: 0, cacheHits: 0, cacheMisses: 0,
			results: a.plan.explorations.map(e => ({ exploration: e, output: { type: e.type, completeness: buildCompleteness({ returned: 1, basis: 'graph' }), hits: [] } as never, cached: false, elapsedMs: 0 })),
		}) as unknown as ExecutedPlan,
		synthesize: async () => { built += 1; return RAW; },
	};
	return { steps, built: () => built };
}

test('a cached bundle renders its own scope line: requests that differ only in who named the scope do not share a bundle', async () => {
	const id = `cache-key-scope-${Math.floor(Math.random() * 1e9).toString(16)}`;
	runIds.push(id);
	const run = async (intent: ClassifiedIntent) => {
		const s = standIns();
		const bundle = await runShaper({ promptPath: 'prompts/analyze/code.system.md', invocationMode: 'run', shaperId: 'code', inputs: { intent }, opts: { runId: id }, provider, pipelineSteps: s.steps });
		return { bundle, built: s.built() };
	};
	const asked = await run(base({ scopeSource: 'request' }));
	const prompt = await run(base({ scopeSource: 'prompt' }));
	assert.equal(asked.built, 1);
	assert.equal(prompt.built, 1, 'the prompt-only request was built, not served from the structured request\'s bundle');
	const askedLine  = renderScopeLine(asked.bundle.report!.scope!);
	const promptLine = renderScopeLine(prompt.bundle.report!.scope!);
	assert.match(askedLine, /named by the request/);
	assert.match(promptLine, /the caller named no scope/);

	// the slot holds the latest request of the run: the same request again is served from it, with its own line
	const promptAgain = await run(base({ scopeSource: 'prompt' }));
	assert.equal(promptAgain.built, 0, 'the same prompt-only request is served from the cache');
	assert.equal(renderScopeLine(promptAgain.bundle.report!.scope!), promptLine, 'a cached bundle renders its own scope line');

	// and the structured request, run again, is not handed the prompt-only request's bundle
	const askedAgain = await run(base({ scopeSource: 'request' }));
	assert.equal(askedAgain.built, 1, 'the structured request is built again, not served from the prompt-only request\'s bundle');
	assert.equal(renderScopeLine(askedAgain.bundle.report!.scope!), askedLine);
	const askedServed = await run(base({ scopeSource: 'request' }));
	assert.equal(askedServed.built, 0, 'and then served from its own');
	assert.equal(renderScopeLine(askedServed.bundle.report!.scope!), askedLine);
});
