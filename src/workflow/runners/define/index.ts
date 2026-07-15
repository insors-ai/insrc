/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `define` workflow runners.
 *
 * The FIRST step now scopes the ask (the user-requested "scope classifier
 * as the first step of the selected workflow"):
 *
 *   - s1 `scope.assess` — hands the LLM the catalog of existing Epics +
 *     tells it to run `insrc_analyze_step` over existing docs + code, then
 *     DECIDE `new` vs `extend`, notify the user, and (for extend) name the
 *     target Epic + compose the new Story. For `new` it also emits the
 *     normal DefineContext (flavor + analyze bundles). Its analyze bundles
 *     are cached (by synthesize) for the later design phase to reuse.
 *   - s2 `epic.frame` — NEW only (skips on extend).
 *   - s3 `stories.compose` — NEW only (skips on extend).
 *   - s4 `checklist.verify` — audits the Define (new) or the extension.
 *
 * On `extend`, s2/s3 short-circuit with `{ skipped: true }` (the
 * `migration.write` pattern) and synthesize executes the extension
 * deterministically (append the Story to the target Define + propose the
 * HLD `storyBoundary.addStory` amendment + write an ExtendArtifact).
 */

import { epicCatalog } from '../../gates.js';
import { registerRunner } from '../../executor.js';
import type { StepRunner, StepRunnerContext, StepRunnerResult } from '../../types.js';
import { citationRefEnum, defineChecklistSchema, defineContextSchema, epicFrameSchema, storiesComposeSchema } from './schemas.js';

const SKIP: StepRunnerResult = { type: 'output', output: { skipped: true } };

/** The scope decision recorded by s1 (default `new` if absent). */
function decisionOf(ctx: StepRunnerContext): 'new' | 'extend' {
	const s1 = ctx.stepOutputs['s1'] as { decision?: string } | undefined;
	return s1?.decision === 'extend' ? 'extend' : 'new';
}

// ---------------------------------------------------------------------------
// s1 — scope.assess  (discovery + new-vs-extend decision)
// ---------------------------------------------------------------------------

const scopeAssess: StepRunner = {
	id:       'scope.assess',
	workflow: 'define',
	async run(ctx) {
		const catalog = epicCatalog(ctx.intent.repoPath);
		return {
			type: 'llm-pause',
			prompt: [
				'You are running the `scope.assess` step of the `define` workflow — the SCOPE CLASSIFIER.',
				'',
				'Goal: decide whether this ask needs a NEW Epic (full define → design → LLD) or merely',
				'EXTENDS an existing Epic/design (then we just update the existing docs + add one LLD).',
				'',
				'HARD RULES:',
				'- Use `insrc_analyze_step` (target="code" and/or "docs") for every claim. Do NOT invent paths/symbols.',
				'- READ-ONLY discovery. Propose no solution/architecture/API.',
				'',
				'What to do:',
				'  1. Compare the ask against the EXISTING EPICS listed below (their problem + stories) AND the code.',
				'     Run `insrc_analyze_step` over docs + code to confirm whether the ask fits one of them.',
				'  2. DECIDE:',
				'     - `extend`  — the ask adds a slice to an existing Epic\'s design. Set `target` to that Epic\'s',
				'       {epicHash, epicSlug} (copy the hash verbatim from the catalog) and compose ONE `newStory`',
				'       (title + userValue + Given/When/Then acceptance criteria). The framework will append it to',
				'       that Epic\'s Define, add its HLD boundary via an amendment, and route to `design.story`.',
				'     - `new`     — no existing Epic fits. Proceed as a normal Define: set `flavor`',
				'       (`enhancement` if it extends existing CODE but there is no matching insrc Epic; else',
				'       `new-capability`) and the usual DefineContext.',
				'  3. Set `scope` (XS/S/M/L/XL) and `notify` — a short user-facing line stating what this builds on',
				'     (e.g. "Extends Epic `reporting` — building on docs DEF-…/HLD-… and code src/reports/*").',
				'  4. `evidence` cites the docs/code you matched against. `analyzeBundles` summarises EVERY',
				'     `insrc_analyze_step` call (kind, focus, ~2-3 sentence summary grounded on the bundle).',
				'',
				'Emit the scope JSON matching the schema now.',
			].join('\n'),
			userTurn: [
				`Raw ask: ${ctx.intent.focus}`,
				`Repo:     ${ctx.intent.repoPath}`,
				'',
				'EXISTING EPICS (candidates to extend — match by problem + story overlap):',
				'```json',
				JSON.stringify(catalog, null, 2),
				'```',
				'',
				'Do the discovery + emit the scope JSON now.',
			].join('\n'),
			schema: defineContextSchema,
			preparedBlob: { stepId: 'scope.assess' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

// ---------------------------------------------------------------------------
// s2 — epic.frame  (NEW only)
// ---------------------------------------------------------------------------

const epicFrame: StepRunner = {
	id:       'epic.frame',
	workflow: 'define',
	async run(ctx) {
		if (decisionOf(ctx) === 'extend') return SKIP;
		return {
			type: 'llm-pause',
			prompt: [
				'You are running the `epic.frame` step of the `define` workflow.',
				'',
				'HARD RULES (scope-boundary):',
				'- `problem` is one paragraph describing the PROBLEM, not the fix. No solution language. No API shapes. No library names.',
				'- Every `assumption` and every `constraint` must carry a `source` citation id. Do NOT invent citations — every id must appear in the `citations[]` array you emit.',
				'- `nonGoals` are things the Epic explicitly rules OUT. Each needs a rationale.',
				'',
				'Read the s1 scope/context below. Emit an Epic framing JSON matching the schema.',
				'',
				'Every citation id is `cN`. Use them uniformly in `assumptions[].source`, `constraints[].source`, and any `[[cN]]` refs.',
			].join('\n'),
			userTurn: [
				`Raw ask: ${ctx.intent.focus}`,
				'',
				's1 scope/context:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s1'], null, 2),
				'```',
				'',
				'Emit the Epic framing JSON now.',
			].join('\n'),
			schema: epicFrameSchema,
			preparedBlob: { stepId: 'epic.frame' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

// ---------------------------------------------------------------------------
// s3 — stories.compose  (NEW only)
// ---------------------------------------------------------------------------

const storiesCompose: StepRunner = {
	id:       'stories.compose',
	workflow: 'define',
	async run(ctx) {
		if (decisionOf(ctx) === 'extend') return SKIP;
		return {
			type: 'llm-pause',
			prompt: [
				'You are running the `stories.compose` step of the `define` workflow.',
				'',
				'HARD RULES (scope-boundary):',
				'- Stories describe BEHAVIOUR ("user can filter todos by tag"), NOT implementation.',
				'- Do NOT enumerate tasks inside a Story. Do NOT reference API shapes, library names, algorithms, or data models.',
				'- Every `acceptanceCriteria` is strict Given/When/Then form.',
				'- `operationalizes` must reference constraint ids from Epic OR the Story\'s `localConstraints`.',
				'- If flavor is `enhancement`, at least one Story SHOULD carry `existingCapabilityRefs` pointing at analyze bundles from s1.',
				'- Story dependency graph must be acyclic.',
				'',
				'Read s1 (scope/context) and s2 (Epic) below. Emit Stories JSON matching the schema.',
			].join('\n'),
			userTurn: [
				`Raw ask: ${ctx.intent.focus}`,
				'',
				's1 scope/context:',
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
			schema: storiesComposeSchema,
			preparedBlob: { stepId: 'stories.compose' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

// ---------------------------------------------------------------------------
// s4 — checklist.verify  (branches new vs extend)
// ---------------------------------------------------------------------------

const checklistVerify: StepRunner = {
	id:       'checklist.verify',
	workflow: 'define',
	async run(ctx) {
		const extend = decisionOf(ctx) === 'extend';
		return {
			type: 'llm-pause',
			prompt: [
				`You are running the \`checklist.verify\` step of the \`define\` workflow (${extend ? 'EXTEND' : 'NEW'} branch).`,
				'',
				'You are the AUDITOR. Grade every item honestly. `missed` on any `sb*` item forces a hard-fail; do not lie.',
				'Every result carries an `evidence` citation id pointing at a step output (s1/s2/s3) that supports the verdict.',
				'',
				'Checklist:',
				...(extend ? extendChecklistItems() : checklistItems()),
			].join('\n'),
			userTurn: [
				's1 scope/context:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s1'], null, 2),
				'```',
				...(extend ? [] : [
					'', 's2 Epic:', '```json', JSON.stringify(ctx.stepOutputs['s2'], null, 2), '```',
					'', 's3 Stories:', '```json', JSON.stringify(ctx.stepOutputs['s3'], null, 2), '```',
				]),
				'',
				'Emit the checklist verdict JSON now.',
			].join('\n'),
			schema: defineChecklistSchema,
			preparedBlob: { stepId: 'checklist.verify' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

function extendChecklistItems(): readonly string[] {
	return [
		'  Extend decision:',
		'    x1: Does `target.epicHash` match one of the existing Epics in the catalog (verbatim 16-hex)?',
		'    x2: Does the ask genuinely fit that Epic\'s problem/stories (cite evidence)?',
		'    x3: Is `newStory.userValue` a real user-value paragraph, distinct from existing stories?',
		'    x4: Is every `newStory.acceptanceCriteria` in strict Given/When/Then form?',
		'    x5: Is `notify` a clear user-facing statement of what this builds on (Epic + docs/code)?',
		'  Scope-boundary (HARD-FAIL if missed/ambiguous):',
		'    sb1: Does the newStory leak solution language (API shapes, algorithms, libraries)?',
		'    sb3: Are all cited docs/code refs real (from an analyze bundle), not invented?',
	];
}

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
	registerRunner(scopeAssess);
	registerRunner(epicFrame);
	registerRunner(storiesCompose);
	registerRunner(checklistVerify);
	registered = true;
}

export { citationRefEnum };
