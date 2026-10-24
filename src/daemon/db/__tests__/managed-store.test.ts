import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, open, stat, readdir, rm, chmod, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ManagedRegistry, ManagedStoreError, proveWriterFence, readRegistrySnapshot, writeWithManagedProof } from '../managed-store.js';
import type { ManagedCommit, CommitBoundary } from '../managed-store.js';
import type { ConnectionsFile } from '../../../shared/db-driver.js';
import { PATHS } from '../../../shared/paths.js';
import { connectionsPath, saveConnections } from '../config.js';
import '../drivers/index.js';
function managed(previous: ConnectionsFile): ConnectionsFile {
	return { ...previous, _management: { version: 2, registryId: previous._management?.registryId ?? randomUUID(), generation: randomUUID(), revisions: { fixture: randomUUID() }, receipts: {} } };
}
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'cm-store-'));
	const path = join(root, 'db-connections.json');
	const doc: ConnectionsFile = { connections: [{ id: 'fixture', kind: 'sqlite', path: ':memory:', family: 'kv', retained: { exact: true } }], unknownDocument: { preserve: true } };
	await writeFile(path, JSON.stringify(doc), { mode: 0o600 });
	return { root, path, doc, cleanup: () => rm(root, { recursive: true, force: true }) };
}
test('CM-S1-F: actual same-UID writeFile is fenced after digest validation; preopened descriptor writes only detached inode', async () => {
	const f = await fixture();
	let store: ManagedRegistry | undefined;
	const old = await open(f.path, 'r+');
	try {
		await proveWriterFence(f.root);
		store = await ManagedRegistry.open(f.path, { ownsRoot: async () => true, boundary: async (stage) => {
				if (stage === 'before-rename') {
					// At this boundary the previous digest check has already completed.
					assert.equal((await readRegistrySnapshot(f.path)).digest, store!.snapshot.digest);
				}
			} });
		const next = managed(f.doc);
		await store.commit(store.snapshot, next);
		const bytes = await readFile(f.path, 'utf8');
		await assert.rejects(writeFile(f.path, '{"connections":[]}'), { code: 'EACCES' });
		await old.write(Buffer.from('detached overwrite'), 0, 18, 0);
		await old.sync();
		assert.equal(await readFile(f.path, 'utf8'), bytes);
		assert.deepEqual(JSON.parse(bytes), next);
		assert.equal((await stat(f.path)).mode & 0o777, 0o400);
		assert.notEqual((await old.stat()).ino, (await stat(f.path)).ino);
	}
	finally {
		await old.close();
		await store?.close();
		await f.cleanup();
	}
});
test('CM-S1-E: each atomic write failure preserves prior bytes or requires reconciliation to exact committed truth', async () => {
	for (const boundary of ['temp-open', 'temp-write', 'temp-sync', 'temp-chmod', 'before-rename', 'after-rename', 'parent-sync'] as const satisfies readonly CommitBoundary[]) {
		const f = await fixture();
		let store: ManagedRegistry | undefined;
		try {
			store = await ManagedRegistry.open(f.path, { ownsRoot: async () => true, boundary: async (stage) => {
					if (stage === boundary)
						throw new Error('injected-private-detail');
				} });
			const before = await readFile(f.path, 'utf8');
			const next = managed(f.doc);
			const uncertain = ['after-rename', 'parent-sync'].includes(boundary);
			await assert.rejects(store.commit(store.snapshot, next), err => {
				assert.ok(err instanceof ManagedStoreError);
				assert.equal(err.code, uncertain ? 'reconciliation-required' : 'recovery-required');
				assert.ok(!err.message.includes('private'));
				return true;
			});
			const bytes = await readFile(f.path, 'utf8');
			assert.equal(bytes, uncertain ? JSON.stringify(next, null, 2) + '\n' : before);
			assert.deepEqual((await readdir(f.root)).sort(), ['db-connections.json']);
			if (uncertain)
				await assert.rejects(store.commit(store.snapshot, managed(f.doc)), { code: 'recovery-required' });
			await store.close();
			store = undefined;
			const restart = await ManagedRegistry.open(f.path, { ownsRoot: async () => true });
			try {
				assert.deepEqual(restart.snapshot.file, uncertain ? next : f.doc);
			}
			finally {
				await restart.close();
			}
		}
		finally {
			await store?.close();
			await f.cleanup();
		}
	}
});
test('CM-S1-O: managed startup refuses direct legacy writes, envelope stripping, forged proofs and missing owner', async () => {
	const root = await mkdtemp(join(tmpdir(), 'cm-legacy-fence-'));
	const original = PATHS.insrc;
	Object.defineProperty(PATHS, 'insrc', { value: root, configurable: true });
	let store: ManagedRegistry | undefined;
	try {
		const path = connectionsPath('/fixture/repo');
		await mkdir(dirname(path), { recursive: true });
		const doc: ConnectionsFile = { connections: [] };
		await saveConnections('/fixture/repo', doc);
		await assert.rejects(ManagedRegistry.open(path, { ownsRoot: async () => false }), { code: 'recovery-required' });
		store = await ManagedRegistry.open(path, { ownsRoot: async () => true });
		const next = managed(doc);
		await store.commit(store.snapshot, next);
		const before = await readFile(path, 'utf8');
		await assert.rejects(saveConnections('/fixture/repo', doc), { code: 'recovery-required' });
		await assert.rejects(saveConnections('/fixture/repo', next), { code: 'recovery-required' });
		await assert.rejects(writeWithManagedProof(path, 'anything', {} as ManagedCommit), { code: 'recovery-required' });
		await store.close();
		store = undefined;
		await assert.rejects(saveConnections('/fixture/repo', doc), { code: 'recovery-required' });
		assert.equal(await readFile(path, 'utf8'), before);
	}
	finally {
		await store?.close();
		Object.defineProperty(PATHS, 'insrc', { value: original, configurable: true });
		await rm(root, { recursive: true, force: true });
	}
});
test('CM-S1-F: privileged or failed permission proof disables adoption without changing the registry', async () => {
	const f = await fixture();
	const getuid = process.getuid;
	try {
		Object.defineProperty(process, 'getuid', { value: () => 0, configurable: true });
		const before = await readFile(f.path, 'utf8');
		await assert.rejects(ManagedRegistry.open(f.path, { ownsRoot: async () => true }), { code: 'unsupported-filesystem' });
		assert.equal(await readFile(f.path, 'utf8'), before);
		Object.defineProperty(process, 'getuid', { value: getuid, configurable: true });
		await assert.rejects(proveWriterFence(join(f.root, 'absent-directory')), { code: 'unsupported-filesystem' });
	}
	finally {
		Object.defineProperty(process, 'getuid', { value: getuid, configurable: true });
		await f.cleanup();
	}
});
test('CM-S1-O: inode mode envelope and generation drift block writes instead of normalizing registry truth', async () => {
	for (const drift of ['mode', 'inode', 'envelope', 'generation', 'missing'] as const) {
		const f = await fixture();
		let store: ManagedRegistry | undefined;
		try {
			store = await ManagedRegistry.open(f.path, { ownsRoot: async () => true });
			await store.commit(store.snapshot, managed(f.doc));
			const expected = store.snapshot;
			if (drift === 'mode')
				await chmod(f.path, 0o600);
			else if (drift === 'missing')
				await rm(f.path);
			else {
				const file = drift === 'envelope' ? f.doc : drift === 'generation' ? managed(expected.file) : expected.file;
				const replacement = f.path + '.replacement';
				await writeFile(replacement, JSON.stringify(file, null, 2) + '\n', { mode: 0o400 });
				await rename(replacement, f.path);
			}
			const before = await readFile(f.path, 'utf8').catch(() => undefined);
			await assert.rejects(store.commit(expected, managed(expected.file)), err => err instanceof ManagedStoreError && ['recovery-required', 'registry-unreadable'].includes(err.code));
			assert.equal(await readFile(f.path, 'utf8').catch(() => undefined), before);
		}
		finally {
			await store?.close();
			await f.cleanup();
		}
	}
});
