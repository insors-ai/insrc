/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * JSON schemas the `design.epic` runners hand out to the outer LLM.
 * One schema per step (s1..s6).
 */

// ---------------------------------------------------------------------------
// s1 — HldContext
// ---------------------------------------------------------------------------

export const hldContextSchema = {
	type: 'object',
	required: ['analyzeBundles'],
	additionalProperties: false,
	properties: {
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
					pathsCited: { type: 'array', items: { type: 'string', minLength: 1 } },
				},
				additionalProperties: false,
			},
		},
		backFlowNotes: { type: 'string' },
	},
} as const;

// ---------------------------------------------------------------------------
// s2 — alternatives.enumerate
// ---------------------------------------------------------------------------

export const alternativesEnumerateSchema = {
	type: 'object',
	required: ['alternatives'],
	additionalProperties: false,
	properties: {
		alternatives: {
			type: 'array',
			minItems: 2,
			maxItems: 4,
			items: {
				type: 'object',
				required: ['id', 'name', 'oneLineSummary', 'approach', 'pros', 'cons', 'costEstimate'],
				properties: {
					id:             { type: 'string', pattern: '^a\\d+$' },
					name:           { type: 'string', minLength: 1 },
					oneLineSummary: { type: 'string', minLength: 1 },
					approach:       { type: 'string', minLength: 20 },
					pros:           { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
					cons:           { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
					costEstimate:   { enum: ['XS', 'S', 'M', 'L'] },
					assumptionsRelied: {
						type: 'array',
						items: { type: 'string', pattern: '^c\\d+$' },
					},
				},
				additionalProperties: false,
			},
		},
	},
} as const;

// ---------------------------------------------------------------------------
// s3 — alternatives.judge
// ---------------------------------------------------------------------------

export const alternativesJudgeSchema = {
	type: 'object',
	required: ['judgments', 'winnerId', 'winnerRationale'],
	additionalProperties: false,
	properties: {
		judgments: {
			type: 'array',
			minItems: 2,
			items: {
				type: 'object',
				required: ['alternativeId', 'constraintScore', 'winnerRank', 'rationale'],
				properties: {
					alternativeId: { type: 'string', pattern: '^a\\d+$' },
					constraintScore: {
						type: 'array',
						minItems: 1,
						items: {
							type: 'object',
							required: ['constraintId', 'verdict'],
							properties: {
								constraintId: { type: 'string', pattern: '^k\\d+$' },
								verdict:      { enum: ['satisfies', 'partial', 'violates', 'unknown'] },
								notes:        { type: 'string' },
							},
							additionalProperties: false,
						},
					},
					winnerRank: { type: 'integer', minimum: 1 },
					rationale:  { type: 'string', minLength: 1 },
				},
				additionalProperties: false,
			},
		},
		winnerId:        { type: 'string', pattern: '^a\\d+$' },
		winnerRationale: { type: 'string', minLength: 1 },
	},
} as const;

// ---------------------------------------------------------------------------
// s4 — framework.write
// ---------------------------------------------------------------------------

export const frameworkWriteSchema = {
	type: 'object',
	required: ['frameworkSummary', 'architectureShape', 'sharedContracts', 'storyBoundaries', 'nonFunctional'],
	additionalProperties: false,
	properties: {
		frameworkSummary:  { type: 'string', minLength: 20 },
		architectureShape: { type: 'string', minLength: 20 },
		sharedContracts: {
			type: 'array',
			items: {
				type: 'object',
				required: ['id', 'name', 'purpose', 'interfaceSketch', 'ownedByStory', 'consumedByStories'],
				properties: {
					id:                { type: 'string', pattern: '^sc\\d+$' },
					name:              { type: 'string', minLength: 1 },
					purpose:           { type: 'string', minLength: 1 },
					interfaceSketch:   { type: 'string', minLength: 1 },
					ownedByStory:      { type: 'string', pattern: '^s\\d+$' },
					consumedByStories: { type: 'array', items: { type: 'string', pattern: '^s\\d+$' } },
					assumptions:       { type: 'array', items: { type: 'string', pattern: '^c\\d+$' } },
				},
				additionalProperties: false,
			},
		},
		storyBoundaries: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['storyId', 'owns', 'depends', 'internal'],
				properties: {
					storyId:  { type: 'string', pattern: '^s\\d+$' },
					owns:     { type: 'array', items: { type: 'string', pattern: '^sc\\d+$' } },
					depends:  { type: 'array', items: { type: 'string', pattern: '^sc\\d+$' } },
					internal: { type: 'string', minLength: 1 },
				},
				additionalProperties: false,
			},
		},
		nonFunctional: {
			type: 'object',
			properties: {
				performance:   { type: 'string' },
				security:      { type: 'string' },
				observability: { type: 'string' },
				durability:    { type: 'string' },
			},
			additionalProperties: false,
		},
	},
} as const;

// ---------------------------------------------------------------------------
// s5 — rollout.overview
// ---------------------------------------------------------------------------

export const rolloutOverviewSchema = {
	type: 'object',
	required: ['phases', 'orderingRationale', 'riskyBits'],
	additionalProperties: false,
	properties: {
		phases: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['name', 'includesStories', 'rationale', 'backwardCompat'],
				properties: {
					name:            { type: 'string', minLength: 1 },
					includesStories: { type: 'array', minItems: 1, items: { type: 'string', pattern: '^s\\d+$' } },
					rationale:       { type: 'string', minLength: 1 },
					backwardCompat:  { type: 'string' },
					featureFlag:     { type: ['string', 'null'] },
				},
				additionalProperties: false,
			},
		},
		orderingRationale: { type: 'string', minLength: 1 },
		riskyBits: {
			type: 'array',
			items: {
				type: 'object',
				required: ['area', 'why', 'mitigation'],
				properties: {
					area:       { type: 'string', minLength: 1 },
					why:        { type: 'string', minLength: 1 },
					mitigation: { type: 'string', minLength: 1 },
				},
				additionalProperties: false,
			},
		},
	},
} as const;

// ---------------------------------------------------------------------------
// s6 — checklist.verify
// ---------------------------------------------------------------------------

export const hldChecklistSchema = {
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
