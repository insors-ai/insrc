/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The render bindings: `changeLogBodyLines` renders one bullet per change-log entry, and `[]`
 * for an absent or empty log so the renderer omits the section (absent-safe / byte-identical).
 *
 * Run: npx tsx --test src/workflow/artifacts/format/__tests__/bindings.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { changeLogBodyLines, companionBodyLines, uxCompanionBodyLines } from '../bindings.js';
import type { FileChangeLog } from '../../provenance/types.js';
import type { CompanionArtifactRef } from '../../companion/types.js';

// ---------------------------------------------------------------------------
// S002 (provenance) t4 — changeLogBodyLines
// ---------------------------------------------------------------------------

test('changeLogBodyLines: absent → []', () => {
	assert.deepEqual(changeLogBodyLines(undefined), []);
});

test('changeLogBodyLines: empty → []', () => {
	assert.deepEqual(changeLogBodyLines([]), []);
});

test('changeLogBodyLines: present → one bullet per entry with target file/author/timestamp (+ optional segment + summary)', () => {
	const cl: FileChangeLog = [
		{ target: { file: 'src/a.ts', version: 'abc123' }, author: 'insrc-build', timestamp: '2026-09-28T00:00:00Z' },
		{ target: { file: 'src/b.ts', segment: { startLine: 10, endLine: 20 } }, author: 'insrc-build', timestamp: '2026-09-28T01:00:00Z', summary: 'refactor loop' },
	];
	const lines = changeLogBodyLines(cl);
	assert.equal(lines.length, 2);
	// first entry: file-level (no segment), author + timestamp, no summary suffix.
	assert.match(lines[0]!, /`src\/a\.ts`/);
	assert.match(lines[0]!, /\*\*insrc-build\*\*/);
	assert.match(lines[0]!, /2026-09-28T00:00:00Z/);
	assert.match(lines[0]!, /\)$/);   // no summary → the bullet ends at the timestamp paren
	// second entry: line segment + summary suffix.
	assert.match(lines[1]!, /`src\/b\.ts:10-20`/);
	assert.match(lines[1]!, /refactor loop/);
});

// ---------------------------------------------------------------------------
// ISSUE-a3d8c9e9f195e620 — companion link targets resolve from the artifact's
// own directory (the companion is a sibling file), never the repo-relative
// relPath, which 404s from the .md's directory.
// ---------------------------------------------------------------------------

test('companionBodyLines: a repo-relative relPath links ./<file name> — the sibling companion, not the repo-relative path', () => {
	const companions: readonly CompanionArtifactRef[] = [
		{ kind: 'diagram-mermaid', relPath: 'docs/epics/x/component-dependency.html', title: 'Component dependencies' },
		{ kind: 'diagram-mermaid', relPath: 'docs/standalone/y/S001/er-model.html', title: 'ER model' },
		{ kind: 'ux-mock', relPath: 'docs/standalone/y/S001/ux-mock.html', title: 'UX mock' }, // filtered out of this slot
	];
	assert.deepEqual(companionBodyLines(companions), [
		'- [Component dependencies](./component-dependency.html)',
		'- [ER model](./er-model.html)',
	]);
});

test('companionBodyLines: the section suffix is preserved on the sibling-relative link', () => {
	const companions: readonly CompanionArtifactRef[] = [{ kind: 'diagram-html', relPath: 'docs/x/S001/seq.html', title: 'Sequence diagram', ofSectionId: '7-interactions' }];
	assert.deepEqual(companionBodyLines(companions), ['- [Sequence diagram](./seq.html) (§ 7-interactions)']);
});

test('uxCompanionBodyLines: the UX mock links its sibling file too', () => {
	const companions: readonly CompanionArtifactRef[] = [
		{ kind: 'ux-mock', relPath: 'docs/standalone/y/S001/ux-mock.html', title: 'UX mock' },
		{ kind: 'diagram-mermaid', relPath: 'docs/standalone/y/S001/er-model.html', title: 'ER model' }, // filtered out of this slot
	];
	assert.deepEqual(uxCompanionBodyLines(companions), ['- [UX mock](./ux-mock.html)']);
});
