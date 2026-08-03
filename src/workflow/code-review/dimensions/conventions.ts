/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S003 — the CONVENTIONS dimension judge.
 *
 * `judgeConventions` compares the Story's changed code (sc2 grounding summaries,
 * never raw files) against the repo's DOCUMENTED coding rules (the CLAUDE.md
 * baseline, k12) plus the local idioms of the modules it touched, and reports
 * each rule breach / idiom drift as a DimensionFinding naming the rule it
 * breached (`expectationRef`). It mirrors the shipped adherence judge (S002)
 * seam-for-seam, differing only in the standard it checks. It:
 *   - issues exactly ONE serial provider call (k4, no Promise.all), wrapped in
 *     withStructuredRetry so an unvalidatable model output PROPAGATES a failure
 *     rather than a fabricated "no violations" pass (S006 ac5);
 *   - reasons only over the LLMProvider abstraction (k3) at whatever tier the
 *     orchestrator resolved (k10 — the tier guarantee is the caller's);
 *   - baselines on the documented rules as hard breaches (they are stated
 *     rules, no sampling needed) and tags an idiom inferred from too few
 *     cross-module samples as confidence:'observation', not a breach (ac3/c104);
 *   - returns an EMPTY findings[] when the code obeys every rule (no
 *     manufactured findings); and
 *   - drops any finding whose location falls outside the Story's changed set.
 * Read-only throughout.
 */

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { validateAgainstSchema, type StructuredCall, type StructuredValidator } from '../../../agent/providers/structured-output.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionResult, DimensionFinding, ReviewDimension } from '../types.js';

const DIMENSION: ReviewDimension = 'conventions';
const MAX_ATTEMPTS = 3;

/** The model's raw conventions output, validated against CONVENTIONS_FINDINGS_SCHEMA.
 *  Its per-finding shape maps 1:1 onto sc3 DimensionFinding minus the fixed
 *  `dimension` (the judge stamps that, not the model); `confidence` carries the
 *  breach-vs-observation tier. */
interface ConventionsOutput {
	readonly findings: readonly {
		readonly severity: 'HIGH' | 'MED' | 'LOW';
		readonly location: string;
		readonly message:  string;
		readonly expectationRef?: string;
		readonly confidence?: 'breach' | 'observation';
	}[];
}

/** ajv/JSON schema the model output is validated against (t1). Per-finding shape
 *  is the adherence shape plus the optional `confidence` enum; `dimension` is
 *  fixed by the judge, so the model never emits it. */
export const CONVENTIONS_FINDINGS_SCHEMA: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['findings'],
	properties: {
		findings: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['severity', 'location', 'message'],
				properties: {
					severity:       { type: 'string', enum: ['HIGH', 'MED', 'LOW'] },
					location:       { type: 'string' },   // `file:line` inside the changed set
					message:        { type: 'string' },
					expectationRef: { type: 'string' },   // the violated documented-rule id / idiom label
					confidence:     { type: 'string', enum: ['breach', 'observation'] },
				},
			},
		},
	},
};

/** One checkable documented rule the conventions dimension baselines on. */
interface DocumentedRule {
	readonly id:   string;
	readonly text: string;
}

/** The CLAUDE.md coding-standards baseline (k11/k12) — the documented rules the
 *  judge treats as the stated contract the code must honour. Each `id` is stable
 *  and usable verbatim as a finding's `expectationRef`. Embedded TRAILING in the
 *  prompt. A breach of one of these is always confidence:'breach' (no sampling
 *  needed — they are stated rules); idiom drift inferred from thin cross-module
 *  sampling is confidence:'observation' instead. */
const DOCUMENTED_RULES: readonly DocumentedRule[] = [
	{ id: 'import-js-ext',          text: 'Always use the .js extension in import paths (NodeNext resolution requires it even for .ts files).' },
	{ id: 'import-type',            text: 'Use `import type` for type-only imports (verbatimModuleSyntax is enabled).' },
	{ id: 'shared-types-not-sdk',   text: 'Never import SDK types directly into application logic — shared types come from ../shared/types.js.' },
	{ id: 'logger-not-console',     text: 'Use getLogger(\'module-name\') from ../shared/logger.js — never console.log.' },
	{ id: 'strict-optional-indexed', text: 'Strict mode with exactOptionalPropertyTypes + noUncheckedIndexedAccess: optional props declared `| undefined`; index access results (T | undefined) handled for the undefined case.' },
	{ id: 'entity-id-deterministic', text: 'Entity IDs are deterministic: SHA256(repo + file + kind + name), hex-32.' },
	{ id: 'no-promise-all-llm',     text: 'Never Promise.all anything that reaches an LLM provider (cloud or local embed/complete); always serial for...of with sequential awaits. (k4)' },
	{ id: 'daemon-owns-storage',    text: 'The daemon owns all DB access; the CLI, MCP, and workbench reach storage only via IPC — never open LMDB or LanceDB directly. (k5)' },
	{ id: 'structured-grounding',   text: 'Context is structured entity summaries + relations from the graph, never raw file dumps. (k6)' },
	{ id: 'prompt-structure-trailing', text: 'Prompt structure: structural reference (schemas / catalogs / manifests) goes at the tail of the prompt, not the middle.' },
];

/** Build the conventions prompt (t1). Structural reference (the changed
 *  symbols, then the DOCUMENTED_RULES baseline + output-shape reminder) goes
 *  TRAILING per the repo's prompt-structure rule; the breach-vs-observation
 *  confidence discipline is explicit. */
export function buildConventionsPrompt(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	extraNote: string | undefined,
): LLMMessage[] {
	const system = [
		'You are an independent code reviewer judging CONVENTIONS: whether a Story\'s changed code obeys the repo\'s DOCUMENTED coding rules and the local idioms of the modules it touched.',
		'The documented rules listed below are the BASELINE — they are the stated contract the code must honour. Report each breach of a documented rule as a finding whose `expectationRef` names the breached rule id, with `confidence`:"breach".',
		'For a module-local idiom (naming, structure, layout) that the changed code departs from, sample the idiom across the TOUCHED MODULES rather than a single file. If the idiom is drawn from too few examples to be confident, report it as `confidence`:"observation" (typically severity LOW), NOT a breach.',
		'Report each breach INDIVIDUALLY with its `file:line` location. If the code obeys every documented rule and shows no idiom drift, return an EMPTY findings array. Never manufacture findings to appear thorough, and never cite a rule id that is not in the documented list below.',
		'Reason only over the structured symbol summaries provided — you are not given raw file contents.',
		extraNote ? `\nCorrection from a previous attempt:\n${extraNote}` : '',
	].filter(s => s.length > 0).join('\n');

	// Structural payload trailing: the changed symbols, then the documented-rule
	// baseline, then the output-shape reminder — last, per the prompt rule.
	const user = [
		'## The Story\'s changed symbols (structured summaries — the code under review)',
		'```json', JSON.stringify(grounding.symbols, null, 2), '```',
		'## Documented rules (the baseline — cite a breached rule by its id in expectationRef)',
		'```json', JSON.stringify(DOCUMENTED_RULES, null, 2), '```',
		'## Output',
		'Return { "findings": [ { "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "expectationRef": "the breached documented-rule id or module-idiom label", "confidence": "breach|observation" } ] }.',
		'Each finding.location MUST be a file within the Story\'s changed set. Return an empty findings array if the code conforms.',
	].join('\n');

	return [
		{ role: 'system', content: system },
		{ role: 'user',   content: user },
	];
}

/** Extract the repo-relative file from a `file:line` location. */
function fileOf(location: string): string {
	const i = location.indexOf(':');
	return i >= 0 ? location.slice(0, i) : location;
}

/**
 * The conventions judge (t2). One serial completeStructured call via
 * withStructuredRetry; maps the validated findings onto the sc3 DimensionResult
 * and drops any finding outside the Story's changed set. Propagates on failure.
 */
export async function judgeConventions(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	provider:  LLMProvider,
): Promise<DimensionResult> {
	const { withStructuredRetry } = await import('../../../agent/providers/structured-output.js');

	const call: StructuredCall = (note) =>
		provider.completeStructured<unknown>(buildConventionsPrompt(subject, grounding, note), CONVENTIONS_FINDINGS_SCHEMA);

	const validate: StructuredValidator<ConventionsOutput> = (raw) =>
		validateAgainstSchema<ConventionsOutput>(CONVENTIONS_FINDINGS_SCHEMA, raw);

	// Exactly one logical judgement; withStructuredRetry re-issues the SAME
	// serial call on validation failure and throws (never a fabricated pass)
	// once the attempt cap is exhausted.
	const output = await withStructuredRetry(call, validate, MAX_ATTEMPTS);

	const changed = new Set(subject.changedFiles);
	const findings: DimensionFinding[] = output.findings
		.filter(f => changed.has(fileOf(f.location)))   // scope to the Story's own changes
		.map(f => ({
			dimension: DIMENSION,
			severity:  f.severity,
			location:  f.location,
			message:   f.message,
			...(f.expectationRef !== undefined ? { expectationRef: f.expectationRef } : {}),
			...(f.confidence     !== undefined ? { confidence:     f.confidence     } : {}),
		}));

	return { dimension: DIMENSION, findings };
}
