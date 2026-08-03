/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assembleCodeReviewGrounding, isTestFile, type GroundingDeps, type GroundedEntity } from '../grounding.js';

/** A tiny in-memory graph fixture: entities keyed by id, plus CALLS edges. */
function fixture(): GroundingDeps {
	const ents: Record<string, GroundedEntity> = {
		e1: { id: 'e1', file: 'src/a.ts', kind: 'function', name: 'alpha', signature: 'alpha(): void' },
		e2: { id: 'e2', file: 'src/a.ts', kind: 'function', name: 'beta',  signature: 'beta(): number' },
		e3: { id: 'e3', file: 'src/b.ts', kind: 'function', name: 'gamma', signature: 'gamma(): void' },
		et: { id: 'et', file: 'src/__tests__/a.test.ts', kind: 'function', name: 'testAlpha', signature: '' },
	};
	// CALLS edges: et -> alpha (a test reaches alpha), gamma -> alpha (prod caller), alpha -> beta (callee)
	const callers: Record<string, GroundedEntity[]> = {
		e1: [ents['et']!, ents['e3']!],   // alpha is called by the test AND by gamma
		e2: [ents['e1']!],                // beta is called by alpha
	};
	const callees: Record<string, GroundedEntity[]> = {
		e1: [ents['e2']!],                // alpha calls beta
	};
	const byFile: Record<string, GroundedEntity[]> = {
		'src/a.ts': [ents['e1']!, ents['e2']!],
		'src/b.ts': [ents['e3']!],
		// 'src/unindexed.ts' and 'README.md' deliberately absent -> [] (omit)
	};
	return {
		entitiesInFile: async (_r, f) => byFile[f] ?? [],
		callersOf:      async (_r, id) => callers[id] ?? [],
		calleesOf:      async (_r, id) => callees[id] ?? [],
	};
}

// ---- ac3: structured summary rows, no raw file-content field ----

test('assembleCodeReviewGrounding: emits ChangedSymbolSummary rows with callers/callees/testsReaching and no file text', async () => {
	const g = await assembleCodeReviewGrounding('/repo', ['src/a.ts', 'src/b.ts'], fixture());
	const alpha = g.symbols.find(s => s.name === 'alpha');
	assert.ok(alpha, 'alpha summary present');
	assert.equal(alpha!.entityId, 'e1');
	assert.equal(alpha!.signature, 'alpha(): void');
	// callers = both the test and gamma; callees = beta
	assert.deepEqual([...alpha!.callers].sort(), ['gamma', 'testAlpha']);
	assert.deepEqual(alpha!.callees, ['beta']);
	// testsReaching = only the caller whose file is a test file
	assert.deepEqual(alpha!.testsReaching, ['testAlpha']);
	// no raw file content anywhere on the row
	assert.ok(!('body' in (alpha as object)) && !('content' in (alpha as object)));
});

// ---- edge: omit-unindexed, and non-code files ----

test('assembleCodeReviewGrounding: a changed file with no indexed entities yields no rows (omitted, not error)', async () => {
	const g = await assembleCodeReviewGrounding('/repo', ['src/a.ts', 'src/unindexed.ts', 'README.md'], fixture());
	// only src/a.ts entities appear; the other two files simply contribute nothing
	assert.deepEqual([...new Set(g.symbols.map(s => s.file))], ['src/a.ts']);
	assert.equal(g.symbols.length, 2);   // alpha + beta
});

// ---- per-symbol (not per-file) keying ----

test('assembleCodeReviewGrounding: one row per entity, multiple entities in a file share the file path', async () => {
	const g = await assembleCodeReviewGrounding('/repo', ['src/a.ts'], fixture());
	assert.equal(g.symbols.length, 2);
	assert.deepEqual(g.symbols.map(s => s.name), ['alpha', 'beta']);
	assert.ok(g.symbols.every(s => s.file === 'src/a.ts'));
	// distinct entityIds
	assert.equal(new Set(g.symbols.map(s => s.entityId)).size, 2);
});

test('assembleCodeReviewGrounding: empty changed set yields empty grounding', async () => {
	const g = await assembleCodeReviewGrounding('/repo', [], fixture());
	assert.deepEqual(g.symbols, []);
});

// ---- isTestFile helper ----

test('isTestFile recognises __tests__ dirs and .test/.spec suffixes only', () => {
	assert.equal(isTestFile('src/__tests__/x.test.ts'), true);
	assert.equal(isTestFile('src/foo.test.ts'), true);
	assert.equal(isTestFile('src/foo.spec.tsx'), true);
	assert.equal(isTestFile('src/foo.ts'), false);
	assert.equal(isTestFile('src/testutil.ts'), false);
});
