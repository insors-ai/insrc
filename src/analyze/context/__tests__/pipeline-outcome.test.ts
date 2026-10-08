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
import { buildCompleteness } from '../../completeness.js';
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
	ShaperAnswerStepFailedError,
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
import { SCHEMA_VERSION } from '../schema.js';
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

/** A stand-in lookup's record: it returned everything it has. */
const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });
/** The record of a free-form lookup, which is never established complete. */
const UNSETTLED = buildCompleteness({ returned: 0, basis: 'model-directed', notEstablished: true });
/** What a stand-in bundle outcome carries for one complete lookup. */
const FOUND_NOTHING_LEFT_OUT = { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } };

/** The parts of a bundle outcome that existed before it carried what the lookups found. */
function core(o: PipelineOutcome): unknown {
	return o.kind === 'bundle' ? { kind: o.kind, raw: o.raw, explorationCount: o.explorationCount } : o;
}

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
					// Every lookup output states its completeness; so do the stand-ins.
					output: (e.type === 'freeform.probe'
						? { type: e.type, rawBundle: EMPTY_LAYERS, toolCallCount: 0, completeness: UNSETTLED }
						: { type: e.type, completeness: WHOLE }) as never,
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
			emptyLayers: [], schemaVersion: SCHEMA_VERSION,
		},
	} as unknown as AnalyzeContextBundle;
}

// ---------------------------------------------------------------------------
// The pipeline's outcomes
// ---------------------------------------------------------------------------

test('focused request on a repo: stand-in arguments and bundle equal the recorded baseline', async () => {
	const { outcome, calls } = await run();
	assert.deepEqual(core(outcome), { kind: 'bundle', raw: RAW, explorationCount: 1 });
	// The outcome also carries the executed lookups and the report derived from them.
	assert.ok(outcome.kind === 'bundle');
	assert.equal(outcome.found.results.length, 1);
	assert.deepEqual(outcome.found.report, { completeness: { complete: true, incomplete: [], failed: [] } });
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
		// Added since the baseline: the resolved scope, for a runner that
		// needs what the request named. The path, closure, last-indexed
		// time and plan -- what the lookup cache key is made from -- are unchanged.
		scope: dirScope(INTENT),
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

test('pipeline returns a bundle for an unfocused intent on a repo, a module and a workspace', async () => {
	for (const kind of ['repo', 'module', 'workspace'] as const) {
		const value = kind === 'module' ? `${REPO}/src/billing` : REPO;
		const unfocused = { ...INTENT, focused: false, focus: undefined, scopeRef: { kind, value } } as unknown as ClassifiedIntent;
		const { outcome, calls } = await run({}, unfocused);
		assert.deepEqual(core(outcome), { kind: 'bundle', raw: RAW, explorationCount: 1 }, kind);
		// The planning call was made, and it received the unfocused intent as it is.
		assert.equal(calls.decompose.length, 1, kind);
		const planned = calls.decompose[0] as { intent: ClassifiedIntent };
		assert.equal(planned.intent, unfocused, kind);
		assert.equal(planned.intent.focused, false, kind);
		assert.equal(planned.intent.focus, undefined, kind);
		// ... its plan was executed where the scope resolved to, and an answer written.
		assert.equal((calls.executePlan[0] as { repoPath: string }).repoPath, value, kind);
		assert.equal(calls.synthesize.length, 1, kind);
	}
});

test('an unfocused intent whose plan is replaced falls to the free-form lookup with a broad-survey purpose', async () => {
	const unfocused = { ...INTENT, focused: false, focus: undefined, reasoning: 'classifier note' } as unknown as ClassifiedIntent;
	const emptyPlan: ExplorationPlan = { ...PLAN, explorations: [] } as unknown as ExplorationPlan;
	const { outcome, calls } = await run({ decompose: async () => emptyPlan }, unfocused);
	assert.equal(outcome.kind, 'bundle');
	const executed = calls.executePlan[0] as { plan: ExplorationPlan };
	const step = executed.plan.explorations[0]!;
	assert.equal(step.type, 'freeform.probe');
	assert.equal((step.params as { purpose: string }).purpose, `Broad survey of the repo ${REPO}`);
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
		scope,
	}]);
	assert.deepEqual(seen, [moduleDir]);
	// NOT the repo root.
	assert.notEqual((calls.executePlan[0] as { repoPath: string }).repoPath, REPO);
});

// ---------------------------------------------------------------------------
// The table from cause to error
// ---------------------------------------------------------------------------

test('cause-to-error table: one case per cause, ShaperLlmUnavailableError only for a failed planning call', () => {
	const expected: Record<PipelineCause, new (...a: never[]) => Error> = {
		'invalid-input':          ShaperInvalidInputError,
		'planner-prompt-missing': ShaperPromptMissingError,
		'planner-model-failed':   ShaperLlmUnavailableError,
		'answer-prompt-missing':  ShaperPromptMissingError,
		'answer-model-failed':    ShaperAnswerStepFailedError,
		'answer-invalid':         ShaperAnswerStepFailedError,
		'empty-plan':             ShaperNoPlanError,
		'bundle-invalid':         ShaperAnswerStepFailedError,
	};
	// Every member of the cause list has a row here and a case in the table.
	assert.deepEqual([...PIPELINE_CAUSES].sort(), Object.keys(expected).sort());
	const modelFailed: PipelineCause[] = [];
	for (const c of PIPELINE_CAUSES) {
		const err = errorForPipelineCause(c, 'detail', { promptPath: '/p/prompt.md', found: FOUND_NOTHING_LEFT_OUT });
		assert.ok(err instanceof expected[c], `${c} -> ${err.name}`);
		assert.equal(err.constructor, expected[c], `${c}: exactly that class`);
		if (err instanceof ShaperLlmUnavailableError) modelFailed.push(c);
	}
	// A failed answer-writing call is no longer reported as an unavailable model:
	// the lookups ran, so it is a failed answer step that carries what they found.
	assert.deepEqual(modelFailed, ['planner-model-failed']);
});

test('error messages state the cause, name the failed call, and never say retries or Ollama for another provider', () => {
	const cli = 'claude exited with 1. stderr=overloaded';
	assert.equal(errorForPipelineCause('planner-model-failed', cli).message, `The model call for planning failed: ${cli}`);
	const found = { found: FOUND_NOTHING_LEFT_OUT };
	assert.equal(
		errorForPipelineCause('answer-model-failed', cli, found).message,
		`The answer could not be written after 0 lookup(s) ran -- the model call for answer writing failed: ${cli}`,
	);
	assert.equal(
		errorForPipelineCause('bundle-invalid', '/focus must be string', found).message,
		'The answer could not be written after 0 lookup(s) ran -- the bundle failed validation: /focus must be string',
	);
	assert.equal(
		errorForPipelineCause('answer-invalid', 'no JSON', found).message,
		'The answer could not be written after 0 lookup(s) ran -- the answer-writing output was invalid: no JSON',
	);
	// The two prompt-missing causes carry the prompt file's path.
	assert.equal(
		errorForPipelineCause('planner-prompt-missing', 'Decomposer prompt file missing: /x/d.md', { promptPath: '/x/d.md' }).message,
		'Shaper prompt file missing: /x/d.md',
	);
	assert.equal(
		errorForPipelineCause('answer-prompt-missing', 'Synthesizer prompt file missing: /x/s.md', { promptPath: '/x/s.md' }).message,
		'Shaper prompt file missing: /x/s.md',
	);
	for (const c of PIPELINE_CAUSES) {
		const msg = errorForPipelineCause(c, cli, { promptPath: '/x/p.md', found: FOUND_NOTHING_LEFT_OUT }).message;
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
	for (const o of [p1.outcome, p2.outcome]) {
		assert.throws(
			() => settlePipelineOutcome(o, stamp),
			(err: unknown) => {
				assert.ok(err instanceof ShaperLlmUnavailableError);
				assert.match(err.message, /^The model call for planning failed: /);
				assert.ok(!err.message.includes('Ollama'), err.message);
				assert.ok(!err.message.includes('Local'), err.message);
				return true;
			},
		);
	}
	for (const o of [a1.outcome, a2.outcome]) {
		assert.throws(
			() => settlePipelineOutcome(o, stamp),
			(err: unknown) => {
				assert.ok(err instanceof ShaperAnswerStepFailedError, `got ${(err as Error).name}`);
				assert.equal(err.reason, 'model-failed');
				assert.match(err.message, /the model call for answer writing failed: /);
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

test("runShaper throws ShaperAnswerStepFailedError with reason 'invalid-bundle' for an invalid bundle", () => {
	// A bundle with a layer missing fails the bundle schema.
	const broken = { ...RAW } as Record<string, unknown>;
	delete broken['summary'];
	assert.throws(
		() => settlePipelineOutcome({ kind: 'bundle', raw: broken as unknown as RawBundle, explorationCount: 2, found: FOUND_NOTHING_LEFT_OUT }, stamp),
		(err: unknown) => {
			assert.ok(err instanceof ShaperAnswerStepFailedError, `got ${(err as Error).name}`);
			assert.equal(err.reason, 'invalid-bundle');
			assert.ok(!(err instanceof ShaperLlmUnavailableError));
			assert.ok(!(err instanceof ShaperSchemaUnrecoverable));
			assert.match(err.message, /the bundle failed validation: /);
			assert.match(err.message, /summary/);
			return true;
		},
	);
});

test('settlePipelineOutcome: a valid bundle is stamped and returned; not-applicable continues; a cause throws its error', () => {
	const ok = settlePipelineOutcome({ kind: 'bundle', raw: RAW, explorationCount: 3, found: FOUND_NOTHING_LEFT_OUT }, stamp);
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

// ---------------------------------------------------------------------------
// A failure after the lookups ran carries what they found
// ---------------------------------------------------------------------------

type DidNotProceed = Extract<PipelineOutcome, { kind: 'did-not-proceed' }>;

test("the pipeline's three causes after the lookups ran carry the results and the report, and the cause table gives ShaperAnswerStepFailedError with its reason", async () => {
	const broken = { ...RAW } as Record<string, unknown>;
	delete broken['summary'];

	// The two causes the pipeline itself returns.
	const modelFailed = await run({ synthesize: async () => { throw new SynthesizerLlmUnavailableError('codex exited with 2'); } });
	const invalid     = await run({ synthesize: async () => { throw new SynthesizerSchemaUnrecoverable(3, ['no JSON object']); } });
	for (const [r, expectedCause, reason] of [
		[modelFailed, 'answer-model-failed', 'model-failed'],
		[invalid,     'answer-invalid',      'invalid-answer'],
	] as const) {
		assert.equal(cause(r.outcome), expectedCause);
		const o = r.outcome as DidNotProceed;
		// Exactly what the lookup step returned, and the report derived from it.
		assert.equal(r.calls.executed.length, 1);
		assert.equal(o.found?.results, r.calls.executed[0]?.results);
		assert.equal(o.found?.results.length, 1);
		assert.deepEqual(o.found?.report, { completeness: { complete: true, incomplete: [], failed: [] } });

		assert.throws(() => settlePipelineOutcome(o, stamp), (err: unknown) => {
			assert.ok(err instanceof ShaperAnswerStepFailedError, `got ${(err as Error).name}`);
			assert.equal(err.reason, reason);
			assert.equal(err.found.results, r.calls.executed[0]?.results);
			assert.equal(err.found.report.answerFailure?.startsWith(
				reason === 'model-failed' ? 'the model call for answer writing failed: ' : 'the answer-writing output was invalid: ',
			), true, err.found.report.answerFailure);
			assert.deepEqual(err.found.report.completeness, o.found?.report.completeness);
			return true;
		});
	}

	// The third arises later, from a bundle outcome that fails validation.
	const badBundle = await run({ synthesize: async () => broken as unknown as RawBundle });
	assert.ok(badBundle.outcome.kind === 'bundle');
	assert.throws(() => settlePipelineOutcome(badBundle.outcome, stamp), (err: unknown) => {
		assert.ok(err instanceof ShaperAnswerStepFailedError, `got ${(err as Error).name}`);
		assert.equal(err.reason, 'invalid-bundle');
		assert.equal(err.found.results, badBundle.calls.executed[0]?.results);
		assert.match(err.found.report.answerFailure ?? '', /^the bundle failed validation: .*summary/);
		return true;
	});

	// A cause that arises after the lookups ran cannot be raised without their results.
	for (const c of ['answer-model-failed', 'answer-invalid', 'bundle-invalid'] as const) {
		assert.throws(() => errorForPipelineCause(c, 'detail'), /arises after the lookups ran and was raised without their results/);
	}

	// A failed planning call happened before any lookup: nothing is carried.
	const planning = await run({ decompose: async () => { throw new DecomposerLlmUnavailableError('down'); } });
	assert.equal(cause(planning.outcome), 'planner-model-failed');
	assert.equal((planning.outcome as DidNotProceed).found, undefined);
	assert.equal(planning.calls.executed.length, 0);
});

test('a missing answer prompt found after the lookups ran carries the results and the report under its own code; a missing planning prompt carries none', async () => {
	const answer = await run({ synthesize: async () => { throw new SynthesizerPromptMissingError('/x/synth.md'); } });
	assert.equal(cause(answer.outcome), 'answer-prompt-missing');
	const o = answer.outcome as DidNotProceed;
	assert.equal(o.found?.results, answer.calls.executed[0]?.results);
	assert.deepEqual(o.found?.report, { completeness: { complete: true, incomplete: [], failed: [] } });
	assert.throws(() => settlePipelineOutcome(o, stamp), (err: unknown) => {
		// Its own error: a fault of the installation, not a failed answer step.
		assert.ok(err instanceof ShaperPromptMissingError, `got ${(err as Error).name}`);
		assert.equal(err.message, 'Shaper prompt file missing: /x/synth.md');
		assert.equal(err.found?.results, answer.calls.executed[0]?.results);
		assert.deepEqual(err.found?.report, o.found?.report);
		return true;
	});

	const planning = await run({ decompose: async () => { throw new DecomposerPromptMissingError('/x/plan.md'); } });
	assert.equal(cause(planning.outcome), 'planner-prompt-missing');
	assert.equal((planning.outcome as DidNotProceed).found, undefined);
	assert.throws(() => settlePipelineOutcome(planning.outcome, stamp), (err: unknown) => {
		assert.ok(err instanceof ShaperPromptMissingError);
		assert.equal(err.found, undefined);
		return true;
	});
	// The table does not attach findings to a planning prompt even when handed some.
	const forced = errorForPipelineCause('planner-prompt-missing', 'm', { promptPath: '/x/plan.md', found: FOUND_NOTHING_LEFT_OUT });
	assert.equal((forced as ShaperPromptMissingError).found, undefined);
});
