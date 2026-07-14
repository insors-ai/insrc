/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * JSON schemas the `define` runners hand out to the outer LLM.
 *
 * Kept in a separate file so the runners can stay focused on prompt
 * assembly + finalize logic.
 */

// ---------------------------------------------------------------------------
// s1 — DefineContext
// ---------------------------------------------------------------------------

export const defineContextSchema = {
	type: 'object',
	required: ['flavor', 'flavorEvidence', 'analyzeBundles'],
	additionalProperties: false,
	properties: {
		flavor: { enum: ['enhancement', 'new-capability'] },
		flavorEvidence: {
			type: 'object',
			required: ['reasoning'],
			properties: {
				classifierHint:       { enum: ['enhancement', 'new-capability', 'ambiguous'] },
				capabilityProbeVerdict: { enum: ['clear-match', 'partial-match', 'unrelated', 'none'] },
				reasoning: { type: 'string', minLength: 1 },
			},
			additionalProperties: false,
		},
		analyzeBundles: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['kind', 'focus', 'summary'],
				properties: {
					kind:    { type: 'string', minLength: 1 },
					focus:   { type: 'string', minLength: 1 },
					summary: { type: 'string', minLength: 1 },
					pathsCited: {
						type:  'array',
						items: { type: 'string', minLength: 1 },
					},
				},
				additionalProperties: false,
			},
		},
		priorDefines: {
			type: 'array',
			items: {
				type: 'object',
				required: ['slug', 'epicProblem'],
				properties: {
					slug:        { type: 'string' },
					epicProblem: { type: 'string' },
					excerpt:     { type: 'string' },
				},
				additionalProperties: false,
			},
		},
	},
} as const;

// ---------------------------------------------------------------------------
// s2 — Epic framing
// ---------------------------------------------------------------------------

export const epicFrameSchema = {
	type: 'object',
	required: ['problem', 'nonGoals', 'assumptions', 'constraints', 'citations'],
	additionalProperties: false,
	properties: {
		problem: { type: 'string', minLength: 20 },
		nonGoals: {
			type: 'array',
			items: {
				type: 'object',
				required: ['text', 'rationale'],
				properties: {
					text:      { type: 'string', minLength: 1 },
					rationale: { type: 'string', minLength: 1 },
				},
				additionalProperties: false,
			},
		},
		assumptions: {
			type: 'array',
			items: {
				type: 'object',
				required: ['text', 'confidence', 'source'],
				properties: {
					text:       { type: 'string', minLength: 1 },
					confidence: { enum: ['low', 'med', 'high'] },
					source:     { type: 'string', pattern: '^c\\d+$' },
				},
				additionalProperties: false,
			},
		},
		constraints: {
			type: 'array',
			items: {
				type: 'object',
				required: ['id', 'text', 'type', 'source'],
				properties: {
					id:     { type: 'string', pattern: '^k\\d+$' },
					text:   { type: 'string', minLength: 1 },
					type:   { enum: ['convention', 'contract', 'invariant', 'stakeholder'] },
					source: { type: 'string', pattern: '^c\\d+$' },
				},
				additionalProperties: false,
			},
		},
		citations: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['id', 'kind', 'ref'],
				properties: {
					id:         { type: 'string', pattern: '^c\\d+$' },
					kind:       { enum: ['step-output', 'analyze-bundle', 'doc', 'code', 'stakeholder', 'convention', 'prior-artifact'] },
					ref:        { type: 'string', minLength: 1 },
					quotedText: { type: 'string' },
				},
				additionalProperties: false,
			},
		},
	},
} as const;

// ---------------------------------------------------------------------------
// s3 — Stories compose
// ---------------------------------------------------------------------------

export const storiesComposeSchema = {
	type: 'object',
	required: ['stories', 'citations'],
	additionalProperties: false,
	properties: {
		stories: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['id', 'title', 'userValue', 'acceptanceCriteria'],
				properties: {
					id:        { type: 'string', pattern: '^s\\d+$' },
					title:     { type: 'string', minLength: 1 },
					userValue: { type: 'string', minLength: 1 },
					acceptanceCriteria: {
						type: 'array',
						minItems: 1,
						items: {
							type: 'object',
							required: ['id', 'given', 'when', 'then', 'operationalizes'],
							properties: {
								id:              { type: 'string', pattern: '^ac\\d+$' },
								given:           { type: 'string', minLength: 1 },
								when:            { type: 'string', minLength: 1 },
								then:            { type: 'string', minLength: 1 },
								operationalizes: {
									type:  'array',
									items: { type: 'string', pattern: '^k\\d+$' },
								},
							},
							additionalProperties: false,
						},
					},
					localConstraints: {
						type: 'array',
						items: {
							type: 'object',
							required: ['id', 'text', 'type', 'source'],
							properties: {
								id:     { type: 'string', pattern: '^c\\d+$' },
								text:   { type: 'string' },
								type:   { enum: ['convention', 'contract', 'invariant', 'stakeholder'] },
								source: { type: 'string', pattern: '^c\\d+$' },
							},
							additionalProperties: false,
						},
					},
					dependsOn:    { type: 'array', items: { type: 'string', pattern: '^s\\d+$' } },
					sizeEstimate: { enum: ['S', 'M', 'L', 'XL'] },
					existingCapabilityRefs: {
						type:  'array',
						items: { type: 'string', pattern: '^c\\d+$' },
					},
				},
				additionalProperties: false,
			},
		},
		citations: {
			type: 'array',
			items: {
				type: 'object',
				required: ['id', 'kind', 'ref'],
				properties: {
					id:         { type: 'string', pattern: '^c\\d+$' },
					kind:       { enum: ['step-output', 'analyze-bundle', 'doc', 'code', 'stakeholder', 'convention', 'prior-artifact'] },
					ref:        { type: 'string', minLength: 1 },
					quotedText: { type: 'string' },
				},
				additionalProperties: false,
			},
		},
	},
} as const;

// ---------------------------------------------------------------------------
// s4 — Checklist verdict
// ---------------------------------------------------------------------------

export const defineChecklistSchema = {
	type: 'object',
	required: ['results'],
	additionalProperties: false,
	properties: {
		results: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['itemId', 'verdict', 'evidence'],
				properties: {
					itemId:   { type: 'string', minLength: 1 },
					verdict:  { enum: ['passed', 'missed', 'partial', 'ambiguous'] },
					evidence: { type: 'string', minLength: 1 },
					notes:    { type: 'string' },
				},
				additionalProperties: false,
			},
		},
	},
} as const;

// ---------------------------------------------------------------------------
// Helper (not a schema)
// ---------------------------------------------------------------------------

/** Build a schema fragment listing valid citation ids. Used by the
 *  synthesizer when it needs to constrain a downstream `source`
 *  field to citations that already exist upstream. */
export function citationRefEnum(ids: readonly string[]): Record<string, unknown> {
	if (ids.length === 0) return { type: 'string', pattern: '^c\\d+$' };
	return { type: 'string', enum: [...ids] };
}
