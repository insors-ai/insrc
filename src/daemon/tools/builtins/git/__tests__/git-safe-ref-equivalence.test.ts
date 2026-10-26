/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t7: the SAFE_REF schema pattern accepts exactly the names isSafeRefName accepts.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-safe-ref-equivalence.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { isSafeRefName } from '../../../../../workflow/team/sighting-store.js';
import { SAFE_PATH, SAFE_REF, SAFE_REFS_REF } from '../safe-args.js';

const ACCEPTED = ['main', 'feature/x', 'release-1.0', 'v1.2.3', 'für', '日本語', 'привет', 'a+b', 'a#b', 'a@b', '@x', 'x@', 'refs/heads/main', 'a-b_c', 'a.b', '\u{1f600}'];
const REFUSED = [
	'', '-x', '/x', ' x', 'x ', 'a b', 'a\tb', 'a\nb', 'a\rb', 'a\u0000b', 'a\u001fb', 'a\u007fb',
	'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b',
	'a..b', '..', 'a@{b', 'a//b', '@', 'a/', 'a.', 'x.lock', 'a/b.lock', 'a/.', '\u00a0x', '\u2003x',
];

const re = new RegExp(SAFE_REF, 'u');
const schema = { type: 'string', pattern: SAFE_REF } as unknown as StructuredSchema;

test('git-safe-ref-equivalence.test.ts: the SAFE_REF schema pattern and isSafeRefName agree on one corpus of accepted and refused names', () => {
	for (const name of [...ACCEPTED, ...REFUSED]) {
		assert.equal(re.test(name), isSafeRefName(name), `regex vs predicate for ${JSON.stringify(name)}`);
		assert.equal(validateAgainstSchema(schema, name).ok, isSafeRefName(name), `schema vs predicate for ${JSON.stringify(name)}`);
	}
	for (const name of ACCEPTED) assert.equal(isSafeRefName(name), true, `${JSON.stringify(name)} is in the accepted half`);
	for (const name of REFUSED) assert.equal(isSafeRefName(name), false, `${JSON.stringify(name)} is in the refused half`);
});

test('git-safe-ref-equivalence.test.ts: every character class the predicate refuses is refused by the pattern too, one at a time', () => {
	const chars = ['~', '^', ':', '?', '*', '[', '\\', ' ', '\t', '\n', '\u0000', '\u0001', '\u001f', '\u007f'];
	for (const c of chars) {
		for (const name of [`a${c}b`, `${c}ab`, `ab${c}`]) {
			assert.equal(re.test(name), isSafeRefName(name), JSON.stringify(name));
		}
	}
	// the combined refs/ pattern is SAFE_REF with the prefix required
	const refs = new RegExp(SAFE_REFS_REF, 'u');
	for (const name of ['refs/heads/x', 'refs/tags/ü', 'heads/x', 'x', 'refs/heads/a..b', 'refs/x.lock']) {
		assert.equal(refs.test(name), name.startsWith('refs/') && isSafeRefName(name), name);
	}
});

test('git-safe-ref-equivalence.test.ts: SAFE_PATH refuses only a NUL', () => {
	const path = new RegExp(SAFE_PATH, 'u');
	for (const p of ['a.txt', '-x', '--flag', 'dir/a b', '..', 'ü', 'a\nb', '~', ':']) assert.equal(path.test(p), true, JSON.stringify(p));
	for (const p of ['a\u0000b', '\u0000', '']) assert.equal(path.test(p), false, JSON.stringify(p));
});
