/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isQualifiedForCapabilityPolicy } from '../capability-qualification.js';

test("CapabilityQualificationTable: 'claude' is qualified for strict-read-analyze", () => {
	assert.equal(isQualifiedForCapabilityPolicy('claude', 'strict-read-analyze'), true);
});

test("CapabilityQualificationTable: 'codex' is NOT qualified for strict-read-analyze", () => {
	assert.equal(isQualifiedForCapabilityPolicy('codex', 'strict-read-analyze'), false);
});

test("CapabilityQualificationTable: 'ollama' is qualified for strict-read-analyze", () => {
	assert.equal(isQualifiedForCapabilityPolicy('ollama', 'strict-read-analyze'), true);
});

test("CapabilityQualificationTable: 'vibe' is NOT qualified for strict-read-analyze", () => {
	assert.equal(isQualifiedForCapabilityPolicy('vibe', 'strict-read-analyze'), false);
});

test('every provider is qualified for write-sandboxed (the default policy)', () => {
	for (const provider of ['claude', 'codex', 'vibe', 'ollama'] as const) {
		assert.equal(isQualifiedForCapabilityPolicy(provider, 'write-sandboxed'), true);
	}
});
