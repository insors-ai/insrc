/**
 * The plan and the narrow resume key graph reads on the containing registered
 * repository and carry the named area as the scope: a module scope's entities,
 * stored under the repository root, are found (they were not when the plan was
 * keyed on the module directory, which is no registered repository).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { upsertEntities } from '../../../db/entities.js';
import type { Entity } from '../../../shared/types.js';
import { handleAnalyzeStep } from '../analyze-step/handler.js';
import { encodeState, STATE_VERSION, type StepStatePayload } from '../analyze-step/state.js';
import '../../../workflow/__tests__/helpers/converted-repos.js';

const ROOT = mkdtempSync(join(tmpdir(), 'insrc-plan-module-'));
setGraphStorePath(join(ROOT, 'graph.lmdb'));
const REPO = join(ROOT, 'app');
mkdirSync(join(REPO, 'src', 'pay'), { recursive: true });
mkdirSync(join(REPO, 'deploy'), { recursive: true });
writeFileSync(join(REPO, 'src', 'pay', 'settle.ts'), 'export function settle() {}\n');
writeFileSync(join(REPO, 'deploy', 'chart.ts'), 'export function chart() {}\n');

let registered = false;
async function register(): Promise<void> {
	if (registered) return;
	registered = true;
	await addRepo(null, { path: REPO, name: REPO, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await upsertEntities(null, [{
		id: 'e-settle', repo: REPO, file: join(REPO, 'src', 'pay', 'settle.ts'), kind: 'function', name: 'settle',
		language: 'typescript', startLine: 1, endLine: 1, exported: true,
	}, {
		id: 'e-chart', repo: REPO, file: join(REPO, 'deploy', 'chart.ts'), kind: 'function', name: 'chart',
		language: 'typescript', startLine: 1, endLine: 1, exported: true,
	}] as unknown as Entity[]);
}

for (const c of [
	{ kind: 'module', dir: join(REPO, 'src', 'pay'), name: 'settle', file: /settle\.ts/ },
	{ kind: 'manifest-dir', dir: join(REPO, 'deploy'), name: 'chart', file: /chart\.ts/ },
] as const) {
	test(`the plan phase passes the containing repository and the named area for a ${c.kind} scope; a symbol lookup returns its entities and the module profile runs`, async () => {
		await register();
		const payload: StepStatePayload = {
			version: STATE_VERSION, runId: `plan-${c.kind}`, repoPath: REPO, repoIndexedAt: null,
			intent: { target: 'code', scope: 'M', focused: true, focus: 'q', scopeRef: { kind: c.kind, value: c.dir }, reasoning: 'r', scopeSource: 'request' },
			synthesizerKey: 'code', stage: 'awaiting_plan',
		};
		const envelope = await handleAnalyzeStep({
			phase: 'plan', state: await encodeState(payload),
			plan: { answerType: 'structural-map', synthesisHint: 'x', explorations: [
				{ id: 'e1', type: 'symbol.locate', purpose: 'p', params: { names: [c.name], matchMode: 'exact' } },
				{ id: 'e2', type: 'module.profile', purpose: 'p', params: { path: c.dir } },
			] },
		});
		const text = (envelope.content[0] as { text: string }).text;
		assert.equal(envelope.isError === true, false, text.slice(0, 300));
		assert.match(text, c.file, 'the symbol lookup found the entity stored under the repository root');
		assert.match(text, /module\.profile/, 'the module profile ran');
	});
}

test('the narrow resume passes the same containing repository and area as the plan, so the lookup after the pause finds the module\'s entities', async () => {
	const payload: StepStatePayload = {
		version: STATE_VERSION, runId: 'mod-narrow', repoPath: REPO, repoIndexedAt: 1_720_000_000_000,
		intent: { target: 'code', scope: 'M', focused: true, focus: 'settlement', scopeRef: { kind: 'module', value: join(REPO, 'src', 'pay') }, reasoning: 'r', scopeSource: 'request' },
		synthesizerKey: 'adherence', stage: 'awaiting_narrow',
		plan: {
			answerType: 'adherence-check', synthesisHint: 'test',
			explorations: [
				{ id: 'e1', type: 'doc.decision.trace', purpose: 'p', params: { topic: 't' } },
				{ id: 'e2', type: 'symbol.locate', purpose: 'p', params: { names: ['settle'], matchMode: 'exact' } },
			],
		},
		narrow: {
			explorationId: 'e1', explorationType: 'doc.decision.trace',
			preparedBlob: { topic: 't', retrievedSectionCount: 0, validEntityIds: [] },
			resumeState: { results: [], outputs: [], totalCached: 0, totalMsSoFar: 0 },
		},
	};
	const envelope = await handleAnalyzeStep({ phase: 'narrow', explorationId: 'e1', narrow: { topic: 't', decisions: [], notFoundNote: '' }, state: await encodeState(payload) });
	const text = (envelope.content[0] as { text: string }).text;
	assert.equal(envelope.isError === true, false, text.slice(0, 300));
	assert.match(text, /settle\.ts/, 'the lookup after the pause found the entity stored under the repository root');
});

test.after(async () => { await closeGraphStore(); rmSync(ROOT, { recursive: true, force: true }); });
