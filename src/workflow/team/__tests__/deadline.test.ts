/**
 * Story s9, task t4: the refresh Deadline carries an AbortSignal and a dispose().
 * Run: npx tsx --test-force-exit src/workflow/team/__tests__/deadline.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDeadline as viaGitAsync } from '../git-async.js';
import { createDeadline, REFRESH_DEADLINE_MS } from '../sighting-store.js';

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

test('deadline.test.ts: createDeadline aborts its signal at the budget and dispose clears the timer', async () => {
	assert.equal(viaGitAsync, createDeadline, 'git-async re-exports the one createDeadline');

	// the default budget is the 10 second refresh budget, and remainingMs counts down to 0
	const dflt = createDeadline();
	assert.ok(dflt.remainingMs() <= REFRESH_DEADLINE_MS && dflt.remainingMs() > REFRESH_DEADLINE_MS - 1_000);
	assert.equal(dflt.signal.aborted, false);
	dflt.dispose();

	// the signal aborts when the budget is spent, and remainingMs is 0 then
	const d = createDeadline(40);
	assert.equal(d.signal.aborted, false);
	await new Promise<void>(resolve => d.signal.addEventListener('abort', () => resolve(), { once: true }));
	assert.equal(d.signal.aborted, true);
	assert.equal(d.remainingMs(), 0);

	// dispose clears the timer: a disposed deadline never aborts, and calling it twice is harmless
	const kept = createDeadline(30);
	kept.dispose();
	kept.dispose();
	await sleep(80);
	assert.equal(kept.signal.aborted, false, 'a disposed deadline does not abort');

	// an injected clock still drives remainingMs
	let t = 1_000;
	const clocked = createDeadline(500, () => t);
	assert.equal(clocked.remainingMs(), 500);
	t = 1_300;
	assert.equal(clocked.remainingMs(), 200);
	t = 9_999;
	assert.equal(clocked.remainingMs(), 0);
	clocked.dispose();
});
