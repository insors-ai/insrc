/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure-logic service + formatter tests (no ink, no daemon).
 *
 * Run: npx tsx --test src/cli/__tests__/services.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listEpics } from '../services/workflow.js';
import { formatBytes, formatUptime, formatWhen } from '../ui/format.js';

// ---------------------------------------------------------------------------
// listEpics
// ---------------------------------------------------------------------------

function seedEpic(repo: string, hash: string, slug?: string): void {
	const dir = join(repo, '.insrc/artifacts');
	mkdirSync(dir, { recursive: true });
	const meta = slug !== undefined ? { epicSlug: slug } : {};
	writeFileSync(join(dir, `DEF-${hash}.json`), JSON.stringify({ meta }));
}

test('listEpics returns [] when there is no artifacts dir', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-epics-'));
	try { assert.deepEqual(listEpics(repo), []); }
	finally { rmSync(repo, { recursive: true, force: true }); }
});

test('listEpics scans DEF-<hash>.json and reads the display slug', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-epics-'));
	try {
		seedEpic(repo, 'a3f4b8c9d1e2f3a4', 'add-tag-filter');
		seedEpic(repo, 'b1c2d3e4f5a6b7c8');                       // no slug
		// noise that must be ignored:
		const dir = join(repo, '.insrc/artifacts');
		writeFileSync(join(dir, 'HLD-a3f4b8c9d1e2f3a4.json'), '{}');
		writeFileSync(join(dir, 'DEF-nothex.json'), '{}');

		const epics = listEpics(repo);
		assert.equal(epics.length, 2);
		const byHash = Object.fromEntries(epics.map(e => [e.epicHash, e.epicSlug]));
		assert.equal(byHash['a3f4b8c9d1e2f3a4'], 'add-tag-filter');
		assert.equal(byHash['b1c2d3e4f5a6b7c8'], undefined);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// formatters
// ---------------------------------------------------------------------------

test('formatBytes scales units', () => {
	assert.equal(formatBytes(0), '0 B');
	assert.equal(formatBytes(512), '512 B');
	assert.equal(formatBytes(2048), '2.0 KiB');
	assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MiB');
});

test('formatUptime is h/m/s aware', () => {
	assert.equal(formatUptime(45), '45s');
	assert.equal(formatUptime(125), '2m 5s');
	assert.equal(formatUptime(3661), '1h 1m');
});

test('formatWhen handles empty + invalid', () => {
	assert.equal(formatWhen(undefined), 'never');
	assert.equal(formatWhen(''), 'never');
	assert.equal(formatWhen('not-a-date'), 'not-a-date');
});
