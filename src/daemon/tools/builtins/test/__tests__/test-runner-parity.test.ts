/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t4: test_watch gives the same progress frames, byte counts, exit mapping and
 * result text as before the move onto the shared lifecycle.
 * Run: npx tsx --test src/daemon/tools/builtins/test/__tests__/test-runner-parity.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { messages, toolDeps, withEmptyPath } from '../../../__tests__/_bin.js';
import { testWatchTool } from '../index.js';

test('test-runner-parity.test.ts: test_watch streams stdout and stderr as progress frames and reports byte counts and the framework', async () => {
	const frames: unknown[] = [];
	const r = await testWatchTool.execute({ argv: ['sh', '-c', 'echo pass; echo warn 1>&2'], framework: 'jest' }, toolDeps(frames));
	assert.equal(r.success, true);
	assert.deepEqual(messages(frames).sort(), ['[stderr] warn\n', 'pass\n']);
	assert.match(r.output, /^Watch ended after \d+ ms\.\nStreamed: 5 B stdout, 5 B stderr \(jest\)\.$/);
	const d = r.data as { framework: string; exitCode: number; stdoutBytes: number; stderrBytes: number; timedOut: boolean };
	assert.equal(d.framework, 'jest'); assert.equal(d.exitCode, 0); assert.equal(d.stdoutBytes, 5); assert.equal(d.stderrBytes, 5); assert.equal(d.timedOut, false);
});

test('test-runner-parity.test.ts: test_watch with a non-zero exit, a runtime cap and an abort keeps its wording', async () => {
	const bad = await testWatchTool.execute({ argv: ['sh', '-c', 'exit 2'] }, toolDeps([]));
	assert.equal(bad.success, false); assert.equal(bad.error, 'exit 2');
	assert.match(bad.output, /^Watch ended after/);
	const capped = await testWatchTool.execute({ argv: ['sleep', '30'], maxRuntimeMs: 250 }, toolDeps([]));
	assert.equal(capped.success, true);
	assert.match(capped.output, /^Watch ended \(runtime cap hit\) after \d+ ms\./);
	assert.equal((capped.data as { timedOut: boolean }).timedOut, true);
	const c = new AbortController();
	setTimeout(() => c.abort(), 150);
	const aborted = await testWatchTool.execute({ argv: ['sleep', '30'] }, toolDeps([], c.signal));
	assert.equal(aborted.success, false); assert.equal(aborted.error, 'exit null');
});

test('test-runner-parity.test.ts: test_watch with a missing command gives the spawn failed text', async () => {
	const r = await testWatchTool.execute({ argv: ['definitely-not-a-command-xyz'] }, toolDeps([]));
	assert.equal(r.success, false);
	assert.match(r.output, /spawn failed/);
	void withEmptyPath;
});
