/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen boot-time asset validator tests (Story s7 · t4/t5).
 *
 * The validator branches (pass / missing / empty / malformed) are exercised
 * against a TEMP asset dir via the shared _setDocgenAssetDirForTests override —
 * no live daemon. The integration checks run against the real resolved
 * DOCGEN_ASSET_DIR (src/assets/docgen under tsx; out/assets/docgen when built)
 * to prove the assets ship + validate on this tree (ac1/ac2). Mirrors
 * src/analyze/context/__tests__/boot-validator.test.ts.
 *
 * Run: npx tsx --test src/docgen/__tests__/asset-validator.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateDocgenAssets, DocgenAssetValidationError } from '../asset-validator.js';
import { _setDocgenAssetDirForTests, DOCGEN_ASSET_DIR, docgenAssetDir } from '../render/shell.js';

const MANIFEST = JSON.stringify({
	mermaidVersion: '10.9.1', svgPanZoomVersion: '3.6.2',
	mermaidAsset: 'mermaid.min.js', svgPanZoomAsset: 'svg-pan-zoom.min.js',
});

/** A temp asset dir; a null value means "don't write this file". */
function tmpAssetDir(files: Record<string, string | null>): string {
	const dir = mkdtempSync(join(tmpdir(), 'docgen-assets-'));
	for (const [name, content] of Object.entries(files)) {
		if (content !== null) writeFileSync(join(dir, name), content);
	}
	return dir;
}

afterEach(() => { _setDocgenAssetDirForTests(undefined); });   // restore the real dir

// ── t4: validator branches against a temp dir ───────────────────────────────

test('validateDocgenAssets: all present + non-empty → returns silently', async () => {
	const dir = tmpAssetDir({ 'runtime.json': MANIFEST, 'mermaid.min.js': 'MERMAID', 'svg-pan-zoom.min.js': 'SPZ' });
	_setDocgenAssetDirForTests(dir);
	await assert.doesNotReject(() => validateDocgenAssets());
	rmSync(dir, { recursive: true, force: true });
});

test('validateDocgenAssets: missing runtime.json → throws naming runtime.json + one copy-assets Fix: line', async () => {
	const dir = tmpAssetDir({ 'mermaid.min.js': 'M', 'svg-pan-zoom.min.js': 'S' });
	_setDocgenAssetDirForTests(dir);
	await assert.rejects(() => validateDocgenAssets(), (e: unknown) => {
		assert.ok(e instanceof DocgenAssetValidationError);
		assert.equal(e.missing[0]!.componentId, 'runtime.json');
		assert.match(e.missing[0]!.reason, /file not found/);
		assert.equal((e.message.match(/Fix:/g) ?? []).length, 1);
		assert.match(e.message, /copy-assets/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

test('validateDocgenAssets: both bundles missing → ONE throw listing BOTH (not just the first)', async () => {
	const dir = tmpAssetDir({ 'runtime.json': MANIFEST });   // bundles absent
	_setDocgenAssetDirForTests(dir);
	await assert.rejects(() => validateDocgenAssets(), (e: unknown) => {
		assert.ok(e instanceof DocgenAssetValidationError);
		assert.equal(e.missing.length, 2);
		assert.deepEqual(e.missing.map(m => m.componentId).sort(), ['mermaid.min.js', 'svg-pan-zoom.min.js']);
		assert.equal((e.message.match(/Fix:/g) ?? []).length, 1);   // one Fix: for the whole error
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

test("validateDocgenAssets: a whitespace-only bundle → reason 'file is empty'", async () => {
	const dir = tmpAssetDir({ 'runtime.json': MANIFEST, 'mermaid.min.js': '   \n\t ', 'svg-pan-zoom.min.js': 'S' });
	_setDocgenAssetDirForTests(dir);
	await assert.rejects(() => validateDocgenAssets(), (e: unknown) => {
		assert.ok(e instanceof DocgenAssetValidationError);
		const f = e.missing.find(m => m.componentId === 'mermaid.min.js');
		assert.match(f!.reason, /file is empty/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

test('validateDocgenAssets: malformed runtime.json → manifest parse failure, short-circuits the bundle checks', async () => {
	const dir = tmpAssetDir({ 'runtime.json': '{ not valid json', 'mermaid.min.js': 'M', 'svg-pan-zoom.min.js': 'S' });
	_setDocgenAssetDirForTests(dir);
	await assert.rejects(() => validateDocgenAssets(), (e: unknown) => {
		assert.ok(e instanceof DocgenAssetValidationError);
		assert.equal(e.missing.length, 1);                       // short-circuit: only the manifest failure
		assert.equal(e.missing[0]!.componentId, 'runtime.json');
		assert.match(e.missing[0]!.reason, /malformed/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

// ── t4: one-source-of-truth path invariant ──────────────────────────────────

test('DOCGEN_ASSET_DIR is the dir docgenAssetDir()/loadRuntime resolve by default (one source of truth)', () => {
	assert.equal(docgenAssetDir(), DOCGEN_ASSET_DIR);            // no override → the const
	assert.match(DOCGEN_ASSET_DIR, /assets[\\/]docgen$/);
});

// ── t5: integration against the real resolved asset tree ────────────────────

test('integration: validateDocgenAssets passes against the real resolved DOCGEN_ASSET_DIR', async () => {
	await assert.doesNotReject(() => validateDocgenAssets());    // no override → the shipped assets
});

const here = dirname(fileURLToPath(import.meta.url));
const builtDir = join(here, '..', '..', '..', 'out', 'assets', 'docgen');
const builtReady = existsSync(join(builtDir, 'runtime.json'));

test('integration: the built out/assets/docgen stages runtime.json + its referenced bundles, non-empty', { skip: !builtReady }, () => {
	const manifest = JSON.parse(readFileSync(join(builtDir, 'runtime.json'), 'utf8')) as { mermaidAsset: string; svgPanZoomAsset: string };
	const srcDir = join(here, '..', '..', 'assets', 'docgen');   // git-tracked source (installer-clone path)
	for (const asset of [manifest.mermaidAsset, manifest.svgPanZoomAsset]) {
		const built = join(builtDir, asset);
		assert.ok(existsSync(built) && statSync(built).size > 0, `${asset} staged + non-empty under out/`);
		assert.ok(existsSync(join(srcDir, asset)), `${asset} present under git-tracked src/assets/docgen`);
	}
});
