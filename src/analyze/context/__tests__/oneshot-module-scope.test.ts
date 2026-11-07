/**
 * The one-shot run keys graph reads on the containing registered repository
 * for a module and a manifest-directory scope and carries the named area as
 * the scope: a lookup finds the entities stored under the repository root
 * (it found nothing when keyed on the directory, which is no registered
 * repository). Uses the real executor; the planning and answer calls are
 * stand-ins, so nothing reaches a model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import { PATHS } from '../../../shared/paths.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import type { ExecutedPlan, ExplorationPlan } from '../../explore/types.js';
import { _runShaperAtEntryForTest as runShaper } from '../index.js';
import { _realPipelineStepsForTest, type PipelineSteps } from '../driver.js';

useTemporaryLance();

let sandbox: string;
let repo: string;
const runIds: string[] = [];

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'analyze-oneshot-module-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	mkdirSync(join(repo, 'src', 'pay'), { recursive: true });
	mkdirSync(join(repo, 'deploy'), { recursive: true });
	writeFileSync(join(repo, 'src', 'pay', 'settle.ts'), 'export function settle() {}\n');
	writeFileSync(join(repo, 'deploy', 'chart.ts'), 'export function chart() {}\n');
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await upsertEntities(null, [
		{ id: 'e-settle', repo, file: join(repo, 'src', 'pay', 'settle.ts'), kind: 'function', name: 'settle', language: 'typescript', startLine: 1, endLine: 1 },
		{ id: 'e-chart', repo, file: join(repo, 'deploy', 'chart.ts'), kind: 'function', name: 'chart', language: 'typescript', startLine: 1, endLine: 1 },
	] as unknown as Entity[]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
	for (const id of runIds.splice(0)) rmSync(PATHS.analyzeContext(id), { recursive: true, force: true });
});

const RAW = { system: 'sys', focus: 'f', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u' };

/** The loop must never be used by a run-mode request. */
const provider = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => { throw new Error(`the tool loop was reached (${String(prop)})`); }) }) as unknown as LLMProvider;

async function lookup(kind: 'module' | 'manifest-dir', value: string, name: string): Promise<{ found: string; repoPath: string; scopeKind: string }> {
	const plan = { answerType: 'structural-map', synthesisHint: 'h', explorations: [{ id: 'e1', type: 'symbol.locate', purpose: 'p', params: { names: [name], matchMode: 'exact' } }] } as unknown as ExplorationPlan;
	let executedSeen: ExecutedPlan | undefined;
	let seenRepo = '';
	let seenScope = '';
	const steps: PipelineSteps = {
		..._realPipelineStepsForTest,
		decompose: async () => plan,
		executePlan: async (a) => { seenRepo = a.repoPath; seenScope = a.scope?.kind ?? ''; return _realPipelineStepsForTest.executePlan(a); },
		synthesize: async (a) => { executedSeen = a.executed; return RAW; },
	};
	const id = `oneshot-module-${Math.floor(Math.random() * 1e9).toString(16)}`;
	runIds.push(id);
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: false, scopeRef: { kind, value }, reasoning: 'r' };
	await runShaper({ promptPath: 'prompts/analyze/code.system.md', invocationMode: 'run', shaperId: 'code', inputs: { intent }, opts: { runId: id }, provider, pipelineSteps: steps });
	return { found: JSON.stringify(executedSeen?.results.map(r => r.output) ?? []), repoPath: seenRepo, scopeKind: seenScope };
}

test('the one-shot shaper session and executePlan use the containing repository for module and manifest-dir scopes, and a lookup returns the stored entities', async () => {
	const mod = await lookup('module', join(repo, 'src', 'pay'), 'settle');
	assert.equal(mod.repoPath, repo);
	assert.equal(mod.scopeKind, 'module');
	assert.match(mod.found, /settle\.ts/, 'the symbol lookup found the entity stored under the repository root');

	const manifest = await lookup('manifest-dir', join(repo, 'deploy'), 'chart');
	assert.equal(manifest.repoPath, repo);
	assert.equal(manifest.scopeKind, 'manifest-dir');
	assert.match(manifest.found, /chart\.ts/, 'the symbol lookup found the entity stored under the repository root');
});
