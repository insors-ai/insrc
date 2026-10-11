/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * renderUxCompanion writes the UX mock page in the shared companion shell
 * (LLD-d9f85b3c S001/t8): the card inside the pan/zoom view panel with numbered
 * markers, and a key-elements table. The ref contract (kind 'ux-mock', relPath,
 * ofSectionId) is unchanged, and the page needs no diagram runtime.
 *
 * Run: npx tsx --test src/workflow/artifacts/companion/__tests__/ux-render.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderUxCompanion } from '../render.js';
import type { UxDefinition } from '../ux.js';
import type { CompanionHeader } from '../types.js';
import { _setDocgenAssetDirForTests } from '../../../../docgen/render/shell.js';

const ux: UxDefinition = {
	type: 'AdaptiveCard',
	body: [
		{ type: 'TextBlock', text: 'Filter tags' },
		{ type: 'Input.Text', id: 'q', label: 'Query' },
		{ type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'Apply' }] },
	],
};

const header: CompanionHeader = {
	projectName: 'insrc', workItemId: 'E20261011abcdef01:S001', sourceDoc: { id: 'LLD-abcdef0123456789-S001', href: './LLD.md' },
	date: '2026-10-11 14:32', user: 'Subho Ghosh', contextLine: 'Standalone story S001',
};

afterEach(() => { _setDocgenAssetDirForTests(undefined); });   // restore the real docgen assets

test('renderUxCompanion: ok → writes the sibling HTML + returns a ux-mock ref (ac1)', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-companion-'));
	const dest = join(dir, 'ux-mock.html');
	const ref = await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir, header });
	assert.equal(ref.kind, 'ux-mock');
	assert.equal(ref.title, 'UX mock');
	assert.equal(ref.relPath, 'ux-mock.html');            // repo-relative to the temp repo root
	assert.ok(existsSync(dest), 'the sibling HTML companion was written');
	const html = readFileSync(dest, 'utf8');
	assert.match(html, /<!doctype html>/i);
	assert.ok(html.includes('<span class="kind">UX mock</span>'));
	rmSync(dir, { recursive: true, force: true });
});

test('renderUxCompanion: ofSectionId is carried onto the ref when supplied', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-companion-'));
	const dest = join(dir, 'ux-mock.html');
	const ref = await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir, ofSectionId: '11-ux', header });
	assert.equal(ref.ofSectionId, '11-ux');
	assert.ok(!ref.relPath.startsWith('/'), 'relPath stays repo-relative');
	rmSync(dir, { recursive: true, force: true });
});

test('renderUxCompanion: needs no diagram runtime — it renders with the docgen (Mermaid) assets absent', async () => {
	const emptyAssets = mkdtempSync(join(tmpdir(), 'empty-docgen-assets-'));
	_setDocgenAssetDirForTests(emptyAssets);
	const dir = mkdtempSync(join(tmpdir(), 'ux-companion-'));
	const dest = join(dir, 'ux-mock.html');
	const ref = await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir, header });
	assert.equal(ref.kind, 'ux-mock');
	assert.ok(existsSync(dest), 'the file is written even with no docgen assets present');
	rmSync(emptyAssets, { recursive: true, force: true });
	rmSync(dir, { recursive: true, force: true });
});

test('renderUxCompanion: the page inlines only the pan/zoom runtime and references nothing remote', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-offline-'));
	const dest = join(dir, 'ux-mock.html');
	await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir, header });
	const html = readFileSync(dest, 'utf8');
	assert.doesNotMatch(html, /mermaid\.(initialize|run)\(|mermaidAPI/, 'no mermaid runtime is inlined or called');
	assert.doesNotMatch(html, /svg-pan-zoom/i, 'no svg-pan-zoom runtime is inlined');
	assert.match(html, /window\.insrcPanZoom\.init\(/, 'the shared pan/zoom runtime is');
	assert.doesNotMatch(html, /https?:\/\//, 'no remote origin is referenced');
	assert.doesNotMatch(html, /<(script|link|img)[^>]+(src|href)=/i, 'nothing is loaded from elsewhere');
	assert.ok(html.length < 100_000, `expected a small document, got ${html.length} bytes`);
	rmSync(dir, { recursive: true, force: true });
});

test('renderUxCompanion: DETERMINISM — rendering the same definition twice produces byte-identical files', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-det-'));
	const a = join(dir, 'a.html'); const b = join(dir, 'b.html');
	await renderUxCompanion(ux, 'UX mock', a, { repoPath: dir, header });
	await renderUxCompanion(ux, 'UX mock', b, { repoPath: dir, header });
	assert.equal(readFileSync(a, 'utf8'), readFileSync(b, 'utf8'));
	rmSync(dir, { recursive: true, force: true });
});

test('renderUxCompanion: the key-elements table accompanies the mock, below it, numbered like its markers', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-prose-'));
	const dest = join(dir, 'ux-mock.html');
	await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir, header });
	const html = readFileSync(dest, 'utf8');
	assert.ok(html.indexOf('<div class="ux-card">') < html.indexOf('<h2>Description</h2>'));
	assert.ok(html.includes('<span class="ux-pin">2</span>Query'), 'the input carries marker 2');
	assert.ok(html.includes('<tr><td><span class="pin">2</span></td><td>Query</td><td>Input.Text</td><td>q</td><td class="missing">—</td></tr>'));
	rmSync(dir, { recursive: true, force: true });
});

test('renderUxCompanion: an EMPTY card body still yields an openable page', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-empty-'));
	const dest = join(dir, 'ux-mock.html');
	await renderUxCompanion({ type: 'AdaptiveCard', body: [] }, 'UX mock', dest, { repoPath: dir, header });
	const html = readFileSync(dest, 'utf8');
	assert.match(html, /<!doctype html>/i, 'not a blank file');
	assert.ok(html.includes('<div class="ux-card"></div>'));
	assert.ok(html.includes('0 key elements.'));
	rmSync(dir, { recursive: true, force: true });
});
