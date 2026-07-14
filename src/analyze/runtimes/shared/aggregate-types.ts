/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared aggregate-report shape.
 *
 * Every target's terminal aggregator (code / data / infra / generic)
 * emits the same AggregateReport so downstream consumers
 * (orchestrator, IDE, report-rendering UI) get a uniform shape no
 * matter which target produced it.
 *
 * Two halves:
 *   - LLM-emitted: summary + findings. The LLM-facing schema
 *     constrains these.
 *   - Runtime-stamped: metadata { target, scope, runId, tasksAnalyzed }.
 *     The runtime fills these in AFTER the LLM call -- no point
 *     spending tokens on values already known.
 *
 * The combined `AggregateReport` is what materialises under the
 * aggregator task's `report` produces.
 */

import type { AnalyzeScope, AnalyzeTarget } from '../../../shared/analyze-types.js';

// ---------------------------------------------------------------------------
// LLM-emitted half
// ---------------------------------------------------------------------------

export interface AggregateLLMOutput {
	readonly summary:  string;
	readonly findings: readonly AggregateFinding[];
}

export interface AggregateFinding {
	readonly title:   string;
	readonly detail:  string;
	/** Upstream task ids (or other source refs) that contributed to this finding. */
	readonly sources: readonly string[];
}

// ---------------------------------------------------------------------------
// Runtime-stamped half
// ---------------------------------------------------------------------------

export interface AggregateMetadata {
	readonly target:        AnalyzeTarget;
	readonly scope:         AnalyzeScope;
	readonly runId:         string;
	readonly tasksAnalyzed: number;
}

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

export interface AggregateReport extends AggregateLLMOutput {
	readonly metadata: AggregateMetadata;
}

// ---------------------------------------------------------------------------
// JSON Schema for the LLM call. Runtime-stamped fields (metadata)
// are NOT here -- they're filled by the runtime post-call.
// ---------------------------------------------------------------------------

export const AGGREGATE_LLM_SCHEMA = {
	type:                 'object',
	additionalProperties: false,
	required:             ['summary', 'findings'],
	properties: {
		summary: {
			type:      'string',
			minLength: 20,
			description: 'One to three paragraph executive summary covering the analysis goal + top-level conclusions.',
		},
		findings: {
			type:     'array',
			minItems: 1,
			items: {
				type:                 'object',
				additionalProperties: false,
				required:             ['title', 'detail', 'sources'],
				properties: {
					title:  { type: 'string', minLength: 1, description: 'Short headline (one line) summarising the finding.' },
					detail: { type: 'string', minLength: 1, description: 'Body text in markdown; cite specific upstream taskIds or files.' },
					sources: {
						type:     'array',
						minItems: 1,
						items:    { type: 'string', minLength: 1 },
						description: 'Upstream task ids (e.g. "t01", "t03") whose outputs contributed to this finding.',
					},
				},
			},
		},
	},
} as const;
