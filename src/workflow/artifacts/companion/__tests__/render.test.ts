/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * renderErCompanion renders the ER companion page in the shared companion shell
 * (LLD-d9f85b3c S001/t8) from local bundled assets — no generateDocument, no
 * Python, no cloud REST. The ok path writes the sibling HTML + returns a
 * diagram-mermaid CompanionArtifactRef; a missing runtime asset (forced by
 * pointing the docgen asset dir, where Mermaid lives, at an empty temp) yields
 * DiagramGenerationError + NO file written.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/render.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderErCompanion, DiagramGenerationError } from '../render.js';
import type { ErDefinition } from '../er.js';
import type { CompanionHeader } from '../types.js';
import { _setDocgenAssetDirForTests } from '../../../../docgen/render/shell.js';

const er: ErDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
};

const header: CompanionHeader = {
	projectName: 'insrc', workItemId: 'E20261011abcdef01:S001', sourceDoc: { id: 'LLD-abcdef0123456789-S001', href: './LLD.md' },
	date: '2026-10-11 14:32', user: 'Subho Ghosh', contextLine: 'Standalone story S001',
};

afterEach(() => { _setDocgenAssetDirForTests(undefined); });   // restore the real docgen assets

test('renderErCompanion: ok → writes the sibling HTML + returns a diagram-mermaid ref (ac2/ac4)', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'er-companion-'));
	const dest = join(dir, 'er-model.html');
	const ref = await renderErCompanion(er, 'ER model', dest, { repoPath: dir, header });
	assert.equal(ref.kind, 'diagram-mermaid');
	assert.equal(ref.title, 'ER model');
	assert.equal(ref.relPath, 'er-model.html');            // repo-relative to the temp repo root
	assert.ok(existsSync(dest), 'the sibling HTML companion was written');
	const html = readFileSync(dest, 'utf8');
	assert.match(html, /<!doctype html>/i);
	assert.ok(html.includes('<tr><th>Source doc</th><td><a href="./LLD.md">LLD-abcdef0123456789-S001</a></td></tr>'), 'the shell header');
	assert.ok(html.includes('<pre class="mermaid">erDiagram'), 'an erDiagram, not a classDiagram');
	assert.ok(html.includes('<h3>Entities</h3>'));
	rmSync(dir, { recursive: true, force: true });
});

test('renderErCompanion: ofSectionId is carried onto the ref when supplied', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'er-companion-'));
	const dest = join(dir, 'er-model.html');
	const ref = await renderErCompanion(er, 'ER model', dest, { repoPath: dir, ofSectionId: '4-data-model-changes', header });
	assert.equal(ref.ofSectionId, '4-data-model-changes');
	rmSync(dir, { recursive: true, force: true });
});

test('renderErCompanion: a non-ok DocGenOutcome → DiagramGenerationError + no file written', async () => {
	// Point the docgen asset dir at an empty temp → loadRuntime fails →
	// assembleShell returns fallback-unavailable (a non-ok outcome).
	const emptyAssets = mkdtempSync(join(tmpdir(), 'empty-docgen-assets-'));
	_setDocgenAssetDirForTests(emptyAssets);

	const dir = mkdtempSync(join(tmpdir(), 'er-companion-'));
	const dest = join(dir, 'er-model.html');
	await assert.rejects(() => renderErCompanion(er, 'ER model', dest, { repoPath: dir, header }), (e: unknown) => {
		assert.ok(e instanceof DiagramGenerationError);
		return true;
	});
	assert.ok(!existsSync(dest), 'nothing is written on a non-ok outcome');

	rmSync(dir, { recursive: true, force: true });
	rmSync(emptyAssets, { recursive: true, force: true });
});
