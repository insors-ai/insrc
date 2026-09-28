/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — the content-gate that decides whether a document warrants a visual
 * companion.
 *
 * `assessDiagramNeed` issues EXACTLY ONE serial provider call (k4/k5 — never a
 * Promise.all over the provider), wrapped in withStructuredRetry, and is
 * FAIL-SAFE: any provider/parse/validation failure resolves to
 * `{ warranted:false, diagrams:[] }` so a transient hiccup yields a diagram-less
 * document (k3), never a failed generation. S003 emits only `type:'er'`; the
 * structured schema constrains it so a warranted need is always an ER need.
 */

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { validateAgainstSchema, withStructuredRetry, type StructuredCall, type StructuredValidator } from '../../../agent/providers/structured-output.js';
import { getLogger } from '../../../shared/logger.js';
import type { ArtifactKind } from '../../path-scheme.js';
import type { FunctionalDefinition } from '../functional-definition.js';

const log = getLogger('artifacts:companion:assess');
const MAX_ATTEMPTS = 3;

/** The content-gate result. `warranted` is true only when at least one visual is
 *  warranted; S003 emits only `type:'er'` needs. Empty when no visual warranted. */
export interface DiagramNeedAssessment {
	readonly warranted: boolean;
	readonly diagrams:  readonly { readonly type: string; readonly ofSectionId?: string | undefined; readonly rationale: string }[];
}

/** The document under generation the gate reasons over. */
export interface DiagramAssessmentDoc {
	readonly kind:                 ArtifactKind;
	readonly body:                 unknown;
	readonly functionalDefinition?: FunctionalDefinition | undefined;
}

/** The provider's raw output, validated against this schema. `diagrams[].type` is
 *  pinned to the S003 vocabulary ('er') so a warranted need is always an ER need. */
const DIAGRAM_NEED_SCHEMA: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['warranted', 'diagrams'],
	properties: {
		warranted: { type: 'boolean' },
		diagrams: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['type', 'rationale'],
				properties: {
					type:        { type: 'string', enum: ['er'] },
					ofSectionId: { type: 'string' },
					rationale:   { type: 'string' },
				},
			},
		},
	},
};

interface DiagramNeedOutput {
	readonly warranted: boolean;
	readonly diagrams:  readonly { readonly type: 'er'; readonly ofSectionId?: string; readonly rationale: string }[];
}

/** Build the content-gate prompt. Structural reference (the document body) goes
 *  TRAILING per the repo's prompt-structure rule. */
export function buildDiagramNeedPrompt(doc: DiagramAssessmentDoc, extraNote: string | undefined): LLMMessage[] {
	const system = [
		'You decide whether a design document warrants an ENTITY-RELATIONSHIP (ER) data-model diagram as a companion visualization.',
		'Warrant an ER diagram ONLY when the document designs a non-trivial DATA MODEL: multiple related entities/records with relationships worth visualizing. A document with no designed data model, or a single trivial record, warrants NO diagram.',
		'Return { "warranted": false, "diagrams": [] } when no visual is warranted. When an ER is warranted, return { "warranted": true, "diagrams": [ { "type": "er", "ofSectionId"?: "<section id>", "rationale": "<one sentence>" } ] }.',
		'Emit ONLY type "er". Never manufacture a need — prefer no diagram when in doubt.',
		extraNote ? `\nCorrection from a previous attempt:\n${extraNote}` : '',
	].filter(s => s.length > 0).join('\n');

	const user = [
		`## The document under generation (kind: ${doc.kind})`,
		'```json',
		JSON.stringify({ functionalDefinition: doc.functionalDefinition, body: doc.body }, null, 2),
		'```',
		'## Output',
		'Return the DiagramNeedAssessment JSON described above. Empty diagrams when no ER data model is warranted.',
	].join('\n');

	return [
		{ role: 'system', content: system },
		{ role: 'user',   content: user },
	];
}

/**
 * The content-gate. One serial provider.completeStructured call under
 * withStructuredRetry. Fail-safe: any error (provider throw, exhausted retries,
 * validation failure) resolves to `{ warranted:false, diagrams:[] }` — never throws.
 */
export async function assessDiagramNeed(doc: DiagramAssessmentDoc, provider: LLMProvider): Promise<DiagramNeedAssessment> {
	const call: StructuredCall = (note) =>
		provider.completeStructured<unknown>(buildDiagramNeedPrompt(doc, note), DIAGRAM_NEED_SCHEMA);
	const validate: StructuredValidator<DiagramNeedOutput> = (raw) =>
		validateAgainstSchema<DiagramNeedOutput>(DIAGRAM_NEED_SCHEMA, raw);

	try {
		const out = await withStructuredRetry(call, validate, MAX_ATTEMPTS);
		// A gate that says warranted but supplies no diagram is treated as no-need.
		const diagrams = out.diagrams.map(d => ({
			type: d.type,
			...(d.ofSectionId !== undefined ? { ofSectionId: d.ofSectionId } : {}),
			rationale: d.rationale,
		}));
		const warranted = out.warranted === true && diagrams.length > 0;
		return { warranted, diagrams: warranted ? diagrams : [] };
	} catch (err) {
		log.warn({ kind: doc.kind, err: err instanceof Error ? err.message : String(err) }, 'assessDiagramNeed: provider/parse failure; failing safe to no-diagram');
		return { warranted: false, diagrams: [] };
	}
}
