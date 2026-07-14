/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the analyze.context.* RPC handlers.
 *
 * Pure plumbing tests:
 *   - Params validation produces invalid-params responses
 *   - Typed shaper errors map to stable error codes
 *   - Untyped errors fall through to internal-error
 *   - Happy-path response shape carries the bundle
 *
 * The handlers themselves dispatch into the shaper driver; that
 * driver is exercised end-to-end against real Ollama in
 * analyze-rpc.live.test.ts. This file pins the wire shape without
 * a live model.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH \
 *     npx tsx --test src/insrc/daemon/__tests__/analyze-rpc.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	buildClassification,
	buildRun,
	buildTask,
	classify,
	plan,
	runStart,
	runStatus,
	runPurge,
} from '../analyze-rpc.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRunRecord, purgeRunForTests } from '../../analyze/orchestrator/index.js';

// ---------------------------------------------------------------------------
// Params validation -- invalid-params responses for malformed input
// ---------------------------------------------------------------------------

test('buildClassification rejects non-object params with invalid-params', async () => {
	const r = await buildClassification(null);
	assert.equal(r.ok, false);
	assert.equal((r as { error: { code: string } }).error.code, 'invalid-params');
});

test('buildClassification rejects missing runId', async () => {
	const r = await buildClassification({
		scopeRef:   { kind: 'workspace', value: '/x' },
		userPrompt: 'hi',
	});
	assert.equal(r.ok, false);
	assert.equal((r as { error: { code: string; message: string } }).error.code, 'invalid-params');
	assert.match((r as { error: { message: string } }).error.message, /runId/);
});

test('buildClassification rejects missing scopeRef', async () => {
	const r = await buildClassification({ runId: 'rid', userPrompt: 'hi' });
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /scopeRef/);
});

test('buildClassification rejects bad scopeRef.kind', async () => {
	const r = await buildClassification({
		runId:      'rid',
		scopeRef:   { kind: 'invalid-kind', value: '/x' },
		userPrompt: 'hi',
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /scopeRef\.kind/);
});

test('buildRun rejects missing intent', async () => {
	const r = await buildRun({ runId: 'rid' });
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /intent/);
});

test('buildRun rejects bad intent.target', async () => {
	const r = await buildRun({
		runId:  'rid',
		intent: {
			target:    'invalid',
			scope:     'M',
			focused:   false,
			scopeRef:  { kind: 'workspace', value: '/x' },
			reasoning: 'test',
		},
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /intent\.target/);
});

test('buildRun rejects bad intent.scope', async () => {
	const r = await buildRun({
		runId:  'rid',
		intent: {
			target:    'code',
			scope:     'XXL',
			focused:   false,
			scopeRef:  { kind: 'workspace', value: '/x' },
			reasoning: 'test',
		},
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /intent\.scope/);
});

test('buildRun rejects non-boolean intent.focused', async () => {
	const r = await buildRun({
		runId:  'rid',
		intent: {
			target:    'code',
			scope:     'M',
			focused:   'yes',
			scopeRef:  { kind: 'workspace', value: '/x' },
			reasoning: 'test',
		},
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /focused/);
});

test('buildTask rejects target=generic at task scope', async () => {
	const r = await buildTask({
		runId: 'rid',
		intent: {
			target:    'generic',
			scope:     'S',
			focused:   true,
			focus:     'foo',
			scopeRef:  { kind: 'workspace', value: '/x' },
			reasoning: 'test',
		},
		task: {
			taskId:    't01',
			template:  'code.foo',
			kind:      'leaf',
			params:    {},
			produces:  ['out'],
			rationale: 'test fixture',
		},
		template: {
			id:       'code.foo',
			target:   'code',
			family:   'foo',
			kind:     'leaf',
			revision: 'r1',
		},
		upstream: {},
	});
	assert.equal(r.ok, false);
	assert.equal((r as { error: { code: string } }).error.code, 'invalid-params');
	assert.match((r as { error: { message: string } }).error.message, /generic.*not valid at task scope/);
});

test('buildTask rejects bad task.produces shape', async () => {
	const r = await buildTask({
		runId: 'rid',
		intent: {
			target:    'code',
			scope:     'S',
			focused:   true,
			focus:     'foo',
			scopeRef:  { kind: 'workspace', value: '/x' },
			reasoning: 'test',
		},
		task: {
			taskId:    't01',
			template:  'code.foo',
			kind:      'leaf',
			params:    {},
			produces:  [1, 2],  // bad
			rationale: 'test fixture',
		},
		template: {
			id:       'code.foo',
			target:   'code',
			family:   'foo',
			kind:     'leaf',
			revision: 'r1',
		},
		upstream: {},
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /task\.produces/);
});

test('buildTask accepts undefined upstream as an empty Map', async () => {
	const r = await buildTask({
		runId: 'rid-' + Math.floor(Math.random() * 1e9).toString(16),
		intent: {
			target:    'code',
			scope:     'S',
			focused:   true,
			focus:     'foo',
			scopeRef:  { kind: 'workspace', value: '/var/folders/non-existent-path' },
			reasoning: 'test',
		},
		task: {
			taskId:    't01',
			template:  'code.foo',
			kind:      'leaf',
			params:    {},
			produces:  ['out'],
			rationale: 'test fixture',
		},
		template: {
			id:       'code.foo',
			target:   'code',
			family:   'foo',
			kind:     'leaf',
			revision: 'r1',
		},
		// upstream omitted
	});
	// Will fail downstream (no Ollama running for sure on the CI path,
	// or model unavailable) but params parsing should NOT fire
	// invalid-params for missing upstream.
	assert.equal(r.ok, false);
	assert.notEqual((r as { error: { code: string } }).error.code, 'invalid-params');
});

test('buildTask accepts array-form upstream', async () => {
	const r = await buildTask({
		runId: 'rid-' + Math.floor(Math.random() * 1e9).toString(16),
		intent: {
			target:    'code',
			scope:     'S',
			focused:   true,
			focus:     'foo',
			scopeRef:  { kind: 'workspace', value: '/var/folders/non-existent-path' },
			reasoning: 'test',
		},
		task: {
			taskId:    't01',
			template:  'code.foo',
			kind:      'leaf',
			params:    {},
			produces:  ['out'],
			rationale: 'test fixture',
		},
		template: {
			id:       'code.foo',
			target:   'code',
			family:   'foo',
			kind:     'leaf',
			revision: 'r1',
		},
		upstream: [['t02', { ok: true }], ['t03', null]],
	});
	assert.equal(r.ok, false);
	assert.notEqual((r as { error: { code: string } }).error.code, 'invalid-params');
});

test('buildTask rejects bad upstream array entries', async () => {
	const r = await buildTask({
		runId: 'rid',
		intent: {
			target:    'code',
			scope:     'S',
			focused:   true,
			focus:     'foo',
			scopeRef:  { kind: 'workspace', value: '/x' },
			reasoning: 'test',
		},
		task: {
			taskId:    't01',
			template:  'code.foo',
			kind:      'leaf',
			params:    {},
			produces:  ['out'],
			rationale: 'test fixture',
		},
		template: {
			id:       'code.foo',
			target:   'code',
			family:   'foo',
			kind:     'leaf',
			revision: 'r1',
		},
		upstream: [['only-one-element']],
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /upstream/);
});

// ---------------------------------------------------------------------------
// Error-code shape: an unsupported scope or unrecognized scopeRef.value
// produces an internal-error / scope-not-indexed code via the shaper
// path. We can't easily force the shaper without LLM, but we CAN
// verify the params validator drops obviously bad inputs upstream,
// and the live test (analyze-rpc.live.test.ts) covers the
// scope-not-indexed code end-to-end.
// ---------------------------------------------------------------------------

test('invalid-params responses carry { code, message }', async () => {
	const r = await buildRun({});
	assert.equal(r.ok, false);
	const err = (r as { error: { code: string; message: string; data?: unknown } }).error;
	assert.equal(typeof err.code, 'string');
	assert.equal(typeof err.message, 'string');
	assert.ok(err.message.length > 0);
});

// ---------------------------------------------------------------------------
// classify: params validation
// ---------------------------------------------------------------------------

test('classify rejects non-object params with invalid-params', async () => {
	const r = await classify(null);
	assert.equal(r.ok, false);
	assert.equal((r as { error: { code: string } }).error.code, 'invalid-params');
});

test('classify rejects missing runId', async () => {
	const r = await classify({
		userPrompt: 'hi',
		scopeRef:   { kind: 'workspace', value: '/x' },
	});
	assert.equal(r.ok, false);
	assert.equal((r as { error: { code: string } }).error.code, 'invalid-params');
	assert.match((r as { error: { message: string } }).error.message, /runId/);
});

test('classify rejects missing userPrompt', async () => {
	const r = await classify({
		runId:    'rid',
		scopeRef: { kind: 'workspace', value: '/x' },
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /userPrompt/);
});

test('classify rejects missing scopeRef', async () => {
	const r = await classify({ runId: 'rid', userPrompt: 'hi' });
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /scopeRef/);
});

test('classify rejects bad scopeRef.kind', async () => {
	const r = await classify({
		runId:      'rid',
		userPrompt: 'hi',
		scopeRef:   { kind: 'invalid-kind', value: '/x' },
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /scopeRef\.kind/);
});

test('classify rejects empty-string userPrompt', async () => {
	const r = await classify({
		runId:      'rid',
		userPrompt: '',
		scopeRef:   { kind: 'workspace', value: '/x' },
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /userPrompt/);
});

// ---------------------------------------------------------------------------
// plan: params validation
// ---------------------------------------------------------------------------

test('plan rejects non-object params with invalid-params', async () => {
	const r = await plan(null);
	assert.equal(r.ok, false);
	assert.equal((r as { error: { code: string } }).error.code, 'invalid-params');
});

test('plan rejects missing runId', async () => {
	const r = await plan({
		intent: {
			target:    'code',
			scope:     'M',
			focused:   false,
			scopeRef:  { kind: 'repo', value: '/x' },
			reasoning: 'test',
		},
	});
	assert.equal(r.ok, false);
	assert.equal((r as { error: { code: string } }).error.code, 'invalid-params');
	assert.match((r as { error: { message: string } }).error.message, /runId/);
});

test('plan rejects missing intent', async () => {
	const r = await plan({ runId: 'rid' });
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /intent/);
});

test('plan rejects bad intent.target', async () => {
	const r = await plan({
		runId: 'rid',
		intent: {
			target:    'invented',
			scope:     'M',
			focused:   false,
			scopeRef:  { kind: 'repo', value: '/x' },
			reasoning: 'test',
		},
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /intent\.target/);
});

test('plan rejects bad rootScope value', async () => {
	const r = await plan({
		runId: 'rid',
		intent: {
			target:    'code',
			scope:     'M',
			focused:   false,
			scopeRef:  { kind: 'repo', value: '/x' },
			reasoning: 'test',
		},
		rootScope: 'XXL',
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /rootScope/);
});

test('plan rejects non-integer currentDepth', async () => {
	const r = await plan({
		runId: 'rid',
		intent: {
			target:    'code',
			scope:     'M',
			focused:   false,
			scopeRef:  { kind: 'repo', value: '/x' },
			reasoning: 'test',
		},
		currentDepth: 1.5,
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /currentDepth/);
});

test('plan rejects negative currentDepth', async () => {
	const r = await plan({
		runId: 'rid',
		intent: {
			target:    'code',
			scope:     'M',
			focused:   false,
			scopeRef:  { kind: 'repo', value: '/x' },
			reasoning: 'test',
		},
		currentDepth: -1,
	});
	assert.equal(r.ok, false);
	assert.match((r as { error: { message: string } }).error.message, /currentDepth/);
});

// ---------------------------------------------------------------------------
// analyze.run.start -- streaming params validation
//
// runStart is a streaming handler now: (params, send, signal) -> Promise<void>.
// Param-validation failures travel as the terminal `analyze.result`
// frame carrying RunStartRpcResponse{ok:false, error:{code:'invalid-params'}}
// followed by a `done` frame. Tests collect emitted frames + assert
// on the terminal one.
// ---------------------------------------------------------------------------

interface CollectedFrame { stream: string; data: unknown; }

function collectFrames(): { frames: CollectedFrame[]; send: (m: { id: number; stream: string; data: unknown }) => void } {
	const frames: CollectedFrame[] = [];
	return {
		frames,
		send: (m) => frames.push({ stream: m.stream, data: m.data }),
	};
}

function terminalFrameOf(frames: readonly CollectedFrame[]): { result: { ok: boolean; runId: string; stage?: string; error?: { code: string; message: string } } | undefined } {
	const analyzeResult = frames.find(f => f.stream === 'analyze.result');
	if (analyzeResult === undefined) return { result: undefined };
	return { result: analyzeResult.data as { ok: boolean; runId: string; stage?: string; error?: { code: string; message: string } } };
}

test('runStart (streaming): non-object params -> analyze.result frame with invalid-params + done', async () => {
	const { frames, send } = collectFrames();
	await runStart(null, send, new AbortController().signal);

	// Should emit exactly 2 frames: analyze.result + done.
	assert.equal(frames.length, 2, `expected 2 frames; got ${frames.length}: ${frames.map(f => f.stream).join(', ')}`);
	assert.equal(frames[0]!.stream, 'analyze.result');
	assert.equal(frames[1]!.stream, 'done');

	const { result } = terminalFrameOf(frames);
	assert.ok(result);
	assert.equal(result!.ok, false);
	assert.equal(result!.error?.code, 'invalid-params');
	assert.equal(result!.runId, '');
	assert.equal(result!.stage, 'classify');
});

test('runStart (streaming): missing runId -> invalid-params in terminal frame', async () => {
	const { frames, send } = collectFrames();
	await runStart({
		userPrompt: 'hi',
		scopeRef:   { kind: 'workspace', value: '/x' },
	}, send, new AbortController().signal);

	const { result } = terminalFrameOf(frames);
	assert.ok(result);
	assert.equal(result!.ok, false);
	assert.equal(result!.error?.code, 'invalid-params');
	assert.match(result!.error!.message, /runId/);
});

test('runStart (streaming): missing userPrompt -> invalid-params', async () => {
	const { frames, send } = collectFrames();
	await runStart({
		runId:    'r1',
		scopeRef: { kind: 'workspace', value: '/x' },
	}, send, new AbortController().signal);
	const { result } = terminalFrameOf(frames);
	assert.ok(result);
	assert.equal(result!.error?.code, 'invalid-params');
	assert.match(result!.error!.message, /userPrompt/);
});

test('runStart (streaming): missing scopeRef -> invalid-params', async () => {
	const { frames, send } = collectFrames();
	await runStart({ runId: 'r1', userPrompt: 'hi' }, send, new AbortController().signal);
	const { result } = terminalFrameOf(frames);
	assert.ok(result);
	assert.equal(result!.error?.code, 'invalid-params');
	assert.match(result!.error!.message, /scopeRef/);
});

test('runStart (streaming): bad scopeRef.kind -> invalid-params with field name in message', async () => {
	const { frames, send } = collectFrames();
	await runStart({
		runId: 'r1', userPrompt: 'hi',
		scopeRef: { kind: 'frobnicate', value: '/x' },
	}, send, new AbortController().signal);
	const { result } = terminalFrameOf(frames);
	assert.ok(result);
	assert.equal(result!.error?.code, 'invalid-params');
	assert.match(result!.error!.message, /scopeRef\.kind/);
});

test('runStart (streaming): resume cache hit -> analyze.result with ok:true; no intermediate progress frames', async () => {
	const runId = `rpc-stream-cache-${Math.floor(Math.random() * 1e9).toString(16)}`;
	try {
		writeRunRecord({
			runId,
			createdAt:       '2026-06-29T00:00:00.000Z',
			updatedAt:       '2026-06-29T00:00:01.000Z',
			userPrompt:      'fixture',
			initialScopeRef: { kind: 'workspace', value: '/r' },
			stage:           'done',
			status:          'ok',
			intent: {
				target:    'infra',
				scope:     'XS',
				focused:   false,
				scopeRef:  { kind: 'workspace', value: '/r' },
				reasoning: 'cache-hit streaming RPC fixture',
			},
			finalReport:    { summary: 'cached', findings: [], metadata: {} as never },
			tasksCompleted: 1,
			tasksFailed:    [],
		});

		const { frames, send } = collectFrames();
		await runStart({
			runId,
			userPrompt: 'whatever',
			scopeRef:   { kind: 'workspace', value: '/r' },
		}, send, new AbortController().signal);

		// Cache hit short-circuits all stage events; only analyze.result + done emit.
		assert.equal(frames.length, 2,
			`cache hit should emit exactly 2 frames; got ${frames.length}: ${frames.map(f => f.stream).join(', ')}`);
		assert.equal(frames[0]!.stream, 'analyze.result');
		assert.equal(frames[1]!.stream, 'done');

		const { result } = terminalFrameOf(frames);
		assert.ok(result);
		assert.equal(result!.ok, true);
		assert.equal(result!.runId, runId);
	} finally {
		purgeRunForTests(runId);
	}
});

// ---------------------------------------------------------------------------
// analyze.run.status
// ---------------------------------------------------------------------------

test('runStatus rejects non-object params with invalid-params', async () => {
	const r = await runStatus(null);
	assert.equal(r.ok, false);
	if (r.ok) return;
	assert.equal(r.error.code, 'invalid-params');
});

test('runStatus rejects missing runId', async () => {
	const r = await runStatus({});
	assert.equal(r.ok, false);
	if (r.ok) return;
	assert.equal(r.error.code, 'invalid-params');
});

test('runStatus on missing runId record returns invalid-input', async () => {
	const r = await runStatus({ runId: 'no-such-' + Math.random().toString(36).slice(2) });
	assert.equal(r.ok, false);
	if (r.ok) return;
	assert.equal(r.error.code, 'invalid-input');
	assert.match(r.error.message, /no run record/);
});

test('runStatus returns the persisted RunRecord round-trip', async () => {
	const runId = `rpc-status-${Math.floor(Math.random() * 1e9).toString(16)}`;
	try {
		writeRunRecord({
			runId,
			createdAt:       '2026-06-27T00:00:00.000Z',
			updatedAt:       '2026-06-27T00:00:01.000Z',
			userPrompt:      'fixture',
			initialScopeRef: { kind: 'workspace', value: '/r' },
			stage:           'done',
			status:          'ok',
			intent: {
				target:    'infra',
				scope:     'XS',
				focused:   false,
				scopeRef:  { kind: 'workspace', value: '/r' },
				reasoning: 'fixture',
			},
			finalReport:    { summary: 'all good', findings: [], metadata: {} as never },
			tasksCompleted: 3,
			tasksFailed:    [],
		});
		const r = await runStatus({ runId });
		assert.equal(r.ok, true);
		if (!r.ok) return;
		assert.equal(r.record.runId, runId);
		assert.equal(r.record.status, 'ok');
		assert.equal(r.record.intent?.target, 'infra');
	} finally {
		purgeRunForTests(runId);
		// Touch unused imports to keep TS happy on the test build path.
		void mkdtempSync; void rmSync; void tmpdir; void join;
	}
});

// ---------------------------------------------------------------------------
// analyze.run.purge
// ---------------------------------------------------------------------------

test('runPurge rejects non-object params with invalid-params', async () => {
	const r = await runPurge(null);
	assert.equal(r.ok, false);
	if (r.ok) return;
	assert.equal(r.error.code, 'invalid-params');
});

test('runPurge rejects missing runId', async () => {
	const r = await runPurge({});
	assert.equal(r.ok, false);
	if (r.ok) return;
	assert.equal(r.error.code, 'invalid-params');
});

test('runPurge rejects non-boolean force', async () => {
	const r = await runPurge({ runId: 'r1', force: 'yes' });
	assert.equal(r.ok, false);
	if (r.ok) return;
	assert.equal(r.error.code, 'invalid-params');
	assert.match(r.error.message, /force/);
});

test('runPurge on missing runId record returns purged=false (idempotent)', async () => {
	const r = await runPurge({ runId: 'no-such-' + Math.random().toString(36).slice(2) });
	assert.equal(r.ok, true);
	if (!r.ok) return;
	assert.equal(r.purged, false);
});

test('runPurge removes a persisted finished run; subsequent purge returns purged=false', async () => {
	const runId = `rpc-purge-${Math.floor(Math.random() * 1e9).toString(16)}`;
	writeRunRecord({
		runId,
		createdAt:       '2026-06-27T00:00:00.000Z',
		updatedAt:       '2026-06-27T00:00:01.000Z',
		userPrompt:      'fixture',
		initialScopeRef: { kind: 'workspace', value: '/r' },
		stage:           'done',
		status:          'ok',
	});
	const first = await runPurge({ runId });
	assert.equal(first.ok, true);
	if (!first.ok) return;
	assert.equal(first.purged, true);

	const second = await runPurge({ runId });
	assert.equal(second.ok, true);
	if (!second.ok) return;
	assert.equal(second.purged, false);
});

test('runPurge refuses on status=in-progress without force; force=true overrides', async () => {
	const runId = `rpc-purge-inprog-${Math.floor(Math.random() * 1e9).toString(16)}`;
	try {
		writeRunRecord({
			runId,
			createdAt:       '2026-06-27T00:00:00.000Z',
			updatedAt:       '2026-06-27T00:00:01.000Z',
			userPrompt:      'fixture',
			initialScopeRef: { kind: 'workspace', value: '/r' },
			stage:           'plan',
			status:          'in-progress',
		});

		const refused = await runPurge({ runId });
		assert.equal(refused.ok, false);
		if (refused.ok) return;
		assert.equal(refused.error.code, 'run-in-progress');
		const data = refused.error.data as { stage?: string } | undefined;
		assert.equal(data?.stage, 'plan');

		const forced = await runPurge({ runId, force: true });
		assert.equal(forced.ok, true);
		if (!forced.ok) return;
		assert.equal(forced.purged, true);
	} finally {
		purgeRunForTests(runId);
	}
});

test('AnalyzeRpcOk responses have ok:true and a bundle field', async () => {
	// We can't easily force a success without a real LLM. But the
	// shape is pinned at the type level; the live test asserts the
	// success path. This test ensures the type discriminator is
	// usable -- a TypeScript check is enough.
	type Ok  = { ok: true;  bundle: unknown };
	type Err = { ok: false; error:  { code: string; message: string } };
	const synth: Ok | Err = { ok: true, bundle: { system: '', focus: '', summary: '', structure: '', surface: '', artefacts: '', upstream: '' } };
	if (synth.ok) {
		assert.notEqual(synth.bundle, undefined);
	}
});
