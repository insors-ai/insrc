/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E20260929e2c6705f:S003 t3 — renderSequenceCompanion / renderComponentCompanion
 * render their companion ONLY via docgen's assembleShell render seam (no Python, no
 * cloud REST; k5). The ok path writes the sibling HTML + returns a diagram-mermaid
 * CompanionArtifactRef; a non-ok DocGenOutcome (forced by pointing the docgen asset
 * dir at an empty temp) yields DiagramGenerationError + NO file written.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/diagram-render.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderSequenceCompanion, renderComponentCompanion, DiagramGenerationError } from '../render.js';
import type { SequenceDefinition } from '../sequence.js';
import type { ComponentDependencyDefinition } from '../component.js';
import { _setDocgenAssetDirForTests } from '../../../../docgen/render/shell.js';

const seq: SequenceDefinition = {
	participants: [{ id: 'A', label: 'Client' }, { id: 'B', label: 'Server' }],
	messages: [{ from: 'A', to: 'B', label: 'request' }, { from: 'B', to: 'A', label: 'response', kind: 'return' }],
};
const comp: ComponentDependencyDefinition = {
	components: [{ id: 'api' }, { id: 'db' }],
	dependencies: [{ from: 'api', to: 'db' }],
};

afterEach(() => { _setDocgenAssetDirForTests(undefined); });   // restore the real docgen assets

test('renderSequenceCompanion: ok → writes the sibling HTML + returns a diagram-mermaid ref', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'seq-companion-'));
	const dest = join(dir, 'sequence-diagram.html');
	const ref = await renderSequenceCompanion(seq, 'Sequence diagram', dest, { repoPath: dir, ofSectionId: '2-contract-details' });
	assert.equal(ref.kind, 'diagram-mermaid');
	assert.equal(ref.title, 'Sequence diagram');
	assert.equal(ref.relPath, 'sequence-diagram.html');
	assert.equal(ref.ofSectionId, '2-contract-details');
	assert.ok(existsSync(dest));
	assert.match(readFileSync(dest, 'utf8'), /<!doctype html>/i);
	rmSync(dir, { recursive: true, force: true });
});

test('renderComponentCompanion: ok → writes the sibling HTML + returns a diagram-mermaid ref', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'comp-companion-'));
	const dest = join(dir, 'component-dependency.html');
	const ref = await renderComponentCompanion(comp, 'Component dependencies', dest, { repoPath: dir });
	assert.equal(ref.kind, 'diagram-mermaid');
	assert.equal(ref.relPath, 'component-dependency.html');
	assert.ok(existsSync(dest));
	rmSync(dir, { recursive: true, force: true });
});

test('renderSequenceCompanion: a non-ok DocGenOutcome → DiagramGenerationError + no file written', async () => {
	const emptyAssets = mkdtempSync(join(tmpdir(), 'empty-docgen-assets-'));
	_setDocgenAssetDirForTests(emptyAssets);
	const dir = mkdtempSync(join(tmpdir(), 'seq-companion-'));
	const dest = join(dir, 'sequence-diagram.html');
	await assert.rejects(() => renderSequenceCompanion(seq, 'Sequence diagram', dest, { repoPath: dir }), (e: unknown) => {
		assert.ok(e instanceof DiagramGenerationError);
		return true;
	});
	assert.ok(!existsSync(dest), 'nothing is written on a non-ok outcome');
	rmSync(dir, { recursive: true, force: true });
	rmSync(emptyAssets, { recursive: true, force: true });
});

test('renderComponentCompanion: a non-ok DocGenOutcome → DiagramGenerationError + no file written', async () => {
	const emptyAssets = mkdtempSync(join(tmpdir(), 'empty-docgen-assets-'));
	_setDocgenAssetDirForTests(emptyAssets);
	const dir = mkdtempSync(join(tmpdir(), 'comp-companion-'));
	const dest = join(dir, 'component-dependency.html');
	await assert.rejects(() => renderComponentCompanion(comp, 'Component dependencies', dest, { repoPath: dir }), (e: unknown) => {
		assert.ok(e instanceof DiagramGenerationError);
		return true;
	});
	assert.ok(!existsSync(dest));
	rmSync(dir, { recursive: true, force: true });
	rmSync(emptyAssets, { recursive: true, force: true });
});
