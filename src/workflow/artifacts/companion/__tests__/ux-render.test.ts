/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) unit tests — renderUxCompanion renders the UX mock companion ONLY via
 * docgen's assembleShell render seam (local bundled assets — no generateDocument, no
 * cloud REST; k5). The ok path writes the sibling HTML + returns a `kind:'ux-mock'`
 * CompanionArtifactRef (ac1); a non-ok DocGenOutcome (forced by pointing the docgen
 * asset dir at an empty temp) yields DiagramGenerationError + NO file written.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/ux-render.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderUxCompanion, DiagramGenerationError } from '../render.js';
import type { UxDefinition } from '../ux.js';
import { _setDocgenAssetDirForTests } from '../../../../docgen/render/shell.js';

const ux: UxDefinition = {
	type: 'AdaptiveCard',
	body: [
		{ type: 'TextBlock', text: 'Filter tags' },
		{ type: 'Input.Text', id: 'q', label: 'Query' },
		{ type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'Apply' }] },
	],
};

afterEach(() => { _setDocgenAssetDirForTests(undefined); });   // restore the real docgen assets

test('renderUxCompanion: ok → writes the sibling HTML + returns a ux-mock ref (ac1)', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-companion-'));
	const dest = join(dir, 'ux-mock.html');
	const ref = await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir });
	assert.equal(ref.kind, 'ux-mock');
	assert.equal(ref.title, 'UX mock');
	assert.equal(ref.relPath, 'ux-mock.html');            // repo-relative to the temp repo root
	assert.ok(existsSync(dest), 'the sibling HTML companion was written');
	const html = readFileSync(dest, 'utf8');
	assert.match(html, /<!doctype html>/i);
	assert.ok(html.length > 100);
	rmSync(dir, { recursive: true, force: true });
});

test('renderUxCompanion: ofSectionId is carried onto the ref when supplied', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-companion-'));
	const dest = join(dir, 'ux-mock.html');
	const ref = await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir, ofSectionId: '11-ux' });
	assert.equal(ref.ofSectionId, '11-ux');
	rmSync(dir, { recursive: true, force: true });
});

test('renderUxCompanion: a non-ok DocGenOutcome → DiagramGenerationError + no file written', async () => {
	const emptyAssets = mkdtempSync(join(tmpdir(), 'empty-docgen-assets-'));
	_setDocgenAssetDirForTests(emptyAssets);

	const dir = mkdtempSync(join(tmpdir(), 'ux-companion-'));
	const dest = join(dir, 'ux-mock.html');
	await assert.rejects(() => renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir }), (e: unknown) => {
		assert.ok(e instanceof DiagramGenerationError);
		return true;
	});
	assert.ok(!existsSync(dest), 'nothing is written on a non-ok outcome');

	rmSync(dir, { recursive: true, force: true });
	rmSync(emptyAssets, { recursive: true, force: true });
});
