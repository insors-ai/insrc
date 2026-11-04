/**
 * Epic c2ba6fa6, Story s10, t3 -- document links at the indexer boundary. A
 * real IndexerService over a temporary repository: a link to a stored file is
 * a stored REFERENCES with evidence 'extracted' and no model call; a link to a
 * missing, ignored or unselected file is a 'no-candidate' pending row naming
 * the citing file and repository, and the repository reads complete; a target
 * created later is promoted by the settle's Pass 0 without re-reading the
 * citing document; removing a target re-reads the citing document; the
 * cross-file pass and the SQL by-name return leave document links alone.
 *
 * Run: npx tsx --test src/indexer/__tests__/doc-links-commit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../db/repos.js';
import { entityU64ForId, findEntitiesByFile } from '../../db/entities.js';
import { listUnresolvedRelations } from '../../db/relations.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { readIndexState } from '../../db/index-state.js';
import type { DbClient } from '../../db/client.js';
import type { IndexJob, LLMProvider } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { runCrossFileResolver, sqlReferencesForSettle } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { makeEntityId } from '../parser/base.js';

useTemporaryLance();

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;
let calls = 0;
const provider = new Proxy({}, { get: () => { calls++; return () => { throw new Error('no model call expected'); }; } }) as unknown as LLMProvider;
let store: string;
let repo: string;
let svc: IndexerService;
let queued: IndexJob[];

function write(rel: string, text: string): void {
	mkdirSync(dirname(join(repo, rel)), { recursive: true });
	writeFileSync(join(repo, rel), text);
}
const fileId = (rel: string): string => makeEntityId(repo, join(repo, rel), 'file', join(repo, rel));

async function setUp(files: Record<string, string>): Promise<void> {
	for (const [rel, text] of Object.entries(files)) write(rel, text);
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'pending' });
	const queue = new IndexQueue();
	queued = [];
	const enqueue = queue.enqueue.bind(queue);
	queue.enqueue = (job: IndexJob) => { queued.push(job); enqueue(job); };
	svc = new IndexerService(db, queue, watcher, provider, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'ready' }]);
	queued.length = 0;
}
async function settle(...rels: string[]): Promise<void> {
	await runCrossFileResolver({ db, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'settle', committedFiles: rels.map(r => join(repo, r)) });
}
/** The REFERENCES a document's entities hold as stored edges: target u64 -> evidence. */
async function storedRefs(rel: string): Promise<Map<bigint, string>> {
	const out = new Map<bigint, string>();
	for (const e of await findEntitiesByFile(db, join(repo, rel))) {
		const u64 = await entityU64ForId(e.id);
		if (u64 === undefined) continue;
		for (const n of await outNeighbors(u64, { kindFilter: ['REFERENCES'], withEvidence: true })) out.set(n.u64, n.evidence);
	}
	return out;
}
const pendingOf = async (rel: string) => (await listUnresolvedRelations(db, repo)).filter(r => r.kind === 'REFERENCES' && r.fromFile === join(repo, rel));

test.beforeEach(async () => {
	await closeGraphStore();
	calls = 0;
	store = mkdtempSync(join(tmpdir(), 'insrc-s10-t3-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s10-t3-repo-')));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

test('s10 t3: two linked documents store an extracted REFERENCES with zero provider calls', async () => {
	await setUp({ 'docs/a.md': '# A\nSee [b](b.md).\n', 'docs/b.md': '# B\nText.\n' });
	const target = (await entityU64ForId(fileId('docs/b.md')))!;
	assert.equal((await storedRefs('docs/a.md')).get(target), 'extracted');
	assert.deepEqual(await pendingOf('docs/a.md'), [], 'nothing pending: the target was stored');
	assert.equal(calls, 0, 'no model was reached');

	// A single save, before any settle: the commit itself stores the link, since its target is stored.
	write('docs/c.md', '# C\nAlso [b](b.md).\n');
	await svc.processJob({ kind: 'file', filePath: join(repo, 'docs/c.md'), event: 'create' });
	assert.equal((await storedRefs('docs/c.md')).get(target), 'extracted', 'stored by the commit, not left for Pass 0');
	assert.deepEqual(await pendingOf('docs/c.md'), []);
	assert.equal(calls, 0);
});

test('s10 t3: links to missing, ignored and unselected targets are no-candidate pending rows; repository complete', async () => {
	await setUp({
		'.gitignore': 'ignored/\n',
		'ignored/x.md': '# X\nText.\n',
		'data/big.json': JSON.stringify({ blob: 'x'.repeat(300 * 1024) }),
		'docs/a.md': '# A\nSee [gone](gone.md), [ignored](../ignored/x.md) and [big](../data/big.json). Also README.md.\n',
	});
	const rows = await pendingOf('docs/a.md');
	const byTo = new Map(rows.map(r => [r.rawTo, r.meta]));
	for (const rel of ['docs/gone.md', 'ignored/x.md', 'data/big.json']) {
		const meta = byTo.get(fileId(rel));
		assert.ok(meta, `${rel} is pending`);
		assert.equal(meta['class'], 'no-candidate');
		assert.equal(meta['reason'], 'doc-link-target-absent');
		assert.equal(meta['awaitsId'], true);
		assert.equal(meta['file'], join(repo, 'docs/a.md'));
		assert.equal(meta['repo'], repo);
	}
	assert.equal(byTo.get('README.md')?.['reason'], 'doc-name-ref', 'the name reference is pending too');
	const state = (await readIndexState(repo))!;
	assert.equal(state.unwritable, 0);
	assert.equal(state.pending['awaiting-target'], 0);
	assert.equal(state.graphComplete, true, 'the links do not keep the repository incomplete');
});

test('s10 t3: a target created later is promoted by Pass 0 on settle', async () => {
	await setUp({ 'docs/a.md': '# A\nSee [later](later.md).\n' });
	assert.equal((await pendingOf('docs/a.md')).length, 1);
	write('docs/later.md', '# Later\nText.\n');
	await svc.processJob({ kind: 'file', filePath: join(repo, 'docs/later.md'), event: 'create' });
	await settle('docs/later.md');
	const target = (await entityU64ForId(fileId('docs/later.md')))!;
	assert.equal((await storedRefs('docs/a.md')).get(target), 'extracted', 'promoted with its extracted evidence');
	assert.deepEqual(await pendingOf('docs/a.md'), []);
	assert.ok(!queued.some(j => j.kind === 'file' && j.filePath === join(repo, 'docs/a.md')), 'the citing document was not re-read');
});

test('s10 t3: removing a target re-reads the citing document', async () => {
	await setUp({ 'docs/a.md': '# A\nSee [b](b.md).\n', 'docs/b.md': '# B\nText.\n' });
	unlinkSync(join(repo, 'docs/b.md'));
	await svc.processJob({ kind: 'file', filePath: join(repo, 'docs/b.md'), event: 'delete' });
	assert.ok(queued.some(j => j.kind === 'file' && j.filePath === join(repo, 'docs/a.md')), 'the citing document is queued');
	const returned = (await pendingOf('docs/a.md'))[0]!;
	assert.equal(returned.rawTo, fileId('docs/b.md'));
	assert.notEqual(returned.meta['class'], 'no-candidate', 'before the re-read it awaits the removed file');

	await svc.processJob({ kind: 'file', filePath: join(repo, 'docs/a.md'), event: 'update' });
	await settle('docs/a.md', 'docs/b.md');
	const after = await pendingOf('docs/a.md');
	assert.equal(after.length, 1);
	assert.equal(after[0]!.meta['class'], 'no-candidate', 'the re-read writes it as no-candidate');
	const state = (await readIndexState(repo))!;
	assert.equal(state.pending['awaiting-target'], 0);
	assert.equal(state.graphComplete, true, 'the repository reads complete again');
});

test('s10 t3: Pass 2, the SQL re-check and the SQL by-name return leave doc-link rows alone', async () => {
	await setUp({
		'db/schema.sql': 'CREATE TABLE users (id INT);\n',
		'docs/a.md': '# A\nThe [schema](../db/schema.sql) and README.md and [gone](gone.md).\n',
	});
	const before = (await pendingOf('docs/a.md')).map(r => ({ rawTo: r.rawTo, meta: r.meta })).sort((x, y) => x.rawTo.localeCompare(y.rawTo));
	assert.equal(before.length, 2);
	await runCrossFileResolver({ db, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'repository' });
	await settle('db/schema.sql', 'docs/a.md');
	const after = (await pendingOf('docs/a.md')).map(r => ({ rawTo: r.rawTo, meta: r.meta })).sort((x, y) => x.rawTo.localeCompare(y.rawTo));
	assert.deepEqual(after, before, 'the cross-file passes changed no document-link row');

	// A table whose name meets the document's name reference by the SQL rule ('schema.sql' -> last segment 'sql'):
	// the settle of that SQL file does not select the document's row for re-checking, nor does Pass 2 touch it.
	write('db/more.sql', 'CREATE TABLE sql (id INT);\n');
	await svc.processJob({ kind: 'file', filePath: join(repo, 'db/more.sql'), event: 'create' });
	write('docs/n.md', '# N\nSee schema.sql.\n');
	await svc.processJob({ kind: 'file', filePath: join(repo, 'docs/n.md'), event: 'create' });
	const nameRow = (await pendingOf('docs/n.md'))[0]!;
	assert.equal(nameRow.rawTo, 'schema.sql');
	const selected = await sqlReferencesForSettle({ db, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'settle', committedFiles: [join(repo, 'db/more.sql')] });
	assert.ok(!selected.some(r => r.id === nameRow.id), 'the SQL re-check does not select a document link');
	await settle('db/more.sql');
	assert.deepEqual((await pendingOf('docs/n.md')).map(r => r.meta), [nameRow.meta], 'and the settle leaves it as it was');

	// The SQL file is removed: the document's stored link returns as a plain row awaiting the file id, not by name.
	const schema = (await entityU64ForId(fileId('db/schema.sql')))!;
	assert.equal((await storedRefs('docs/a.md')).get(schema), 'extracted');
	unlinkSync(join(repo, 'db/schema.sql'));
	await svc.processJob({ kind: 'file', filePath: join(repo, 'db/schema.sql'), event: 'delete' });
	const returned = (await pendingOf('docs/a.md')).filter(r => r.rawTo === fileId('db/schema.sql'));
	assert.equal(returned.length, 1, 'one plain row awaiting the file entity');
	assert.equal(returned[0]!.meta['sqlRepend'], undefined, 'not returned by SQL name');
});
