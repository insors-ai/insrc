/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Completeness findings for a companion definition (LLD-d9f85b3c S001/t9).
 *
 * A definition without a narrative, or with elements that carry no description,
 * still renders: its page shows only the context line and em dashes. Code review
 * says so with at most two LOW findings, so the author sees what is missing
 * without anything being blocked. The validators keep their contract (an empty
 * array for a sound definition) and never return these.
 */

import type { DimensionFinding, ReviewDimension } from '../../code-review/types.js';

/** How many undescribed elements a finding names before summarising the rest. */
const NAMED_LIMIT = 8;

export function completenessFindings(
	dimension:   ReviewDimension,
	slot:        string,
	hasNarrative: boolean,
	undescribed: readonly string[],
): readonly DimensionFinding[] {
	const findings: DimensionFinding[] = [];
	if (!hasNarrative) {
		findings.push({
			dimension, severity: 'LOW', location: `${slot}:narrative`, confidence: 'observation',
			message: `${slot} has no narrative; its companion page shows only the context line. Add a short narrative of what the visual shows.`,
		});
	}
	if (undescribed.length > 0) {
		const named = undescribed.slice(0, NAMED_LIMIT).join(', ');
		const rest = undescribed.length > NAMED_LIMIT ? ` and ${undescribed.length - NAMED_LIMIT} more` : '';
		findings.push({
			dimension, severity: 'LOW', location: `${slot}:description`, confidence: 'observation',
			message: `${undescribed.length} element${undescribed.length === 1 ? '' : 's'} of ${slot} ha${undescribed.length === 1 ? 's' : 've'} no description and show an em dash on its companion page: ${named}${rest}.`,
		});
	}
	return findings;
}

/** Whether an optional text field actually says something. */
export function described(text: string | undefined): boolean {
	return text !== undefined && text.trim().length > 0;
}
