import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { closeGraphStore, getGraphStore, setGraphStorePath } from '../graph/store.js';
import { decodeEntityRow, decodeRepoRow } from '../graph/codec.js';
import { addRepo, listRepos } from '../repos.js';
import { deleteEntitiesById, deleteEntitiesForFile, deleteEntitiesForRepo, getEntity, reindexFile, updateEmbedding, upsertEntities } from '../entities.js';
import type { Entity } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();
const A = '/repo/members-a', B = '/repo/members-b';
let dir: string;
beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-members-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	for (const path of [A, B]) await addRepo(null, { path, name: path, addedAt: '2026-10-24T00:00:00Z', status: 'ready' });
});
afterEach(async () => { mock.restoreAll(); await closeGraphStore(); rmSync(dir, { recursive: true, force: true }); });

const entity = (id: string, repo = A, file = `${repo}/a.ts`): Entity => ({
	id, repo, file, repoId: 1, kind: 'function', name: id, language: 'typescript', startLine: 1, endLine: 2,
	body: id, embedding: [], indexedAt: '2026-10-24T00:00:00Z', artifact: false,
});

/** Compare complete memberships with authoritative rows, independent of write-path decisions. */
async function assertMembershipOracle(): Promise<void> {
	const s = await getGraphStore();
	const roots = new Map([...s.repo.getRange()].map(({ value }) => { const r = decodeRepoRow(value as Buffer); return [r.id, r.path] as const; }));
	const files: string[] = [], repos: string[] = [];
	for (const { key, value } of s.entity.getRange()) {
		const row = decodeEntityRow(value as Buffer), root = roots.get(row.repoId);
		assert.notEqual(root, undefined);
		const absolute = row.filePath.startsWith('/') || root === '' ? row.filePath : `${root!.replace(/\/$/, '')}/${row.filePath}`;
		const repoKey = Buffer.alloc(4); repoKey.writeUInt32BE(row.repoId);
		files.push(`${createHash('sha256').update(absolute).digest('hex')}:${(key as Buffer).toString('hex')}`);
		repos.push(`${repoKey.toString('hex')}:${(key as Buffer).toString('hex')}`);
	}
	const entries = (index: typeof s.entityByFile): string[] => [...index.getRange()].map(({ key, value }) => `${(key as Buffer).toString('hex')}:${(value as Buffer).toString('hex')}`).sort();
	assert.deepEqual(entries(s.entityByFile), files.sort());
	assert.deepEqual(entries(s.entityByRepo), repos.sort());
}

test('all entity mutations preserve exact file and repo membership without duplicates', async () => {
	const one = entity('one'), two = entity('two'), three = entity('three', B);
	await upsertEntities(null, [one, two, three]); await assertMembershipOracle();
	await upsertEntities(null, [one, two]); await assertMembershipOracle();
	await upsertEntities(null, [{ ...one, repo: B, file: `${B}/moved.ts` }]); await assertMembershipOracle();
	await reindexFile(null, B, `${B}/again.ts`, [{ ...one, repo: B, file: `${B}/again.ts` }]);
	assert.equal((await getEntity(null, 'one'))?.file, `${B}/again.ts`); await assertMembershipOracle();
	await reindexFile(null, A, `${A}/a.ts`, [{ ...two, body: 'changed' }, entity('four')]); await assertMembershipOracle();
	await updateEmbedding(null, 'two', [], 'test-model'); await assertMembershipOracle();
	await deleteEntitiesById(null, ['three']); await assertMembershipOracle();
	await deleteEntitiesForFile(null, `${A}/a.ts`); await assertMembershipOracle();
	await upsertEntities(null, [entity('five', B), entity('six')]);
	await deleteEntitiesForRepo(null, B); await assertMembershipOracle();
	await deleteEntitiesById(null, ['six']); await assertMembershipOracle();
	assert.equal([...((await getGraphStore()).entityByFile.getRange())].length, 0);
});

test('a failed membership write rolls back authoritative rows and both indexes', async () => {
	await upsertEntities(null, [entity('one')]);
	const s = await getGraphStore(), id = s.entityIdByString.get('one') as bigint;
	const key = Buffer.alloc(8); key.writeBigUInt64BE(BigInt(id));
	const before = Buffer.from(s.entity.get(key) as Buffer);
	const failure = mock.method(s.entityByRepo, 'put', () => { throw new Error('injected membership failure'); });
	await assert.rejects(upsertEntities(null, [{ ...entity('one', B), body: 'changed' }]), /injected membership failure/);
	failure.mock.restore();
	assert.deepEqual(s.entity.get(key), before);
	await assertMembershipOracle();
});

test('unregistered writes leave registry rows and memberships unchanged', async () => {
	const before = await listRepos(null);
	await assert.rejects(upsertEntities(null, [entity('bad', '/repo/unregistered')]), /not registered|unregistered/i);
	assert.deepEqual(await listRepos(null), before);
	await assertMembershipOracle();
});

test('shared module ensure-exists writes retain their reserved-repository memberships', async () => {
	const module = { ...entity('module', '', 'package'), kind: 'module' as const };
	await upsertEntities(null, [module]); await assertMembershipOracle();
	await upsertEntities(null, [{ ...module, file: 'replacement' }]); await assertMembershipOracle();
	await deleteEntitiesById(null, ['module']); await assertMembershipOracle();
});
