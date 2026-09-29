/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) — the SINGLE source of the expected ReviewDimension set for a subject.
 *
 * Both the MCP handler's `expectedDimensions` (which drives buildJudgementsSchema +
 * the emitted-judgements validation) and the daemon runner's `effectiveJudges`
 * (which drives the serial judge loop + validateArtifact) derive from THIS function,
 * so the two lock-step lists can never drift (the negative table catches a one-sided
 * drift as a missing/unknown dimension error).
 *
 * The set is: the base four, PLUS each conditional dimension gated by its content
 * predicate (functional-coverage / diagram / ux), PLUS the body's explicitly
 * recorded adherence selection UNIONED in (mapped to its ReviewDimension) so a
 * declared-but-uncontented dimension is still enforced (ac3). Order follows the
 * DEFAULT_JUDGES order: base four, functional-coverage, diagram, ux.
 */

import type { CodeReviewSubject, ReviewDimension } from './types.js';
import { hasFunctionalDefinition } from './dimensions/functional-coverage.js';
import { hasDiagramReferences } from './dimensions/diagram/index.js';
import { hasUxAcceptance, adherenceSelectionOf } from './dimensions/ux/index.js';
import { adherenceToReviewDimension, isAdherenceDimension } from '../artifacts/companion/adherence.js';

/** The base four dimensions, always present, in fixed evaluation order. */
const BASE: readonly ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];

/** The conditional dimensions, in their DEFAULT_JUDGES order. */
const CONDITIONAL_ORDER: readonly ReviewDimension[] = ['functional-coverage', 'diagram', 'ux'];

/**
 * The dimensions a review must cover for THIS subject: the base four, plus the
 * conditional dimensions gated by content (functional-coverage/diagram/ux), plus the
 * body's recorded adherence selection unioned in (mapped to its ReviewDimension).
 * Ordered base four → functional-coverage → diagram → ux (the DEFAULT_JUDGES order).
 */
export function computeExpectedDimensions(subject: CodeReviewSubject): readonly ReviewDimension[] {
	const want = new Set<ReviewDimension>();

	// Content-derived gates (the enforced floor).
	if (hasFunctionalDefinition(subject)) want.add('functional-coverage');
	if (hasDiagramReferences(subject))    want.add('diagram');
	if (hasUxAcceptance(subject))          want.add('ux');

	// Union the explicitly recorded adherence selection (mapped to ReviewDimension)
	// so a declared-but-uncontented dimension is still enforced (ac3).
	for (const d of adherenceSelectionOf(subject)) {
		if (isAdherenceDimension(d)) want.add(adherenceToReviewDimension(d));
	}

	return [...BASE, ...CONDITIONAL_ORDER.filter(d => want.has(d))];
}
