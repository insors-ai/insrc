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
import type { Scope, ScopeLevel, ScopeType, ScopeValidator, ValidationResult } from '../types.js';

export function positive(): void {
	const pointer: Pointer = { path: 'a.md' };

	const scopeType: ScopeType = 'design';
	const scopeLevel: ScopeLevel = 'def';
	const minimal: Scope = { scopeType, scopeLevel };
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

	// A ScopeValidator takes exactly one Scope and returns exactly one ValidationResult.
	const validator: ScopeValidator = (s: Scope): ValidationResult => ({ ok: s.scopeType === 'design', violations: [] });
	const validated: ValidationResult = validator(full);

	void minimal; void full; void result; void validated;
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
	// @ts-expect-error ScopeType has only 'design' | 'code'
	const _t1: ScopeType = 'review';
	// @ts-expect-error ScopeLevel has only 'def' | 'hld' | 'lld' | 'plan' | 'task'
	const _l1: ScopeLevel = 'story';
	// @ts-expect-error a ScopeValidator must take a Scope and return a ValidationResult, not a boolean
	const _v0: ScopeValidator = (s: Scope): boolean => s.scopeType === 'design';
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
