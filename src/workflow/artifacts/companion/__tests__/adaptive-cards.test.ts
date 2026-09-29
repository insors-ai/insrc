/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) — the vendored Adaptive Cards schema asset + its boot-time validator.
 * Mirrors metamodel.test.ts: the validator branches (pass / missing / empty /
 * malformed) are exercised against a TEMP schema dir via the shared
 * _setArtifactSchemaDirForTests override; an integration check runs the real
 * resolved dir + proves the shipped schema loads + validates a good UxDefinition and
 * rejects a malformed one via ajv. Boot asset-check fails loudly when absent (t1).
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/adaptive-cards.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	validateAdaptiveCardsAsset,
	loadAdaptiveCardsSchema,
	AdaptiveCardsAssetError,
	ADAPTIVE_CARDS_ASSET,
	_resetAdaptiveCardsCacheForTests,
} from '../adaptive-cards.js';
import { _setArtifactSchemaDirForTests } from '../metamodel.js';
import { validateAgainstSchema } from '../../../../agent/providers/structured-output.js';

afterEach(() => { _setArtifactSchemaDirForTests(undefined); _resetAdaptiveCardsCacheForTests(); });

/** A temp schema dir; a null value means "don't write the file". */
function tmpSchemaDir(content: string | null): string {
	const dir = mkdtempSync(join(tmpdir(), 'adaptive-cards-'));
	if (content !== null) writeFileSync(join(dir, ADAPTIVE_CARDS_ASSET), content);
	return dir;
}

// ── boot asset-check branches ────────────────────────────────────────────────

test('validateAdaptiveCardsAsset: present + parseable → returns silently', async () => {
	const dir = tmpSchemaDir(JSON.stringify({ type: 'object', properties: {} }));
	_setArtifactSchemaDirForTests(dir);
	await assert.doesNotReject(() => validateAdaptiveCardsAsset());
	rmSync(dir, { recursive: true, force: true });
});

test('validateAdaptiveCardsAsset: missing schema → throws with one copy-assets Fix: line (t1)', async () => {
	const dir = tmpSchemaDir(null);
	_setArtifactSchemaDirForTests(dir);
	await assert.rejects(() => validateAdaptiveCardsAsset(), (e: unknown) => {
		assert.ok(e instanceof AdaptiveCardsAssetError);
		assert.match(e.reason, /file not found/);
		assert.equal((e.message.match(/Fix:/g) ?? []).length, 1);
		assert.match(e.message, /copy-assets/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

test('validateAdaptiveCardsAsset: empty file → reason "file is empty"', async () => {
	const dir = tmpSchemaDir('   \n');
	_setArtifactSchemaDirForTests(dir);
	await assert.rejects(() => validateAdaptiveCardsAsset(), (e: unknown) => {
		assert.ok(e instanceof AdaptiveCardsAssetError);
		assert.match(e.reason, /empty/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

test('validateAdaptiveCardsAsset: malformed JSON → unparseable schema', async () => {
	const dir = tmpSchemaDir('{ not json');
	_setArtifactSchemaDirForTests(dir);
	await assert.rejects(() => validateAdaptiveCardsAsset(), (e: unknown) => {
		assert.ok(e instanceof AdaptiveCardsAssetError);
		assert.match(e.reason, /unparseable/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

// ── the real shipped schema ──────────────────────────────────────────────────

test('the shipped Adaptive Cards schema validates + records the version comment', async () => {
	await assert.doesNotReject(() => validateAdaptiveCardsAsset());   // no override → the real asset
	const schema = loadAdaptiveCardsSchema() as Record<string, unknown>;
	assert.equal(typeof schema['$comment'], 'string');
	assert.match(schema['$comment'] as string, /Adaptive Cards/i);
});

test('the shipped schema compiles under the shared ajv, accepts a good UxDefinition + rejects a malformed one', () => {
	const schema = loadAdaptiveCardsSchema();
	const good = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'hi' }] };
	assert.equal(validateAgainstSchema(schema, good).ok, true);

	const badElement = { type: 'AdaptiveCard', body: [{ type: 'Bogus' }] };   // unknown element type
	assert.equal(validateAgainstSchema(schema, badElement).ok, false);

	const noBody = { type: 'AdaptiveCard' };   // `body` is required
	assert.equal(validateAgainstSchema(schema, noBody).ok, false);
});
