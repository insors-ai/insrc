/**
 * Epic c2ba6fa6, Story s9, t5 -- a C caller resolves to a C++ header
 * declaration. Real files on disk, read by the real C and C++ readers,
 * resolved by the per-file resolver, written to a real temporary store and
 * settled by the real cross-file pass: main.c includes util.h (read as
 * 'cpp') and calls the function the header declares; the call links to it
 * through the family rule ('inferred'), a static header function's too --
 * every including file compiles its own copy.
 *
 * Run: npx tsx --test src/indexer/__tests__/c-calls-cpp-header.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { upsertEntities } from '../../db/entities.js';
import { upsertRelations } from '../../db/relations.js';
import { findCallees } from '../../db/search.js';
import { addRepo } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import { getParser } from '../parser/registry.js';
import { resolveRelations } from '../resolver.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { makeEntityId } from '../parser/base.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import '../parser/c.js';
import '../parser/cpp.js';

useTemporaryLance();

let dir: string;
let repo: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s9-c-cpp-')));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = join(dir, 'repo');
	mkdirSync(join(repo, 'src'), { recursive: true });
	await addRepo(null, { path: repo, name: 'c-cpp', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

/** Read, resolve and store one file as the indexer does. */
async function index(rel: string, source: string): Promise<void> {
	const file = join(repo, rel);
	writeFileSync(file, source);
	const parsed = getParser(file)!.parse(file, source, repo, 1);
	await upsertEntities(null, parsed.entities);
	await upsertRelations(null, resolveRelations(parsed.relations, file, repo, parsed.entities));
}

test('s9 t5: a C caller of a function declared in an included .h header resolves to it across files through the family rule', async () => {
	await index('src/util.h', 'int util_add(int a, int b);\nstatic int util_private(void);\n');
	await index('src/main.c', '#include "util.h"\nint main(void) { util_private(); return util_add(1, 2); }\n');

	await runCrossFileResolver({ db: null as unknown as DbClient, repoRoot: repo, sourceRoots: detectSourceRoots(repo) });

	const main = makeEntityId(repo, join(repo, 'src/main.c'), 'function', 'main');
	const callees = await findCallees(null, main);
	assert.deepEqual(callees.map(e => `${e.name} (${e.language}): ${e.evidence}`).sort(), ['util_add (cpp): inferred', 'util_private (cpp): inferred']);
	assert.ok(callees.every(e => e.file === join(repo, 'src/util.h')));
});
