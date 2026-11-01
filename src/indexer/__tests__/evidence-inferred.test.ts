/**
 * Epic c2ba6fa6, Story s7, t4 -- what resolution across files decides is
 * stored 'inferred'. Through the real IndexerService and cross-file pass on
 * real files: a call resolved to a function of another file is 'inferred'
 * (ac1); a relationship completed by Pass 0 keeps the evidence it carried; a
 * call matching several candidates stays pending, classed ambiguous with its
 * candidates, and no edge is written, so nothing reads 'chosen' (ac2). The two
 * endpoint passes store their edges 'inferred'.
 *
 * Run: npx tsx --test src/indexer/__tests__/evidence-inferred.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { decodeEvidence } from '../../db/graph/codec.js';
import { encodeOutEdgePrefix, kindByteToName, prefixSuccessor } from '../../db/graph/keys.js';
import { entityU64ForId, findEntitiesByFile, getEntity, upsertEntities } from '../../db/entities.js';
import { listUnresolvedRelations, upsertRelations } from '../../db/relations.js';
import { addRepo } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import type { Entity, Relation, ResolvedTarget } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { runCrossFileResolver } from '../cross-file-resolver.js';
import { detectSourceRoots } from '../source-roots.js';
import { makeEntityId } from '../parser/base.js';
import { SHARED_MODULES_REPO_ID } from '../../shared/repo-namespaces.js';
import { resolveExternalEndpoints } from '../external-endpoints.js';
import { resolveMessagingEndpoints } from '../messaging-endpoints.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

let dir: string;
let repo: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s7-inferred-')));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = join(dir, 'repo');
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, '.gitignore'), '.gitignore\n');
	await addRepo(null, { path: repo, name: 'inferred', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready', lastIndexed: '2026-11-02T00:00:00.000Z' });
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
async function indexFiles(...files: string[]): Promise<void> {
	const svc = new Probe();
	await svc.addRepo(repo);
	for (const f of files) await svc.processJob({ kind: 'file', filePath: f, event: 'update' });
	await runCrossFileResolver({ db: null as unknown as DbClient, repoRoot: repo, sourceRoots: detectSourceRoots(repo), mode: 'settle', committedFiles: files });
}

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
/** Every stored edge's evidence. */
async function allEvidence(): Promise<string[]> {
	const store = await getGraphStore();
	return [...store.outEdge.getRange()].map(({ value }) => decodeEvidence(value as Buffer));
}
const fn = async (file: string, name: string): Promise<Entity> =>
	(await findEntitiesByFile(null, file)).find(e => e.name === name && e.kind === 'function')!;

test('s7 t4: a call resolved to a function of another file is stored inferred, beside the same-file call stored extracted (ac1)', async () => {
	const a = join(repo, 'src', 'a.ts');
	const b = join(repo, 'src', 'b.ts');
	writeFileSync(b, 'export function helper(): number { return 1; }\n');
	writeFileSync(a, "import { helper } from './b';\nfunction local(): number { return 2; }\nexport function main(): number { return helper() + local(); }\n");
	await indexFiles(b, a);

	const calls = (await outgoing((await fn(a, 'main')).id)).filter(e => e.startsWith('CALLS'));
	assert.deepEqual(calls, ['CALLS helper: inferred', 'CALLS local: extracted']);
});

test('s7 t4: Pass 0 restores an awaiting relationship with the evidence it carried, not inferred', async () => {
	const a = join(repo, 'src', 'a.ts');
	const b = join(repo, 'src', 'b.ts');
	writeFileSync(b, 'export const x = 1;\n');
	writeFileSync(a, "import { x } from './b';\nexport function f(): number { return x; }\n");
	await indexFiles(a);                                   // b.ts not stored: the import waits, carrying 'extracted'
	await indexFiles(b);                                   // Pass 0 completes it

	const fileA = makeEntityId(repo, a, 'file', a);
	assert.ok((await outgoing(fileA)).includes(`IMPORTS ${b}: extracted`), (await outgoing(fileA)).join('; '));
});

test('s7 t4: a call matching several candidates stays pending, classed ambiguous with its candidates, and no edge is written; no stored edge reads chosen (ac2)', async () => {
	const a = join(repo, 'src', 'a.ts');
	const c = join(repo, 'src', 'c.ts');
	const d = join(repo, 'src', 'd.ts');
	writeFileSync(c, 'export function helper(): number { return 1; }\nexport const one = 1;\n');
	writeFileSync(d, 'export function helper(): number { return 2; }\nexport const two = 2;\n');
	// Both imported files export `helper`: two candidates for the call.
	writeFileSync(a, "import { one } from './c';\nimport { two } from './d';\nexport function main(): number { return helper() + one + two; }\n");
	await indexFiles(c, d, a);

	const main = await fn(a, 'main');
	assert.deepEqual((await outgoing(main.id)).filter(e => e.startsWith('CALLS')), [], 'no target is guessed');
	const row = (await listUnresolvedRelations(null, repo)).find(r => r.kind === 'CALLS' && r.fromEntity === main.id);
	assert.equal(row?.meta['class'], 'ambiguous');
	assert.deepEqual([...(row?.meta['candidates'] as string[])].sort(), [(await fn(c, 'helper')).id, (await fn(d, 'helper')).id].sort());
	const evidence = await allEvidence();
	assert.ok(evidence.length > 0);
	assert.equal(evidence.includes('chosen'), false);
});

test('s7 t4: an import of a module stub that Pass 1 rewires to the in-tree file is stored inferred', async () => {
	const fooFile = join(repo, 'src', 'main', 'java', 'com', 'example', 'Foo.java');
	const userFile = join(repo, 'src', 'main', 'java', 'com', 'other', 'User.java');
	mkdirSync(join(repo, 'src', 'main', 'java', 'com', 'example'), { recursive: true });
	mkdirSync(join(repo, 'src', 'main', 'java', 'com', 'other'), { recursive: true });
	writeFileSync(fooFile, 'package com.example;\npublic class Foo {}');
	writeFileSync(userFile, 'package com.other;\nimport com.example.Foo;\npublic class User {}');
	const file = (path: string): Entity => ({ id: makeEntityId(repo, path, 'file', path), kind: 'file', name: path, language: 'java', repoId: 1, repo, file: path, startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: '2026-11-02T00:00:00.000Z' });
	const stub: Entity = { id: makeEntityId('jvm', '', 'module', 'com.example.Foo'), kind: 'module', name: 'com.example.Foo', language: 'java', repoId: SHARED_MODULES_REPO_ID.jvm, repo: '', file: '', startLine: 0, endLine: 0, body: '', embedding: [], indexedAt: '2026-11-02T00:00:00.000Z' };
	const [foo, user] = [file(fooFile), file(userFile)];
	await upsertEntities(null, [foo, user, stub]);
	await upsertRelations(null, [{ kind: 'IMPORTS', from: user.id, to: stub.id, resolved: true, evidence: 'extracted' }]);

	const result = await runCrossFileResolver({ db: null as unknown as DbClient, repoRoot: repo, sourceRoots: detectSourceRoots(repo) });

	assert.equal(result.importsRewired, 1);
	assert.ok((await outgoing(user.id)).includes(`IMPORTS ${fooFile}: inferred`), (await outgoing(user.id)).join('; '));
});

function endpointCaller(name: string): Entity {
	const file = join(repo, 'src', `${name}.ts`);
	return { id: makeEntityId(repo, file, 'function', name), kind: 'function', name, language: 'typescript', repoId: 1, repo, file, startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: '2026-11-02T00:00:00.000Z' };
}
const resolverFor = (protocol: 'http' | 'messaging', map: Record<string, string>) =>
	async (_repo: string, _p: 'http' | 'messaging' | 'rpc', expr: string): Promise<ResolvedTarget> =>
		map[expr] !== undefined ? { resolved: true, protocol, identity: map[expr]! } : { resolved: false, rawExpression: expr };

test('s7 t4: the external-service and messaging endpoint passes store their edges inferred', async () => {
	const http = endpointCaller('fetcher');
	const pub = endpointCaller('publisher');
	await upsertEntities(null, [http, pub]);
	const meta = (e: Entity) => ({ file: e.file, repo });
	await upsertRelations(null, [
		{ kind: 'CALLS_HTTP', from: http.id, to: `'SVC'`, resolved: false, meta: meta(http) },
		{ kind: 'PUBLISHES_TO', from: pub.id, to: `'orders'`, resolved: false, meta: meta(pub) },
	] satisfies Relation[]);

	await resolveExternalEndpoints({ db: null, repo, resolve: resolverFor('http', { "'SVC'": 'svc.example/api' }) });
	await resolveMessagingEndpoints({ db: null, repo, resolve: resolverFor('messaging', { "'orders'": 'orders' }) });

	const httpEdges = (await outgoing(http.id)).filter(e => e.startsWith('CALLS_HTTP'));
	const pubEdges = (await outgoing(pub.id)).filter(e => e.startsWith('PUBLISHES_TO'));
	assert.equal(httpEdges.length, 1);
	assert.equal(pubEdges.length, 1);
	assert.ok(httpEdges[0]!.endsWith(': inferred'), httpEdges[0]);
	assert.ok(pubEdges[0]!.endsWith(': inferred'), pubEdges[0]);
});
