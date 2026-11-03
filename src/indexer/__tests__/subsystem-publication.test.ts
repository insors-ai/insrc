/**
 * ISSUE-7d42b5dc S001 t3 -- the subsystem pass publishes in one guarded
 * transaction. A TypeScript repository indexed by the real IndexerService:
 * a fault inside the publication transaction leaves the groups, the
 * contribution rows and the changed-file record exactly as they were (read
 * back after reopening the store) and the next pass converges; an edge written
 * while the pass runs keeps its record entry; a pass held across a full index
 * publishes nothing, and the next (full) pass drops the file that vanished.
 *
 * Run: npx tsx --test src/indexer/__tests__/subsystem-publication.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import { findEntitiesByFile } from '../../db/entities.js';
import { upsertRelations } from '../../db/relations.js';
import { readSubsystems } from '../../db/subsystems.js';
import { readChangedFilesInTxn, readContributionsInTxn } from '../../db/subsystem-changes.js';
import type { DbClient } from '../../db/client.js';
import type { LLMProvider } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { _forgetFullPassesForTest, runSubsystemPass, type SubsystemPassDeps } from '../subsystem-pass.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';

useTemporaryLance();

const FILES: Record<string, string> = {
	'src/parse/lexer.ts':  "import { token } from './tokens.js';\nexport function lex(s: string): string[] { return [token(s)]; }\n",
	'src/parse/tokens.ts': "export function token(s: string): string { return s; }\n",
	'src/store/rows.ts':   "import { lex } from '../parse/lexer.js';\nexport function row(s: string): string { return lex(s)[0]!; }\n",
	'src/store/limits.ts': "export function maxRows(): number { return 100; }\n",
};

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;
const provider = { capabilities: {}, async completeStructured<T>(): Promise<T> { return { summary: 'a summary' } as T; } } as unknown as LLMProvider;
let store: string;
let repo: string;
let repoId: number;
let svc: IndexerService;

test.beforeEach(async () => {
	await closeGraphStore();
	_forgetFullPassesForTest();
	store = mkdtempSync(join(tmpdir(), 'insrc-7d42-pub-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-7d42-pub-repo-')));
	for (const [f, text] of Object.entries(FILES)) {
		mkdirSync(dirname(join(repo, f)), { recursive: true });
		writeFileSync(join(repo, f), text);
	}
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-03T00:00:00.000Z', status: 'pending' });
	repoId = (await lookupRepoId(repo))!;
	svc = new IndexerService(db, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-11-03T00:00:00.000Z', status: 'ready' }]);
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

async function edit(rel: string, text: string): Promise<void> {
	const abs = join(repo, rel);
	writeFileSync(abs, text);
	await svc.processJob({ kind: 'file', filePath: abs, event: 'update' });
	await runCrossFileResolver({ db, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'settle', committedFiles: [abs] });
}
const pass = (deps: SubsystemPassDeps = {}) => runSubsystemPass({ db, repoPath: repo, provider, ...deps });
/** Groups (without summaries), contribution rows and the record's files. */
async function snapshot() {
	const s = await getGraphStore();
	const subs = await readSubsystems(repo);
	return {
		generation: subs.computedAtGeneration,
		groups: subs.subsystems.map(({ summary: _s, ...g }) => g).sort((a, b) => a.id.localeCompare(b.id)),
		rows: Object.fromEntries([...readContributionsInTxn(s, repoId)].sort(([a], [b]) => a.localeCompare(b))),
		record: readChangedFilesInTxn(s, repoId).map(c => c.file).sort(),
	};
}
async function equalsForcedFull(label: string): Promise<void> {
	const { record: _r, ...now } = await snapshot();
	_forgetFullPassesForTest();
	assert.equal((await pass()).mode, 'full');
	const { record: _r2, ...full } = await snapshot();
	assert.deepEqual(now, full, label);
}
const CALLS_ROW = "import { row } from './rows.js';\nexport function maxRows(): number { return row('x').length; }\n";

test('S001 t3: a fault in the publication transaction changes nothing, and the next pass converges', async () => {
	await pass();
	await edit('src/store/limits.ts', CALLS_ROW);
	const before = await snapshot();
	assert.deepEqual(before.record, ['src/store/limits.ts']);

	await assert.rejects(pass({ inPublish: () => { throw new Error('the publication fails'); } }), /the publication fails/);
	// Rollback evidence is read after reopening the store.
	await closeGraphStore();
	setGraphStorePath(join(store, 'graph.lmdb'));
	assert.deepEqual(await snapshot(), before, 'groups, rows and record are as they were');

	assert.equal((await pass()).mode, 'incremental');
	assert.deepEqual((await snapshot()).record, []);
	await equalsForcedFull('the next pass converges to the full pass');
});

test('S001 t3: an edge written while the pass runs keeps its record entry', async () => {
	await pass();
	await edit('src/store/limits.ts', CALLS_ROW);
	const read = readChangedFilesInTxn(await getGraphStore(), repoId);
	const [maxRows] = (await findEntitiesByFile(db, join(repo, 'src/store/limits.ts'))).filter(e => e.name === 'maxRows');
	const [token] = (await findEntitiesByFile(db, join(repo, 'src/parse/tokens.ts'))).filter(e => e.name === 'token');

	// While the pass has computed but not yet published, limits.ts gains an edge.
	const r = await pass({ beforePublish: async () => {
		await upsertRelations(null, [{ kind: 'CALLS', from: maxRows!.id, to: token!.id, resolved: true, evidence: 'inferred', meta: { repo } }]);
	} });
	assert.equal(r.mode, 'incremental');
	const after = readChangedFilesInTxn(await getGraphStore(), repoId);
	assert.deepEqual(after.map(c => c.file), ['src/store/limits.ts'], 'the later change stays recorded');
	assert.ok(after[0]!.stamp > read[0]!.stamp);

	// The next pass sees the edge.
	await pass();
	const row = readContributionsInTxn(await getGraphStore(), repoId).get('src/store/limits.ts')!;
	assert.ok(row.out.some(e => e.to === 'src/parse/tokens.ts'), 'the edge written during the pass is in the row');
	await equalsForcedFull('converged');
});

test('S001 t3: a pass held across a full index publishes nothing, and the next full pass drops the deleted file', async () => {
	await pass();
	await edit('src/parse/lexer.ts', FILES['src/parse/lexer.ts'] + '// touched\n');

	// The pass is held after it computed; meanwhile limits.ts (no relationships) vanishes and the repository is
	// fully re-indexed, which deletes every entity first.
	const held = await pass({ beforePublish: async () => {
		unlinkSync(join(repo, 'src/store/limits.ts'));
		await svc.processJob({ kind: 'full', repoPath: repo });
	} });
	assert.deepEqual([held.ran, held.reason], [false, 'superseded'], 'it published nothing');
	assert.deepEqual(Object.keys((await snapshot()).rows), [], 'no stale row was written back');

	const next = await pass();
	assert.equal(next.mode, 'full');
	const now = await snapshot();
	assert.equal(now.rows['src/store/limits.ts'], undefined);
	assert.ok(now.groups.every(g => !(g.files as string[]).includes('src/store/limits.ts')), 'the deleted file is in no group');
	await equalsForcedFull('equal to a forced full pass');
});
