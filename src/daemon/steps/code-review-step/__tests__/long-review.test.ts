/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A daemon code review longer than 30 minutes completes (ISSUE-1973e125, t5).
 * The step tool, the in-daemon client, the `codeReview.run` handler and the
 * code-review runner are the real ones, on a fake clock. The judges stand in
 * for the model: each review call is reported as it starts and takes a
 * minute of the clock.
 *
 * Run: npx tsx --test src/daemon/steps/code-review-step/__tests__/long-review.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeReviewRunStart } from '../../../code-review-rpc.js';
import { createInDaemonClient, installStepDaemonClient } from '../../daemon-client.js';
import { codeReviewWaitLimits, handleCodeReviewStep } from '../handler.js';
import type { CodeReviewStepDeps } from '../handler.js';
import { _clearCodeReviewStateStoreForTests } from '../state-store.js';
import type { CodeReviewStepOutput } from '../types.js';
import { runCodeReview } from '../../../../workflow/code-review/runner.js';
import type { JudgeSlot } from '../../../../workflow/code-review/runner.js';
import type { CodeReviewGrounding, CodeReviewSubject, ReviewDimension } from '../../../../workflow/code-review/types.js';
import type { LLMProvider } from '../../../../shared/types.js';

const MIN = 60_000;
const EPIC = 'e1a2b3c4d5e6f7a8';
const STORY = 's8';
const CREATED = '2026-07-18T00:00:00.000Z';
const subject = (): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: EPIC, storyId: STORY, changedFiles: ['src/a.ts'],
	approvedLld:  { meta: { epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
});
const grounding: CodeReviewGrounding = { symbols: [{ entityId: 'sym:src/a.ts#f', file: 'src/a.ts', kind: 'function', name: 'f', signature: 'f(): void', callers: [], callees: [], testsReaching: [] }] };

/** A fake clock: timers fire when `advance` passes them. */
function fakeClock() {
	let now = 0;
	let seq = 0;
	const timers = new Map<number, { at: number; fn: () => void }>();
	return {
		now: () => now,
		setTimer: (fn: () => void, ms: number) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
		clearTimer: (h: unknown) => { timers.delete(h as number); },
		advance(ms: number): void {
			const until = now + ms;
			for (;;) {
				const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
				if (due === undefined) break;
				timers.delete(due[0]);
				now = due[1].at;
				due[1].fn();
			}
			now = until;
		},
	};
}

/**
 * Run the step against the real chain. Each judge makes `calls` review calls;
 * the model takes `callMs` of the clock per call. Returns the step's answer and
 * the record paths the daemon wrote.
 */
async function review(calls: number, callMs: number): Promise<{ out: CodeReviewStepOutput; written: string[]; elapsedMs: number; frames: number }> {
	await _clearCodeReviewStateStoreForTests();
	const clock = fakeClock();
	const written: string[] = [];
	let frames = 0;
	// The model: a call takes callMs, then answers; a cancelled run's call fails as the driver's does.
	const provider = {
		completeStructured: async (_m: unknown, _s: unknown, opts?: { signal?: AbortSignal }) => {
			clock.advance(callMs);
			if (opts?.signal?.aborted) throw new Error('aborted');
			return {};
		},
	} as unknown as LLMProvider;
	const judge = (dimension: ReviewDimension): JudgeSlot => ({
		dimension,
		judge: async (_s, _g, p, ctx) => {
			for (let i = 0; i < calls; i++) {
				ctx?.onCall?.({ stage: 'judge', role: 'reviewer' });
				await p.completeStructured([], {} as never, ctx?.signal !== undefined ? { signal: ctx.signal } : {});
			}
			return { dimension, findings: [] };
		},
	});
	const judges = (['adherence', 'conventions', 'coverage', 'quality'] as const).map(judge);

	installStepDaemonClient(createInDaemonClient({}, {
		'codeReview.run': (params, send, signal) => codeReviewRunStart(params, send, signal, {
   captureInput: () => undefined,
			resolveSubject: async () => ({ ok: true, subject: subject() }),
			resolveProvider: () => ({ provider, modelLabel: 'stub' }),
			runReview: (s, p, opts) => runCodeReview(s, p, opts, { judges, assembleGrounding: async () => grounding, write: (path) => { written.push(path); } }),
		}),
	}, { setTimer: clock.setTimer, clearTimer: clock.clearTimer }));
	try {
		const deps: CodeReviewStepDeps = {
			resolveSubject: async () => ({ ok: true, subject: subject() }),
			fetchGrounding: async () => ({ ok: true, grounding }),
			fetchFreshness: async () => ({ ok: true, isProcessing: false, inFlight: false, pendingCodeIndexJobs: 0, staleFiles: [] }),
			assembleDiffGrounding: async () => { throw new Error('not used'); },
			runReview: runCodeReview,
			write: () => { throw new Error('the step writes no record'); },
			sleep: async () => {},
			now: clock.now,
			freshnessTimeoutMs: () => 120000,
			readBuildAuthor: () => 'controller',
			waitLimits: () => codeReviewWaitLimits({}),
			progress: () => { frames += 1; },
		};
		const env = await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps);
		return { out: JSON.parse(env.content[0]!.text) as CodeReviewStepOutput, written, elapsedMs: clock.now(), frames };
	} finally {
		installStepDaemonClient(undefined);
	}
}

test('a daemon code review reporting a call every minute runs past 30 minutes and writes its record; one quiet past the idle limit fails with the idle cause and writes none', async () => {
	// 4 dimensions x 10 calls, one a minute: 40 minutes of review, under the 4 hour ceiling.
	const long = await review(10, MIN);
	assert.ok(long.out.next === 'done', JSON.stringify(long.out));
	assert.ok(long.elapsedMs >= 40 * MIN, `ran ${long.elapsedMs / MIN} minutes`);
	assert.equal(long.out.reviewedBy, 'daemon');
	assert.equal(long.written.filter(p => p.endsWith(`CR-${EPIC}-${STORY}.json`)).length, 1, 'the record was written');
	assert.ok(long.frames >= 40, `every call reached the step's progress (${long.frames} frames)`);

	// One call that takes 25 minutes: no progress for longer than the 20 minute idle limit.
	const quiet = await review(1, 25 * MIN);
	assert.ok(quiet.out.next === 'error', JSON.stringify(quiet.out));
	assert.equal(quiet.out.error.code, 'daemon-review-timeout');
	assert.match(quiet.out.error.message, /no progress from the daemon for 20 minutes \(the idle limit, codeReview\.daemonReviewIdleMs\)/);
	assert.match(quiet.out.error.message, /not replaced by a controller review/);
	assert.deepEqual(quiet.written, [], 'no record');
});
