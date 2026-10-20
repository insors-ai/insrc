/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review pipeline's job (Epic 8315a11f, Story s1).
 *
 * Run: npx tsx --test src/workflow/review-pipeline/__tests__/pipeline-job.test.ts
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CONFIG_CATALOG } from '../../../config/config-catalog.js';
import { DEFAULT_REVIEW_CHUNK_TOKENS, REVIEW_CHARS_PER_TOKEN, reviewLimitChars } from '../limit.js';

test('the default chunk limit is 384,000 characters for every provider and follows review.chunkTokens', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-review-limit-'));
	try {
		const configPath = join(dir, 'config.json');
		// No config file: the default.
		assert.equal(reviewLimitChars(configPath), 384_000);
		assert.equal(REVIEW_CHARS_PER_TOKEN, 3);
		// The catalog declares the setting with the same default, so config reconcile fills old files with it.
		const row = CONFIG_CATALOG.find(r => r.path === 'review.chunkTokens');
		assert.ok(row !== undefined, 'review.chunkTokens is in the config catalog');
		assert.equal(row.type, 'number');
		assert.equal(row.default, DEFAULT_REVIEW_CHUNK_TOKENS);
		assert.equal(DEFAULT_REVIEW_CHUNK_TOKENS, 128_000);
		// A configured value v gives v x 3, whatever provider is configured.
		for (const provider of ['claude', 'codex', 'ollama']) {
			writeFileSync(configPath, JSON.stringify({ review: { chunkTokens: 200_000 }, models: { review: { runner: provider } } }));
			assert.equal(reviewLimitChars(configPath), 600_000, provider);
		}
		// A value that is not a positive whole number falls back to the default.
		for (const bad of [0, -5, 1.5, '1000', null]) {
			writeFileSync(configPath, JSON.stringify({ review: { chunkTokens: bad } }));
			assert.equal(reviewLimitChars(configPath), 384_000, `chunkTokens=${JSON.stringify(bad)}`);
		}
		writeFileSync(configPath, '{ not json');
		assert.equal(reviewLimitChars(configPath), 384_000, 'an unparseable file');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
