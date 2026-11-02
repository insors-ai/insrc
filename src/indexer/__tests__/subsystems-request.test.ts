/**
 * Epic c2ba6fa6, Story s8, t6 -- the index.subsystems request through
 * IndexerService. A TypeScript repository indexed by the real IndexerService,
 * grouped by the real subsystem pass (a stand-in provider for the cheap tier),
 * then the request answered by the real handler runtime in process: a complete,
 * grouped repository returns its subsystems with their connections and every
 * code entity in exactly one (ac1); an incomplete graph says so (ac5); an older
 * generation is stale; an ungrouped repository says it is not grouped yet; the
 * request is classed for the code-indexing worker.
 *
 * Run: npx tsx --test src/indexer/__tests__/subsystems-request.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-s8-request-home-'));
mkdirSync(join(HOME, '.insrc'), { recursive: true });
process.env['HOME'] = HOME;
const { closeGraphStore, setGraphStorePath } = await import('../../db/graph/store.js');
const { useTemporaryLance } = await import('../../db/lance/__tests__/helpers/temp-lance.js');
const { addRepo } = await import('../../db/repos.js');
const { listEntitiesForRepo } = await import('../../db/entities.js');
const { markFullIndexUnfinished } = await import('../../db/index-state.js');
const { IndexQueue } = await import('../../daemon/queue.js');
const { IndexerService } = await import('../index.js');
const { runSubsystemPass } = await import('../subsystem-pass.js');
const { runCrossFileResolver } = await import('../cross-file-resolver.js');
const { detectSourceRoots } = await import('../source-roots.js');
const { buildHandlerRuntime } = await import('../../daemon/handler-runtime.js');
const { methodClasses } = await import('../../daemon/threads/method-class.js');
type DbClient = import('../../db/client.js').DbClient;
type LLMProvider = import('../../shared/types.js').LLMProvider;
type Watcher = import('../watcher.js').Watcher;
type SubsystemsAnswer = import('../../db/subsystems.js').SubsystemsAnswer;

useTemporaryLance();

const FILES: Record<string, string> = {
	'src/parse/lexer.ts':  "import { token } from './tokens.js';\nexport function lex(s: string): string[] { return [token(s)]; }\n",
	'src/parse/tokens.ts': "export function token(s: string): string { return s; }\n",
	'src/store/db.ts':     "import { row } from './rows.js';\nimport { lex } from '../parse/lexer.js';\nexport function load(s: string): string {\n  const parts = lex(s);\n  return row(parts[0]!);\n}\n",
	'src/store/rows.ts':   "export function row(s: string): string { return s; }\n",
};
const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;
const provider = { capabilities: {}, async completeStructured<T>() { return { summary: 'a summary' } as T; } } as unknown as LLMProvider;

let store: string;
let repo: string;
let svc: InstanceType<typeof IndexerService>;
test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s8-request-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s8-request-repo-')));
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
test.after(() => { rmSync(HOME, { recursive: true, force: true }); });

function untouchable(name: string): never {
	return new Proxy({}, { get: (_t, prop) => { throw new Error(`the request read ${name}.${String(prop)}`); } }) as never;
}
async function request(repoPath: string): Promise<SubsystemsAnswer & { error?: string }> {
	const runtime = buildHandlerRuntime({
		db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
		startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
	});
	try {
		return await runtime.rpcHandlers['index.subsystems']!({ repoPath }) as SubsystemsAnswer & { error?: string };
	} finally {
		runtime.understandingRoutes.stop();
	}
}

test('s8 t6 (ac1): a complete, grouped repository returns its subsystems with their connections, every code entity in exactly one', async () => {
	await runSubsystemPass({ db, repoPath: repo, provider });
	const a = await request(repo);
	assert.equal(a.graphComplete, true);
	assert.equal(a.stale, false);
	assert.equal(a.note, undefined);
	assert.equal(a.computedAtGeneration, a.generation);
	assert.deepEqual(a.subsystems.map(s => s.name).sort(), ['src/parse', 'src/store']);
	const parse = a.subsystems.find(s => s.name === 'src/parse')!;
	const storeSub = a.subsystems.find(s => s.name === 'src/store')!;
	assert.deepEqual(storeSub.connections.map(c => c.to), [parse.id], 'the store subsystem lists its connection to parse');
	assert.equal(storeSub.summary, 'a summary');

	const code = (await listEntitiesForRepo(db, repo)).filter(e => e.kind === 'function');
	for (const e of code) {
		const rel = e.file.slice(repo.length + 1);
		assert.equal(a.subsystems.filter(s => s.files.includes(rel)).length, 1, `${e.name} is in exactly one subsystem`);
	}
	assert.equal(a.subsystems.reduce((n, s) => n + s.entityCount, 0), code.length);
});

test('s8 t6 (ac5): an incomplete graph says the groups rest on an incomplete graph; an older generation is stale; an ungrouped repository is not grouped yet', async () => {
	assert.equal((await request(repo)).note, 'not grouped yet');

	await runSubsystemPass({ db, repoPath: repo, provider });
	writeFileSync(join(repo, 'src/store/cache.ts'), "export function cached(s: string): string { return s; }\n");
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' }]);
	await svc.processJob({ kind: 'file', filePath: join(repo, 'src/store/cache.ts'), event: 'add' });
	await runCrossFileResolver({ db, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'settle', committedFiles: [join(repo, 'src/store/cache.ts')] });
	const older = await request(repo);
	assert.deepEqual([older.graphComplete, older.stale, older.note], [true, true, 'the groups rest on an older graph']);
	assert.ok(older.subsystems.length > 0, 'the older groups are still returned');

	await markFullIndexUnfinished(repo);
	const incomplete = await request(repo);
	assert.deepEqual([incomplete.graphComplete, incomplete.note], [false, 'the groups rest on an incomplete graph']);

	assert.match(String((await request('/repo/unregistered')).error), /not a registered repo/);
});

test('s8 t6: the index.subsystems request is classed for the code-indexing worker', () => {
	assert.equal(methodClasses.classOf('index.subsystems'), 'indexing');
});
