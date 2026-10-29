import { restartPeer } from './session-restart-peer.js';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { fork } from 'node:child_process';
import type { ChildProcess, ForkOptions } from 'node:child_process';
import { sessionRpcClient } from './session-rpc-client.js';
const lifecycle = process.argv[3] ?? 'end'; let now = 0;
const compiled = process.argv[2] === 'compiled', base = new URL(compiled ? '../../../../../out/' : '../../../../', import.meta.url);
const { PATHS } = await import(new URL('shared/paths.js', base).href);
const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-session-probe-'))), root = join(directory, 'root'); await mkdir(root); PATHS.insrc = join(directory, 'insrc'); await mkdir(PATHS.insrc);
await import(new URL('daemon/db/drivers/index.js', base).href);
const { ConnectionSessionRpc } = await import(new URL('daemon/connection-session-rpc.js', base).href);
const { createTemporaryOverlay } = await import(new URL('daemon/db/session-entries.js', base).href);
const { connectionManagementHandlers } = await import(new URL('daemon/connection-management-rpc.js', base).href);
const { connectionTestSupervisor } = await import(new URL('daemon/db/draft-test.js', base).href);
const { IpcServer, directDispatch } = await import(new URL('daemon/server.js', base).href);
const { _setKeystoreForTests } = await import(new URL('daemon/db/secrets.js', base).href);
let keychain = 0; const previous = _setKeystoreForTests({ getKey: async () => { keychain++; return null; }, setKey: async () => { keychain++; }, deleteKey: async () => { keychain++; } });
const overlays = new Map<string, import('../../session-entries.js').TemporaryConnectionOverlay>();
const runtime = new ConnectionSessionRpc({ monotonicNow: () => now, enabled: async () => true, isRegistered: async (r: string) => r === root, createOverlay: (r: string, h: string, c: never) => { const overlay = createTemporaryOverlay(r, h, c); overlays.set(h, overlay); return overlay; }, dropOverlay: (o: import('../../session-entries.js').TemporaryConnectionOverlay) => o.close() });
const server = new IpcServer(runtime.forward(directDispatch(connectionManagementHandlers({ sessionRuntime: runtime, enabled: async () => true, isRegistered: async (r: string) => r === root }))), Date.now, join(directory, 'rpc.sock')); server.onConnectionClose((c: never) => runtime.disconnect(c)); await server.listen();
const ui = await sessionRpcClient(join(directory, 'rpc.sock')), other = await sessionRpcClient(join(directory, 'rpc.sock'));
let started!: () => void; const accepted = new Promise<void>(r => { started = r; }); const sockets = new Set<Socket>();
const pg = createServer(socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); socket.resume(); started(); }); await new Promise<void>(r => pg.listen(0, '127.0.0.1', r)); const address = pg.address(); assert.ok(address && typeof address === 'object');
const children: ChildProcess[] = [], entries: string[] = [], originalSpawn = connectionTestSupervisor.spawnWorker;
connectionTestSupervisor.spawnWorker = (entry: string, options: ForkOptions) => { entries.push(entry); const child = fork(entry, [], options); children.push(child); return child; };
async function tree() { const values: Record<string, string> = {}; for (const name of await readdir(root, { recursive: true })) try { values[name] = createHash('sha256').update(await readFile(join(root, name))).digest('hex'); } catch {} for (const name of await readdir(PATHS.insrc, { recursive: true })) try { values['insrc/' + name] = createHash('sha256').update(await readFile(join(PATHS.insrc, name))).digest('hex'); } catch {} return values; }
try {
 await writeFile(join(root, 'data.csv'), 'marker\noriginal\n'); await writeFile(join(root, 'edited.csv'), 'marker\nreadonly-edit\n');
	const opened = await ui.call<{ sessionHandle: string; capability: string; daemonEpoch: string }>('db.connections.v2.session.open', { repoRoot: root }), overlay = overlays.get(opened.sessionHandle)!;
 const saved = overlay.commit(await overlay.prepare({ key: { repoRoot: root, scope: 'temporary', id: 'file' }, mode: 'create', publicPatch: { kind: 'csv', path: 'data.csv' } }));
 const remote = overlay.commit(await overlay.prepare({ key: { repoRoot: root, scope: 'temporary', id: 'pg' }, mode: 'create', publicPatch: { kind: 'postgres', endpoint: `postgres://127.0.0.1:${address.port}/db` }, credentials: { 'url.username': { action: 'replace', value: 'u' }, 'url.password': { action: 'replace', value: 'PRIVATE_PROBE_PASSWORD' } } }));
 const key = { repoRoot: root, scope: 'temporary', id: 'file' }, ticket = await ui.call('db.connections.v2.ticket', { key, mode: 'update' }), before = await tree(), list = JSON.stringify(overlay.list());
 const input = { requestId: randomUUID(), draftRevision: 1, key, expectedRevision: saved.revision, publicPatch: { path: 'edited.csv' }, credentials: {} };
 assert.equal((await ui.call<{ status: string }>('db.connections.v2.test', input)).status, 'reachable');
 const count = children.length; assert.equal((await ui.call<{ code: string }>('db.connections.v2.test', { ...input, requestId: randomUUID(), expectedRevision: randomUUID() })).code, 'conflict'); assert.equal(children.length, count);
 assert.equal((await other.call<{ status: string }>('db.connections.v2.test', { ...input, requestId: randomUUID() })).status, 'rejected'); assert.equal(children.length, count);
 const draft = { requestId: randomUUID(), draftRevision: 2, key: { ...key, id: 'new' }, publicPatch: { kind: 'csv', path: 'edited.csv' }, credentials: {} };
 assert.equal((await other.call<{ status: string }>('db.connections.v2.test', draft)).status, 'reachable');
 assert.equal(JSON.stringify(overlay.list()), list); assert.equal((await ui.call<{ status: string }>('db.connections.v2.status', { ticket })).status, 'not-seen'); assert.deepEqual(await tree(), before); assert.equal(keychain, 0);
 // S004: an edit probe owns its revision until preparation and actual child drain.
 const originalPrepare = runtime.prepareTemporary.bind(runtime); let announced!: () => void, release!: () => void;
 const preparing = new Promise<void>(r => { announced = r; }), held = new Promise<void>(r => { release = r; });
 runtime.prepareTemporary = async (...args: Parameters<typeof originalPrepare>) => { const value = await originalPrepare(...args); announced(); await held; return value; };
 const raceCount = children.length, race = ui.call<{ status: string }>('db.connections.v2.test', { ...input, requestId: randomUUID() }); await preparing;
 try {
  await assert.rejects(overlay.prepare({ key, mode: 'update', expectedRevision: saved.revision, publicPatch: { path: 'edited.csv' } }), { code: 'busy' });
  assert.throws(() => overlay.prepareRemoval({ id: key.id, expectedRevision: saved.revision }), { code: 'busy' });
  assert.equal(JSON.stringify(overlay.list()), list);
 } finally { release(); }
 assert.equal((await race).status, 'reachable'); assert.equal(children.length, raceCount + 1);
 overlay.commit(await overlay.prepare({ key, mode: 'update', expectedRevision: saved.revision, publicPatch: { path: 'edited.csv' } }));
 runtime.prepareTemporary = originalPrepare;
 const pending = ui.call<{ status: string }>('db.connections.v2.test', { requestId: randomUUID(), draftRevision: 3, key: { ...key, id: 'pg' }, expectedRevision: remote.revision, publicPatch: {}, credentials: { 'url.password': { action: 'keep' } } });
	await accepted; assert.ok(children.some(child => child.exitCode === null && child.signalCode === null)); assert.ok(sockets.size > 0);
	if (lifecycle === 'end') await ui.call('db.connections.v2.session.end');
	else if (lifecycle === 'deadline') { now = 90_000; assert.equal((await ui.call<{ code: string }>('db.connections.v2.drivers')).code, 'session-expired'); await runtime.close(); }
	else { runtime.stopAdmission(); await restartPeer(compiled ? 'compiled' : 'source', root, opened); await runtime.close(); }
	const result = await pending; assert.ok(['rejected', 'canceled'].includes(result.status)); assert.equal(connectionTestSupervisor.activeCount, 0);
	for (let n = 0;n < 100 && sockets.size;n++) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(sockets.size, 0);
 assert.ok(children.every(child => child.exitCode !== null || child.signalCode !== null)); assert.ok(entries.every(entry => entry.endsWith(compiled ? '.js' : '.ts'))); assert.deepEqual(await tree(), before); assert.equal(keychain, 0);
	if (lifecycle === 'end') {
 // End during preparation drains the suspended callback and cannot launch a late child.
 const next = await ui.call<{ sessionHandle: string }>('db.connections.v2.session.open', { repoRoot: root }), nextOverlay = overlays.get(next.sessionHandle)!;
 const row = nextOverlay.commit(await nextOverlay.prepare({ key, mode: 'create', publicPatch: { kind: 'csv', path: 'data.csv' } }));
 let enteredPrepare!: () => void, releasePrepare!: () => void; const entered = new Promise<void>(r => { enteredPrepare = r; }), waiting = new Promise<void>(r => { releasePrepare = r; });
 runtime.prepareTemporary = async (...args: Parameters<typeof originalPrepare>) => { const value = await originalPrepare(...args); enteredPrepare(); await waiting; return value; };
 const beforeEndCount = children.length, preparingEnd = ui.call<{ status: string }>('db.connections.v2.test', { ...input, requestId: randomUUID(), expectedRevision: row.revision }); await entered;
 let ended = false; const ending = ui.call('db.connections.v2.session.end').then(() => { ended = true; });
 await assert.rejects(ui.call('db.connections.v2.drivers').then(value => { if ((value as { code?: string }).code === 'session-expired') throw new Error('expired'); }), /expired/);
 assert.equal(ended, false); releasePrepare(); await ending; assert.ok(['rejected', 'canceled'].includes((await preparingEnd).status)); assert.equal(children.length, beforeEndCount); runtime.prepareTemporary = originalPrepare;
	}
	process.stdout.write('probe-owner-source-compiled-ok:' + lifecycle + ':children=0:sockets=0\n');
} finally {
 connectionTestSupervisor.spawnWorker = originalSpawn; for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
 for (const socket of sockets) socket.destroy(); await new Promise<void>(r => pg.close(() => r())); await ui.close(); await other.close(); await server.close(); await runtime.close(); _setKeystoreForTests(previous); await rm(directory, { recursive: true, force: true });
}
