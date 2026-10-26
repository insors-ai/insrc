/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t4: shell:exec-detached produces the same progress frames, byte counts,
 * exit mapping and result text as before the move onto the shared lifecycle.
 * Run: npx tsx --test src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import type { ToolDeps } from '../../../types.js';
import { shellExecDetachedTool } from '../exec-detached.js';

function deps(frames: unknown[], signal?: AbortSignal): ToolDeps {
	return { sessionId: 's', repoPath: '/tmp', requestId: 7, send: (f: unknown) => { frames.push(f); }, ...(signal ? { signal } : {}) } as ToolDeps;
}
const messages = (frames: unknown[]): string[] => frames.map(f => (f as { data: { message: string } }).data.message);

test('exec-detached-parity.test.ts: an argv run streams its stdout and stderr as progress frames and reports its byte counts and exit 0', async () => {
	const frames: unknown[] = [];
	const r = await shellExecDetachedTool.execute({ argv: ['sh', '-c', 'echo one; echo two 1>&2'], cwd: '/tmp' }, deps(frames));
	assert.equal(r.success, true);
	assert.deepEqual(messages(frames).sort(), ['[stderr] two\n', 'one\n']);
	assert.equal((frames[0] as { stream: string; id: number }).stream, 'progress');
	assert.equal((frames[0] as { id: number }).id, 7);
	const d = r.data as { exitCode: number; timedOut: boolean; stdoutBytes: number; stderrBytes: number };
	assert.equal(d.exitCode, 0); assert.equal(d.timedOut, false); assert.equal(d.stdoutBytes, 4); assert.equal(d.stderrBytes, 4);
	assert.match(r.output, /^Process exited 0 after \d+ ms\.\nOutput: 4 B stdout, 4 B stderr \(streamed live\)\.$/);
});

test('exec-detached-parity.test.ts: the command form runs through bash -c and a non-zero exit maps to a failed result with exit N', async () => {
	const frames: unknown[] = [];
	const r = await shellExecDetachedTool.execute({ command: 'echo hi; exit 3' }, deps(frames));
	assert.equal(r.success, false);
	assert.equal(r.error, 'exit 3');
	assert.deepEqual(messages(frames), ['hi\n']);
	assert.match(r.output, /^Process ended with code 3 after \d+ ms\./);
	assert.equal((r.data as { exitCode: number }).exitCode, 3);
});

test('exec-detached-parity.test.ts: a spawn error gives the spawn failed text', async () => {
	const r = await shellExecDetachedTool.execute({ argv: ['definitely-not-a-command-xyz'] }, deps([]));
	assert.equal(r.success, false);
	assert.equal(r.error, 'spawn error');
	assert.match(r.output, /^\[shell:exec-detached\] spawn failed -- /);
});

test('exec-detached-parity.test.ts: empty argv and command is refused as before', async () => {
	const r = await shellExecDetachedTool.execute({}, deps([]));
	assert.equal(r.success, false);
	assert.equal(r.output, '[shell:exec-detached] empty argv and command');
	assert.equal(r.error, 'empty');
});

test('exec-detached-parity.test.ts: the runtime cap reports timed out with the runtime cap exceeded error', async () => {
	const r = await shellExecDetachedTool.execute({ argv: ['sleep', '30'], maxRuntimeMs: 200 }, deps([]));
	assert.equal(r.success, false);
	assert.equal(r.error, 'runtime cap exceeded');
	assert.equal((r.data as { timedOut: boolean }).timedOut, true);
	assert.match(r.output, /^Process ended \(timed out\) with code null after \d+ ms\./);
});

test('exec-detached-parity.test.ts: an abort ends the process with code null and the usual ended text', async () => {
	const c = new AbortController();
	setTimeout(() => c.abort(), 150);
	const r = await shellExecDetachedTool.execute({ argv: ['sleep', '30'] }, deps([], c.signal));
	assert.equal(r.success, false);
	assert.equal(r.error, 'exit null');
	assert.match(r.output, /^Process ended with code null after \d+ ms\./);
	assert.equal((r.data as { timedOut: boolean }).timedOut, false);
});
