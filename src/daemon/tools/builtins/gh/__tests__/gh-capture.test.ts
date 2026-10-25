import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bytesToText } from '../helpers.js';

test('gh-capture.test.ts: byte-to-text adapter decodes with replacement and stays valid text when a cut crosses a multibyte character', () => {
	const full = new TextEncoder().encode('abé€');       // 2 + 2 + 3 bytes
	// cut inside the euro sign: the incomplete tail is dropped, not turned into a replacement character
	const cutThree = bytesToText(full.subarray(0, 5), true);
	assert.equal(cutThree, 'abé');
	const cutOne = bytesToText(full.subarray(0, 3), true);
	assert.equal(cutOne, 'ab');
	// a complete cut keeps everything
	assert.equal(bytesToText(full, true), 'abé€');
	// invalid bytes decode as the replacement character and the result is a valid string
	assert.equal(bytesToText(new Uint8Array([0x61, 0xFF, 0x62]), false), 'a�b');
	assert.equal(bytesToText(new Uint8Array(0), true), '');
});
