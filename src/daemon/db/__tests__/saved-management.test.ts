import test from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { mkdtemp, mkdir, writeFile, readFile, rm, realpath, chmod } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PATHS } from '../../../shared/paths.js';
import { connectionsPath } from '../config.js';
import { ManagedRegistry, PreparationJournal } from '../managed-store.js';
import { SavedTicketAuthority } from '../management-tickets.js';
import { CredentialGenerations, _setKeystoreForTests } from '../secrets.js';
import { DriverPool } from '../pool.js';
import { SavedConnectionManagement, installSavedManagement } from '../management.js';
import { connectionManagementRpc } from '../../connection-management-rpc.js';
import { saveConnectionRpc } from '../../db-rpc.js';
import type { Driver, ConnectionConfig } from '../../../shared/db-driver.js';
import { setTimeout as delay } from 'node:timers/promises';
import type { MutationRequest, MutationOutcome } from '../../../shared/connection-management.js';
import '../drivers/index.js';
import { environment, committed, deferred } from './fixtures/saved-management-fixture.js';
test('CM-S1-B: actual mutation path rejects duplicate stale missing and busy intent before credential or writer ports', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	try {
		const created = committed(await f.service.mutate(f.context, await f.request('fixture')));
		for (const [id, mode, revision, code] of [['fixture', 'create', undefined, 'duplicate-id'], ['missing', 'update', created.revision, 'not-found'], ['fixture', 'update', 'stale', 'conflict']] as const) {
			const request = await f.request(id, mode, revision);
			const before = [...f.values];
			f.reset();
			const result = await f.service.mutate(f.context, request);
			assert.equal(result.status, 'rejected');
			if (result.status === 'rejected')
				assert.equal(result.code, code);
			assert.deepEqual(f.counts, { gets: 0, credentialGets: 0, sets: 0, deletes: 0, stages: 0, writes: 0 });
			assert.deepEqual([...f.values], before);
		}
		const request = await f.request('fixture', 'update', created.revision);
		const lease = await f.pool.lease('fixture');
		f.reset();
		const result = await f.service.mutate(f.context, request);
		assert.deepEqual(f.counts, { gets: 0, credentialGets: 0, sets: 0, deletes: 0, stages: 0, writes: 0 });
		assert.equal(result.status, 'rejected');
		if (result.status === 'rejected')
			assert.equal(result.code, 'busy');
		await lease.release();
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-D: same-root concurrent creates commit once and independent roots do not share serialization', async () => {
	const env = await environment();
	const a = await env.rootFixture('a');
	const b = await env.rootFixture('b');
	try {
		const requests = [await a.request('fixture'), await a.request('fixture')];
		a.reset();
		const results = await Promise.all(requests.map(r => a.service.mutate(a.context, r)));
		assert.equal(results.filter(r => r.status === 'committed').length, 1);
		assert.equal(results.filter(r => r.status === 'rejected' && r.code === 'duplicate-id').length, 1);
		assert.equal(Object.keys(JSON.parse(await readFile(a.path, 'utf8'))._management.receipts).length, 1);
		assert.equal(a.counts.stages, 2);
		assert.equal((await a.service.list(a.context)).length, 1);
		const barrier = a.pool.beginMutation('blocked', 'create');
		const ar = await a.request('blocked');
		const br = await b.request('fixture');
		const other = await b.service.mutate(b.context, br);
		committed(other);
		const blocked = await a.service.mutate(a.context, ar);
		assert.equal(blocked.status, 'rejected');
		barrier();
		assert.equal((await b.service.list(b.context))[0]!.key.repoRoot, b.root);
		const started = deferred();
		const resume = deferred();
		a.hooks.stage = async () => {
			started.resolve();
			await resume.promise;
		};
		const pausedRequest = await a.request('paused');
		const independentRequest = await b.request('independent');
		const paused = a.service.mutate(a.context, pausedRequest);
		try {
			await started.promise;
			const independent = await Promise.race([b.service.mutate(b.context, independentRequest), delay(1000, undefined)]);
			assert.ok(independent, 'other root must commit while the first root is paused');
			committed(independent);
		}
		finally {
			resume.resolve();
		}
		committed(await paused);
		a.hooks.stage = undefined;
		const original = committed(results.find(r => r.status === 'committed')!);
		const stale = await a.request('fixture', 'update', original.revision);
		const snapshot = a.store.snapshot;
		await a.store.commit(snapshot, { ...snapshot.file, connections: snapshot.file.connections.filter(c => c.id !== 'fixture'), _management: { ...snapshot.file._management!, generation: randomUUID() } });
		await a.pool.reload();
		const missing = await a.service.mutate(a.context, stale);
		assert.equal(missing.status, 'rejected');
		if (missing.status === 'rejected')
			assert.equal(missing.code, 'not-found');
		const recreated = committed(await a.service.mutate(a.context, await a.request('fixture')));
		assert.notEqual(recreated.revision, original.revision);
		const obsolete = await a.service.mutate(a.context, stale);
		assert.equal(obsolete.status, 'rejected');
		if (obsolete.status === 'rejected')
			assert.equal(obsolete.code, 'conflict');
		const first = results.find(r => r.status === 'committed')!;
		assert.ok(!JSON.stringify(first).includes('secret-canary'));
		assert.deepEqual(JSON.parse(await readFile(a.path, 'utf8')).retainedDocument, { exact: true });
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-U: v2 dispatch and real legacy save reject corrupt unreadable registries before every staging and writer effect', async () => {
	const env = await environment();
	try {
		for (const failure of ['malformed', 'shape', 'EACCES', 'EPERM', 'EIO'] as const) {
			const f = await env.rootFixture(failure);
			const request = await f.request('fixture');
			if (failure === 'malformed' || failure === 'shape') {
				await chmod(f.path, 0o600);
				await writeFile(f.path, failure === 'malformed' ? '{invalid-private-canary' : JSON.stringify({ connections: [{ id: 'private-canary' }] }));
			}
			const before = await readFile(f.path, 'utf8');
			const keys = [...f.values];
			f.reset();
			let writes = 0, renames = 0;
			const originalRead = fsPromises.readFile;
			const originalWrite = fsPromises.writeFile;
			const originalRename = fsPromises.rename;
			const read = mock.method(fsPromises, 'readFile', async (...args: Parameters<typeof originalRead>) => {
				if (args[0] === f.path && !['malformed', 'shape'].includes(failure))
					throw Object.assign(new Error('private-canary'), { code: failure });
				return originalRead(...args);
			});
			const write = mock.method(fsPromises, 'writeFile', async (...args: Parameters<typeof originalWrite>) => {
				writes++;
				return originalWrite(...args);
			});
			const rename = mock.method(fsPromises, 'rename', async (...args: Parameters<typeof originalRename>) => {
				renames++;
				return originalRename(...args);
			});
			syncBuiltinESMExports();
			try {
				const result = await connectionManagementRpc('db.connections.v2.mutate', request, { connectionIdentity: f.context.connectionIdentity, daemonEpoch: f.context.access.daemonEpoch }) as MutationOutcome;
				assert.equal(result.status, 'rejected');
				if (result.status === 'rejected') {
					assert.equal(result.code, 'registry-unreadable');
					assert.ok(result.message.length > 0);
					assert.ok(!JSON.stringify(result).includes('canary'));
				}
				const legacy = await saveConnectionRpc({ repoRoot: f.root, config: { id: 'fixture', kind: 'postgres', url: 'postgres://u:replacement-secret-canary@host/db' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
				assert.ok('error' in legacy);
				if ('error' in legacy) {
					assert.match(legacy.error, /registry-unreadable/);
					assert.ok(!legacy.error.includes('canary'));
				}
				assert.deepEqual(f.counts, { gets: 0, credentialGets: 0, sets: 0, deletes: 0, stages: 0, writes: 0 });
				assert.equal(writes, 0);
				assert.equal(renames, 0);
				assert.deepEqual([...f.values], keys);
			}
			finally {
				read.mock.restore();
				write.mock.restore();
				rename.mock.restore();
				syncBuiltinESMExports();
			}
			assert.equal(await readFile(f.path, 'utf8'), before);
		}
		const root = join(env.directory, 'unmanaged');
		await mkdir(root);
		const values = new Map<string, string>();
		_setKeystoreForTests({ getKey: async (ref) => values.get(ref) ?? null, setKey: async (ref, value) => {
				values.set(ref, value);
			}, deleteKey: async (ref) => {
				values.delete(ref);
			} });
		const empty = await saveConnectionRpc({ repoRoot: root, config: { id: 'fixture', kind: 'csv', path: 'fixture.csv' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
		assert.ok(!('error' in empty));
		assert.equal(JSON.parse(await readFile(connectionsPath(root), 'utf8')).connections.length, 1);
		assert.equal(values.size, 0);
	}
	finally {
		await env.cleanup();
	}
});
test('CM-S1-B: legacy upsert is serialized through the same managed gate and preserves private fields and pinned family', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	const entered = deferred(), resume = deferred();
	f.hooks.stage = async () => {
		f.hooks.stage = undefined;
		entered.resolve();
		await resume.promise;
	};
	try {
		const first = saveConnectionRpc({ repoRoot: f.root, config: { id: 'fixture', kind: 'postgres', url: 'postgres://u:first-secret-canary@host/db', label: 'First' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
		// Establish gate admission order, rather than relying on asynchronous preflight completion order.
		await entered.promise;
		const second = saveConnectionRpc({ repoRoot: f.root, config: { id: 'fixture', kind: 'postgres', url: 'postgres://u:second-secret-canary@host/db', label: 'Second' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
		resume.resolve();
		const outcomes = await Promise.all([first, second]);
		for (const result of outcomes) {
			assert.ok(!('error' in result), JSON.stringify(result));
			assert.ok(!JSON.stringify(result).includes('secret-canary'));
			assert.ok(!JSON.stringify(result).includes('db:v2:'));
		}
		const file = JSON.parse(await readFile(f.path, 'utf8'));
		assert.equal(file.connections.length, 1);
		assert.equal(file.connections[0].label, 'Second');
		assert.equal(file.connections[0].family, 'rdbms');
		assert.equal(Object.keys(file._management.receipts).length, 2);
		assert.deepEqual(file.retainedDocument, { exact: true });
		const pinned = await env.rootFixture('pinned', { id: 'fixture', kind: 'postgres', family: 'kv', url: 'postgres://u:original-secret-canary@host/db', namespace: { allow: ['retained'] } });
		const edit = await saveConnectionRpc({ repoRoot: pinned.root, config: { id: 'fixture', kind: 'postgres', url: 'postgres://u:new-secret-canary@host/db', label: 'Pinned edit' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
		assert.ok(!('error' in edit), JSON.stringify(edit));
		const updated = JSON.parse(await readFile(pinned.path, 'utf8')).connections[0];
		assert.equal(updated.family, 'kv');
		assert.deepEqual(updated.namespace, { allow: ['retained'] });
		assert.equal(updated.label, 'Pinned edit');
	}
	finally {
		resume.resolve();
		await env.cleanup();
	}
});
test('CM-S1-U: unmanaged legacy compatibility also rejects corrupt registry reads before password extraction', async () => {
	const env = await environment();
	let keyWrites = 0;
	const keys = new Map<string, string>([['foreign', 'unchanged']]);
	_setKeystoreForTests({ getKey: async (ref) => keys.get(ref) ?? null, setKey: async (ref, value) => {
			keyWrites++;
			keys.set(ref, value);
		}, deleteKey: async (ref) => {
			keys.delete(ref);
		} });
	try {
		for (const code of ['malformed', 'shape', 'EACCES', 'EPERM', 'EIO'] as const) {
			const root = join(env.directory, 'legacy-' + code);
			await mkdir(root);
			const path = connectionsPath(root);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, code === 'malformed' ? '{private-canary' : code === 'shape' ? '{}' : '{"connections":[]}');
			const before = await readFile(path, 'utf8');
			const original = fsPromises.readFile;
			const read = mock.method(fsPromises, 'readFile', async (...args: Parameters<typeof original>) => {
				if (args[0] === path && !['malformed', 'shape'].includes(code))
					throw Object.assign(new Error('private-canary'), { code });
				return original(...args);
			});
			syncBuiltinESMExports();
			try {
				const result = await saveConnectionRpc({ repoRoot: root, config: { id: 'fixture', kind: 'postgres', url: 'postgres://u:replacement-secret-canary@host/db' } }, {connectionIdentity:'fixture-transport',daemonEpoch:'fixture-epoch'});
				assert.ok('error' in result);
				if ('error' in result) {
					assert.match(result.error, /registry-unreadable/);
					assert.ok(!result.error.includes('canary'));
				}
				assert.equal(keyWrites, 0);
				assert.deepEqual([...keys], [['foreign', 'unchanged']]);
			}
			finally {
				read.mock.restore();
				syncBuiltinESMExports();
			}
			assert.equal(await readFile(path, 'utf8'), before);
		}
	}
	finally {
		await env.cleanup();
	}
});
