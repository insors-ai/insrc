/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-time checks of Scope/ValidationResult's exact field shapes (npm run typecheck:tools).
 * Nothing here runs.
 *
 * Each @ts-expect-error line must really be an error: tsc reports an unused directive, so a
 * change that widens a field's type, drops `readonly`, or makes an optional field required
 * fails the check.
 */

import type { Pointer } from '../types.js';
import type { Scope, ValidationResult } from '../types.js';

export function positive(): void {
	const pointer: Pointer = { path: 'a.md' };

	const minimal: Scope = { scopeType: 'design', scopeLevel: 'def' };
	const full: Scope = {
		scopeType: 'code',
		scopeLevel: 'task',
		def: pointer,
		hld: pointer,
		lld: pointer,
		plan: pointer,
		tasks: [pointer],
		extension: pointer,
		amendment: pointer,
	};

	const result: ValidationResult = { ok: false, violations: ['x'] };

	void minimal; void full; void result;
}

export function negative(scope: Scope, result: ValidationResult): void {
	// @ts-expect-error Scope.scopeType is required
	const _s1: Scope = { scopeLevel: 'def' };
	// @ts-expect-error Scope.scopeLevel is required
	const _s2: Scope = { scopeType: 'design' };
	// @ts-expect-error Scope has no field named "unknownField"
	const _s3: Scope = { scopeType: 'design', scopeLevel: 'def', unknownField: 1 };
	// @ts-expect-error Scope.scopeType must be 'design' | 'code'
	const _s4: Scope = { scopeType: 'review', scopeLevel: 'def' };
	// @ts-expect-error Scope.scopeType is readonly
	scope.scopeType = 'code';
	// @ts-expect-error Scope.scopeLevel is readonly
	scope.scopeLevel = 'hld';
	// @ts-expect-error Scope.def is readonly
	scope.def = undefined;
	// @ts-expect-error Scope.tasks is readonly
	scope.tasks = undefined;

	// @ts-expect-error ValidationResult.ok is required
	const _v1: ValidationResult = { violations: [] };
	// @ts-expect-error ValidationResult.violations is required
	const _v2: ValidationResult = { ok: true };
	// @ts-expect-error ValidationResult.ok is readonly
	result.ok = true;
	// @ts-expect-error ValidationResult.violations is readonly
	result.violations = [];
	// @ts-expect-error ValidationResult.violations is readonly string[], not mutable
	result.violations.push('x');
}
