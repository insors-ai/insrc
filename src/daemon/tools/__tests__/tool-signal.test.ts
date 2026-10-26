/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t1: the ambient tool signal.
 * Run: npx tsx --test src/daemon/tools/__tests__/tool-signal.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { currentToolSignal, effectiveToolSignal, runWithToolSignal, runWithoutToolSignal } from '../tool-signal.js';

const tick = (): Promise<void> => new Promise(r => setImmediate(r));

test('tool-signal.test.ts: outside any context currentToolSignal is undefined and nothing is stored', () => {
	assert.equal(currentToolSignal(), undefined);
	assert.equal(runWithToolSignal(undefined, () => currentToolSignal()), undefined);
	assert.equal(effectiveToolSignal(undefined), undefined);
});

test('tool-signal.test.ts: inside runWithToolSignal the signal aborts with the call, also after an await and inside a started promise', async () => {
	const c = new AbortController();
	await runWithToolSignal(c.signal, async () => {
		const before = currentToolSignal();
		assert.equal(before, c.signal);
		await tick();
		assert.equal(currentToolSignal(), c.signal);
		const inner = (async () => { await tick(); return currentToolSignal(); })();
		c.abort();
		assert.equal((await inner)?.aborted, true);
	});
	assert.equal(currentToolSignal(), undefined, 'the context ends with the call');
});

test('tool-signal.test.ts: effectiveToolSignal combines the argument with the context signal and returns either alone', () => {
	const own = new AbortController(); const outer = new AbortController();
	assert.equal(effectiveToolSignal(own.signal), own.signal);
	runWithToolSignal(outer.signal, () => {
		assert.equal(effectiveToolSignal(undefined), outer.signal);
		const both = effectiveToolSignal(own.signal)!;
		assert.notEqual(both, own.signal); assert.notEqual(both, outer.signal);
		assert.equal(both.aborted, false);
		own.abort();
		assert.equal(both.aborted, true);
	});
});

test('tool-signal.test.ts: a nested runWithToolSignal aborts when either aborts, and one with undefined keeps the outer signal', () => {
	const outer = new AbortController(); const inner = new AbortController();
	runWithToolSignal(outer.signal, () => {
		runWithToolSignal(inner.signal, () => {
			const s = currentToolSignal()!;
			assert.equal(s.aborted, false);
			outer.abort();
			assert.equal(s.aborted, true);
		});
		runWithToolSignal(undefined, () => assert.equal(currentToolSignal(), outer.signal));
	});
	const o2 = new AbortController(); const i2 = new AbortController();
	runWithToolSignal(o2.signal, () => runWithToolSignal(i2.signal, () => {
		const s = currentToolSignal()!;
		i2.abort();
		assert.equal(s.aborted, true);
		assert.equal(o2.signal.aborted, false);
	}));
});

test('tool-signal.test.ts: runWithoutToolSignal clears the context inside it and after an await, and leaves the outer context intact', async () => {
	const outer = new AbortController();
	await runWithToolSignal(outer.signal, async () => {
		await runWithoutToolSignal(async () => {
			assert.equal(currentToolSignal(), undefined);
			await tick();
			assert.equal(currentToolSignal(), undefined);
		});
		assert.equal(currentToolSignal(), outer.signal);
		// runWithToolSignal(undefined) does NOT clear
		runWithToolSignal(undefined, () => assert.equal(currentToolSignal(), outer.signal));
	});
});

test('tool-signal.test.ts: two concurrent calls with different signals do not see each other', async () => {
	const a = new AbortController(); const b = new AbortController();
	const seen: Array<AbortSignal | undefined> = [];
	await Promise.all([
		runWithToolSignal(a.signal, async () => { await tick(); seen[0] = currentToolSignal(); }),
		runWithToolSignal(b.signal, async () => { await tick(); await tick(); seen[1] = currentToolSignal(); }),
	]);
	assert.equal(seen[0], a.signal);
	assert.equal(seen[1], b.signal);
});
