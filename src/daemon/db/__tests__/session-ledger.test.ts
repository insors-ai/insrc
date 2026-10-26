import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { SessionOperationLedger, MAX_SESSION_OPERATION_RECORDS } from '../session-ledger.js';
import { TemporaryConnectionOverlay, createTemporaryOverlay } from '../session-entries.js';
import { ManagementServiceError } from '../management.js';
import { ConnectionSessionRpc } from '../../connection-session-rpc.js';
import { connectionManagementHandlers } from '../../connection-management-rpc.js';
import { IpcServer, directDispatch } from '../../server.js';
import { environment } from './fixtures/saved-management-fixture.js';
import type { ConnectionKey, OperationTicket, MutationRequest, MutationOutcome, SafeConnection, OperationStatus, OpenConnectionSessionResult, SessionResume } from '../../../shared/connection-management.js';

const code = (expected: string) => (error: unknown) => error !== null && typeof error === 'object' && 'code' in error && error.code === expected;
function rejected(value: unknown, expected: string) { assert.ok(value && typeof value === 'object' && 'code' in value); assert.equal(value.code, expected); }
const key: ConnectionKey = { repoRoot: '/canonical/fixture', scope: 'temporary', id: 'row' };
function fixture() {
 let now = 0, deadline = 90000;
 const bytes = randomBytes(32), ledger = new SessionOperationLedger({ key: bytes, daemonEpoch: 'epoch', sessionHandle: 'owner-A', now: () => now, deadline: () => deadline, wallNow: () => Date.UTC(2026, 9, 25), assertActive: () => { if (now >= deadline) throw new ManagementServiceError('session-expired'); } });
 return { ledger, bytes, setNow(value: number) { now = value; }, extend(value: number) { deadline = value; } };
}
function request(ticket: OperationTicket): MutationRequest { return { ticket, operationId: ticket.operationId, key: { repoRoot: ticket.lookupRoot, scope: 'temporary', id: ticket.connectionId }, mode: ticket.mode, publicPatch: { kind: 'postgres', endpoint: 'postgres://host/db' }, credentials: { 'url.password': { action: 'replace', value: 'private-request-canary' } } }; }
const safe = (ticket: OperationTicket, revision = 'revision'): SafeConnection => ({ key: { ...key, id: ticket.connectionId, repoRoot: ticket.lookupRoot }, revision, kind: 'postgres', family: 'rdbms', effectiveFamily: 'rdbms', publicConfig: { endpoint: 'postgres://host/db' }, credentialPresence: { 'url.password': true } });
const active = () => {};
function committed(result: MutationOutcome) { assert.equal(result.status, 'committed', JSON.stringify(result)); if (result.status !== 'committed') throw new Error('expected committed'); return result.value; }

test('CM-S3-REPLAY: HMAC context changed payload and concurrent identical mutation preserve one receipt', async () => {
 const f = fixture(); let release!: () => void, entered!: () => void, commits = 0;
 const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
 try {
  const ticket = f.ledger.issue(key, 'create'), input = request(ticket);
  const first = f.ledger.mutate(input, async (_request, commit) => { entered(); await held; return commit(() => { commits++; return safe(ticket); }); }, active);
  await started;
  assert.equal(f.ledger.status(ticket).status, 'pending');
  const same = f.ledger.mutate(structuredClone(input), async () => { throw new Error('duplicate apply'); }, active);
  rejected(await f.ledger.mutate({ ...input, publicPatch: { label: 'changed' } }, async () => { throw new Error('must not apply'); }, active), 'operation-mismatch');
  release(); const a = committed(await first), b = committed(await same); assert.deepEqual(a, b); assert.equal(commits, 1);
  assert.deepEqual(committed(await f.ledger.mutate(input, async () => { throw new Error('replayed apply'); }, active)), a);
  rejected(await f.ledger.mutate({ ...input, credentials: { 'url.password': { action: 'replace', value: 'different' } } }, async () => { throw new Error('must not apply'); }, active), 'operation-mismatch');
  for (const forged of [{ ...ticket, lookupRoot: '/other' }, { ...ticket, signature: 'x'.repeat(43) }, { ...ticket, expiresAt: new Date(Date.parse(ticket.expiresAt) + 1).toISOString() }]) assert.throws(() => f.ledger.inspect(forged), code('invalid-input'));
  const other = new SessionOperationLedger({ key: Buffer.from(f.bytes), daemonEpoch: 'other-epoch', sessionHandle: 'owner-A', now: () => 0, deadline: () => 90000, assertActive: active });
  try { assert.throws(() => other.inspect(ticket), code('invalid-input')); } finally { other.close(); }
  f.ledger.activation(ticket.operationId, a.revision, 'failed'); assert.equal((f.ledger.status(ticket) as { value: { activation: string } }).value.activation, 'failed');
  f.ledger.activation(ticket.operationId, a.revision, 'active'); assert.equal((f.ledger.status(ticket) as { value: { activation: string } }).value.activation, 'active');
  assert.ok(!JSON.stringify(f.ledger).includes('private-request-canary'));
 } finally { release(); f.ledger.close(); }
});

test('CM-S3-REPLAY: signed lease expiry preserves committed truth and refuses unreceipted or lost sessions', async () => {
 const f = fixture();
 try {
  const committedTicket = f.ledger.issue(key, 'create'), absent = f.ledger.issue({ ...key, id: 'absent' }, 'create');
  await f.ledger.mutate(request(committedTicket), async (_r, commit) => commit(() => safe(committedTicket)), active);
  f.setNow(30000); f.extend(120000); f.setNow(90000);
  assert.equal(f.ledger.status(committedTicket).status, 'committed'); assert.equal(f.ledger.status(absent).status, 'reconciliation-required');
  assert.equal((await f.ledger.mutate(request(committedTicket), async () => { throw new Error('no replay apply'); }, active)).status, 'committed');
  rejected(await f.ledger.mutate(request(absent), async () => { throw new Error('expired must not apply'); }, active), 'reconciliation-required');
  const bounded = f.ledger.issue({ ...key, id: 'bounded' }, 'create'); assert.equal(Date.parse(bounded.expiresAt) - Date.parse(bounded.issuedAt), 30000);
  f.setNow(120000); assert.throws(() => f.ledger.status(committedTicket), code('session-expired'));
  f.ledger.close(); assert.ok(f.bytes.every(byte => byte === 0));
  assert.throws(() => f.ledger.status(committedTicket), code('session-expired'));
 } finally { f.ledger.close(); }
});

test('CM-S3-REPLAY: expiry during preparation prevents entry and receipt publication', async () => {
 for (const loss of ['ticket', 'session'] as const) {
  const f = fixture(); let release!: () => void, enter!: () => void, publishes = 0;
  const entered = new Promise<void>(resolve => { enter = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  try {
   const ticket = f.ledger.issue(key, 'create'); f.extend(180000);
   const pending = f.ledger.mutate(request(ticket), async (_request, commit) => { enter(); await held; return commit(() => { publishes++; return safe(ticket); }); }, active);
   await entered; if (loss === 'ticket') f.setNow(90000); else f.ledger.close(); release();
   rejected(await pending, loss === 'ticket' ? 'reconciliation-required' : 'session-expired'); assert.equal(publishes, 0);
   if (loss === 'ticket') assert.equal(f.ledger.status(ticket).status, 'reconciliation-required');
  } finally { release(); f.ledger.close(); }
 }
});

test('CM-S3-REPLAY: ticket and receipt quotas never evict live operation history', async () => {
 const tickets = fixture(), receipts = fixture();
 try {
  const first = tickets.ledger.issue(key, 'create');
  for (let i = 1; i < MAX_SESSION_OPERATION_RECORDS; i++) tickets.ledger.issue(key, 'create');
  assert.throws(() => tickets.ledger.issue(key, 'create'), code('busy')); assert.equal(tickets.ledger.status(first).status, 'not-seen');
  tickets.extend(180000); tickets.setNow(90000); tickets.ledger.issue(key, 'create'); assert.equal(tickets.ledger.status(first).status, 'reconciliation-required');
  let recorded!: OperationTicket;
  for (let i = 0; i < MAX_SESSION_OPERATION_RECORDS; i++) {
   const ticket = receipts.ledger.issue(key, 'create'); recorded ??= ticket;
   committed(await receipts.ledger.mutate(request(ticket), async (_r, commit) => commit(() => safe(ticket, `r${i}`)), active));
  }
  receipts.extend(180000); receipts.setNow(90000);
  assert.throws(() => receipts.ledger.issue(key, 'create'), code('busy')); assert.equal(receipts.ledger.status(recorded).status, 'committed');
 } finally { tickets.ledger.close(); receipts.ledger.close(); }
});

async function client(path: string) {
 const socket = createConnection(path); await once(socket, 'connect'); let sequence = 0, buffer = '';
 const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
 socket.on('data', chunk => {
  buffer += chunk.toString();
  for (;;) { const end = buffer.indexOf('\n'); if (end < 0) break; const reply = JSON.parse(buffer.slice(0, end)) as { id: number; result?: unknown; error?: string }; buffer = buffer.slice(end + 1); const call = pending.get(reply.id); pending.delete(reply.id); if (reply.error) call?.reject(new Error(reply.error)); else call?.resolve(reply.result); }
 });
 socket.on('error', () => {}); socket.on('close', () => { for (const call of pending.values()) call.reject(new Error('test socket closed')); pending.clear(); });
 return { call<T = unknown>(method: string, params: unknown = {}): Promise<T> { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve: value => resolve(value as T), reject }); socket.write(JSON.stringify({ id, method, params }) + '\n'); }); },
  async close() { if (socket.destroyed) return; const closed = once(socket, 'close'); socket.destroy(); await closed; },
 };
}

test('CM-S3-REPLAY: real mutation sockets reconcile concurrent calls and a lost reply after control resume', async () => {
 const env = await environment(), f = await env.rootFixture('root'); let now = 0, prepares = 0, entered!: () => void, release!: () => void, lost!: () => void;
 const started = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; }), lostReply = new Promise<void>(resolve => { lost = resolve; });
 const runtime = new ConnectionSessionRpc<TemporaryConnectionOverlay>({ enabled: async () => true, isRegistered: async root => root === f.root, monotonicNow: () => now, createOverlay: createTemporaryOverlay, dropOverlay: overlay => overlay.close() });
 const dispatch = directDispatch(connectionManagementHandlers({ sessionRuntime: runtime }));
 const server = new IpcServer(runtime.forward((request, deliver) => dispatch(request, envelope => {
  if (request.method === 'db.connections.v2.mutate' && (request.params as MutationRequest).key.id === 'lost' && envelope.kind === 'reply' && (envelope.result as MutationOutcome).status === 'committed') { lost(); return; }
  deliver(envelope);
 })), Date.now, join(env.directory, 'session.sock'));
 server.onConnectionClose(context => runtime.disconnect(context)); await server.listen();
 const control = await client(join(env.directory, 'session.sock')), observer = await client(join(env.directory, 'session.sock')), restricted = await client(join(env.directory, 'session.sock'));
 const original = TemporaryConnectionOverlay.prototype.prepare;
 const spy = mock.method(TemporaryConnectionOverlay.prototype, 'prepare', async function(this: TemporaryConnectionOverlay, ...args: Parameters<typeof original>) { prepares++; if (args[0].key.id === 'row') { entered(); await held; } return original.apply(this, args); });
 let resumed: Awaited<ReturnType<typeof client>> | undefined;
 try {
  const opened = await control.call<OpenConnectionSessionResult>('db.connections.v2.session.open', { repoRoot: f.root });
  const token = { sessionHandle: opened.sessionHandle, capability: opened.capability, daemonEpoch: opened.daemonEpoch };
  const delegation = await control.call<SessionResume>('db.connections.v2.session.delegate', { repoRoot: f.root, audience: 'mcp-unverified' });
  await restricted.call('db.connections.v2.session.attach', { ...delegation, repoRoot: f.root });
  const ticket = await control.call<OperationTicket>('db.connections.v2.ticket', { key: { ...key, repoRoot: f.root }, mode: 'create' }), input = request(ticket);
  const absent = await control.call<OperationTicket>('db.connections.v2.ticket', { key: { ...key, repoRoot: f.root, id: 'absent' }, mode: 'create' });
  f.reset(); const bytes = await readSnapshot(f.path), vault = [...f.values];
  const first = control.call<MutationOutcome>('db.connections.v2.mutate', input); await started;
  const same = control.call<MutationOutcome>('db.connections.v2.mutate', structuredClone(input));
  assert.equal((await control.call<OperationStatus>('db.connections.v2.status', { ticket })).status, 'pending');
  rejected(await control.call('db.connections.v2.mutate', { ...input, publicPatch: { label: 'changed' } }), 'operation-mismatch');
  release(); const a = committed(await first), b = committed(await same); assert.deepEqual(a, b); assert.equal(prepares, 1);
  assert.equal((await control.call<SafeConnection>('db.connections.v2.read', { key: input.key })).revision, a.revision);
  for (const [method, params] of [['db.connections.v2.read', { key: input.key }], ['db.connections.v2.ticket', { key: input.key, mode: 'create' }], ['db.connections.v2.mutate', input], ['db.connections.v2.status', { ticket }]] as const) rejected(await restricted.call(method, params), 'upgrade-required');
  rejected(await observer.call('db.connections.v2.status', { ticket }), 'upgrade-required');
  const lostTicket = await control.call<OperationTicket>('db.connections.v2.ticket', { key: { ...input.key, id: 'lost' }, mode: 'create' });
  const pending = control.call('db.connections.v2.mutate', request(lostTicket)).catch(() => undefined); await lostReply; await control.close(); await pending;
  resumed = await client(join(env.directory, 'session.sock')); await resumed.call('db.connections.v2.session.resume', token);
  assert.equal((await resumed.call<OperationStatus>('db.connections.v2.status', { ticket: lostTicket })).status, 'committed');
  now = 30000; await resumed.call('db.connections.v2.session.heartbeat'); now = 90000;
  assert.equal((await resumed.call<OperationStatus>('db.connections.v2.status', { ticket: lostTicket })).status, 'committed');
  assert.equal((await resumed.call<OperationStatus>('db.connections.v2.status', { ticket: absent })).status, 'reconciliation-required');
  rejected(await resumed.call('db.connections.v2.mutate', request(absent)), 'reconciliation-required');
  assert.equal(prepares, 2); assert.deepEqual(await readSnapshot(f.path), bytes); assert.deepEqual([...f.values], vault); assert.ok(Object.values(f.counts).every(value => value === 0));
  await resumed.call('db.connections.v2.session.end'); rejected(await resumed.call('db.connections.v2.status', { ticket }), 'session-expired');
 } finally { release(); spy.mock.restore(); await control.close(); await observer.close(); await restricted.close(); await resumed?.close(); await server.close(); await runtime.close(); await env.cleanup(); }
});
async function readSnapshot(path: string) { const { readFile } = await import('node:fs/promises'); return readFile(path); }
