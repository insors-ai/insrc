/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) — the explicit, selectable ADHERENCE set recorded on an artifact body.
 *
 * `AdherenceDimension` is the vocabulary a work item's author may record to REQUIRE
 * an adherence check even before its triggering content exists (ac3): the completion
 * check UNIONS the recorded selection with the content-derived gates
 * (hasFunctionalDefinition/hasDiagramReferences/hasUxAcceptance) so a declared-but-
 * uncontented dimension is still enforced. Each selectable member maps to the
 * `ReviewDimension` the code-review stage folds through the unchanged
 * computeReviewVerdict + codeReview.enforce gate (k4) via `adherenceToReviewDimension`.
 *
 * Types + pure helpers only — no runtime deps — so the artifact body modules import
 * them without a cycle.
 */

import type { ReviewDimension } from '../../code-review/types.js';

/** The selectable adherence dimensions an artifact body may record. The three
 *  `diagram-*` members all fold to the single 'diagram' ReviewDimension; 'ux' and
 *  'functional-coverage' map 1:1. */
export type AdherenceDimension =
	| 'ux'
	| 'diagram-er'
	| 'diagram-sequence'
	| 'diagram-component'
	| 'functional-coverage';

/** The closed set of selectable adherence dimensions, in declared order. */
export const ADHERENCE_DIMENSIONS: readonly AdherenceDimension[] = [
	'ux', 'diagram-er', 'diagram-sequence', 'diagram-component', 'functional-coverage',
];

/** The explicit recorded adherence selection carried (additively) on an artifact
 *  body. */
export interface AdherenceSelection {
	readonly dimensions: readonly AdherenceDimension[];
}

/** True iff `x` is one of the selectable AdherenceDimension literals. */
export function isAdherenceDimension(x: unknown): x is AdherenceDimension {
	return typeof x === 'string' && (ADHERENCE_DIMENSIONS as readonly string[]).includes(x);
}

/** Map a recorded AdherenceDimension to the ReviewDimension the code-review stage
 *  enforces: every `diagram-*` member folds to 'diagram'; 'ux' and
 *  'functional-coverage' map 1:1. */
export function adherenceToReviewDimension(d: AdherenceDimension): ReviewDimension {
	switch (d) {
		case 'ux':                 return 'ux';
		case 'functional-coverage': return 'functional-coverage';
		case 'diagram-er':
		case 'diagram-sequence':
		case 'diagram-component':  return 'diagram';
	}
}

/** Validate a recorded adherence selection: every member must be a known
 *  AdherenceDimension. Returns the list of unknown members (empty when sound). */
export function unknownAdherenceMembers(selection: readonly unknown[]): readonly string[] {
	return selection.filter(d => !isAdherenceDimension(d)).map(d => String(d));
}

/** The `adherence` body-element schema (admit-but-never-emit in the synthesizer body
 *  schemas). Optional; the multiselect `dimensions` enum is validated against the
 *  AdherenceDimension set. */
export const ADHERENCE_PROPERTY_SCHEMA: Record<string, unknown> = {
	type: 'object',
	required: ['dimensions'],
	additionalProperties: false,
	properties: {
		dimensions: {
			type: 'array',
			items: { enum: [...ADHERENCE_DIMENSIONS] },
		},
	},
};
