/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration test for the review probe's source-root fix (LLD S001).
 *
 * The core AFM bug: the probe used to grep `join(repoPath, 'src')`, so a repo
 * whose code lives under `mind/` (or anywhere but `src/`) returned ZERO hits
 * and produced a false BLOCK. `gatherEvidence` now derives real roots from
 * the graph and, for an un-indexed temp repo, falls back to the repo root —
 * so the mind/ file is found and correctly prefixed.
 *
 * Run: npx tsx --test src/workflow/review/__tests__/probe-source-roots.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { gatherEvidence } from '../probe.js';
import type { Claim } from '../types.js';

function withRepo(layoutDir: string, fn: (repo: string) => Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-probe-'));
	mkdirSync(join(repo, layoutDir), { recursive: true });
	writeFileSync(join(repo, layoutDir, 'widget.ts'), 'export const UNIQUE_TOKEN_XYZ = 1;\n');
	return fn(repo).finally(() => rmSync(repo, { recursive: true, force: true }));
}

const claim = (greps: string[]): Claim[] => [
	{ id: 'c1', kind: 'citation', text: 't', anchors: [], probe: { greps, reads: [] } } as Claim,
];

const allMatches = (ev: Awaited<ReturnType<typeof gatherEvidence>>): string[] =>
	ev[0]!.grepResults.flatMap(g => g.matches);

test('code under mind/ (the AFM bug) → probe finds real hits, prefixed with mind/', async () => {
	await withRepo('mind', async repo => {
		const ev = await gatherEvidence(claim(['UNIQUE_TOKEN_XYZ']), repo);
		const matches = allMatches(ev);
		assert.ok(matches.length > 0, 'expected a real grep hit for code under mind/, got none (the false-BLOCK bug)');
		assert.ok(
			matches.some(m => m.includes('mind/widget.ts')),
			`expected a match anchored under mind/, got: ${JSON.stringify(matches)}`,
		);
	});
});

test('code under src/ (legacy layout) → still found, prefixed with src/ (no regression)', async () => {
	await withRepo('src', async repo => {
		const ev = await gatherEvidence(claim(['UNIQUE_TOKEN_XYZ']), repo);
		const matches = allMatches(ev);
		assert.ok(matches.length > 0, 'expected a real grep hit for code under src/');
		assert.ok(
			matches.some(m => m.includes('src/widget.ts')),
			`expected a match anchored under src/, got: ${JSON.stringify(matches)}`,
		);
	});
});

test('a filename-existence probe finds a file under a non-src/ root', async () => {
	await withRepo('mind', async repo => {
		// A pattern naming a file that exists on disk but appears in no body
		// (a literal filename token, as claims cite them — not a regex-escaped one).
		const ev = await gatherEvidence(claim(['widget.ts']), repo);
		const matches = allMatches(ev);
		assert.ok(
			matches.some(m => m.includes('FILE EXISTS') && m.includes('mind/widget.ts')),
			`expected a FILE EXISTS note for mind/widget.ts, got: ${JSON.stringify(matches)}`,
		);
	});
});
