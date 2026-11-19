/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-time checks of ReconciliationResult/ReconciliationVerdict's exact field shapes.
 * Nothing here runs.
 *
 * Each @ts-expect-error line must really be an error: tsc reports an unused directive, so a
 * change that widens a field's type, drops `readonly`, or makes an optional field required
 * fails the check.
 */

import type { ReconciliationResult, ReconciliationVerdict } from '../reconciliation.js';

/** True iff A and B are the exact same type (distributes correctly over unions,
 *  unlike `A extends B ? B extends A ? true : false : false`). */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// Exact-keys proof: fails to compile for ANY added or removed key, named anything.
const _resultKeysExact: Equal<keyof ReconciliationResult, 'priorFindingRef' | 'verdict'> = true;
void _resultKeysExact;

// Exact-union proof: fails to compile if ReconciliationVerdict ever gains or loses a member.
const _verdictExact: Equal<ReconciliationVerdict, 'confirmed' | 'still-open' | 'contradicted' | 'no-longer-surfaced'> = true;
void _verdictExact;

// Field-matches-alias proof (the gap s2's field-matches-alias fix caught): verifies
// ReconciliationResult.verdict actually USES the ReconciliationVerdict alias, not an
// independently narrowed or widened union that happens to compile against it.
const _verdictFieldExact: Equal<ReconciliationResult['verdict'], ReconciliationVerdict> = true;
void _verdictFieldExact;

export function positive(): void {
	const a: ReconciliationResult = { priorFindingRef: 'f1', verdict: 'confirmed' };
	const b: ReconciliationResult = { priorFindingRef: 'f2', verdict: 'no-longer-surfaced' };
	void a; void b;
}

export function negative(result: ReconciliationResult): void {
	// @ts-expect-error ReconciliationVerdict has only the four fixed values
	const _v1: ReconciliationVerdict = 'fixed';

	// @ts-expect-error ReconciliationResult.verdict has only the four fixed values
	const _r1: ReconciliationResult = { priorFindingRef: 'f1', verdict: 'fixed' };
	// @ts-expect-error ReconciliationResult.priorFindingRef is required
	const _r2: ReconciliationResult = { verdict: 'confirmed' };
	// @ts-expect-error ReconciliationResult.verdict is required
	const _r3: ReconciliationResult = { priorFindingRef: 'f1' };
	// @ts-expect-error ReconciliationResult has no field named "severity"
	const _r4: ReconciliationResult = { priorFindingRef: 'f1', verdict: 'confirmed', severity: 'HIGH' };
	// @ts-expect-error ReconciliationResult has no field named "category"
	const _r5: ReconciliationResult = { priorFindingRef: 'f1', verdict: 'confirmed', category: 'correctness' };
	// @ts-expect-error ReconciliationResult has no field named "blocking"
	const _r6: ReconciliationResult = { priorFindingRef: 'f1', verdict: 'confirmed', blocking: false };
	// @ts-expect-error ReconciliationResult.priorFindingRef is readonly
	result.priorFindingRef = 'f2';
	// @ts-expect-error ReconciliationResult.verdict is readonly
	result.verdict = 'still-open';
}
