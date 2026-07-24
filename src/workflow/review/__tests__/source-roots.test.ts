/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for resolveSourceRoots (LLD S001) — derives a repo's real
 * top-level code roots from the indexed graph, with a repo-root fallback.
 * Pure: the graph reader is dependency-injected, so no daemon / LMDB.
 *
 * Run: npx tsx --test src/workflow/review/__tests__/source-roots.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { resolveSourceRoots, rootPrefix, type SourceRoot } from '../source-roots.js';
import type { Entity, EntityKind } from '../../../shared/types.js';

const REPO = '/tmp/fake-repo';

/** Minimal Entity stub — only kind + file matter to resolveSourceRoots. */
function ent(kind: EntityKind, relFile: string): Entity {
	return {
		id: 'x', kind, name: 'n', language: 'typescript', repoId: 1, repo: REPO,
		file: join(REPO, relFile), startLine: 1, endLine: 2, body: '', embedding: [],
		indexedAt: '1970-01-01T00:00:00.000Z',
	} as Entity;
}

/** A reader that returns a fixed entity list (ignores repoPath). */
const reader = (entities: readonly Entity[]) => async () => entities;

const paths = (r: SourceRoot[]): string[] => r.map(x => x.path);

// ---------------------------------------------------------------------------

test('mind/-only layout → single mind root, fallbackUsed=false (the core AFM bug)', async () => {
	const out = await resolveSourceRoots(REPO, {
		listEntities: reader([ent('file', 'mind/a.ts'), ent('file', 'mind/sub/b.ts')]),
	});
	assert.deepEqual(paths(out.roots), [join(REPO, 'mind')]);
	assert.equal(out.roots[0]!.fileCount, 2);
	assert.equal(out.fallbackUsed, false);
});

test('src/-only layout → single src root, no regression', async () => {
	const out = await resolveSourceRoots(REPO, {
		listEntities: reader([ent('file', 'src/a.ts'), ent('file', 'src/b.ts')]),
	});
	assert.deepEqual(paths(out.roots), [join(REPO, 'src')]);
	assert.equal(out.fallbackUsed, false);
});

test('multi-root src/+mind/ → one root each, densest-first by fileCount', async () => {
	const out = await resolveSourceRoots(REPO, {
		listEntities: reader([
			ent('file', 'src/a.ts'),
			ent('file', 'mind/a.ts'), ent('file', 'mind/b.ts'), ent('file', 'mind/c.ts'),
		]),
	});
	// mind (3) is denser than src (1) → mind first
	assert.deepEqual(paths(out.roots), [join(REPO, 'mind'), join(REPO, 'src')]);
	assert.equal(out.roots[0]!.fileCount, 3);
	assert.equal(out.roots[1]!.fileCount, 1);
	assert.equal(out.fallbackUsed, false);
});

test('all files at repo root → single repoPath root, fallbackUsed=false', async () => {
	const out = await resolveSourceRoots(REPO, {
		listEntities: reader([ent('file', 'index.ts'), ent('file', 'README.md')]),
	});
	assert.deepEqual(paths(out.roots), [REPO]);
	assert.equal(out.roots[0]!.fileCount, 2);
	assert.equal(out.fallbackUsed, false);
});

test('mixed root-level + subdir files → collapse to repoPath (subsumes subdirs)', async () => {
	const out = await resolveSourceRoots(REPO, {
		listEntities: reader([ent('file', 'index.ts'), ent('file', 'src/a.ts')]),
	});
	assert.deepEqual(paths(out.roots), [REPO]);
	assert.equal(out.fallbackUsed, false);
});

test('non-file entities are ignored when bucketing', async () => {
	const out = await resolveSourceRoots(REPO, {
		listEntities: reader([
			ent('file', 'mind/a.ts'),
			ent('function', 'src/b.ts'),   // not kind==='file' → ignored
			ent('class', 'lib/c.ts'),      // ignored
		]),
	});
	assert.deepEqual(paths(out.roots), [join(REPO, 'mind')]);
	assert.equal(out.roots[0]!.fileCount, 1);
	assert.equal(out.fallbackUsed, false);
});

test('empty graph (zero entities) → repo-root fallback, fallbackUsed=true', async () => {
	const out = await resolveSourceRoots(REPO, { listEntities: reader([]) });
	assert.deepEqual(paths(out.roots), [REPO]);
	assert.equal(out.roots[0]!.fileCount, 0);
	assert.equal(out.fallbackUsed, true);
});

test('graph with only non-file entities → repo-root fallback (no file roots)', async () => {
	const out = await resolveSourceRoots(REPO, {
		listEntities: reader([ent('function', 'src/a.ts'), ent('class', 'src/b.ts')]),
	});
	assert.deepEqual(paths(out.roots), [REPO]);
	assert.equal(out.fallbackUsed, true);
});

test('a rejecting graph reader → repo-root fallback, never throws', async () => {
	const out = await resolveSourceRoots(REPO, {
		listEntities: async () => { throw new Error('LMDB read error'); },
	});
	assert.deepEqual(paths(out.roots), [REPO]);
	assert.equal(out.roots[0]!.fileCount, 0);
	assert.equal(out.fallbackUsed, true);
});

// ---------------------------------------------------------------------------
// rootPrefix — the per-root match re-prefix (replaces the fixed 'src/')
// ---------------------------------------------------------------------------

test('rootPrefix: subdir root → its segment; repo root → empty', () => {
	assert.equal(rootPrefix(REPO, { path: join(REPO, 'src'), fileCount: 1 }), 'src');
	assert.equal(rootPrefix(REPO, { path: join(REPO, 'mind'), fileCount: 1 }), 'mind');
	assert.equal(rootPrefix(REPO, { path: REPO, fileCount: 0 }), '');
});
