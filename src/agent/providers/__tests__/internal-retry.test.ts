/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `internalRetry: false` makes each provider path attempt exactly once, so the
 * review pipeline owns every retry (Epic 8315a11f s1, plan task t1). Without the
 * field, today's retry counts stand. CLI paths run against a FAKE binary; the
 * Ollama path against a stand-in client.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/internal-retry.test.ts
 */

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider } from '../cli-provider.js';
import { OllamaProvider } from '../ollama.js';

const SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } };

/** A fake CLI that records each run in `calls.jsonl` and always fails with a transient error. */
const FAKE = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
for await (const _ of process.stdin) { /* drain */ }
appendFileSync(join(here, 'calls.jsonl'), 'run\\n');
process.stderr.write('API Error: overloaded');
process.exit(1);
`;

function fakeCli(): { bin: string; runs: () => number; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-internal-retry-'));
	const bin = join(dir, 'fake.mjs');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	const calls = join(dir, 'calls.jsonl');
	return {
		bin,
		runs: () => (existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').length : 0),
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

/** A stand-in Ollama client whose chat() always rejects, counting its calls. */
function failingOllama(): { provider: OllamaProvider; calls: () => number } {
	let n = 0;
	const p = new OllamaProvider();
	(p as unknown as { client: unknown }).client = {
		chat: async () => { n++; throw new Error('connect ECONNREFUSED 127.0.0.1:11434'); },
	};
	return { provider: p, calls: () => n };
}

test('internalRetry false makes exactly one attempt on CliProvider completeStructured, runReviewSession and OllamaProvider completeStructured; absent keeps today\'s counts', async () => {
	// CliProvider.completeStructured: one run with internalRetry false, three without.
	for (const [internalRetry, expected] of [[false, 1], [undefined, 3]] as const) {
		const f = fakeCli();
		try {
			const p = new CliProvider({ kind: 'claude', binPath: f.bin });
			await assert.rejects(p.completeStructured([{ role: 'user', content: 'x' }], SCHEMA, internalRetry === false ? { internalRetry } : {}));
			assert.equal(f.runs(), expected, `completeStructured, internalRetry=${String(internalRetry)}`);
		} finally { f.cleanup(); }
	}

	// CliProvider.runReviewSession: one run with internalRetry false, two (one transient retry) without.
	for (const [internalRetry, expected] of [[false, 1], [undefined, 2]] as const) {
		const f = fakeCli();
		try {
			const p = new CliProvider({ kind: 'claude', binPath: f.bin });
			const opts = { cwd: tmpdir(), deadlineMs: 60_000, ...(internalRetry === false ? { internalRetry } : {}) };
			await assert.rejects(p.runReviewSession(`x`, SCHEMA, opts));
			assert.equal(f.runs(), expected, `runReviewSession, internalRetry=${String(internalRetry)}`);
		} finally { f.cleanup(); }
	}

	// OllamaProvider.completeStructured: one request with internalRetry false, three without.
	for (const [internalRetry, expected] of [[false, 1], [undefined, 3]] as const) {
		const o = failingOllama();
		await assert.rejects(o.provider.completeStructured([{ role: 'user', content: 'x' }], SCHEMA, internalRetry === false ? { internalRetry } : {}));
		assert.equal(o.calls(), expected, `ollama completeStructured, internalRetry=${String(internalRetry)}`);
	}
});

/** A fake claude that records each run's stdin (the prompt) in `runs.jsonl` and answers. */
const FAKE_OK = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
let stdin = '';
for await (const c of process.stdin) stdin += c;
appendFileSync(process.env.INSRC_FAKE_RUNS, JSON.stringify(stdin) + '\\n');
process.stdout.write(JSON.stringify({ is_error: false, result: '', structured_output: { ok: true } }));
`;

test('a relaunch after a failed launch (ENOENT) delivers the prompt exactly once, even with internalRetry false', async () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-relaunch-'));
	const dirA = join(root, 'a');
	const dirB = join(root, 'b');
	mkdirSync(dirA); mkdirSync(dirB);
	const name = `insrc-fake-claude-${process.pid}`;
	const runsPath = join(root, 'runs.jsonl');
	writeFileSync(join(dirA, name), FAKE_OK);
	chmodSync(join(dirA, name), 0o755);
	const savedPath = process.env.PATH;
	const savedRuns = process.env.INSRC_FAKE_RUNS;
	process.env.PATH = `${dirA}:${dirB}:${savedPath ?? ''}`;
	process.env.INSRC_FAKE_RUNS = runsPath;
	const runs = (): string[] => (existsSync(runsPath) ? readFileSync(runsPath, 'utf8').trim().split('\n').map(l => JSON.parse(l) as string) : []);
	try {
		const p = new CliProvider({ kind: 'claude', binPath: name });
		// First call resolves and caches the binary in dir A.
		await p.completeStructured([{ role: 'user', content: 'first' }], SCHEMA, { internalRetry: false });
		assert.equal(runs().length, 1);
		// Move the binary: the cached path now fails to launch (ENOENT) and must be re-resolved.
		renameSync(join(dirA, name), join(dirB, name));
		const out = await p.completeStructured<{ ok: boolean }>([{ role: 'user', content: 'second' }], SCHEMA, { internalRetry: false });
		assert.deepEqual(out, { ok: true });
		const second = runs().slice(1);
		assert.equal(second.length, 1, 'the relaunched call ran exactly once');
		assert.ok(second[0]?.includes('second'), 'and it carried the prompt');
	} finally {
		process.env.PATH = savedPath;
		if (savedRuns === undefined) delete process.env.INSRC_FAKE_RUNS; else process.env.INSRC_FAKE_RUNS = savedRuns;
		rmSync(root, { recursive: true, force: true });
	}
});
