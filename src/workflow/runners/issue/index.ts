/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `issue` workflow runners (sc2 / S002) — the FIRST stage of the bugfix flow.
 *
 *   s1 `issue.capture`   — assemble the defect record (reproduction, root cause,
 *                          fix intent), grounded against the real code via
 *                          `insrc_analyze_step`, seeded from the bugfix focus +
 *                          the magnitude carried from sc1.
 *   s2 `checklist.verify` — audit the captured record (concrete repro, cited,
 *                          no over-reach into the fix implementation).
 *
 * The synthesized IssueArtifact is the SINGLE SOURCE OF TRUTH for both the
 * chain record and (later, S005) the GitHub issue body. Mirrors the
 * define/design step-runner idiom (a pause-emitting `run` + an echo `finalize`).
 */

import { registerRunner } from '../../executor.js';
import type { StepRunner, StepRunnerContext } from '../../types.js';
import { issueCaptureSchema, issueChecklistSchema } from './schemas.js';

/** The bugfix magnitude carried from sc1 onto the run's start params. */
function magnitudeOf(ctx: StepRunnerContext): string {
	const m = ctx.intent.params['magnitude'];
	return m === 'small' || m === 'sized' ? m : '(unspecified — treat as a small localized fix)';
}

// ---------------------------------------------------------------------------
// s1 — issue.capture (assemble the defect record, grounded on the code)
// ---------------------------------------------------------------------------

const issueCapture: StepRunner = {
	id:       'issue.capture',
	workflow: 'issue',
	async run(ctx) {
		return {
			type: 'llm-pause',
			prompt: [
				'You are running the `issue.capture` step of the `issue` workflow — the FIRST stage of a',
				'bugfix. Capture the defect as a single, durable record whose prose IS the eventual GitHub',
				'issue body (so keep it clear, self-contained, and free of internal jargon).',
				'',
				'HARD RULES:',
				'- Use `insrc_analyze_step` to ground the root cause + fix intent in the REAL code. Do NOT invent',
				'  paths/symbols; every `citations[].ref` of kind `code` must be a real path/entity from an analyze bundle.',
				'- `title`:        a short imperative defect title.',
				'- `reproduction`: how to trigger it — steps and/or observed-vs-expected. Concrete, not vague.',
				'- `rootCause`:    the DIAGNOSED cause (grounded on the code), not a guess.',
				'- `fixIntent`:    WHAT the correction will do (intent), NOT the implementation/diff. Do not design the fix.',
				'- Cite every claim: at least one `citations[]` entry; ids are `cN`.',
				'',
				'Emit the capture JSON matching the schema now.',
			].join('\n'),
			userTurn: [
				`Defect (the bugfix focus): ${ctx.intent.focus}`,
				`Repo: ${ctx.intent.repoPath}`,
				`Magnitude (from triage): ${magnitudeOf(ctx)}`,
				'',
				'Ground the root cause + fix intent against the code, then emit the capture JSON now.',
			].join('\n'),
			schema: issueCaptureSchema,
			preparedBlob: { stepId: 'issue.capture' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

// ---------------------------------------------------------------------------
// s2 — checklist.verify (audit the captured record)
// ---------------------------------------------------------------------------

const checklistVerify: StepRunner = {
	id:       'checklist.verify',
	workflow: 'issue',
	async run(ctx) {
		return {
			type: 'llm-pause',
			prompt: [
				'You are the AUDITOR for the `issue` stage. Grade every item honestly against the s1 capture.',
				'`missed` on any `sb*` item is a hard-fail; do not lie. Every result carries an `evidence`',
				'citation pointing at the s1 capture output that supports the verdict.',
				'',
				'Checklist:',
				'  q1: Is `reproduction` CONCRETE (steps and/or observed-vs-expected), not a vague restatement?',
				'  q2: Is `rootCause` a diagnosed cause grounded on real code (a citation of kind `code`), not a guess?',
				'  q3: Is `fixIntent` intent-only — WHAT the correction does, with NO implementation/diff/algorithm?',
				'  q4: Does every prose claim carry at least one citation, and is every `code` ref real (from an analyze bundle)?',
				'  Scope-boundary (HARD-FAIL if missed/ambiguous):',
				'    sb1: Does the record leak fix IMPLEMENTATION (a diff, an algorithm, exact edits) rather than intent?',
				'    sb2: Does it contain any invented path/reference not in a step output / analyze bundle?',
			].join('\n'),
			userTurn: [
				's1 capture:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s1'], null, 2),
				'```',
				'',
				'Emit the checklist verdict JSON now.',
			].join('\n'),
			schema: issueChecklistSchema,
			preparedBlob: { stepId: 'checklist.verify' },
		};
	},
	async finalize(llmResponse) {
		return { type: 'output', output: llmResponse };
	},
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerIssueRunners(): void {
	if (registered) return;
	registerRunner(issueCapture);
	registerRunner(checklistVerify);
	registered = true;
}
