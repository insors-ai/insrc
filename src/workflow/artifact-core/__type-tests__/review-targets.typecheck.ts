/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-time checks of ReviewTargets' exact field shape (npm run typecheck:tools). Nothing
 * here runs.
 *
 * Each @ts-expect-error line must really be an error: tsc reports an unused directive, so a
 * change that widens the field's type or drops `readonly` fails the check.
 */

import type { Pointer, ReviewTargets } from '../types.js';

export function positive(): void {
	const pointer: Pointer = { path: 'a.md' };
	const empty: ReviewTargets = { entries: [] };
	const populated: ReviewTargets = { entries: [pointer, pointer] };

	void empty; void populated;
}

export function negative(targets: ReviewTargets): void {
	// @ts-expect-error ReviewTargets.entries is required
	const _r1: ReviewTargets = {};
	// @ts-expect-error ReviewTargets has no field named "unknownField"
	const _r2: ReviewTargets = { entries: [], unknownField: 1 };
	// @ts-expect-error ReviewTargets.entries is readonly
	targets.entries = [];
	// @ts-expect-error ReviewTargets.entries is readonly Pointer[], not mutable
	targets.entries.push({ path: 'b.md' });
}
