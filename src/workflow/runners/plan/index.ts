/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `plan` workflow runners — Phase G (4th in the chain).
 *
 * Recipe (meta-workflow-framework.md §plan):
 *   s1: context.assemble    — read the approved LLD handoff + HLD slice
 *   s2: tasks.enumerate     — PlanTask[] (ordered / sized / dependency-labelled)
 *   s3: tasks.critique      — flag missing / over-sized / mis-ordered Tasks
 *   s4: tasks.finalize      — apply the critique's fixes
 *   s5: test-strategy.write — name per-Task tests + emit coverage (sc4)
 *   s6: checklist.verify    — plan audit
 *
 * Every step is an llm-pause runner. The upstream gate (sc3,
 * `readPlanUpstream`) runs at each step's prompt build, so an
 * unapproved / stale LLD aborts the run before any Task is enumerated.
 */

import { registerRunner } from '../../executor.js';
import { readPlanUpstream } from '../../gates.js';
import { assertEpicHash } from '../../hash.js';
import type { StepRunner, StepRunnerContext } from '../../types.js';
import {
	planChecklistSchema,
	planContextSchema,
	tasksCritiqueSchema,
	tasksEnumerateSchema,
	tasksFinalizeSchema,
	testStrategyWriteSchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Params helpers
// ---------------------------------------------------------------------------

function epicHashFrom(ctx: StepRunnerContext): string {
	const hash = ctx.intent.params['epicHash'];
	assertEpicHash(hash, `plan requires intent.params.epicHash`);
	return hash;
}

function storyIdFrom(ctx: StepRunnerContext): string {
	const id = ctx.intent.params['storyId'];
	if (typeof id !== 'string' || id.length === 0) {
		throw new Error(`plan requires intent.params.storyId`);
	}
	return id;
}

/** Read the approved+non-stale LLD + HLD slice + story dependency edges.
 *  Throws (via the sc3 gate) when the LLD is unusable. */
function upstream(ctx: StepRunnerContext): ReturnType<typeof readPlanUpstream> {
	return readPlanUpstream(ctx.intent.repoPath, epicHashFrom(ctx), storyIdFrom(ctx));
}

// ---------------------------------------------------------------------------
// Shared: llm-pause runner
// ---------------------------------------------------------------------------

function llmPauseRunner(spec: {
	readonly id:          string;
	readonly buildPrompt: (ctx: StepRunnerContext) => { readonly prompt: string; readonly userTurn: string };
	readonly schema:      Record<string, unknown>;
}): StepRunner {
	return {
		id:       spec.id,
		workflow: 'plan',
		async run(ctx) {
			const { prompt, userTurn } = spec.buildPrompt(ctx);
			return { type: 'llm-pause', prompt, userTurn, schema: spec.schema, preparedBlob: { stepId: spec.id } };
		},
		async finalize(llmResponse) {
			return { type: 'output', output: llmResponse };
		},
	};
}

// ---------------------------------------------------------------------------
// s1 — context.assemble
// ---------------------------------------------------------------------------

const contextAssemble = llmPauseRunner({
	id: 'context.assemble',
	buildPrompt: (ctx) => {
		const { lld, hldSlice, storyDependsOn } = upstream(ctx);
		return {
			prompt: [
				'You are running the `context.assemble` step of the `plan` workflow.',
				'',
				'The `plan` stage breaks ONE approved Story LLD into N ordered, sized,',
				'dependency-labelled Tasks. This step is READ-ONLY discovery — do NOT enumerate Tasks yet.',
				'',
				'What to do:',
				'  1. Read the LLD handoff below (contractDetails / dataModelChanges / errorPaths / testStrategy / migration).',
				'  2. Use `insrc_analyze_step` for any code grounding you need to SIZE the work (call sites, existing patterns). Do NOT invent module or symbol names.',
				'',
				'Emit a PlanContext JSON with one `analyzeBundles[]` entry per grounding pass.',
			].join('\n'),
			userTurn: [
				`Focus: ${ctx.intent.focus}`,
				`Epic hash: ${epicHashFrom(ctx)}   Story: ${storyIdFrom(ctx)}`,
				'',
				'Story dependency context (define storyDependsOn — Task ordering must respect it):',
				'```json',
				JSON.stringify(storyDependsOn, null, 2),
				'```',
				'',
				'HLD context slice (for cross-cutting context):',
				'```json',
				JSON.stringify(hldSlice, null, 2),
				'```',
				'',
				'Approved LLD handoff (what to break down):',
				'```json',
				JSON.stringify(lld.body, null, 2),
				'```',
				'',
				'Emit the PlanContext JSON now.',
			].join('\n'),
		};
	},
	schema: planContextSchema,
});

// ---------------------------------------------------------------------------
// s2 — tasks.enumerate
// ---------------------------------------------------------------------------

const tasksEnumerate = llmPauseRunner({
	id: 'tasks.enumerate',
	buildPrompt: (ctx) => {
		const { lld, storyDependsOn } = upstream(ctx);
		return {
			prompt: [
				'You are running the `tasks.enumerate` step of the `plan` workflow.',
				'',
				'Emit the PlanTask[] for this Story — the atomic units `build` will consume one at a time.',
				'',
				'HARD RULES:',
				'- Each Task id matches `t1`, `t2`, ... unique within the Story.',
				'- Each Task is right-sized (S / M / L), has a 1-based `order`, `dependsOn` (other Task ids), and >=1 `acceptanceChecks`.',
				'- `dependsOn` must be acyclic and `order` must be a valid topological order (a Task never precedes one it depends on).',
				'- Task ordering must respect the define Story dependency context (storyDependsOn) — never contradict this Story\'s place in that graph.',
				'- Every Task\'s `derivedFrom` cites the LLD handoff item(s) it implements — use the citation ids you will define at synthesize (c1, c2, ...). Collectively the Tasks must cover the whole LLD handoff.',
				'- Leave `tests` out here — the `test-strategy.write` step names them.',
			].join('\n'),
			userTurn: [
				's1 PlanContext:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s1'], null, 2),
				'```',
				'',
				'Story dependency context (storyDependsOn):',
				'```json',
				JSON.stringify(storyDependsOn, null, 2),
				'```',
				'',
				'Approved LLD handoff:',
				'```json',
				JSON.stringify(lld.body, null, 2),
				'```',
				'',
				'Emit the tasks JSON now.',
			].join('\n'),
		};
	},
	schema: tasksEnumerateSchema,
});

// ---------------------------------------------------------------------------
// s3 — tasks.critique
// ---------------------------------------------------------------------------

const tasksCritique = llmPauseRunner({
	id: 'tasks.critique',
	buildPrompt: (ctx) => {
		const { lld } = upstream(ctx);
		return {
			prompt: [
				'You are running the `tasks.critique` step of the `plan` workflow.',
				'',
				'Critique the enumerated Tasks. Flag: missing coverage of an LLD handoff item, over-sized Tasks (an L that should split),',
				'mis-ordered or cyclic dependencies, and Tasks whose acceptanceChecks are weak. Set `overallOk` false if anything must change.',
			].join('\n'),
			userTurn: [
				's2 Tasks:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s2'], null, 2),
				'```',
				'',
				'Approved LLD handoff (coverage target):',
				'```json',
				JSON.stringify(lld.body, null, 2),
				'```',
				'',
				'Emit the critique JSON now.',
			].join('\n'),
		};
	},
	schema: tasksCritiqueSchema,
});

// ---------------------------------------------------------------------------
// s4 — tasks.finalize
// ---------------------------------------------------------------------------

const tasksFinalize = llmPauseRunner({
	id: 'tasks.finalize',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `tasks.finalize` step of the `plan` workflow.',
			'',
			'Apply the s3 critique to produce the FINAL PlanTask[]. Same HARD RULES as tasks.enumerate:',
			'acyclic dependsOn, valid topological `order`, unique `t\\d+` ids, >=1 acceptanceChecks, non-empty derivedFrom,',
			'collective coverage of the LLD handoff. Still leave `tests` out (named next).',
		].join('\n'),
		userTurn: [
			's2 Tasks:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s2'], null, 2),
			'```',
			'',
			's3 Critique:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s3'], null, 2),
			'```',
			'',
			'Emit the finalized tasks JSON now.',
		].join('\n'),
	}),
	schema: tasksFinalizeSchema,
});

// ---------------------------------------------------------------------------
// s5 — test-strategy.write
// ---------------------------------------------------------------------------

const testStrategyWrite = llmPauseRunner({
	id: 'test-strategy.write',
	buildPrompt: (ctx) => {
		const { lld } = upstream(ctx);
		return {
			prompt: [
				'You are running the `test-strategy.write` step of the `plan` workflow.',
				'',
				'Name the tests each Task should produce and prove the LLD test strategy is collectively covered.',
				'',
				'HARD RULES:',
				'- Re-emit the FINAL Tasks from s4 verbatim, adding a `tests[]` of `{ level, name }` to each (>=1 per Task).',
				'- `level` is one of unit / integration / live / smoke — reuse the LLD testStrategy vocabulary; do NOT invent levels.',
				'- Emit `testStrategyCoverage[]`: one row per LLD testStrategy item (a `testLevels[].subjects` entry), verbatim, mapping it to the Task ids whose tests cover it.',
				'- Every LLD testStrategy subject must appear as exactly one `lldStrategyItem` with >=1 covering Task.',
			].join('\n'),
			userTurn: [
				's4 finalized Tasks:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s4'], null, 2),
				'```',
				'',
				'LLD testStrategy (items to cover — use the subjects verbatim):',
				'```json',
				JSON.stringify(lld.body.testStrategy, null, 2),
				'```',
				'',
				'Emit the tasks-with-tests + coverage JSON now.',
			].join('\n'),
		};
	},
	schema: testStrategyWriteSchema,
});

// ---------------------------------------------------------------------------
// s6 — checklist.verify
// ---------------------------------------------------------------------------

const checklistVerify = llmPauseRunner({
	id: 'checklist.verify',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are the AUDITOR for the `plan` workflow.',
			'',
			'Checklist:',
			'  t1: Every Task id matches `t\\d+` and is unique within the Story.',
			'  t2: Every Task is sized (S/M/L), ordered (1-based), and dependency-labelled.',
			'  t3: The dependsOn graph is acyclic and `order` is a valid topological order.',
			'  t4: Task ordering respects the define Story dependency context (storyDependsOn).',
			'  cov1: The union of the Tasks\' derivedFrom covers every LLD handoff item.',
			'  cov2: Every LLD testStrategy subject is covered by >=1 Task\'s tests (testStrategyCoverage).',
			'  test1: Every Task names >=1 test at a valid level.',
			'  gr1: Every derivedFrom id will resolve to a citation defined at synthesize.',
		].join('\n'),
		userTurn: [
			'Finalized Tasks + coverage (s5):',
			'```json',
			JSON.stringify(ctx.stepOutputs['s5'], null, 2),
			'```',
			'',
			'Emit the checklist verdict JSON now.',
		].join('\n'),
	}),
	schema: planChecklistSchema,
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerPlanRunners(): void {
	if (registered) return;
	registerRunner(contextAssemble);
	registerRunner(tasksEnumerate);
	registerRunner(tasksCritique);
	registerRunner(tasksFinalize);
	registerRunner(testStrategyWrite);
	registerRunner(checklistVerify);
	registered = true;
}
