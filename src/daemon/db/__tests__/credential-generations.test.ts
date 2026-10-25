import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CredentialGenerations, referencedSecrets, resolveSecrets, _setKeystoreForTests } from '../secrets.js';
import { ManagedRegistry, PreparationJournal, readRegistrySnapshot } from '../managed-store.js';
import { materializeDraft } from '../driver-profiles.js';
import type { ConnectionsFile } from '../../../shared/db-driver.js';
import '../drivers/index.js';
const exec = promisify(execFile);
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'cm-generations-'));
	const path = join(root, 'db-connections.json');
	const registryId = randomUUID();
	const oldOperation = randomUUID();
	const oldRef = `db:v2:${'a'.repeat(32)}:${registryId}:${createHash('sha256').update('fixture').digest('hex').slice(0, 32)}:${oldOperation}:${randomUUID()}:0`;
	const foreign = 'db:legacy:fixture';
	const data = new Map([[oldRef, 'original-secret-canary'], [foreign, 'foreign-secret-canary']]);
	const vaultPath = join(root, 'fake-keychain.json');
	await writeFile(vaultPath, JSON.stringify(Object.fromEntries(data)), { mode: 0o600 });
	const keystore = { getKey: async (ref: string) => data.get(ref) ?? null, setKey: async (ref: string, value: string) => {
			data.set(ref, value);
		}, deleteKey: async (ref: string) => {
			data.delete(ref);
		} };
	const file: ConnectionsFile = { connections: [{ id: 'fixture', kind: 'postgres', url: `postgres://user:\${secret:${oldRef}}@host/db`, secretRef: oldRef }], _management: { version: 2, registryId, generation: randomUUID(), revisions: { fixture: randomUUID() }, receipts: {} } };
	await writeFile(path, JSON.stringify(file, null, 2) + '\n', { mode: 0o400 });
	const store = await ManagedRegistry.open(path, { ownsRoot: async () => true });
	const journal = await PreparationJournal.open(path, registryId);
	const generations = new CredentialGenerations(journal, 'a'.repeat(32), { keystore, current: () => readRegistrySnapshot(path) });
	return { root, path, file, oldRef, foreign, data, keystore, store, journal, generations, cleanup: async () => {
			await store.close();
			await rm(root, { recursive: true, force: true });
		} };
}
test('CM-S1-E: real process crashes at preparation stage write rename sync and cleanup boundaries recover exact committed truth', async () => {
	const stages = ['before-preparation-sync', 'after-preparation-sync', 'after-preparation-directory-sync', 'prepared', 'before-keychain-stage', 'after-keychain-stage', 'temp-open', 'temp-write', 'temp-sync', 'temp-chmod', 'before-rename', 'after-rename', 'parent-sync', 'before-obsolete-cleanup', 'after-obsolete-cleanup'];
	for (const stage of stages) {
		const f = await fixture();
		await f.store.close();
		try {
			const before = await readFile(f.path, 'utf8');
			await assert.rejects(exec(process.execPath, ['--import', 'tsx', resolve('src/daemon/db/__tests__/fixtures/credential-crash-child.ts'), f.root, stage], { timeout: 20000, maxBuffer: 1024 * 1024 }), err => {
				assert.equal((err as {
					code?: number;
				}).code, 73, `${stage}: ${String(err)}`);
				return true;
			});
			const current = await readRegistrySnapshot(f.path);
			const committed = ['after-rename', 'parent-sync', 'before-obsolete-cleanup', 'after-obsolete-cleanup'].includes(stage);
			assert.equal(Object.keys(current.file._management!.receipts).length, committed ? 1 : 0, stage);
			if (!committed)
				assert.equal(await readFile(f.path, 'utf8'), before, stage);
			for (const name of await readdir(f.journal.directory)) {
				const text = await readFile(join(f.journal.directory, name), 'utf8');
				assert.ok(!text.includes('secret-canary'));
				assert.ok(!text.includes('postgres://'));
				assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['expectedGeneration', 'operationId', 'ownedStagedRefs', 'phase', 'registryId']);
			}
			const vaultPath = join(f.root, 'fake-keychain.json');
			const values: Record<string, string> = JSON.parse(await readFile(vaultPath, 'utf8'));
			const keystore = { getKey: async (ref: string) => values[ref] ?? null, setKey: async (ref: string, value: string) => {
					values[ref] = value;
				}, deleteKey: async (ref: string) => {
					delete values[ref];
				} };
			const restart = await ManagedRegistry.open(f.path, { ownsRoot: async () => true });
			try {
				const journal = await PreparationJournal.open(f.path, f.file._management!.registryId);
				const generations = new CredentialGenerations(journal, 'a'.repeat(32), { keystore, current: () => readRegistrySnapshot(f.path) });
				const results = await generations.recover();
				assert.equal(results.length, 1, stage);
				assert.equal(results[0]!.committed, committed, stage);
				assert.equal(results[0]!.cleanup, 'complete', stage);
				assert.deepEqual(await journal.pending(), []);
				assert.equal(values[f.foreign], 'foreign-secret-canary');
				if (committed) {
					assert.equal(values[f.oldRef], undefined, stage);
					const refs = referencedSecrets(current.file.connections);
					assert.equal(refs.size, 1, stage);
					for (const ref of refs)
						assert.equal(values[ref], 'replacement-secret-canary/@%', stage);
				}
				else {
					assert.equal(values[f.oldRef], 'original-secret-canary', stage);
					assert.equal(Object.keys(values).length, 2, stage);
				}
				assert.ok(!(await readdir(f.root)).some(n => n.endsWith('.tmp')), stage);
				assert.deepEqual(await generations.recover(), []);
			}
			finally {
				await restart.close();
			}
		}
		finally {
			await rm(f.root, { recursive: true, force: true });
		}
	}
});
test('CM-S1-E: Keep retains the live generation and Clear removes it only after canonical commit', async () => {
	const f = await fixture();
	try {
		const previous = f.file.connections[0]!;
		const revision = f.file._management!.revisions['fixture']!;
		const key = { repoRoot: f.root, scope: 'saved' as const, id: 'fixture' };
		const keep = await materializeDraft({ key, mode: 'update', current: { config: previous, revision }, expectedRevision: revision, publicPatch: { label: 'Changed' }, readSecret: f.keystore.getKey });
		const staged = await f.generations.stage({ operationId: randomUUID(), effective: keep.config, previous, actions: keep.credentialActions });
		assert.deepEqual([...referencedSecrets(staged.config)], [f.oldRef]);
		assert.deepEqual(staged.preparation.ownedStagedRefs, []);
		assert.equal(f.data.size, 2);
		assert.deepEqual(await f.generations.recover(), [{ operationId: staged.preparation.operationId, committed: false, cleanup: 'complete' }]);
		const cleared = await materializeDraft({ key, mode: 'update', current: { config: previous, revision }, expectedRevision: revision, publicPatch: {}, credentials: { 'url.password': { action: 'clear' } }, readSecret: f.keystore.getKey });
		const next = await f.generations.stage({ operationId: randomUUID(), effective: cleared.config, previous, actions: cleared.credentialActions });
		assert.equal(next.config.secretRef, undefined);
		assert.deepEqual([...referencedSecrets(next.config)], []);
		assert.deepEqual(next.cleanupRefs, [f.oldRef]);
		assert.equal(f.data.get(f.oldRef), 'original-secret-canary');
		const operationId = next.preparation.operationId;
		const newRevision = randomUUID();
		const ticket = { operationId, lookupRoot: f.root, scope: 'saved' as const, connectionId: 'fixture', mode: 'update' as const, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), signature: 'fixture' };
		const outcome = { operationId, revision: newRevision, registration: 'persisted' as const, activation: 'pending' as const, credentialCleanup: 'pending' as const };
		await f.store.commit(f.store.snapshot, { ...f.file, connections: [next.config], _management: { ...f.file._management!, generation: randomUUID(), revisions: { fixture: newRevision }, receipts: { [operationId]: { ticket, requestMac: 'fixture-keyed-mac', outcome, cleanupRefs: next.cleanupRefs } } } });
		const committedBytes = await readFile(f.path, 'utf8');
		assert.equal(f.data.get(f.oldRef), 'original-secret-canary');
		await f.generations.recover();
		assert.equal(f.data.has(f.oldRef), false);
		assert.equal(await readFile(f.path, 'utf8'), committedBytes);
	}
	finally {
		await f.cleanup();
	}
});
test('CM-S1-E: missing live keys and unresolved journals block writes; foreign and referenced keys cannot be cleaned', async () => {
	const f = await fixture();
	try {
		f.data.delete(f.oldRef);
		await assert.rejects(f.generations.assertReady(), { code: 'recovery-required' });
		f.data.set(f.oldRef, 'original-secret-canary');
		const operationId = randomUUID();
		await f.journal.prepare({ operationId, registryId: f.journal.registryId, expectedGeneration: f.file._management!.generation, ownedStagedRefs: [f.foreign], phase: 'prepared' });
		const before = [...f.data];
		await assert.rejects(f.generations.assertReady(), { code: 'recovery-required' });
		await assert.rejects(f.generations.recover(), { code: 'recovery-required' });
		assert.deepEqual([...f.data], before);
	}
	finally {
		await f.cleanup();
	}
});
test('CM-S1-E: encoded immutable userinfo references resolve with credential escaping and no legacy regression', async () => {
	const f = await fixture();
	try {
		_setKeystoreForTests(f.keystore);
		f.data.set('encoded-ref', '/@%');
		assert.equal(await resolveSecrets('postgres://u:' + encodeURIComponent('${secret:encoded-ref}') + '@host/db'), 'postgres://u:%2F%40%25@host/db');
		assert.equal(await resolveSecrets('${secret:encoded-ref}'), '/@%');
	}
	finally {
		await f.cleanup();
	}
});
test('CM-S1-E: partial keychain failure preserves old effective credentials and recovery removes only owned staging', async () => {
	const f = await fixture();
	try {
		const before = await readFile(f.path, 'utf8');
		const owner = new CredentialGenerations(f.journal, 'a'.repeat(32), { current: () => readRegistrySnapshot(f.path), keystore: { ...f.keystore, setKey: async (ref, value) => {
					f.data.set(ref, value);
					throw new Error('private-secret-canary');
				} } });
		const previous = f.file.connections[0]!;
		const revision = f.file._management!.revisions['fixture']!;
		const draft = await materializeDraft({ key: { repoRoot: f.root, scope: 'saved', id: 'fixture' }, mode: 'update', current: { config: previous, revision }, expectedRevision: revision, publicPatch: {}, credentials: { 'url.password': { action: 'replace', value: 'replacement-secret-canary' } }, readSecret: f.keystore.getKey });
		await assert.rejects(owner.stage({ operationId: randomUUID(), effective: draft.config, previous, actions: draft.credentialActions }), err => {
			assert.equal((err as {
				code: string;
			}).code, 'recovery-required');
			assert.ok(!String(err).includes('canary'));
			return true;
		});
		assert.equal(await readFile(f.path, 'utf8'), before);
		assert.equal(f.data.get(f.oldRef), 'original-secret-canary');
		assert.equal(f.data.size, 3);
		assert.equal((await owner.recover())[0]!.cleanup, 'complete');
		assert.equal(f.data.size, 2);
		assert.equal(f.data.get(f.foreign), 'foreign-secret-canary');
	}
	finally {
		await f.cleanup();
	}
});
test('CM-S1-E: committed cleanup failure stays pending and retry preserves exact registry revision receipt and live generation', async () => {
	const f = await fixture();
	let fail = true;
	try {
		const owner = new CredentialGenerations(f.journal, 'a'.repeat(32), { current: () => readRegistrySnapshot(f.path), keystore: { ...f.keystore, deleteKey: async (ref) => {
					if (fail)
						throw new Error('private-secret-canary');
					f.data.delete(ref);
				} } });
		const previous = f.file.connections[0]!;
		const revision = f.file._management!.revisions['fixture']!;
		const draft = await materializeDraft({ key: { repoRoot: f.root, scope: 'saved', id: 'fixture' }, mode: 'update', current: { config: previous, revision }, expectedRevision: revision, publicPatch: {}, credentials: { 'url.password': { action: 'replace', value: 'replacement-secret-canary' } }, readSecret: f.keystore.getKey });
		const operationId = randomUUID();
		const staged = await owner.stage({ operationId, effective: draft.config, previous, actions: draft.credentialActions });
		const newRevision = randomUUID();
		const outcome = { operationId, revision: newRevision, registration: 'persisted' as const, activation: 'pending' as const, credentialCleanup: 'pending' as const };
		const ticket = { operationId, lookupRoot: f.root, scope: 'saved' as const, connectionId: 'fixture', mode: 'update' as const, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), signature: 'fixture' };
		await f.store.commit(f.store.snapshot, { ...f.file, connections: [staged.config], _management: { ...f.file._management!, generation: randomUUID(), revisions: { fixture: newRevision }, receipts: { [operationId]: { ticket, requestMac: 'fixture-keyed-mac', outcome, cleanupRefs: [...staged.cleanupRefs, ...referencedSecrets(staged.config)] } } } });
		const bytes = await readFile(f.path, 'utf8');
		assert.deepEqual(await owner.recover(), [{ operationId, committed: true, cleanup: 'pending' }]);
		await assert.rejects(owner.assertReady(), { code: 'recovery-required' });
		assert.equal(f.data.get(f.oldRef), 'original-secret-canary');
		fail = false;
		assert.deepEqual(await owner.recover(), [{ operationId, committed: true, cleanup: 'complete' }]);
		assert.equal(await readFile(f.path, 'utf8'), bytes);
		assert.equal(f.data.has(f.oldRef), false);
		assert.equal(f.data.get(f.foreign), 'foreign-secret-canary');
		for (const ref of referencedSecrets(staged.config))
			assert.equal(f.data.get(ref), 'replacement-secret-canary');
		await owner.assertReady();
	}
	finally {
		await f.cleanup();
	}
});
test('CM-S1-E: first-use recovery directory parent sync precedes staging and completion sync failures retain a blocking retry record', async () => {
	const f = await fixture();
	try {
		await rm(f.journal.directory, { recursive: true, force: true });
		const trace: string[] = [];
		await assert.rejects(PreparationJournal.open(f.path, f.journal.registryId, async (stage) => {
			trace.push(stage);
			if (stage === 'before-recovery-parent-sync')
				throw new Error('injected');
		}));
		assert.deepEqual(trace, ['before-recovery-parent-sync']);
		assert.equal(f.data.size, 2);
		await rm(f.journal.directory, { recursive: true, force: true });
		let fail = true;
		const journal = await PreparationJournal.open(f.path, f.journal.registryId, async (stage) => {
			trace.push(stage);
			if (stage === 'before-completion-sync' && fail)
				throw new Error('injected');
		});
		assert.ok(trace.includes('after-recovery-parent-sync'));
		const owner = new CredentialGenerations(journal, 'a'.repeat(32), { keystore: f.keystore, current: () => readRegistrySnapshot(f.path) });
		const previous = f.file.connections[0]!;
		const revision = f.file._management!.revisions['fixture']!;
		const draft = await materializeDraft({ key: { repoRoot: f.root, scope: 'saved', id: 'fixture' }, mode: 'update', current: { config: previous, revision }, expectedRevision: revision, publicPatch: { label: 'Label' }, readSecret: f.keystore.getKey });
		const staged = await owner.stage({ operationId: randomUUID(), effective: draft.config, previous, actions: draft.credentialActions });
		assert.ok(trace.indexOf('after-recovery-parent-sync') < trace.indexOf('before-preparation-sync'));
		assert.deepEqual(await owner.recover(), [{ operationId: staged.preparation.operationId, committed: false, cleanup: 'pending' }]);
		assert.deepEqual(await readdir(journal.directory), []);
		assert.equal((await journal.pending()).length, 1);
		await assert.rejects(owner.assertReady(), { code: 'recovery-required' });
		await assert.rejects(journal.prepare({ ...staged.preparation, operationId: randomUUID() }), { code: 'recovery-required' });
		fail = false;
		assert.deepEqual(await owner.recover(), [{ operationId: staged.preparation.operationId, committed: false, cleanup: 'complete' }]);
		await owner.assertReady();
		assert.deepEqual(await journal.pending(), []);
	}
	finally {
		await f.cleanup();
	}
});
