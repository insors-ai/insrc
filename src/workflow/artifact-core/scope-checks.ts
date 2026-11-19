/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * shared-reviewcontext-data-model Epic sc3 (Scope's two per-review-type validators), owned by s2.
 * Pure, synchronous, no I/O.
 */

import { validatePointerPath } from './pointer-checks.js';
import type { Pointer, Scope, ScopeType, ScopeValidator } from './types.js';

/**
 * Not exported: this shape is internal to this file's comparison engine and not part of sc3's
 * public contract. types.ts declares its own equivalent (also unexported) to document the shape
 * there per the plan; the two are intentionally separate since neither file can import the
 * other's unexported symbol.
 */
interface ScopeFieldRequirement {
	readonly required:     readonly (keyof Scope)[];
	readonly mustBeAbsent: readonly (keyof Scope)[];
}

const POINTER_FIELDS = ['def', 'hld', 'lld', 'plan', 'extension', 'amendment'] as const satisfies readonly (keyof Scope)[];

/**
 * ScopeValidator takes only a Scope, with no registeredRepoRoot parameter, so sc6's
 * PointerPathValidator is called against a fixed internal anchor rather than the caller's real
 * repo root. The anchor's own identity doesn't matter: a well-formed repo-relative Pointer.path
 * (sc1's contract) resolves under ANY sufficiently-deep absolute anchor, while a path escaping
 * via enough '..' segments escapes any anchor the same way -- so this still faithfully detects
 * an escaping path without needing the real root.
 */
const SCOPE_CHECK_ANCHOR = '/scope-validator-anchor';

const DESIGN_REQUIREMENTS: Readonly<Record<string, ScopeFieldRequirement>> = {
	def: { required: ['def'], mustBeAbsent: ['hld', 'lld'] },
	hld: { required: ['def', 'hld'], mustBeAbsent: ['lld'] },
	lld: { required: ['def', 'hld', 'lld'], mustBeAbsent: [] },
};

const CODE_REQUIREMENTS: Readonly<Record<string, ScopeFieldRequirement>> = {
	plan: { required: ['plan'], mustBeAbsent: ['tasks'] },
	task: { required: ['plan', 'tasks'], mustBeAbsent: [] },
};

function isPopulated(scope: Scope, field: keyof Scope): boolean {
	const value = scope[field];
	return Array.isArray(value) ? value.length > 0 : value !== undefined;
}

function checkFieldRequirement(scope: Scope, requirement: ScopeFieldRequirement): readonly string[] {
	const violations: string[] = [];
	for (const field of requirement.required) {
		if (!isPopulated(scope, field)) violations.push(`'${field}' is required at scopeLevel '${scope.scopeLevel}' but is absent`);
	}
	for (const field of requirement.mustBeAbsent) {
		if (isPopulated(scope, field)) violations.push(`'${field}' must be absent at scopeLevel '${scope.scopeLevel}' but is populated`);
	}
	return violations;
}

function checkPointerPaths(scope: Scope): readonly string[] {
	const violations: string[] = [];
	for (const field of POINTER_FIELDS) {
		const pointer = scope[field] as Pointer | undefined;
		if (pointer === undefined) continue;
		const result = validatePointerPath(pointer, SCOPE_CHECK_ANCHOR);
		if (!result.ok) violations.push(...result.violations.map((v) => `'${field}': ${v}`));
	}
	if (scope.tasks !== undefined) {
		for (const [index, pointer] of scope.tasks.entries()) {
			const result = validatePointerPath(pointer, SCOPE_CHECK_ANCHOR);
			if (!result.ok) violations.push(...result.violations.map((v) => `'tasks[${index}]': ${v}`));
		}
	}
	return violations;
}

function validateScope(scope: Scope, expectedType: ScopeType, requirements: Readonly<Record<string, ScopeFieldRequirement>>): { readonly ok: boolean; readonly violations: readonly string[] } {
	if (scope.scopeType !== expectedType) {
		return { ok: false, violations: [`scopeType '${scope.scopeType}' does not match this validator's expected '${expectedType}'`] };
	}
	const requirement = requirements[scope.scopeLevel];
	if (requirement === undefined) {
		return { ok: false, violations: [`(scopeType '${scope.scopeType}', scopeLevel '${scope.scopeLevel}') is not a valid combination`] };
	}
	const violations = [...checkFieldRequirement(scope, requirement), ...checkPointerPaths(scope)];
	return { ok: violations.length === 0, violations };
}

export const validateDesignScope: ScopeValidator = (scope) => validateScope(scope, 'design', DESIGN_REQUIREMENTS);

export const validateCodeScope: ScopeValidator = (scope) => validateScope(scope, 'code', CODE_REQUIREMENTS);
