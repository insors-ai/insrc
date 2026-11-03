import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const mode = process.argv[2], base = new URL(mode === 'compiled' ? '../../../../../out/' : '../../../../', import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'cm-restart-peer-'));
try {
	const input: any = await new Promise(resolve => process.once('message', resolve));
	const { PATHS } = await import(new URL('shared/paths.js', base).href); PATHS.insrc = directory; PATHS.config = join(directory, 'config.json'); await writeFile(PATHS.config, '{}');
	const { ConnectionSessionRpc } = await import(new URL('daemon/connection-session-rpc.js', base).href); const { createTemporaryOverlay } = await import(new URL('daemon/db/session-entries.js', base).href); const { RequestLifetime } = await import(new URL('daemon/request-context.js', base).href);
	let overlay: any, factoryCalls = 0;
	const runtime = new ConnectionSessionRpc({ enabled: async () => true, isRegistered: async (root: string) => root === input.root, createOverlay(root: string, handle: string, context: any) { overlay = createTemporaryOverlay(root, handle, context, { factory() { factoryCalls++; throw Error('replacement must not restore a native resource'); } }); return overlay; }, dropOverlay: (value: any) => value.close() });
	const lifetime = new RequestLifetime(), context = { connectionIdentity: 'replacement-control', daemonEpoch: 'replacement-' + process.pid, signal: lifetime.signal, registerDrain: lifetime.registerDrain, assertRequestActive: lifetime.assertActive };
	try {
		const old = await runtime.call('db.connections.v2.session.resume', input.resume, context); assert.equal(old.code, 'session-expired');
		const opened = await runtime.call('db.connections.v2.session.open', { repoRoot: input.root }, context); assert.ok(opened.sessionHandle); await runtime.executionFor(context, input.root); const entries = overlay.list().length; assert.equal(entries, 0);
		await runtime.close(); lifetime.complete(); await lifetime.drained;
		await new Promise<void>((resolve, reject) => process.send!({ ok: true, pid: process.pid, oldCode: old.code, entries, factoryCalls }, error => error ? reject(error) : resolve()));
	} finally { lifetime.abort(); lifetime.complete(); await runtime.close(); await lifetime.drained; }
} catch { await new Promise<void>(resolve => process.send!({ ok: false }, () => resolve())); process.exitCode = 1; }
finally { await rm(directory, { recursive: true, force: true }); process.disconnect?.(); }
