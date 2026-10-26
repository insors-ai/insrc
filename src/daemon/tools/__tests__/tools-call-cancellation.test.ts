/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t10: closing a tools.call stream cancels the call, over the real unix-socket
 * IpcServer and the real broker. Stand-in git and gh executables on PATH sleep and fork a descendant; its pid
 * is checked.
 * Run: npx tsx --test src/daemon/tools/__tests__/tools-call-cancellation.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { approvalBroker } from '../../approval.js';
import { IpcServer, directDispatch } from '../../server.js';
import type { ApprovalGateFrame } from '../../../shared/types.js';
import { registerForTests } from '../builtins/git/__tests__/_repo.js';
import { installStandInGit } from '../builtins/git/__tests__/_standin.js';
import type { StandIn } from '../builtins/git/__tests__/_standin.js';
import { registerGhTools } from '../builtins/gh/index.js';
import { toolsCall } from '../call-handler.js';
import { _setApprovalGateForTests, executeTool } from '../executor.js';
import { registerTool } from '../registry.js';
import type { Tool, ToolDeps, ToolResult } from '../types.js';
import { installStandInBin } from './_bin.js';
import type { StandInBin } from './_bin.js';
import { alive, cleanup, fileExists, groupDescendant, readPid, tmp, waitFor } from './_proc.js';

const BOUND_MS = 2000 + 1500;
const OK: ToolResult = { output: 'ok', format: 'text', success: true };

interface Call { close(): void }

let server: IpcServer | undefined;
let dir: string | undefined;
let sock: Socket | undefined;
let standGit: StandIn | undefined;
let standBin: StandInBin | undefined;
let unsubscribe: (() => void) | undefined;
afterEach(async () => {
	sock?.destroy(); sock = undefined;
	unsubscribe?.(); unsubscribe = undefined;
	_setApprovalGateForTests(undefined);
	standGit?.restore(); if (standGit) cleanup(standGit.dir); standGit = undefined;
	standBin?.restore(); if (standBin) cleanup(standBin.dir); standBin = undefined;
	await server?.close(); server = undefined;
	if (dir) rmSync(dir, { recursive: true, force: true }); dir = undefined;
});

/** Start the server with tools.call and send one tools.call request over a socket; closing the call destroys the socket. */
async function start(params: Record<string, unknown>): Promise<Call> {
	dir = mkdtempSync(join(tmpdir(), 'insrc-tools-call-'));
	const path = join(dir, 'd.sock');
	server = new IpcServer(directDispatch({}, { 'tools.call': toolsCall }), Date.now, path);
	await server.listen();
	let buf = '';
	const s = await new Promise<Socket>((resolve, reject) => { const c = createConnection(path, () => resolve(c)); c.on('error', reject); });
	sock = s;
	s.on('error', () => {});
	s.on('data', c => {
		buf += c.toString();
		const parts = buf.split('\n'); buf = parts.pop() ?? '';
		void parts;
	});
	s.write(JSON.stringify({ id: 1, method: 'tools.call', params, stream: true }) + '\n');
	return {
		close: () => s.destroy(),
	};
}

const call = (toolId: string, input: Record<string, unknown>): Record<string, unknown> => ({ toolId, input, repoPath: '/tmp', caller: 'agent' });

/** The call has started its subprocess when its descendant's pid file exists. */
async function started(pidFile: string): Promise<number> {
	assert.ok(await waitFor(() => fileExists(pidFile), 5000), 'the stand-in started');
	return readPid(pidFile);
}

test('tools-call-cancellation.test.ts, git_diff: closing the stream kills the stand-in tree and settles within the bound although git_diff forwards no signal', async () => {
	const work = tmp();
	try {
		registerForTests();
		const pidFile = join(work, 'pid');
		standGit = installStandInGit(groupDescendant(pidFile));
		const c = await start(call('git_diff', { cwd: '/tmp' }));
		const pid = await started(pidFile);
		c.close();
		assert.ok(await waitFor(() => !alive(pid), BOUND_MS), 'the descendant is gone within the bound');
	} finally { cleanup(work); }
});

test('tools-call-cancellation.test.ts, legacy gh export: closing the stream kills the stand-in gh tree and settles within the bound', async () => {
	const work = tmp();
	try {
		registerGhTools();
		const pidFile = join(work, 'pid');
		standBin = installStandInBin('gh', groupDescendant(pidFile));
		const c = await start(call('gh_project_list', {}));
		const pid = await started(pidFile);
		c.close();
		assert.ok(await waitFor(() => !alive(pid), BOUND_MS), 'the descendant is gone within the bound');
	} finally { cleanup(work); }
});

test('tools-call-cancellation.test.ts, auth probe: closing the stream while the probe runs kills the probe tree and no further gh process starts', async () => {
	const work = tmp();
	try {
		registerGhTools();
		const pidFile = join(work, 'pid');
		standBin = installStandInBin('gh', `case "$*" in *"auth status"*) ${groupDescendant(pidFile)};; *) echo "HTTP 403 forbidden" >&2; exit 1;; esac`);
		const c = await start(call('gh_project_list', {}));
		const pid = await started(pidFile);
		const before = standBin.calls().length;
		c.close();
		assert.ok(await waitFor(() => !alive(pid), BOUND_MS), 'the probe tree is gone within the bound');
		await new Promise(r => setTimeout(r, 300));
		assert.equal(standBin.calls().length, before, 'no further gh process started');
		assert.ok(standBin.calls().some(x => x.startsWith('auth status')), 'it was the probe that ran');
	} finally { cleanup(work); }
});

test('tools-call-cancellation.test.ts, multi-command tool: git_show stopped in its second command never starts the third', async () => {
	const work = tmp();
	try {
		registerForTests();
		const pidFile = join(work, 'pid');
		// each call is logged before the body runs, so the second command is the one that sees two lines
		standGit = installStandInGit(`if [ "$(grep -c . "$(dirname "$0")/calls.log")" -ge 2 ]; then ${groupDescendant(pidFile)}; fi\nprintf 'sha\\037sh\\037\\037an\\037ae\\037d\\037subj\\037body'`);
		const c = await start(call('git_show', { cwd: '/tmp', ref: 'HEAD' }));
		const pid = await started(pidFile);
		assert.equal(standGit.calls().length, 2, 'the second command is the one that sleeps');
		c.close();
		assert.ok(await waitFor(() => !alive(pid), BOUND_MS), 'the running command is stopped');
		await new Promise(r => setTimeout(r, 300));
		assert.equal(standGit.calls().length, 2, 'the third command never started');
	} finally { cleanup(work); }
});

test('tools-call-cancellation.test.ts, approval preview: closing the stream while the preview of git_push (no ref) runs kills its tree, and no approval request reaches the subscriber', async () => {
	const work = tmp();
	try {
		registerForTests();
		const pidFile = join(work, 'pid');
		standGit = installStandInGit(groupDescendant(pidFile));
		const requests: ApprovalGateFrame[] = [];
		unsubscribe = approvalBroker.subscribe(f => { requests.push(f as ApprovalGateFrame); });
		const c = await start(call('git_push', { cwd: '/tmp', force: true }));
		const pid = await started(pidFile);
		c.close();
		assert.ok(await waitFor(() => !alive(pid), BOUND_MS), 'the preview\'s process tree is gone within the bound');
		await new Promise(r => setTimeout(r, 300));
		assert.equal(requests.filter(f => f.type === 'request').length, 0, 'the preview was cut off before the ask');
		// the same cut-off, seen at the executor: the call returns the cancelled denial
		const ctl = new AbortController();
		const pending = executeTool('git_push', { cwd: '/tmp', force: true }, { sessionId: 's', repoPath: '/tmp', send: () => {}, requestId: 1, signal: ctl.signal });
		await new Promise(r => setTimeout(r, 300));
		ctl.abort();
		const r = await pending;
		assert.equal(r.failure?.kind, 'denied');
		assert.equal((r.failure as { denial?: string }).denial, 'cancelled');
		assert.equal(requests.filter(f => f.type === 'request').length, 0);
	} finally { cleanup(work); }
});

test('tools-call-cancellation.test.ts, nested approval wait: closing the stream resolves the nested approval as cancelled at once and the nested call returns the cancelled denial', async () => {
	let nested: ToolResult | undefined;
	let nestedRan = 0;
	registerTool({ id: 'tc_victim', description: 'x', inputSchema: { type: 'object' }, approval: 'destructive', async execute() { nestedRan++; return OK; } } as Tool);
	registerTool({
		id: 'tc_outer', description: 'x', inputSchema: { type: 'object' }, approval: 'none',
		async execute(_i: unknown, d: ToolDeps) { nested = await executeTool('tc_victim', {}, { ...d, signal: undefined }); return OK; },
	} as Tool);
	const seen: ApprovalGateFrame[] = [];
	unsubscribe = approvalBroker.subscribe(f => { seen.push(f as ApprovalGateFrame); });
	const c = await start(call('tc_outer', {}));
	assert.ok(await waitFor(() => seen.some(f => f.type === 'request'), 3000), 'the nested approval is pending');
	const t0 = Date.now();
	c.close();
	assert.ok(await waitFor(() => nested !== undefined, BOUND_MS), 'the nested call returned');
	assert.ok(Date.now() - t0 < BOUND_MS, 'not after the 300000 ms approval time-out');
	assert.equal(nested?.failure?.kind, 'denied');
	assert.equal((nested?.failure as { denial?: string }).denial, 'cancelled');
	assert.equal(nestedRan, 0);
});

test('tools-call-cancellation.test.ts, nested subprocess: closing the stream kills the subprocess of a second tool called without a signal', async () => {
	const work = tmp();
	try {
		registerForTests();
		const pidFile = join(work, 'pid');
		standGit = installStandInGit(groupDescendant(pidFile));
		registerTool({
			id: 'tc_outer2', description: 'x', inputSchema: { type: 'object' }, approval: 'none',
			async execute(_i: unknown, d: ToolDeps) { await executeTool('git_rev_parse', { cwd: '/tmp', rev: 'HEAD' }, { ...d, signal: undefined }); return OK; },
		} as Tool);
		const c = await start(call('tc_outer2', {}));
		const pid = await started(pidFile);
		c.close();
		assert.ok(await waitFor(() => !alive(pid), BOUND_MS), 'the nested tool\'s process tree is gone within the bound');
	} finally { cleanup(work); }
});

test('tools-call-cancellation.test.ts, pending approval and not-started tool: closing the stream resolves a pending approval as cancelled and the tool never starts', async () => {
	let ran = 0;
	registerTool({ id: 'tc_gated', description: 'x', inputSchema: { type: 'object' }, approval: 'destructive', async execute() { ran++; return OK; } } as Tool);
	unsubscribe = approvalBroker.subscribe(() => {});
	const c = await start(call('tc_gated', {}));
	assert.ok(await waitFor(() => approvalBroker.pendingCount === 1, 3000), 'the approval is pending');
	c.close();
	assert.ok(await waitFor(() => approvalBroker.pendingCount === 0, BOUND_MS), 'the pending approval was resolved');
	await new Promise(r => setTimeout(r, 200));
	assert.equal(ran, 0);
});
