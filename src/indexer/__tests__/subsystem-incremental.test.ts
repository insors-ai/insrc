/**
 * ISSUE-7d42b5dc S001 t2 -- the incremental subsystem pass. A TypeScript
 * repository indexed by the real IndexerService, edited file by file as the
 * watcher and the settle would, and grouped by runSubsystemPass after each
 * edit: what the incremental pass stores (groups, ids, contribution rows)
 * equals what a forced full pass stores from the same graph; a comment-only
 * edit reads one file and does not regroup; an unchanged importer stays right
 * while its target gains, loses and regains code; the first pass in a process
 * and the first after a full index are full.
 *
 * Run: npx tsx --test src/indexer/__tests__/subsystem-incremental.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import { readSubsystems } from '../../db/subsystems.js';
import { readChangedFilesInTxn, readContributionsInTxn, writeContributionInTxn } from '../../db/subsystem-changes.js';
import type { DbClient } from '../../db/client.js';
import type { LLMProvider } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { _forgetFullPassesForTest, runSubsystemPass, type SubsystemPassResult } from '../subsystem-pass.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';

useTemporaryLance();

const FILES: Record<string, string> = {
	'src/parse/lexer.ts':  "import { token } from './tokens.js';\nexport function lex(s: string): string[] { return [token(s)]; }\n",
	'src/parse/tokens.ts': "export function token(s: string): string { return s; }\n",
	'src/parse/parser.ts': "import { lex } from './lexer.js';\nimport { token } from './tokens.js';\nexport function analyse(s: string): string[] { return lex(token(s)); }\n",
	'src/store/db.ts':     "import { row } from './rows.js';\nimport { analyse } from '../parse/parser.js';\nexport function load(p: string): string { return row(analyse(p)[0]!); }\n",
	'src/store/rows.ts':   "export function row(s: string): string { return s; }\nexport function rows(xs: string[]): string[] { return [row(xs[0]!)]; }\n",   // a same-file call
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
	store = mkdtempSync(join(tmpdir(), 'insrc-7d42-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-7d42-repo-')));
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

/** Write (or, with `null`, delete) a file and let the watcher's file job and the settle run. */
async function edit(rel: string, text: string | null): Promise<void> {
	const abs = join(repo, rel);
	if (text === null) unlinkSync(abs);
	else { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, text); }
	await svc.processJob({ kind: 'file', filePath: abs, event: text === null ? 'delete' : 'update' });
	await runCrossFileResolver({ db, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'settle', committedFiles: [abs] });
}
const pass = (): Promise<SubsystemPassResult> => runSubsystemPass({ db, repoPath: repo, provider });
/** What the store holds: the groups (without summaries) and the contribution rows. */
async function stored(): Promise<{ groups: unknown[]; rows: Record<string, unknown> }> {
	const groups = (await readSubsystems(repo)).subsystems.map(({ summary: _s, ...g }) => g).sort((a, b) => a.id.localeCompare(b.id));
	return { groups, rows: Object.fromEntries([...readContributionsInTxn(await getGraphStore(), repoId)].sort(([a], [b]) => a.localeCompare(b))) };
}
/** Run the pass, then a forced full pass from the same graph, and require the same stored result. */
async function passEqualsFull(label: string): Promise<SubsystemPassResult> {
	const r = await pass();
	const incremental = await stored();
	_forgetFullPassesForTest();
	const full = await pass();
	assert.equal(full.mode, 'full', `${label}: the forced pass is full`);
	assert.deepEqual(incremental, await stored(), `${label}: the incremental pass stores what a full pass stores`);
	for (const [file, row] of Object.entries(incremental.rows) as [string, { out: { to: string }[] }][]) {
		assert.ok(row.out.every(e => e.to !== file), `${label}: ${file} holds no edge to itself`);
	}
	return r;
}
const groupOf = async (file: string) => (await readSubsystems(repo)).subsystems.find(s => s.files.includes(file));

test('S001 t2: after each edit in the sequence the incremental pass stores what a forced full pass stores, and a comment-only edit is unchanged with one file read', async () => {
	assert.equal((await pass()).mode, 'full', 'the first pass in the process');

	// A comment-only edit: one file read, the rows unchanged, the groups restamped, not rewritten.
	const before = await stored();
	const generationBefore = (await readSubsystems(repo)).computedAtGeneration;
	await edit('src/parse/lexer.ts', FILES['src/parse/lexer.ts'] + '// a comment\n');
	const comment = await pass();
	assert.deepEqual([comment.mode, comment.filesRead, comment.ran], ['unchanged', 1, false]);
	assert.deepEqual(await stored(), before, 'nothing rewritten');
	assert.ok((await readSubsystems(repo)).computedAtGeneration! > generationBefore!, 'restamped at the new generation');

	const steps: Array<[string, string, string | null]> = [
		['a new cross-file call', 'src/store/limits.ts', "import { row } from './rows.js';\nexport function maxRows(): number { return row('1').length; }\n"],
		['a removed call', 'src/store/limits.ts', FILES['src/store/limits.ts']!],
		['a new file', 'src/util/fmt.ts', "import { token } from '../parse/tokens.js';\nexport function fmt(s: string): string { return token(s); }\n"],
		['a deleted file', 'src/util/fmt.ts', null],
		['a file losing its last code entity', 'src/store/limits.ts', '// no code here any more\n'],
		['a pending call of another file', 'src/store/late.ts', "import { soon } from './soon.js';\nexport function late(): number { return soon(); }\n"],
		['the definition that resolves it, in a settle', 'src/store/soon.ts', 'export function soon(): number { return 1; }\n'],
	];
	for (const [label, file, text] of steps) {
		await edit(file, text);
		const r = await passEqualsFull(label);
		assert.equal(r.mode, 'incremental', `${label}: the file graph changed`);
	}
	assert.equal(await groupOf('src/store/limits.ts'), undefined, 'a file with no code entity is in no group');
	assert.equal(await groupOf('src/util/fmt.ts'), undefined, 'a deleted file is in no group');
	assert.ok(await groupOf('src/store/late.ts'));
});

test('S001 t2: an unchanged importer stays correct while its target gains, loses and regains code entities', async () => {
	await edit('src/store/tgt.ts', '// nothing yet\n');
	await edit('src/store/imp.ts', "import './tgt.js';\nexport function imp(): number { return 1; }\n");
	await pass();
	for (const [label, text] of [
		['gains', 'export function t(): number { return 2; }\n'],
		['loses', '// nothing again\n'],
		['regains', 'export function t(): number { return 3; }\n'],
	] as const) {
		writeFileSync(join(repo, 'src/store/tgt.ts'), text);
		await svc.processJob({ kind: 'file', filePath: join(repo, 'src/store/tgt.ts'), event: 'update' });
		assert.deepEqual(readChangedFilesInTxn(await getGraphStore(), repoId).map(c => c.file), ['src/store/tgt.ts'], `${label}: the importer is not recorded`);
		await passEqualsFull(`the target ${label} code`);
	}
	const rows = readContributionsInTxn(await getGraphStore(), repoId);
	assert.ok(rows.get('src/store/imp.ts')!.out.some(e => e.to === 'src/store/tgt.ts' && (e.kinds.IMPORTS ?? 0) > 0), 'the file-to-file import is kept');
});

test('S001 t2: the first pass in a process and the first after a full index are full, including after an isolated file vanished without a watcher event', async () => {
	assert.equal((await pass()).mode, 'full');
	assert.equal((await pass()).mode, 'unchanged', 'the next pass in the process is not full');
	_forgetFullPassesForTest();
	assert.equal((await pass()).mode, 'full', 'a new process starts with a full pass');

	// A row an older daemon left for a file that is gone: the first pass in a new process drops it.
	await withWriteTxn(w => writeContributionInTxn(w, repoId, 'src/ghost.ts', { entityCount: 1, out: [] }));
	_forgetFullPassesForTest();
	assert.equal((await pass()).mode, 'full');
	assert.equal(readContributionsInTxn(await getGraphStore(), repoId).has('src/ghost.ts'), false, 'the stale row is gone');

	// limits.ts has no relationships; it vanishes from disk and its event is never processed.
	unlinkSync(join(repo, 'src/store/limits.ts'));
	await svc.processJob({ kind: 'full', repoPath: repo });
	const afterFull = await pass();
	assert.equal(afterFull.mode, 'full', 'the full index dropped the contributions');
	assert.equal(await groupOf('src/store/limits.ts'), undefined);
	assert.equal(readContributionsInTxn(await getGraphStore(), repoId).has('src/store/limits.ts'), false);
	const now = await stored();
	_forgetFullPassesForTest();
	await pass();
	assert.deepEqual(await stored(), now, 'equal to a forced full pass');
});
