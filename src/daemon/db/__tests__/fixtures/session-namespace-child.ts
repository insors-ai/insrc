import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { mkdir, writeFile, readFile, symlink, chmod } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { ConnectionSessionRpc,connectionSessionRuntime } from '../../../connection-session-rpc.js';
import { connectionManagementHandlers } from '../../../connection-management-rpc.js';
import { saveConnectionRpc } from '../../../db-rpc.js';
import { IpcServer, directDispatch } from '../../../server.js';
import { Router } from '../../../threads/router.js';
import { TargetRegistry } from '../../../threads/registry.js';
import { TemporaryConnectionOverlay, createTemporaryOverlay } from '../../session-entries.js';
import { assertSavedUpsertRoot } from '../../connection-reservations.js';
import { connectionsPath } from '../../config.js';
import { _setKeystoreForTests } from '../../secrets.js';
import { DriverPool } from '../../pool.js';
import { createConnectionResolver, SessionAccessError } from '../../pool-cache.js';
import { environment, deferred } from './saved-management-fixture.js';
import { sessionRpcClient } from './session-rpc-client.js';
import type { OperationTicket, MutationRequest, MutationOutcome, SafeConnection, ConnectionResolver, ConnectionAccessContext, OpenConnectionSessionResult } from '../../../../shared/connection-management.js';
import type { ConnectionSessionRpcPorts } from '../../../connection-session-rpc.js';
import '../../drivers/index.js';

function rejected(value: unknown, expected: string) { assert.ok(value && typeof value === 'object' && 'code' in value); assert.equal(value.code, expected); }
function savedSuccess(value: unknown, v2: boolean) { assert.ok(value && typeof value === 'object'); if (v2) { assert.ok('status' in value); assert.equal(value.status, 'committed'); } else assert.ok(!('error' in value), JSON.stringify(value)); }
function savedDuplicate(value: unknown, v2: boolean) { if (v2) rejected(value, 'duplicate-id'); else { assert.ok(value && typeof value === 'object' && 'error' in value); assert.match(String(value.error), /^duplicate-id:/); } }
async function serverFixture(path: string, root: string, extra: Partial<ConnectionSessionRpcPorts<TemporaryConnectionOverlay>> = {}) {
	const runtime = new ConnectionSessionRpc<TemporaryConnectionOverlay>({ enabled: async () => true, isRegistered: async candidate => candidate === root, createOverlay: createTemporaryOverlay, dropOverlay: overlay => overlay.close(), ...extra });
	const registry = new TargetRegistry(), { port1, port2 } = new MessageChannel(); registry.register({ threadId: 88, cls: 'session' }); let workerCalls = 0;
	port2.on('message', request => { workerCalls++; port2.postMessage({ kind: 'reply', requestId: request.requestId, result: 'wrong-worker' }); });
	const router = new Router({ classOf: () => 'session', registry, routed: new Set(['session']), local: directDispatch({ ...connectionManagementHandlers({ sessionRuntime: runtime }), 'db.saveConnection': saveConnectionRpc }) }); router.attach(88, port1);
	const server = new IpcServer(runtime.forward(router.forward), Date.now, path); server.onConnectionClose(context => runtime.disconnect(context)); await server.listen();
	return { runtime, get workerCalls() { return workerCalls; }, close: async () => { await server.close(); await runtime.close(); router.detach(88); port1.close(); port2.close(); } };
}
async function draft(client: Awaited<ReturnType<typeof sessionRpcClient>>, root: string, id = 'same', patch: Record<string, unknown> = { kind: 'postgres', endpoint: 'postgres://host/db' }): Promise<MutationRequest> {
	const key = { repoRoot: root, scope: 'temporary' as const, id }, ticket = await client.call<OperationTicket>('db.connections.v2.ticket', { key, mode: 'create' });
	assert.ok(ticket.signature, JSON.stringify(ticket)); return { key, ticket, operationId: ticket.operationId, mode: 'create', publicPatch: patch };
}

test('CM-S3-NAMESPACE: alias relative and trailing writes refuse while actual saved and temporary SQLite rows stay separate', async () => {
	// This fixture owns its registration/session authority; exclude the production singleton.
    await connectionSessionRuntime.close();
    const env = await environment(), root = join(env.directory, 'root'), alias = join(env.directory, 'alias'); await mkdir(root); await symlink(root, alias);
	const savedPath = join(root, 'saved.sqlite'), temporaryPath = join(root, 'temporary.sqlite');
	for (const [path, marker] of [[savedPath, 'saved-alias'], [temporaryPath, 'temporary-canonical']] as const) { const db = new DatabaseSync(path); db.exec(`CREATE TABLE data(marker TEXT); INSERT INTO data VALUES ('${marker}');`); db.close(); }
	for (const [target, connections] of [[root, []], [alias, [{ id: 'common', kind: 'sqlite', path: join(alias, 'saved.sqlite') }]]] as const) { const path = connectionsPath(target); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify({ connections, namespace: target }) + '\n'); }
	assert.notEqual(connectionsPath(root), connectionsPath(alias));
	let overlay: TemporaryConnectionOverlay | undefined;
	const s = await serverFixture(join(env.directory, 'namespace.sock'), root, { createOverlay: (r, handle, context) => { const value = createTemporaryOverlay(r, handle, context); if (r === root) overlay = value; return value; } });
	const ui = await sessionRpcClient(join(env.directory, 'namespace.sock')), legacy = await sessionRpcClient(join(env.directory, 'namespace.sock'));
	const pools = new Map<string, DriverPool>(), roots: string[] = []; let expectedHandle = '';
	const poolSource = async (lookupRoot: string) => { roots.push(lookupRoot); let pool = pools.get(lookupRoot); if (!pool) { pool = new DriverPool(lookupRoot); pools.set(lookupRoot, pool); } await pool.reload(); return pool; };
	const operationSignal = new AbortController().signal;
	const privateOverlay: ConnectionResolver = {
		list: async () => overlay!.list(),
		lease: async (context, id) => overlay!.resolver(context, { assertActive: () => { overlay!.list(); }, signal: operationSignal }).lease(context, id),
		withConnection: async (context, id, use) => overlay!.resolver(context, { assertActive: () => { overlay!.list(); }, signal: operationSignal }).withConnection(context, id, use),
	};
	const resolver = createConnectionResolver({ poolSource, sessionOverlay: async context => { if (context.lookupRoot !== root || context.sessionHandle !== expectedHandle) throw new SessionAccessError(); return privateOverlay; } });
	const savedContext: ConnectionAccessContext = { lookupRoot: alias, daemonEpoch: 'epoch' };
	const rows = (context: ConnectionAccessContext) => resolver.withConnection(context, 'common', async driver => { assert.equal(driver.family, 'rdbms'); if (driver.family !== 'rdbms') throw new Error('Expected SQLite'); return driver.sample('data', { limit: 1 }); });
	try {
		const beforeAlias = await readFile(connectionsPath(alias)), beforeCanonical = await readFile(connectionsPath(root));
		assert.ok(JSON.stringify(await rows(savedContext)).includes('saved-alias'));
		const opened = await ui.call<OpenConnectionSessionResult>('db.connections.v2.session.open', { repoRoot: root }); expectedHandle = opened.sessionHandle;
		await assert.doesNotReject(assertSavedUpsertRoot(join(root, 'unresolved-legacy-target')));
		const nested = join(root, 'nested'); await mkdir(nested); const nestedPath = join(nested, 'source.sqlite'), nestedDb = new DatabaseSync(nestedPath); nestedDb.exec("CREATE TABLE data(marker TEXT); INSERT INTO data VALUES ('nested-saved');"); nestedDb.close();
		const nestedRoot = relative(process.cwd(), nested); savedSuccess(await legacy.call('db.saveConnection', { repoRoot: nestedRoot, config: { id: 'common', kind: 'sqlite', path: nestedPath } }), false);
		assert.ok(JSON.stringify(await rows({ lookupRoot: nestedRoot, daemonEpoch: 'epoch' })).includes('nested-saved'));
		const targets = [alias, root + '/', relative(process.cwd(), root)];
		await chmod(connectionsPath(alias), 0);
		try { for (const repoRoot of targets) { const result = await legacy.call<{ error: string }>('db.saveConnection', { repoRoot, config: { id: 'common', kind: 'sqlite', path: savedPath } }); assert.match(result.error, /^invalid-input:/); } } finally { await chmod(connectionsPath(alias), 0o600); }
		const input = await draft(ui, root, 'common', { kind: 'sqlite', path: 'temporary.sqlite' });
		const result = await ui.call<MutationOutcome>('db.connections.v2.mutate', input); assert.equal(result.status, 'committed', JSON.stringify(result));
		for (const repoRoot of targets) { const refused = await legacy.call<{ error: string }>('db.saveConnection', { repoRoot, config: { id: 'other', kind: 'sqlite', path: savedPath } }); assert.match(refused.error, /^invalid-input:/); }
		const attached = { lookupRoot: root, daemonEpoch: opened.daemonEpoch, sessionHandle: opened.sessionHandle };
		assert.ok(JSON.stringify(await rows(attached)).includes('temporary-canonical')); assert.ok(!JSON.stringify(await rows(attached)).includes('saved-alias'));
		assert.ok(JSON.stringify(await rows(savedContext)).includes('saved-alias')); assert.equal((await resolver.list(attached)).length, 1); assert.equal((await resolver.list({ lookupRoot: root, daemonEpoch: 'epoch' })).length, 0);
		const calls = roots.length; await assert.rejects(resolver.list({ ...attached, lookupRoot: alias }), { code: 'session-expired' }); assert.equal(roots.length, calls);
		assert.deepEqual(await readFile(connectionsPath(alias)), beforeAlias); assert.deepEqual(await readFile(connectionsPath(root)), beforeCanonical);
		// A deliberately unexpected overlap must fail before either driver wins resolution.
		await writeFile(connectionsPath(root), JSON.stringify({ connections: [{ id: 'common', kind: 'sqlite', path: savedPath }] }));
		await assert.rejects(resolver.list(attached), { code: 'duplicate-id' }); await assert.rejects(rows(attached), { code: 'duplicate-id' }); await assert.rejects(resolver.lease(attached, 'common'), { code: 'duplicate-id' });
		await writeFile(connectionsPath(root), beforeCanonical);
		await s.runtime.close();
		rejected(await ui.call('db.saveConnection', { repoRoot: root, config: { id: 'closed-session', kind: 'sqlite', path: savedPath } }), 'upgrade-required');
		assert.deepEqual(await readFile(connectionsPath(root)), beforeCanonical);
		savedSuccess(await legacy.call('db.saveConnection', { repoRoot: alias, config: { id: 'disabled-control', kind: 'sqlite', path: join(alias, 'saved.sqlite') } }), false);
		assert.equal(s.workerCalls, 0);
	} finally { await ui.close(); await legacy.close(); for (const pool of pools.values()) await pool.closeAll(); await s.close(); await env.cleanup(); }
});
