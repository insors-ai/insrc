/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for sc1 (S001, Task t2): the optional functionalDefinition field on each
 * <Stage>Body (type-level, with and without the field) + the assembly validator.
 *
 * Run: npx tsx --test src/workflow/__tests__/functional-definition.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mintFrId } from '../id.js';
import {
	validateFunctionalDefinition,
	type FunctionalDefinition,
	type FunctionalRequirement,
} from '../artifacts/functional-definition.js';
import type { DefineBody } from '../artifacts/define.js';
import type { HldBody } from '../artifacts/hld.js';
import type { LldBody } from '../artifacts/lld.js';
import type { PlanBody } from '../artifacts/plan.js';

const EPIC = '185807ba9a6b35d3';
const ISO  = '2026-07-17T07:42:28.275Z';

function docFr(ordinal: number, extra: Partial<FunctionalRequirement> = {}): FunctionalRequirement {
	return { id: mintFrId(EPIC, ISO, ordinal), statement: `outcome ${ordinal}`, scope: 'doc', ...extra };
}
function itemFr(ordinal: number, storyId: string, itemRef: string): FunctionalRequirement {
	return { id: mintFrId(EPIC, ISO, ordinal, storyId), statement: `outcome ${ordinal}`, scope: 'item', itemRef };
}

// ---------------------------------------------------------------------------
// Type-level: each <Stage>Body accepts functionalDefinition, and compiles WITHOUT it.
// (Compilation of this file under `tsc --noEmit` IS the assertion; the runtime
//  checks below just keep the fixtures live.)
// ---------------------------------------------------------------------------

test('each <Stage>Body type-checks with functionalDefinition present', () => {
	const fd: FunctionalDefinition = { requirements: [docFr(1)] };
	const define = { functionalDefinition: fd } as Partial<DefineBody>;
	const hld    = { functionalDefinition: fd } as Partial<HldBody>;
	const lld    = { functionalDefinition: fd } as Partial<LldBody>;
	const plan   = { functionalDefinition: fd } as Partial<PlanBody>;
	assert.ok(define.functionalDefinition && hld.functionalDefinition && lld.functionalDefinition && plan.functionalDefinition);
});

test('each <Stage>Body type-checks WITHOUT functionalDefinition (absent-safe)', () => {
	const define = {} as Partial<DefineBody>;
	const plan   = {} as Partial<PlanBody>;
	assert.equal(define.functionalDefinition, undefined);
	assert.equal(plan.functionalDefinition, undefined);
});

// ---------------------------------------------------------------------------
// Assembly validation
// ---------------------------------------------------------------------------

test('validateFunctionalDefinition treats undefined and empty requirements as absent', () => {
	assert.equal(validateFunctionalDefinition(undefined), null);
	assert.equal(validateFunctionalDefinition({ requirements: [] }), null);
});

test('a valid doc-level + per-item record passes', () => {
	const fd: FunctionalDefinition = { requirements: [docFr(1), itemFr(2, 's1', 's1')] };
	assert.equal(validateFunctionalDefinition(fd, new Set(['s1'])), null);
});

test('duplicate FR ids are rejected with a duplicate-id error', () => {
	const dup = docFr(1);
	const fd: FunctionalDefinition = { requirements: [dup, { ...dup, statement: 'other' }] };
	const err = validateFunctionalDefinition(fd);
	assert.match(err ?? '', /duplicate FR id/);
});

test('a per-item FR with a dangling itemRef is rejected', () => {
	const fd: FunctionalDefinition = { requirements: [itemFr(1, 's9', 's9')] };
	const err = validateFunctionalDefinition(fd, new Set(['s1', 's2'])); // s9 not known
	assert.match(err ?? '', /dangling itemRef/);
});

test('a per-item FR missing itemRef is rejected', () => {
	const fd: FunctionalDefinition = {
		requirements: [{ id: mintFrId(EPIC, ISO, 1, 's1'), statement: 'x', scope: 'item' }],
	};
	const err = validateFunctionalDefinition(fd, new Set(['s1']));
	assert.match(err ?? '', /missing itemRef/);
});

test('a malformed FR id is rejected', () => {
	const fd: FunctionalDefinition = { requirements: [{ id: 'not-an-fr-id', statement: 'x', scope: 'doc' }] };
	assert.match(validateFunctionalDefinition(fd) ?? '', /not a valid FR id/);
});
