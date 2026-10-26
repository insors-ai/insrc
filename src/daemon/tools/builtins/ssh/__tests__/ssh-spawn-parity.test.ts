/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t4: the two ssh sites (exec-detached, port-forward) give the same progress
 * frames, byte counts, exit mapping and result text as before the move onto the shared lifecycle.
 * Run: npx tsx --test src/daemon/tools/builtins/ssh/__tests__/ssh-spawn-parity.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { installStandInBin, messages, toolDeps, withEmptyPath } from '../../../__tests__/_bin.js';
import type { StandInBin } from '../../../__tests__/_bin.js';
import { sshExecDetachedTool, sshPortForwardTool } from '../index.js';

let bin: StandInBin | undefined;
let restorePath: (() => void) | undefined;
afterEach(() => { bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; restorePath?.(); restorePath = undefined; });

test('ssh-spawn-parity.test.ts: exec-detached streams stdout and stderr as progress frames and reports byte counts', async () => {
	bin = installStandInBin('ssh', 'echo out; echo err 1>&2');
	const frames: unknown[] = [];
	const r = await sshExecDetachedTool.execute({ host: 'box', command: 'x' }, toolDeps(frames));
	assert.equal(r.success, true);
	assert.deepEqual(messages(frames).sort(), ['[stderr] err\n', 'out\n']);
	assert.match(r.output, /^Exit 0 after \d+ ms on \*\*box\*\*\.\nStreamed: 4 B stdout, 4 B stderr\.$/);
	const d = r.data as { exitCode: number; stdoutBytes: number; stderrBytes: number; timedOut: boolean };
	assert.equal(d.exitCode, 0); assert.equal(d.stdoutBytes, 4); assert.equal(d.stderrBytes, 4); assert.equal(d.timedOut, false);
});

test('ssh-spawn-parity.test.ts: exec-detached non-zero exit, runtime cap and abort keep their wording', async () => {
	bin = installStandInBin('ssh', 'exit 4');
	const bad = await sshExecDetachedTool.execute({ host: 'box', command: 'x' }, toolDeps([]));
	assert.equal(bad.success, false); assert.equal(bad.error, 'exit 4');
	assert.match(bad.output, /^Process ended with code 4 after \d+ ms on \*\*box\*\*\./);
	bin.restore(); cleanup(bin.dir);
	bin = installStandInBin('ssh', 'exec sleep 30');
	const capped = await sshExecDetachedTool.execute({ host: 'box', command: 'x', maxRuntimeMs: 250 }, toolDeps([]));
	assert.equal(capped.success, false); assert.equal(capped.error, 'runtime cap exceeded');
	assert.match(capped.output, /^Process ended \(timed out\) with code null after \d+ ms on \*\*box\*\*\./);
	const c = new AbortController();
	setTimeout(() => c.abort(), 150);
	const aborted = await sshExecDetachedTool.execute({ host: 'box', command: 'x' }, toolDeps([], c.signal));
	assert.equal(aborted.success, false); assert.equal(aborted.error, 'exit null');
});

test('ssh-spawn-parity.test.ts: port-forward announces the tunnel, reports a clean close, a failing exit and its cap', async () => {
	bin = installStandInBin('ssh', 'echo warn 1>&2');
	const frames: unknown[] = [];
	const ok = await sshPortForwardTool.execute({ host: 'box', localPort: 8080, remoteHost: 'db', remotePort: 5432 }, toolDeps(frames));
	assert.equal(ok.success, true);
	assert.equal(messages(frames)[0], 'Tunnel open: local 8080 -> db:5432 via box');
	assert.match(ok.output, /^Tunnel closed cleanly after \d+s\.\n\n```\nwarn\n```$/);
	bin.restore(); cleanup(bin.dir);
	bin = installStandInBin('ssh', 'exit 7');
	const bad = await sshPortForwardTool.execute({ host: 'box', localPort: 8080, remoteHost: 'db', remotePort: 5432 }, toolDeps([]));
	assert.equal(bad.success, false); assert.equal(bad.error, 'exit 7');
	assert.match(bad.output, /^Tunnel exited code 7 after \d+s\./);
	bin.restore(); cleanup(bin.dir);
	bin = installStandInBin('ssh', 'exec sleep 30');
	const capped = await sshPortForwardTool.execute({ host: 'box', localPort: 8080, remoteHost: 'db', remotePort: 5432, maxRuntimeMs: 250 }, toolDeps([]));
	assert.equal(capped.success, true);
	assert.match(capped.output, /^Tunnel timed out \(cap 0s\) after 0s\./);
});

test('ssh-spawn-parity.test.ts: a missing ssh gives the spawn failed text at both sites', async () => {
	restorePath = withEmptyPath();
	const a = await sshExecDetachedTool.execute({ host: 'box', command: 'x' }, toolDeps([]));
	const b = await sshPortForwardTool.execute({ host: 'box', localPort: 1, remoteHost: 'h', remotePort: 2 }, toolDeps([]));
	for (const r of [a, b]) { assert.equal(r.success, false); assert.match(r.output, /spawn failed/); }
});
