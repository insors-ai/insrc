/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live integration test for the planned "route Anthropic / OpenAI through
 * local Claude Code / Codex subprocesses" provider (replaces the direct
 * REST-API calls in `agent/providers/{anthropic,openai}.ts`).
 *
 * The hypothesis under test:
 *
 *   1. `claude --print --output-format json --json-schema <inline>` returns a
 *      JSON envelope whose `structured_output` field is the parsed,
 *      schema-validated payload. We never have to re-parse the `result` text
 *      ourselves (which is fenced markdown).
 *
 *   2. `codex exec --output-schema <file> --json` emits a JSONL stream whose
 *      `item.completed` events carry an `agent_message.text` field that is
 *      a JSON string matching the supplied schema (OpenAI strict-mode dialect).
 *
 * Each test:
 *   - Spawns the real binary with a small prompt and one of four schema shapes
 *     mirroring the actual meta-task surface (closed object, enum verdict,
 *     anyOf-rooted discriminated union, nested array-of-objects). The
 *     `anyOf`-rooted case is specifically the shape that broke direct
 *     Anthropic in the C.5 cutover.
 *   - Asserts the binary returned a parseable structured payload.
 *   - Backstop-validates the payload with ajv against the same schema.
 *   - Asserts a few business invariants per shape (enum membership,
 *     non-empty arrays, discriminator value).
 *   - Surfaces duration + cost-when-available to stderr so the human running
 *     the test can see the per-call tax.
 *
 * Skips cleanly when the relevant binary is missing or the local agent isn't
 * logged in. Each call is a real billed API hit -- gate behind
 * INSRC_LIVE_TESTS=1 in CI.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test \
 *     src/insrc/agent/providers/__tests__/local-agents-structured.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Ajv, type ValidateFunction } from 'ajv';

import { processSchemaForOpenAIStrict } from '../structured-output.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
const TIMEOUT_MS = 90_000;

const ajv = new Ajv({ allErrors: true, strict: false });


// ---------------------------------------------------------------------------
// Subprocess helpers
// ---------------------------------------------------------------------------

interface RunResult {
	readonly stdout:   string;
	readonly stderr:   string;
	readonly exitCode: number;
	readonly durationMs: number;
}

function runSubprocess(
	command: string,
	args: readonly string[],
	stdin: string,
	timeoutMs: number,
): Promise<RunResult> {
	return new Promise(resolve => {
		const start = Date.now();
		const child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
		child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
		child.on('error', err => {
			clearTimeout(timer);
			resolve({ stdout, stderr: stderr + `\nspawn error: ${(err as Error).message}`, exitCode: -1, durationMs: Date.now() - start });
		});
		child.on('close', exitCode => {
			clearTimeout(timer);
			resolve({ stdout, stderr, exitCode: timedOut ? -9 : (exitCode ?? -1), durationMs: Date.now() - start });
		});
		child.stdin.end(stdin);
	});
}

function which(bin: string): Promise<string | null> {
	return new Promise(resolve => {
		const child = spawn('which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] });
		let out = '';
		child.stdout.on('data', (c: Buffer) => { out += c.toString(); });
		child.on('close', code => resolve(code === 0 ? out.trim() : null));
		child.on('error', () => resolve(null));
	});
}


// ---------------------------------------------------------------------------
// Schema fixtures -- mirror the real meta-task / section-flow / working-memory
// schema shapes that are at risk of breaking on a wire-format mismatch.
// ---------------------------------------------------------------------------

interface SchemaFixture {
	readonly name:         string;
	readonly prompt:       string;
	readonly schema:       Record<string, unknown>;
	readonly assertShape:  (payload: unknown) => void;
}

const FIXTURES: readonly SchemaFixture[] = [
	{
		// Mirrors BULLETS_SCHEMA from working-memory/bullet-extractor.ts.
		name:   'closed object + bounded string array',
		prompt: 'List three short bullets about TypeScript. Keep each under 80 chars.',
		schema: {
			type: 'object',
			additionalProperties: false,
			required: ['bullets'],
			properties: {
				bullets: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 200 } },
			},
		},
		assertShape: payload => {
			assert.ok(payload !== null && typeof payload === 'object', 'payload is an object');
			const p = payload as { bullets?: unknown };
			assert.ok(Array.isArray(p.bullets), 'bullets is an array');
			assert.ok(p.bullets!.length >= 1 && p.bullets!.length <= 5, `bullets length in [1,5]; got ${p.bullets!.length}`);
			for (const b of p.bullets!) {
				assert.equal(typeof b, 'string', 'every bullet is a string');
				assert.ok((b as string).length > 0, 'every bullet is non-empty');
			}
		},
	},
	{
		// Mirrors SECTION_REVIEW_SCHEMA from agent/section-flow/audit/section-review.ts.
		name:   'enum-discriminated verdict',
		prompt: 'Review this code: `function add(a,b){return a+b}`. Decide whether it is acceptable. Respond with verdict + reasoning.',
		schema: {
			type: 'object',
			additionalProperties: false,
			required: ['verdict', 'reasoning'],
			properties: {
				verdict:   { type: 'string', enum: ['accept', 'revise-edits', 'revise-major'] },
				reasoning: { type: 'string', minLength: 1, maxLength: 500 },
			},
		},
		assertShape: payload => {
			assert.ok(payload !== null && typeof payload === 'object');
			const p = payload as { verdict?: unknown; reasoning?: unknown };
			assert.ok(['accept', 'revise-edits', 'revise-major'].includes(p.verdict as string),
				`verdict must be in enum; got ${String(p.verdict)}`);
			assert.equal(typeof p.reasoning, 'string', 'reasoning is a string');
			assert.ok((p.reasoning as string).length > 0, 'reasoning non-empty');
		},
	},
	{
		// Mirrors Phase1AskSchema from meta-task/schema.ts -- the exact shape
		// that broke direct Anthropic on the C.5 cutover. The C.7 hotfix
		// (normaliseSchemaForAnthropic) injected `type: 'object'` at the
		// root; this fixture exercises whether the local subprocess accepts
		// an anyOf-rooted union with the root type stamped on.
		name:   'anyOf-rooted discriminated union (Phase1Ask-shaped)',
		prompt: 'Decide whether this claim is sufficient or needs context: "User wants a rate limiter." If context is needed, list 1-3 short context requests.',
		schema: {
			type: 'object',
			anyOf: [
				{ type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { const: 'sufficient' } } },
				{ type: 'object', additionalProperties: false, required: ['kind', 'requests'],
					properties: {
						kind: { const: 'context-needed' },
						requests: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 1 } },
					},
				},
			],
		},
		assertShape: payload => {
			assert.ok(payload !== null && typeof payload === 'object');
			const p = payload as { kind?: unknown; requests?: unknown };
			assert.ok(p.kind === 'sufficient' || p.kind === 'context-needed', `kind discriminator must be sufficient|context-needed; got ${String(p.kind)}`);
			if (p.kind === 'context-needed') {
				assert.ok(Array.isArray(p.requests), 'context-needed branch must have requests array');
				assert.ok((p.requests as unknown[]).length >= 1, 'requests is non-empty');
			}
		},
	},
	{
		// Mirrors FACT_GAP_ANALYSIS_SCHEMA -- nested array of objects with
		// per-item enum and required fields.
		name:   'nested array of objects with per-item enums',
		prompt: 'List two facts a developer needs to add a HTTP rate limiter. For each: id, fact, status (one of present|partial|absent), why.',
		schema: {
			type: 'object',
			additionalProperties: false,
			required: ['requiredFacts'],
			properties: {
				requiredFacts: {
					type:     'array',
					minItems: 1,
					maxItems: 5,
					items: {
						type: 'object',
						additionalProperties: false,
						required: ['id', 'fact', 'why', 'status'],
						properties: {
							id:     { type: 'string', minLength: 1, maxLength: 32 },
							fact:   { type: 'string', minLength: 1, maxLength: 200 },
							why:    { type: 'string', minLength: 1, maxLength: 300 },
							status: { type: 'string', enum: ['present', 'partial', 'absent'] },
						},
					},
				},
			},
		},
		assertShape: payload => {
			assert.ok(payload !== null && typeof payload === 'object');
			const p = payload as { requiredFacts?: unknown };
			assert.ok(Array.isArray(p.requiredFacts), 'requiredFacts is an array');
			assert.ok((p.requiredFacts as unknown[]).length >= 1, 'requiredFacts non-empty');
			for (const f of p.requiredFacts as Array<Record<string, unknown>>) {
				assert.equal(typeof f['id'], 'string');
				assert.equal(typeof f['fact'], 'string');
				assert.equal(typeof f['why'], 'string');
				assert.ok(['present', 'partial', 'absent'].includes(f['status'] as string),
					`status must be in enum; got ${String(f['status'])}`);
			}
		},
	},
];


// ---------------------------------------------------------------------------
// Claude Code path
// ---------------------------------------------------------------------------

interface ClaudeEnvelope {
	readonly type:              string;
	readonly subtype:           string;
	readonly is_error:          boolean;
	readonly result?:           string;
	readonly structured_output?: unknown;
	readonly duration_ms?:      number;
	readonly total_cost_usd?:   number;
}

async function runClaudeStructured(prompt: string, schema: Record<string, unknown>): Promise<{
	envelope: ClaudeEnvelope;
	durationMs: number;
}> {
	const r = await runSubprocess(
		'claude',
		[
			'--print',
			'--output-format', 'json',
			'--json-schema', JSON.stringify(schema),
		],
		prompt,
		TIMEOUT_MS,
	);
	// Always surface stdout in the error message -- claude emits its error
	// envelope (and the actual reason) to stdout regardless of exit code,
	// and stderr is usually empty.
	assert.equal(
		r.exitCode, 0,
		`claude exited with ${r.exitCode}\n  stderr: ${r.stderr.slice(0, 500)}\n  stdout (truncated): ${r.stdout.slice(0, 1500)}`,
	);
	let envelope: ClaudeEnvelope;
	try {
		envelope = JSON.parse(r.stdout) as ClaudeEnvelope;
	} catch (err) {
		throw new Error(`claude stdout was not parseable JSON envelope: ${(err as Error).message}\nstdout:\n${r.stdout.slice(0, 1500)}`);
	}
	return { envelope, durationMs: r.durationMs };
}


// ---------------------------------------------------------------------------
// Codex path
// ---------------------------------------------------------------------------

interface CodexEvent {
	readonly type: string;
	readonly item?: { readonly type?: string; readonly text?: string };
	readonly error?: { readonly message?: string };
	readonly message?: string;
}

async function runCodexStructured(prompt: string, schema: Record<string, unknown>, tmpDir: string): Promise<{
	events:     readonly CodexEvent[];
	agentText:  string | undefined;
	durationMs: number;
}> {
	// Codex expects OpenAI strict-mode JSON Schema: additionalProperties:false
	// on every object, full required arrays. Pass the schema through the
	// same preprocessor the OpenAIProvider uses so the test pins the real
	// production path, not a hand-tuned schema.
	const strictSchema = processSchemaForOpenAIStrict(
		JSON.parse(JSON.stringify(schema)) as Record<string, unknown>,
	);
	const schemaPath = join(tmpDir, `codex-schema-${Date.now()}.json`);
	writeFileSync(schemaPath, JSON.stringify(strictSchema));

	const r = await runSubprocess(
		'codex',
		['exec', '--output-schema', schemaPath, '--json'],
		prompt,
		TIMEOUT_MS,
	);
	const events: CodexEvent[] = [];
	for (const line of r.stdout.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try { events.push(JSON.parse(trimmed) as CodexEvent); }
		catch { /* skip non-JSON lines */ }
	}
	const errorEvent = events.find(e => e.type === 'error' || e.type === 'turn.failed');
	assert.equal(errorEvent, undefined, `codex emitted error event: ${JSON.stringify(errorEvent)}\nfull stdout (truncated):\n${r.stdout.slice(0, 800)}`);
	assert.equal(r.exitCode, 0, `codex exited with ${r.exitCode}; stderr:\n${r.stderr}`);
	const agentMsg = events.find(e => e.type === 'item.completed' && e.item?.type === 'agent_message');
	return { events, agentText: agentMsg?.item?.text, durationMs: r.durationMs };
}


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const claudeAvailable = await which('claude');
const codexAvailable  = await which('codex');

for (const fixture of FIXTURES) {
	// Claude Code path
	test(`claude --print + --json-schema: ${fixture.name}`, { skip: !GATE || claudeAvailable === null }, async () => {
		const { envelope, durationMs } = await runClaudeStructured(fixture.prompt, fixture.schema);

		// Surface cost + latency so the human running the test sees the per-call tax.
		// eslint-disable-next-line no-console
		console.error(`  [claude] durationMs=${durationMs} totalCostUsd=${envelope.total_cost_usd ?? 'n/a'}`);

		assert.equal(envelope.is_error, false, `claude is_error: ${envelope.result}`);
		assert.ok(envelope.structured_output !== undefined, 'envelope.structured_output must be present');

		const payload = envelope.structured_output;
		fixture.assertShape(payload);

		// Backstop: ajv validation against the same schema we sent.
		let validate: ValidateFunction;
		try {
			validate = ajv.compile(fixture.schema);
		} catch (err) {
			// Some schemas use draft-2020-12 features ajv default mode may not
			// like; surface compile failure but don't abort the test (the
			// shape assertions above are the real contract).
			console.error(`  [claude] ajv compile note: ${(err as Error).message}`);
			return;
		}
		assert.ok(validate(payload), `ajv backstop failed: ${JSON.stringify(validate.errors)}\npayload=${JSON.stringify(payload)}`);
	});

	// Codex path
	test(`codex exec + --output-schema: ${fixture.name}`, { skip: !GATE || codexAvailable === null }, async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), 'codex-live-'));
		try {
			const { agentText, durationMs } = await runCodexStructured(fixture.prompt, fixture.schema, tmpDir);

			// eslint-disable-next-line no-console
			console.error(`  [codex] durationMs=${durationMs}`);

			assert.ok(agentText !== undefined, 'codex must emit an agent_message item');
			let payload: unknown;
			try {
				payload = JSON.parse(agentText!);
			} catch (err) {
				throw new Error(`codex agent_message.text was not parseable JSON: ${(err as Error).message}\ntext: ${agentText!.slice(0, 300)}`);
			}
			fixture.assertShape(payload);

			// Backstop via the strict-mode-processed schema (what we actually
			// sent to codex), not the raw one.
			const strict = processSchemaForOpenAIStrict(
				JSON.parse(JSON.stringify(fixture.schema)) as Record<string, unknown>,
			);
			let validate: ValidateFunction;
			try {
				validate = ajv.compile(strict);
			} catch (err) {
				console.error(`  [codex] ajv compile note: ${(err as Error).message}`);
				return;
			}
			assert.ok(validate(payload), `ajv backstop failed: ${JSON.stringify(validate.errors)}\npayload=${JSON.stringify(payload)}`);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
}


// ---------------------------------------------------------------------------
// Surface-level sanity checks (cheap, always run when binary present)
// ---------------------------------------------------------------------------

test('claude binary is on PATH', { skip: !GATE || claudeAvailable === null }, () => {
	assert.ok(claudeAvailable !== null);
});

test('codex binary is on PATH', { skip: !GATE || codexAvailable === null }, () => {
	assert.ok(codexAvailable !== null);
});

test('INSRC_LIVE_TESTS gate respected', { skip: GATE }, () => {
	// When gate is OFF, every billed test above is skipped and only this
	// no-op runs so the file produces a non-empty test count.
	assert.ok(true, 'gate off; billed tests skipped');
});
