import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { CliProvider, InputTooLargeError } from '../cli-provider.js';
import { BOUNDED_SYSTEM_PROMPT, UnsupportedBoundedInputError } from '../bounded-input.js';
import type { LLMProvider, StructuredCompletionOpts } from '../../../shared/types.js';
import { createReviewJob } from '../../../workflow/review-pipeline/job.js';
import { runReviewJob } from '../../../workflow/review-pipeline/driver.js';
import { atom, toyAdapter, toySnapshot } from '../../../workflow/review-pipeline/__tests__/toy-adapter.js';

const FLAGS = '--safe-mode --no-session-persistence --system-prompt --tools --disable-slash-commands --setting-sources --strict-mcp-config --mcp-config';
function fixture(help = FLAGS) {
	const dir = mkdtempSync(join(tmpdir(), 'bounded-cli-test-'));
	const bin = join(dir, 'fake.mjs');
	const capture = join(dir, 'capture.json');
	writeFileSync(bin, `#!/usr/bin/env node\nimport {writeFileSync,existsSync} from 'node:fs';\nconst args=process.argv.slice(2);\nif(args.includes('--help')) {process.stdout.write(${JSON.stringify(help)});process.exit(0);}\nlet stdin='';for await(const s of process.stdin)stdin+=s;\nwriteFileSync(${JSON.stringify(capture)},JSON.stringify({args,stdin,cwd:process.cwd(),project:existsSync('CLAUDE.md'),inherited:process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT}));\nprocess.stdout.write(JSON.stringify({structured_output:{ok:true}}));\n`);
	chmodSync(bin, 0o755);
	writeFileSync(join(dir, 'CLAUDE.md'), 'PROJECT SENTINEL');
	return { dir, bin, capture, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const schema = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } }, additionalProperties: false };
const boundedInput = { maxInputChars: 10_000, contextMode: 'isolated-structured' as const };

test('DIFF-TRANSPORT: bounded Claude dispatch preserves explicit input and disables ambient tools/history/project context', async () => {
	const f = fixture(); const prior = process.env['CLAUDE_CODE_APPEND_SYSTEM_PROMPT'];
	process.env['CLAUDE_CODE_APPEND_SYSTEM_PROMPT'] = 'INHERITED SENTINEL';
	try {
		const p = new CliProvider({ kind: 'claude', binPath: f.bin });
		assert.equal(p.capabilities.boundedStructuredInput, true);
		assert.deepEqual(await p.completeStructured([{ role: 'user', content: 'Evidence' }, { role: 'assistant', content: 'Explicit history' }], schema, { cwd: f.dir, boundedInput }), { ok: true });
		const seen = JSON.parse(readFileSync(f.capture, 'utf8')) as { args: string[]; stdin: string; cwd: string; project: boolean; inherited?: string };
		assert.match(seen.stdin, /Evidence\n\n## Assistant\nExplicit history/);
		assert.equal(seen.project, false); assert.notEqual(seen.cwd, f.dir); assert.equal(seen.inherited, undefined);
		for (const flag of FLAGS.split(' ')) assert.ok(seen.args.includes(flag));
		assert.equal(seen.args[seen.args.indexOf('--tools') + 1], '');
		assert.equal(seen.args[seen.args.indexOf('--setting-sources') + 1], '');
		assert.deepEqual(JSON.parse(seen.args[seen.args.indexOf('--json-schema') + 1]!), schema);
		assert.ok(!seen.args.includes('--resume') && !seen.args.includes('--bare'));
	} finally { if (prior === undefined) delete process.env['CLAUDE_CODE_APPEND_SYSTEM_PROMPT']; else process.env['CLAUDE_CODE_APPEND_SYSTEM_PROMPT'] = prior; f.cleanup(); }
});

test('DIFF-ADMISSION: unsupported CLI isolation and oversized normalized schemas make zero model calls', async () => {
	for (const kind of ['claude', 'codex'] as const) {
		const f = fixture('old unsupported CLI');
		try {
			const p = new CliProvider({ kind, binPath: f.bin });
			await assert.rejects(p.completeStructured([{ role: 'user', content: 'evidence' }], schema, { boundedInput }), (e: unknown) => e instanceof UnsupportedBoundedInputError && e.code === 'unsupported-bounded-input');
			assert.equal(existsSync(f.capture), false);
			await assert.rejects(p.completeStructured([{ role: 'user', content: 'evidence' }], { ...schema, description: 'x'.repeat(10_000) }, { boundedInput }), InputTooLargeError);
			assert.equal(existsSync(f.capture), false, 'even normalized schema overflow never spawns a model');
		} finally { f.cleanup(); }
	}
});

test('DIFF-TRANSPORT: Codex schema normalization is counted before isolation admission', async () => {
	const f = fixture();
	try {
		const input = { type: 'object', properties: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`optional_${i}`, { type: 'string' }])) };
		// The original schema fits, but strict mode adds a required-name list and object framing.
		const cap = 'evidence'.length + 2 + JSON.stringify(input).length + BOUNDED_SYSTEM_PROMPT.length + 1_024 + 1;
		const p = new CliProvider({ kind: 'codex', binPath: f.bin });
		await assert.rejects(p.completeStructured([{ role: 'user', content: 'evidence' }], input, { boundedInput: { ...boundedInput, maxInputChars: cap } }),
			(e: unknown) => e instanceof InputTooLargeError && e.actualChars! > cap);
		assert.equal(existsSync(f.capture), false);
	} finally { f.cleanup(); }
});

test('DIFF-ADMISSION: isolated pipeline calls require enforcement and forward the authoritative job cap', async () => {
	const snapshot = toySnapshot([atom(1)]);
	const adapter = toyAdapter(snapshot, { execution: { mode: 'structured', inputContext: 'isolated' } });
	let calls = 0;
	const provider = { completeStructured: async (_m: unknown, s: { properties: { callId: { const: string } } }, opts: StructuredCompletionOpts) => {
		calls++; assert.deepEqual(opts.boundedInput, { maxInputChars: 5_000, contextMode: 'isolated-structured' });
		return { callId: s.properties.callId.const, answer: { seen: ['a1'] } };
	} } as unknown as LLMProvider;
	await assert.rejects(runReviewJob(createReviewJob(adapter, 'daemon', snapshot, 5_000), adapter, provider), UnsupportedBoundedInputError);
	assert.equal(calls, 0);
	const enforcing = { ...provider, capabilities: { boundedStructuredInput: true } } as unknown as LLMProvider;
	await runReviewJob(createReviewJob(adapter, 'daemon', snapshot, 5_000), adapter, enforcing);
	assert.equal(calls, 1);
});

test('bounded-input.test.ts: a review whose provider fails the Ollama pre-run check fails with that cause, once, and records nothing as not judged', async () => {
	const { OllamaTargetError } = await import('../ollama-target.js');
	const snapshot = toySnapshot([atom(1)]);
	// Even a stage that would record a failed call and go on must fail on an Ollama refusal.
	const adapter = toyAdapter(snapshot, { onCallFailure: 'record-not-judged' });
	let calls = 0;
	const provider = { completeStructured: async () => {
		calls++;
		throw new OllamaTargetError('account-unavailable', 'http://localhost:11434', 'glm-5.3:cloud', 'Ollama could not check the ollama.com account (status 503); try again later');
	} } as unknown as LLMProvider;
	await assert.rejects(runReviewJob(createReviewJob(adapter, 'daemon', snapshot, 5_000), adapter, provider),
		(e: unknown) => e instanceof OllamaTargetError && e.cause === 'account-unavailable');
	assert.equal(calls, 1, 'not re-issued');
});
