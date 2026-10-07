/**
 * The lookup pipeline's outcome and the one table that turns a cause
 * into an error.
 *
 * The pipeline's steps (the planning call, the lookups, the
 * answer-writing call, the free-form replacement) are passed in as
 * stand-ins -- no model, no store, no prompt file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ModelCallFailedError } from '../../../agent/providers/model-call-error.js';
import type { LoadedConnections } from '../../../daemon/db/config.js';
import type { AnalyzeScopeRef, ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, RegisteredRepo } from '../../../shared/types.js';
import type { ExecutedPlan, ExplorationPlan } from '../../explore/types.js';
import {
	DecomposerLlmUnavailableError,
	DecomposerPromptMissingError,
	DecomposerSchemaUnrecoverable,
} from '../decomposer.js';
import {
	errorForPipelineCause,
	PIPELINE_CAUSES,
	settlePipelineOutcome,
	ShaperAnswerInvalidError,
	ShaperInvalidInputError,
	ShaperLlmUnavailableError,
	ShaperNoPlanError,
	ShaperPromptMissingError,
	ShaperSchemaUnrecoverable,
	_fallbackFreeformPlanForTest,
	_runExplorationPipelineForTest as runPipeline,
	type PipelineCause,
	type PipelineOutcome,
	type PipelineSteps,
} from '../driver.js';
import {
	SynthesizerLlmUnavailableError,
	SynthesizerPromptMissingError,
	SynthesizerSchemaUnrecoverable,
} from '../synthesizer.js';
import { resolveScope, type ResolvedScope, type ScopeDeps } from '../scope.js';
import type { AnalyzeContextBundle } from '../types.js';

type RawBundle = Omit<AnalyzeContextBundle, 'meta'>;

const REPO = '/work/app';

const INTENT: ClassifiedIntent = {
	target:    'code',
	scope:     'M',
	focused:   true,
	focus:     'how does settlement work',
	scopeRef:  { kind: 'repo', value: REPO },
	reasoning: 'test',
};

const PLAN: ExplorationPlan = {
	answerType:    'how-does-it-work',
	synthesisHint: 'walk the flow',
	explorations:  [{ id: 'e1', type: 'concept.resolve', purpose: 'find it', params: { query: 'settlement' } }],
} as unknown as ExplorationPlan;

const RAW: RawBundle = {
	system: 'code-shaper: how-does-it-work', focus: 'Intent focus: how does settlement work',
	summary: 's', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u',
};

const EMPTY_LAYERS = { system: '', focus: '', summary: '', structure: '', surface: '', artefacts: '', upstream: '' };

interface Calls {
	decompose:   unknown[];
	executePlan: unknown[];
	synthesize:  unknown[];
	fallback:    unknown[];
	/** What the lookup stand-in returned, in call order. */
	executed:    ExecutedPlan[];
}

interface StandIns {
	decompose?:   () => Promise<ExplorationPlan>;
	synthesize?:  () => Promise<RawBundle>;
	fallback?:    PipelineSteps['fallbackFreeformPlan'];
}

function steps(over: StandIns = {}): { steps: PipelineSteps; calls: Calls } {
	const calls: Calls = { decompose: [], executePlan: [], synthesize: [], fallback: [], executed: [] };
	const s: PipelineSteps = {
		decompose: async (a) => { calls.decompose.push(a); return (over.decompose ?? (async () => PLAN))(); },
		executePlan: async (a) => {
			calls.executePlan.push(a);
			const executed = {
				plan: a.plan,
				results: a.plan.explorations.map(e => ({
					exploration: e,
					// A free-form lookup that did not settle (all layers
					// empty) is NOT short-circuited: the answer-writing
					// step still runs, as for any other lookup.
					output: (e.type === 'freeform.probe'
						? { type: e.type, rawBundle: EMPTY_LAYERS, toolCallCount: 0 }
						: { type: e.type }) as never,
					cached: false,
					elapsedMs: 0,
				})),
				elapsedMs: 0, cacheHits: 0, cacheMisses: 0,
			} as unknown as ExecutedPlan;
			calls.executed.push(executed);
			return executed;
		},
		synthesize: async (a) => { calls.synthesize.push(a); return (over.synthesize ?? (async () => RAW))(); },
		fallbackFreeformPlan: (intent, shaperId) => {
			calls.fallback.push({ intent, shaperId });
			return (over.fallback ?? _fallbackFreeformPlanForTest)(intent, shaperId);
		},
		lastIndexedAt: async () => 1_700_000_000_000,
	};
	return { steps: s, calls };
}

function run(
	over: StandIns = {},
	intent: ClassifiedIntent = INTENT,
	mode: 'run' | 'classification' | 'task' = 'run',
	scope?: ResolvedScope,
) {
	const { steps: s, calls } = steps(over);
	const inputs = mode === 'classification'
		? { userPrompt: 'q', scopeRef: intent.scopeRef }
		: { intent };
	return runPipeline(
		{ invocationMode: mode, shaperId: 'code', inputs: inputs as never, runId: 'r1', scope: scope ?? dirScope(intent) },
		s,
	).then(outcome => ({ outcome, calls }));
}

/** The resolved scope of a directory kind: lookups run in the scope's own directory. */
function dirScope(intent: ClassifiedIntent): ResolvedScope {
	return { kind: intent.scopeRef.kind, value: intent.scopeRef.value, repoPath: REPO, lookupPath: intent.scopeRef.value };
}

function cause(outcome: PipelineOutcome): PipelineCause {
	assert.equal(outcome.kind, 'did-not-proceed', JSON.stringify(outcome));
	return (outcome as Extract<PipelineOutcome, { kind: 'did-not-proceed' }>).cause;
}

function stamp(raw: RawBundle, explorationCount: number): AnalyzeContextBundle {
	return {
		...raw,
		meta: {
			mode: 'run', shaper: 'code', toolCalls: explorationCount, modelId: 'm',
			emptyLayers: [], schemaVersion: 1,
		},
	} as unknown as AnalyzeContextBundle;
}

// ---------------------------------------------------------------------------
// The pipeline's outcomes
// ---------------------------------------------------------------------------

test('focused request on a repo: stand-in arguments and bundle equal the recorded baseline', async () => {
	const { outcome, calls } = await run();
	assert.deepEqual(outcome, { kind: 'bundle', raw: RAW, explorationCount: 1 });
	// The baseline is what each step received before the outcome type
	// existed, taken from the call sites as they stood (the pipeline had
	// no seam then, so it could not be recorded by running it; the three
	// argument expressions are unchanged in the diff): the planning call
	// gets the intent and run id; the lookups get the scope's directory
	// as both path and closure, its last-indexed time and the plan; the
	// answer-writing call gets the run id, the intent, exactly what the
	// lookups returned, and the 'code' key.
	assert.deepEqual(calls.decompose, [{ intent: INTENT, runId: 'r1', scope: dirScope(INTENT) }]);
	assert.deepEqual(calls.executePlan, [{
		runId: 'r1', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1_700_000_000_000n, plan: PLAN,
	}]);
	assert.equal(calls.executed.length, 1);
	assert.deepEqual(Object.keys(calls.synthesize[0] as object).sort(), ['executed', 'intent', 'runId', 'target']);
	assert.deepEqual(calls.synthesize, [{
		runId: 'r1', intent: INTENT, executed: calls.executed[0], target: 'code',
	}]);
	// The very object the lookups returned, not a copy or a subset.
	assert.equal((calls.synthesize[0] as { executed: ExecutedPlan }).executed, calls.executed[0]);
	assert.deepEqual(calls.fallback, [], 'a covered plan is not replaced');
});

test("pipeline returns each cause for the stand-in that produces it, including 'empty-plan' through the fourth stand-in", async () => {
	// planning: a failed model call, whichever provider.
	const pm = await run({ decompose: async () => { throw new DecomposerLlmUnavailableError('claude exited with 1'); } });
	assert.equal(cause(pm.outcome), 'planner-model-failed');
	assert.equal((pm.outcome as { message: string }).message, 'claude exited with 1', 'the underlying words, not the wrapper');
	assert.equal(pm.calls.executePlan.length, 0, 'no lookups after a failed planning call');
	assert.deepEqual(pm.calls.fallback, [], 'a failed planning call is NOT replaced by the free-form lookup');

	// planning: prompt file missing.
	const pp = await run({ decompose: async () => { throw new DecomposerPromptMissingError('/x/decompose.system.md'); } });
	assert.equal(cause(pp.outcome), 'planner-prompt-missing');
	assert.equal((pp.outcome as { promptPath?: string }).promptPath, '/x/decompose.system.md');

	// answer writing: a failed model call.
	const am = await run({ synthesize: async () => { throw new SynthesizerLlmUnavailableError('codex exited with 2'); } });
	assert.equal(cause(am.outcome), 'answer-model-failed');
	assert.equal((am.outcome as { message: string }).message, 'codex exited with 2');

	// answer writing: prompt file missing.
	const ap = await run({ synthesize: async () => { throw new SynthesizerPromptMissingError('/x/synthesize.code.system.md'); } });
	assert.equal(cause(ap.outcome), 'answer-prompt-missing');
	assert.equal((ap.outcome as { promptPath?: string }).promptPath, '/x/synthesize.code.system.md');

	// answer writing: anything else -- today's catch-all, which used to return nothing.
	const ai = await run({ synthesize: async () => { throw new SynthesizerSchemaUnrecoverable(['/focus must be string']); } });
	assert.equal(cause(ai.outcome), 'answer-invalid');
	assert.match((ai.outcome as { message: string }).message, /\/focus must be string/);
	const aiPlain = await run({ synthesize: async () => { throw new Error('boom'); } });
	assert.equal(cause(aiPlain.outcome), 'answer-invalid');

	// invalid input: an unknown kind of source, and inputs with no intent.
	const { steps: s } = steps();
	const unknownSource = await runPipeline(
		{ invocationMode: 'run', shaperId: 'nope' as never, inputs: { intent: INTENT } as never, runId: 'r', scope: dirScope(INTENT) }, s,
	);
	assert.equal(cause(unknownSource), 'invalid-input');
	const noIntent = await runPipeline(
		{ invocationMode: 'run', shaperId: 'code', inputs: { userPrompt: 'q', scopeRef: INTENT.scopeRef } as never, runId: 'r', scope: dirScope(INTENT) }, s,
	);
	assert.equal(cause(noIntent), 'invalid-input');

	// empty plan: only reachable when the free-form replacement itself
	// returns no lookups -- the real one always returns one.
	const emptyPlan: ExplorationPlan = { ...PLAN, explorations: [] } as unknown as ExplorationPlan;
	const ep = await run({ decompose: async () => emptyPlan, fallback: () => emptyPlan });
	assert.equal(cause(ep.outcome), 'empty-plan');
	assert.equal(ep.calls.executePlan.length, 0);
	// With the REAL replacement an empty plan is replaced and proceeds.
	const replaced = await run({ decompose: async () => emptyPlan });
	assert.equal(replaced.calls.fallback.length, 1);
	assert.equal(replaced.calls.executePlan.length, 1);
	assert.notEqual(replaced.outcome.kind, 'not-applicable');
});

test('a planning call that fails for another reason is replaced by the free-form lookup, as before', async () => {
	const { outcome, calls } = await run({
		decompose: async () => { throw new DecomposerSchemaUnrecoverable(['bad plan']); },
	});
	assert.equal(calls.fallback.length, 1);
	assert.equal(calls.executePlan.length, 1);
	const executed = calls.executePlan[0] as { plan: ExplorationPlan };
	assert.equal(executed.plan.explorations[0]!.type, 'freeform.probe');
	assert.equal(outcome.kind, 'bundle');
});

test("pipeline returns 'not-applicable' for classification and task modes", async () => {
	for (const mode of ['classification', 'task'] as const) {
		const { outcome, calls } = await run({}, INTENT, mode);
		assert.deepEqual(outcome, { kind: 'not-applicable' }, mode);
		assert.equal(calls.decompose.length, 0, mode);
	}
});

test('the gate on a request with no focus still stands, naming its own cause', async () => {
	const unfocused = await run({}, { ...INTENT, focused: false, focus: undefined } as unknown as ClassifiedIntent);
	assert.equal(cause(unfocused.outcome), 'unfocused-not-served');
	assert.equal(unfocused.calls.decompose.length, 0);
});

// ---------------------------------------------------------------------------
// All seven kinds of scope are served
// ---------------------------------------------------------------------------

const FILE = `${REPO}/src/pay.ts`;

/** resolveScope with stand-in readers: one registered repo, one entity, one connection. */
function resolve(ref: AnalyzeScopeRef): Promise<ResolvedScope> {
	const ent = { id: 'ent-settle', name: 'settle', kind: 'function', file: FILE, startLine: 3 } as unknown as Entity;
	const deps: ScopeDeps = {
		listRepos:           async () => [{ path: REPO, status: 'ready' } as unknown as RegisteredRepo],
		findEntitiesByFile:  async (f) => (f === FILE ? [ent] : []),
		listEntitiesForRepo: async () => [ent],
		loadConnections:     async () => ({
			file: { connections: [] }, resolved: [{ id: 'ledger-db', kind: 'sqlite' }], warnings: [],
		} as unknown as LoadedConnections),
	};
	return resolveScope(ref, deps);
}

test('pipeline returns a bundle for file, symbol, manifest directory and connection scopes with the resolved lookup path', async () => {
	const cases: ReadonlyArray<{ ref: AnalyzeScopeRef; lookupPath: string; freshness: string }> = [
		{ ref: { kind: 'file',         value: FILE },               lookupPath: REPO,            freshness: FILE },
		{ ref: { kind: 'symbol',       value: `${FILE}#settle` },   lookupPath: REPO,            freshness: FILE },
		{ ref: { kind: 'manifest-dir', value: `${REPO}/deploy` },   lookupPath: `${REPO}/deploy`, freshness: `${REPO}/deploy` },
		{ ref: { kind: 'connection',   value: 'ledger-db' },        lookupPath: REPO,            freshness: '' },
	];
	for (const c of cases) {
		const scope = await resolve(c.ref);
		assert.equal(scope.lookupPath, c.lookupPath, c.ref.kind);
		const seen: string[] = [];
		const { steps: s, calls } = steps();
		const withFreshness: PipelineSteps = { ...s, lastIndexedAt: async (p) => { seen.push(p); return 1_700_000_000_000; } };
		const outcome = await runPipeline(
			{ invocationMode: 'run', shaperId: 'code', inputs: { intent: { ...INTENT, scopeRef: c.ref } } as never, runId: 'r1', scope },
			withFreshness,
		);
		assert.equal(outcome.kind, 'bundle', `${c.ref.kind}: ${JSON.stringify(outcome)}`);
		assert.equal(calls.decompose.length, 1, `${c.ref.kind}: the planning call was made`);
		// The lookups ran in the directory the scope resolved to.
		const executed = calls.executePlan[0] as { repoPath: string; closureRepos: string[] };
		assert.equal(executed.repoPath, c.lookupPath, c.ref.kind);
		assert.deepEqual(executed.closureRepos, [c.lookupPath], c.ref.kind);
		// ... and the last-indexed time was read for the scope's own path.
		assert.deepEqual(seen, [c.freshness], c.ref.kind);
	}
});

test('module scope: lookup path and cache key unchanged', async () => {
	// A module inside a registered repo. Before scope resolution existed
	// the lookups ran in the module's own directory, and the lookup cache
	// key is made from that path, the last-indexed time and the plan.
	const moduleDir = `${REPO}/src/billing`;
	const scope = await resolve({ kind: 'module', value: moduleDir });
	assert.equal(scope.repoPath, REPO);
	const seen: string[] = [];
	const { steps: s, calls } = steps();
	const outcome = await runPipeline(
		{
			invocationMode: 'run', shaperId: 'code', runId: 'r1', scope,
			inputs: { intent: { ...INTENT, scopeRef: { kind: 'module', value: moduleDir } } } as never,
		},
		{ ...s, lastIndexedAt: async (p) => { seen.push(p); return 1_700_000_000_000; } },
	);
	assert.equal(outcome.kind, 'bundle');
	assert.deepEqual(calls.executePlan, [{
		runId: 'r1', repoPath: moduleDir, closureRepos: [moduleDir],
		repoLastIndexedAtMs: 1_700_000_000_000n, plan: PLAN,
	}]);
	assert.deepEqual(seen, [moduleDir]);
	// NOT the repo root.
	assert.notEqual((calls.executePlan[0] as { repoPath: string }).repoPath, REPO);
});

// ---------------------------------------------------------------------------
// The table from cause to error
// ---------------------------------------------------------------------------

test('cause-to-error table: one case per cause, ShaperLlmUnavailableError only for the two model-failed causes', () => {
	const expected: Record<PipelineCause, new (...a: never[]) => Error> = {
		'invalid-input':          ShaperInvalidInputError,
		'planner-prompt-missing': ShaperPromptMissingError,
		'planner-model-failed':   ShaperLlmUnavailableError,
		'answer-prompt-missing':  ShaperPromptMissingError,
		'answer-model-failed':    ShaperLlmUnavailableError,
		'answer-invalid':         ShaperAnswerInvalidError,
		'empty-plan':             ShaperNoPlanError,
		'bundle-invalid':         ShaperAnswerInvalidError,
		'unfocused-not-served':   ShaperNoPlanError,
	};
	// Every member of the cause list has a row here and a case in the table.
	assert.deepEqual([...PIPELINE_CAUSES].sort(), Object.keys(expected).sort());
	const modelFailed: PipelineCause[] = [];
	for (const c of PIPELINE_CAUSES) {
		const err = errorForPipelineCause(c, 'detail', '/p/prompt.md');
		assert.ok(err instanceof expected[c], `${c} -> ${err.name}`);
		assert.equal(err.constructor, expected[c], `${c}: exactly that class`);
		if (err instanceof ShaperLlmUnavailableError) modelFailed.push(c);
	}
	assert.deepEqual(modelFailed.sort(), ['answer-model-failed', 'planner-model-failed']);
});

test('error messages state the cause, name the failed call, and never say retries or Ollama for another provider', () => {
	const cli = 'claude exited with 1. stderr=overloaded';
	assert.equal(errorForPipelineCause('planner-model-failed', cli).message, `The model call for planning failed: ${cli}`);
	assert.equal(errorForPipelineCause('answer-model-failed', cli).message, `The model call for answer writing failed: ${cli}`);
	assert.equal(errorForPipelineCause('bundle-invalid', '/focus must be string').message, 'The bundle failed validation: /focus must be string');
	assert.equal(errorForPipelineCause('answer-invalid', 'no JSON').message, 'The answer-writing output was invalid: no JSON');
	// The two prompt-missing causes carry the prompt file's path.
	assert.equal(
		errorForPipelineCause('planner-prompt-missing', 'Decomposer prompt file missing: /x/d.md', '/x/d.md').message,
		'Shaper prompt file missing: /x/d.md',
	);
	assert.equal(
		errorForPipelineCause('answer-prompt-missing', 'Synthesizer prompt file missing: /x/s.md', '/x/s.md').message,
		'Shaper prompt file missing: /x/s.md',
	);
	for (const c of PIPELINE_CAUSES) {
		const msg = errorForPipelineCause(c, cli, '/x/p.md').message;
		assert.ok(!/exhausted|retries/i.test(msg), `${c}: ${msg}`);
		assert.ok(!msg.includes('Ollama'), `${c}: ${msg}`);
	}
});

test("CLI and sampling call failures give 'planner-model-failed' and 'answer-model-failed' from the pipeline", async () => {
	// The classes the pipeline actually catches, built the way the two
	// calls build them from a CLI failure and from a typed sampling failure.
	const cliDetail = 'codex emitted error event: {"type":"error"}';
	const sampled = new ModelCallFailedError('client declined the sampling request');

	const p1 = await run({ decompose: async () => { throw new DecomposerLlmUnavailableError(cliDetail); } });
	const p2 = await run({ decompose: async () => { throw new DecomposerLlmUnavailableError(sampled.detail); } });
	const a1 = await run({ synthesize: async () => { throw new SynthesizerLlmUnavailableError(cliDetail); } });
	const a2 = await run({ synthesize: async () => { throw new SynthesizerLlmUnavailableError(sampled.detail); } });
	assert.equal(cause(p1.outcome), 'planner-model-failed');
	assert.equal(cause(p2.outcome), 'planner-model-failed');
	assert.equal(cause(a1.outcome), 'answer-model-failed');
	assert.equal(cause(a2.outcome), 'answer-model-failed');

	// End to end through the table: the final message names the call and no provider it did not come from.
	for (const o of [p1.outcome, p2.outcome, a1.outcome, a2.outcome]) {
		assert.throws(
			() => settlePipelineOutcome(o, stamp),
			(err: unknown) => {
				assert.ok(err instanceof ShaperLlmUnavailableError);
				assert.match(err.message, /^The model call for (planning|answer writing) failed: /);
				assert.ok(!err.message.includes('Ollama'), err.message);
				assert.ok(!err.message.includes('Local'), err.message);
				return true;
			},
		);
	}
});

// ---------------------------------------------------------------------------
// What runShaper does with an outcome
// ---------------------------------------------------------------------------

test("runShaper throws ShaperAnswerInvalidError with stage 'bundle validation' for an invalid bundle", () => {
	// A bundle with a layer missing fails the bundle schema.
	const broken = { ...RAW } as Record<string, unknown>;
	delete broken['summary'];
	assert.throws(
		() => settlePipelineOutcome({ kind: 'bundle', raw: broken as unknown as RawBundle, explorationCount: 2 }, stamp),
		(err: unknown) => {
			assert.ok(err instanceof ShaperAnswerInvalidError, `got ${(err as Error).name}`);
			assert.equal(err.stage, 'bundle validation');
			assert.ok(!(err instanceof ShaperLlmUnavailableError));
			assert.ok(!(err instanceof ShaperSchemaUnrecoverable));
			assert.match(err.message, /^The bundle failed validation: /);
			assert.match(err.message, /summary/);
			return true;
		},
	);
});

test('settlePipelineOutcome: a valid bundle is stamped and returned; not-applicable continues; a cause throws its error', () => {
	const ok = settlePipelineOutcome({ kind: 'bundle', raw: RAW, explorationCount: 3 }, stamp);
	assert.equal(ok?.explorationCount, 3);
	assert.equal(ok?.bundle.summary, 's');
	assert.equal(ok?.bundle.meta.toolCalls, 3);

	assert.equal(settlePipelineOutcome({ kind: 'not-applicable' }, stamp), null);

	assert.throws(
		() => settlePipelineOutcome({ kind: 'did-not-proceed', cause: 'empty-plan', message: 'no lookups' }, stamp),
		(err: unknown) => err instanceof ShaperNoPlanError && /no lookups/.test((err as Error).message),
	);
	assert.throws(
		() => settlePipelineOutcome(
			{ kind: 'did-not-proceed', cause: 'answer-prompt-missing', message: 'x', promptPath: '/x/s.md' }, stamp,
		),
		(err: unknown) => err instanceof ShaperPromptMissingError && (err as Error).message.endsWith('/x/s.md'),
	);
});
