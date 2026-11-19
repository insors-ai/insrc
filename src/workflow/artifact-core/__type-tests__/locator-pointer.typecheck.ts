/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-time checks of Locator/Pointer/StalenessResult/PathValidationResult's exact field
 * shapes (npm run typecheck:tools). Nothing here runs.
 *
 * Each @ts-expect-error line must really be an error: tsc reports an unused directive, so a
 * change that widens a field's type, drops `readonly`, or makes an optional field required
 * fails the check.
 */

import type { Locator, Pointer, StalenessResult, PathValidationResult } from '../types.js';

export function positive(): void {
	const locator: Locator = { kind: 'symbol', value: 'someSymbol' };
	const futureKindLocator: Locator = { kind: 'notInTheUnion', value: 'x' };

	const pointerWithSection: Pointer = { path: 'a.md', section: locator, contentHash: 'abc' };
	const pointerWithoutOptionals: Pointer = { path: 'a.md' };

	const staleness: StalenessResult = { stale: true, checkedAt: '2026-11-19T00:00:00.000Z' };
	const pathValidation: PathValidationResult = { ok: false, violations: ['escapes repo root'] };

	void futureKindLocator; void pointerWithSection; void pointerWithoutOptionals; void staleness; void pathValidation;
}

export function negative(locator: Locator, pointer: Pointer, staleness: StalenessResult, pathValidation: PathValidationResult): void {
	// @ts-expect-error Locator.kind is required
	const _l1: Locator = { value: 'x' };
	// @ts-expect-error Locator.value is required
	const _l2: Locator = { kind: 'symbol' };
	// @ts-expect-error Locator.kind is readonly
	locator.kind = 'other';
	// @ts-expect-error Locator.value is readonly
	locator.value = 'other';

	// @ts-expect-error Pointer.path is required
	const _p1: Pointer = { section: locator };
	// @ts-expect-error Pointer has no field named "unknownField"
	const _p2: Pointer = { path: 'a.md', unknownField: 1 };
	// @ts-expect-error Pointer.path is readonly
	pointer.path = 'b.md';
	// @ts-expect-error Pointer.section is readonly
	pointer.section = locator;
	// @ts-expect-error Pointer.contentHash is readonly
	pointer.contentHash = 'xyz';

	// @ts-expect-error StalenessResult.stale is required
	const _s1: StalenessResult = { checkedAt: '2026-11-19T00:00:00.000Z' };
	// @ts-expect-error StalenessResult.checkedAt is required
	const _s2: StalenessResult = { stale: true };
	// @ts-expect-error StalenessResult.stale is readonly
	staleness.stale = false;
	// @ts-expect-error StalenessResult.checkedAt is readonly
	staleness.checkedAt = 'later';

	// @ts-expect-error PathValidationResult.ok is required
	const _v1: PathValidationResult = { violations: [] };
	// @ts-expect-error PathValidationResult.violations is required
	const _v2: PathValidationResult = { ok: true };
	// @ts-expect-error PathValidationResult.ok is readonly
	pathValidation.ok = true;
	// @ts-expect-error PathValidationResult.violations is readonly
	pathValidation.violations = [];
	// @ts-expect-error PathValidationResult.violations is readonly string[], not mutable
	pathValidation.violations.push('x');
}
