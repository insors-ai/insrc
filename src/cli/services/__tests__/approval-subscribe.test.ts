/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t9: the terminal client's approval exchange against the real
 * unix-socket IpcServer and the real broker, and the prompt it renders.
 * Run: npx tsx --test src/cli/services/__tests__/approval-subscribe.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { render } from 'ink-testing-library';

import { createApprovalRpc } from '../../../daemon/approval.js';
import { ApprovalBroker } from '../../../daemon/approval-broker.js';
import { IpcServer } from '../../../daemon/server.js';
import { createIpcClient } from '../../../shared/ipc-client.js';
import type { ApprovalRequest } from '../../../shared/types.js';
import { ApprovalPrompt } from '../../ui/ApprovalPrompt.js';
import { createApprovalWatcher } from '../approval.js';

let seq = 0;
function req(): ApprovalRequest {
	seq += 1;
	return { requestId: `cli${seq}`, toolId: 'git_push', approvalClass: 'destructive', repoPath: '/work/repo', arguments: { remote: 'origin', ref: 'main', force: true }, preview: { title: 'git push --force', content: 'origin main' }, reason: 'force push', expiresAt: new Date(Date.now() + 60_000).toISOString() };
}
const until = async (cond: () => boolean, ms = 4000): Promise<void> => {
	const end = Date.now() + ms;
	while (!cond()) { if (Date.now() > end) throw new Error('condition not met in time'); await new Promise(r => setTimeout(r, 10)); }
};

async function startServer(path: string): Promise<{ broker: ApprovalBroker; server: IpcServer }> {
	const broker = new ApprovalBroker();
	const rpc = createApprovalRpc(broker);
	const server = new IpcServer({ 'approval.answer': rpc.answer }, { 'approval.subscribe': rpc.subscribe }, Date.now, path);
	await server.listen();
	return { broker, server };
}

test('approval-subscribe.test.ts: the terminal client receives a gate frame, shows the tool, repository and arguments, and sends approval.answer', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-cli-approval-'));
	const path = join(dir, 'd.sock');
	const { broker, server } = await startServer(path);
	const watcher = createApprovalWatcher({ client: createIpcClient(() => createConnection(path)), reconnectMs: 50 });
	try {
		watcher.start();
		await until(() => broker.pendingCount === 0 && watcher.pending().length === 0);
		await new Promise(r => setTimeout(r, 80)); // the stream is open
		const r = req();
		const outcome = broker.ask(r);
		await until(() => watcher.pending().length === 1);
		assert.deepEqual(watcher.pending()[0], r);

		// what the prompt shows
		const view = render(createElement(ApprovalPrompt, { request: r, more: 2, onAnswer: () => {} }));
		const frame = view.lastFrame() ?? '';
		assert.match(frame, /git_push/);
		assert.match(frame, /\/work\/repo/);
		assert.match(frame, /"force":true/);
		assert.match(frame, /destructive/);
		assert.match(frame, /\+2 more waiting/);
		view.unmount();

		// the keys answer
		const answered: string[] = [];
		const keys = render(createElement(ApprovalPrompt, { request: r, more: 0, onAnswer: d => answered.push(d) }));
		await new Promise(res => setTimeout(res, 20));
		keys.stdin.write('y');
		keys.stdin.write('n');
		await new Promise(res => setTimeout(res, 20));
		assert.deepEqual(answered, ['approve', 'decline']);
		keys.unmount();

		// approval.answer reaches the broker and the call resolves; the prompt leaves the list at once
		assert.deepEqual(await watcher.answer(r.requestId, 'approve'), { accepted: true });
		assert.equal(watcher.pending().length, 0);
		assert.deepEqual(await outcome, { requestId: r.requestId, decision: 'approve' });
	} finally {
		watcher.stop(); server.disconnectClients(); await server.close(); rmSync(dir, { recursive: true, force: true });
	}
});

test('approval-subscribe.test.ts: a cancel frame removes the prompt and the stream is reopened after a restart', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-cli-approval-'));
	const path = join(dir, 'd.sock');
	let { broker, server } = await startServer(path);
	const watcher = createApprovalWatcher({ client: createIpcClient(() => createConnection(path)), reconnectMs: 50 });
	try {
		watcher.start();
		await new Promise(r => setTimeout(r, 100));

		// a cancel frame removes the prompt
		const abort = new AbortController();
		const first = req();
		const cancelled = broker.ask(first, abort.signal);
		await until(() => watcher.pending().length === 1);
		abort.abort();
		assert.equal(await cancelled, 'cancelled');
		await until(() => watcher.pending().length === 0);

		// the daemon restarts: the pending request is gone and the watcher subscribes again
		const second = req();
		const lost = broker.ask(second);
		await until(() => watcher.pending().length === 1);
		server.disconnectClients();
		await server.close();
		assert.equal(await lost, 'no-client');
		await until(() => watcher.pending().length === 0);
		({ broker, server } = await startServer(path));
		await new Promise(r => setTimeout(r, 300)); // the reconnect timer fires and the stream reopens
		const third = req();
		const again = broker.ask(third);
		await until(() => watcher.pending().length === 1);
		assert.equal(watcher.pending()[0]!.requestId, third.requestId);
		await watcher.answer(third.requestId, 'decline');
		assert.equal(await again, 'declined');
	} finally {
		watcher.stop(); server.disconnectClients(); await server.close(); rmSync(dir, { recursive: true, force: true });
	}
});

test('approval-subscribe.test.ts: an answer that cannot be sent brings the prompt back with the reason, and a late answer says the request was no longer open', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-cli-approval-'));
	const path = join(dir, 'd.sock');
	const { broker, server } = await startServer(path);
	let failNext = true;
	const real = createIpcClient(() => createConnection(path));
	// The first approval.answer call fails as if the daemon had dropped the connection.
	const client = { ...real, rpc: (async (m: string, p?: unknown) => { if (m === 'approval.answer' && failNext) { failNext = false; throw new Error('socket closed'); } return real.rpc(m, p); }) as typeof real.rpc };
	const watcher = createApprovalWatcher({ client, reconnectMs: 50 });
	try {
		watcher.start();
		await new Promise(r => setTimeout(r, 100));
		const r = req(); const outcome = broker.ask(r);
		await until(() => watcher.pending().length === 1);

		await assert.rejects(watcher.answer(r.requestId, 'approve'), /socket closed/);
		assert.equal(watcher.pending().length, 1, 'the prompt is back');
		assert.match(watcher.notice() ?? '', /could not send your answer for git_push: socket closed/);

		// the retry goes through
		assert.deepEqual(await watcher.answer(r.requestId, 'approve'), { accepted: true });
		assert.equal(watcher.notice(), undefined);
		assert.deepEqual(await outcome, { requestId: r.requestId, decision: 'approve' });

		// answering a request the daemon already closed says so
		const late = req(); const abort = new AbortController();
		const closed = broker.ask(late, abort.signal);
		await until(() => watcher.pending().length === 1);
		(broker as unknown as { finish: (id: string, o: unknown, r: string) => void }).finish(late.requestId, 'timed-out', 'no-client'); // closed without telling this client
		assert.equal(await closed, 'timed-out');
		assert.deepEqual(await watcher.answer(late.requestId, 'approve'), { accepted: false });
		assert.match(watcher.notice() ?? '', /no longer open/);
	} finally {
		watcher.stop(); server.disconnectClients(); await server.close(); rmSync(dir, { recursive: true, force: true });
	}
});
