/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The helper's single call through the real provider adapters
 * (LLD-b9d5c5c40df5a574-s3, task t6): CliProvider for Claude, Codex and Vibe
 * against a FAKE binary that records each run, and OllamaProvider against a
 * stand-in client. Each makes exactly one attempt per call, an Ollama part
 * request carries num_predict 8,192, malformed replies are 'invalid-reply' and
 * transport failures are 'call-failed'. No model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { OllamaProvider } from '../../../agent/providers/ollama.js';
import { inputLimitFor, outputTokensFor } from '../handling.js';
import type { AdmissionTarget } from '../handling.js';
import { callWithRepair, terminalReasonOf } from '../handling-call.js';
import { ShaperAnswerStepFailedError } from '../driver.js';
import { runDivided } from '../handling-parts.js';
import type { PartAdapter } from '../handling-parts.js';
import { renderSection } from '../sections.js';
import { runAggregator } from '../../runtimes/shared/aggregator.js';
import { loadAnalyzeConfig } from '../../../config/analyze.js';
import type { CallOutcome } from '../handling-call.js';

const SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } }, additionalProperties: false };

/** A fake CLI: records each run, then fails by transport (exit 1) or answers with prose that is not JSON (exit 0). */
const FAKE = `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
for await (const _ of process.stdin) { /* drain */ }
appendFileSync(join(here, 'calls.jsonl'), 'run\\n');
const mode = readFileSync(join(here, 'mode'), 'utf8').trim();
if (mode === 'transport') { process.stderr.write('API Error: overloaded'); process.exit(1); }
process.stdout.write('sure! here is some prose, not json');
process.exit(0);
`;

function fakeCli(mode: 'transport' | 'malformed'): { bin: string; runs: () => number; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-failure-kinds-'));
	const bin = join(dir, 'fake.mjs');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	writeFileSync(join(dir, 'mode'), mode);
	const calls = join(dir, 'calls.jsonl');
	return {
		bin,
		runs: () => (existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n').length : 0),
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

const CLI_TARGET: AdmissionTarget = { kind: 'cli', inputBudgetChars: 100_000 };

async function viaHelper(provider: CliProvider | OllamaProvider, target: AdmissionTarget, maxAttempts = 3): Promise<CallOutcome<unknown>> {
	return callWithRepair({
		provider, messages: [{ role: 'user', content: 'q' }], schema: SCHEMA,
		limit: inputLimitFor(target, 'part'), maxTokens: outputTokensFor(target, 'part'), maxAttempts,
	});
}

test('real Vibe, Claude and Codex adapters make exactly one attempt on a failing reply; Ollama request carries num_predict 8,192 for parts; malformed replies give invalid-answer, transport failures give model-failed', async () => {
	for (const kind of ['claude', 'codex', 'vibe'] as const) {
		// A transport failure: one run, 'call-failed' (the terminal 'model-failed' of a divided call).
		const down = fakeCli('transport');
		try {
			const out = await viaHelper(new CliProvider({ kind, binPath: down.bin, timeoutMs: 20_000 }), CLI_TARGET);
			assert.equal(out.kind, 'failed', kind);
			assert.equal(out.kind === 'failed' ? out.failure : '', 'call-failed', `${kind} transport failure`);
			assert.equal(out.kind === 'failed' ? terminalReasonOf(out.failure) : '', 'model-failed', `${kind}: a transport failure ends a divided call as model-failed`);
			assert.equal(down.runs(), 1, `${kind}: exactly one run on a transport failure`);
		} finally { down.cleanup(); }

		// A malformed reply on every attempt: the helper asks again up to its bound, each ask one run, and the
		// failure is 'invalid-reply' (the terminal 'invalid-answer'), never 'call-failed'.
		const bad = fakeCli('malformed');
		try {
			const out = await viaHelper(new CliProvider({ kind, binPath: bad.bin, timeoutMs: 20_000 }), CLI_TARGET, 2);
			assert.equal(out.kind, 'failed', kind);
			assert.equal(out.kind === 'failed' ? out.failure : '', 'invalid-reply', `${kind} malformed reply`);
			assert.equal(out.kind === 'failed' ? terminalReasonOf(out.failure) : '', 'invalid-answer', `${kind}: a malformed reply ends a divided call as invalid-answer`);
			assert.equal(bad.runs(), 2, `${kind}: one run per attempt, no provider-side retry`);
		} finally { bad.cleanup(); }
	}

	// A CLI provider enforces no output cap, and the helper passes none.
	assert.equal(outputTokensFor(CLI_TARGET, 'part'), undefined);

	// OllamaProvider: a part request carries num_predict 8,192; a single pass carries the configured tokens.
	const LOCAL: AdmissionTarget = { kind: 'local', windowTokens: 32_768, singlePassOutputTokens: 20_480 };
	const seen: Array<Record<string, unknown>> = [];
	const stub = (reply: string | Error): OllamaProvider => {
		const p = new OllamaProvider();
		(p as unknown as { client: unknown }).client = {
			chat: async (req: { options: Record<string, unknown> }) => {
				seen.push(req.options);
				if (reply instanceof Error) throw reply;
				return (async function* () { yield { message: { content: reply }, done: true }; })();
			},
		};
		return p;
	};
	const cut = await callWithRepair({
		provider: stub('{"ok": tr'), messages: [{ role: 'user', content: 'q' }], schema: SCHEMA,
		limit: inputLimitFor(LOCAL, 'part'), maxTokens: outputTokensFor(LOCAL, 'part'), maxAttempts: 1,
	});
	assert.equal(seen[0]?.['num_predict'], 8_192, 'a part request is capped at PART_MAX_OUTPUT_TOKENS');
	assert.equal(cut.kind === 'failed' ? cut.failure : cut.kind, 'invalid-reply', 'a reply cut at the cap is an invalid reply');
	await callWithRepair({
		provider: stub('{"ok": true}'), messages: [{ role: 'user', content: 'q' }], schema: SCHEMA,
		limit: inputLimitFor(LOCAL, 'single'), maxTokens: outputTokensFor(LOCAL, 'single'), maxAttempts: 1,
	});
	assert.equal(seen[1]?.['num_predict'], 20_480, 'a single pass keeps the configured output tokens');
	const dead = await callWithRepair({
		provider: stub(new Error('connect ECONNREFUSED 127.0.0.1:11434')), messages: [{ role: 'user', content: 'q' }], schema: SCHEMA,
		limit: inputLimitFor(LOCAL, 'part'), maxTokens: outputTokensFor(LOCAL, 'part'), maxAttempts: 3,
	});
	assert.equal(dead.kind === 'failed' ? dead.failure : dead.kind, 'call-failed');
	assert.equal(seen.length, 3, 'a failed Ollama call is one request');
});

test('Vibe outage on every part of a divided call gives typed model-failed with no prefix; malformed Vibe reply gives invalid-answer', async () => {
	const adapter: PartAdapter<{ summary: string }, { summary: string }> = {
		partSchema: SCHEMA, combineSchema: SCHEMA,
		renderPart: part => [{ role: 'user', content: part.sections.map(renderSection).join('\n') }],
		renderCombine: s => [{ role: 'user', content: s.map(x => x.summary).join('\n') }],
		summaryOf: r => r.summary, summaryOfCombine: c => c.summary,
	};
	const blocks = ['one', 'two', 'three'].map(key => ({ key, envelope: { file: `${key}.md` }, text: 'x'.repeat(7_000) }));
	const found = { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } };
	for (const [mode, reason] of [['transport', 'model-failed'], ['malformed', 'invalid-answer']] as const) {
		const vibe = fakeCli(mode);
		try {
			const provider = new CliProvider({ kind: 'vibe', binPath: vibe.bin, timeoutMs: 20_000 });
			const err = await runDivided({
				provider, target: { kind: 'cli', inputBudgetChars: 16_000 + 12_000 }, adapter, blocks, reference: [], found, maxAttempts: 1,
			}).then(() => undefined, (e: unknown) => e);
			assert.ok(err instanceof ShaperAnswerStepFailedError, mode);
			assert.equal(err.reason, reason, mode);
			// Typed, so it bypasses classifyError and carries no aggregator prefix.
			assert.ok(!/aggregator-/.test(err.message), `no aggregator prefix: ${err.message}`);
			assert.ok((err.partFailures?.length ?? 0) >= 2, 'one entry per failed part');
			assert.ok(err.partFailures?.every(p => p.kind === (mode === 'transport' ? 'call-failed' : 'invalid-reply')));
			if (mode === 'transport') assert.match(err.partFailures?.[0]?.cause?.message ?? '', /vibe exited with 1/);
			assert.equal(vibe.runs(), err.partFailures?.length, 'one run per part, none retried');
		} finally { vibe.cleanup(); }
	}
});

test('all four adapters, output cap and Vibe single-pass prefix verified together after every caller is moved', async () => {
	const upstream = new Map([['inventory', [{ taskId: 't01', template: 'docs.discovery.inventory', params: {}, value: { files: ['docs/a.md'], text: 'body' } }]]]);
	const base = { promptRelPath: 'prompts/analyze/docs.aggregate.system.md', target: 'docs', runId: 'r', upstreamOutputs: upstream } as const;

	// The three CLI adapters, through the real aggregator: a transport failure of a single pass keeps the legacy prefix with the
	// original error as the cause (Vibe now takes 'aggregator-llm-unavailable:' like Claude and Codex), and of a divided call
	// ends in the typed 'model-failed' with no prefix; a malformed reply ends the divided call as 'invalid-answer'.
	for (const kind of ['claude', 'codex', 'vibe'] as const) {
		const down = fakeCli('transport');
		try {
			const provider = new CliProvider({ kind, binPath: down.bin, timeoutMs: 20_000, inputBudgetChars: 76_000 });
			const single = await runAggregator({ ...base, scope: 'S', provider }).then(() => undefined, (e: unknown) => e);
			assert.ok(single instanceof Error && !(single instanceof ShaperAnswerStepFailedError), kind);
			assert.match(single.message, /^aggregator-llm-unavailable: /, `${kind}: a single-pass outage keeps the prefix`);
			assert.ok(single.cause instanceof Error, `${kind}: the original is the cause`);
			const divided = await runAggregator({ ...base, scope: 'L', provider }).then(() => undefined, (e: unknown) => e);
			assert.ok(divided instanceof ShaperAnswerStepFailedError, kind);
			assert.equal(divided.reason, 'model-failed', kind);
			assert.ok(!/aggregator-/.test(divided.message), `${kind}: no aggregator prefix on a divided call`);
		} finally { down.cleanup(); }
		const bad = fakeCli('malformed');
		try {
			const provider = new CliProvider({ kind, binPath: bad.bin, timeoutMs: 20_000, inputBudgetChars: 76_000 });
			const divided = await runAggregator({ ...base, scope: 'L', provider }).then(() => undefined, (e: unknown) => e);
			assert.ok(divided instanceof ShaperAnswerStepFailedError, kind);
			assert.equal(divided.reason, 'invalid-answer', kind);
		} finally { bad.cleanup(); }
	}

	// The local adapter: a divided aggregate call is capped at the part limit and a single pass keeps the configured tokens.
	const seen: Array<Record<string, unknown>> = [];
	const ollama = new OllamaProvider('m', 'http://localhost', 32_768);
	(ollama as unknown as { client: unknown }).client = {
		chat: async (req: { options: Record<string, unknown> }) => { seen.push(req.options); throw new Error('connect ECONNREFUSED 127.0.0.1:11434'); },
	};
	const local = await runAggregator({ ...base, scope: 'L', provider: ollama }).then(() => undefined, (e: unknown) => e);
	assert.ok(local instanceof ShaperAnswerStepFailedError);
	assert.equal(local.reason, 'model-failed');
	assert.equal(seen[0]?.['num_predict'], 8_192, 'a part call is capped at PART_MAX_OUTPUT_TOKENS');
	await runAggregator({ ...base, scope: 'S', provider: ollama }).then(() => undefined, () => undefined);
	assert.equal(seen.at(-1)?.['num_predict'], loadAnalyzeConfig().shaper.ollamaNumPredict, 'a single pass keeps the configured output tokens');
});

