/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cutting a long text into sections (LLD-b9d5c5c40df5a574-s3, task t4).
 * Pure: no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSection, sectionBlock, sectionText } from '../sections.js';

test('6,000 over 5,000 gives 5,000 and 1,000; emoji boundary; valid text, no overlap, none dropped; ordinals separate from keys', () => {
	const ascii = 'a'.repeat(6_000);
	const cut = sectionText(ascii, 5_000);
	assert.deepEqual(cut.map(s => Buffer.byteLength(s)), [5_000, 1_000]);
	assert.equal(cut.join(''), ascii);

	// 4,999 ASCII bytes then a four-byte emoji: the emoji does not fit, so it starts the next section whole.
	const text = `${'a'.repeat(4_999)}😀tail`;
	const pieces = sectionText(text, 5_000);
	assert.equal(Buffer.byteLength(pieces[0] as string), 4_999);
	assert.ok((pieces[1] as string).startsWith('😀'));
	assert.equal(pieces.join(''), text);
	for (const p of pieces) {
		assert.equal(Buffer.from(p, 'utf8').toString('utf8'), p, 'valid UTF-8, no split code point');
		assert.ok(Buffer.byteLength(p) <= 5_000);
	}

	// Multi-byte text is cut on code-point boundaries and loses nothing: a section may leave up to three bytes unused.
	const euros = '€'.repeat(4_000);
	const e = sectionText(euros, 5_000);
	assert.equal(e.join(''), euros);
	for (const p of e.slice(0, -1)) assert.ok(5_000 - Buffer.byteLength(p) <= 3);

	// In characters the unit is UTF-16 code units: an emoji is two.
	const chars = sectionText(`${'a'.repeat(4_999)}😀`, 5_000, 'chars');
	assert.equal(chars.length, 2);
	assert.equal(chars[0]?.length, 4_999);

	// A text that fits is one section, an empty one is one empty section, a room that holds no code point is refused.
	assert.deepEqual(sectionText('short', 5_000), ['short']);
	assert.deepEqual(sectionText('', 5_000), ['']);
	assert.throws(() => sectionText('x', 3), RangeError);

	// Ordinals are separate from keys: two blocks with the same text keep their own keys, and each counts its sections from 1.
	const text = 'x'.repeat(9_000);
	const results = ['same-text-a', 'same-text-b'].map(key => sectionBlock({ key, envelope: {}, text }, 5_000));
	for (const [i, key] of ['same-text-a', 'same-text-b'].entries()) {
		const r = results[i];
		assert.equal(r?.admissible, true);
		const cut = r?.admissible ? r.sections : [];
		assert.deepEqual(cut.map(c => [c.blockKey, c.index, c.count]), [[key, 1, 2], [key, 2, 2]]);
	}

	// The key is budgeted in the call's unit: a key of 100 emoji takes 400 bytes and sections still fit the room.
	const emojiKey = '😀'.repeat(100);
	const r = sectionBlock({ key: emojiKey, envelope: { file: 'a.md' }, text: 'y'.repeat(30_000) }, 5_000);
	assert.equal(r.admissible, true);
	if (r.admissible) {
		assert.ok(r.sections.length > 1);
		for (const sec of r.sections) assert.ok(Buffer.byteLength(renderSection(sec)) <= 5_000);
	}
});
