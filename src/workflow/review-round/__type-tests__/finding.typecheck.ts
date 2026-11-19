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

// Exact-union proof: fails to compile if FindingCategory ever gains or loses a
// member, not just for the one invalid literal ('style') the negative() cases
// below happen to try -- the general form of "exactly the five fixed categories".
const _findingCategoryExact: Equal<FindingCategory, 'correctness' | 'functional-completeness' | 'security' | 'quality' | 'maintainability'> = true;
void _findingCategoryExact;

// Field-matches-alias proof: the assertion above only verifies the standalone
// FindingCategory alias -- it says nothing about whether Finding.category
// actually USES that alias (it could be independently narrowed or widened to
// a different union and this would still compile). This fails to compile if
// Finding['category'] is ever declared as anything other than FindingCategory
// itself, closing that gap.
const _categoryFieldExact: Equal<Finding['category'], FindingCategory> = true;
void _categoryFieldExact;

// Unconstrained-string proof: fails to compile if Finding.severity is ever
// narrowed to a literal union -- the general, type-level form of "accepts any
// string value", not just the two example strings positive() happens to assign.
const _findingSeverityIsString: Equal<Finding['severity'], string> = true;
void _findingSeverityIsString;

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
