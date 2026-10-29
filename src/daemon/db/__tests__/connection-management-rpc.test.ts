import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { environment } from './fixtures/saved-management-fixture.js';
import { connectionManagementRpc, connectionManagementHandlers, CONNECTION_V2_METHODS } from '../../connection-management-rpc.js';
import { saveConnectionRpc, listConnectionsRpc, deleteConnectionRpc, testConnectionRpc } from '../../db-rpc.js';
import { managementHandshake } from '../../../shared/connection-management-wire.js';
import { connectionsPath } from '../config.js';
import { _resetCacheForTests } from '../pool-cache.js';
import { _setKeystoreForTests } from '../secrets.js';
import type { OperationTicket, MutationOutcome, ManagementCapabilities, SafeConnection } from '../../../shared/connection-management.js';
const transport = { connectionIdentity: 'fixture-socket', daemonEpoch: 'fixture-epoch' };
const call = (method: typeof CONNECTION_V2_METHODS[number], params: unknown) => connectionManagementRpc(method, params, transport);
async function create(f: Awaited<ReturnType<Awaited<ReturnType<typeof environment>>['rootFixture']>>, id = 'fixture') {
	const key = { repoRoot: f.root, scope: 'saved' as const, id };
	const ticket = await call('db.connections.v2.ticket', { key, mode: 'create' }) as OperationTicket;
	assert.ok(ticket.operationId, JSON.stringify(ticket));
	const request = { ticket, operationId: ticket.operationId, key, mode: 'create', publicPatch: { kind: 'postgres', endpoint: 'postgres://host/db', label: 'Public' }, credentials: { 'url.username': { action: 'replace', value: 'private-user-canary' }, 'url.password': { action: 'replace', value: 'private-password-canary' } } };
	const result = await call('db.connections.v2.mutate', request) as MutationOutcome;
	assert.equal(result.status, 'committed', JSON.stringify(result));
	return { key, ticket, request, result };
}
test('CM-S1-J: v2 handshake routes remain mutation-disabled before adoption and old-daemon replies become fixed upgrade-required', async () => {
	const env = await environment();
	const root = join(env.directory, 'root');
	await mkdir(root);
	try {
		assert.deepEqual(Object.keys(connectionManagementHandlers()).sort(), [...CONNECTION_V2_METHODS].sort());
		const capabilities = await call('db.connections.v2.capabilities', { repoRoot: root }) as ManagementCapabilities;
		assert.deepEqual(capabilities.features, ['safe-read', 'driver-descriptors']);
		assert.equal(capabilities.daemonEpoch, transport.daemonEpoch);
		assert.equal(managementHandshake(capabilities).status, 'ready');
		const denied = await call('db.connections.v2.ticket', { key: { repoRoot: root, scope: 'saved', id: 'fixture' }, mode: 'create' });
		assert.deepEqual(denied, { status: 'rejected', code: 'upgrade-required', message: 'Connection management is unavailable until maintenance completes.' });
		for (const result of [{ error: 'unknown method: db.connections.v2.capabilities' }, undefined, null, {}, new Error('private-canary'), { ...capabilities, version: 1 }, { ...capabilities, features: ['safe-read', 'safe-read'] }])
			assert.deepEqual(managementHandshake(result), { status: 'rejected', code: 'upgrade-required', message: 'Connection management requires a newer daemon.' });
		assert.deepEqual(await connectionManagementRpc('db.connections.v2.drivers', {}), { status: 'rejected', code: 'invalid-input', message: 'Invalid connection request.' });
	}
	finally {
		_resetCacheForTests();
		await env.cleanup();
	}
});
test('CM-S1-J: v2 safe reads legacy projections and label-only edits preserve credentials without raw fields or stored references', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	try {
		const { key, ticket, result } = await create(f);
		const snapshot = JSON.stringify([...f.values]);
		const read = await call('db.connections.v2.read', { key }) as SafeConnection;
		assert.equal(read.credentialPresence['url.password'], true);
		assert.equal(read.publicConfig.endpoint, 'postgres://host/db');
		assert.deepEqual(await listConnectionsRpc({ repoRoot: f.root }, transport), [{ id: 'fixture', kind: 'postgres', family: 'rdbms', label: 'Public' }]);
		const edited = await saveConnectionRpc({ repoRoot: f.root, config: { id: 'fixture', kind: 'postgres', label: 'Label only' } }, transport);
		assert.ok(!('error' in edited), JSON.stringify(edited));
		assert.equal(JSON.stringify([...f.values]), snapshot);
		const list = await call('db.connections.v2.list', { repoRoot: f.root }) as SafeConnection[];
		assert.equal(list[0]?.label, 'Label only');
		const status = await call('db.connections.v2.status', { ticket });
		assert.equal((status as {
			status: string;
		}).status, 'committed');
		const descriptors = await call('db.connections.v2.drivers', {});
		assert.ok(Array.isArray(descriptors));
		assert.equal(descriptors.length, 29);
		for (const response of [read, list, edited, status, descriptors, result]) {
			const text = JSON.stringify(response);
			assert.ok(!text.includes('private-password-canary') && !text.includes('private-user-canary') && !text.includes('${secret:') && !text.includes('db:v2:'));
			assert.ok(!Object.hasOwn(response as object, 'config') && !Object.hasOwn(response as object, 'secretRef'));
		}
		assert.ok('wrotePath' in edited);
		assert.ok(!('status' in edited));
	}
	finally {
		_resetCacheForTests();
		await env.cleanup();
	}
});
test('CM-S1-J: malformed unknown-field wrong-root ticket and scope payloads fail safely before mutation effects', async () => {
	const env = await environment();
	const f = await env.rootFixture('root'), other = await env.rootFixture('other');
	try {
		const key = { repoRoot: f.root, scope: 'saved', id: 'fixture' }, ticket = await call('db.connections.v2.ticket', { key, mode: 'create' }) as OperationTicket;
		const request = { ticket, operationId: ticket.operationId, key, mode: 'create', publicPatch: { kind: 'postgres', endpoint: 'postgres://host/db' } };
		f.reset();
		const before = await readFile(f.path), vault = [...f.values];
		const malformed: [
			typeof CONNECTION_V2_METHODS[number],
			unknown
		][] = [
			['db.connections.v2.capabilities', { daemonEpoch: 'private-canary' }], ['db.connections.v2.drivers', { private: 'private-canary' }], ['db.connections.v2.list', { repoRoot: f.root, rawOptions: true }],
			['db.connections.v2.read', { key: { ...key, extra: 'private-canary' } }], ['db.connections.v2.ticket', { key, mode: ['create'] }],
			['db.connections.v2.mutate', { ...request, ticket: { ...ticket, private: 'private-canary' } }], ['db.connections.v2.mutate', { ...request, key: { ...key, repoRoot: other.root } }],
			['db.connections.v2.status', { ticket: { ...ticket, signature: 'private-canary' } }], ['db.connections.v2.activate', { key, committedRevision: 'private-canary', force: true }],
			['db.connections.v2.mutate', { ...request, publicPatch: { kind: 'postgres', endpoint: 'postgres://private-user:private-password@host/db' } }],
		];
		for (const [method, params] of malformed) {
			const result = await call(method, params) as MutationOutcome;
			assert.equal(result.status, method === 'db.connections.v2.status' ? 'reconciliation-required' : 'rejected', JSON.stringify(result));
			assert.ok(!JSON.stringify(result).includes('private-canary') && !JSON.stringify(result).includes('private-password'));
		}
		assert.deepEqual(await readFile(f.path), before);
		assert.deepEqual([...f.values], vault);
		assert.equal(f.counts.stages, 0);
		assert.equal(f.counts.writes, 0);
		assert.equal(f.counts.sets, 0);
		assert.deepEqual(await call('db.connections.v2.read', { key: { ...key, scope: 'temporary' } }), { status: 'rejected', code: 'upgrade-required', message: 'Connection management is unavailable until maintenance completes.' });
	}
	finally {
		_resetCacheForTests();
		await env.cleanup();
	}
});
test('CM-S1-R: a v2 refresh failure retries only safe list and preserves exact committed receipt revision bytes and keys', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	try {
		await create(f);
		const before = await readFile(f.path), vault = [...f.values];
		f.reset();
		const original = f.pool.safeList.bind(f.pool);
		let fail = true;
		const list = mock.method(f.pool, 'safeList', () => {
			if (fail) {
				fail = false;
				throw new Error('private-canary');
			}
			return original();
		});
		const ticket = mock.method(f.service, 'ticket', async () => {
			throw new Error('refresh must not mint ticket');
		}), mutate = mock.method(f.service, 'mutate', async () => {
			throw new Error('refresh must not mutate');
		});
		try {
			const failure = await call('db.connections.v2.list', { repoRoot: f.root }) as MutationOutcome;
			assert.equal(failure.status, 'rejected');
			assert.ok(!JSON.stringify(failure).includes('private-canary'));
			assert.equal((await call('db.connections.v2.list', { repoRoot: f.root }) as SafeConnection[]).length, 1);
			assert.equal(ticket.mock.callCount(), 0);
			assert.equal(mutate.mock.callCount(), 0);
			assert.equal(f.counts.writes, 0);
			assert.equal(f.counts.stages, 0);
			assert.equal(f.counts.sets, 0);
			assert.deepEqual(await readFile(f.path), before);
			assert.deepEqual([...f.values], vault);
		}
		finally {
			list.mock.restore();
			ticket.mock.restore();
			mutate.mock.restore();
		}
	}
	finally {
		_resetCacheForTests();
		await env.cleanup();
	}
});
test('CM-S1-J: legacy unmanaged success hides secret references and managed removal refuses without changing state', async () => {
	const env = await environment();
	const secrets = new Map<string, string>();
	const previous = _setKeystoreForTests({ getKey: async ref => secrets.get(ref) ?? null, setKey: async (ref, value) => { secrets.set(ref, value); }, deleteKey: async ref => { secrets.delete(ref); } });
	const root = join(env.directory, 'unmanaged');
	await mkdir(root);
	const f = await env.rootFixture('managed');
	try {
		const result = await saveConnectionRpc({ repoRoot: root, config: { id: 'file', kind: 'postgres', url: 'postgres://user:legacy-private-canary@host/db' } }, transport);
		assert.ok(!('error' in result));
		assert.equal(secrets.size, 1);
		const persisted = await readFile(connectionsPath(root), 'utf8');
		assert.ok(persisted.includes('${secret:'));
		assert.ok(!persisted.includes('legacy-private-canary'));
		assert.deepEqual(Object.keys(result).sort(), ['family', 'id', 'redactedUrl', 'wrotePath']);
		for (const response of [result, await listConnectionsRpc({ repoRoot: root }, transport)]) {
			const serialized = JSON.stringify(response);
			assert.ok(!serialized.includes('${secret:') && !serialized.includes('legacy-private-canary'));
			for (const ref of secrets.keys()) assert.ok(!serialized.includes(ref));
		}
		assert.equal((await deleteConnectionRpc({ repoRoot: root, id: 'file' }, transport) as {
			removed: boolean;
		}).removed, true);
		const before = await readFile(f.path);
		const denied = await deleteConnectionRpc({ repoRoot: f.root, id: 'fixture' }, transport);
		assert.ok('error' in denied);
		assert.deepEqual(await readFile(f.path), before);
		const badProbe = await testConnectionRpc({ repoRoot: root, config: { id: 'missing', kind: 'csv', path: 'private-filename.csv' } });
		assert.ok(!JSON.stringify(badProbe).includes(root) && !JSON.stringify(badProbe).includes('private-filename'));
	}
	finally {
		_setKeystoreForTests(previous);
		_resetCacheForTests();
		await env.cleanup();
	}
});
test('CM-S1-C: v2 credential Keep Replace Clear and activation-only retry preserve safe exact outcomes', async () => {
	const env = await environment();
	const f = await env.rootFixture('root');
	try {
		const initial = await create(f);
		const capabilities = await call('db.connections.v2.capabilities', { repoRoot: f.root }) as ManagementCapabilities;
		assert.ok(capabilities.features.includes('saved-update'));
		assert.ok(!capabilities.features.some(feature => feature.includes('temporary-create') || feature.includes('remove')));
		let safe = await call('db.connections.v2.read', { key: initial.key }) as SafeConnection;
		for (const credential of [{ action: 'clear' }, { action: 'replace', value: 'new-private-password-canary' }]) {
			const ticket = await call('db.connections.v2.ticket', { key: initial.key, mode: 'update' }) as OperationTicket;
			const outcome = await call('db.connections.v2.mutate', { ticket, operationId: ticket.operationId, key: initial.key, mode: 'update', expectedRevision: safe.revision, publicPatch: { label: 'Edited' }, credentials: { 'url.password': credential } }) as MutationOutcome;
			assert.equal(outcome.status, 'committed', JSON.stringify(outcome));
			safe = await call('db.connections.v2.read', { key: initial.key }) as SafeConnection;
			assert.equal(safe.credentialPresence['url.password'], credential.action === 'replace');
			assert.equal(safe.credentialPresence['url.username'], true);
			assert.ok(!JSON.stringify(outcome).includes('private-password-canary'));
			assert.ok(!JSON.stringify(safe).includes('${secret:'));
		}
		const before = await readFile(f.path), vault = [...f.values];
		f.reset();
		const activated = await call('db.connections.v2.activate', { key: initial.key, committedRevision: safe.revision }) as MutationOutcome;
		assert.equal(activated.status, 'committed', JSON.stringify(activated));
		assert.equal(f.counts.writes, 0);
		assert.equal(f.counts.stages, 0);
		assert.equal(f.counts.sets, 0);
		assert.deepEqual(await readFile(f.path), before);
		assert.deepEqual([...f.values], vault);
	}
	finally {
		_resetCacheForTests();
		await env.cleanup();
	}
});

test('CM-S4-INPUT/RPC: saved removal requires sc6 and accepts only exact authenticated ticket requests', async () => {
 const env=await environment(),f=await env.rootFixture('remove-root');
 const removeCall=(method:typeof CONNECTION_V2_METHODS[number],value:unknown)=>connectionManagementRpc(method,value,transport,{removalEnabled:async()=>true});
 try{
  const {key,result}=await create(f);assert.equal(result.status,'committed');if(result.status!=='committed')throw new Error('fixture');
  assert.equal((await call('db.connections.v2.ticket',{key,mode:'remove'}) as any).code,'upgrade-required');
  const caps=await removeCall('db.connections.v2.capabilities',{repoRoot:f.root}) as ManagementCapabilities;
  assert.ok(caps.features.includes('saved-remove'));assert.ok(caps.features.includes('removal-state'));
  const ticket=await removeCall('db.connections.v2.ticket',{key,mode:'remove'}) as OperationTicket;
  assert.equal(ticket.mode,'remove');
  for(const method of ['db.connections.v2.removalState','db.connections.v2.retryRemovalCleanup'] as const){
   for(const value of [{ticket,revision:result.value.revision},{ticket,key},null])assert.equal((await removeCall(method,value) as any).code,'invalid-input');
   assert.equal((await removeCall(method,{ticket:{...ticket,mode:'update'}}) as any).code,'operation-mismatch');
   assert.equal((await call(method,{ticket}) as any).code,'upgrade-required');
   assert.equal((await connectionManagementRpc(method,{ticket:{...ticket,signature:'A'.repeat(ticket.signature.length)}},transport,{removalEnabled:async()=>true}) as any).code,'invalid-input');
  }
  const request={key,ticket,operationId:ticket.operationId,mode:'remove',expectedRevision:result.value.revision};
  assert.equal((await removeCall('db.connections.v2.mutate',request) as any).value.registration,'removed');
  assert.equal((await removeCall('db.connections.v2.removalState',{ticket}) as any).state,'removed');
  assert.equal((await removeCall('db.connections.v2.retryRemovalCleanup',{ticket}) as any).state,'removed');
  assert.equal((await removeCall('db.connections.v2.mutate',request) as any).value.registration,'removed');
  assert.deepEqual(await call('db.connections.v2.list',{repoRoot:f.root}),[]);
 }finally{_resetCacheForTests();await env.cleanup();}
});
