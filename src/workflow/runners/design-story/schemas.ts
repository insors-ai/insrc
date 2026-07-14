/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * JSON schemas the `design.story` (LLD) runners hand out to the
 * outer LLM. One schema per step (s1..s8).
 */

// ---------------------------------------------------------------------------
// s1 — LldContext
// ---------------------------------------------------------------------------

export const lldContextSchema = {
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
// s2 — alternatives.enumerate (LLD form: contract/data-model shapes)
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
				},
				additionalProperties: false,
			},
		},
	},
} as const;

// ---------------------------------------------------------------------------
// s3 — alternatives.judge (LLD form)
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
						items: {
							type: 'object',
							required: ['constraintId', 'verdict'],
							properties: {
								constraintId: { type: 'string' },   // may be `kN` from Epic or `sc*` from HLD contract
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
// s4 — contract.detail
// ---------------------------------------------------------------------------

/** Optional slot the LLD step can use to PROPOSE an HLD change
 *  discovered mid-flight. Kept as a `passthrough` object with a
 *  required `type` discriminator so the framework's amendment
 *  applier (which owns the strict schema) can pick it up.
 *  Structure: `{ amendment, rationale, citations? }`. */
export const amendmentProposalSlot = {
	type: 'object',
	required: ['amendment', 'rationale'],
	additionalProperties: true,
	properties: {
		amendment: {
			type: 'object',
			required: ['type'],
			properties: {
				type: {
					enum: [
						'sharedContract.fieldAdd', 'sharedContract.fieldRemove',
						'sharedContract.rename', 'sharedContract.methodAdd',
						'storyBoundary.reassignOwnership', 'storyBoundary.addConsumer',
						'nonFunctional.retarget',
						'rollout.reorder', 'rollout.splitPhase', 'rollout.mergePhases',
					],
				},
			},
			additionalProperties: true,
		},
		rationale: { type: 'string', minLength: 1 },
		citations: {
			type: 'array',
			items: {
				type: 'object',
				required: ['id', 'kind', 'ref'],
				properties: {
					id:   { type: 'string' },
					kind: { type: 'string' },
					ref:  { type: 'string' },
				},
				additionalProperties: true,
			},
		},
	},
} as const;

export const contractDetailSchema = {
	type: 'object',
	required: ['surfaceLevel', 'api', 'dataModel', 'interactionWithShared'],
	additionalProperties: false,
	properties: {
		surfaceLevel: { enum: ['internal', 'internal-shared', 'public'] },
		hld: {
			type: 'object',
			additionalProperties: false,
			properties: { amendmentProposal: amendmentProposalSlot },
		},
		api: {
			type: 'array',
			items: {
				type: 'object',
				required: ['name', 'signature', 'parameters', 'returns', 'errors', 'preconditions', 'postconditions'],
				properties: {
					name:      { type: 'string', minLength: 1 },
					signature: { type: 'string', minLength: 1 },
					parameters: {
						type: 'array',
						items: {
							type: 'object',
							required: ['name', 'type', 'purpose', 'optional'],
							properties: {
								name:     { type: 'string', minLength: 1 },
								type:     { type: 'string', minLength: 1 },
								purpose:  { type: 'string', minLength: 1 },
								optional: { type: 'boolean' },
							},
							additionalProperties: false,
						},
					},
					returns: {
						type: 'object',
						required: ['type', 'meaning'],
						properties: {
							type:    { type: 'string', minLength: 1 },
							meaning: { type: 'string', minLength: 1 },
						},
						additionalProperties: false,
					},
					errors: {
						type: 'array',
						items: {
							type: 'object',
							required: ['type', 'condition'],
							properties: {
								type:      { type: 'string', minLength: 1 },
								condition: { type: 'string', minLength: 1 },
							},
							additionalProperties: false,
						},
					},
					preconditions:  { type: 'array', items: { type: 'string' } },
					postconditions: { type: 'array', items: { type: 'string' } },
				},
				additionalProperties: false,
			},
		},
		dataModel: {
			type: 'array',
			items: {
				type: 'object',
				required: ['entity', 'change', 'details', 'callSites'],
				properties: {
					entity:     { type: 'string', minLength: 1 },
					change:     { enum: ['new', 'field-add', 'field-modify', 'field-remove', 'invariant-change'] },
					details:    { type: 'string', minLength: 1 },
					schemaDiff: { type: 'string' },
					callSites:  { type: 'array', items: { type: 'string' } },
				},
				additionalProperties: false,
			},
		},
		interactionWithShared: {
			type: 'array',
			items: {
				type: 'object',
				required: ['contractId', 'role', 'howDetails'],
				properties: {
					contractId: { type: 'string', pattern: '^sc\\d+$' },
					role:       { enum: ['implements', 'consumes'] },
					howDetails: { type: 'string', minLength: 1 },
				},
				additionalProperties: false,
			},
		},
	},
} as const;

// ---------------------------------------------------------------------------
// s5 — error.paths
// ---------------------------------------------------------------------------

export const errorPathsSchema = {
	type: 'object',
	required: ['errorCases', 'edgeCases', 'invariantsToPreserve'],
	additionalProperties: false,
	properties: {
		hld: {
			type: 'object',
			additionalProperties: false,
			properties: { amendmentProposal: amendmentProposalSlot },
		},
		errorCases: {
			type: 'array',
			items: {
				type: 'object',
				required: ['scenario', 'detection', 'response', 'userImpact', 'recoverable'],
				properties: {
					scenario:    { type: 'string', minLength: 1 },
					detection:   { type: 'string', minLength: 1 },
					response:    { type: 'string', minLength: 1 },
					userImpact:  { type: 'string', minLength: 1 },
					recoverable: { type: 'boolean' },
				},
				additionalProperties: false,
			},
		},
		edgeCases: {
			type: 'array',
			items: {
				type: 'object',
				required: ['input', 'expected'],
				properties: {
					input:    { type: 'string', minLength: 1 },
					expected: { type: 'string', minLength: 1 },
				},
				additionalProperties: false,
			},
		},
		invariantsToPreserve: {
			type: 'array',
			items: {
				type: 'object',
				required: ['text', 'source'],
				properties: {
					text:   { type: 'string', minLength: 1 },
					source: { type: 'string', pattern: '^c\\d+$' },
				},
				additionalProperties: false,
			},
		},
	},
} as const;

// ---------------------------------------------------------------------------
// s6 — test.strategy
// ---------------------------------------------------------------------------

export const testStrategySchema = {
	type: 'object',
	required: ['testLevels', 'acceptanceMapping', 'testFramework'],
	additionalProperties: false,
	properties: {
		testLevels: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['level', 'purpose', 'subjects'],
				properties: {
					level:          { enum: ['unit', 'integration', 'live', 'smoke', 'contract'] },
					purpose:        { type: 'string', minLength: 1 },
					subjects:       { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
					fixturesNeeded: { type: 'array', items: { type: 'string', minLength: 1 } },
				},
				additionalProperties: false,
			},
		},
		acceptanceMapping: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['criterionId', 'provingTests'],
				properties: {
					criterionId:  { type: 'string', pattern: '^ac\\d+$' },
					provingTests: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
				},
				additionalProperties: false,
			},
		},
		testFramework: { type: 'string', minLength: 1 },
	},
} as const;

// ---------------------------------------------------------------------------
// s7 — migration.write  (conditional)
// ---------------------------------------------------------------------------

export const migrationWriteSchema = {
	type: 'object',
	required: ['stateBefore', 'stateAfter', 'migrationSteps', 'backwardCompat', 'zeroDowntime', 'dataRewriteRequired'],
	additionalProperties: false,
	properties: {
		stateBefore: { type: 'string', minLength: 1 },
		stateAfter:  { type: 'string', minLength: 1 },
		migrationSteps: {
			type: 'array',
			minItems: 1,
			items: {
				type: 'object',
				required: ['order', 'action', 'rollbackable'],
				properties: {
					order:             { type: 'integer', minimum: 1 },
					action:            { type: 'string', minLength: 1 },
					rollbackable:      { type: 'boolean' },
					prerequisiteFlags: { type: 'array', items: { type: 'string' } },
				},
				additionalProperties: false,
			},
		},
		backwardCompat:      { type: 'string' },
		zeroDowntime:        { type: 'boolean' },
		dataRewriteRequired: { type: 'boolean' },
	},
} as const;

// ---------------------------------------------------------------------------
// s8 — checklist.verify
// ---------------------------------------------------------------------------

export const lldChecklistSchema = {
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
// Helper: signal shape when migration is skipped (new-capability)
// ---------------------------------------------------------------------------

export const migrationSkippedOutput = {
	skipped: true,
	reason:  'new-capability Epic; no migration required',
} as const;
