/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Triage classifier — sizes a request against the real graph and routes it to
 * the right workflow start stage.
 *
 * The mapping (`routeForSizeClass`) is a pure table — deterministic, unit-
 * testable, no LLM. The LLM's only job is to pick the `sizeClass`, grounded on
 * an analyze bundle so the size cites concrete signals (modules touched, caller
 * counts, new-vs-reuse) rather than vibes. Rubric is materiality-gated the same
 * way the review rubric is: a bigger tier must be justified by a statable,
 * graph-real reason — and it cuts both ways (no inflating a one-file change to
 * `feature`, no burying a 40-caller refactor as `small`).
 *
 * CLAUDE.md rule 7: the request + grounding go at the TAIL of the prompt.
 */

import type { StructuredSchema } from '../../shared/types.js';
import { SIZE_CLASSES, type BugfixMagnitude, type SizeClass, type TriageRoute } from './types.js';

// ---------------------------------------------------------------------------
// The routing table — pure, the single source of truth for the taxonomy.
// ---------------------------------------------------------------------------

/**
 * Map a size tier to its workflow entry. See `plans/feature-triage-router.md`.
 *
 * `magnitude` is consulted ONLY for the `bugfix` tier (the single scope-gated
 * category): it selects issue→build (`small`) vs issue→design→plan→build
 * (`sized`). For the four fixed tiers the param is ignored, so existing
 * single-argument callers are unaffected.
 */
export function routeForSizeClass(sizeClass: SizeClass, magnitude?: BugfixMagnitude): TriageRoute {
	switch (sizeClass) {
		case 'epic':
			// Full framing: a new subsystem / many stories. Enters the chain head.
			return { startStage: 'define', standalone: false, needsPlan: true, producesLld: true };
		case 'feature':
			// One cohesive story with real design + multiple tasks: standalone LLD → plan → build.
			return { startStage: 'design.story', standalone: true, needsPlan: true, producesLld: true };
		case 'small':
			// One story, few tasks, minor: standalone LLD → build (skip plan).
			return { startStage: 'design.story', standalone: true, needsPlan: false, producesLld: true };
		case 'trivial':
			// Mechanical, ~1 file, no design choices: straight to build, no LLD.
			return { startStage: 'build', standalone: true, needsPlan: false, producesLld: false };
		case 'bugfix': {
			// Defect fix — first stage is always the `issue` record. The magnitude
			// gates whether design ceremony follows: a `small` fix goes issue→build;
			// an M/L (`sized`) fix takes issue→design→plan→build. A bugfix without a
			// magnitude can never route (authoritative runtime guard — the schema
			// conditional is a best-effort earlier check).
			if (magnitude === undefined) {
				throw new Error("routeForSizeClass: a 'bugfix' requires a magnitude ('small' | 'sized')");
			}
			const design = magnitude === 'sized';
			return { startStage: 'issue', standalone: true, needsPlan: design, producesLld: design };
		}
		default: {
			// Exhaustiveness backstop: adding a SizeClass member without a case here
			// is a compile error, keeping routeForSizeClass the single source of truth.
			const _exhaustive: never = sizeClass;
			throw new Error(`routeForSizeClass: unhandled sizeClass ${String(_exhaustive)}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** The ajv schema the classification turn must satisfy. Exported so the
 *  controller-driven `insrc_triage` tool can hand it to the outer LLM turn. */
export const CLASSIFY_SCHEMA: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['sizeClass', 'rationale', 'signals', 'storyTitle'],
	// A `bugfix` classification MUST carry a magnitude; the four fixed tiers
	// never do. ajv (draft 2020-12) honours this if/then natively; the
	// routeForSizeClass runtime guard is the authoritative backstop regardless.
	allOf: [
		{
			if: { properties: { sizeClass: { const: 'bugfix' } }, required: ['sizeClass'] },
			then: { required: ['magnitude'] },
		},
	],
	properties: {
		sizeClass: { type: 'string', enum: [...SIZE_CLASSES] },
		magnitude: { type: 'string', enum: ['small', 'sized'] },
		rationale: { type: 'string', minLength: 1 },
		storyTitle: { type: 'string', minLength: 1 },
		signals: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['kind', 'detail', 'evidence'],
				properties: {
					kind: {
						type: 'string',
						enum: ['modules-touched', 'callers', 'new-subsystem', 'new-vs-reuse',
							'cross-cutting', 'storage-or-schema', 'external-contract', 'other'],
					},
					detail: { type: 'string', minLength: 1 },
					evidence: { type: 'array', items: { type: 'string' } },
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export interface ClassifyPromptInput {
	/** The user's feature request / scope statement. */
	readonly focus: string;
	/** A prose summary of the analyze grounding bundle (modules, entities,
	 *  callers) the classifier must size against. Empty string when ungrounded. */
	readonly grounding: string;
	/** True when the user has DECLARED the request a defect fix. The category is
	 *  user-declared, not sizing-derived: when set, the classifier returns
	 *  `sizeClass: 'bugfix'` and sizes only the `magnitude` ('small' | 'sized').
	 *  Default false/absent leaves the four-tier behaviour unchanged. */
	readonly declaredBugfix?: boolean;
}

const SYSTEM = [
	'You are the TRIAGE step. Classify ONE code change request by size, so the',
	'framework can route it to the right workflow start stage. Every feature —',
	'big or small — must be tracked; your job is to decide how much design',
	'ceremony it needs, not whether it is tracked at all.',
	'',
	'The four tiers (materiality-gated — cite concrete, graph-real signals for',
	'the tier you pick; it cuts both ways):',
	'',
	'  epic     — a NEW subsystem or capability that decomposes into multiple',
	'             stories; needs framing (Epic) + high-level design (HLD).',
	'             Signals: new top-level module/package, several independent',
	'             stories, cross-cutting new contracts.',
	'  feature  — ONE cohesive story with real design choices and multiple',
	'             build tasks, but fits under a single design. No Epic framing.',
	'             Signals: a handful of files across 1-2 modules, a design',
	'             decision to reason about, >1 task.',
	'  small    — ONE story, few tasks, a minor addition/change with a clear',
	'             approach. Signals: 1-2 files, one module, one obvious approach.',
	'  trivial  — mechanical, ~1 file, NO design choices (rename, typo, a guard,',
	'             a constant). Signals: single localized edit, no new contract.',
	'',
	'HARD RULES:',
	'- Size against the REAL grounding below — a change that touches many callers',
	'  or a storage/schema boundary is NOT trivial/small even if the ask is short.',
	'- Do NOT inflate: a one-file guard is `trivial`, not `feature`.',
	'- Every `signals[].evidence` entry must be a real path/entity from the',
	'  grounding — do not invent. If grounding is empty, say so in the rationale',
	'  and classify conservatively (prefer the larger tier when genuinely unsure).',
	'- `storyTitle`: a short imperative title (used if this routes to a standalone',
	'  story), e.g. "Add per-repo cache TTL override".',
	'',
	'Emit a TriageResult JSON matching the schema.',
].join('\n');

// Appended to the SYSTEM prompt ONLY when the request is a declared defect
// fix. The category is fixed (`bugfix`); the turn's job narrows to sizing the
// magnitude, so the four feature tiers are off the table.
const BUGFIX_GUIDANCE = [
	'',
	'This request has been DECLARED a defect fix. Classify it as `sizeClass: "bugfix"`',
	'(do NOT pick epic/feature/small/trivial). Your only sizing judgment is the',
	'`magnitude`:',
	'  small  — a localized correction with a clear fix; skips design (issue → build).',
	'  sized  — an M/L correction touching many callers / a storage or schema boundary /',
	'           needing real design; takes the full path (issue → design → plan → build).',
	'Emit `magnitude` alongside `sizeClass`. Size the magnitude against the REAL grounding,',
	'the same materiality rule as the tiers — do not inflate a one-file fix to `sized`.',
].join('\n');

/** Build the `{ system, user }` prompt pair for the classification turn. */
export function buildClassifyPrompt(input: ClassifyPromptInput): { readonly system: string; readonly user: string } {
	const grounding = input.grounding.trim().length > 0
		? input.grounding.trim()
		: '(no analyze grounding available — classify conservatively and note this in the rationale)';
	// Rule 7: request + structural grounding go trailing.
	const user = [
		'Classify this request:',
		'',
		input.focus.trim(),
		'',
		'--- Analyze grounding (size against THIS; cite only paths/entities that appear here) ---',
		grounding,
	].join('\n');
	// A declared bugfix narrows the classification to bugfix + magnitude; an
	// undeclared request keeps the byte-for-byte four-tier prompt.
	const system = input.declaredBugfix ? SYSTEM + '\n' + BUGFIX_GUIDANCE : SYSTEM;
	return { system, user };
}
