/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live probes for the review pipeline (Epic 8315a11f s1, plan task t12):
 *   - the real claude and codex CLIs accept the call envelope around every
 *     review answer schema and echo the callId (one attempt each: the pipeline
 *     owns retries);
 *   - a configured high-end Ollama model completes a template review and a
 *     code-review dimension through the pipeline.
 *
 * Gated behind INSRC_LIVE_TESTS=1 (real model calls). A missing binary or model
 * skips its part. The Ollama model is INSRC_LIVE_OLLAMA_REVIEW_MODEL, default
 * qwen3.8:27b.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/workflow/review-pipeline/__tests__/envelope.live.test.ts
 */

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { after } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { OllamaProvider } from '../../../agent/providers/ollama.js';
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import type { LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { ADHERENCE_FINDINGS_SCHEMA } from '../../code-review/dimensions/adherence.js';
import { CONVENTIONS_FINDINGS_SCHEMA } from '../../code-review/dimensions/conventions.js';
import { COVERAGE_FINDINGS_SCHEMA } from '../../code-review/dimensions/coverage.js';
import { FUNCTIONAL_COVERAGE_FINDINGS_SCHEMA } from '../../code-review/dimensions/functional-coverage.js';
import { judgeQuality, QUALITY_FINDINGS_SCHEMA } from '../../code-review/dimensions/quality.js';
import type { CodeReviewGrounding, CodeReviewSubject } from '../../code-review/types.js';
import { EXTRACT_SCHEMA } from '../../review/extract.js';
import { runReview } from '../../review/review.js';
import { TEMPLATE_ANSWER_SCHEMA } from '../../review/template.js';
import { VERDICTS_SCHEMA, VERIFY_SCHEMA } from '../../review/verify.js';
import { CONTROLLER_FINDINGS_SCHEMA } from '../code-review.js';
import { envelopeMessages, envelopeSchema, newCallId, openEnvelope } from '../envelope.js';

// The Ollama session may call graph tools: give this file a store of its own; the
// store at the default path belongs to the daemon alone.
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => { await closeGraphStore(); rmSync(STORE_DIR, { recursive: true, force: true }); });

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
const has = (bin: string): boolean => spawnSync('which', [bin]).status === 0;
const OLLAMA_MODEL = process.env['INSRC_LIVE_OLLAMA_REVIEW_MODEL'] ?? 'qwen3.8:27b';
const ollamaHas = (model: string): boolean => {
	try { return execFileSync('ollama', ['list'], { encoding: 'utf8' }).split('\n').some(l => l.split(/\s+/)[0] === model); } catch { return false; }
};

/** Every answer schema a review call is made with. */
const SCHEMAS: readonly [string, StructuredSchema][] = [
	['adherence', ADHERENCE_FINDINGS_SCHEMA],
	['conventions', CONVENTIONS_FINDINGS_SCHEMA],
	['coverage', COVERAGE_FINDINGS_SCHEMA],
	['quality', QUALITY_FINDINGS_SCHEMA],
	['functional-coverage', FUNCTIONAL_COVERAGE_FINDINGS_SCHEMA],
	['controller findings (ux, diagram)', CONTROLLER_FINDINGS_SCHEMA],
	['premise extract', EXTRACT_SCHEMA],
	['premise verify', VERIFY_SCHEMA],
	['batched verdicts', VERDICTS_SCHEMA as unknown as StructuredSchema],
	['template checklist', TEMPLATE_ANSWER_SCHEMA as unknown as StructuredSchema],
];

const ASK = [
	{ role: 'system' as const, content: 'You are checking an answer format. Give the smallest answer the JSON schema allows: empty arrays where an array may be empty, short strings elsewhere. Every required field must be present.' },
	{ role: 'user' as const, content: 'Answer now.' },
];

/** One enveloped call as the pipeline makes it: one attempt, re-issued once under a new callId when the CLI
 *  fails without answering (a stall or a killed run); a refusal of the envelope itself is never retried. */
async function ask(provider: CliProvider, schema: StructuredSchema, note: (s: string) => void): Promise<{ callId: string; raw: unknown }> {
	for (let attempt = 1; ; attempt++) {
		const callId = newCallId();
		try {
			return { callId, raw: await provider.completeStructured<unknown>(envelopeMessages(callId, ASK), envelopeSchema(callId, schema), { internalRetry: false, timeoutMs: 5 * 60_000 }) };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (attempt >= 2 || !/exited with -9|stalled/.test(msg)) throw err;
			note(`re-issued after: ${msg.slice(0, 120)}`);
		}
	}
}

test('claude and codex accept the envelope around every review answer schema and echo the callId', { skip: !GATE ? 'INSRC_LIVE_TESTS is not 1' : false, timeout: 90 * 60_000 }, async (t) => {
	let ran = 0;
	for (const kind of ['claude', 'codex'] as const) {
		if (!has(kind)) continue;
		const provider = new CliProvider({ kind });
		for (const [name, schema] of SCHEMAS) {
			const { callId, raw } = await ask(provider, schema, s => t.diagnostic(`${kind} / ${name}: ${s}`));
			t.diagnostic(`${kind} / ${name}: answered`);
			const opened = openEnvelope(raw, callId);
			assert.ok(opened !== undefined, `${kind} / ${name}: the answer echoes its callId (${JSON.stringify(raw).slice(0, 200)})`);
			const checked = validateAgainstSchema(schema, opened.answer);
			assert.ok(checked.ok, `${kind} / ${name}: the inner answer fits its schema: ${checked.ok ? '' : checked.errors.join('; ')}`);
			ran++;
		}
		// The reviewer session (the template review's mode) echoes it too.
		// A review session runs in a repository (codex refuses an untrusted, non-git directory).
		const repo = mkdtempSync(join(tmpdir(), 'insrc-live-envelope-'));
		execFileSync('git', ['init', '-q'], { cwd: repo });
		try {
			const callId = newCallId();
			const prompt = `${ASK[0].content}\n\n${ASK[1].content}\n\n${envelopeMessages(callId, []).at(-1)!.content as string}`;
			const raw = await provider.runReviewSession<unknown>(prompt, envelopeSchema(callId, SCHEMAS[3]![1]), { cwd: repo, deadlineMs: 10 * 60_000, internalRetry: false });
			assert.ok(openEnvelope(raw, callId) !== undefined, `${kind} session: echoes its callId`);
		} finally { rmSync(repo, { recursive: true, force: true }); }
	}
	// Both CLIs are required: the gate is that claude AND codex accept the envelope.
	assert.ok(has('claude') && has('codex'), 'both the claude and the codex CLI must be installed for this probe');
	assert.equal(ran, 2 * SCHEMAS.length, 'every schema answered on both CLIs');
});

test('a configured high-end Ollama model completes a template review and a code-review dimension through the pipeline', { skip: !GATE ? 'INSRC_LIVE_TESTS is not 1' : !ollamaHas(OLLAMA_MODEL) ? `${OLLAMA_MODEL} is not installed` : false, timeout: 90 * 60_000 }, async () => {
	registerBuiltinTools();
	const provider = new OllamaProvider(OLLAMA_MODEL) as LLMProvider;
	const repo = mkdtempSync(join(tmpdir(), 'insrc-live-ollama-'));
	try {
		execFileSync('git', ['init', '-q'], { cwd: repo });
		mkdirSync(join(repo, 'src'));
		// The order id prefix is only knowable by reading the file; the design names neither the file nor the prefix.
		writeFileSync(join(repo, 'src/order.ts'), 'export function placeOrder(customer: string): string {\n\treturn `ORD-7731 for ${customer}`;\n}\n');
		// A template review: one reviewer session reading the repository with read-only tools.
		const design = '# LLD: place an order\n\n## Contract\n\n`placeOrder(customer)` returns a string that starts with the fixed order-id prefix the code defines and then names the customer. Find the function in the repository and check the prefix it actually returns.\n';
		const report = await runReview(design, { repo, stage: 'design.story', provider, model: OLLAMA_MODEL, intent: 'spec', deadlineMs: 30 * 60_000 });
		assert.ok(['pass', 'warn', 'block'].includes(report.verdict), `a report with a verdict: ${report.verdict}`);
		assert.ok(report.findings.length > 0, 'the checklist was answered');
		// Grounded in the repository: a finding cites the file it read (template findings carry their files
		// in the evidence), and the design gives neither the path nor the prefix.
		const cited = report.findings.filter(f => f.evidence.includes('src/order.ts') || (f.ref ?? '').includes('src/order.ts'));
		assert.ok(cited.length > 0, `a finding cites src/order.ts: ${JSON.stringify(report.findings.map(f => f.evidence)).slice(0, 1500)}`);
		assert.ok(report.findings.some(f => /ORD-7731/.test(f.evidence) || /ORD-7731/.test(f.premise)), 'and reports what only reading it reveals (the ORD-7731 prefix)');
		// A code-review dimension: one structured call through the pipeline.
		const subject: CodeReviewSubject = {
			repoPath: repo, epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', changedFiles: ['src/order.ts'],
			approvedLld: null, approvedPlan: null, buildRecord: null,
		};
		const grounding = { symbols: [{ entityId: 'e1', name: 'placeOrder', kind: 'function', file: 'src/order.ts', startLine: 1, endLine: 3, signature: 'placeOrder(customer: string): string', callers: [], callees: [], testsReaching: [] }] } as unknown as CodeReviewGrounding;
		const result = await judgeQuality(subject, grounding, provider);
		assert.equal(result.dimension, 'quality');
		assert.ok(Array.isArray(result.findings));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
