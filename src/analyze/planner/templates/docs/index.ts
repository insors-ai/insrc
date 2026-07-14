/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Docs-target template catalog.
 *
 * plans/docs-module.md Phase 3. Templates for the docs target:
 *   - docs.discovery.inventory  -- discovery, family + count inventory
 *   - docs.family.summarise     -- per-family rollup
 *   - docs.decision.trace       -- trace decisions around a topic
 *   - docs.constraint.enumerate -- list every constraint on a subject
 *   - docs.subrun.deep-dive     -- planner-kind (child plan spawn); may
 *                                  target 'code' | 'data' | 'infra' |
 *                                  'docs' per plans/docs-module.md
 *                                  Section 6.5
 *   - docs.aggregate.report     -- terminal aggregator
 */

import type { AnalyzeTaskTemplate } from '../../types.js';
import {
	AGGREGATOR_INPUT_SCHEMA,
	AGGREGATOR_OUTPUT_SCHEMA,
	SCOPE_REF_SCHEMA,
} from '../shared-schemas.js';
import { registerTemplate } from '../registry.js';

// ---------------------------------------------------------------------------
// Leaf templates
// ---------------------------------------------------------------------------

export const docsDiscoveryInventory: AnalyzeTaskTemplate = {
	id:          'docs.discovery.inventory',
	target:      'docs',
	family:      'discovery',
	kind:        'leaf',
	revision:    'r1',
	description: 'Enumerate every doc / section / config entity in scope. Group by family (design / plans / docs / adr / rfc / spec / changelog / readme / other) with counts + a per-doc title.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['scopeRef'],
		properties: {
			scopeRef: SCOPE_REF_SCHEMA,
		},
	},
	produces:    ['docs-inventory'],
	outputSchema: {
		type:     'object',
		required: ['inventory'],
		additionalProperties: true,
		properties: {
			inventory: {
				type:  'array',
				items: {
					type:                 'object',
					additionalProperties: true,
					required:             ['file', 'family', 'title'],
					properties: {
						file:   { type: 'string' },
						family: { type: 'string' },
						title:  { type: 'string' },
					},
				},
			},
		},
	},
};

export const docsFamilySummarise: AnalyzeTaskTemplate = {
	id:          'docs.family.summarise',
	target:      'docs',
	family:      'summary',
	kind:        'leaf',
	revision:    'r1',
	description: 'Roll up every doc in a single family (e.g. all docs under design/, or all ADRs) into a compact summary: shared subjects, notable decisions, notable constraints, drafts/superseded flags.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['family'],
		properties: {
			family: {
				type: 'string',
				enum: ['design', 'plans', 'docs', 'adr', 'rfc', 'spec', 'changelog', 'readme', 'other'],
			},
		},
	},
	produces:    ['family-summary'],
};

export const docsDecisionTrace: AnalyzeTaskTemplate = {
	id:          'docs.decision.trace',
	target:      'docs',
	family:      'decision',
	kind:        'leaf',
	revision:    'r1',
	description: 'Given a topic, trace the decisions recorded across relevant docs. Retrieves the top-K matching doc sections, extracts decision statements, cites each back to its source. Verbatim -- do NOT paraphrase.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['topic'],
		properties: {
			topic:      { type: 'string', minLength: 1 },
			maxSources: { type: 'integer', minimum: 1, maximum: 30 },
		},
	},
	produces:    ['decision-trace'],
};

export const docsConstraintEnumerate: AnalyzeTaskTemplate = {
	id:          'docs.constraint.enumerate',
	target:      'docs',
	family:      'constraint',
	kind:        'leaf',
	revision:    'r1',
	description: 'Given a subject, list every explicit constraint / rule / requirement stated in the docs. Verbatim -- preserve MUST / SHALL / HARD RULE wording. Cite each constraint back to its source section.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['subject'],
		properties: {
			subject:    { type: 'string', minLength: 1 },
			maxSources: { type: 'integer', minimum: 1, maximum: 30 },
		},
	},
	produces:    ['constraints'],
	outputSchema: {
		type:     'object',
		required: ['constraints'],
		additionalProperties: true,
		properties: {
			constraints: {
				type:  'array',
				items: {
					type:                 'object',
					additionalProperties: true,
					required:             ['constraint', 'sourceEntityId'],
					properties: {
						constraint:     { type: 'string' },
						sourceEntityId: { type: 'string' },
					},
				},
			},
		},
	},
};

// ---------------------------------------------------------------------------
// Planner-kind template (child-plan spawn)
// ---------------------------------------------------------------------------

/**
 * plans/docs-module.md Section 6.5: docs plans MAY spawn code /
 * data / infra / docs child plans. `childIntent.target` accepts
 * any AnalyzeTarget. `upstreamContext` carries a compact rollup
 * from the parent's docs bundle so the child's shaper can surface
 * it in its `upstream` layer.
 */
export const docsSubrunDeepDive: AnalyzeTaskTemplate = {
	id:          'docs.subrun.deep-dive',
	target:      'docs',
	family:      'subrun',
	kind:        'planner',
	revision:    'r1',
	description: 'Recursively plan a deep-dive into a sub-target -- may target `code` (for adherence + implementation-mapping questions), `data` / `infra`, or `docs` itself (for a narrower doc dive). `childIntent` carries the classified intent for the child plan; optional `upstreamContext` carries a compact docs summary the child shaper surfaces in its `upstream` layer.',
	inputSchema: {
		type:                 'object',
		additionalProperties: false,
		required:             ['childIntent'],
		properties: {
			childIntent: {
				type:                 'object',
				additionalProperties: false,
				required:             ['target', 'scope', 'focused', 'scopeRef', 'reasoning'],
				properties: {
					target:    {
						type: 'string',
						enum: ['code', 'data', 'infra', 'generic', 'docs'],
					},
					scope:     { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] },
					focused:   { type: 'boolean' },
					focus:     { type: 'string', minLength: 1 },
					scopeRef:  SCOPE_REF_SCHEMA,
					reasoning: { type: 'string', minLength: 1 },
				},
			},
			upstreamContext: {
				type:                 'object',
				additionalProperties: true,
				properties: {
					docsSummary: { type: 'string' },
					decisions:   {
						type:  'array',
						items: {
							type:                 'object',
							additionalProperties: true,
							required:             ['decision'],
							properties: {
								decision:       { type: 'string' },
								sourceEntityId: { type: 'string' },
							},
						},
					},
					constraints: {
						type:  'array',
						items: {
							type:                 'object',
							additionalProperties: true,
							required:             ['constraint'],
							properties: {
								constraint:     { type: 'string' },
								sourceEntityId: { type: 'string' },
							},
						},
					},
				},
			},
		},
	},
	produces:    ['report'],
};

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

export const docsAggregateReport: AnalyzeTaskTemplate = {
	id:           'docs.aggregate.report',
	target:       'docs',
	family:       'aggregate',
	kind:         'leaf',
	revision:     'r1',
	description:  'Terminal aggregator for docs-target plans. Consumes every upstream task output + emits the final docs report. Preserve verbatim wording of decisions + constraints -- do not paraphrase.',
	inputSchema:  AGGREGATOR_INPUT_SCHEMA,
	outputSchema: AGGREGATOR_OUTPUT_SCHEMA,
	produces:     ['report'],
	isAggregator: true,
};

// ---------------------------------------------------------------------------
// Barrel
// ---------------------------------------------------------------------------

export const DOCS_TEMPLATES: readonly AnalyzeTaskTemplate[] = [
	docsDiscoveryInventory,
	docsFamilySummarise,
	docsDecisionTrace,
	docsConstraintEnumerate,
	docsSubrunDeepDive,
	docsAggregateReport,
];

export function registerDocsTemplates(): void {
	for (const t of DOCS_TEMPLATES) {
		registerTemplate(t);
	}
}
