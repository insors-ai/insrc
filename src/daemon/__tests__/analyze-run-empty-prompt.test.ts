/**
 * A run request with no prompt and a stated source is accepted
 * (Story s7, task t15).
 *
 * The daemon's parser for the run request takes the empty string as prompt
 * when a kind of source is stated: the run is then unfocused. With no kind of
 * source it refuses the empty string, and says a kind of source must be
 * stated. A prompt of only white space is not the empty string: it is
 * accepted in both cases, as it always was.
 *
 * The daemon's run handler is called directly. The accepted requests run for
 * real over a sandboxed graph store, with a stated source and size on a
 * directory that is not indexed: no model is reached, and the run ends at the
 * indexed check with the intent it had built.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { purgeRunForTests } from '../../analyze/orchestrator/index.js';
import type { RunAnalyzeArgs } from '../../analyze/orchestrator/types.js';
import { upsertEntities } from '../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { addRepo } from '../../db/repos.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';
import type { Entity, IpcStreamMessage } from '../../shared/types.js';
import { _setRunAnalyzeForTest, EMPTY_PROMPT_NEEDS_SOURCE, runStart } from '../analyze-rpc.js';

let sandbox: string;
let dirPath: string;
const REGISTERED = '/registered/elsewhere';

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'analyze-empty-prompt-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	dirPath = join(sandbox, 'proj');
	mkdirSync(dirPath, { recursive: true });
	writeFileSync(join(dirPath, 'a.ts'), 'export const a = 1;\n', 'utf8');
	await addRepo(null, { path: REGISTERED, name: REGISTERED, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await upsertEntities(null, [{
		id: 'e-fixture', repo: REGISTERED, file: `${REGISTERED}/index.ts`, kind: 'function', name: 'fn',
		language: 'typescript', startLine: 1, endLine: 3,
	} as unknown as Entity]);
});

test.afterEach(async () => {
	_setRunAnalyzeForTest(undefined);
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

interface Terminal { ok: boolean; runId: string; stage: string; intent?: ClassifiedIntent; error: { code: string; message: string } }

/** Send one run request to the daemon's handler; the result frame, and the streams of all frames. */
async function request(params: Record<string, unknown>): Promise<{ terminal: Terminal; streams: string[] }> {
	const frames: IpcStreamMessage[] = [];
	await runStart(params, (m) => { frames.push(m); }, new AbortController().signal);
	const result = frames.find(f => f.stream === 'analyze.result');
	assert.ok(result !== undefined, 'a result frame is sent');
	return { terminal: result.data as Terminal, streams: frames.map(f => f.stream) };
}

const uniqueId = (tag: string): string => `empty-prompt-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`;

test('an empty prompt with a stated kind of source is accepted and gives an unfocused intent; with none it is refused with the new message', async () => {
	// --- accepted for every kind of source: the request reaches the run with the empty prompt ---
	const reached: RunAnalyzeArgs[] = [];
	_setRunAnalyzeForTest(async (args) => { reached.push(args); throw new Error('stand-in: the request was accepted'); });
	for (const targetHint of ['code', 'data', 'infra', 'generic', 'docs']) {
		const { terminal } = await request({ runId: uniqueId(targetHint), userPrompt: '', scopeRef: { kind: 'repo', value: dirPath }, targetHint });
		assert.notEqual(terminal.error.code, 'invalid-params', targetHint);
	}
	assert.deepEqual(reached.map(a => [a.userPrompt, a.targetHint]), [['', 'code'], ['', 'data'], ['', 'infra'], ['', 'generic'], ['', 'docs']]);
	_setRunAnalyzeForTest(undefined);

	// --- and the run it starts is unfocused: the intent has no focus at all ---
	const id = uniqueId('unfocused');
	try {
		const { terminal, streams } = await request({ runId: id, userPrompt: '', scopeRef: { kind: 'repo', value: dirPath }, targetHint: 'code', scopeHint: 'M' });
		// The run went past classification (it ends at the indexed check), so the request was not refused.
		assert.deepEqual([terminal.ok, terminal.stage, terminal.error.code], [false, 'plan', 'scope-not-indexed']);
		assert.equal(terminal.intent?.focused, false);
		assert.ok(terminal.intent !== undefined && !('focus' in terminal.intent), 'no focus key');
		assert.deepEqual([terminal.intent?.target, terminal.intent?.scope], ['code', 'M']);
		assert.equal(streams[streams.length - 1], 'done');
	} finally {
		purgeRunForTests(id);
	}
	// The same request with a prompt is focused on it: the empty prompt is what made the other unfocused.
	const focused = uniqueId('focused');
	try {
		const { terminal } = await request({ runId: focused, userPrompt: 'how are refunds settled', scopeRef: { kind: 'repo', value: dirPath }, targetHint: 'code', scopeHint: 'M' });
		assert.deepEqual([terminal.intent?.focused, terminal.intent?.focus], [true, 'how are refunds settled']);
	} finally {
		purgeRunForTests(focused);
	}

	// --- with no stated kind of source: refused, with the message that says one must be stated ---
	let called = 0;
	_setRunAnalyzeForTest(async () => { called += 1; throw new Error('must not be reached'); });
	const refused = await request({ runId: uniqueId('refused'), userPrompt: '', scopeRef: { kind: 'repo', value: dirPath } });
	assert.deepEqual([refused.terminal.ok, refused.terminal.stage, refused.terminal.error.code], [false, 'classify', 'invalid-params']);
	assert.equal(refused.terminal.error.message, EMPTY_PROMPT_NEEDS_SOURCE);
	assert.match(refused.terminal.error.message, /a request with no prompt must state a kind of source \(targetHint: one of code, data, infra, generic, docs\)/);
	assert.deepEqual(refused.streams, ['analyze.result', 'done']);
	assert.equal(called, 0, 'no run was started');
	// A size alone does not make up for a missing kind of source.
	const sized = await request({ runId: uniqueId('sized'), userPrompt: '', scopeRef: { kind: 'repo', value: dirPath }, scopeHint: 'M' });
	assert.equal(sized.terminal.error.message, EMPTY_PROMPT_NEEDS_SOURCE);

	// --- what is still refused as before: a prompt that is absent or not a string, with or without a source ---
	for (const extra of [{}, { targetHint: 'code' }]) {
		for (const userPrompt of [undefined, null, 7, ['']]) {
			const r = await request({ runId: uniqueId('bad'), scopeRef: { kind: 'repo', value: dirPath }, ...(userPrompt !== undefined ? { userPrompt } : {}), ...extra });
			assert.equal(r.terminal.error.code, 'invalid-params');
			assert.match(r.terminal.error.message, /^userPrompt: must be a string$/);
		}
	}
	// An unknown kind of source is refused as such, whatever the prompt.
	const unknown = await request({ runId: uniqueId('unknown'), userPrompt: '', scopeRef: { kind: 'repo', value: dirPath }, targetHint: 'everything' });
	assert.match(unknown.terminal.error.message, /^targetHint: must be one of code, data, infra, generic, docs; got "everything"$/);
	assert.equal(called, 0);
});

test('a prompt of only white space is accepted with and without a stated kind of source (mutation: treat white space as empty at the parser)', async () => {
	const reached: RunAnalyzeArgs[] = [];
	_setRunAnalyzeForTest(async (args) => { reached.push(args); throw new Error('stand-in: the request was accepted'); });

	const prompts = [' ', '   ', '\n', '\t \n'];
	for (const userPrompt of prompts) {
		// With no stated kind of source: accepted, and handed on as it was given (the classifier gets it).
		const bare = await request({ runId: uniqueId('ws'), userPrompt, scopeRef: { kind: 'repo', value: dirPath } });
		assert.notEqual(bare.terminal.error.code, 'invalid-params', JSON.stringify(userPrompt));
		// With one: accepted too.
		const hinted = await request({ runId: uniqueId('ws-hinted'), userPrompt, scopeRef: { kind: 'repo', value: dirPath }, targetHint: 'docs' });
		assert.notEqual(hinted.terminal.error.code, 'invalid-params', JSON.stringify(userPrompt));
	}
	// Every request reached the run, with its prompt untouched: the parser trims nothing.
	assert.deepEqual(reached.map(a => [a.userPrompt, a.targetHint]), prompts.flatMap(p => [[p, undefined], [p, 'docs']]));

	// With a stated source the white space is trimmed further in, and the run is unfocused.
	_setRunAnalyzeForTest(undefined);
	const id = uniqueId('ws-unfocused');
	try {
		const { terminal } = await request({ runId: id, userPrompt: ' \n\t ', scopeRef: { kind: 'repo', value: dirPath }, targetHint: 'code', scopeHint: 'M' });
		assert.deepEqual([terminal.stage, terminal.error.code], ['plan', 'scope-not-indexed']);
		assert.equal(terminal.intent?.focused, false);
		assert.ok(terminal.intent !== undefined && !('focus' in terminal.intent));
	} finally {
		purgeRunForTests(id);
	}
});
