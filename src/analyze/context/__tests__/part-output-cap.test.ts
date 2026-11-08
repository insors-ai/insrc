/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The output caps of a call (LLD-b9d5c5c40df5a574-s3, task t3). Pure: no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PART_MAX_OUTPUT_TOKENS, outputTokensFor } from '../handling.js';
import type { AdmissionTarget } from '../handling.js';

test('PART_MAX_OUTPUT_TOKENS 8,192 for local part and combine calls, configured tokens for single pass, no enforced cap for CLI', () => {
	const local: AdmissionTarget = { kind: 'local', windowTokens: 32_768, singlePassOutputTokens: 20_480 };
	assert.equal(PART_MAX_OUTPUT_TOKENS, 8_192);
	assert.equal(outputTokensFor(local, 'single'), 20_480);
	assert.equal(outputTokensFor(local, 'part'), 8_192);
	assert.equal(outputTokensFor(local, 'combine'), 8_192);
	for (const target of [{ kind: 'cli', inputBudgetChars: 100_000 }, { kind: 'cli' }, { kind: 'unknown' }] as AdmissionTarget[]) {
		for (const call of ['single', 'part', 'combine'] as const) assert.equal(outputTokensFor(target, call), undefined);
	}
});
