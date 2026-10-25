/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-b97752e9 t12 — runShell decodes UTF-8 across chunk boundaries.
 *
 * Run: npx tsx --test src/daemon/tools/__tests__/shell-helper.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runShell } from '../shell-helper.js';

/** A child that writes `parts` (byte arrays) one at a time, `gapMs` apart, so each
 *  arrives in its own chunk. */
const writer = (parts: readonly (readonly number[])[], gapMs = 80): string[] => [
	process.execPath, '-e',
	`const parts = ${JSON.stringify(parts)}; let i = 0;
	 const next = () => { if (i >= parts.length) return; process.stdout.write(Buffer.from(parts[i++])); setTimeout(next, ${gapMs}); };
	 next();`,
];

test('a multibyte UTF-8 character split across two output chunks is decoded whole, and the byte cap and truncation flag are unchanged', async () => {
	// "café.ts\n": the two bytes of "é" (0xc3 0xa9) land in different chunks.
	const split = await runShell(writer([[0x63, 0x61, 0x66, 0xc3], [0xa9, 0x2e, 0x74, 0x73, 0x0a]]));
	assert.equal(split.code, 0);
	assert.equal(split.stdout, 'café.ts\n');
	assert.ok(!split.stdout.includes('�'), 'no replacement character');
	assert.equal(split.stdoutTruncated, false);

	// The cap: a chunk past it is dropped whole and the flag is set, as before; the
	// partial "é" before the cut is not emitted as a replacement character.
	const capped = await runShell(writer([[...Buffer.from('a'.repeat(1023)), 0xc3], [0xa9, ...Buffer.from('b'.repeat(100))]]), { maxBytes: 1024 });
	assert.equal(capped.stdoutTruncated, true);
	assert.equal(capped.stdout, 'a'.repeat(1023));
});
