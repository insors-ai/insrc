/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) unit tests — renderUxCompanion writes the UX mock companion and returns
 * a `kind:'ux-mock'` CompanionArtifactRef (ac1), which the core markdown LINKS.
 *
 * MIGRATED by ISSUE-85e6a58693579b6d / S001 t3. These tests used to describe the
 * companion going through docgen's assembleShell seam, and the non-ok-DocGenOutcome
 * case that produced DiagramGenerationError. The companion no longer uses that seam:
 * a card renders through its own pure layout emitter, so that failure mode is
 * unreachable by design rather than merely untested. The assertions that described
 * the old PIPELINE have moved; the ones that assert the companion CONTRACT have not.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/ux-render.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderUxCompanion } from '../render.js';
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

test('renderUxCompanion: the render path has NO failure mode — the old DiagramGenerationError is unreachable', async () => {
	// MIGRATED (t3). This test used to force a non-ok DocGenOutcome by pointing the
	// docgen asset dir at an empty temp, and assert DiagramGenerationError. That path
	// ran through assembleShell, which the companion no longer uses. Emptying the
	// docgen assets now changes NOTHING, because the emitter needs none of them — and
	// that is the property worth pinning: the mock cannot fail to render for want of a
	// diagram runtime.
	const emptyAssets = mkdtempSync(join(tmpdir(), 'empty-docgen-assets-'));
	_setDocgenAssetDirForTests(emptyAssets);

	const dir = mkdtempSync(join(tmpdir(), 'ux-companion-'));
	const dest = join(dir, 'ux-mock.html');
	const ref = await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir });

	assert.equal(ref.kind, 'ux-mock', 'the ref contract is unchanged');
	assert.ok(existsSync(dest), 'the file is written even with no docgen assets present');
	const html = readFileSync(dest, 'utf8');
	assert.ok(html.length > 0 && html.includes('<!DOCTYPE html>'), 'a complete document is produced');

	rmSync(emptyAssets, { recursive: true, force: true });
	rmSync(dir, { recursive: true, force: true });
});

test('t2: renderUxCompanion still stamps kind:\'ux-mock\' — the ref contract no consumer may notice changing', async () => {
	// The approved ISSUE's triage signal claimed this function "stamps a diagram
	// kind". It never did. Pinning it here turns a fact that had to be re-read off
	// render.ts by hand into one the suite defends, so the wrong claim cannot
	// quietly become true later.
	const dir = mkdtempSync(join(tmpdir(), 'ux-kind-'));
	const dest = join(dir, 'ux-mock.html');
	const ref = await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir, ofSectionId: '8-ux' });

	assert.equal(ref.kind, 'ux-mock');
	assert.equal(ref.title, 'UX mock');
	assert.equal(ref.ofSectionId, '8-ux', 'placement is carried through unchanged');
	assert.ok(!ref.relPath.startsWith('/'), 'relPath stays repo-relative');
	rmSync(dir, { recursive: true, force: true });
});

test('t2: the written companion carries NO diagram runtime and fetches nothing', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-offline-'));
	const dest = join(dir, 'ux-mock.html');
	await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir });
	const html = readFileSync(dest, 'utf8');

	// The whole point of shedding assembleShell: the mock needs no graph runtime.
	assert.doesNotMatch(html, /mermaid/i, 'no mermaid runtime is inlined');
	assert.doesNotMatch(html, /svg-pan-zoom/i, 'no svg-pan-zoom runtime is inlined');
	assert.doesNotMatch(html, /<script/i, 'rendering is build-time — no script at all');
	assert.doesNotMatch(html, /https?:\/\//, 'no remote origin is referenced');
	// and dramatically smaller than the ~3.37MB the diagram path produced
	assert.ok(html.length < 100_000, `expected a small document, got ${html.length} bytes`);
	rmSync(dir, { recursive: true, force: true });
});

test('t2: DETERMINISM — rendering the same definition twice produces byte-identical files', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-det-'));
	const a = join(dir, 'a.html'); const b = join(dir, 'b.html');
	await renderUxCompanion(ux, 'UX mock', a, { repoPath: dir });
	await renderUxCompanion(ux, 'UX mock', b, { repoPath: dir });
	assert.equal(readFileSync(a, 'utf8'), readFileSync(b, 'utf8'));
	rmSync(dir, { recursive: true, force: true });
});

test('t2: the narrated prose appears ALONGSIDE the mock, not instead of it', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-prose-'));
	const dest = join(dir, 'ux-mock.html');
	await renderUxCompanion(ux, 'UX mock', dest, { repoPath: dir });
	const html = readFileSync(dest, 'utf8');

	assert.ok(html.includes('ux-card'), 'the rendered mock is present');
	assert.ok(html.includes('Purpose') && html.includes('Legend'), 'the narrated sections survive');
	assert.ok(html.indexOf('ux-card') < html.indexOf('ux-notes'), 'the prose accompanies the mock, below it');
	rmSync(dir, { recursive: true, force: true });
});

test('t2: an EMPTY card body still yields an openable document with the prose', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ux-empty-'));
	const dest = join(dir, 'ux-mock.html');
	await renderUxCompanion({ type: 'AdaptiveCard', body: [] }, 'UX mock', dest, { repoPath: dir });
	const html = readFileSync(dest, 'utf8');

	assert.ok(html.includes('<!DOCTYPE html>'), 'not a blank file');
	assert.ok(html.includes('Purpose') && html.includes('Legend'), 'the prose contract holds for an empty card');
	rmSync(dir, { recursive: true, force: true });
});

