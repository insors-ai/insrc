/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the docgen DocTypeRegistry (s1 · t3).
 *
 * Run: npx tsx --test src/docgen/__tests__/registry.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	InMemoryDocTypeRegistry,
	DuplicateDocTypeError,
	InvalidRegistrationError,
	toSerializable,
} from '../registry.js';
import { ok } from '../outcome.js';
import type { DocTypeRegistration, DocumentIR } from '../types.js';

const emptyIr = (docType: string): DocumentIR => ({
	docType,
	scopeDescription: 'test',
	derived: { nodes: [], edges: [] },
	narrated: { sections: [] },
	generatedAtRevision: 'rev0',
});

/** A valid registration; overrides let a test bend one field to invalid. */
function reg(overrides: Partial<DocTypeRegistration> = {}): DocTypeRegistration {
	const docType = overrides.docType ?? 'type-structure';
	return {
		docType,
		capability: overrides.capability ?? { id: docType, summary: 'Type structure of a scope' },
		extractorInputSchema: overrides.extractorInputSchema ?? { type: 'object' },
		extract: overrides.extract ?? (async () => ok(emptyIr(docType))),
	};
}

test('register → list includes it; get resolves it', () => {
	const r = new InMemoryDocTypeRegistry();
	const entry = reg();
	r.register(entry);
	assert.equal(r.get('type-structure'), entry);
	assert.deepEqual(r.list().map(e => e.docType), ['type-structure']);
});

test('get on an unregistered docType → undefined (not a throw)', () => {
	const r = new InMemoryDocTypeRegistry();
	assert.equal(r.get('nope'), undefined);
});

test('list preserves registration order and returns a fresh copy', () => {
	const r = new InMemoryDocTypeRegistry();
	r.register(reg({ docType: 'a', capability: { id: 'a', summary: 'a' } }));
	r.register(reg({ docType: 'b', capability: { id: 'b', summary: 'b' } }));
	const first = r.list();
	assert.deepEqual(first.map(e => e.docType), ['a', 'b']);
	// mutating the returned array does not affect the registry
	(first as unknown as unknown[]).length = 0;
	assert.deepEqual(r.list().map(e => e.docType), ['a', 'b']);
});

test('registering the same docType twice → DuplicateDocTypeError', () => {
	const r = new InMemoryDocTypeRegistry();
	r.register(reg());
	assert.throws(() => r.register(reg()), (e: unknown) =>
		e instanceof DuplicateDocTypeError && e.docType === 'type-structure');
});

test('a non-object extractorInputSchema → InvalidRegistrationError', () => {
	const r = new InMemoryDocTypeRegistry();
	assert.throws(
		() => r.register(reg({ extractorInputSchema: 'oops' as unknown as Record<string, unknown> })),
		InvalidRegistrationError,
	);
});

test('capability.id not matching docType → InvalidRegistrationError', () => {
	const r = new InMemoryDocTypeRegistry();
	assert.throws(
		() => r.register(reg({ capability: { id: 'mismatch', summary: 's' } })),
		(e: unknown) => e instanceof InvalidRegistrationError && e.docType === 'type-structure',
	);
});

test('an empty docType → InvalidRegistrationError', () => {
	const r = new InMemoryDocTypeRegistry();
	assert.throws(() => r.register(reg({ docType: '', capability: { id: '', summary: 's' } })), InvalidRegistrationError);
});

test('toSerializable drops the bound extract function, keeps the enumerable subset', () => {
	const entry = reg();
	const s = toSerializable(entry);
	assert.deepEqual(s, {
		docType: 'type-structure',
		capability: { id: 'type-structure', summary: 'Type structure of a scope' },
		extractorInputSchema: { type: 'object' },
	});
	assert.equal('extract' in s, false);
});
