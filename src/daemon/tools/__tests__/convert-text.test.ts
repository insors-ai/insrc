/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s2/t5: convertText with fake providers injected through deps.conversion.
 * Run: npx tsx --test src/daemon/tools/__tests__/convert-text.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Type, type Static } from '@sinclair/typebox';

import { _setAttemptDeadlineForTests, convertText } from '../convert-text.js';
import type { ConversionProviders, ToolDeps } from '../types.js';

const Schema = Type.Object({ id: Type.String(), n: Type.Number() }, { additionalProperties: false });
type Value = Static<typeof Schema>;
const RAW = 'item abc-1 has 7 entries';
const GOOD: Value = { id: 'abc-1', n: 7 };
const keyValues = (v: Value): string[] => [v.id, String(v.n)];
const req = (rawText = RAW) => ({ toolId: 'fake_text', rawText, schema: Schema, keyValues });

interface Call { role: string; messages: Array<{ role: string; content: unknown }>; signal: AbortSignal | undefined }
type Answer = unknown | Error | ((call: Call) => Promise<unknown>);

/** Scripted providers: answers[role] is consumed one per call; the last repeats. */
function harness(answers: { cheap?: Answer[]; escalate?: Answer[] }) {
	const calls: Call[] = [];
	const queues: Record<string, Answer[]> = { 'tools.convert': [...(answers.cheap ?? [])], 'tools.convert.escalate': [...(answers.escalate ?? [])] };
	const last: Record<string, Answer> = {};
	const conversion: ConversionProviders = {
		resolveProvider: role => ({
			async completeStructured(messages: never, _schema: never, opts: { signal?: AbortSignal }) {
				const call: Call = { role, messages: messages as never, signal: opts.signal };
				calls.push(call);
				const q = queues[role]!;
				const a = q.length > 0 ? q.shift()! : last[role];
				last[role] = a as Answer;
				if (typeof a === 'function') return (a as (c: Call) => Promise<unknown>)(call);
				if (a instanceof Error) throw a;
				return a;
			},
		}) as never,
	};
	const deps = (extra: Partial<ToolDeps> = {}): ToolDeps => ({ sessionId: 's', repoPath: '/tmp', send: () => {}, requestId: 1, conversion, ...extra });
	return { calls, deps };
}

const roles = (calls: Call[]): string => calls.map(c => (c.role === 'tools.convert' ? 'c' : 'e')).join('');

test('convert-text.test.ts: a first-attempt valid value on the cheap tier returns ok with tier cheap and no escalation', async () => {
	const h = harness({ cheap: [GOOD] });
	const r = await convertText(req(), h.deps());
	assert.deepEqual(r, { ok: true, value: GOOD, tier: 'cheap' });
	assert.equal(roles(h.calls), 'c');
});

test('convert-text.test.ts: an invalid first attempt is retried with the ajv errors appended', async () => {
	const h = harness({ cheap: [{ id: 5, n: 7 }, GOOD] });
	const r = await convertText(req(), h.deps());
	assert.equal(r.ok, true);
	assert.equal(h.calls.length, 2);
	assert.equal(h.calls[0]!.messages.length, 1);
	assert.equal(h.calls[1]!.messages.length, 2);
	assert.match(String(h.calls[1]!.messages[1]!.content), /\/id/);
});

test('convert-text.test.ts: two failed cheap attempts escalate once, and two failed escalated attempts return retries-exhausted', async () => {
	const bad = { id: 5 };
	const h = harness({ cheap: [bad], escalate: [bad] });
	const r = await convertText(req(), h.deps());
	assert.equal(r.ok, false);
	assert.equal(!r.ok && r.failure.kind, 'retries-exhausted');
	assert.equal(roles(h.calls), 'ccee');

	const ok = harness({ cheap: [bad], escalate: [GOOD] });
	const r2 = await convertText(req(), ok.deps());
	assert.deepEqual(r2, { ok: true, value: GOOD, tier: 'escalated' });
	assert.equal(roles(ok.calls), 'cce');
});

test('convert-text.test.ts: the fake provider sees exactly 2 calls on the cheap role then 2 on the escalate role when every attempt fails, and exactly 1 call on first-attempt success', async () => {
	const fail = harness({ cheap: [new Error('bad'), { id: 1 }], escalate: [{ n: 'x' }] });
	await convertText(req(), fail.deps());
	assert.equal(roles(fail.calls), 'ccee');
	for (const c of fail.calls) assert.ok(c.signal !== undefined);

	const win = harness({ cheap: [GOOD] });
	await convertText(req(), win.deps());
	assert.equal(win.calls.length, 1);
});

test('convert-text.test.ts: a value that fits the schema but has a key value missing from the raw text fails with value-not-in-text and retries', async () => {
	const invented = { id: 'zzz-9', n: 7 };
	const h = harness({ cheap: [invented, GOOD] });
	const r = await convertText(req(), h.deps());
	assert.equal(r.ok, true);
	assert.match(String(h.calls[1]!.messages[1]!.content), /zzz-9/);

	const never = harness({ cheap: [invented], escalate: [invented] });
	const r2 = await convertText(req(), never.deps());
	assert.equal(r2.ok, false);
	assert.match(!r2.ok ? r2.failure.detail : '', /value-not-in-text/);
	assert.match(!r2.ok ? r2.failure.detail : '', /zzz-9/);
});

test('convert-text.test.ts: two concurrent calls reach the fake provider one after another, in arrival order', async () => {
	const events: string[] = [];
	const slow = (tag: string): Answer => async () => { events.push(`start ${tag}`); await new Promise(r => setTimeout(r, 25)); events.push(`end ${tag}`); return GOOD; };
	const a = harness({ cheap: [slow('A')] });
	const b = harness({ cheap: [slow('B')] });
	const [ra, rb] = await Promise.all([convertText(req(), a.deps()), convertText(req(), b.deps())]);
	assert.equal(ra.ok && rb.ok, true);
	assert.deepEqual(events, ['start A', 'end A', 'start B', 'end B']);
});

test("convert-text.test.ts: a ToolDeps with no conversion field returns 'no conversion provider configured' without a model call", async () => {
	const h = harness({ cheap: [GOOD] });
	const d = h.deps(); delete d.conversion;
	const r = await convertText(req(), d);
	assert.deepEqual(r, { ok: false, failure: { kind: 'retries-exhausted', detail: 'no conversion provider configured' } });
	assert.equal(h.calls.length, 0);
});

test('convert-text.test.ts: a provider that rejects on every attempt returns retries-exhausted naming the role, with no fallback', async () => {
	const h = harness({ cheap: [new Error('boom')], escalate: [new Error('boom')] });
	const r = await convertText(req(), h.deps());
	assert.equal(roles(h.calls), 'ccee');
	assert.equal(r.ok, false);
	const failure = !r.ok ? r.failure : undefined;
	assert.equal(failure?.kind, 'retries-exhausted');
	assert.match(failure!.detail, /tools\.convert\.escalate/);
	assert.match(failure!.detail, /boom/);
});

test('convert-text.test.ts: a hung provider call times out as an ordinary error, is retried, and releases the queue slot', async () => {
	_setAttemptDeadlineForTests(40);
	try {
		const hang: Answer = () => new Promise(() => { /* never settles */ });
		const h = harness({ cheap: [hang, GOOD] });
		const r = await convertText(req(), h.deps());
		assert.equal(r.ok, true, 'the timeout was retried, not treated as a cancellation');
		assert.equal(roles(h.calls), 'cc');
		assert.equal(h.calls[0]!.signal?.aborted, true, 'the hung call was aborted');

		const next = harness({ cheap: [GOOD] });
		assert.equal((await convertText(req(), next.deps())).ok, true, 'the slot was released');
	} finally {
		_setAttemptDeadlineForTests(120_000);
	}
});

test("convert-text.test.ts: an aborted deps.signal drops a queued conversion without calling a provider and ends a running one as 'cancelled'", async () => {
	// Queued: B waits behind A and is aborted before it is granted the slot.
	const a = harness({ cheap: [async () => { await new Promise(r => setTimeout(r, 30)); return GOOD; }] });
	const b = harness({ cheap: [GOOD] });
	const controller = new AbortController();
	const pa = convertText(req(), a.deps());
	const pb = convertText(req(), b.deps({ signal: controller.signal }));
	controller.abort();
	const rb = await pb;
	assert.equal((await pa).ok, true);
	assert.deepEqual(rb, { ok: false, failure: { kind: 'retries-exhausted', detail: 'cancelled' } });
	assert.equal(b.calls.length, 0);

	// Running: the provider is waiting when the caller cancels; no retry follows.
	const running = new AbortController();
	const c = harness({ cheap: [(call: Call) => new Promise((_res, rej) => call.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))] });
	const pc = convertText(req(), c.deps({ signal: running.signal }));
	setTimeout(() => running.abort(), 20);
	const rc = await pc;
	assert.deepEqual(rc, { ok: false, failure: { kind: 'retries-exhausted', detail: 'cancelled' } });
	assert.equal(c.calls.length, 1);
});

test("convert-text.test.ts: an InputTooLargeError from the provider returns retries-exhausted with 'input too large' and is not resent", async () => {
	const big = Object.assign(new Error('too big'), { name: 'InputTooLargeError' });
	const h = harness({ cheap: [big] });
	const r = await convertText(req(), h.deps());
	assert.deepEqual(r, { ok: false, failure: { kind: 'retries-exhausted', detail: 'input too large' } });
	assert.equal(h.calls.length, 1);
});
