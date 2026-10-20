/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cancellation reaches the call in flight (Epic 8315a11f s1, plan task t4): a
 * CLI call's process group is killed and the call throws AbortError at once;
 * an Ollama request is aborted; neither is retried. CLI paths run a FAKE binary
 * that hangs; the Ollama path a local HTTP server that never finishes answering.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/abort-in-flight.test.ts
 */

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider } from '../cli-provider.js';
import { OllamaProvider } from '../ollama.js';

const SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } };

/** A fake CLI that records its pid in `pids` and then hangs for a minute. */
const HANGING = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
appendFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pids'), process.pid + '\\n');
setTimeout(() => {}, 60_000);
`;

function hangingCli(): { bin: string; pids: () => number[]; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-abort-'));
	const bin = join(dir, 'fake.mjs');
	writeFileSync(bin, HANGING);
	chmodSync(bin, 0o755);
	const pids = join(dir, 'pids');
	return {
		bin,
		pids: () => (existsSync(pids) ? readFileSync(pids, 'utf8').trim().split('\n').filter(Boolean).map(Number) : []),
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitFor(cond: () => boolean, ms: number): Promise<void> {
	const until = Date.now() + ms;
	while (!cond() && Date.now() < until) await new Promise(r => setTimeout(r, 25));
}

/** Abort once the fake has started, then measure how long the call takes to end. */
async function abortWhenRunning(f: ReturnType<typeof hangingCli>, run: (signal: AbortSignal) => Promise<unknown>): Promise<{ err: unknown; ms: number }> {
	const ac = new AbortController();
	const call = run(ac.signal).then(() => null, (e: unknown) => e);
	await waitFor(() => f.pids().length > 0, 10_000);
	const t0 = Date.now();
	ac.abort();
	// Bounded: a call the abort does not reach would otherwise wait for the fake's minute.
	const err = await Promise.race([call, new Promise(r => setTimeout(() => r(new Error('still running 5 s after the abort')), 5_000))]);
	return { err, ms: Date.now() - t0 };
}

test('aborting a CLI completeStructured or reviewer session in flight kills the process group and throws AbortError at once; an aborted Ollama request throws AbortError; neither is retried', async () => {
	// CliProvider.completeStructured, with today's retries left on: an abort is still not retried.
	{
		const f = hangingCli();
		try {
			const p = new CliProvider({ kind: 'claude', binPath: f.bin });
			const { err, ms } = await abortWhenRunning(f, signal => p.completeStructured([{ role: 'user', content: 'x' }], SCHEMA, { signal }));
			assert.ok(err instanceof Error && err.name === 'AbortError', `completeStructured: got ${String(err)}`);
			assert.ok(ms < 2_000, `completeStructured ended ${ms} ms after the abort`);
			await waitFor(() => !alive(f.pids()[0]!), 2_000);
			assert.equal(alive(f.pids()[0]!), false, 'the CLI process is killed');
			assert.equal(f.pids().length, 1, 'not retried');
		} finally { f.cleanup(); }
	}
	// CliProvider.runReviewSession: same.
	{
		const f = hangingCli();
		try {
			const p = new CliProvider({ kind: 'claude', binPath: f.bin });
			const { err, ms } = await abortWhenRunning(f, signal => p.runReviewSession('x', SCHEMA, { cwd: tmpdir(), deadlineMs: 60_000, signal }));
			assert.ok(err instanceof Error && err.name === 'AbortError', `runReviewSession: got ${String(err)}`);
			assert.ok(ms < 2_000, `runReviewSession ended ${ms} ms after the abort`);
			await waitFor(() => !alive(f.pids()[0]!), 2_000);
			assert.equal(alive(f.pids()[0]!), false, 'the CLI process is killed');
			assert.equal(f.pids().length, 1, 'not retried');
		} finally { f.cleanup(); }
	}
	// An already-aborted signal spawns nothing.
	{
		const f = hangingCli();
		try {
			const p = new CliProvider({ kind: 'claude', binPath: f.bin });
			const err = await p.completeStructured([{ role: 'user', content: 'x' }], SCHEMA, { signal: AbortSignal.abort() }).then(() => null, (e: unknown) => e);
			assert.ok(err instanceof Error && err.name === 'AbortError', `pre-aborted: got ${String(err)}`);
			assert.equal(f.pids().length, 0, 'no process was started');
		} finally { f.cleanup(); }
	}
	// OllamaProvider: a server that starts a streamed answer and never finishes it.
	let requests = 0;
	const server = createServer((req, res) => {
		requests++;
		req.resume();
		res.writeHead(200, { 'content-type': 'application/x-ndjson' });
		res.write(JSON.stringify({ message: { role: 'assistant', content: '{"ok":' }, done: false }) + '\n');
		// never ends
	});
	await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
	const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	try {
		const p = new OllamaProvider('test-model', host);
		for (const [label, run] of [
			['completeStructured', (signal: AbortSignal) => p.completeStructured([{ role: 'user', content: 'x' }], SCHEMA, { signal })],
			['complete', (signal: AbortSignal) => p.complete([{ role: 'user', content: 'x' }], { signal })],
		] as const) {
			const before = requests;
			const ac = new AbortController();
			const call = run(ac.signal).then(() => null, (e: unknown) => e);
			await waitFor(() => requests > before, 5_000);
			const t0 = Date.now();
			ac.abort();
			// Bounded: a request the abort does not reach would otherwise hang the test.
			const err = await Promise.race([call, new Promise(r => setTimeout(() => r(new Error('still running 5 s after the abort')), 5_000))]);
			assert.ok(err instanceof Error && err.name === 'AbortError', `ollama ${label}: got ${String(err)}`);
			assert.ok(Date.now() - t0 < 2_000, `ollama ${label} ended promptly`);
			assert.equal(requests - before, 1, `ollama ${label} not retried`);
		}
	} finally {
		server.closeAllConnections();
		await new Promise<void>(r => server.close(() => r()));
	}
});
