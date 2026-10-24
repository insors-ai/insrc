import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, realpath, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PATHS } from '../../../shared/paths.js';
import { connectionsPath, repoIdOf } from '../config.js';
import { adoptManagedRoot } from '../management-adoption.js';
import { openManagedRoot } from '../management-startup.js';
import { makeSecretRef, referencedSecrets, _setKeystoreForTests } from '../secrets.js';
import { savedManagementFor } from '../management.js';
import { DriverPool } from '../pool.js';
import type { Driver } from '../../../shared/db-driver.js';
import '../drivers/index.js';
async function fixture(use: (f: {
	root: string;
	path: string;
	values: Map<string, string>;
	ports: Parameters<typeof adoptManagedRoot>[1];
}) => Promise<void>) {
	const dir = await realpath(await mkdtemp(join(tmpdir(), 'cm-adoption-'))), original = PATHS.insrc;
	Object.defineProperty(PATHS, 'insrc', { value: join(dir, 'insrc'), configurable: true });
	try {
		const root = join(dir, 'repo');
		await mkdir(root);
		const path = connectionsPath(root);
		await mkdir(dirname(path), { recursive: true, mode: 0o700 });
		const values = new Map<string, string>(), keystore = { getKey: async (ref: string) => values.get(ref) ?? null, setKey: async (ref: string, value: string) => {
				values.set(ref, value);
			}, deleteKey: async (ref: string) => {
				values.delete(ref);
			} };
		const originalKeystore = _setKeystoreForTests(keystore);
		try {
			await use({ root, path, values, ports: { isRegistered: async (r) => r === root, keystore, enablement: async () => ({ ready: true, digest: 'a'.repeat(64) }), stopped: { source: 'safe-stop-control', pid: 2147483647, processIdentity: 'b'.repeat(64), stoppedAt: new Date().toISOString() } } });
		}
		finally {
			_setKeystoreForTests(originalKeystore);
		}
	}
	finally {
		Object.defineProperty(PATHS, 'insrc', { value: original, configurable: true });
		await rm(dir, { recursive: true, force: true });
	}
}
test('stopped adoption migrates fixed credentials, preserves rollback preimage and restarts with the same registry identity', async () => fixture(async (f) => {
	const oldRef = makeSecretRef(repoIdOf(f.root), 'warehouse');
	f.values.set(oldRef, 'legacy-secret-canary');
	const original = JSON.stringify({ connections: [{ id: 'warehouse', kind: 'postgres', url: 'postgres://user:${secret:' + oldRef + '}@host/db', secretRef: oldRef }], retained: { exact: true } });
	await writeFile(f.path, original, { mode: 0o600 });
	await chmod(dirname(f.path), 0o755);
	await adoptManagedRoot(f.root, f.ports);
	const text = await readFile(f.path, 'utf8'), doc = JSON.parse(text);
	assert(!text.includes('legacy-secret-canary'));
	assert.deepEqual(doc.retained, { exact: true });
	assert.equal(f.values.get(oldRef), 'legacy-secret-canary');
	for (const ref of referencedSecrets(doc.connections))
		assert(ref.startsWith('db:v2:'));
	const pool = new DriverPool(f.root, { factory: () => async (config) => ({ id: config.id, kind: config.kind, family: 'rdbms', close: async () => {
			} } as Driver) });
	const owner = await openManagedRoot(f.root, { ...f.ports, pool: async () => {
			await pool.reload();
			return pool;
		} });
	try {
		const service = savedManagementFor(f.root)!;
		assert(service);
		const list = await service.list({ connectionIdentity: 'fixture', access: { lookupRoot: f.root, managementRepoRoot: f.root, daemonEpoch: 'fixture' } });
		assert.equal(list.length, 1);
		await assert.rejects(openManagedRoot(f.root, f.ports));
	}
	finally {
		await owner.close();
		await pool.closeAll();
	}
	assert.equal(JSON.parse(await readFile(f.path, 'utf8'))._management.registryId, doc._management.registryId);
	const rollbackRef = [...f.values.keys()].find(ref => ref.startsWith('db:rollback:'))!;
	const rollbackValue = f.values.get(rollbackRef)!;
	f.values.delete(rollbackRef);
	await assert.rejects(openManagedRoot(f.root, f.ports));
	f.values.set(rollbackRef, rollbackValue);
	await chmod(f.path, 0o600);
	await assert.rejects(openManagedRoot(f.root, f.ports));
}));
test('adoption refuses live daemon, unclassified private fields and missing release gates without credential writes', async () => fixture(async (f) => {
	await writeFile(f.path, JSON.stringify({ connections: [] }), { mode: 0o600 });
	await assert.rejects(adoptManagedRoot(f.root, { ...f.ports, stopped: { ...f.ports.stopped, pid: process.pid } }));
	await assert.rejects(adoptManagedRoot(f.root, { ...f.ports, enablement: async () => ({ ready: false, digest: '0'.repeat(64) }) }));
	await writeFile(f.path, JSON.stringify({ connections: [{ id: 'bad', kind: 'postgres', url: 'postgres://host/db', options: { unclassifiedSecret: 'canary' } }] }));
	await assert.rejects(adoptManagedRoot(f.root, f.ports));
	assert.equal(f.values.size, 0);
}));
test('CM-S1-N: adopted fixture supports create update activation failure and signed replay after restart', async () => fixture(async (f) => {
	await writeFile(f.path, JSON.stringify({ connections: [] }), { mode: 0o600 });
	await adoptManagedRoot(f.root, f.ports);
	let fail = true;
	const pool = new DriverPool(f.root, { factory: () => async (config) => {
			if (fail)
				throw new Error('fixture activation failure');
			return { id: config.id, kind: config.kind, family: 'rdbms', close: async () => {
				} } as Driver;
		} });
	const ports = { ...f.ports, pool: async () => {
			await pool.reload();
			return pool;
		} }, context = { connectionIdentity: 'fixture', access: { lookupRoot: f.root, managementRepoRoot: f.root, daemonEpoch: 'fixture' } };
	let owner = await openManagedRoot(f.root, ports);
	try {
		let service = savedManagementFor(f.root)!;
		const key = { repoRoot: f.root, scope: 'saved' as const, id: 'created' }, ticket = await service.ticket(context, key, 'create');
		const request = { ticket, operationId: ticket.operationId, key, mode: 'create' as const, publicPatch: { kind: 'postgres', endpoint: 'postgres://host/db' }, credentials: { 'url.password': { action: 'replace' as const, value: 'new-secret-canary' } } };
		const created = await service.mutate(context, request);
		assert.equal(created.status, 'committed');
		if (created.status !== 'committed')
			throw new Error();
		assert.equal(created.value.activation, 'failed');
		assert(!(await readFile(f.path, 'utf8')).includes('new-secret-canary'));
		await owner.close();
		owner = await openManagedRoot(f.root, ports);
		service = savedManagementFor(f.root)!;
		assert.equal((await service.status(context, ticket)).status, 'committed');
		const count = f.values.size;
		assert.equal((await service.mutate(context, request)).status, 'committed');
		assert.equal(f.values.size, count);
		fail = false;
		const retry = await service.retryActivation(context, { key, committedRevision: created.value.revision });
		assert.equal(retry.status, 'committed');
		if (retry.status !== 'committed')
			throw new Error();
		assert.equal(retry.value.activation, 'active');
		const updateTicket = await service.ticket(context, key, 'update');
		const changed = await service.mutate(context, { ticket: updateTicket, operationId: updateTicket.operationId, key, mode: 'update', expectedRevision: created.value.revision, publicPatch: { label: 'Updated' } });
		assert.equal(changed.status, 'committed');
		assert.equal((await service.list(context))[0]?.label, 'Updated');
	}
	finally {
		await owner.close();
		await pool.closeAll();
	}
}));
