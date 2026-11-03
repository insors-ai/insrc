import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConnectionSessionRpc } from '../../../connection-session-rpc.js';
import { connectionManagementHandlers } from '../../../connection-management-rpc.js';
import { IpcServer, directDispatch } from '../../../server.js';
import { TemporaryConnectionOverlay, createTemporaryOverlay } from '../../session-entries.js';
import { createConnectionResolver } from '../../pool-cache.js';
import { contextualDriverFactory } from '../../driver-log-policy.js';
import { DriverPool } from '../../pool.js';
import { connectionsPath } from '../../config.js';
import { environment } from '.././fixtures/saved-management-fixture.js';
import { sessionRpcClient } from '.././fixtures/session-rpc-client.js';
import type { TemporaryResourcePorts } from '../../session-resources.js';
import type { TrustedRpcContext } from '../../../request-context.js';
import type { ConnectionConfig, Driver } from '../../../../shared/db-driver.js';
import type { ConnectionAccessContext, OperationTicket, MutationRequest, MutationOutcome, OpenConnectionSessionResult } from '../../../../shared/connection-management.js';
import '../../drivers/index.js';
function deferred<T = void>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function rejected(value: unknown, code: string) { assert.ok(value && typeof value === 'object' && 'code' in value); assert.equal(value.code, code); }
function committed(value: MutationOutcome) { assert.equal(value.status, 'committed', JSON.stringify(value)); if (value.status !== 'committed') throw new Error('Expected committed'); return value.value; }
async function fixture(ports: TemporaryResourcePorts = {}) {
	const env = await environment(), a = join(env.directory, 'a'), b = join(env.directory, 'b');
	for (const root of [a, b]) { await mkdir(root); await mkdir(dirname(connectionsPath(root)), { recursive: true }); await writeFile(connectionsPath(root), '{"connections":[]}'); }
	const runtime = new ConnectionSessionRpc<TemporaryConnectionOverlay>({
		enabled: async () => true, isRegistered: async root => root === a || root === b,
		createOverlay: (root, handle, context) => createTemporaryOverlay(root, handle, context, ports.factory ? { factory: kind => { const selected = ports.factory!(kind); return selected ? contextualDriverFactory(selected) : undefined; } } : ports), dropOverlay: overlay => overlay.close()
	});
	const queued: { entered: ReturnType<typeof deferred<TrustedRpcContext>>; release: ReturnType<typeof deferred> }[] = [];
	const held: { response: Promise<unknown>; release: ReturnType<typeof deferred> }[] = [];
	const clients: Awaited<ReturnType<typeof sessionRpcClient>>[] = [], pools = new Map<string, DriverPool>(); let lookups = 0;
	const server = new IpcServer(runtime.forward(directDispatch({
		...connectionManagementHandlers({ sessionRuntime: runtime }), 'db.listDriverKinds': async (_params, context) => {
			const next = queued.shift(); assert.ok(next && context); next.entered.resolve(context); await next.release.promise; return [];
		}
	})), Date.now, join(env.directory, 'runtime.sock')); server.onConnectionClose(context => runtime.disconnect(context)); await server.listen();
	const client = async () => { const value = await sessionRpcClient(join(env.directory, 'runtime.sock')); clients.push(value); return value; };
	const hold = async (value: Awaited<ReturnType<typeof client>>) => { const entered = deferred<TrustedRpcContext>(), release = deferred(); queued.push({ entered, release }); const response = value.call('db.listDriverKinds'); held.push({ response, release }); return { context: await entered.promise, release, response }; };
	const resolver = createConnectionResolver({ poolSource: async root => { lookups++; let pool = pools.get(root); if (!pool) { pool = new DriverPool(root); pools.set(root, pool); } await pool.reload(); return pool; } });
	return { ...env, a, b, runtime, resolver, client, hold, get lookups() { return lookups; }, close: async () => { for (const item of held) item.release.resolve(); await Promise.allSettled(held.map(item => item.response)); for (const value of clients) await value.close(); await server.close(); await runtime.close(); for (const pool of pools.values()) await pool.closeAll(); await env.cleanup(); } };
}
async function request(client: Awaited<ReturnType<typeof sessionRpcClient>>, root: string, patch: Record<string, unknown>, credentials: Record<string, { action: 'replace'; value: string }> = {}, revision?: string): Promise<MutationRequest> {
	const key = { repoRoot: root, scope: 'temporary' as const, id: 'same' }, mode = revision ? 'update' as const : 'create' as const;
	const ticket = await client.call<OperationTicket>('db.connections.v2.ticket', { key, mode }); assert.ok(ticket.signature, JSON.stringify(ticket));
	return { ticket, operationId: ticket.operationId, key, mode, publicPatch: patch, credentials, ...(revision ? { expectedRevision: revision } : {}) };
}
function raw(config: ConnectionConfig, closed: () => void, marker = config.label): Driver {
	return { id: config.id, kind: config.kind, family: 'rdbms', privateConfig: config, describe: async () => ({ columns: [{ name: 'marker', type: 'text', nullable: false }] }), sample: async () => ({ rows: [{ marker }] }), close: async () => { closed(); } } as unknown as Driver;
}


async function main() {

	const f = await fixture();
	try {
		for (const [root, name, marker] of [[f.a, 'a.sqlite', 'owner-A'], [f.a, 'b.sqlite', 'owner-B'], [f.b, 'c.sqlite', 'root-B'], [f.a, 'next.sqlite', 'next-revision']] as const) { const db = new DatabaseSync(join(root, name)); db.exec(`CREATE TABLE data(marker TEXT); INSERT INTO data VALUES ('${marker}');`); db.close(); }
		const a = await f.client(), b = await f.client(); await a.call('db.connections.v2.session.open', { repoRoot: f.a }); await b.call('db.connections.v2.session.open', { repoRoot: f.a });
		const requests: MutationRequest[] = [];
		for (const [client, root, path] of [[a, f.a, 'a.sqlite'], [b, f.a, 'b.sqlite'], [a, f.b, 'c.sqlite']] as const) { const input = await request(client, root, { kind: 'sqlite', path }); requests.push(input); committed(await client.call<MutationOutcome>('db.connections.v2.mutate', input)); }
		const ha = await f.hold(a), hb = await f.hold(b), aa = await f.runtime.accessFor(ha.context, f.a), ab = await f.runtime.accessFor(hb.context, f.a), ac = await f.runtime.accessFor(ha.context, f.b);
		const rows = (access: ConnectionAccessContext) => f.resolver.withConnection(access, 'same', async driver => { assert.equal(driver.family, 'rdbms'); if (driver.family !== 'rdbms') throw new Error('Expected SQLite'); return driver.sample('data', { limit: 1 }); });
		for (const [access, marker] of [[aa, 'owner-A'], [ab, 'owner-B'], [ac, 'root-B']] as const) assert.ok(JSON.stringify(await rows(access)).includes(marker));
		const initial = await a.call<{ revision: string }>('db.connections.v2.read', { key: requests[0]!.key }), edit = await request(a, f.a, { path: 'next.sqlite' }, {}, initial.revision); committed(await a.call<MutationOutcome>('db.connections.v2.mutate', edit));
		assert.ok(JSON.stringify(await rows(aa)).includes('next-revision')); assert.ok(JSON.stringify(await rows(ab)).includes('owner-B')); assert.ok(JSON.stringify(await rows(ac)).includes('root-B'));
	} finally { await f.close(); }

}
await main();
process.stdout.write("native-sqlite-isolation-ok\n");
