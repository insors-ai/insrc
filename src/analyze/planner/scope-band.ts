/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The task-count band of each scope, in one place.
 *
 * The validator (INV-13) and the planner prompt (the depth policy) both read
 * it, so the range the model is shown is the range that is enforced. This
 * module imports nothing from either of them.
 */

import type { AnalyzeScope } from '../../shared/analyze-types.js';

/**
 * Scope-policy task-count bands from the design doc. Indexed by the
 * Plan's own scope bucket (not the root Run's). The cap is 80; the
 * floor is reduced by 50% for focused intents (see INV-13 note).
 */
export const SCOPE_BAND: Readonly<Record<AnalyzeScope, { readonly lo: number; readonly hi: number }>> = Object.freeze({
	XS: { lo: 3,  hi: 8  },
	S:  { lo: 10, hi: 20 },
	M:  { lo: 20, hi: 40 },
	L:  { lo: 30, hi: 60 },
	XL: { lo: 40, hi: 80 },
});

/** Reduce the lower bound for focused intents (INV-13 note). */
export function focusedLowerBound(scope: AnalyzeScope): number {
	return Math.floor(SCOPE_BAND[scope].lo / 2);
}
