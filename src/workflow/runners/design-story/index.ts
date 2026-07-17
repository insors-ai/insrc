/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `design.story` (LLD) workflow runners — Phase D.
 *
 * Recipe (workflow-design.md §5.2):
 *   s1: context.assemble        — Story-focused analyze + HLD slice
 *   s2: alternatives.enumerate  — 2-4 contract/data-model shapes
 *   s3: alternatives.judge      — score against Story + HLD constraints
 *   s4: contract.detail         — Story API + data model + shared-contract interaction
 *   s5: error.paths             — errors, edges, invariants to preserve
 *   s6: test.strategy           — test types + coverage plan
 *   s7: migration.write         — conditional; only for enhancement Epics
 *   s8: checklist.verify        — LLD audit (§9.2)
 *
 * Every step is an llm-pause runner (same shape as design.epic).
 * The `migration.write` runner short-circuits with a
 * `{ skipped: true }` output for `new-capability` flavor Epics
 * so the plan shape stays uniform.
 */

import { existsSync, readFileSync } from 'node:fs';

import { registerRunner } from '../../executor.js';
import { requireApprovedEpic, requireApprovedHld } from '../../gates.js';
import { extractHldContextSlice } from '../../artifacts/lld.js';
import { assertEpicHash } from '../../hash.js';
import { scopeAnalyzeCachePath } from '../../storage.js';
import type { StepRunner, StepRunnerContext } from '../../types.js';
import {
	alternativesEnumerateSchema,
	alternativesJudgeSchema,
	contractDetailSchema,
	errorPathsSchema,
	lldChecklistSchema,
	lldContextSchema,
	migrationSkippedOutput,
	migrationWriteSchema,
	testStrategySchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Params helpers
// ---------------------------------------------------------------------------

function epicHashFrom(ctx: StepRunnerContext): string {
	const hash = ctx.intent.params['epicHash'];
	assertEpicHash(hash, `design.story requires intent.params.epicHash`);
	return hash;
}

function storyIdFrom(ctx: StepRunnerContext): string {
	const id = ctx.intent.params['storyId'];
	if (typeof id !== 'string' || id.length === 0) {
		throw new Error(`design.story requires intent.params.storyId`);
	}
	return id;
}

/** Embed the `define` scope phase's cached analyze bundles (keyed by Epic
 *  hash) so the LLD's context.assemble reuses that exploration instead of
 *  re-running the same analyze passes. Returns '' when no cache exists. */
function priorScopeAnalyzeBlock(ctx: StepRunnerContext): string {
	const path = scopeAnalyzeCachePath(epicHashFrom(ctx));
	if (!existsSync(path)) return '';
	let bundles: unknown;
	try { bundles = (JSON.parse(readFileSync(path, 'utf8')) as { analyzeBundles?: unknown }).analyzeBundles; }
	catch { return ''; }
	if (bundles === undefined) return '';
	return [
		'',
		'Prior analyze bundles from the scope phase (REUSE these — only run additional',
		'`insrc_analyze_step` passes for Story-specific gaps they do not already cover):',
		'```json',
		JSON.stringify(bundles, null, 2),
		'```',
	].join('\n');
}

/** Return `{ epic, hld, story, hldSlice }` — all the upstream
 *  context every LLD runner needs. Throws if the gates are red. */
function readUpstream(ctx: StepRunnerContext): {
	readonly epic:  ReturnType<typeof requireApprovedEpic>;
	readonly hld:   ReturnType<typeof requireApprovedHld>;
	readonly story: ReturnType<typeof requireApprovedEpic>['body']['stories'][number];
	readonly hldSlice: ReturnType<typeof extractHldContextSlice>;
} {
	const epicHash = epicHashFrom(ctx);
	const storyId  = storyIdFrom(ctx);
	const epic  = requireApprovedEpic(ctx.intent.repoPath, epicHash);
	const hld   = requireApprovedHld(ctx.intent.repoPath, epicHash);
	const story = epic.body.stories.find(s => s.id === storyId);
	if (story === undefined) {
		throw new Error(`design.story: Story '${storyId}' not found in Epic '${epicHash}'.`);
	}
	const hldSlice = extractHldContextSlice(hld, storyId);
	return { epic, hld, story, hldSlice };
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
		workflow: 'design.story',
		async run(ctx) {
			const { prompt, userTurn } = spec.buildPrompt(ctx);
			return {
				type: 'llm-pause',
				prompt, userTurn,
				schema: spec.schema,
				preparedBlob: { stepId: spec.id },
			};
		},
		async finalize(llmResponse) {
			return { type: 'output', output: llmResponse };
		},
	};
}

// ---------------------------------------------------------------------------
// s1 — context.assemble (Story-scoped)
// ---------------------------------------------------------------------------

const contextAssemble = llmPauseRunner({
	id: 'context.assemble',
	buildPrompt: (ctx) => {
		const { epic, story, hldSlice } = readUpstream(ctx);
		return {
			prompt: [
				'You are running the `context.assemble` step of the `design.story` (LLD) workflow.',
				'',
				'HARD RULES:',
				'- Use `insrc_analyze_step` for every code claim. Do NOT invent module or symbol names.',
				'- This step is READ-ONLY discovery. Do not propose a solution.',
				'',
				'What to do (Story-scoped):',
				'  1. Run `symbol.locate` on any API names in the HLD shared contracts this Story owns/consumes so you have current signatures.',
				'  2. Run `data-model.trace` on domain entities the Story touches.',
				'  3. Run `usage.example` on functions the Story reshapes.',
				'  4. Run `search.text` on distinctive constants / strings the Story deals with.',
				'  5. Run `test.locate` on the Story subject so the test strategy extends existing patterns.',
				'',
				'Emit an LldContext JSON with one `analyzeBundles[]` entry per call.',
			].join('\n'),
			userTurn: [
				`Focus: ${ctx.intent.focus}`,
				`Epic hash: ${epicHashFrom(ctx)}   Story: ${story.id} — ${story.title}`,
				'',
				'Epic flavor (informs migration in s7):',
				epic.body.flavor,
				'',
				'HLD context slice (for grounding — do not restate):',
				'```json',
				JSON.stringify(hldSlice, null, 2),
				'```',
				'',
				'Story detail (verbatim):',
				'```json',
				JSON.stringify(story, null, 2),
				'```',
				priorScopeAnalyzeBlock(ctx),
				'',
				'Emit the LldContext JSON now.',
			].join('\n'),
		};
	},
	schema: lldContextSchema,
});

// ---------------------------------------------------------------------------
// s2 — alternatives.enumerate
// ---------------------------------------------------------------------------

const alternativesEnumerate = llmPauseRunner({
	id: 'alternatives.enumerate',
	buildPrompt: (ctx) => {
		const { story, hldSlice } = readUpstream(ctx);
		return {
			prompt: [
				'You are running the `alternatives.enumerate` step of the `design.story` (LLD) workflow.',
				'',
				'Enumerate 2-4 CONTRACT / DATA-MODEL shapes for this Story. Each alternative is a way to shape the Story\'s API + data changes consistent with the HLD.',
				'',
				'HARD RULES:',
				'- Alternatives must fit within the HLD (do not propose a different framework — that is what back-flow / amendments are for).',
				'- Every alternative respects the shared contracts this Story owns/consumes.',
				'- No implementation, no task lists.',
			].join('\n'),
			userTurn: [
				's1 LldContext:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s1'], null, 2),
				'```',
				'',
				'HLD context slice:',
				'```json',
				JSON.stringify(hldSlice, null, 2),
				'```',
				'',
				'Story:',
				'```json',
				JSON.stringify(story, null, 2),
				'```',
				'',
				'Emit the alternatives JSON now.',
			].join('\n'),
		};
	},
	schema: alternativesEnumerateSchema,
});

// ---------------------------------------------------------------------------
// s3 — alternatives.judge
// ---------------------------------------------------------------------------

const alternativesJudge = llmPauseRunner({
	id: 'alternatives.judge',
	buildPrompt: (ctx) => {
		const { epic, story, hldSlice } = readUpstream(ctx);
		return {
			prompt: [
				'You are running the `alternatives.judge` step of the `design.story` (LLD) workflow.',
				'',
				'Score every alternative from s2 against Story acceptance constraints AND HLD shared contracts.',
				'',
				'HARD RULES:',
				'- Each judgment has one `constraintScore` entry per Story acceptance criterion (from Epic) + one per shared contract this Story owns/consumes.',
				'- Winner rationale must reference specific scores.',
			].join('\n'),
			userTurn: [
				's2 Alternatives:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s2'], null, 2),
				'```',
				'',
				'Story acceptance criteria (constraints to score):',
				'```json',
				JSON.stringify(story.acceptanceCriteria, null, 2),
				'```',
				'',
				'HLD shared contracts this Story touches:',
				'```json',
				JSON.stringify([...hldSlice.ownedContracts, ...hldSlice.consumedContracts], null, 2),
				'```',
				'',
				'Epic constraints (may still apply):',
				'```json',
				JSON.stringify(epic.body.constraints, null, 2),
				'```',
				'',
				'Emit the judgment JSON now.',
			].join('\n'),
		};
	},
	schema: alternativesJudgeSchema,
});

// ---------------------------------------------------------------------------
// s4 — contract.detail
// ---------------------------------------------------------------------------

const contractDetail = llmPauseRunner({
	id: 'contract.detail',
	buildPrompt: (ctx) => {
		const { story, hldSlice } = readUpstream(ctx);
		return {
			prompt: [
				'You are running the `contract.detail` step of the `design.story` (LLD) workflow.',
				'',
				'Write the Story\'s CONTRACT (surface level + APIs + data model + interaction with HLD shared contracts).',
				'',
				'HARD RULES:',
				'- Every `api[].name` MUST come from either s1 analyze bundles (existing APIs the Story reshapes) or an HLD sharedContract (APIs this Story owns/consumes). Invented names are a violation.',
				'- `api[].signature` is TYPE-LEVEL only — TS signature or equivalent. No function body.',
				'- Every `interactionWithShared[].contractId` MUST be a real HLD sharedContract id.',
				'- If role="implements", HLD must show this Story as the owner of that contract.',
				'- `dataModel[].callSites` come from s1 analyze bundles.',
				'',
				'HLD AMENDMENT PROPOSAL (optional):',
				'  If designing this contract reveals a small, localised HLD change (a shared contract needs one more field, a method signature needs to add a parameter, ownership of one contract needs to move between Stories, etc.), you MAY emit `hld.amendmentProposal` with `{ amendment: <typed>, rationale: <string>, citations: [] }`. Do NOT propose an amendment for a fundamental HLD rework — those need a back-flow, not an amendment. Rough threshold: if >30% of shared contracts would need changing, do NOT amend.',
				'  BREAKING FLAG (required for the two removal/rename amendment types): a `sharedContract.fieldRemove` and a `sharedContract.rename` amendment MUST include `"breaking": true` — the applier REJECTS them otherwise. A `sharedContract.fieldAdd` MUST include `"breaking": false` (it is additive). The other amendment types carry no `breaking` field. If in doubt, prefer `fieldAdd` (additive, non-breaking) over `fieldRemove`.',
			].join('\n'),
			userTurn: [
				's1 LldContext:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s1'], null, 2),
				'```',
				'',
				'Winning alternative:',
				JSON.stringify(ctx.stepOutputs['s3'], null, 2),
				'',
				'HLD context slice:',
				'```json',
				JSON.stringify(hldSlice, null, 2),
				'```',
				'',
				'Story:',
				'```json',
				JSON.stringify(story, null, 2),
				'```',
				'',
				'Emit the contract detail JSON now.',
			].join('\n'),
		};
	},
	schema: contractDetailSchema,
});

// ---------------------------------------------------------------------------
// s5 — error.paths
// ---------------------------------------------------------------------------

const errorPaths = llmPauseRunner({
	id: 'error.paths',
	buildPrompt: (ctx) => {
		const { epic, story } = readUpstream(ctx);
		return {
			prompt: [
				'You are running the `error.paths` step of the `design.story` (LLD) workflow.',
				'',
				'Write error cases, edge cases, and invariants to preserve.',
				'',
				'HARD RULES:',
				'- `errorCases[].detection` describes HOW the code notices; not "the caller passes bad data".',
				'- `errorCases` are distinct from `edgeCases` (errors = something went wrong; edges = valid but unusual input).',
				`- For flavor="${epic.body.flavor}": ${epic.body.flavor === 'enhancement' ? 'invariantsToPreserve must cite an analyze bundle from s1 showing the invariant.' : 'invariantsToPreserve may be empty; no legacy behaviour to preserve.'}`,
				'',
				'HLD AMENDMENT PROPOSAL (optional):',
				'  If an error path exposes a mismatch with HLD (e.g. HLD says a shared contract does not throw, but the Story genuinely needs to signal a specific failure), you MAY emit `hld.amendmentProposal` with `{ amendment: <typed>, rationale: <string>, citations: [] }`. Use `sharedContract.methodAdd` when you need to name a new error signal. Do NOT propose a wholesale rework; back-flow HLD instead.',
			].join('\n'),
			userTurn: [
				's1 LldContext:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s1'], null, 2),
				'```',
				'',
				's4 Contract detail:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s4'], null, 2),
				'```',
				'',
				'Story:',
				'```json',
				JSON.stringify(story, null, 2),
				'```',
				'',
				'Emit the error paths JSON now.',
			].join('\n'),
		};
	},
	schema: errorPathsSchema,
});

// ---------------------------------------------------------------------------
// s6 — test.strategy
// ---------------------------------------------------------------------------

const testStrategy = llmPauseRunner({
	id: 'test.strategy',
	buildPrompt: (ctx) => {
		const { story } = readUpstream(ctx);
		return {
			prompt: [
				'You are running the `test.strategy` step of the `design.story` (LLD) workflow.',
				'',
				'Write the test strategy: levels, subjects, acceptance mapping.',
				'',
				'HARD RULES:',
				'- Every Story acceptance criterion MUST appear in `acceptanceMapping` with at least one proving test.',
				'- `testFramework` matches whatever `convention.detect` or `test.locate` reported in s1.',
			].join('\n'),
			userTurn: [
				's1 LldContext:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s1'], null, 2),
				'```',
				'',
				's4 Contract detail:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s4'], null, 2),
				'```',
				'',
				's5 Error paths:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s5'], null, 2),
				'```',
				'',
				'Story acceptance criteria (must all be mapped):',
				'```json',
				JSON.stringify(story.acceptanceCriteria, null, 2),
				'```',
				'',
				'Emit the test strategy JSON now.',
			].join('\n'),
		};
	},
	schema: testStrategySchema,
});

// ---------------------------------------------------------------------------
// s7 — migration.write (conditional)
// ---------------------------------------------------------------------------

const migrationWrite: StepRunner = {
	id: 'migration.write',
	workflow: 'design.story',
	async run(ctx) {
		const { epic, story } = readUpstream(ctx);
		if (epic.body.flavor !== 'enhancement') {
			// Deterministic short-circuit — plan shape stays uniform,
			// finalizer omits `body.migration` when this fires.
			return {
				type: 'output',
				output: { ...migrationSkippedOutput },
				summary: `migration.write skipped (${epic.body.flavor})`,
			};
		}
		return {
			type: 'llm-pause',
			prompt: [
				'You are running the `migration.write` step of the `design.story` (LLD) workflow.',
				'',
				'Enhancement flavor: write the migration path from stateBefore to stateAfter.',
				'',
				'HARD RULES:',
				'- Every step names whether it is rollbackable.',
				'- `backwardCompat` is non-empty for any change that affects an existing public API.',
				'- `stateBefore` cites analyze bundles from s1 for current behaviour.',
				'- No implementation code — describe actions ("add nullable field", "backfill values", "flip default"), not code.',
			].join('\n'),
			userTurn: [
				's1 LldContext:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s1'], null, 2),
				'```',
				'',
				's4 Contract detail:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s4'], null, 2),
				'```',
				'',
				'Story:',
				'```json',
				JSON.stringify(story, null, 2),
				'```',
				'',
				'Emit the migration JSON now.',
			].join('\n'),
			schema: migrationWriteSchema,
			preparedBlob: { stepId: 'migration.write' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

// ---------------------------------------------------------------------------
// s8 — checklist.verify
// ---------------------------------------------------------------------------

const checklistVerify = llmPauseRunner({
	id: 'checklist.verify',
	buildPrompt: (ctx) => {
		const { epic, story, hldSlice } = readUpstream(ctx);
		return {
			prompt: [
				'You are the AUDITOR for the `design.story` (LLD) workflow.',
				'',
				'`missed` on any `sbdry1|sbdry2|sbdry3|sbdry4` item forces a hard-fail.',
				'',
				'Checklist:',
				'  cd1: Does every `api[].signature` reference an existing symbol (from s1) OR a shared contract from HLD?',
				'  cd2: Are all api parameters typed (no `any`/`unknown` without justification)?',
				'  cd3: Does every api errors entry have a concrete error type?',
				'  dm1: Does every `dataModel[].callSites` entry come from an analyze bundle in s1?',
				'  dm2: enhancement — every field-modify or invariant-change cites the current-behaviour invariant it might break.',
				'  int1: Every `interactionWithShared` entry references a real HLD `sharedContract.id`.',
				'  int2: Every shared contract the LLD implements matches HLD `ownedByStory` for this Story.',
				'  ep1: Are errorCases distinct from edgeCases?',
				'  ep2: Does every `errorCases[].detection` describe HOW the code notices?',
				'  ep3: enhancement — every `invariantsToPreserve` cites an analyze bundle showing the invariant.',
				'  ts1: Every Story acceptance criterion has at least one `acceptanceMapping.provingTests` entry.',
				'  ts2: `testFramework` matches what analyze reported in s1.',
				`  mg1: (only if enhancement) every migration step names rollbackable status.`,
				`  mg2: (only if enhancement) backwardCompat is non-empty for any change affecting an existing public API.`,
				'  alt1: Are 2-4 alternatives considered?',
				'  alt2: Every alternative scored against every Story + Epic constraint AND HLD shared contracts?',
				'  sbdry1: [HARD] No implementation body anywhere.',
				'  sbdry2: [HARD] No task enumeration.',
				'  sbdry3: [HARD] No design decision that contradicts the HLD (back-flow HLD instead).',
				'  sbdry4: [HARD] No invented references.',
			].join('\n'),
			userTurn: [
				'Epic flavor:',
				epic.body.flavor,
				'',
				'Story:',
				'```json',
				JSON.stringify(story, null, 2),
				'```',
				'',
				'HLD context slice:',
				'```json',
				JSON.stringify(hldSlice, null, 2),
				'```',
				'',
				'All step outputs:',
				'```json',
				JSON.stringify({
					s1: ctx.stepOutputs['s1'], s2: ctx.stepOutputs['s2'],
					s3: ctx.stepOutputs['s3'], s4: ctx.stepOutputs['s4'],
					s5: ctx.stepOutputs['s5'], s6: ctx.stepOutputs['s6'],
					s7: ctx.stepOutputs['s7'],
				}, null, 2),
				'```',
				'',
				'Emit the checklist verdict JSON now.',
			].join('\n'),
		};
	},
	schema: lldChecklistSchema,
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerDesignStoryRunners(): void {
	if (registered) return;
	registerRunner(contextAssemble);
	registerRunner(alternativesEnumerate);
	registerRunner(alternativesJudge);
	registerRunner(contractDetail);
	registerRunner(errorPaths);
	registerRunner(testStrategy);
	registerRunner(migrationWrite);
	registerRunner(checklistVerify);
	registered = true;
}
