/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t4: the three kubectl sites (logs follow, exec, port-forward) give the same
 * progress frames, byte counts, exit mapping and result text as before the move onto the shared lifecycle.
 * Run: npx tsx --test src/daemon/tools/builtins/k8s/__tests__/k8s-spawn-parity.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { installStandInBin, messages, toolDeps, withEmptyPath } from '../../../__tests__/_bin.js';
import type { StandInBin } from '../../../__tests__/_bin.js';
import { k8sExecTool, k8sLogsTool, k8sPortForwardTool } from '../index.js';

let bin: StandInBin | undefined;
let restorePath: (() => void) | undefined;
afterEach(() => { bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; restorePath?.(); restorePath = undefined; });

test('k8s-spawn-parity.test.ts: logs follow streams stdout and stderr as progress frames and reports the streamed bytes', async () => {
	bin = installStandInBin('kubectl', 'echo line1; echo err 1>&2');
	const frames: unknown[] = [];
	const r = await k8sLogsTool.execute({ pod: 'pod1', follow: true }, toolDeps(frames));
	assert.equal(r.success, true);
	assert.deepEqual(messages(frames).sort(), ['[stderr] err\n', 'line1\n']);
	assert.match(r.output, /^Log follow ended after \d+ ms\.\nStreamed 6 B from `pod1`\.\n\n\*\*stderr tail\*\*\n```\nerr\n```$/);
	const d = r.data as { exitCode: number; follow: boolean; bytes: number; timedOut: boolean };
	assert.equal(d.exitCode, 0); assert.equal(d.follow, true); assert.equal(d.bytes, 6); assert.equal(d.timedOut, false);
});

test('k8s-spawn-parity.test.ts: logs follow with a non-zero exit is a failed result with exit N', async () => {
	bin = installStandInBin('kubectl', 'exit 2');
	const r = await k8sLogsTool.execute({ pod: 'pod1', follow: true }, toolDeps([]));
	assert.equal(r.success, false);
	assert.equal(r.error, 'exit 2');
});

test('k8s-spawn-parity.test.ts: logs follow reports its runtime cap as success with runtime cap in the text', async () => {
	bin = installStandInBin('kubectl', 'exec sleep 30');
	const r = await k8sLogsTool.execute({ pod: 'pod1', follow: true, maxRuntimeMs: 250 }, toolDeps([]));
	assert.equal(r.success, true);
	assert.match(r.output, /^Log follow ended \(runtime cap hit\) after \d+ ms\./);
	assert.equal((r.data as { timedOut: boolean }).timedOut, true);
});

test('k8s-spawn-parity.test.ts: logs follow aborted by the caller ends as a failed exit null result', async () => {
	bin = installStandInBin('kubectl', 'exec sleep 30');
	const c = new AbortController();
	setTimeout(() => c.abort(), 150);
	const r = await k8sLogsTool.execute({ pod: 'pod1', follow: true }, toolDeps([], c.signal));
	assert.equal(r.success, false);
	assert.equal(r.error, 'exit null');
	assert.equal((r.data as { timedOut: boolean }).timedOut, false);
});

test('k8s-spawn-parity.test.ts: exec writes stdin, returns stdout and stderr in the usual text', async () => {
	bin = installStandInBin('kubectl', 'cat; echo oops 1>&2');
	const r = await k8sExecTool.execute({ pod: 'pod1', command: ['echo', 'x'], stdin: 'hello' }, toolDeps([]));
	assert.equal(r.success, true);
	assert.match(r.output, /^Exec ok in \d+ ms on `pod1`\.\n\n\*\*stdout\*\*\n```\nhello\n```\n\n\*\*stderr\*\*\n```\noops\n```$/);
	assert.equal((r.data as { stdout: string }).stdout, 'hello');
});

test('k8s-spawn-parity.test.ts: exec with a non-zero exit and with a time-out keep their wording', async () => {
	bin = installStandInBin('kubectl', 'exit 5');
	const failed = await k8sExecTool.execute({ pod: 'pod1', command: ['x'] }, toolDeps([]));
	assert.equal(failed.success, false);
	assert.equal(failed.error, 'exit 5');
	assert.match(failed.output, /^\*\*Exec failed\*\* \(exit 5\) on `pod1`\./);
	bin.restore(); cleanup(bin.dir);
	bin = installStandInBin('kubectl', 'exec sleep 30');
	const slow = await k8sExecTool.execute({ pod: 'pod1', command: ['x'], timeoutMs: 250 }, toolDeps([]));
	assert.equal(slow.success, false);
	assert.match(slow.output, /^\*\*Exec failed\*\* \(exit null, timed out\) on `pod1`\./);
	assert.equal((slow.data as { timedOut: boolean }).timedOut, true);
});

test('k8s-spawn-parity.test.ts: port-forward streams kubectl output and reports its end, cap and failure', async () => {
	bin = installStandInBin('kubectl', 'echo Forwarding; echo warn 1>&2');
	const frames: unknown[] = [];
	const r = await k8sPortForwardTool.execute({ resource: 'pod/foo', mappings: ['8080:80'] }, toolDeps(frames));
	assert.equal(r.success, true);
	assert.deepEqual(messages(frames).sort(), ['Forwarding\n', '[stderr] warn\n']);
	assert.match(r.output, /^Port-forward ended after \d+ ms\.\nResource: `pod\/foo`; mappings: 8080:80\.$/);
	bin.restore(); cleanup(bin.dir);
	bin = installStandInBin('kubectl', 'exec sleep 30');
	const capped = await k8sPortForwardTool.execute({ resource: 'pod/foo', mappings: ['8080:80'], maxRuntimeMs: 250 }, toolDeps([]));
	assert.equal(capped.success, true);
	assert.match(capped.output, /^Port-forward ended \(runtime cap\) after/);
	bin.restore(); cleanup(bin.dir);
	bin = installStandInBin('kubectl', 'exit 3');
	const bad = await k8sPortForwardTool.execute({ resource: 'pod/foo', mappings: ['8080:80'] }, toolDeps([]));
	assert.equal(bad.success, false);
	assert.equal(bad.error, 'exit 3');
});

test('k8s-spawn-parity.test.ts: a missing kubectl gives the spawn failed text at each site', async () => {
	restorePath = withEmptyPath();
	const a = await k8sLogsTool.execute({ pod: 'p', follow: true }, toolDeps([]));
	const b = await k8sExecTool.execute({ pod: 'p', command: ['x'] }, toolDeps([]));
	const c = await k8sPortForwardTool.execute({ resource: 'pod/p', mappings: ['1:2'] }, toolDeps([]));
	for (const r of [a, b, c]) { assert.equal(r.success, false); assert.match(r.output, /spawn failed/); }
});
