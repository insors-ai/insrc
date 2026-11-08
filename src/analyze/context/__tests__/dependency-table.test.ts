/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Dedupe keys and the dependency table audit (LLD-b9d5c5c40df5a574-s3, task t5).
 * Pure: no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DEDUPE_KEYS, DEPENDENCY, dedupeByKey, missingDependencyKeys } from '../dependency.js';

test('dedupeByKey first ordinal wins and order kept; audit fails when a synthesize prompt key has no entry', () => {
	// Parts concatenated in ordinal order: part 1's entries, then part 2's.
	const entries = [
		{ file: 'docs/a.md', heading: 'A (part 1)' },
		{ file: 'docs/b.md', heading: 'B' },
		{ file: 'docs/a.md', heading: 'A (part 2)' },
		{ heading: 'no file' },
		{ file: 'docs/c.md', heading: 'C' },
		{ file: 'docs/b.md', heading: 'B again' },
	];
	assert.deepEqual(dedupeByKey(entries, 'file'), [entries[0], entries[1], entries[3], entries[4]]);
	assert.deepEqual(dedupeByKey([{ path: 'src/x' }, { path: 'src/y' }, { path: 'src/x' }], 'path'), [{ path: 'src/x' }, { path: 'src/y' }]);
	assert.deepEqual(dedupeByKey([], 'file'), []);

	// The audit: every registered synthesize prompt has an entry, each with its reason.
	const dir = fileURLToPath(new URL('../../../prompts/analyze/', import.meta.url));
	const keys = readdirSync(dir).map(f => /^synthesize\.(.+)\.system\.md$/.exec(f)?.[1]).filter((k): k is string => k !== undefined);
	assert.deepEqual([...keys].sort(), ['adherence', 'capability', 'code', 'data', 'docs', 'infra']);
	assert.deepEqual(missingDependencyKeys(keys), []);
	for (const key of keys) {
		const entry = DEPENDENCY[key as keyof typeof DEPENDENCY];
		assert.ok(entry.reason.length > 20, `${key} states its reason`);
		assert.deepEqual(DEDUPE_KEYS[key as keyof typeof DEDUPE_KEYS], entry.dedupe);
	}
	// A prompt added without an entry is reported.
	assert.deepEqual(missingDependencyKeys([...keys, 'security']), ['security']);
	// The stated references.
	assert.deepEqual(DEPENDENCY.adherence.referenceTypes, ['doc.constraint.enumerate', 'doc.decision.trace']);
	assert.deepEqual(DEPENDENCY.capability.referenceTypes, ['capability.reuse-check']);
	assert.equal(DEPENDENCY.code.anchorExtract, true);
	for (const none of ['docs', 'data', 'infra'] as const) {
		assert.deepEqual(DEPENDENCY[none].referenceTypes, []);
		assert.equal(DEPENDENCY[none].anchorExtract, false);
	}
});
