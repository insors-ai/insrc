/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002, a2) — the FORMAT-template loader cascade: the bundled default
 * resolves for every kind, a per-repo override wins, a malformed override
 * degrades to the bundled default (never a silent no-render), and the mtime
 * cache picks up a hot edit.
 *
 * Run: npx tsx --test src/workflow/artifacts/format/__tests__/template-loader.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadDocumentFormat, resolveDocumentFormat, clearFormatCache } from '../template-loader.js';
import { formatToTemplate } from '../template.js';
import { defaultFormat } from '../formats.js';

const KINDS = ['define', 'hld', 'lld', 'plan'] as const;
const tmps: string[] = [];

function tempRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fmt-'));
	tmps.push(dir);
	return dir;
}

function writeRepoOverride(repoRoot: string, kind: (typeof KINDS)[number], text: string): void {
	const dir = join(repoRoot, '.insrc', 'artifacts', 'formats');
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${kind}.md`), text);
}

afterEach(() => {
	clearFormatCache();
	for (const d of tmps.splice(0)) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
});

for (const kind of KINDS) {
	test(`loadDocumentFormat: the bundled default resolves for '${kind}' and equals the in-code default`, () => {
		clearFormatCache();
		const loaded = loadDocumentFormat(kind);
		assert.equal(loaded.layer, 'bundled');
		assert.deepStrictEqual(loaded.format, defaultFormat(kind));
	});
}

test('loadDocumentFormat: a per-repo override WINS over the bundled default', () => {
	const repo = tempRepo();
	// Take the default, rename its summary heading, ship it as a repo override.
	const edited = [
		'<!-- insrc:format v1 kind=lld -->',
		'# LLD: <story id — title>',
		'<!-- insrc:summary id=summary source=body audience=product required -->',
		'## Overview',
		'House-style overview.',
		'<!-- insrc:section id=contract source=body required numbered -->',
		'## Contract details',
		'<!-- insrc:section id=references source=body required numbered -->',
		'## References',
	].join('\n');
	writeRepoOverride(repo, 'lld', edited);
	const loaded = loadDocumentFormat('lld', { repoRoot: repo });
	assert.equal(loaded.layer, 'repo');
	assert.equal(loaded.format.summary.heading, 'Overview');
	assert.equal(loaded.format.sections.length, 2);
});

test('loadDocumentFormat: a MALFORMED repo override degrades to the bundled default', () => {
	const repo = tempRepo();
	writeRepoOverride(repo, 'define', 'this is not a valid format template — no header');
	const loaded = loadDocumentFormat('define', { repoRoot: repo });
	assert.equal(loaded.layer, 'bundled');
	assert.deepStrictEqual(loaded.format, defaultFormat('define'));
});

test('loadDocumentFormat: the mtime cache picks up a hot edit to a repo override', () => {
	const repo = tempRepo();
	writeRepoOverride(repo, 'plan', formatToTemplate(defaultFormat('plan')));
	const first = loadDocumentFormat('plan', { repoRoot: repo });
	assert.equal(first.layer, 'repo');
	assert.equal(first.format.summary.heading, 'Summary');
	// Hot-edit the override with a renamed summary heading; a later stat sees a new mtime.
	const edited = formatToTemplate(defaultFormat('plan')).replace('## Summary', '## Build overview');
	// Ensure a distinct mtime even on coarse-grained filesystems.
	const dir = join(repo, '.insrc', 'artifacts', 'formats');
	writeFileSync(join(dir, 'plan.md'), edited);
	// Bump mtime forward deterministically so the mtime cache invalidates even on
	// coarse-grained filesystems.
	const future = new Date(Date.now() + 5000);
	utimesSync(join(dir, 'plan.md'), future, future);
	const second = loadDocumentFormat('plan', { repoRoot: repo });
	assert.equal(second.format.summary.heading, 'Build overview');
});

test('resolveDocumentFormat: returns the bundled default DocumentFormat for a repo with no override', () => {
	const repo = tempRepo();
	const fmt = resolveDocumentFormat('hld', repo);
	assert.deepStrictEqual(fmt, defaultFormat('hld'));
});

test('resolveDocumentFormat: a repo override flows through to the renderer resolution path', () => {
	const repo = tempRepo();
	writeRepoOverride(repo, 'define', formatToTemplate(defaultFormat('define')).replace('## Problem', '## Background'));
	const fmt = resolveDocumentFormat('define', repo);
	const problem = fmt.sections.find(s => s.id === 'problem');
	assert.equal(problem?.heading, 'Background');
});
