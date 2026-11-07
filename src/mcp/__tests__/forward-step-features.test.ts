/**
 * The forwarder refuses a request-carrying analyze call to a daemon that does
 * not advertise `analyze-request`, and forwards everything else (Story
 * 65b643840a294422/s1, task t16). The real IpcServer request handling on a
 * temporary socket; the daemon's status and the step handlers are stand-ins.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IpcServer, directDispatch } from '../../daemon/server.js';
import type { RpcHandlers, StreamHandlers } from '../../daemon/server.js';
import { createStepCallHandler } from '../../daemon/steps/host.js';
import { forwardStep } from '../forward-step.js';
import type { StepMcpEnvelope } from '../forward-step.js';

async function standInDaemon(stream: StreamHandlers, rpc: RpcHandlers) {
	const ipc = new IpcServer(directDispatch(rpc, stream));
	const dir = mkdtempSync(join(tmpdir(), 'insrc-forward-features-'));
	const path = join(dir, 'd.sock');
	const server = createServer((socket: Socket) => { (ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(socket); });
	await new Promise<void>(r => server.listen(path, () => r()));
	return {
		connect: (): Socket => createConnection(path),
		close: async (): Promise<void> => { await new Promise<void>(r => server.close(() => r())); rmSync(dir, { recursive: true, force: true }); },
	};
}

const parse = (env: StepMcpEnvelope): { next?: string; error?: { code: string; name: string; message: string } } => JSON.parse(env.content[0]!.text) as never;
const REQUEST = { question: 'how does settlement work', scopeRef: { kind: 'module', value: '/work/app/src/pay' } };

test('a request call to a daemon lacking analyze-request is refused with DaemonTooOldError, forwarded to a daemon that advertises it, a prompt-only call is forwarded to either, and a same-process reconnect that switches daemon capability between calls sees the change', async () => {
	let features: readonly string[] | undefined = undefined;
	let statusCalls = 0;
	const seen: Array<{ tool: string; args: unknown }> = [];
	const spy = (tool: string) => async (args: unknown) => { seen.push({ tool, args }); return { content: [{ type: 'text', text: JSON.stringify({ next: 'done' }) }] }; };
	const daemon = await standInDaemon(
		{ 'step.call': createStepCallHandler({ insrc_analyze_step: spy('insrc_analyze_step'), insrc_analyze: spy('insrc_analyze') }) },
		{ 'daemon.status': async () => { statusCalls += 1; return { uptime: 1, repos: [], queueDepth: 0, embeddingsPending: 0, installedCommit: '', ...(features !== undefined ? { features } : {}) }; } },
	);
	try {
		const call = (tool: 'insrc_analyze_step' | 'insrc_analyze', args: unknown) => forwardStep(tool, args, {}, { connect: daemon.connect });

		// a daemon without the feature: a request call is refused by name, and no handler runs
		features = undefined;
		for (const tool of ['insrc_analyze_step', 'insrc_analyze'] as const) {
			const env = await call(tool, tool === 'insrc_analyze_step' ? { phase: 'start', request: REQUEST } : { request: REQUEST });
			assert.equal(env.isError, true, tool);
			const { error } = parse(env);
			assert.equal(error?.code, 'daemon-too-old', tool);
			assert.equal(error?.name, 'DaemonTooOldError', tool);
			assert.match(error!.message, /does not accept a structured analyze request/);
			assert.match(error!.message, /analyze-request/);
		}
		assert.deepEqual(seen, [], 'no step handler ran for a refused call');

		// ... and one that lists features without it is refused the same way
		features = ['something-else'];
		assert.equal(parse(await call('insrc_analyze', { request: REQUEST })).error?.code, 'daemon-too-old');

		// a prompt-only call is forwarded to a daemon without the feature, and the daemon is not even asked
		features = undefined;
		statusCalls = 0;
		for (const tool of ['insrc_analyze_step', 'insrc_analyze'] as const) {
			const env = await call(tool, tool === 'insrc_analyze_step' ? { phase: 'start', focus: 'q' } : { focus: 'q' });
			assert.equal(env.isError === true, false, tool);
		}
		assert.equal(statusCalls, 0, 'a prompt-only call costs no status request');
		assert.equal(seen.length, 2);

		// a daemon that advertises the feature: the request is forwarded to the handler, unchanged
		features = ['analyze-request'];
		seen.length = 0;
		const forwarded = await call('insrc_analyze', { request: REQUEST, repo: '/work/app' });
		assert.equal(forwarded.isError === true, false);
		assert.equal(seen.length, 1);
		assert.deepEqual((seen[0]!.args as { request: unknown }).request, REQUEST);

		// the same MCP process, the same forwarder, the daemon's capability switched between calls: each call sees the change
		const outcomes: string[] = [];
		for (const advertised of [undefined, ['analyze-request'], undefined, ['analyze-request']] as const) {
			features = advertised;
			const env = await call('insrc_analyze_step', { phase: 'start', request: REQUEST });
			outcomes.push(env.isError === true ? (parse(env).error?.code ?? 'error') : 'forwarded');
		}
		assert.deepEqual(outcomes, ['daemon-too-old', 'forwarded', 'daemon-too-old', 'forwarded']);
	} finally { await daemon.close(); }
});

test('a daemon that does not know daemon.status at all refuses a request call by name and runs no handler', async () => {
	let ran = 0;
	const daemon = await standInDaemon({ 'step.call': createStepCallHandler({ insrc_analyze: async () => { ran += 1; return { content: [{ type: 'text', text: '{}' }] }; } }) }, {});
	try {
		const env = await forwardStep('insrc_analyze', { request: REQUEST }, {}, { connect: daemon.connect });
		assert.equal(parse(env).error?.code, 'daemon-too-old');
		assert.equal(ran, 0);
	} finally { await daemon.close(); }
});
