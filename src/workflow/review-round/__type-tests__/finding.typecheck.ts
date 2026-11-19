/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-time checks of Finding/FindingCategory's exact field shapes. Nothing here runs.
 *
 * Each @ts-expect-error line must really be an error: tsc reports an unused directive, so a
 * change that widens a field's type, drops `readonly`, or makes an optional field required
 * fails the check.
 */

import type { Finding, FindingCategory } from '../finding.js';

/** True iff A and B are the exact same type (distributes correctly over unions,
 *  unlike `A extends B ? B extends A ? true : false : false`). */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// Exact-keys proof: unlike a per-field @ts-expect-error (which only catches the
// specific field names written here), this fails to compile for ANY added or
// removed key, named anything -- the general form of "no other field of any
// kind" the LLD's absence subject requires.
const _findingKeysExact: Equal<keyof Finding, 'id' | 'category' | 'severity'> = true;
void _findingKeysExact;

export function positive(): void {
	const a: Finding = { id: 'f1', category: 'correctness', severity: 'HIGH' };
	const b: Finding = { id: 'f2', category: 'security', severity: 'CRITICAL' };
	void a; void b;
}

export function negative(finding: Finding): void {
	// @ts-expect-error FindingCategory has only the five fixed values
	const _c1: FindingCategory = 'style';

	// @ts-expect-error Finding.category has only the five fixed values
	const _f1: Finding = { id: 'f1', category: 'style', severity: 'HIGH' };
	// @ts-expect-error Finding.id is required
	const _f2: Finding = { category: 'correctness', severity: 'HIGH' };
	// @ts-expect-error Finding.category is required
	const _f3: Finding = { id: 'f1', severity: 'HIGH' };
	// @ts-expect-error Finding.severity is required
	const _f4: Finding = { id: 'f1', category: 'correctness' };
	// @ts-expect-error Finding has no field named "verdict"
	const _f5: Finding = { id: 'f1', category: 'correctness', severity: 'HIGH', verdict: 'pass' };
	// @ts-expect-error Finding has no field named "dimension"
	const _f6: Finding = { id: 'f1', category: 'correctness', severity: 'HIGH', dimension: 'coverage' };
	// @ts-expect-error Finding has no field named "artifactId"
	const _f7: Finding = { id: 'f1', category: 'correctness', severity: 'HIGH', artifactId: 'LLD-1' };
	// @ts-expect-error Finding.id is readonly
	finding.id = 'f2';
	// @ts-expect-error Finding.category is readonly
	finding.category = 'quality';
	// @ts-expect-error Finding.severity is readonly
	finding.severity = 'MED';
}
