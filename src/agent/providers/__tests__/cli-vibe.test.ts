/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The vibe kind of CliProvider, driven against a FAKE `vibe` binary (the same
 * pattern as cli-subprocess.test.ts). Verifies the headless arg shape, the
 * prompt on stdin, the VIBE_ACTIVE_MODEL pin, the session-message JSON parse,
 * the structured retry, and the read-only/edit session flags.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/cli-vibe.test.ts
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider, vibeLastAssistantText } from '../cli-provider.js';
import { ModelResponseShapeError } from '../model-call-error.js';
import { VibeTurnError } from '../../../shared/vibe-session.js';

/**
 * A fake `vibe`: records every invocation (args, VIBE_ACTIVE_MODEL, stdin) as
 * a JSON line in <dir>/calls.jsonl, then behaves per <dir>/mode:
 *   text      — prints a plain answer on stdout, exit 0
 *   json      — prints a session-messages JSON array whose last assistant
 *               message is the JSON payload in <dir>/payload, exit 0
 *   flaky     — call 1: assistant text is NOT JSON; later calls: like json
 *   fail      — exit 2 with a stderr message
 */
const FAKE = `#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let stdin = '';
for await (const c of process.stdin) stdin += c;
const mode = readFileSync(join(here, 'mode'), 'utf8').trim();
appendFileSync(join(here, 'calls.jsonl'), JSON.stringify({
  args: process.argv.slice(2),
  model: process.env.VIBE_ACTIVE_MODEL ?? null,
  stdin,
}) + '\\n');
const calls = readFileSync(join(here, 'calls.jsonl'), 'utf8').trim().split('\\n').length;
if (mode === 'fail') {
  process.stderr.write('error: 429 rate limit exceeded\\n');
  process.exit(2);
}
if (mode === 'text') {
  process.stdout.write('the final answer\\n');
  process.exit(0);
}
// json / flaky: a session-messages array; the last assistant message carries the payload.
const payload = readFileSync(join(here, 'payload'), 'utf8');
const bad = mode === 'flaky' && calls === 1;
const messages = [
  { role: 'user', content: [{ type: 'text', text: 'q' }] },
  { role: 'assistant', content: [{ type: 'tool_call', id: 't1' }] },
  { role: 'assistant', content: [{ type: 'text', text: bad ? 'sure! here is some prose, not json' : payload }] },
];
process.stdout.write(JSON.stringify(messages));
process.exit(0);
`;

interface FakeVibe {
	readonly bin: string;
	readonly calls: () => Array<{ args: string[]; model: string | null; stdin: string }>;
	readonly cleanup: () => void;
}

function fakeVibe(mode: string, payload = ''): FakeVibe {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-vibe-'));
	const bin = join(dir, 'fake-vibe.mjs');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	writeFileSync(join(dir, 'mode'), mode);
	writeFileSync(join(dir, 'payload'), payload);
	writeFileSync(join(dir, 'calls.jsonl'), '');
	return {
		bin,
		calls: () => readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').filter(l => l.length > 0).map(l => JSON.parse(l) as { args: string[]; model: string | null; stdin: string }),
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

const SCHEMA = { type: 'object', properties: { answer: { type: 'number' } }, required: ['answer'], additionalProperties: false } as const;

test('vibeLastAssistantText: bare array, wrapped messages, string content, no assistant', () => {
	assert.equal(vibeLastAssistantText(JSON.stringify([
		{ role: 'user', content: [{ type: 'text', text: 'q' }] },
		{ role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
	])), 'hello');
	assert.equal(vibeLastAssistantText(JSON.stringify({ messages: [
		{ role: 'assistant', content: 'plain string content' },
	] })), 'plain string content');
	// tool-call-only assistant messages are skipped; an earlier text wins
	assert.equal(vibeLastAssistantText(JSON.stringify([
		{ role: 'assistant', content: [{ type: 'text', text: 'first' }] },
		{ role: 'assistant', content: [{ type: 'tool_call' }] },
	])), 'first');
	assert.throws(() => vibeLastAssistantText('not json'), /not parseable JSON/);
	assert.throws(() => vibeLastAssistantText(JSON.stringify([{ role: 'user', content: 'x' }])), /no assistant text/);
	assert.throws(() => vibeLastAssistantText(JSON.stringify({ nope: 1 })), /did not print a message array/);
});

test('complete() runs default `vibe -p --output text` with the prompt on stdin', async () => {
	const f = fakeVibe('text');
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const r = await p.complete([{ role: 'system', content: 'be terse' }, { role: 'user', content: 'hi there' }]);
		assert.equal(r.text, 'the final answer');
		const calls = f.calls();
		assert.equal(calls.length, 1);
		assert.deepEqual(calls[0]!.args, ['-p', '--output', 'text']);
		assert.equal(calls[0]!.model, null);
		assert.match(calls[0]!.stdin, /## System\nbe terse/);
		assert.match(calls[0]!.stdin, /hi there/);
	} finally { f.cleanup(); }
});

test('complete() without a model leaves VIBE_ACTIVE_MODEL unset (the CLI default applies)', async () => {
	const f = fakeVibe('text');
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		await p.complete([{ role: 'user', content: 'hi' }]);
		assert.equal(f.calls()[0]!.model, null);
	} finally { f.cleanup(); }
});

test('completeStructured() parses the last assistant message of the json output and validates it against the schema', async () => {
	const f = fakeVibe('json', JSON.stringify({ answer: 42 }));
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const out = await p.completeStructured<{ answer: number }>([{ role: 'user', content: 'give a number' }], SCHEMA);
		assert.deepEqual(out, { answer: 42 });
		const calls = f.calls();
		assert.equal(calls.length, 1, 'one run when the first answer validates');
		assert.deepEqual(calls[0]!.args, ['-p', '--output', 'json']);
		assert.match(calls[0]!.stdin, /## Output contract/, 'the schema travels in the prompt');
		assert.match(calls[0]!.stdin, /"required":\["answer"\]/);
	} finally { f.cleanup(); }
});

test('completeStructured() retries with a feedback note when the answer is not valid JSON, then succeeds', async () => {
	const f = fakeVibe('flaky', JSON.stringify({ answer: 7 }));
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const out = await p.completeStructured<{ answer: number }>([{ role: 'user', content: 'give a number' }], SCHEMA);
		assert.deepEqual(out, { answer: 7 });
		const calls = f.calls();
		assert.equal(calls.length, 2, 'a second run after the unparseable first answer');
		assert.match(calls[1]!.stdin, /could not be parsed/, 'the retry carries the feedback note');
	} finally { f.cleanup(); }
});

test('completeStructured() surfaces a stable error after retries are exhausted', async () => {
	const f = fakeVibe('flaky', 'still not json at all');
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		await assert.rejects(
			p.completeStructured([{ role: 'user', content: 'x' }], SCHEMA, { internalRetry: false }),
			/could not be parsed|validation failed/,
		);
		assert.equal(f.calls().length, 1, 'internalRetry:false makes a single attempt');
	} finally { f.cleanup(); }
});

test('runEditSession() runs headless with --auto-approve inside the repo cwd', async () => {
	const f = fakeVibe('text');
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const dir = mkdtempSync(join(tmpdir(), 'insrc-vibe-edit-'));
		try {
			const r = await p.runEditSession('fix the thing', { cwd: dir });
			assert.equal(r.text, 'the final answer');
			const c = f.calls()[0]!;
			assert.deepEqual(c.args, ['-p', '--output', 'text', '--auto-approve']);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	} finally { f.cleanup(); }
});

test('runReviewSession() restricts tools to read_file + the insrc MCP tools and validates the schema-shaped answer', async () => {
	const f = fakeVibe('json', JSON.stringify({ verdict: 'holds' }));
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const dir = mkdtempSync(join(tmpdir(), 'insrc-vibe-review-'));
		try {
			const reviewSchema = { type: 'object', properties: { verdict: { type: 'string' } }, required: ['verdict'], additionalProperties: false } as const;
			const out = await p.runReviewSession<{ verdict: string }>('review this', reviewSchema, { cwd: dir, deadlineMs: 30_000 });
			assert.deepEqual(out, { verdict: 'holds' });
			const c = f.calls()[0]!;
			assert.deepEqual(c.args, ['-p', '--output', 'json', '--enabled-tools', 'read_file', '--enabled-tools', 'mcp_insrc_*']);
		} finally { rmSync(dir, { recursive: true, force: true }); }
	} finally { f.cleanup(); }
});

test('a non-zero vibe exit is a CliExitError naming vibe; a transient 429 is retried on a fresh run', async () => {
	const f = fakeVibe('fail');
	try {
		const p = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		await assert.rejects(p.complete([{ role: 'user', content: 'hi' }]), /vibe exited with 2/);
		// 429 text is transient: three attempts before the error surfaces.
		assert.equal(f.calls().length, 3);
	} finally { f.cleanup(); }
});

test('Vibe reviewer responses retain strict original nullable semantics without Codex transport decoding',async()=>{
 const schema={type:'object',required:['verdict'],additionalProperties:false,properties:{verdict:{type:'string'},error:{type:'string'}}};
 for(const nullable of [false,true]){
  const input=nullable?{...schema,properties:{...schema.properties,error:{type:['string','null']}}}:schema;
  const f=fakeVibe('json',JSON.stringify({verdict:'holds',error:null})),cwd=realpathSync(mkdtempSync(join(tmpdir(),'insrc-vibe-null-check-')));
  try{
   const p=new CliProvider({kind:'vibe',binPath:f.bin});const call=()=>p.runReviewSession('strict review',input,{cwd,deadlineMs:30000,internalRetry:false});
   if(nullable)assert.deepEqual(await call(),{verdict:'holds',error:null});
   else await assert.rejects(call(),(error:unknown)=>error instanceof ModelResponseShapeError&&error.reasons.some(reason=>reason.includes('/error: must be string')));
  }finally{f.cleanup();rmSync(cwd,{recursive:true,force:true});}
 }
});

const APP_SERVER = String.raw`#!/usr/bin/env node
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const callsFile = fileURLToPath(new URL('./calls.jsonl', import.meta.url));
const mode = readFileSync(new URL('./mode', import.meta.url), 'utf8');
const model = { name: 'mistral-vibe-cli-latest', alias: 'mistral-medium-3.5', thinking: 'low', thinkingLevels: ['low', 'high'] };
let policy;
let activeModel = model;
const sessionId = 'native-session';
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const event = (method, params) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params: { ...params, sessionId } }) + '\n');
createInterface({ input: process.stdin }).on('line', line => {
	const { method, params, id } = JSON.parse(line);
	switch (method) {
		case 'initialize': reply(id, {}); return;
		case 'initialized': return;
		case 'session/start':
			assert.equal(params.agentConfig.headless, true);
			assert.equal(params.agentConfig.cwd, process.cwd());
			policy = params.agentConfig;
			reply(id, { state: { session: { id: sessionId } } });
			return;
		case 'runtime/read':
			reply(id, { runtime: {
				config: { activeModel, models: [model] },
				tools: (mode === 'unsafe' ? ['write_file'] : ['read_file', 'mcp_insrc_analyze']).map(name => ({ name })),
				bypassToolPermissions: policy.autoApprove,
			} });
			return;
		case 'config/model/write':
			assert.deepEqual(params, { sessionId, modelAlias: model.alias, reasoningEffort: 'high', sessionOnly: true });
			activeModel = { ...model, thinking: params.reasoningEffort };
			reply(id, { status: 'applied' });
			return;
		case 'turn/start': {
			assert.equal(activeModel.thinking, 'high');
			appendFileSync(callsFile, JSON.stringify({ policy, prompt: params.message[0].text }) + '\n');
			const turn = { id: 'turn-id', sessionId, status: 'in_progress' };
			if (mode === 'lost') {
				process.exit(1);
				return;
			}
			reply(id, { turn });
			event('turn/started', { turn });
			if (mode === 'accepted') {
				event('turn/completed', { turn: { ...turn, status: 'failed', error: { message: '429 rate limit exceeded' } } });
				return;
			}
			const count = readFileSync(callsFile, 'utf8').trim().split('\n').length;
			const text = mode === 'flaky' && count === 1 ? 'not JSON' : '{"answer":';
			const content = [{ type: 'text', text }, ...(text === 'not JSON' ? [] : [{ type: 'text', text: '3}' }])];
			event('history/entryAdded', { turnId: turn.id, entry: { type: 'message', role: 'assistant', id: 'answer', content } });
			if (text !== 'not JSON') event('history/entryUpdated', { turnId: turn.id, entryId: 'answer', patch: [
				{ op: 'append', path: '/content/0/text', value: '4' },
				{ op: 'replace', path: '/content/1/text', value: '2}' },
			] });
			event('turn/completed', { turn: { ...turn, status: 'completed' } });
			return;
		}
		default: throw new Error('unexpected method ' + method);
	}
});
`;

function fakeAppServer(mode: string) {
	const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-vibe-server-')));
	const bin = join(cwd, 'app-server.mjs');
	const callsPath = join(cwd, 'calls.jsonl');
	writeFileSync(bin, APP_SERVER, { mode: 0o755 });
	writeFileSync(join(cwd, 'mode'), mode);
	writeFileSync(callsPath, '');
	return {
		cwd,
		provider: new CliProvider({ kind: 'vibe', vibeAppServerPath: bin, model: 'mistral-vibe-cli-latest', effort: 'high', timeoutMs: 10_000 }),
		calls: () => readFileSync(callsPath, 'utf8').trim().split('\n').filter(Boolean)
			.map(line => JSON.parse(line) as { policy: { autoApprove: boolean; enabledTools?: string[] }; prompt: string }),
		cleanup: () => rmSync(cwd, { recursive: true, force: true }),
	};
}

const USER_MESSAGES = [{ role: 'user', content: 'do the work' }] as const;

test('explicit Vibe selections do not replay an uncertain turn through any daemon entry point', async () => {
	for (const [mode, dispatchState] of [['lost', 'possibly-sent'], ['accepted', 'accepted']] as const) {
		const fixture = fakeAppServer(mode);
		const { provider, cwd } = fixture;
		try {
			const calls = [
				() => provider.complete([...USER_MESSAGES], { cwd }),
				() => provider.completeStructured([...USER_MESSAGES], SCHEMA, { cwd }),
				() => provider.runEditSession('edit', { cwd }),
				() => provider.runReviewSession('review', SCHEMA, { cwd, deadlineMs: 10_000 }),
			];
			for (const [index, run] of calls.entries()) {
				await assert.rejects(run, error => error instanceof VibeTurnError && error.dispatchState === dispatchState);
				assert.equal(fixture.calls().length, index + 1);
			}
			assert.equal(fixture.calls()[2]?.policy.autoApprove, true);
			assert.deepEqual(fixture.calls()[3]?.policy.enabledTools, ['read_file', 'mcp_insrc_*']);
		} finally { fixture.cleanup(); }
	}
});

test('explicit Vibe structured completion repairs received schema output and honors its attempt budget', async () => {
	const retry = fakeAppServer('flaky');
	const oneAttempt = fakeAppServer('flaky');
	try {
		assert.deepEqual(await retry.provider.completeStructured([...USER_MESSAGES], SCHEMA, { cwd: retry.cwd }), { answer: 42 });
		assert.equal(retry.calls().length, 2);
		assert.match(retry.calls()[1]!.prompt, /not JSON|Unexpected token/);
		await assert.rejects(oneAttempt.provider.completeStructured([...USER_MESSAGES], SCHEMA, { cwd: oneAttempt.cwd, internalRetry: false }), /failed after 1 attempts/);
		assert.equal(oneAttempt.calls().length, 1);
		const signal = AbortSignal.abort();
		await assert.rejects(retry.provider.completeStructured([...USER_MESSAGES], SCHEMA, { cwd: retry.cwd, signal }), /abort/i);
		assert.equal(retry.calls().length, 2);
	} finally { retry.cleanup(); oneAttempt.cleanup(); }
});

test('explicit Vibe review refuses unverified tool policy before dispatch', async () => {
	const fixture = fakeAppServer('unsafe');
	try {
		await assert.rejects(fixture.provider.runReviewSession('review', SCHEMA, { cwd: fixture.cwd, deadlineMs: 10_000 }), /did not verify the review tool policy/);
		assert.equal(fixture.calls().length, 0);
	} finally { fixture.cleanup(); }
});
