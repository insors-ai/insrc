/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — the vendored LinkML metamodel schema asset + its boot-time
 * validator. Mirrors docgen's asset-validator tests: the validator branches
 * (pass / missing / empty / malformed) are exercised against a TEMP schema dir via
 * the shared _setArtifactSchemaDirForTests override; an integration check runs the
 * real resolved dir + proves the shipped schema validates a good ErDefinition and
 * rejects a malformed one via ajv (ac4). boot asset-check fails loudly when absent (t2).
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/metamodel.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	validateLinkmlMetamodelAsset,
	loadLinkmlMetamodelSchema,
	LinkmlMetamodelAssetError,
	LINKML_METAMODEL_ASSET,
	_setArtifactSchemaDirForTests,
	_resetMetamodelCacheForTests,
} from '../metamodel.js';
import { validateAgainstSchema } from '../../../../agent/providers/structured-output.js';

afterEach(() => { _setArtifactSchemaDirForTests(undefined); _resetMetamodelCacheForTests(); });

/** A temp schema dir; a null value means "don't write the file". */
function tmpSchemaDir(content: string | null): string {
	const dir = mkdtempSync(join(tmpdir(), 'linkml-schema-'));
	if (content !== null) writeFileSync(join(dir, LINKML_METAMODEL_ASSET), content);
	return dir;
}

// ── boot asset-check branches ────────────────────────────────────────────────

test('validateLinkmlMetamodelAsset: present + parseable → returns silently', async () => {
	const dir = tmpSchemaDir(JSON.stringify({ type: 'object', properties: {} }));
	_setArtifactSchemaDirForTests(dir);
	await assert.doesNotReject(() => validateLinkmlMetamodelAsset());
	rmSync(dir, { recursive: true, force: true });
});

test('validateLinkmlMetamodelAsset: missing schema → throws with one copy-assets Fix: line (t2)', async () => {
	const dir = tmpSchemaDir(null);
	_setArtifactSchemaDirForTests(dir);
	await assert.rejects(() => validateLinkmlMetamodelAsset(), (e: unknown) => {
		assert.ok(e instanceof LinkmlMetamodelAssetError);
		assert.match(e.reason, /file not found/);
		assert.equal((e.message.match(/Fix:/g) ?? []).length, 1);
		assert.match(e.message, /copy-assets/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

test('validateLinkmlMetamodelAsset: empty file → reason "file is empty"', async () => {
	const dir = tmpSchemaDir('   \n');
	_setArtifactSchemaDirForTests(dir);
	await assert.rejects(() => validateLinkmlMetamodelAsset(), (e: unknown) => {
		assert.ok(e instanceof LinkmlMetamodelAssetError);
		assert.match(e.reason, /empty/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

test('validateLinkmlMetamodelAsset: malformed JSON → unparseable schema', async () => {
	const dir = tmpSchemaDir('{ not json');
	_setArtifactSchemaDirForTests(dir);
	await assert.rejects(() => validateLinkmlMetamodelAsset(), (e: unknown) => {
		assert.ok(e instanceof LinkmlMetamodelAssetError);
		assert.match(e.reason, /unparseable/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

// ── the real shipped schema (ac4) ────────────────────────────────────────────

test('the shipped LinkML metamodel schema validates + records the LinkML version', async () => {
	await assert.doesNotReject(() => validateLinkmlMetamodelAsset());   // no override → the real asset
	const schema = loadLinkmlMetamodelSchema() as Record<string, unknown>;
	assert.equal(typeof schema['$comment'], 'string');
	assert.match(schema['$comment'] as string, /LinkML/i);
});

test('the shipped schema accepts a known-good ErDefinition and rejects a malformed one via ajv (ac4)', () => {
	const schema = loadLinkmlMetamodelSchema();
	const good = { classes: { Customer: { attributes: { id: { range: 'string', identifier: true, required: true } } } } };
	assert.equal(validateAgainstSchema(schema, good).ok, true);

	const bad = { classes: { Customer: { attributes: { id: { range: 'string', required: 'yes' } } } } };   // required must be boolean
	assert.equal(validateAgainstSchema(schema, bad).ok, false);

	const noClasses = { id: 'x' };   // `classes` is required
	assert.equal(validateAgainstSchema(schema, noClasses).ok, false);
});
