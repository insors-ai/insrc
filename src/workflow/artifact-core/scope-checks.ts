/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * shared-reviewcontext-data-model Epic sc3 (Scope's two per-review-type validators), owned by s2.
 * Pure, synchronous, no I/O.
 */

import { validatePointerPath } from './pointer-checks.js';
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

// An empty array does not satisfy a "required" field (a Scope cannot claim task-level coverage
// while naming zero actual Tasks), but it DOES violate a "must be absent" field: the LLD's own
// check for that direction is scope[field] !== undefined, so a caller that explicitly sets
// tasks: [] at a depth where tasks must be absent has still populated the field key.
function isRequiredSatisfied(scope: Scope, field: keyof Scope): boolean {
	const value = scope[field];
	return Array.isArray(value) ? value.length > 0 : value !== undefined;
}

function isAbsent(scope: Scope, field: keyof Scope): boolean {
	return scope[field] === undefined;
}

function checkFieldRequirement(scope: Scope, requirement: ScopeFieldRequirement): readonly string[] {
	const violations: string[] = [];
	for (const field of requirement.required) {
		if (!isRequiredSatisfied(scope, field)) violations.push(`'${field}' is required at scopeLevel '${scope.scopeLevel}' but is absent`);
	}
	for (const field of requirement.mustBeAbsent) {
		if (!isAbsent(scope, field)) violations.push(`'${field}' must be absent at scopeLevel '${scope.scopeLevel}' but is populated`);
	}
	return violations;
}

function checkPointerPaths(scope: Scope, registeredRepoRoot: string): readonly string[] {
	const violations: string[] = [];
	for (const field of POINTER_FIELDS) {
		const pointer = scope[field] as Pointer | undefined;
		if (pointer === undefined) continue;
		const result = validatePointerPath(pointer, registeredRepoRoot);
		if (!result.ok) violations.push(...result.violations.map((v) => `'${field}': ${v}`));
	}
	if (scope.tasks !== undefined) {
		for (const [index, pointer] of scope.tasks.entries()) {
			const result = validatePointerPath(pointer, registeredRepoRoot);
			if (!result.ok) violations.push(...result.violations.map((v) => `'tasks[${index}]': ${v}`));
		}
	}
	return violations;
}

function validateScope(scope: Scope, registeredRepoRoot: string, expectedType: ScopeType, requirements: Readonly<Record<string, ScopeFieldRequirement>>): { readonly ok: boolean; readonly violations: readonly string[] } {
	if (scope.scopeType !== expectedType) {
		return { ok: false, violations: [`scopeType '${scope.scopeType}' does not match this validator's expected '${expectedType}'`] };
	}
	const requirement = requirements[scope.scopeLevel];
	if (requirement === undefined) {
		return { ok: false, violations: [`(scopeType '${scope.scopeType}', scopeLevel '${scope.scopeLevel}') is not a valid combination`] };
	}
	const violations = [...checkFieldRequirement(scope, requirement), ...checkPointerPaths(scope, registeredRepoRoot)];
	return { ok: violations.length === 0, violations };
}

export const validateDesignScope: ScopeValidator = (scope, registeredRepoRoot) => validateScope(scope, registeredRepoRoot, 'design', DESIGN_REQUIREMENTS);

export const validateCodeScope: ScopeValidator = (scope, registeredRepoRoot) => validateScope(scope, registeredRepoRoot, 'code', CODE_REQUIREMENTS);
