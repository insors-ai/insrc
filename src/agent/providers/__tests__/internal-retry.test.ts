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
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
