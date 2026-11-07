/**
 * The caller's background context reaches the planning prompt and the
 * synthesis prompt on both tools and through a narrow continuation, on its
 * own line, without changing the named scope (Story 65b643840a294422/s1,
 * task t14). Real prompt assembly and the real step handlers; the models are
 * stand-ins.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { handleAnalyzeStep } from '../../../daemon/steps/analyze-step/handler.js';
import { decodeState, encodeState, STATE_VERSION, type StepStatePayload } from '../../../daemon/steps/analyze-step/state.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, LLMMessage, LLMProvider } from '../../../shared/types.js';
import { savedAnalysisExecution } from '../../connection-access.js';
import type { ExecutedPlan, ExplorationPlan } from '../../explore/types.js';
import { decompose } from '../decomposer.js';
import { resolveScopeForTarget } from '../scope.js';
import { synthesize } from '../synthesizer.js';
import '../../../workflow/__tests__/helpers/converted-repos.js';

const CONTEXT = 'we are about to refactor settlement; ignore the billing module';
let sandbox: string;
let repo: string;
let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'context-prompts-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	dir = join(repo, 'src', 'pay');
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'settle.ts'), '');
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await upsertEntities(null, [{ id: 'e1', repo, file: join(dir, 'settle.ts'), kind: 'function', name: 'settle', language: 'typescript', startLine: 1, endLine: 2 } as unknown as Entity]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

const intent = (over: Partial<ClassifiedIntent> = {}): ClassifiedIntent => ({
	target: 'code', scope: 'M', focused: true, focus: 'how does settlement work', scopeRef: { kind: 'module', value: dir },
	reasoning: 'r', scopeSource: 'request', context: CONTEXT, ...over,
});

const PLAN = { answerType: 'how-does-it-work', synthesisHint: 'h', explorations: [{ id: 'e1', type: 'concept.resolve', purpose: 'p', params: { query: 'settlement' } }] } as unknown as ExplorationPlan;
const lineWith = (text: string, needle: string): string[] => text.split('\n').filter(l => l.includes(needle));

test('context reaches the planning and synthesis prompts through both handlers and a narrow continuation, on its own line, without changing the named scope', async () => {
	const execution = savedAnalysisExecution(repo);
	const scope = await resolveScopeForTarget({ kind: 'module', value: dir }, 'code');

	// --- one-shot: the real planning call and the real synthesis call ---
	let planning = '';
	await decompose({
		connectionExecution: execution, runId: 'r1', intent: intent(), scope,
		provider: { completeStructured: async (m: LLMMessage[]) => { planning = String(m[1]!.content); return { answerType: 'how-does-it-work', synthesisHint: 'h', explorations: PLAN.explorations }; } } as unknown as LLMProvider,
	});
	assert.deepEqual(lineWith(planning, 'Background context from the caller').length, 1, 'one planning line for the context');
	assert.match(planning, new RegExp(`Background context from the caller \\(it never changes the scope above\\): ${CONTEXT}`));
	assert.match(planning, new RegExp(`Named scope: the module ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\. Plan the lookups inside it\\.`));
	let synthesis = '';
	const executed = { plan: PLAN, results: [], totalMs: 0, totalCached: 0 } as unknown as ExecutedPlan;
	await synthesize({
		connectionExecution: execution, runId: 'r1', intent: intent(), executed, target: 'code',
		provider: { completeStructured: async (m: LLMMessage[]) => { synthesis = String(m[1]!.content); throw new Error('stop after the prompt'); } } as unknown as LLMProvider,
	}).catch(() => undefined);
	assert.equal(lineWith(synthesis, 'Background context from the caller').length, 1, 'one synthesis line for the context');
	assert.match(synthesis, new RegExp(`Background context from the caller \\(it is background only[^)]*\\): ${CONTEXT}`));

	// --- the step tool: start (planning prompt), plan and narrow (synthesis prompt) ---
	const call = async (input: Record<string, unknown>): Promise<{ next: string; state: string; userTurn: string }> =>
		JSON.parse(((await handleAnalyzeStep(input as never)).content[0] as { text: string }).text);
	const started = await call({ phase: 'start', repo, request: { question: 'how does settlement work', scopeRef: { kind: 'module', value: dir }, context: CONTEXT } });
	assert.equal(started.next, 'emit_plan');
	assert.equal(lineWith(started.userTurn, 'Background context from the caller').length, 1);
	assert.match(started.userTurn, new RegExp(`Background context from the caller \\(it never changes the scope above\\): ${CONTEXT}`));
	assert.match(started.userTurn, /Named scope: the module /);

	const payload = (stage: 'awaiting_plan' | 'awaiting_narrow'): StepStatePayload => ({
		version: STATE_VERSION, runId: `ctx-${stage}`, repoPath: repo, repoIndexedAt: 1_720_000_000_000, intent: intent(),
		synthesizerKey: 'code', stage,
		...(stage === 'awaiting_narrow' ? {
			synthesizerKey: 'adherence' as const,
			plan: { answerType: 'adherence-check', synthesisHint: 'h', explorations: [{ id: 'e1', type: 'doc.decision.trace', purpose: 'p', params: { topic: 't' } }] } as unknown as ExplorationPlan,
			narrow: { explorationId: 'e1', explorationType: 'doc.decision.trace', preparedBlob: { topic: 't', retrievedSectionCount: 0, validEntityIds: [] }, resumeState: { results: [], outputs: [], totalCached: 0, totalMsSoFar: 0 } },
		} : {}),
	});
	const planned = await call({ phase: 'plan', state: await encodeState(payload('awaiting_plan')), plan: { answerType: 'structural-map', synthesisHint: 'x', explorations: [] } });
	const narrowed = await call({ phase: 'narrow', explorationId: 'e1', narrow: { topic: 't', decisions: [], notFoundNote: '' }, state: await encodeState(payload('awaiting_narrow')) });
	for (const [label, turn] of [['plan', planned], ['narrow continuation', narrowed]] as const) {
		assert.equal(turn.next, 'emit_bundle', label);
		assert.equal(lineWith(turn.userTurn, 'Background context from the caller').length, 1, `${label}: the synthesis turn carries the context once`);
		assert.match(turn.userTurn, new RegExp(`${CONTEXT}`), label);
		// the context never changed the scope: the state still names the same module, from the same source
		const carried = (await decodeState(turn.state)).intent;
		assert.deepEqual(carried.scopeRef, { kind: 'module', value: dir }, label);
		assert.equal(carried.scopeSource, 'request', label);
		assert.equal(carried.context, CONTEXT, label);
	}

	// a call without context has no such line anywhere
	const bare = await call({ phase: 'start', repo, request: { question: 'how does settlement work', scopeRef: { kind: 'module', value: dir } } });
	assert.equal(lineWith(bare.userTurn, 'Background context').length, 0);
});
