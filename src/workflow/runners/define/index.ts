/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `define` workflow runners — Phase B.
 *
 * All four steps are coarse handoffs to the outer LLM:
 *
 *   - s1 `context.assemble` — delegates ALL analyze work to the
 *     outer LLM. The prompt tells it to invoke `insrc_analyze_step`
 *     as many times as it needs (capability discovery for flavor,
 *     then structural-map / doc-mention / adherence-check per
 *     flavor). The LLM emits a `DefineContext` JSON.
 *
 *   - s2 `epic.frame` — reads s1's DefineContext, emits the Epic
 *     framing (problem / non-goals / assumptions / constraints).
 *
 *   - s3 `stories.compose` — reads s1 + s2, emits Stories with
 *     acceptance criteria + optional existingCapabilityRefs.
 *
 *   - s4 `checklist.verify` — reads s1/s2/s3 outputs and the fixed
 *     checklist (§9 of workflow-define.md), emits a verdict list.
 *
 * Every runner returns `type: 'llm-pause'` with a prompt + schema.
 * The executor's finalize function just wraps the LLM's JSON as
 * the step output.
 */

import { registerRunner } from '../../executor.js';
import type { StepRunner, StepRunnerContext } from '../../types.js';
import { citationRefEnum, defineChecklistSchema, defineContextSchema, epicFrameSchema, storiesComposeSchema } from './schemas.js';

// ---------------------------------------------------------------------------
// Shared: a simple llm-pause runner
// ---------------------------------------------------------------------------

function llmPauseRunner(spec: {
	readonly id:            string;
	readonly buildPrompt:   (ctx: StepRunnerContext) => { readonly prompt: string; readonly userTurn: string };
	readonly schema:        Record<string, unknown>;
}): StepRunner {
	return {
		id:       spec.id,
		workflow: 'define',
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
// s1 — context.assemble
// ---------------------------------------------------------------------------

const contextAssemble = llmPauseRunner({
	id: 'context.assemble',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `context.assemble` step of the `define` workflow.',
			'',
			'HARD RULES:',
			'- Use the `insrc_analyze_step` MCP tool for every claim about the codebase. Do NOT invent module names, symbol names, or file paths.',
			'- Do not propose any solution, architecture, or implementation. This step is READ-ONLY discovery.',
			'',
			'What to do:',
			'  1. Detect flavor: run `insrc_analyze_step` with target="code", focus="does the codebase already do <user ask>?". If a capability clearly matches, flavor = "enhancement". Otherwise flavor = "new-capability".',
			'  2. For flavor="enhancement": run a structural-map on the matching module + a doc-mention query for related prior docs.',
			'  3. For flavor="new-capability": run a structural-map focused on the closest existing subsystem + a conventions probe on the project stack.',
			'  4. Emit a DefineContext JSON matching the schema.',
			'',
			'The `analyzeBundles` array must summarise every insrc_analyze_step call you made — kind, focus, and a short summary (~2-3 sentences) grounded verbatim on the bundle you got back. Do not paste the whole bundle; summarise.',
		].join('\n'),
		userTurn: [
			`Raw ask: ${ctx.intent.focus}`,
			`Repo:     ${ctx.intent.repoPath}`,
			'',
			'Perform the discovery + emit the DefineContext JSON now.',
		].join('\n'),
	}),
	schema: defineContextSchema,
});

// ---------------------------------------------------------------------------
// s2 — epic.frame
// ---------------------------------------------------------------------------

const epicFrame = llmPauseRunner({
	id: 'epic.frame',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `epic.frame` step of the `define` workflow.',
			'',
			'HARD RULES (scope-boundary):',
			'- `problem` is one paragraph describing the PROBLEM, not the fix. No solution language. No API shapes. No library names.',
			'- Every `assumption` and every `constraint` must carry a `source` citation id. Do NOT invent citations — every id must appear in the `citations[]` array you emit.',
			'- `nonGoals` are things the Epic explicitly rules OUT. Each needs a rationale.',
			'',
			'Read the s1 context below. Emit an Epic framing JSON matching the schema.',
			'',
			'Every citation id is `cN`. Use them uniformly in `assumptions[].source`, `constraints[].source`, and any `[[cN]]` refs in the constraint or assumption text.',
		].join('\n'),
		userTurn: [
			`Raw ask: ${ctx.intent.focus}`,
			'',
			's1 context:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s1'], null, 2),
			'```',
			'',
			'Emit the Epic framing JSON now.',
		].join('\n'),
	}),
	schema: epicFrameSchema,
});

// ---------------------------------------------------------------------------
// s3 — stories.compose
// ---------------------------------------------------------------------------

const storiesCompose = llmPauseRunner({
	id: 'stories.compose',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `stories.compose` step of the `define` workflow.',
			'',
			'HARD RULES (scope-boundary):',
			'- Stories describe BEHAVIOUR ("user can filter todos by tag"), NOT implementation.',
			'- Do NOT enumerate tasks (implementation steps) inside a Story. That is what `plan` is for.',
			'- Do NOT reference API shapes, library names, algorithm choices, or data model details.',
			'- Every `acceptanceCriteria` is strict Given/When/Then form.',
			'- `operationalizes` must reference constraint ids from Epic OR the Story\'s `localConstraints`.',
			'- If flavor is `enhancement`, at least one Story SHOULD carry `existingCapabilityRefs` pointing at analyze bundles from s1.',
			'- Story dependency graph must be acyclic.',
			'',
			'Read s1 (context) and s2 (Epic) below. Emit Stories JSON matching the schema.',
		].join('\n'),
		userTurn: [
			`Raw ask: ${ctx.intent.focus}`,
			'',
			's1 context:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s1'], null, 2),
			'```',
			'',
			's2 Epic:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s2'], null, 2),
			'```',
			'',
			'Emit the Stories JSON now.',
		].join('\n'),
	}),
	schema: storiesComposeSchema,
});

// ---------------------------------------------------------------------------
// s4 — checklist.verify
// ---------------------------------------------------------------------------

const checklistVerify = llmPauseRunner({
	id: 'checklist.verify',
	buildPrompt: (ctx) => ({
		prompt: [
			'You are running the `checklist.verify` step of the `define` workflow.',
			'',
			'You are the AUDITOR. Grade every item honestly. `missed` on any `sb1|sb2|sb3` item forces a hard-fail; do not lie.',
			'',
			'Every result carries an `evidence` citation id pointing at a step output (s1/s2/s3) that supports the verdict.',
			'',
			'Checklist:',
			...checklistItems(),
		].join('\n'),
		userTurn: [
			's1 context:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s1'], null, 2),
			'```',
			'',
			's2 Epic:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s2'], null, 2),
			'```',
			'',
			's3 Stories:',
			'```json',
			JSON.stringify(ctx.stepOutputs['s3'], null, 2),
			'```',
			'',
			'Emit the checklist verdict JSON now.',
		].join('\n'),
	}),
	schema: defineChecklistSchema,
});

function checklistItems(): readonly string[] {
	return [
		'  Epic-level:',
		'    p1: Is `epic.problem` a single paragraph, no more?',
		'    p2: Does `epic.problem` state the problem without proposing a solution?',
		'    ng1: Are nonGoals distinct from things `epic.problem` already excludes?',
		'    ng2: Does each nonGoal have a rationale?',
		'    a1: Is every assumption explicitly named?',
		'    a2: Does every low-confidence assumption map to an openQuestion?',
		'    a3: Does every assumption cite what it is based on?',
		'    c1: Does every constraint cite a source?',
		'  Flavor:',
		'    f1: Does flavor match classifier hint + s1 evidence?',
		'    f2: enhancement — does at least one Story reference existing capability via `existingCapabilityRefs`?',
		'    f3: enhancement — do constraints preserve existing behaviour (name a specific API / invariant)?',
		'    f4: new-capability — do constraints reference project stack / conventions from s1?',
		'  Story-level:',
		'    s1a: Does each Story have a `userValue` paragraph independent of Epic problem?',
		'    s1b: Is each Story title a real user-story shape?',
		'    s1c: Are Stories independent slices (each deliverable / testable on its own)?',
		'    s1d: Are Stories collectively sufficient to resolve `epic.problem`?',
		'    ac1: Is every acceptanceCriteria in strict Given/When/Then form?',
		'    ac2: Does every criterion `operationalizes` reference a real constraint id?',
		'    ac3: Does every element of `userValue` prose map to at least one acceptance criterion?',
		'    dep1: Do all `dependsOn` edges reference real Story ids?',
		'    dep2: Is the Story dependency graph acyclic?',
		'  Scope-boundary (HARD-FAIL if missed/ambiguous):',
		'    sb1: Does any Story acceptance criterion leak solution language?',
		'    sb2: Does any Story enumerate tasks (implementation steps)?',
		'    sb3: Does the artifact contain any invented paths / references not in a step output?',
	];
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerDefineRunners(): void {
	if (registered) return;
	registerRunner(contextAssemble);
	registerRunner(epicFrame);
	registerRunner(storiesCompose);
	registerRunner(checklistVerify);
	registered = true;
}

// Re-export the enum builder so tests + orchestrator can pull it too.
export { citationRefEnum };
