import '../../orchestrator/__tests__/private-paths.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Planner driver pure-function unit tests.
 *
 * Covers the bits of driver.ts that DON'T touch the LLM:
 *   - renderCatalog / renderDepthPolicy formatting
 *   - error classification (Ollama unavailability vs schema)
 *   - typed-error message shapes
 *
 * End-to-end behaviour against real Ollama lives in
 * planner.live.test.ts (next phase).
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/planner/__tests__/driver-unit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModelCallFailedError } from '../../../agent/providers/model-call-error.js';

import {
	_resetTemplateRegistryForTests,
	EmptyPlanCatalogError,
	MaxPlanDepthExceededError,
	PlanBuilderExhausted,
	PlanBuilderLlmUnavailableError,
	PlanBuilderPromptMissingError,
	PlanBuilderSchemaUnrecoverable,
	renderCatalog,
	renderDepthPolicy,
	runPlanner,
} from '../index.js';
import { SCOPE_BAND } from '../scope-band.js';
import { _setPlannerStructuredForTest } from '../driver.js';
import { planAttemptsDirFor } from '../cache.js';
import { DOCS_TEMPLATES } from '../templates/docs/index.js';
import { taskCountFailure, validatePlan } from '../validate.js';
import type { PlanTask, PlannedTask } from '../../../shared/analyze-types.js';
import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import type { AnalyzeContextBundle } from '../../context/types.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';

/**
 * A minimal LLMProvider stub that throws on every call. Used by the
 * depth-check tests that want to exercise the pre-LLM gate but
 * never actually pay for a model call.
 */
const STUB_PROVIDER: LLMProvider = {
	supportsTools: true,
	capabilities:  {
		structuredOutput: true,
		toolCalling:      true,
		vision:           false,
		webSearch:        false,
		streaming:        true,
		embeddings:       false,
	},
	complete:        async () => { throw new Error('stub: complete should not be called'); },
	completeStructured: async () => { throw new Error('stub: completeStructured should not be called'); },
	stream:          async function* () { yield ''; throw new Error('stub: stream should not be called'); },
	embed:           async () => [],
};
import {
	_appendCorrectionTurnForTest,
	_buildInitialMessagesForTest,
	_classifyErrorForTest,
} from '../driver.js';
import { plannerWireSchema } from '../wire-schema.js';
import type {
	AnalyzeTaskTemplate,
	ClassifiedIntent,
	PlanTask,
	PlanValidationFailure,
} from '../types.js';

// ---------------------------------------------------------------------------
// renderCatalog
// ---------------------------------------------------------------------------

const SAMPLE_TEMPLATE: AnalyzeTaskTemplate = {
	id:           'code.discovery.modules',
	target:       'code',
	family:       'discovery',
	kind:         'leaf',
	revision:     'r1',
	description:  'enumerate modules in scope',
	inputSchema:  { type: 'object', properties: { scopeRef: { type: 'object' } } },
	produces:     ['modules'],
};

const SAMPLE_AGGREGATOR: AnalyzeTaskTemplate = {
	id:           'code.aggregate.report',
	target:       'code',
	family:       'aggregate',
	kind:         'leaf',
	revision:     'r1',
	description:  'aggregate task outputs into the final report',
	inputSchema:  { type: 'object', additionalProperties: true },
	produces:     ['report'],
	isAggregator: true,
};

test('renderCatalog: empty catalog renders the no-templates marker', () => {
	const out = renderCatalog([]);
	assert.match(out, /no templates registered/);
});

test('renderCatalog: single template renders id + target + family + description + produces', () => {
	const out = renderCatalog([SAMPLE_TEMPLATE]);
	assert.match(out, /code\.discovery\.modules/);
	assert.match(out, /target.*code/);
	assert.match(out, /family.*discovery/);
	assert.match(out, /kind.*leaf/);
	assert.match(out, /enumerate modules in scope/);
	assert.match(out, /produces.*modules/);
	assert.match(out, /inputSchema/);
});

test('renderCatalog: aggregator template flags itself with INV-12 hint', () => {
	const out = renderCatalog([SAMPLE_AGGREGATOR]);
	assert.match(out, /aggregator.*yes/);
	assert.match(out, /INV-12/);
});

test('renderCatalog: catalog order is preserved', () => {
	const out = renderCatalog([SAMPLE_TEMPLATE, SAMPLE_AGGREGATOR]);
	const discoveryIdx  = out.indexOf('code.discovery.modules');
	const aggregatorIdx = out.indexOf('code.aggregate.report');
	assert.ok(discoveryIdx >= 0);
	assert.ok(aggregatorIdx >= 0);
	assert.ok(discoveryIdx < aggregatorIdx);
});

// ---------------------------------------------------------------------------
// renderDepthPolicy
// ---------------------------------------------------------------------------

test('renderDepthPolicy: M scope reports 20-40 band', () => {
	const out = renderDepthPolicy('M', false);
	assert.match(out, /scope.*M/);
	assert.match(out, /expected task count.*20-40/);
});

test('renderDepthPolicy: focused intent prints the lower bound that is enforced', () => {
	const out = renderDepthPolicy('M', true);
	assert.match(out, /expected task count.*10-40/);
});

test('renderDepthPolicy prints the INV-13 range for every scope and focus value, without halving wording', () => {
	for (const scope of ['XS', 'S', 'M', 'L', 'XL'] as const) {
		for (const focused of [false, true]) {
			const lo = focused ? Math.floor(SCOPE_BAND[scope].lo / 2) : SCOPE_BAND[scope].lo;
			const hi = SCOPE_BAND[scope].hi;
			const out = renderDepthPolicy(scope, focused);
			const label = `${scope} focused=${focused}`;
			assert.equal(out.match(/\*\*\d+-\d+\*\*/g)?.length, 1, `${label}: range printed once`);
			assert.match(out, new RegExp(`expected task count: \\*\\*${lo}-${hi}\\*\\*`), label);
			assert.doesNotMatch(out, /half|halv|reduc/i, label);
			// the plan at the printed bounds is the plan the validator accepts, and one task outside is refused
			for (const [n, ok] of [[lo, true], [hi, true], [lo - 1, false], [hi + 1, false]] as const) {
				const plan = { scope, tasks: new Array(n) } as unknown as PlanTask;
				assert.equal(taskCountFailure(plan, { focused }) === null, ok, `${label} n=${n}`);
			}
		}
	}
});

test('no duplicate band table in the renderer', () => {
	const source = readFileSync(new URL('../render-catalog.ts', import.meta.url), 'utf8');
	assert.doesNotMatch(source, /\bXS:\s*\{\s*lo/, 'a band table literal remains');
	assert.doesNotMatch(source, /Math\.floor\([^)]*\/\s*2\)/, 'a copy of the focused lower bound remains');
	assert.match(source, /from '\.\/scope-band\.js'/);
});

test('renderDepthPolicy: XS depth hint mentions detailed per-unit', () => {
	const out = renderDepthPolicy('XS', false);
	assert.match(out, /scope.*XS/);
	assert.match(out, /expected task count.*3-8/);
	assert.match(out, /most detailed/i);
});

test('renderDepthPolicy: XL depth hint mentions structural breadth + child plans', () => {
	const out = renderDepthPolicy('XL', false);
	assert.match(out, /expected task count.*40-80/);
	assert.match(out, /most structural/i);
	assert.match(out, /child plans?/i);
});

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

test('classifyError(ECONNREFUSED) -> PlanBuilderLlmUnavailableError', () => {
	const err = new ModelCallFailedError('connect ECONNREFUSED 127.0.0.1:11434');
	const out = _classifyErrorForTest(err);
	assert.ok(out instanceof PlanBuilderLlmUnavailableError);
	assert.match(out.message, /ECONNREFUSED/);
});

test('classifyError("Ollama is not running") -> PlanBuilderLlmUnavailableError', () => {
	const err = new ModelCallFailedError('Ollama is not running. Start it with: ollama serve');
	const out = _classifyErrorForTest(err);
	assert.ok(out instanceof PlanBuilderLlmUnavailableError);
});

test('classifyError("Model not found") -> PlanBuilderLlmUnavailableError', () => {
	const err = new ModelCallFailedError('Model not found in Ollama.');
	const out = _classifyErrorForTest(err);
	assert.ok(out instanceof PlanBuilderLlmUnavailableError);
});

test('classifyError(arbitrary error) -> PlanBuilderSchemaUnrecoverable', () => {
	const err = new Error('json parse failed');
	const out = _classifyErrorForTest(err);
	assert.ok(out instanceof PlanBuilderSchemaUnrecoverable);
});

test('classifyError(non-Error) -> wraps in PlanBuilderSchemaUnrecoverable', () => {
	const out = _classifyErrorForTest('thrown string');
	assert.ok(out instanceof Error);
});

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

test('PlanBuilderLlmUnavailableError carries cause in message', () => {
	const e = new PlanBuilderLlmUnavailableError('ECONNREFUSED');
	assert.equal(e.name, 'PlanBuilderLlmUnavailableError');
	// The message names the call and no provider: the planner's provider is role-routed.
	assert.match(e.message, /^The model call for the plan builder failed: /);
	assert.doesNotMatch(e.message, /Ollama|Local/);
	assert.match(e.message, /ECONNREFUSED/);
});

test('PlanBuilderSchemaUnrecoverable carries error list in message', () => {
	const e = new PlanBuilderSchemaUnrecoverable(['missing field foo', 'bad type bar']);
	assert.equal(e.name, 'PlanBuilderSchemaUnrecoverable');
	assert.match(e.message, /missing field foo/);
	assert.match(e.message, /bad type bar/);
});

test('PlanBuilderPromptMissingError carries the absolute path', () => {
	const e = new PlanBuilderPromptMissingError('/abs/path/planner.system.md');
	assert.equal(e.name, 'PlanBuilderPromptMissingError');
	assert.match(e.message, /\/abs\/path\/planner\.system\.md/);
});

test('PlanBuilderExhausted carries attempts + failures + lastFailure', () => {
	const attempts: PlanTask[] = [
		{ planId: 'p-root', goal: 'g', target: 'code', scope: 'M',
		  tasks: [], reasoning: 'r' },
	];
	const failures: PlanValidationFailure[] = [
		{ invariantId: 'INV-1', message: 'tasks list empty' },
	];
	const e = new PlanBuilderExhausted(attempts, failures);
	assert.equal(e.name, 'PlanBuilderExhausted');
	assert.equal(e.attempts.length, 1);
	assert.equal(e.failures.length, 1);
	assert.equal(e.lastFailure.invariantId, 'INV-1');
	assert.match(e.message, /INV-1/);
	assert.match(e.message, /tasks list empty/);
});

// ---------------------------------------------------------------------------
// Initial-message + correction-turn shape
// ---------------------------------------------------------------------------

const SAMPLE_INTENT: ClassifiedIntent = {
	target:    'code',
	scope:     'M',
	focused:   false,
	scopeRef:  { kind: 'repo', value: '/r' },
	reasoning: 'test',
};

test('buildInitialMessages: emits 2 messages (system, user) with all the required sections', () => {
	const msgs = _buildInitialMessagesForTest({
		promptContent: 'PLANNER SYSTEM PROMPT',
		bundleMd:      'BUNDLE BODY',
		intent:        SAMPLE_INTENT,
		catalog:       [SAMPLE_TEMPLATE, SAMPLE_AGGREGATOR],
		wire:          plannerWireSchema([SAMPLE_TEMPLATE, SAMPLE_AGGREGATOR]),
	});
	assert.equal(msgs.length, 2);
	assert.equal(msgs[0]!.role, 'system');
	assert.equal(msgs[1]!.role, 'user');

	const sys  = msgs[0]!.content as string;
	const user = msgs[1]!.content as string;

	assert.match(sys, /PLANNER SYSTEM PROMPT/);
	assert.match(sys, /Contract reminder/);   // CONTRACT_FOOTER_MD heading

	assert.match(user, /PlanSchemaVersion/);
	assert.match(user, /## Intent/);
	assert.match(user, /## Context bundle/);
	assert.match(user, /BUNDLE BODY/);
	assert.match(user, /## DEPTH POLICY BAND/);
	assert.match(user, /## TASK CATALOG/);
	assert.match(user, /code\.discovery\.modules/);
	assert.match(user, /code\.aggregate\.report/);
	assert.match(user, /## OUTPUT SHAPE/);
	assert.match(user, /## TASK/);
});

test('buildInitialMessages: child-plan parentTaskPath emits the warning note', () => {
	const msgs = _buildInitialMessagesForTest({
		promptContent: 'P',
		bundleMd:      'B',
		intent:        SAMPLE_INTENT,
		catalog:       [SAMPLE_TEMPLATE],
		wire:          plannerWireSchema([SAMPLE_TEMPLATE]),
		parentTaskPath: 't02',
	});
	const user = msgs[1]!.content as string;
	assert.match(user, /Child plan.*t02/);
	assert.match(user, /Do NOT emit `parentTaskPath`/);
});

test('appendCorrectionTurn: re-issues with the assistant turn + VALIDATOR FEEDBACK block', () => {
	const prior = [
		{ role: 'system' as const, content: 'sys' },
		{ role: 'user'   as const, content: 'init' },
	];
	const rejected: PlanTask = {
		planId: 'p-root', goal: 'g', target: 'code', scope: 'M',
		tasks: [], reasoning: 'r',
	};
	const failure: PlanValidationFailure = {
		invariantId: 'INV-1',
		message:     'tasks list must be non-empty',
	};
	const out = _appendCorrectionTurnForTest(prior, rejected, failure, []);
	assert.equal(out.length, 4);
	assert.equal(out[2]!.role, 'assistant');
	assert.equal(out[3]!.role, 'user');
	const userBody = out[3]!.content as string;
	assert.match(userBody, /VALIDATOR FEEDBACK/);
	assert.match(userBody, /INV-1/);
	assert.match(userBody, /tasks list must be non-empty/);
	// I-004: the corrective turn now includes prescriptive fix hints.
	assert.match(userBody, /HOW TO FIX/);
});

// The correction turn as it was before the count could be stated beside another failure:
// captured from the code before that change (fixtures/correction-turn-inv7.json).
interface CorrectionTurnFixture {
	readonly prior:    LLMMessage[];
	readonly rejected: PlanTask;
	readonly failure:  PlanValidationFailure;
	readonly cases:    ReadonlyArray<{ name: string; priorFailures: PlanValidationFailure[]; expected: LLMMessage[] }>;
}
const CORRECTION_TURN_FIXTURE = JSON.parse(
	readFileSync(new URL('./fixtures/correction-turn-inv7.json', import.meta.url), 'utf8'),
) as CorrectionTurnFixture;

test('appendCorrectionTurn without alsoFailing is byte-identical to the pre-change fixture', () => {
	assert.equal(CORRECTION_TURN_FIXTURE.cases.length, 2);
	for (const c of CORRECTION_TURN_FIXTURE.cases) {
		const out = _appendCorrectionTurnForTest(
			CORRECTION_TURN_FIXTURE.prior, CORRECTION_TURN_FIXTURE.rejected, CORRECTION_TURN_FIXTURE.failure, c.priorFailures,
		);
		assert.deepEqual(out, c.expected, c.name);
	}
});

const COUNT_FAILURE: PlanValidationFailure = {
	invariantId: 'INV-13',
	message:     'task count 15 is outside the scope band for XL (20-80 focused)',
	target:      { count: 15, scope: 'XL', band: { lo: 20, hi: 80 } },
};

function lastUserTurn(messages: LLMMessage[]): string {
	return messages[messages.length - 1]!.content as string;
}

test('appendCorrectionTurn with alsoFailing states the primary first and the count second', () => {
	const { prior, rejected, failure } = CORRECTION_TURN_FIXTURE;
	const body = lastUserTurn(_appendCorrectionTurnForTest(prior, rejected, failure, [], COUNT_FAILURE));
	const primaryAt = body.indexOf('failed invariant **INV-7**');
	const alsoAt = body.indexOf('also fails invariant **INV-13**');
	assert.ok(primaryAt >= 0 && alsoAt > primaryAt, 'the count comes after the primary failure');
	assert.ok(body.indexOf('HOW TO FIX') < alsoAt, 'the primary failure keeps its fix hint before the count');
	assert.ok(body.includes(COUNT_FAILURE.message));
	assert.match(body, /Fix both in the same reply/);
	// the primary message itself is the same text as without the count
	const plain = lastUserTurn(_appendCorrectionTurnForTest(prior, rejected, failure, []));
	assert.ok(body.startsWith(plain.slice(0, plain.indexOf('Emit the corrected'))));
});

test('repetition banner follows primary failures only, including the secondary-to-primary transition', () => {
	const { prior, rejected, failure } = CORRECTION_TURN_FIXTURE;
	// attempt 1: INV-7 primary, the count is only a note, and no history yet
	const first = lastUserTurn(_appendCorrectionTurnForTest(prior, rejected, failure, [], COUNT_FAILURE));
	assert.doesNotMatch(first, /REPEATED FAILURE/);
	// attempt 2: the count is now the primary failure; the history holds INV-7 only, so no banner
	const second = lastUserTurn(_appendCorrectionTurnForTest(prior, rejected, COUNT_FAILURE, [failure]));
	assert.doesNotMatch(second, /REPEATED FAILURE/);
	assert.doesNotMatch(second, /ALSO FAILING/);
	// attempt 3: the count is the primary failure again, so the banner appears
	const third = lastUserTurn(_appendCorrectionTurnForTest(prior, rejected, COUNT_FAILURE, [failure, COUNT_FAILURE]));
	assert.match(third, /REPEATED FAILURE/);
});

// ---------------------------------------------------------------------------
// MaxPlanDepthExceededError + depth-cap pre-check
// ---------------------------------------------------------------------------

test('MaxPlanDepthExceededError carries currentDepth, rootScope, cap on the instance', () => {
	const e = new MaxPlanDepthExceededError(5, 'M', 4);
	assert.equal(e.name, 'MaxPlanDepthExceededError');
	assert.equal(e.currentDepth, 5);
	assert.equal(e.rootScope, 'M');
	assert.equal(e.cap, 4);
	assert.match(e.message, /currentDepth=5/);
	assert.match(e.message, /max-plan-depth/);
	assert.match(e.message, /root scope M/);
	assert.match(e.message, /cap=4/);
});

test('runPlanner: refuses BEFORE any LLM call when currentDepth+1 > cap', async () => {
	_resetAnalyzeConfigCacheForTests();
	const emptyBundle: AnalyzeContextBundle = {
		system: '', focus: '', summary: '', structure: '', surface: '',
		artefacts: '', upstream: '',
	};
	// Root scope = M -> default cap = 4. currentDepth = 5 -> refuses
	// (5 + 1 > 4). Provider would never be touched; we omit it.
	await assert.rejects(
		() => runPlanner({
			input: {
				intent: {
					target:    'code',
					scope:     'M',
					focused:   false,
					scopeRef:  { kind: 'repo', value: '/r' },
					reasoning: 'depth-cap test fixture',
				},
				contextBundle: emptyBundle,
				catalog:       [],
				currentDepth:  5,
				// rootScope defaults to intent.scope = 'M'
			},
			opts: { runId: 'depth-cap-test' },
		}),
		MaxPlanDepthExceededError,
	);
});

test('runPlanner: rootScope overrides intent.scope for the depth cap', async () => {
	_resetAnalyzeConfigCacheForTests();
	const emptyBundle: AnalyzeContextBundle = {
		system: '', focus: '', summary: '', structure: '', surface: '',
		artefacts: '', upstream: '',
	};
	// Child plan classified as XS (cap=2), but root is XL (cap=6).
	// currentDepth=3 against XL cap=6 -> 3+1=4, within cap -> proceeds
	// past the depth check. Stub provider throws on completeStructured
	// so we can confirm depth-pass without paying for a real LLM call.
	const err = await runPlanner({
		input: {
			intent: {
				target:    'code',
				scope:     'XS',
				focused:   false,
				scopeRef:  { kind: 'repo', value: '/r' },
				reasoning: 'rootScope override fixture',
			},
			contextBundle: emptyBundle,
			catalog:       [],
			currentDepth:  3,
			rootScope:     'XL',
		},
		opts:     { runId: 'rootscope-override-test' },
		provider: STUB_PROVIDER,
	}).catch((e: unknown) => e);
	// We expect a non-MaxPlanDepthExceeded error (the depth check
	// passed; the stub provider's throw triggered the failure later).
	assert.ok(err instanceof Error);
	assert.equal((err as Error).name === 'MaxPlanDepthExceededError', false,
		`expected non-depth error; got: ${err}`);
});

test('runPlanner: rootScope=XS at currentDepth=2 (exactly the cap) is rejected', async () => {
	_resetAnalyzeConfigCacheForTests();
	const emptyBundle: AnalyzeContextBundle = {
		system: '', focus: '', summary: '', structure: '', surface: '',
		artefacts: '', upstream: '',
	};
	// XS cap=2. currentDepth=2 means we're about to build a 3rd-level
	// plan. 2+1=3 > 2 -> rejected.
	await assert.rejects(
		() => runPlanner({
			input: {
				intent: {
					target:    'code',
					scope:     'XS',
					focused:   false,
					scopeRef:  { kind: 'repo', value: '/r' },
					reasoning: 'XS boundary fixture',
				},
				contextBundle: emptyBundle,
				catalog:       [],
				currentDepth:  2,
				rootScope:     'XS',
			},
			opts: { runId: 'xs-boundary-test' },
		}),
		MaxPlanDepthExceededError,
	);
});

test('runPlanner: default currentDepth=0 always passes the depth check (cap >= 2)', async () => {
	_resetAnalyzeConfigCacheForTests();
	const emptyBundle: AnalyzeContextBundle = {
		system: '', focus: '', summary: '', structure: '', surface: '',
		artefacts: '', upstream: '',
	};
	// No currentDepth supplied -> defaults to 0 -> 0+1=1, within every
	// bucket's cap. Should pass the depth check; the stub provider's
	// throw provides the downstream failure.
	const err = await runPlanner({
		input: {
			intent: {
				target:    'code',
				scope:     'XS',
				focused:   false,
				scopeRef:  { kind: 'repo', value: '/r' },
				reasoning: 'default-depth fixture',
			},
			contextBundle: emptyBundle,
			catalog:       [],
		},
		opts:     { runId: 'default-depth-test' },
		provider: STUB_PROVIDER,
	}).catch((e: unknown) => e);
	assert.equal((err as Error).name === 'MaxPlanDepthExceededError', false);
});

test('appendCorrectionTurn with failure.target renders the pointer', () => {
	const prior = [
		{ role: 'user' as const, content: 'init' },
	];
	const rejected: PlanTask = {
		planId: 'p-root', goal: 'g', target: 'code', scope: 'M',
		tasks: [], reasoning: 'r',
	};
	const failure: PlanValidationFailure = {
		invariantId: 'INV-12',
		message:     'aggregator must be last',
		target:      { aggregatorIndex: 5, lastIndex: 19 },
	};
	const out = _appendCorrectionTurnForTest(prior, rejected, failure, []);
	const userBody = out[2]!.content as string;
	assert.match(userBody, /Pointer:/);
	assert.match(userBody, /aggregatorIndex/);
});

test('appendCorrectionTurn: escalation banner fires when the same (invariantId, taskId) repeats', () => {
	const prior = [
		{ role: 'user' as const, content: 'init' },
	];
	const rejected: PlanTask = {
		planId: 'p-root', goal: 'g', target: 'code', scope: 'M',
		tasks: [], reasoning: 'r',
	};
	const failure: PlanValidationFailure = {
		invariantId: 'INV-11',
		message:     'task t13: consumes report at same index',
		target:      { taskId: 't13' },
	};
	// A prior identical failure means this is the SECOND time we see it.
	const priorFailures: PlanValidationFailure[] = [
		{
			invariantId: 'INV-11',
			message:     'task t13: consumes report at same index',
			target:      { taskId: 't13' },
		},
	];
	const out = _appendCorrectionTurnForTest(prior, rejected, failure, priorFailures);
	const userBody = out[2]!.content as string;
	assert.match(userBody, /REPEATED FAILURE/);
	assert.match(userBody, /SAME violation/);
	assert.match(userBody, /DIFFERENT remedy/);
});

test('appendCorrectionTurn: no escalation banner when previous failure was a different invariant', () => {
	const prior = [
		{ role: 'user' as const, content: 'init' },
	];
	const rejected: PlanTask = {
		planId: 'p-root', goal: 'g', target: 'code', scope: 'M',
		tasks: [], reasoning: 'r',
	};
	const failure: PlanValidationFailure = {
		invariantId: 'INV-11',
		message:     'task t13: topo violation',
		target:      { taskId: 't13' },
	};
	const priorFailures: PlanValidationFailure[] = [
		{
			invariantId: 'INV-7',
			message:     'task t9: unmet dep',
			target:      { taskId: 't9' },
		},
	];
	const out = _appendCorrectionTurnForTest(prior, rejected, failure, priorFailures);
	const userBody = out[2]!.content as string;
	assert.doesNotMatch(userBody, /REPEATED FAILURE/);
});

test('appendCorrectionTurn: no escalation banner when same invariant hits a different task', () => {
	const prior = [
		{ role: 'user' as const, content: 'init' },
	];
	const rejected: PlanTask = {
		planId: 'p-root', goal: 'g', target: 'code', scope: 'M',
		tasks: [], reasoning: 'r',
	};
	const failure: PlanValidationFailure = {
		invariantId: 'INV-11',
		message:     'task t20: topo violation',
		target:      { taskId: 't20' },
	};
	const priorFailures: PlanValidationFailure[] = [
		{
			invariantId: 'INV-11',
			message:     'task t5: topo violation',
			target:      { taskId: 't5' },
		},
	];
	const out = _appendCorrectionTurnForTest(prior, rejected, failure, priorFailures);
	const userBody = out[2]!.content as string;
	assert.doesNotMatch(userBody, /REPEATED FAILURE/);
});

test('runPlanner: an empty template catalog is refused with a typed error before any schema is built or model is called', async () => {
	_resetAnalyzeConfigCacheForTests();
	_resetTemplateRegistryForTests();
	let called = 0;
	const provider = { completeStructured: async () => { called++; return {}; } } as unknown as LLMProvider;
	const emptyBundle: AnalyzeContextBundle = { system: '', focus: '', summary: '', structure: '', surface: '', artefacts: '', upstream: '' };
	const err = await runPlanner({
		input: {
			intent: { target: 'docs', scope: 'S', focused: false, scopeRef: { kind: 'repo', value: '/r' }, reasoning: 'empty catalog fixture' },
			contextBundle: emptyBundle,
			catalog: [],
		},
		opts: { runId: 'empty-catalog-test' },
		provider,
	}).then(() => undefined, (e: unknown) => e);
	assert.ok(err instanceof EmptyPlanCatalogError, String(err));
	assert.equal(err.target, 'docs');
	assert.match(err.message, /no task template is registered for target 'docs'/);
	assert.equal(called, 0, 'no model is called');
});

// ---------------------------------------------------------------------------
// The count stated beside another failure, through the retry loop
// ---------------------------------------------------------------------------

const DOCS_INTENT = {
	target: 'docs' as const, scope: 'XL' as const, focused: true,
	scopeRef: { kind: 'repo' as const, value: '/r' }, reasoning: 'count-beside-failure fixture (XL focused: 20-80)',
};
const BUNDLE_FIXTURE: AnalyzeContextBundle = { system: '', focus: '', summary: '', structure: '', surface: '', artefacts: '', upstream: '' };

/** A docs plan of n tasks: inventory, n-2 family summaries, aggregator. `edit` may break an invariant. */
function docsPlan(n: number, edit?: (tasks: PlannedTask[]) => void): PlanTask {
	const tasks: PlannedTask[] = [
		{ taskId: 't01', template: 'docs.discovery.inventory', kind: 'leaf', params: { scopeRef: { kind: 'repo', value: '/r' } },
		  produces: ['docs-inventory'], rationale: 'inventory of every document family in scope' },
	];
	for (let i = 2; i < n; i++) {
		tasks.push({ taskId: `t${String(i).padStart(2, '0')}`, template: 'docs.family.summarise', kind: 'leaf', params: { family: 'design' },
		  produces: ['family-summary'], rationale: `summary number ${i} of the design family documents` });
	}
	tasks.push({ taskId: `t${String(n).padStart(2, '0')}`, template: 'docs.aggregate.report', kind: 'leaf', params: {},
	  produces: ['report'], rationale: 'aggregate every upstream output into the final report' });
	edit?.(tasks);
	return { planId: 'p-docs', goal: 'docs plan', target: 'generic', scope: 'XL', reasoning: 'docs plan used to drive the retry loop in a test fixture', tasks };
}

/** The reproduced sequence: INV-7 plus a wrong count, then INV-11 alone, then a valid plan. */
function reproducedReplies(): PlanTask[] {
	return [
		docsPlan(15, t => { t[2] = { ...t[2]!, consumes: ['never-produced'] }; }),
		docsPlan(20, t => { t[2] = { ...t[2]!, consumes: ['family-summary'] }; }),
		docsPlan(20),
	];
}

interface RecordedCall { messages: LLMMessage[]; opts: Record<string, unknown> | undefined }

function recordingProvider(replies: readonly PlanTask[], calls: RecordedCall[]): LLMProvider {
	return {
		supportsTools: false,
		capabilities:  { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
		complete:      async () => { throw new Error('stub: complete not used'); },
		stream:        async function* () { yield ''; throw new Error('stub: stream not used'); },
		embed:         async () => [],
		completeStructured: async <T>(messages: LLMMessage[], _schema: unknown, opts?: Record<string, unknown>) => {
			calls.push({ messages: [...messages], opts });
			const reply = replies[calls.length - 1];
			if (reply === undefined) throw new Error(`stub: no scripted reply for call ${calls.length}`);
			return reply as T;
		},
	} as unknown as LLMProvider;
}

function feedbackOf(runId: string): string[] {
	const dir = planAttemptsDirFor({ runId });
	return [1, 2, 3, 4, 5].flatMap(n => {
		const path = join(dir, `${String(n).padStart(2, '0')}.feedback.json`);
		return existsSync(path) ? [(JSON.parse(readFileSync(path, 'utf8')) as PlanValidationFailure).invariantId] : [];
	});
}

async function runDocsPlanner(runId: string, provider: LLMProvider): Promise<PlanTask> {
	_resetAnalyzeConfigCacheForTests();
	return runPlanner({
		input: { intent: { ...DOCS_INTENT }, contextBundle: BUNDLE_FIXTURE, catalog: DOCS_TEMPLATES },
		opts:  { runId },
		provider,
	});
}

test('with a recording stub provider, the initial prompt carries the enforced range', async () => {
	const calls: RecordedCall[] = [];
	await runDocsPlanner('count-note-range', recordingProvider([docsPlan(20)], calls));
	const first = calls[0]!.messages.map(m => String(m.content)).join('\n');
	assert.match(first, /expected task count: \*\*20-80\*\*/);
	assert.doesNotMatch(first, /half|halv/i);
});

test('with a recording stub provider, the correction message sent on call 2 states INV-7 and then the count', async () => {
	const calls: RecordedCall[] = [];
	await runDocsPlanner('count-note-call2', recordingProvider(reproducedReplies(), calls));
	const second = String(calls[1]!.messages[calls[1]!.messages.length - 1]!.content);
	const primaryAt = second.indexOf('failed invariant **INV-7**');
	const alsoAt = second.indexOf('also fails invariant **INV-13**');
	assert.ok(primaryAt >= 0 && alsoAt > primaryAt, second.slice(0, 400));
	assert.match(second, /task count 15 is outside the scope band for XL \(20-80 focused\)/);
});

test('recording-stub replay (INV-7 plus count, INV-11, valid) accepted at call 3 with primary-only feedback', async () => {
	const calls: RecordedCall[] = [];
	const replies = reproducedReplies();
	const accepted = await runDocsPlanner('count-note-replay', recordingProvider(replies, calls));
	assert.equal(calls.length, 3);
	assert.equal(accepted.tasks.length, 20);
	const third = String(calls[2]!.messages[calls[2]!.messages.length - 1]!.content);
	assert.match(third, /failed invariant \*\*INV-11\*\*/);
	assert.doesNotMatch(third, /ALSO FAILING/);
	assert.doesNotMatch(third, /REPEATED FAILURE/);
	assert.deepEqual(feedbackOf('count-note-replay'), ['INV-7', 'INV-11']);
});

test('through structuredStageForTest, failures and saved feedback hold primary failures only', async () => {
	const replies = reproducedReplies();
	const seen: string[][] = [];
	_setPlannerStructuredForTest(async ({ attempt, failures }) => {
		seen.push(failures.map(f => f.invariantId));
		return replies[attempt]!;
	});
	try {
		_resetAnalyzeConfigCacheForTests();
		await runPlanner({ input: { intent: { ...DOCS_INTENT }, contextBundle: BUNDLE_FIXTURE, catalog: DOCS_TEMPLATES }, opts: { runId: 'count-note-hook' } });
	} finally {
		_setPlannerStructuredForTest(undefined);
	}
	assert.deepEqual(seen, [[], ['INV-7'], ['INV-7', 'INV-11']]);
	assert.deepEqual(feedbackOf('count-note-hook'), ['INV-7', 'INV-11']);
});

test('an empty task list states the count and keeps INV-1 primary', () => {
	const empty: PlanTask = { ...docsPlan(20), tasks: [] };
	const failure = validatePlan(empty, DOCS_TEMPLATES, { focused: true });
	assert.equal(failure?.invariantId, 'INV-1');
	const also = taskCountFailure(empty, { focused: true });
	assert.equal(also?.invariantId, 'INV-13');
	const body = lastUserTurn(_appendCorrectionTurnForTest([], empty, failure!, [], also!));
	assert.ok(body.indexOf('failed invariant **INV-1**') < body.indexOf('also fails invariant **INV-13**'));
});
