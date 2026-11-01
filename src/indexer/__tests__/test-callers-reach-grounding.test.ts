/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-bd1c6c90 S001/t4 — a TypeScript test file reaches the code-review
 * grounding end to end.
 *
 * The fixture's only call is inside a `test('...', () => { ... })` callback.
 * Its files go through the indexer's own steps (the real parser, the per-file
 * resolver, the store writes) and the real cross-file resolver over a temporary
 * graph store; the code-review grounding then reads that store with its real
 * graph deps. No caller edge is supplied by the fixture.
 *
 * Run: npx tsx --test src/indexer/__tests__/test-callers-reach-grounding.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { upsertEntities } from '../../db/entities.js';
import { upsertRelations } from '../../db/relations.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import { typescriptParser } from '../parser/typescript.js';
import { resolveRelations } from '../resolver.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { listEntitiesForRepo } from '../../db/entities.js';
import { findCallers } from '../../db/search.js';

useTemporaryLance();

let dir: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-test-callers-store-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-test-callers-repo-')));
	mkdirSync(join(repo, 'src', '__tests__'), { recursive: true });
	writeFileSync(join(repo, 'src', 'lib.ts'), 'export function add(a: number, b: number): number { return a + b; }\n');
	writeFileSync(join(repo, 'src', '__tests__', 'lib.test.ts'), [
		"import { test } from 'node:test';",
		"import { add } from '../lib.js';",
		'',
		"test('adds', () => {",
		'  add(1, 2);',
		'});',
		'',
	].join('\n'));
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-10-17T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

/** The indexer's per-file steps (IndexerService.indexFile), without the embedding. */
async function indexFile(file: string): Promise<void> {
	const repoId = (await lookupRepoId(repo))!;
	const result = typescriptParser.parse(file, readFileSync(file, 'utf8'), repo, repoId);
	await upsertEntities(null, result.entities);
	await upsertRelations(null, resolveRelations(result.relations, file, repo, result.entities));
}

test('a test callback calling an imported function retains its graph caller', async () => {
 const lib = join(repo, 'src', 'lib.ts');
 const testFile = join(repo, 'src', '__tests__', 'lib.test.ts');
 await indexFile(lib);
 await indexFile(testFile);
 const result = await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots: detectSourceRoots(repo) });
 assert.ok(result.resolved >= 1);
 const add = (await listEntitiesForRepo(null, repo)).find(e => e.name === 'add');
 assert.ok(add);
 assert.deepEqual((await findCallers(null, add.id)).map(c => c.name), [testFile]);
});
