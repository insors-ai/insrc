/**
 * Epic c2ba6fa6, Story s10, t5 -- the read of document relationships. The
 * switch (switchOf); name references resolved at read, so indexing order and a
 * later second file of the name decide the answer; model proposals returned
 * only while the switch is on and the row and its endpoints are eligible, with
 * older generations counted; the search.doc_relations request (registered,
 * session class, refused while the repository is indexed); and caller/callee
 * and closure reads unchanged by proposals.
 *
 * Run: npx tsx --test src/db/__tests__/doc-relations-read.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';
import { addRepo, lookupRepoId, updateRepoStatus } from '../repos.js';
import { findEntitiesByFile } from '../entities.js';
import { findCallees, findCallers, closureEntities } from '../search.js';
import {
	documentRelations,
	fileEntityHashInTxn,
	switchOf,
	writeDocRelationQualityInTxn,
	writeDocRelationRowInTxn,
	type DocRelationQualityRow,
} from '../doc-relations.js';
import { getGraphStore } from '../graph/store.js';
import { readIndexState } from '../index-state.js';
import type { DbClient } from '../client.js';
import type { Entity } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../../indexer/watcher.js';
import { IndexerService } from '../../indexer/index.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import { searchDocRelations } from '../../daemon/doc-relations-rpc.js';
import { SearchRefusedError } from '../../daemon/search-guard.js';
import { methodClasses } from '../../daemon/threads/method-class.js';

useTemporaryLance();

const db = null as unknown as DbClient;
const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
let store: string;
let repo: string;
let svc: IndexerService;

const write = (rel: string, text: string): void => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), text); };
const fileId = (rel: string): string => makeEntityId(repo, join(repo, rel), 'file', join(repo, rel));
const section = async (rel: string, name: string): Promise<Entity> => (await findEntitiesByFile(db, join(repo, rel))).find(e => e.kind === 'section' && e.name === name)!;
const fileJob = (rel: string, event: 'create' | 'update' | 'delete' = 'create') => svc.processJob({ kind: 'file', filePath: join(repo, rel), event });

async function setUp(files: Record<string, string>): Promise<void> {
	for (const [rel, text] of Object.entries(files)) write(rel, text);
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'pending' });
	svc = new IndexerService(db, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'ready' }]);
}

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s10-t5-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s10-t5-repo-')));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

const figures = (over: Partial<NonNullable<DocRelationQualityRow['figures']>> = {}): DocRelationQualityRow => ({
	figures: { checked: 100, proposed: 50, right: 48, found: 60, precision: 0.96, recall: 0.6, extractedRecovery: 1, modelId: 'm1', setHash: 'h1', measuredAt: '2026-11-04T00:00:00.000Z', ...over },
	extraction: { state: 'ok', examined: 1, failed: 0, updatedAt: '2026-11-04T00:00:00.000Z' },
});

test('s10 t5: switchOf on only at the bar with matching model and set hash', () => {
	assert.equal(switchOf(undefined, 'm1', 'h1'), 'not-measured');
	assert.equal(switchOf({ extraction: figures().extraction }, 'm1', 'h1'), 'not-measured', 'no figures');
	assert.equal(switchOf(figures(), 'm1', 'h1'), 'on', 'exactly at the bar');
	assert.equal(switchOf(figures({ checked: 99 }), 'm1', 'h1'), 'off', 'fewer than 100 implied links');
	assert.equal(switchOf(figures({ precision: 0.949 }), 'm1', 'h1'), 'off');
	assert.equal(switchOf(figures({ recall: 0.599 }), 'm1', 'h1'), 'off');
	assert.equal(switchOf(figures(), 'm2', 'h1'), 'off', 'measured for another model');
	assert.equal(switchOf(figures(), undefined, 'h1'), 'off', 'no model runs now');
	assert.equal(switchOf(figures(), 'm1', 'h2'), 'off', 'the set changed since');
	assert.equal(switchOf(figures(), 'm1', undefined), 'off', 'the set is gone');
});

test('s10 t5: name references resolve across full-index order and stop on a second same-named file', async () => {
	// The citing document is indexed before README.md exists.
	await setUp({ 'docs/guide.md': '# Guide\nRead README.md first.\n' });
	const src = await section('docs/guide.md', 'Guide');
	const sw = { state: 'not-measured' as const };
	assert.deepEqual((await documentRelations(src.id, 'out', sw)).rows, [], 'no file of the name yet');

	write('README.md', '# Readme\nText.\n');
	await fileJob('README.md');
	assert.deepEqual((await documentRelations(src.id, 'out', sw)).rows, [{ from: src.id, to: fileId('README.md'), kind: 'REFERENCES', evidence: 'extracted' }], 'resolved once the file is stored, with no re-read');
	assert.deepEqual((await documentRelations(fileId('README.md'), 'in', sw)).rows.map(r => r.from), [src.id], 'and from the cited side');

	write('docs/README.md', '# Other readme\nText.\n');
	await fileJob('docs/README.md');
	assert.deepEqual((await documentRelations(src.id, 'out', sw)).rows, [], 'two files of the name: no link stands');
	assert.deepEqual((await documentRelations(fileId('README.md'), 'in', sw)).rows, []);

	// One full index with both sides present, whatever order the walk commits them in: each of two documents
	// names the other, so one of the two is always committed before the file it names; a code file named by
	// its file name resolves too (its file entity is named by its path).
	rmSync(join(repo, 'docs/README.md'));
	write('docs/alpha.md', '# Alpha\nSee omega.md and `queue.ts`.\n');
	write('docs/omega.md', '# Omega\nSee alpha.md.\n');
	write('src/queue.ts', 'export function enqueue(): void {}\n');
	await svc.processJob({ kind: 'full', repoPath: repo });
	const alpha = await section('docs/alpha.md', 'Alpha');
	const omega = await section('docs/omega.md', 'Omega');
	assert.deepEqual((await documentRelations(alpha.id, 'out', sw)).rows.map(r => r.to).sort(), [fileId('docs/omega.md'), fileId('src/queue.ts')].sort());
	assert.deepEqual((await documentRelations(omega.id, 'out', sw)).rows.map(r => r.to), [fileId('docs/alpha.md')]);
	assert.deepEqual((await documentRelations(fileId('src/queue.ts'), 'in', sw)).rows.map(r => r.from), [alpha.id]);

	// A document that names itself is no link, from either side (as for a path reference to itself).
	write('docs/self.md', '# Self\nEdit self.md to change this.\n');
	await fileJob('docs/self.md');
	const self = await section('docs/self.md', 'Self');
	assert.deepEqual((await documentRelations(self.id, 'out', sw)).rows, [], 'a document naming itself links nothing');
	assert.deepEqual((await documentRelations(fileId('docs/self.md'), 'in', sw)).rows, [], 'nor is it cited by itself');

	// A second file of a name present in the same full index: no link stands.
	write('lib/queue.ts', 'export function other(): void {}\n');
	await svc.processJob({ kind: 'full', repoPath: repo });
	const alpha2 = await section('docs/alpha.md', 'Alpha');
	assert.deepEqual((await documentRelations(alpha2.id, 'out', sw)).rows.map(r => r.to), [fileId('docs/omega.md')]);
});

test("s10 t5: proposals read as 'model' only while on and eligible; older generations counted as stale", async () => {
	await setUp({ 'docs/a.md': '# A\nThe parser.\n', 'src/p.ts': 'export function parse(): void {}\n', 'src/q.ts': 'export function q(): void {}\n' });
	const src = await section('docs/a.md', 'A');
	const s = await getGraphStore();
	const repoId = (await lookupRepoId(repo))!;
	const generation = (await readIndexState(repo))!.generation;
	const hash = fileEntityHashInTxn(s, repo, 'docs/a.md')!;
	const proposals = [
		{ from: src.id, to: fileId('src/p.ts'), rationale: 'names the parser' },
		{ from: src.id, to: 'not-a-stored-entity', rationale: 'a vanished target' },
	];
	await withWriteTxn(t => {
		writeDocRelationRowInTxn(t, repoId, 'docs/a.md', { contentHash: hash, modelId: 'm1', computedAtGeneration: generation - 1, proposals });
		writeDocRelationQualityInTxn(t, repoId, figures());
	});
	const on = { state: 'on' as const, modelId: 'm1' };

	const read = await documentRelations(src.id, 'out', on);
	assert.deepEqual(read.rows, [{ from: src.id, to: fileId('src/p.ts'), kind: 'REFERENCES', evidence: 'model', computedAtGeneration: generation - 1 }], 'only the proposal with stored endpoints');
	assert.equal(read.generation, generation);
	assert.equal(read.staleProposals, 1, 'computed at an older generation');
	assert.deepEqual((await documentRelations(fileId('src/p.ts'), 'in', on)).rows.map(r => r.evidence), ['model'], 'and from the target side');

	assert.deepEqual((await documentRelations(src.id, 'out', { state: 'off', modelId: 'm1' })).rows, [], 'off: no proposal');
	assert.deepEqual((await documentRelations(src.id, 'out', { state: 'not-measured' })).rows, []);
	assert.deepEqual((await documentRelations(src.id, 'out', { state: 'on', modelId: 'm2' })).rows, [], 'computed by another model');
	await withWriteTxn(t => writeDocRelationRowInTxn(t, repoId, 'docs/a.md', { contentHash: 'old-hash', modelId: 'm1', computedAtGeneration: generation, proposals }));
	assert.deepEqual((await documentRelations(src.id, 'out', on)).rows, [], 'the document changed since');
	await withWriteTxn(t => writeDocRelationRowInTxn(t, repoId, 'docs/a.md', { contentHash: hash, modelId: 'm1', computedAtGeneration: generation, proposals }));
	const fresh = await documentRelations(src.id, 'out', on);
	assert.equal(fresh.rows.length, 1);
	assert.equal(fresh.staleProposals, 0, 'computed at the current generation');
});

test('s10 t5: search.doc_relations registered, session-class, refused while indexing', async () => {
	assert.equal(methodClasses.classOf('search.doc_relations'), 'session');
	const runtime = readFileSync(new URL('../../daemon/handler-runtime.ts', import.meta.url), 'utf8');
	assert.match(runtime, /'search\.doc_relations': async \(params\) => searchDocRelations\(params\)/);

	await setUp({ 'docs/a.md': '# A\nSee [b](b.md).\n', 'docs/b.md': '# B\nText.\n' });
	const src = await section('docs/a.md', 'A');
	const answered = await searchDocRelations({ entityId: src.id, direction: 'out' });
	assert.deepEqual(answered.rows.map(r => [r.to, r.evidence]), [[fileId('docs/b.md'), 'extracted']]);

	await updateRepoStatus(null, repo, 'indexing');
	await assert.rejects(
		searchDocRelations({ entityId: src.id, direction: 'out' }, { indexRun: () => ({ repoPath: repo, startedAt: Date.now(), filesSelected: 10, filesDone: 3 }) }),
		(err: unknown) => err instanceof SearchRefusedError && /^repo-indexing: /.test(err.message) && /3/.test(err.message) && /10/.test(err.message),
	);
	await assert.rejects(searchDocRelations({ entityId: src.id, direction: 'sideways' }), /direction must be 'out' or 'in'/);
});

test('s10 t5: callers, callees and closure are unchanged by proposals', async () => {
	await setUp({
		'docs/a.md': '# A\nThe parser.\n',
		'src/p.ts': "import { q } from './q.js';\nexport function parse(): void { q(); }\n",
		'src/q.ts': 'export function q(): void {}\n',
	});
	const parse = (await findEntitiesByFile(db, join(repo, 'src/p.ts'))).find(e => e.name === 'parse')!;
	const q = (await findEntitiesByFile(db, join(repo, 'src/q.ts'))).find(e => e.name === 'q')!;
	const src = await section('docs/a.md', 'A');
	const ids = (es: readonly { id: string }[]) => es.map(e => e.id).sort();
	const before = { callers: ids(await findCallers(db, q.id)), callees: ids(await findCallees(db, parse.id)), closure: ids(await closureEntities(db, [parse.id], {})) };
	assert.ok(before.callers.includes(parse.id) && before.callees.includes(q.id) && before.closure.length > 0, 'the reads have something to compare');

	const s = await getGraphStore();
	const repoId = (await lookupRepoId(repo))!;
	await withWriteTxn(t => {
		writeDocRelationRowInTxn(t, repoId, 'docs/a.md', {
			contentHash: fileEntityHashInTxn(s, repo, 'docs/a.md')!, modelId: 'm1', computedAtGeneration: 1,
			proposals: [{ from: src.id, to: parse.id, rationale: 'r' }, { from: src.id, to: q.id, rationale: 'r' }],
		});
		writeDocRelationQualityInTxn(t, repoId, figures());
	});
	assert.equal((await documentRelations(src.id, 'out', { state: 'on', modelId: 'm1' })).rows.length, 2, 'the proposals are readable');
	assert.deepEqual({ callers: ids(await findCallers(db, q.id)), callees: ids(await findCallees(db, parse.id)), closure: ids(await closureEntities(db, [parse.id], {})) }, before);
	assert.ok(!(await findCallers(db, parse.id)).some(e => e.id === src.id), 'a proposal is never a caller');
});
