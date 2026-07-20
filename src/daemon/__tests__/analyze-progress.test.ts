/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the analyze.run progress producer (sc1).
 *
 * Covers:
 *   - eventToProgressData: the AnalyzeRunEvent -> StageProgressEvent | null
 *     mapper, table-driven with a `never`-check proving exhaustiveness.
 *   - makeProgressEmitter: the emission closure — monotonic stageIndex,
 *     null == no frame, zero delta frames, and EPIPE-resilience.
 *
 * Pure plumbing: no live model, no daemon socket.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { eventToProgressData, makeProgressEmitter } from '../analyze-rpc.js';
import type { AnalyzeRunEvent } from '../../analyze/index.js';
import type { IpcStreamMessage, StageProgressEvent } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Fixtures — one value per AnalyzeRunEvent variant.
// ---------------------------------------------------------------------------

const intent = {
	target:    'infra',
	scope:     'XS',
	focused:   false,
	scopeRef:  { kind: 'workspace', value: '/r' },
	reasoning: 'fixture',
} as const;

// `done` carries a RunAnalyzeResult; the mapper returns null for it
// without reading any field, so a minimal cast suffices.
const doneResult = { ok: true, runId: 'r', durationMs: 1 } as unknown;

const events: Record<AnalyzeRunEvent['type'], AnalyzeRunEvent> = {
	'stage-started':        { type: 'stage-started', stage: 'plan' },
	'classified':           { type: 'classified', intent },
	'stage-substep':        { type: 'stage-substep', stage: 'plan', substep: 'shaper', detail: 'x' },
	'shaper-tool-call':     { type: 'shaper-tool-call', stage: 'plan', tool: 'file_read' },
	'shaper-tool-response': { type: 'shaper-tool-response', stage: 'plan', tool: 'file_read', ok: true },
	'llm-token':            { type: 'llm-token', stage: 'plan', substep: 'emit', preview: 'abc' },
	'plan-attempt':         { type: 'plan-attempt', attempt: 1, accepted: false },
	'plan-accepted':        { type: 'plan-accepted', taskCount: 3, planId: 'p1' },
	'task-started':         { type: 'task-started', taskId: 't1', template: 'trace-callers', index: 1, total: 3 },
	'task-completed':       { type: 'task-completed', taskId: 't1', status: 'ok' },
	'done':                 { type: 'done', result: doneResult as never },
};

// Compile-time exhaustiveness: the record's key set is
// AnalyzeRunEvent['type']; if a new variant is added, this object
// literal fails to typecheck. The runtime `never`-check below mirrors
// that guarantee at the mapper's switch.
const STAGE_VARIANTS: readonly AnalyzeRunEvent['type'][] = [
	'stage-started',
	'classified',
	'plan-accepted',
	'task-started',
	'task-completed',
];
const NULL_VARIANTS: readonly AnalyzeRunEvent['type'][] = [
	'stage-substep',
	'shaper-tool-call',
	'shaper-tool-response',
	'llm-token',
	'plan-attempt',
	'done',
];

test('mapper: table covers every AnalyzeRunEvent variant exactly once (exhaustive)', () => {
	const covered = new Set<string>([...STAGE_VARIANTS, ...NULL_VARIANTS]);
	const all = Object.keys(events);
	assert.equal(covered.size, all.length, 'each variant classified exactly once');
	for (const t of all) assert.ok(covered.has(t), `variant ${t} classified`);

	// Runtime never-check: prove the switch handles every variant. If a
	// new arm is unhandled, eventToProgressData's default `never` branch
	// would be reachable — here we assert every fixture routes.
	const check = (t: AnalyzeRunEvent['type']): void => {
		switch (t) {
			case 'stage-started':
			case 'classified':
			case 'stage-substep':
			case 'shaper-tool-call':
			case 'shaper-tool-response':
			case 'llm-token':
			case 'plan-attempt':
			case 'plan-accepted':
			case 'task-started':
			case 'task-completed':
			case 'done':
				return;
			default: {
				const _exhaustive: never = t;
				throw new Error(`unhandled variant: ${String(_exhaustive)}`);
			}
		}
	};
	for (const t of Object.keys(events) as AnalyzeRunEvent['type'][]) check(t);
});

test('mapper: stage variants -> StageProgressEvent{operation:analyze.run,total:null,index}', () => {
	for (const t of STAGE_VARIANTS) {
		const idx = 7;
		const out = eventToProgressData(events[t], idx);
		assert.ok(out !== null, `${t} should map to a StageProgressEvent`);
		assert.equal(out!.kind, 'stage');
		const stage = out as StageProgressEvent;
		assert.equal(stage.operation, 'analyze.run');
		assert.equal(stage.total, null, `${t}: total is always null`);
		assert.equal(stage.index, idx, `${t}: index is the threaded stageIndex`);
		assert.equal(typeof stage.stageId, 'string');
		assert.ok(stage.stageId.length > 0, `${t}: non-empty stageId`);
		assert.equal(typeof stage.stageLabel, 'string');
		assert.ok(stage.stageLabel.length > 0, `${t}: non-empty stageLabel`);
	}
});

test('mapper: specific stageId/stageLabel derivations', () => {
	assert.deepEqual(eventToProgressData(events['stage-started'], 0), {
		kind: 'stage', operation: 'analyze.run', stageId: 'plan', stageLabel: 'plan started', index: 0, total: null,
	});
	const classified = eventToProgressData(events['classified'], 1) as StageProgressEvent;
	assert.equal(classified.stageId, 'classify');
	assert.match(classified.stageLabel, /classified: infra\/XS/);
	const planAccepted = eventToProgressData(events['plan-accepted'], 2) as StageProgressEvent;
	assert.equal(planAccepted.stageId, 'plan');
	assert.match(planAccepted.stageLabel, /3 tasks/);
	const taskStarted = eventToProgressData(events['task-started'], 3) as StageProgressEvent;
	assert.equal(taskStarted.stageId, 'task-t1');
	assert.match(taskStarted.stageLabel, /task 1\/3 started: trace-callers/);
	const taskDone = eventToProgressData(events['task-completed'], 4) as StageProgressEvent;
	assert.equal(taskDone.stageId, 'task-t1');
	assert.match(taskDone.stageLabel, /task t1 ok/);
});

test('mapper: llm-token + all sub-events + done -> null (no throw)', () => {
	for (const t of NULL_VARIANTS) {
		assert.equal(eventToProgressData(events[t], 0), null, `${t} maps to null`);
	}
});

test('mapper: malformed / unknown input -> null, never throws', () => {
	const bogus = { type: 'not-a-real-event' } as unknown as AnalyzeRunEvent;
	assert.doesNotThrow(() => eventToProgressData(bogus, 0));
	assert.equal(eventToProgressData(bogus, 0), null);
});

// ---------------------------------------------------------------------------
// makeProgressEmitter — the emission closure
// ---------------------------------------------------------------------------

function collect(): { frames: IpcStreamMessage[]; send: (m: IpcStreamMessage) => void } {
	const frames: IpcStreamMessage[] = [];
	return { frames, send: (m) => { frames.push(m); } };
}

test('emitter: stage events -> progress frames; sub-events/llm-token emit nothing; zero delta frames', () => {
	const { frames, send } = collect();
	const onEvent = makeProgressEmitter(send, 'run-1');

	// Interleave stage events with sub-events + llm-token + done.
	onEvent(events['stage-started']);        // -> progress (index 0)
	onEvent(events['stage-substep']);        // -> nothing
	onEvent(events['llm-token']);            // -> nothing
	onEvent(events['classified']);           // -> progress (index 1)
	onEvent(events['shaper-tool-call']);     // -> nothing
	onEvent(events['plan-accepted']);        // -> progress (index 2)
	onEvent(events['task-started']);         // -> progress (index 3)
	onEvent(events['task-completed']);       // -> progress (index 4)
	onEvent(events['done']);                 // -> nothing (handled elsewhere)

	// Exactly five progress frames, zero delta frames.
	assert.equal(frames.length, 5, `expected 5 progress frames, got ${frames.length}`);
	assert.equal(frames.filter(f => f.stream === 'delta').length, 0, 'no delta frames on analyze path');
	for (const f of frames) {
		assert.equal(f.stream, 'progress');
		assert.equal(f.id, 0, 'id:0 discipline preserved');
		assert.equal((f.data as StageProgressEvent).kind, 'stage');
		assert.equal((f.data as StageProgressEvent).operation, 'analyze.run');
	}

	// stageIndex increments monotonically across emitted stage frames only.
	assert.deepEqual(frames.map(f => (f.data as StageProgressEvent).index), [0, 1, 2, 3, 4]);
});

test('emitter: repeated stages still advance the counter', () => {
	const { frames, send } = collect();
	const onEvent = makeProgressEmitter(send, 'run-2');
	onEvent(events['stage-started']);
	onEvent(events['stage-started']);
	onEvent(events['stage-started']);
	assert.deepEqual(frames.map(f => (f.data as StageProgressEvent).index), [0, 1, 2]);
});

test('emitter: a send that throws EPIPE on the Nth call does not abort the run', () => {
	let calls = 0;
	const seen: StageProgressEvent[] = [];
	const send = (m: IpcStreamMessage): void => {
		calls += 1;
		if (calls === 2) {
			const err = new Error('write EPIPE') as Error & { code: string };
			err.code = 'EPIPE';
			throw err;
		}
		seen.push(m.data as StageProgressEvent);
	};
	const onEvent = makeProgressEmitter(send, 'run-3');

	// Four stage events; the 2nd send throws EPIPE. The closure must
	// swallow it and keep emitting the rest.
	assert.doesNotThrow(() => {
		onEvent(events['stage-started']);
		onEvent(events['classified']);       // send #2 throws EPIPE
		onEvent(events['plan-accepted']);
		onEvent(events['task-started']);
	});
	assert.equal(calls, 4, 'all four sends attempted despite the throw');
	// The non-throwing sends landed (frames 1, 3, 4).
	assert.equal(seen.length, 3);
});
