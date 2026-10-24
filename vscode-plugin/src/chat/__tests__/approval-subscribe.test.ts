/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t10: the editor's approval prompt against the real unix-socket
 * IpcServer and the real broker. The notifier is a fake of the editor's message surface.
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApprovalRpc } from '../../../../src/daemon/approval.js';
import { ApprovalBroker } from '../../../../src/daemon/approval-broker.js';
import { IpcServer } from '../../../../src/daemon/server.js';
import { createIpcClient } from '../../../../src/shared/ipc-client.js';
import type { ApprovalRequest } from '../../../../src/shared/types.js';
import { approvalDetails, approvalText, createApprovalPrompter, type ApprovalChoice, type ApprovalNotifier } from '../approval-subscribe.js';

let seq = 0;
function req(): ApprovalRequest {
	seq += 1;
	return { requestId: `ed${seq}`, toolId: 'k8s_delete', approvalClass: 'destructive', repoPath: '/work/repo', arguments: { kind: 'pod', name: 'web-1' }, reason: 'delete', expiresAt: new Date(Date.now() + 60_000).toISOString() };
}
const until = async (cond: () => boolean, ms = 4000): Promise<void> => {
	const end = Date.now() + ms;
	while (!cond()) { if (Date.now() > end) throw new Error('condition not met in time'); await new Promise(r => setTimeout(r, 10)); }
};

/** A fake message surface: records every notification and lets the test click or close it. */
function fakeSurface() {
	const shown: Array<{ text: string; request: ApprovalRequest; click(c: ApprovalChoice | undefined): void; closed: boolean }> = [];
	const notifier: ApprovalNotifier = {
		show: (text, request) => {
			let resolve!: (c: ApprovalChoice | undefined) => void;
			const choice = new Promise<ApprovalChoice | undefined>(r => { resolve = r; });
			const entry = { text, request, click: (c: ApprovalChoice | undefined) => resolve(c), closed: false };
			shown.push(entry);
			return { choice, close: () => { entry.closed = true; } };
		},
	};
	return { shown, notifier };
}

async function startServer(path: string): Promise<{ broker: ApprovalBroker; server: IpcServer }> {
	const broker = new ApprovalBroker();
	const rpc = createApprovalRpc(broker);
	const server = new IpcServer({ 'approval.answer': rpc.answer }, { 'approval.subscribe': rpc.subscribe }, Date.now, path);
	await server.listen();
	return { broker, server };
}

test('approval-subscribe.test.ts: the editor and chat client receive a gate frame, show the exact call and send approval.answer', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-ed-approval-'));
	const path = join(dir, 'd.sock');
	const { broker, server } = await startServer(path);
	const surface = fakeSurface();
	const prompter = createApprovalPrompter({ client: createIpcClient(() => createConnection(path)), notifier: surface.notifier, reconnectMs: 50 });
	try {
		prompter.start();
		await new Promise(r => setTimeout(r, 100));
		const a = req(); const outA = broker.ask(a);
		await until(() => surface.shown.length === 1);
		assert.match(surface.shown[0]!.text, /k8s_delete/);
		assert.match(surface.shown[0]!.text, /\/work\/repo/);
		assert.match(surface.shown[0]!.text, /"name":"web-1"/);
		assert.match(surface.shown[0]!.text, /Destructive/);
		assert.deepEqual(surface.shown[0]!.request, a);

		surface.shown[0]!.click('approve');
		assert.deepEqual(await outA, { requestId: a.requestId, decision: 'approve' });

		const b = req(); const outB = broker.ask(b);
		await until(() => surface.shown.length === 2);
		surface.shown[1]!.click('decline');
		assert.equal(await outB, 'declined');

		// a notification dismissed without a choice sends nothing
		const c = req(); const outC = broker.ask(c, AbortSignal.timeout(300));
		await until(() => surface.shown.length === 3);
		surface.shown[2]!.click(undefined);
		assert.equal(await outC, 'cancelled', 'only the caller\'s own abort ended it');
	} finally {
		prompter.stop(); server.disconnectClients(); await server.close(); rmSync(dir, { recursive: true, force: true });
	}
});

test('approval-subscribe.test.ts: a cancel frame closes the notification and the stream is reopened after a restart', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-ed-approval-'));
	const path = join(dir, 'd.sock');
	let { broker, server } = await startServer(path);
	const surface = fakeSurface();
	const prompter = createApprovalPrompter({ client: createIpcClient(() => createConnection(path)), notifier: surface.notifier, reconnectMs: 50 });
	try {
		prompter.start();
		await new Promise(r => setTimeout(r, 100));

		// a cancel frame closes the notification, and a late click sends nothing
		const abort = new AbortController();
		const first = req(); const cancelled = broker.ask(first, abort.signal);
		await until(() => surface.shown.length === 1);
		abort.abort();
		assert.equal(await cancelled, 'cancelled');
		await until(() => surface.shown[0]!.closed);
		assert.deepEqual(prompter.open(), []);
		surface.shown[0]!.click('approve'); // too late: ignored
		await new Promise(r => setTimeout(r, 50));
		assert.equal(broker.pendingCount, 0);

		// the daemon restarts: the open notification is closed and the stream is opened again
		const second = req(); const lost = broker.ask(second);
		await until(() => surface.shown.length === 2);
		server.disconnectClients();
		await server.close();
		assert.equal(await lost, 'no-client');
		await until(() => surface.shown[1]!.closed);
		({ broker, server } = await startServer(path));
		await new Promise(r => setTimeout(r, 300));
		const third = req(); const again = broker.ask(third);
		await until(() => surface.shown.length === 3);
		surface.shown[2]!.click('decline');
		assert.equal(await again, 'declined');
	} finally {
		prompter.stop(); server.disconnectClients(); await server.close(); rmSync(dir, { recursive: true, force: true });
	}
});

test('approval-subscribe.test.ts: the extension attaches the prompter and shows Approve and Decline', () => {
	const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension.ts'), 'utf8');
	assert.match(src, /createApprovalPrompter\(\{/);
	assert.match(src, /showWarningMessage\(text, 'Approve', 'Decline', 'Show details'\)/);
	assert.match(src, /approvals\.start\(\)/);
	assert.match(approvalText(req()), /^Destructive call: k8s_delete in \/work\/repo with \{/);
});

test('approval-subscribe.test.ts: a long call keeps its length in the text, the details hold the whole call, and a late answer is reported', async () => {
	const long: ApprovalRequest = { ...req(), arguments: { script: 'x'.repeat(2000), target: 'prod' } };
	const text = approvalText(long);
	assert.match(text, /characters in total; see the full call\]/);
	assert.ok(text.length < 600);
	const details = JSON.parse(approvalDetails(long)) as { tool: string; repository: string; arguments: { script: string; target: string } };
	assert.equal(details.arguments.script.length, 2000, 'the details hold the whole call');
	assert.equal(details.tool, 'k8s_delete');

	const dir = mkdtempSync(join(tmpdir(), 'insrc-ed-approval-'));
	const path = join(dir, 'd.sock');
	const { broker, server } = await startServer(path);
	const surface = fakeSurface(); const notices: string[] = [];
	const prompter = createApprovalPrompter({ client: createIpcClient(() => createConnection(path)), notifier: { ...surface.notifier, notice: t => notices.push(t) }, reconnectMs: 50 });
	try {
		prompter.start();
		await new Promise(r => setTimeout(r, 100));
		const r = req(); const out = broker.ask(r);
		await until(() => surface.shown.length === 1);
		(broker as unknown as { finish: (id: string, o: unknown, why: string) => void }).finish(r.requestId, 'timed-out', 'no-client'); // closed without a cancel frame
		assert.equal(await out, 'timed-out');
		surface.shown[0]!.click('approve');
		await until(() => notices.length === 1);
		assert.match(notices[0]!, /no longer open/);
	} finally {
		prompter.stop(); server.disconnectClients(); await server.close(); rmSync(dir, { recursive: true, force: true });
	}
});
