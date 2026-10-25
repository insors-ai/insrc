import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { ConnectionSessionOwner } from '../session-owner.js';
import { ManagementServiceError, managementRejection } from '../management.js';
import type { TrustedRpcContext } from '../../request-context.js';
import type { OpenConnectionSessionResult, SessionResume } from '../../../shared/connection-management.js';
import { IpcServer, directDispatch } from '../../server.js';
import type { RpcHandler } from '../../server.js';

const context = (identity: string, daemonEpoch = 'epoch'): TrustedRpcContext => ({ connectionIdentity: identity, daemonEpoch });
const code = (expected: string) => (error: unknown): boolean => error instanceof ManagementServiceError && error.code === expected;
function fixture() {
	const directory = realpathSync(mkdtempSync(join(tmpdir(), 'cm-session-')));
	const a = join(directory, 'a'), b = join(directory, 'b');
	mkdirSync(a); mkdirSync(b);
	return { directory, a, b, registered: new Set([a, b]) };
}

test('CM-S3-AUTH: monotonic exact deadline and control generation preserve root overlays', async () => {
	const f = fixture(); let now = 0;
	const owner = new ConnectionSessionOwner({ daemonEpoch: 'epoch', isRegistered: async root => f.registered.has(root),
		monotonicNow: () => now, createOverlay: () => new Map<string, string>() });
	try {
		const a = context('control-a'), b = context('control-b');
		const opened = await owner.open(a, f.a);
		assert.match(opened.sessionHandle, /^[A-Za-z0-9_-]{43}$/);
		assert.match(opened.capability, /^[A-Za-z0-9_-]{43}$/);
		assert.notEqual(opened.capability, opened.sessionHandle);
		assert.equal(opened.heartbeatMs, 30000); assert.equal(opened.leaseMs, 90000);
		const first = await owner.overlay(a, f.a); first.set('row', 'session-a-canary');
		const other = await owner.overlay(a, f.b); other.set('row', 'root-b-canary');
		assert.equal(await owner.overlay(a, f.a), first);
		assert.notEqual(first, other);
		now = 89999; owner.heartbeat(a);
		now = 100000;
		assert.throws(() => owner.resume(b, { ...opened, capability: 'x'.repeat(43) }), code('session-expired'));
		assert.throws(() => owner.resume(context('bad-epoch', 'other'), opened), code('session-expired'));
		assert.equal(owner.resume(b, opened).sessionHandle, opened.sessionHandle);
		assert.throws(() => owner.heartbeat(a), code('session-expired'));
		assert.throws(() => owner.end(a), code('session-expired'));
		assert.equal(await owner.overlay(b, f.a), first);
		assert.equal((await owner.overlay(b, f.a)).get('row'), 'session-a-canary');
		assert.equal((await owner.overlay(b, f.b)).get('row'), 'root-b-canary');
		now = 179999; // resume did not renew the heartbeat deadline
		assert.throws(() => owner.heartbeat(b), code('session-expired'));
		assert.equal(owner.size, 0);
		assert.throws(() => owner.resume(a, opened), code('session-expired'));
	} finally { owner.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test('CM-S3-AUTH: quota refuses before overlay allocation and restart has no recovered state or writes', async () => {
	const f = fixture(); let now = 0, allocations = 0;
	const sentinel = join(f.directory, 'registry-and-keychain.json');
	writeFileSync(sentinel, '{"saved":"unchanged","secret":"saved-canary"}');
	const before = readFileSync(sentinel);
	const ports = { daemonEpoch: 'epoch', isRegistered: async (root: string) => f.registered.has(root),
		monotonicNow: () => now, createOverlay: () => { allocations++; return new Map<string, string>(); } };
	const owner = new ConnectionSessionOwner(ports);
	let opened!: OpenConnectionSessionResult;
	try {
		for (let i = 0; i < 64; i++) opened = await owner.open(context(`control-${i}`), f.a);
		assert.equal(allocations, 64); assert.equal(owner.size, 64);
		await assert.rejects(() => owner.open(context('overflow'), f.a), code('busy'));
		await assert.rejects(() => owner.open(context('control-0'), f.a), code('busy'));
		assert.equal(allocations, 64);
		assert.equal(JSON.stringify(owner), '{}', 'private owner state must not be serialized');
		assert.deepEqual(readFileSync(sentinel), before);
		now = 90000; owner.sweepExpired(); assert.equal(owner.size, 0);
		await owner.open(context('fresh'), f.a); assert.equal(allocations, 65);
		owner.close();
		const restarted = new ConnectionSessionOwner({ ...ports, daemonEpoch: 'new-epoch' });
		try {
			assert.equal(restarted.size, 0);
			assert.throws(() => restarted.resume(context('new', 'new-epoch'), { ...opened, daemonEpoch: 'new-epoch' }), code('session-expired'));
			assert.deepEqual(readFileSync(sentinel), before);
		} finally { restarted.close(); }
	} finally { owner.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test('CM-S3-AUTH: heartbeat and resume cannot cross the deadline between validation and commit', async () => {
	const f = fixture();
	try {
		for (const operation of ['heartbeat', 'resume']) {
			let now = 0; const ticks: number[] = [];
			const owner = new ConnectionSessionOwner({ daemonEpoch: 'epoch', isRegistered: async root => f.registered.has(root),
				monotonicNow: () => ticks.shift() ?? now, createOverlay: () => new Map() });
			try {
				const opened = await owner.open(context('first'), f.a);
				now = 90000; ticks.push(89999, 90000);
				assert.throws(() => operation === 'heartbeat' ? owner.heartbeat(context('first')) : owner.resume(context('second'), opened), code('session-expired'));
				assert.equal(owner.size, 0);
			} finally { owner.close(); }
		}
	} finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('CM-S3-AUTH: late root eligibility cannot publish an overlay under a superseded control', async () => {
	const f = fixture(); let entered!: () => void, decide!: (value: boolean) => void, allocations = 0;
	const entering = new Promise<void>(resolve => { entered = resolve; });
	const decision = new Promise<boolean>(resolve => { decide = resolve; });
	const owner = new ConnectionSessionOwner({ daemonEpoch: 'epoch',
		isRegistered: async root => { if (root === f.b) { entered(); return decision; } return f.registered.has(root); },
		createOverlay: () => { allocations++; return new Map(); } });
	try {
		const a = context('old'), b = context('new'); const opened = await owner.open(a, f.a);
		const pending = owner.overlay(a, f.b); await entering;
		owner.resume(b, opened); decide(true);
		await assert.rejects(pending, code('session-expired')); assert.equal(allocations, 1);
		owner.disconnect(a); // a late old-socket close must not detach the new generation
		owner.heartbeat(b);
	} finally { owner.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test('CM-S3-AUTH: canonical registered eligibility and cancellation prevent late session publication', async () => {
	const f = fixture(); let allocations = 0;
	const owner = new ConnectionSessionOwner({ daemonEpoch: 'epoch', isRegistered: async root => f.registered.has(root),
		createOverlay: () => { allocations++; return new Map(); } });
	try {
		const alias = join(f.directory, 'alias'); symlinkSync(f.a, alias);
		for (const root of [alias, f.a + '/', f.directory, 'relative']) {
			await assert.rejects(() => owner.open(context(root), root));
		}
		assert.equal(allocations, 0);
		const controller = new AbortController();
		let entered!: () => void, decide!: (value: boolean) => void;
		const entering = new Promise<void>(resolve => { entered = resolve; });
		const decision = new Promise<boolean>(resolve => { decide = resolve; });
		const late = new ConnectionSessionOwner({ daemonEpoch: 'epoch', isRegistered: async () => { entered(); return decision; },
			createOverlay: () => { allocations++; return new Map(); } });
		try {
			const pending = late.open({ ...context('late'), signal: controller.signal }, f.a);
			await entering; controller.abort(); decide(true);
			await assert.rejects(pending, code('session-expired'));
			assert.equal(late.size, 0); assert.equal(allocations, 0);
		} finally { late.close(); }
	} finally { owner.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

async function client(path: string) {
	const socket = createConnection(path); await once(socket, 'connect');
	let sequence = 0, buffer = '';
	const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
	socket.on('data', chunk => {
		buffer += chunk.toString();
		for (;;) {
			const end = buffer.indexOf('\n'); if (end < 0) break;
			const reply = JSON.parse(buffer.slice(0, end)) as { id: number; result?: unknown; error?: string };
			buffer = buffer.slice(end + 1);
			const call = pending.get(reply.id); pending.delete(reply.id);
			if (reply.error) call?.reject(new Error(reply.error)); else call?.resolve(reply.result);
		}
	});
	const fail = () => { for (const call of pending.values()) call.reject(new Error('test socket closed')); pending.clear(); };
	socket.on('error', fail); socket.on('close', fail);
	return {
		call<T>(method: string, params: unknown = {}): Promise<T> {
			return new Promise((resolve, reject) => {
				const id = ++sequence;
				pending.set(id, { resolve: value => resolve(value as T), reject });
				socket.write(JSON.stringify({ id, method, params, client: { label: 'same-untrusted-label', pid: process.pid } }) + '\n');
			});
		},
		async close() { const closed = once(socket, 'close'); socket.destroy(); await closed; },
	};
}

test('CM-S3-RECONNECT: real sockets preserve overlay data across roots and control rollover without renewing the lease', async () => {
	const f = fixture(), path = join(f.directory, 'owner.sock'); let now = 0, allocations = 0;
	let owner: ConnectionSessionOwner<Map<string, string>> | undefined;
	const ownerFor = (context: TrustedRpcContext) => owner ??= new ConnectionSessionOwner({ daemonEpoch: context.daemonEpoch,
		isRegistered: async root => f.registered.has(root), monotonicNow: () => now,
		createOverlay: root => { allocations++; return new Map([['row', root === f.a ? 'a-private-row' : 'b-private-row']]); } });
	const route = (run: (params: unknown, context: TrustedRpcContext) => unknown | Promise<unknown>): RpcHandler => async (params, context) => {
		try { assert.ok(context); return await run(params, context); } catch (error) { return managementRejection(error); }
	};
	// This fixture binds the real server's identity to the owner core. Production
	// strict method registration/decoding is t4; no user daemon is involved here.
	const server = new IpcServer(directDispatch({
		'fixture.open': route((params, context) => ownerFor(context).open(context, (params as { repoRoot: string }).repoRoot)),
		'fixture.resume': route((params, context) => ownerFor(context).resume(context, params as SessionResume)),
		'fixture.heartbeat': route((_params, context) => ownerFor(context).heartbeat(context)),
		'fixture.end': route((_params, context) => { ownerFor(context).end(context); return { ended: true }; }),
		'fixture.peek': route(async (params, context) => {
			const { repoRoot, expected } = params as { repoRoot: string; expected: string };
			return { matches: (await ownerFor(context).overlay(context, repoRoot)).get('row') === expected };
		}),
	}), Date.now, path);
	let a: Awaited<ReturnType<typeof client>> | undefined, b: Awaited<ReturnType<typeof client>> | undefined;
	try {
		await server.listen(); a = await client(path); b = await client(path);
		const opened = await a.call<OpenConnectionSessionResult>('fixture.open', { repoRoot: f.a });
		assert.deepEqual(await a.call('fixture.peek', { repoRoot: f.a, expected: 'a-private-row' }), { matches: true });
		assert.deepEqual(await a.call('fixture.peek', { repoRoot: f.b, expected: 'b-private-row' }), { matches: true });
		assert.equal((await b.call<{ code: string }>('fixture.heartbeat')).code, 'session-expired', 'same PID/label is not control authority');
		now = 89000;
		assert.equal((await b.call<OpenConnectionSessionResult>('fixture.resume', opened)).sessionHandle, opened.sessionHandle);
		assert.equal((await a.call<{ code: string }>('fixture.heartbeat')).code, 'session-expired');
		assert.equal((await a.call<{ code: string }>('fixture.end')).code, 'session-expired');
		assert.deepEqual(await b.call('fixture.peek', { repoRoot: f.a, expected: 'a-private-row' }), { matches: true });
		assert.deepEqual(await b.call('fixture.peek', { repoRoot: f.b, expected: 'b-private-row' }), { matches: true });
		assert.equal(allocations, 2, 'resume/root switching preserved both original memory aggregates');
		now = 90000;
		assert.equal((await b.call<{ code: string }>('fixture.heartbeat')).code, 'session-expired');
		assert.equal(owner?.size, 0);
	} finally {
		await a?.close(); await b?.close(); await server.close(); owner?.close();
		rmSync(f.directory, { recursive: true, force: true });
	}
});
