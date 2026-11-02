/**
 * Epic c2ba6fa6, Story s8, t3 -- the subsystem pass over a stored graph. A
 * small TypeScript repository indexed by the real IndexerService (a complete
 * graph, with evidence on its relationships), then runSubsystemPass: an
 * incomplete graph is not grouped; the stored set follows the stored
 * relationships and their evidence weights, and module stubs and other
 * repositories are not edges; a second pass at one generation does nothing
 * and a new generation regroups; every code entity has exactly one subsystem.
 *
 * Run: npx tsx --test src/indexer/__tests__/subsystem-pass.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../db/repos.js';
import { listEntitiesForRepo, upsertEntities } from '../../db/entities.js';
import { upsertRelations } from '../../db/relations.js';
import { markFullIndexUnfinished, readIndexState } from '../../db/index-state.js';
import { readSubsystems } from '../../db/subsystems.js';
import type { DbClient } from '../../db/client.js';
import type { Entity } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { makeEntityId } from '../parser/base.js';
import { runSubsystemPass } from '../subsystem-pass.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';

useTemporaryLance();

const FILES: Record<string, string> = {
	'src/parse/lexer.ts':  "import { token } from './tokens.js';\nexport function lex(s: string): string[] { return [token(s)]; }\n",
	'src/parse/tokens.ts': "export function token(s: string): string { return s; }\n",
	'src/parse/parser.ts': "import { lex } from './lexer.js';\nimport { token } from './tokens.js';\nexport function analyse(s: string): string[] { return lex(token(s)); }\n",
	'src/store/db.ts':     "import { row } from './rows.js';\nimport { analyse } from '../parse/parser.js';\nimport { readFileSync } from 'node:fs';\nexport function load(p: string): string {\n  const parts = analyse(readFileSync(p, 'utf8'));\n  return row(parts[0]!);\n}\n",
	'src/store/rows.ts':   "export function row(s: string): string { return s; }\nexport function rows(xs: string[]): string[] { return xs.map(row); }\n",
	'src/store/limits.ts': "export function maxRows(): number { return 100; }\n",   // no relationships: placed by its directory
};

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
let store: string;
let repo: string;
let svc: IndexerService;
const db = null as unknown as DbClient;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s8-pass-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s8-pass-repo-')));
	for (const [f, text] of Object.entries(FILES)) {
		mkdirSync(dirname(join(repo, f)), { recursive: true });
		writeFileSync(join(repo, f), text);
	}
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-02T00:00:00.000Z', status: 'pending' });
	svc = new IndexerService(db, new IndexQueue(), watcher, undefined, 600_000);
	await svc.processJob({ kind: 'full', repoPath: repo });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

test('s8 t3: an incomplete graph is not grouped and nothing is written', async () => {
	await markFullIndexUnfinished(repo);
	assert.equal((await readIndexState(repo))?.graphComplete, false);

	const r = await runSubsystemPass({ db, repoPath: repo });

	assert.deepEqual([r.ran, r.reason], [false, 'graph-incomplete']);
	assert.deepEqual(await readSubsystems(repo), { computedAtGeneration: null, subsystems: [] });
});

test('s8 t3: the stored set follows the stored relationships and their evidence; module stubs and other repositories are not edges', async () => {
	// A call from db.ts into another repository's function: not an edge of this repository.
	const other = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s8-other-')));
	try {
		await addRepo(null, { path: other, name: 'other', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' });
		const theirs: Entity = { id: makeEntityId(other, join(other, 'x.ts'), 'function', 'x'), kind: 'function', name: 'x', language: 'typescript', repoId: 2, repo: other, file: join(other, 'x.ts'), startLine: 1, endLine: 1, body: 'x', embedding: [], indexedAt: '2026-11-02T00:00:00.000Z' };
		await upsertEntities(db, [theirs]);
		await upsertRelations(db, [{ kind: 'CALLS', from: makeEntityId(repo, join(repo, 'src/store/db.ts'), 'function', 'load'), to: theirs.id, resolved: true, meta: { repo }, evidence: 'inferred' }]);

		const r = await runSubsystemPass({ db, repoPath: repo });
		assert.equal(r.ran, true);
		const { subsystems } = await readSubsystems(repo);
		const parse = subsystems.find(s => s.files.includes('src/parse/lexer.ts'))!;
		const storeSub = subsystems.find(s => s.files.includes('src/store/db.ts'))!;
		assert.deepEqual([...parse.files], ['src/parse/lexer.ts', 'src/parse/parser.ts', 'src/parse/tokens.ts']);
		assert.deepEqual([...storeSub.files], ['src/store/db.ts', 'src/store/limits.ts', 'src/store/rows.ts'], 'limits.ts has no relationships and joins its directory');
		assert.equal(subsystems.length, 2, 'no subsystem for node:fs, which is a module stub, or the other repository');
		// db.ts -> parser.ts: one import read from the text (1 x 1) and one call resolved across files (1 x 0.8).
		// (The function is not called parse: the TypeScript reader does not record a call named parse.)
		assert.deepEqual(storeSub.connections, [{ to: parse.id, weight: 1.8, kinds: { IMPORTS: 1, CALLS: 1 } }]);
		assert.deepEqual(parse.connections, []);
	} finally {
		rmSync(other, { recursive: true, force: true });
	}
});

test('s8 t3: a second pass at one generation does nothing; after a file changes, the new generation is regrouped', async () => {
	const first = await runSubsystemPass({ db, repoPath: repo });
	assert.equal(first.ran, true);
	const again = await runSubsystemPass({ db, repoPath: repo });
	assert.deepEqual([again.ran, again.reason], [false, 'up-to-date']);

	writeFileSync(join(repo, 'src/store/cache.ts'), "import { row } from './rows.js';\nexport function cached(s: string): string { return row(s); }\n");
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' }]);   // so the file event knows the repository
	await svc.processJob({ kind: 'file', filePath: join(repo, 'src/store/cache.ts'), event: 'add' });
	assert.equal((await runSubsystemPass({ db, repoPath: repo })).reason, 'graph-incomplete', "the new file's calls wait for the settle");
	await runCrossFileResolver({ db, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'settle', committedFiles: [join(repo, 'src/store/cache.ts')] });
	const state = await readIndexState(repo);
	assert.ok(state!.generation > first.generation);

	const next = await runSubsystemPass({ db, repoPath: repo });
	assert.equal(next.ran, true);
	const stored = await readSubsystems(repo);
	assert.equal(stored.computedAtGeneration, state!.generation);
	assert.ok(stored.subsystems.some(s => s.files.includes('src/store/cache.ts')));
});

test('s8 t3: every code entity of the repository has exactly one subsystem, through its file', async () => {
	await runSubsystemPass({ db, repoPath: repo });
	const code = (await listEntitiesForRepo(db, repo)).filter(e => ['function', 'method', 'class', 'interface', 'type', 'variable'].includes(e.kind));
	assert.equal(code.length, 7, 'lex, token, analyse, load, row, rows and maxRows');
	for (const e of code) assert.equal((await readSubsystems(repo, { files: [e.file] })).subsystems.length, 1, `${e.name} in ${e.file}`);
	const { subsystems } = await readSubsystems(repo);
	assert.equal(subsystems.reduce((n, s) => n + s.entityCount, 0), code.length, 'entity counts add up to the code entities');
});
