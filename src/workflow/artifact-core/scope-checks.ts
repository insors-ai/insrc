/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * shared-reviewcontext-data-model Epic sc3 (Scope's two per-review-type validators), owned by s2.
 * Pure, synchronous, no I/O.
 */

import { isAbsolute, normalize, sep } from 'node:path';

import type { Pointer, Scope, ScopeLevel, ScopeType, ScopeValidator } from './types.js';

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
 * PointerPathValidator (which requires a real root) cannot be called soundly here: calling it
 * with ANY fixed synthetic root is exploitable -- a path like '../<root's own last segment>/x'
 * resolves back inside that synthetic root while still escaping the real one, because the
 * traversal depth and the synthetic root's depth can coincide. The sound, root-independent
 * equivalent is checking the already-relative path's own structure: after `normalize`, a
 * repo-relative path escapes ANY possible root if and only if it is absolute or its normalized
 * form still starts with '..' -- no real root is needed to decide that.
 */
function escapesAnyRoot(path: string): boolean {
	if (isAbsolute(path)) return true;
	const normalized = normalize(path);
	return normalized === '..' || normalized.startsWith(`..${sep}`);
}

// ScopeLevel is one unified chain (def < hld < lld < plan < task): self-inclusive at a level
// requires every field up to and including that level's own field and forbids every field
// beyond it, whichever review family the level belongs to.
const CHAIN_ORDER = ['def', 'hld', 'lld', 'plan', 'tasks'] as const satisfies readonly (keyof Scope)[];
const LEVEL_FIELD: Readonly<Record<ScopeLevel, (typeof CHAIN_ORDER)[number]>> = {
	def: 'def', hld: 'hld', lld: 'lld', plan: 'plan', task: 'tasks',
};

function requirementAt(level: ScopeLevel): ScopeFieldRequirement {
	const ownIndex = CHAIN_ORDER.indexOf(LEVEL_FIELD[level]);
	return { required: CHAIN_ORDER.slice(0, ownIndex + 1), mustBeAbsent: CHAIN_ORDER.slice(ownIndex + 1) };
}

function requirementsFor(levels: readonly ScopeLevel[]): Readonly<Record<string, ScopeFieldRequirement>> {
	const table: Record<string, ScopeFieldRequirement> = {};
	for (const level of levels) table[level] = requirementAt(level);
	return table;
}

const DESIGN_REQUIREMENTS = requirementsFor(['def', 'hld', 'lld']);
const CODE_REQUIREMENTS = requirementsFor(['plan', 'task']);

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
		if (escapesAnyRoot(pointer.path)) violations.push(`'${field}': '${pointer.path}' escapes the repo root`);
	}
	if (scope.tasks !== undefined) {
		for (const [index, pointer] of scope.tasks.entries()) {
			if (escapesAnyRoot(pointer.path)) violations.push(`'tasks[${index}]': '${pointer.path}' escapes the repo root`);
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
