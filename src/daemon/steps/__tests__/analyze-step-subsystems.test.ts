/**
 * Epic c2ba6fa6, Story s8 (code review round 1, M4) -- the step tool's bundle
 * phase serves the subsystem block too: over a sandbox store with stored
 * subsystems, a bundle for a module scope names the scope's subsystem after the
 * agent's structure text, and a workspace scope with no cited file adds nothing.
 *
 * Run: npx tsx --test src/daemon/steps/__tests__/analyze-step-subsystems.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { writeSubsystemSummary, writeSubsystems } from '../../../db/subsystems.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import type { ExecutedPlan, ExplorationPlan } from '../../../analyze/explore/types.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { handleBundle } from '../analyze-step/phases/bundle.js';
import { encodeState, STATE_VERSION, type StepStatePayload } from '../analyze-step/state.js';
import type { StepInputBundle, StepOutputDone } from '../analyze-step/types.js';

useTemporaryLance();

let sandbox: string;
let repo: string;
test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'insrc-s8-step-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	mkdirSync(repo, { recursive: true });
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
	await writeSubsystems(repo, 0, [
		{ id: 'p1', name: 'src/parse', files: ['src/parse/lexer.ts'], entityCount: 1, connections: [] },
		{ id: 's1', name: 'src/store', files: ['src/store/db.ts'], entityCount: 1, connections: [] },
	]);
	await writeSubsystemSummary(repo, 'p1', 'Turns text into tokens.', 'cheap');
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

const LAYERS = { system: 's', focus: 'f', summary: 'sum', structure: 'agent structure', surface: 'su', artefacts: 'a', upstream: 'u' };
const PLAN = { answerType: 'structural-map', synthesisHint: 'h', explorations: [] } as unknown as ExplorationPlan;

async function awaitingBundle(scopeRef: ClassifiedIntent['scopeRef']): Promise<string> {
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: true, focus: 'parse', scopeRef, reasoning: 't' };
	const payload: StepStatePayload = {
		version: STATE_VERSION, runId: 'r1', repoPath: repo, repoIndexedAt: 1_790_000_000_000,
		intent, synthesizerKey: 'code', plan: PLAN, executed: { plan: PLAN, results: [], totalMs: 0, totalCached: 0 } as unknown as ExecutedPlan,
		stage: 'awaiting_bundle',
	};
	return await encodeState(payload);
}

test("s8 (M4): the step tool's bundle for a module scope names the scope's subsystem after the agent's structure text", async () => {
	const out = await handleBundle({ phase: 'bundle', bundle: LAYERS, state: await awaitingBundle({ kind: 'module', value: join(repo, 'src/parse') }) } as StepInputBundle) as StepOutputDone;
	assert.equal(out.next, 'done');
	assert.match(out.markdown, /agent structure\n\n### Subsystems\n\n#### Subsystem src\/parse\n\nTurns text into tokens\./);
	assert.doesNotMatch(out.markdown, /#### Subsystem src\/store/, 'only the scope\'s subsystem');
});

test("s8 (M4): a workspace scope citing no file adds no subsystem block", async () => {
	const out = await handleBundle({ phase: 'bundle', bundle: LAYERS, state: await awaitingBundle({ kind: 'workspace', value: repo }) } as StepInputBundle) as StepOutputDone;
	assert.equal(out.next, 'done');
	assert.doesNotMatch(out.markdown, /### Subsystems/);
});
