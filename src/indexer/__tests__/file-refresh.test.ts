/**
 * Epic c2ba6fa6, Story s2, t8 -- the indexer's refresh, delete and clean-up
 * removal go through the one file commit. Through the real IndexerService on
 * a real file: a refresh whose embed step fails after the parse leaves the
 * file's previous rows and records it as uncommitted (ac1); a read while a
 * refresh is held in its embed step sees the complete old set, and after the
 * commit the complete new set (ac2); a delete event removes the file's
 * entities, relationships and pending rows together (ac4).
 *
 * Run: npx tsx --test src/indexer/__tests__/file-refresh.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { decodeUnresolvedRow } from '../../db/graph/codec.js';
import { findEntitiesByFile } from '../../db/entities.js';
import { readIndexState } from '../../db/index-state.js';
import { addRepo } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import type { Entity } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

let dir: string;
let repo: string;
let file: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s2-refresh-')));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = join(dir, 'repo');
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, '.gitignore'), '.gitignore\n');
	file = join(repo, 'src', 'a.ts');
	await addRepo(null, { path: repo, name: 'refresh', addedAt: '2026-11-01T00:00:00.000Z', status: 'ready', lastIndexed: '2026-11-01T00:00:00.000Z' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const watcher = { onEvents() {}, onFilterRefreshed() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {}, async syncIgnores() {} } as unknown as Watcher;

/** The real indexer with its embed step replaceable. */
class RefreshProbe extends IndexerService {
	embedStep: (entities: Entity[]) => Promise<void> = async () => {};
	constructor() {
		const queue = new IndexQueue();
		queue.enqueue = (() => {}) as typeof queue.enqueue;
		super(null as unknown as DbClient, queue, watcher, undefined, 600_000);
	}
	protected override async embed(entities: Entity[]): Promise<void> { await this.embedStep(entities); }
}

async function indexer(): Promise<RefreshProbe> {
	const svc = new RefreshProbe();
	await svc.addRepo(repo);
	return svc;
}
const functions = async (): Promise<string[]> =>
	(await findEntitiesByFile(null, file)).filter(e => e.kind === 'function').map(e => e.name).sort();
async function pendingOfFile(): Promise<number> {
	const store = await getGraphStore();
	return [...store.unresolved.getRange()].map(({ value }) => decodeUnresolvedRow(value as Buffer)).filter(r => r.fromFile === file).length;
}

const OLD = "import { x } from './missing';\nexport function a() { return x; }\nexport function b() { return a(); }\n";
const NEW = 'export function a() { return 2; }\nexport function c() { return 3; }\n';

test('t8 (ac1): a refresh whose embed step fails after the parse leaves the file\'s previous entities and pending rows as they were, and records the file as uncommitted', async () => {
	const svc = await indexer();
	writeFileSync(file, OLD);
	await svc.processJob({ kind: 'file', filePath: file, event: 'update' });
	assert.deepEqual(await functions(), ['a', 'b']);
	const pendingBefore = await pendingOfFile();
	assert.ok(pendingBefore > 0, 'the old parse left a pending import');

	writeFileSync(file, NEW);
	svc.embedStep = async () => { throw new Error('the embed step fails'); };
	await assert.rejects(svc.processJob({ kind: 'file', filePath: file, event: 'update' }), /the embed step fails/);

	assert.deepEqual(await functions(), ['a', 'b']);
	assert.equal(await pendingOfFile(), pendingBefore);
	assert.deepEqual((await readIndexState(repo))?.uncommittedFiles, [file]);

	// The next successful refresh commits the new set and the file leaves the list.
	svc.embedStep = async () => {};
	await svc.processJob({ kind: 'file', filePath: file, event: 'update' });
	assert.deepEqual(await functions(), ['a', 'c']);
	assert.deepEqual((await readIndexState(repo))?.uncommittedFiles, []);
});

test('t8 (ac2): a read while a refresh is held in its embed step sees the complete old set, and after the commit the complete new set', async () => {
	const svc = await indexer();
	writeFileSync(file, OLD);
	await svc.processJob({ kind: 'file', filePath: file, event: 'update' });

	writeFileSync(file, NEW);
	let release!: () => void;
	let held!: () => void;
	const inEmbed = new Promise<void>(r => { held = r; });
	svc.embedStep = () => { held(); return new Promise<void>(r => { release = r; }); };
	const refresh = svc.processJob({ kind: 'file', filePath: file, event: 'update' });
	await inEmbed;

	assert.deepEqual(await functions(), ['a', 'b'], 'during the refresh: the complete old set');
	release();
	await refresh;
	assert.deepEqual(await functions(), ['a', 'c'], 'after the commit: the complete new set');
});

test('t8 (ac4): a delete event removes the file\'s entities and pending rows together', async () => {
	const svc = await indexer();
	writeFileSync(file, OLD);
	await svc.processJob({ kind: 'file', filePath: file, event: 'update' });
	assert.ok((await functions()).length > 0 && (await pendingOfFile()) > 0);

	rmSync(file);
	await svc.processJob({ kind: 'file', filePath: file, event: 'delete' });

	assert.deepEqual(await findEntitiesByFile(null, file), []);
	assert.equal(await pendingOfFile(), 0);
});
