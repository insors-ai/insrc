/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `design.epic` (HLD) workflow runners — Phase C.
 *
 * Six coarse-handoff steps that mirror `plans/workflow-design.md`
 * §5.1. All are LLM-pause runners; the framework only supplies
 * prompt + schema + finalize wrapping. Analyze work is delegated
 * to the outer LLM via `insrc_analyze_step`, same pattern as
 * define's `context.assemble`.
 *
 * Recipe:
 *   s1: context.assemble       — analyze bundles for the WHOLE Epic
 *   s2: alternatives.enumerate — 2-4 framework alternatives
 *   s3: alternatives.judge     — score alternatives against constraints
 *   s4: framework.write        — chosen framework + shared contracts + Story boundaries (the big one)
 *   s5: rollout.overview       — phases + risky bits
 *   s6: checklist.verify       — audit against HLD §9.1 checklist
 */

import { registerRunner } from '../../executor.js';
import { requireApprovedEpic } from '../../gates.js';
import { assertEpicHash } from '../../hash.js';
import type { StepRunner, StepRunnerContext } from '../../types.js';
import {
	alternativesEnumerateSchema,
	alternativesJudgeSchema,
	frameworkWriteSchema,
	hldChecklistSchema,
	hldContextSchema,
	rolloutOverviewSchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Shared: a simple llm-pause runner
// ---------------------------------------------------------------------------

function llmPauseRunner(spec: {
	readonly id:          string;
	readonly buildPrompt: (ctx: StepRunnerContext) => { readonly prompt: string; readonly userTurn: string };
	readonly schema:      Record<string, unknown>;
}): StepRunner {
	return {
		id:       spec.id,
		workflow: 'design.epic',
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
// Helper: pull the approved Epic body once + reuse in every prompt
// ---------------------------------------------------------------------------

function epicHashFrom(ctx: StepRunnerContext): string {
	const hash = ctx.intent.params['epicHash'];
	assertEpicHash(hash, `design.epic requires intent.params.epicHash (the Define artifact's 16-char hash)`);
	return hash;
}

function approvedEpicSummary(ctx: StepRunnerContext): string {
	const hash = epicHashFrom(ctx);
	const epic = requireApprovedEpic(ctx.intent.repoPath, hash);
	return JSON.stringify({
		flavor:       epic.body.flavor,
		problem:      epic.body.problem,
		constraints:  epic.body.constraints,
		stories: epic.body.stories.map(s => ({
			id: s.id, title: s.title, userValue: s.userValue,
			acceptanceCriteria: s.acceptanceCriteria,
			dependsOn: s.dependsOn,
		})),
	}, null, 2);
}

// ---------------------------------------------------------------------------
// s1 — context.assemble
// ---------------------------------------------------------------------------

const contextAssemble = llmPauseRunner({
	id: 'context.assemble',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `context.assemble` step of the `design.epic` (HLD) workflow.',
			'',
			'HARD RULES:',
			'- Use `insrc_analyze_step` for every claim. Do NOT invent module or symbol names.',
			'- This step is READ-ONLY discovery. Do not propose a solution.',
			'',
			'What to do (whole-Epic scope):',
			'  1. Run `structural-map` on the target subsystem (or repo root if the Epic is workspace-wide).',
			'  2. Run `capability-discovery` on the Epic problem to catch anything the codebase already provides.',
			'  3. Run `import.graph` on modules the Epic touches to see where new modules land.',
			'  4. Run `convention.detect` on the parent module so framework choices follow existing conventions.',
			'  5. If the Epic has an infra dimension (touching manifests / configs), run `manifests.locate`.',
			'',
			'Emit an HldContext JSON with one `analyzeBundles[]` entry per insrc_analyze_step call. Summarise (2-3 sentences) grounded verbatim on the bundle you received.',
		].join('\n'),
		userTurn: [
			`Focus: ${ctx.intent.focus}`,
			`Epic hash: ${epicHashFrom(ctx)}`,
			'',
			'Approved Epic (summary, verbatim):',
			'```json',
			approvedEpicSummary(ctx),
			'```',
			'',
			'Perform the analyze runs + emit the HldContext JSON now.',
		].join('\n'),
	}),
	schema: hldContextSchema,
});

// ---------------------------------------------------------------------------
// s2 — alternatives.enumerate
// ---------------------------------------------------------------------------

const alternativesEnumerate = llmPauseRunner({
	id: 'alternatives.enumerate',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `alternatives.enumerate` step of the `design.epic` (HLD) workflow.',
			'',
			'Enumerate 2-4 FRAMEWORK-LEVEL alternatives for solving the Epic. Alternatives are shapes of the whole solution, not micro-choices.',
			'',
			'HARD RULES:',
			'- Each alternative names a real architectural pattern or approach; do NOT invent module names.',
			'- `approach` is 2 paragraphs describing the shape.',
			'- Every `pros[]` and `cons[]` entry stands on its own — no vague "faster" without a metric.',
			'- `costEstimate` is the whole-Epic effort estimate (XS/S/M/L).',
			'- `assumptionsRelied` lists Epic assumption ids (`cN` shape) the alternative depends on.',
			'- No implementation. No task lists.',
		].join('\n'),
		userTurn: [
			`Focus: ${ctx.intent.focus}`,
			'',
			's1 HldContext:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s1'], null, 2),
			'```',
			'',
			'Approved Epic:',
			'```json',
			approvedEpicSummary(ctx),
			'```',
			'',
			'Emit the alternatives JSON now.',
		].join('\n'),
	}),
	schema: alternativesEnumerateSchema,
});

// ---------------------------------------------------------------------------
// s3 — alternatives.judge
// ---------------------------------------------------------------------------

const alternativesJudge = llmPauseRunner({
	id: 'alternatives.judge',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `alternatives.judge` step of the `design.epic` (HLD) workflow.',
			'',
			'For EVERY alternative in s2, score EVERY constraint from the Epic. Then rank alternatives and pick a winner.',
			'',
			'HARD RULES:',
			'- Every alternative must have one `constraintScore` entry per Epic constraint. Missing entries are a bug.',
			'- `verdict` is one of: satisfies | partial | violates | unknown.',
			'- The winner is the alternative whose scores best fit the Epic constraints; the `winnerRationale` must reference specific constraint scores, not vibes.',
		].join('\n'),
		userTurn: [
			's1 HldContext:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s1'], null, 2),
			'```',
			'',
			's2 Alternatives:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s2'], null, 2),
			'```',
			'',
			'Approved Epic:',
			'```json',
			approvedEpicSummary(ctx),
			'```',
			'',
			'Emit the judgment JSON now.',
		].join('\n'),
	}),
	schema: alternativesJudgeSchema,
});

// ---------------------------------------------------------------------------
// s4 — framework.write (the big one)
// ---------------------------------------------------------------------------

const frameworkWrite = llmPauseRunner({
	id: 'framework.write',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `framework.write` step of the `design.epic` (HLD) workflow.',
			'',
			'Write the CHOSEN framework in ONE turn: framework summary + architecture shape + shared contracts + Story boundaries + non-functional targets.',
			'',
			'HARD RULES (scope-boundary):',
			'- `interfaceSketch` is TYPE-LEVEL only — TypeScript interface, JSON schema, or protobuf. NO function bodies. NO algorithm code. NO `return` statements.',
			'- Every `sharedContract.ownedByStory` and `storyBoundaries[].storyId` must be a real Story id from the Epic.',
			'- Every `sharedContract` must appear in EXACTLY ONE `storyBoundaries[].owns`.',
			'- Every `sharedContract.consumedByStories[]` entry must be a real Story id.',
			'- No implementation. No task lists. No new goals not in the Epic.',
			'',
			'`storyBoundaries[].internal` is a paragraph describing what stays PRIVATE to that Story — not consumed by anyone else.',
		].join('\n'),
		userTurn: [
			's1 HldContext:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s1'], null, 2),
			'```',
			'',
			's3 winning alternative id:',
			(ctx.stepOutputs['s3'] as { winnerId?: string }).winnerId ?? '<missing>',
			'',
			's3 winner rationale:',
			(ctx.stepOutputs['s3'] as { winnerRationale?: string }).winnerRationale ?? '',
			'',
			'Approved Epic (Stories + constraints):',
			'```json',
			approvedEpicSummary(ctx),
			'```',
			'',
			'Emit the framework JSON now.',
		].join('\n'),
	}),
	schema: frameworkWriteSchema,
});

// ---------------------------------------------------------------------------
// s5 — rollout.overview
// ---------------------------------------------------------------------------

const rolloutOverview = llmPauseRunner({
	id: 'rollout.overview',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `rollout.overview` step of the `design.epic` (HLD) workflow.',
			'',
			'Group Stories into rollout phases. Order phases to respect Epic dependency edges + shared-contract ownership (owner Stories land before their consumers).',
			'',
			'HARD RULES:',
			'- Every Story from the Epic MUST appear in exactly one phase.',
			'- Phase order must respect Story `dependsOn` edges from the Epic + shared-contract dependencies from s4.',
			'- Each phase name is short + informative ("Phase A — foundational contracts", etc).',
			'- `backwardCompat` describes what to preserve during that phase; empty string when no compat concern.',
			'- `featureFlag` is either a flag name or null.',
			'- `riskyBits` calls out the top 1-3 risks with a mitigation each.',
		].join('\n'),
		userTurn: [
			's4 Framework:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s4'], null, 2),
			'```',
			'',
			'Approved Epic:',
			'```json',
			approvedEpicSummary(ctx),
			'```',
			'',
			'Emit the rollout JSON now.',
		].join('\n'),
	}),
	schema: rolloutOverviewSchema,
});

// ---------------------------------------------------------------------------
// s6 — checklist.verify
// ---------------------------------------------------------------------------

const checklistVerify = llmPauseRunner({
	id: 'checklist.verify',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are the AUDITOR for the `design.epic` (HLD) workflow.',
			'',
			'`missed` on any `sbdry1|sbdry2|sbdry3|sbdry4` item forces a hard-fail. Grade honestly.',
			'',
			'Checklist:',
			'  f1: Does frameworkSummary describe the CHOSEN approach, not competing options?',
			'  f2: Does architectureShape cite an analyze bundle from s1 for every module it names?',
			'  sc1: Does every sharedContract have a story that OWNS it?',
			'  sc2: Every consumer story listed in `consumedByStories` matches Epic dependency graph OR the mismatch is an openQuestion.',
			'  sc3: Every interfaceSketch is TYPE-LEVEL only (no function bodies, no algorithms).',
			'  sb1: Do storyBoundaries cover every Story in the Epic (no orphans)?',
			'  sb2: Does every Story boundary list exactly one owner Story per shared contract?',
			'  nf1: Does at least one non-functional property have a specific target?',
			'  ro1: Does rolloutOverview place every Story in exactly one phase?',
			'  ro2: Does phase order respect Story dependsOn edges?',
			'  alt1: Are 2-4 alternatives considered?',
			'  alt2: Is every alternative scored against every Epic constraint?',
			'  alt3: Is the chosen alternative rationale grounded in the constraint scores?',
			'  sbdry1: [HARD] No implementation body anywhere.',
			'  sbdry2: [HARD] No invented paths / references.',
			'  sbdry3: [HARD] No task enumeration.',
			'  sbdry4: [HARD] No goal or constraint that is not in the approved Epic.',
			'',
			'Every `results[]` entry carries an `evidence` id pointing at a step output (s1/s2/s3/s4/s5) that supports the verdict.',
		].join('\n'),
		userTurn: [
			's4 Framework:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s4'], null, 2),
			'```',
			'',
			's5 Rollout:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s5'], null, 2),
			'```',
			'',
			's2 alternatives + s3 judgment:',
			'```json',
			JSON.stringify({ s2: ctx.stepOutputs['s2'], s3: ctx.stepOutputs['s3'] }, null, 2),
			'```',
			'',
			'Approved Epic (constraints + Story ids):',
			'```json',
			approvedEpicSummary(ctx),
			'```',
			'',
			'Emit the checklist verdict JSON now.',
		].join('\n'),
	}),
	schema: hldChecklistSchema,
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerDesignEpicRunners(): void {
	if (registered) return;
	registerRunner(contextAssemble);
	registerRunner(alternativesEnumerate);
	registerRunner(alternativesJudge);
	registerRunner(frameworkWrite);
	registerRunner(rolloutOverview);
	registerRunner(checklistVerify);
	registered = true;
}
