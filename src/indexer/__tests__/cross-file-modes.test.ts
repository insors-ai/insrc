/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t8 — the cross-file pass's modes and the class of every row.
 *
 *   - a settle (after file edits) completes the rows awaiting an entity of the
 *     files it committed, and classes the committed files' own rows;
 *   - a row awaiting a file that is not stored is classed by the full index's
 *     own selection rule (not code / excluded by the ignore rule / not stored);
 *   - the pass after an index clean-up ('repository' mode) sets neither
 *     fullIndexFinished nor the classes only a full index sets.
 *
 * Real indexer, parser, resolver and cross-file pass over a temporary store; no
 * embedding backend is set, so no model runs.
 *
 * Run: npx tsx --test src/indexer/__tests__/cross-file-modes.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { updateIndexStateRowInTxn } from '../../db/graph/index-state-rows.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import { upsertEntities, entityU64ForId } from '../../db/entities.js';
import { listUnresolvedRelations, upsertRelations, type UnresolvedRelation } from '../../db/relations.js';
import { completenessOf, readIndexState } from '../../db/index-state.js';
import { outNeighbors } from '../../db/graph/edges.js';
import type { DbClient } from '../../db/client.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { makeEntityId } from '../parser/base.js';
import { typescriptParser } from '../parser/typescript.js';
import { resolveRelations } from '../resolver.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';

useTemporaryLance();

let store: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s1t8-modes-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s1t8-modes-repo-')));
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-10-18T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

function write(rel: string, text: string): string {
	const abs = join(repo, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, text, 'utf8');
	return abs;
}

const fileId = (abs: string): string => makeEntityId(repo, abs, 'file', abs);

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;

/** The indexer with a short settle window, and the clean-up pass exposed. */
class Svc extends IndexerService {
	constructor() { super(null as unknown as DbClient, new IndexQueue(), watcher, undefined, 20); }
	reconcilePass(): Promise<void> { return this.resolveAfterReconcile(repo); }
}

/** An indexer that knows the fixture repository (its queue is not started, so no job runs on its own). */
async function service(): Promise<Svc> {
	const svc = new Svc();
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-10-18T00:00:00.000Z', status: 'ready' }]);
	return svc;
}

/** An edit as the watcher reports it: the file job, then the settle that follows. */
async function edit(svc: Svc, abs: string, settled: () => Promise<boolean>): Promise<void> {
	await svc.processJob({ kind: 'file', filePath: abs, event: 'update' });
	for (let i = 0; i < 300; i++) {
		if (svc._armedSettleTimersForTest() === 0 && await settled()) return;
		await new Promise(r => setTimeout(r, 10));
	}
	assert.fail(`the settle after editing ${abs} did not reach the expected state`);
}

/** The per-file steps of the indexer without the settle (parse, write, per-file resolve). */
async function indexOnly(abs: string): Promise<void> {
	const repoId = (await lookupRepoId(repo))!;
	const r = typescriptParser.parse(abs, readFileSync(abs, 'utf8'), repo, repoId);
	await upsertEntities(null, r.entities);
	await upsertRelations(null, resolveRelations(r.relations, abs, repo, r.entities));
}

async function markFullIndexFinished(finished: boolean): Promise<void> {
	const repoId = (await lookupRepoId(repo))!;
	await withWriteTxn(s => { updateIndexStateRowInTxn(s, repoId, row => { row.fullIndexFinished = finished; }); });
}

const rows = (): Promise<UnresolvedRelation[]> => listUnresolvedRelations(null, repo);
const awaitingFile = async (abs: string): Promise<UnresolvedRelation | undefined> => (await rows()).find(r => r.rawTo === fileId(abs));
const classOf = (r: UnresolvedRelation | undefined) => r === undefined ? undefined : { class: r.meta['class'], reason: r.meta['reason'] };

test('a settle that commits an awaited target promotes the rows awaiting it', async () => {
	const a = write('src/a.ts', "import { fn } from './b.js';\nexport function run(): number { return fn(); }\n");
	const b = write('src/b.ts', 'export function fn(): number { return 1; }\n');
	const svc = await service();

	// a.ts is indexed while b.ts is not stored: its import waits for b.ts's file id.
	await edit(svc, a, async () => (await awaitingFile(b)) !== undefined);
	assert.equal((await awaitingFile(b))?.meta['awaitsId'], true);

	// b.ts is committed: the settle completes a.ts's import.
	await edit(svc, b, async () => (await awaitingFile(b)) === undefined);
	const aU64 = (await entityU64ForId(fileId(a)))!, bU64 = (await entityU64ForId(fileId(b)))!;
	assert.ok((await outNeighbors(aU64, { kindFilter: ['IMPORTS'] })).includes(bU64), 'a.ts IMPORTS b.ts is an edge');
});

test('a settle classes the rows of an edit that adds a call to JSON.parse, a call to a library function and an import of ./logo.png, and a complete repository stays complete', async () => {
	write('assets/logo.png', 'png');
	const svc = await service();
	await markFullIndexFinished(true);
	assert.equal(completenessOf(await readIndexState(repo)).complete, true, 'complete before the edit');

	const a = write('src/a.ts', [
		"import logo from '../assets/logo.png';",
		'export function show(s: string): unknown { return [JSON.parse(s), lodashMap([1]), logo]; }',
		'',
	].join('\n'));
	const logo = join(repo, 'assets', 'logo.png');
	await edit(svc, a, async () => classOf(await awaitingFile(logo))?.class === 'no-candidate');

	assert.deepEqual(classOf(await awaitingFile(logo)), { class: 'no-candidate', reason: 'target-not-code' });
	const calls = (await rows()).filter(r => r.kind === 'CALLS');
	assert.deepEqual(calls.map(r => ({ rawTo: r.rawTo, ...classOf(r) })), [{ rawTo: 'lodashMap', class: 'no-candidate', reason: 'no-match' }],
		'the library call is no-candidate; the parser records no call to JSON.parse (a built-in)');
	const after = completenessOf(await readIndexState(repo));
	assert.equal(after.complete, true, `still complete: ${after.reasons.join('; ')}`);
});

test('the pass after an index clean-up changes neither fullIndexFinished nor the classes only a full index sets', async () => {
	write('assets/logo.png', 'png');
	write('src/c.ts', 'export const c = 1;\n');
	const a = write('src/a.ts', "import logo from '../assets/logo.png';\nimport { c } from './c.js';\nexport const v = [logo, c];\n");
	await indexOnly(a);
	// An unresolved IMPORTS no pass attempts: classed only by a full index.
	await upsertRelations(null, [{ kind: 'IMPORTS', from: fileId(a), to: 'virtual:module', resolved: false, meta: { file: a, repo } }]);

	for (const finished of [false, true]) {
		await markFullIndexFinished(finished);
		const before = (await rows()).map(r => ({ id: r.id, ...classOf(r) }));
		await new Svc().reconcilePass();
		assert.equal((await readIndexState(repo))?.fullIndexFinished, finished, `fullIndexFinished stays ${finished}`);
		assert.deepEqual((await rows()).map(r => ({ id: r.id, ...classOf(r) })), before, 'no file-target or unattempted class is set');
	}
	assert.equal((await rows()).length, 3, 'the logo import, the c.ts import and the virtual import are still pending');
});

test('after a full index, rows awaiting a file are classed by the selection rule: not code is no-candidate, an ignored source file and a source file not stored stay awaiting with their reason', async () => {
	write('assets/logo.png', 'png');
	write('vendor/lib.min.js', 'var a=1;');
	write('data/big.json', `{"a":"${'x'.repeat(256 * 1024 + 1)}"}`);
	write('build/gen.ts', 'export const g = 1;\n');
	write('src/c.ts', 'export const c = 1;\n');
	const a = write('src/a.ts', [
		"import logo from '../assets/logo.png';",
		"import lib from '../vendor/lib.min.js';",
		"import big from '../data/big.json';",
		"import { g } from '../build/gen.js';",
		"import { c } from './c.js';",
		"import { m } from './missing.js';",
		'export const v = [logo, lib, big, g, c, m];',
		'',
	].join('\n'));
	await indexOnly(a);
	await upsertRelations(null, [{ kind: 'IMPORTS', from: fileId(a), to: 'virtual:module', resolved: false, meta: { file: a, repo } }]);

	await runCrossFileResolver({ db: null, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'full' });

	const at = (rel: string) => awaitingFile(join(repo, rel)).then(classOf);
	assert.deepEqual(await at('assets/logo.png'),   { class: 'no-candidate', reason: 'target-not-code' });
	assert.deepEqual(await at('vendor/lib.min.js'), { class: 'no-candidate', reason: 'target-not-code' });
	assert.deepEqual(await at('data/big.json'),     { class: 'no-candidate', reason: 'target-not-code' });
	assert.deepEqual(await at('build/gen.ts'),      { class: 'awaiting-target', reason: 'target-excluded-by-ignore' });
	assert.deepEqual(await at('src/c.ts'),          { class: 'awaiting-target', reason: 'target-not-committed' });
	const missing = (await rows()).find(r => r.rawTo === './missing.js');
	assert.deepEqual(classOf(missing), { class: 'no-candidate', reason: 'target-file-missing' });
	const virtual = (await rows()).find(r => r.rawTo === 'virtual:module');
	assert.deepEqual(classOf(virtual), { class: 'no-candidate', reason: 'not-attempted' });

	const state = await readIndexState(repo);
	assert.deepEqual(state?.reasonCounts.awaiting, { 'target-excluded-by-ignore': 1, 'target-not-committed': 1 });
	assert.equal(state?.pending['no-candidate'], 5);
});
