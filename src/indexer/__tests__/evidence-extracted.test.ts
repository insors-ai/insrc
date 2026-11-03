/**
 * Epic c2ba6fa6, Story s7, t3 -- what the file's own resolution decides is
 * stored 'extracted'. Through the real IndexerService on real files and a real
 * temporary store: a call to a function of the same file; a relative import of
 * a file that is not stored yet, which waits and is completed by the
 * cross-file pass's Pass 0 with the evidence it carried; and the repository's
 * DEPENDS_ON edges from its manifest.
 *
 * Run: npx tsx --test src/indexer/__tests__/evidence-extracted.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { decodeEvidence } from '../../db/graph/codec.js';
import { encodeOutEdgePrefix, kindByteToName, prefixSuccessor } from '../../db/graph/keys.js';
import { entityU64ForId, findEntitiesByFile, getEntity } from '../../db/entities.js';
import { listUnresolvedRelations } from '../../db/relations.js';
import { addRepo } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import type { Entity, RelationEvidence } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { makeEntityId } from '../parser/base.js';
import { resolveRelations } from '../resolver.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

let dir: string;
let repo: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s7-extracted-')));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = join(dir, 'repo');
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, '.gitignore'), '.gitignore\n');
	await addRepo(null, { path: repo, name: 'extracted', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready', lastIndexed: '2026-11-02T00:00:00.000Z' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const watcher = { onEvents() {}, onFilterRefreshed() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {}, async syncIgnores() {} } as unknown as Watcher;
class Probe extends IndexerService {
	constructor() {
		const queue = new IndexQueue();
		queue.enqueue = (() => {}) as typeof queue.enqueue;
		super(null as unknown as DbClient, queue, watcher, undefined, 600_000);
	}
	protected override async embed(): Promise<void> {}
}
async function indexer(): Promise<Probe> { const svc = new Probe(); await svc.addRepo(repo); return svc; }
const index = (svc: Probe, filePath: string) => svc.processJob({ kind: 'file', filePath, event: 'update' });

/** The stored outgoing edges of an entity, as `KIND target-name: evidence`. */
async function outgoing(from: string): Promise<string[]> {
	const store = await getGraphStore();
	const u64 = await entityU64ForId(from);
	if (u64 === undefined) return [];
	const prefix = encodeOutEdgePrefix(u64);
	const out: string[] = [];
	for (const { key, value } of store.outEdge.getRange({ start: prefix, end: prefixSuccessor(prefix) })) {
		const k = key as Buffer;
		const target = store.entityStringByU64.get(k.subarray(9, 17)) as string | undefined;
		const name = target === undefined ? '?' : ((await getEntity(null, target))?.name ?? target);
		out.push(`${kindByteToName(k.readUInt8(8))} ${name}: ${decodeEvidence(value as Buffer)}`);
	}
	return out.sort();
}
const fn = async (file: string, name: string): Promise<Entity> =>
	(await findEntitiesByFile(null, file)).find(e => e.name === name && e.kind === 'function')!;

test('s7 t3: a call to a function of the same file, indexed through the file commit, is stored extracted', async () => {
	const svc = await indexer();
	const file = join(repo, 'src', 'a.ts');
	writeFileSync(file, 'export function helper(): number { return 1; }\nexport function main(): number { return helper(); }\n');
	await index(svc, file);

	assert.deepEqual((await outgoing((await fn(file, 'main')).id)).filter(e => e.startsWith('CALLS')), ['CALLS helper: extracted']);
});

test('s7 t3: a relative import of a file not stored yet waits with its evidence, and is stored extracted when the file arrives (Pass 0)', async () => {
	const svc = await indexer();
	const a = join(repo, 'src', 'a.ts');
	const b = join(repo, 'src', 'b.ts');
	writeFileSync(b, 'export const x = 1;\n');                         // on disk, not indexed yet
	writeFileSync(a, "import { x } from './b';\nexport function f(): number { return x; }\n");
	await index(svc, a);

	const fileA = makeEntityId(repo, a, 'file', a);
	const fileB = makeEntityId(repo, b, 'file', b);
	const waiting = (await listUnresolvedRelations(null, repo)).filter(r => r.kind === 'IMPORTS' && r.rawTo === fileB);
	assert.equal(waiting.length, 1, 'the import waits for b.ts');
	assert.equal(waiting[0]!.meta['evidence'], 'extracted');

	await index(svc, b);
	await runCrossFileResolver({ db: null as unknown as DbClient, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'settle', committedFiles: [b] });

	assert.ok((await outgoing(fileA)).includes(`IMPORTS ${b}: extracted`), (await outgoing(fileA)).join('; '));
});

test('s7 t3: every relation resolveRelations returns as resolved carries evidence extracted; the ones it leaves pending carry none', () => {
	const file = join(repo, 'src', 'a.ts');
	writeFileSync(join(repo, 'src', 'b.ts'), 'export const x = 1;\n');
	const ids = { f: 'f'.repeat(32), g: 'g'.repeat(32), m: 'm'.repeat(32) };
	const out = resolveRelations([
		{ kind: 'DEFINES', from: ids.m, to: ids.f, resolved: true },
		{ kind: 'CALLS', from: ids.f, to: 'g', resolved: false },
		{ kind: 'CALLS', from: ids.f, to: 'notHere', resolved: false },
		{ kind: 'IMPORTS', from: ids.m, to: './b', resolved: false, meta: { isRelative: true } },
		{ kind: 'INHERITS', from: ids.f, to: 'Base', resolved: false },
	], file, repo, [
		{ id: ids.f, kind: 'function', name: 'f', language: 'typescript', repoId: 1, repo, file, startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: '' },
		{ id: ids.g, kind: 'function', name: 'g', language: 'typescript', repoId: 1, repo, file, startLine: 2, endLine: 2, body: '', embedding: [], indexedAt: '' },
	]);
	const resolved = out.filter(r => r.resolved);
	assert.equal(resolved.length, 3);
	assert.deepEqual(resolved.map(r => r.evidence), ['extracted', 'extracted', 'extracted'] satisfies RelationEvidence[]);
	assert.deepEqual(out.filter(r => !r.resolved).map(r => r.evidence), [undefined, undefined]);
});

test('s7 t3: the repository\'s DEPENDS_ON edges from its manifest are stored extracted', async () => {
	writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'extracted', dependencies: { 'left-pad': '1.3.0' } }));
	writeFileSync(join(repo, 'src', 'a.ts'), 'export function a(): number { return 1; }\n');
	const svc = await indexer();
	await svc.processJob({ kind: 'full', repoPath: repo });

	const deps = (await outgoing(makeEntityId(repo, '', 'repo', repo))).filter(e => e.startsWith('DEPENDS_ON'));
	assert.deepEqual(deps, ['DEPENDS_ON left-pad: extracted']);
});
