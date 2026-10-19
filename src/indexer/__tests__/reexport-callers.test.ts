/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t9 (ac3) — calls through re-exports resolve. A re-export
 * line is stored as an EXPORTS edge (empty value) plus an export_names entry,
 * and the call matcher reads export_names: `export { f } from`, an alias
 * (`export { f as g } from`, so g() is a call of f), a barrel of a barrel and
 * `export *`. A re-export cycle ends with the name 'no-candidate', and an
 * export_names entry whose target is not stored is ignored.
 *
 * The real full index (parser, resolver, cross-file pass) over a temporary
 * store; no embedding backend is set, so no model runs.
 *
 * Run: npx tsx --test src/indexer/__tests__/reexport-callers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { encodeOutEdgeKey, RELATION_KIND_BYTE } from '../../db/graph/keys.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../db/repos.js';
import { findCallers } from '../../db/search.js';
import { entityU64ForId } from '../../db/entities.js';
import { listExportNames, putExportNameInTxn } from '../../db/export-names.js';
import { listUnresolvedRelations } from '../../db/relations.js';
import type { DbClient } from '../../db/client.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { makeEntityId } from '../parser/base.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';

useTemporaryLance();

let store: string;
let repo: string;

const FILES: Record<string, string> = {
	'b.ts':      'export function f(): number { return 1; }\n',
	'index.ts':  "export { f } from './b.js';\nexport { f as g } from './b.js';\n",
	'outer.ts':  "export * from './index.js';\n",
	'star.ts':   "export * from './b.js';\n",
	'c.ts':      "import { f, g } from './index.js';\nexport function useF(): number { return f(); }\nexport function useG(): number { return g(); }\n",
	'd.ts':      "import { f } from './outer.js';\nexport function viaOuter(): number { return f(); }\n",
	'e.ts':      "import { f } from './star.js';\nexport function viaStar(): number { return f(); }\n",
	'cyc1.ts':   "export { h } from './cyc2.js';\n",
	'cyc2.ts':   "export { h } from './cyc1.js';\n",
	'x.ts':      "import { h } from './cyc1.js';\nexport function useH(): number { return h(); }\n",
	'star1.ts':  "export * from './star2.js';\n",
	'star2.ts':  "export * from './star1.js';\n",
	'w.ts':      "import { w } from './star1.js';\nexport function useW(): number { return w(); }\n",
};

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s1t9-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s1t9-repo-')));
	mkdirSync(join(repo, 'src'));
	for (const [f, text] of Object.entries(FILES)) writeFileSync(join(repo, 'src', f), text);
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-10-18T00:00:00.000Z', status: 'pending' });
	const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
	await new IndexerService(null as unknown as DbClient, new IndexQueue(), watcher, undefined, 600_000).processJob({ kind: 'full', repoPath: repo });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

const src = (f: string): string => join(repo, 'src', f);
const fileId = (f: string): string => makeEntityId(repo, src(f), 'file', src(f));
const fnId = (f: string, name: string): string => makeEntityId(repo, src(f), 'function', name);
const callerNames = async (id: string): Promise<string[]> => (await findCallers(null, id)).map(e => e.name).sort();

test('ac3: calls through `export { f } from`, an aliased re-export (g() is a call of f), a barrel of a barrel and `export *` resolve to f; a re-export cycle (named or `export *`) ends with the name no-candidate', async () => {
	assert.deepEqual(await callerNames(fnId('b.ts', 'f')), ['useF', 'useG', 'viaOuter', 'viaStar']);

	const useH = (await listUnresolvedRelations(null, repo)).find(r => r.kind === 'CALLS' && r.rawTo === 'h');
	assert.equal(useH?.meta['class'], 'no-candidate', 'the call through the cycle');
	const useW = (await listUnresolvedRelations(null, repo)).find(r => r.kind === 'CALLS' && r.rawTo === 'w');
	assert.equal(useW?.meta['class'], 'no-candidate', 'the call through an `export *` cycle terminates');
	const cycle = (await listUnresolvedRelations(null, repo)).filter(r => r.kind === 'EXPORTS');
	assert.deepEqual(cycle.map(r => [r.fromFile.slice(repo.length + 1), r.meta['class']]).sort(), [['src/cyc1.ts', 'no-candidate'], ['src/cyc2.ts', 'no-candidate']],
		'only the cycle\'s re-exports stay pending');
});

test('the stored EXPORTS edge value is empty and export_names holds (barrel, g) -> f and the star entries', async () => {
	const s = await getGraphStore();
	const indexU64 = (await entityU64ForId(fileId('index.ts')))!, fU64 = (await entityU64ForId(fnId('b.ts', 'f')))!;
	const value = s.outEdge.get(encodeOutEdgeKey(indexU64, RELATION_KIND_BYTE.EXPORTS, fU64)) as Buffer | undefined;
	assert.ok(value !== undefined, 'index.ts EXPORTS f is an edge');
	assert.equal(value.length, 0, 'with an empty value');

	const names = await listExportNames();
	assert.deepEqual([...(names.get(fileId('index.ts'))?.get('g') ?? [])], [fnId('b.ts', 'f')]);
	assert.deepEqual([...(names.get(fileId('index.ts'))?.get('f') ?? [])], [fnId('b.ts', 'f')]);
	assert.deepEqual([...(names.get(fileId('outer.ts'))?.get('*') ?? [])], [fileId('index.ts')]);
	assert.deepEqual([...(names.get(fileId('star.ts'))?.get('*') ?? [])], [fileId('b.ts')]);
});

test('an export_names entry pointing at a target that is not stored is ignored by the call matcher', async () => {
	// A stale entry beside the real one for g, and a stale-only name z on the same barrel.
	const indexU64 = (await entityU64ForId(fileId('index.ts')))!;
	await withWriteTxn(s => {
		putExportNameInTxn(s, indexU64, 'g', 'deleted-target-0000000000000000');
		putExportNameInTxn(s, indexU64, 'z', 'deleted-target-0000000000000001');
	});
	writeFileSync(src('y.ts'), "import { g, z } from './index.js';\nexport function useBoth(): number { return g() + z(); }\n");
	const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
	await new IndexerService(null as unknown as DbClient, new IndexQueue(), watcher, undefined, 600_000).processJob({ kind: 'full', repoPath: repo });
	await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots: detectSourceRoots(repo) });

	assert.ok((await callerNames(fnId('b.ts', 'f'))).includes('useBoth'), 'g() still resolves to f, the stale entry ignored');
	const z = (await listUnresolvedRelations(null, repo)).find(r => r.kind === 'CALLS' && r.rawTo === 'z');
	assert.equal(z?.meta['class'], 'no-candidate', 'z() matches nothing: its only entry is stale');
});
