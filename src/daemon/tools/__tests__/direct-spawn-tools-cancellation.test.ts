/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t4: every tool that spawns its own process is cancelled and time-limited with its
 * whole process group, takes the no-spawn branch for an already-aborted signal, and delivers the progress it
 * sent before the abort.
 * Run: npx tsx --test src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { k8sExecTool, k8sLogsTool, k8sPortForwardTool } from '../builtins/k8s/index.js';
import { shellExecDetachedTool } from '../builtins/shell/exec-detached.js';
import { sshExecDetachedTool, sshPortForwardTool } from '../builtins/ssh/index.js';
import { testWatchTool } from '../builtins/test/index.js';
import { awsLogsTailTool } from '../builtins/cloud/aws/logs.js';
import type { Tool, ToolInput } from '../types.js';
import { installStandInBin, messages, toolDeps } from './_bin.js';
import type { StandInBin } from './_bin.js';
import { alive, cleanup, fileExists, readPid, tick, tmp, waitFor } from './_proc.js';

const BOUND_MS = 2000;
const SLACK_MS = 1500;

interface Site {
	name: string;
	tool: Tool;
	/** The stand-in binary the tool runs, or undefined when the tool runs the given argv or command itself. */
	bin?: string;
	/** The tool's input; script is the body that touches the marker, prints, forks a descendant and waits. */
	input(script: string, limitMs?: number): ToolInput;
	/** The text of the result of a time-out. */
	timedOut: RegExp;
	/** True when stdout of the process reaches the progress frames. */
	streamsStdout: boolean;
}

const site = (s: Site): Site => s;
const SITES: Site[] = [
	site({ name: 'shell:exec-detached (argv)', tool: shellExecDetachedTool, input: (sc, l) => ({ argv: ['sh', '-c', sc], ...(l ? { maxRuntimeMs: l } : {}) }), timedOut: /^Process ended \(timed out\) with code null/, streamsStdout: true }),
	site({ name: 'shell:exec-detached (bash -c command)', tool: shellExecDetachedTool, input: (sc, l) => ({ command: sc, ...(l ? { maxRuntimeMs: l } : {}) }), timedOut: /^Process ended \(timed out\) with code null/, streamsStdout: true }),
	site({ name: 'k8s logs follow', tool: k8sLogsTool, bin: 'kubectl', input: (_s, l) => ({ pod: 'p', follow: true, ...(l ? { maxRuntimeMs: l } : {}) }), timedOut: /^Log follow ended \(runtime cap hit\)/, streamsStdout: true }),
	site({ name: 'k8s exec', tool: k8sExecTool, bin: 'kubectl', input: (_s, l) => ({ pod: 'p', command: ['x'], ...(l ? { timeoutMs: l } : {}) }), timedOut: /^\*\*Exec failed\*\* \(exit null, timed out\)/, streamsStdout: false }),
	site({ name: 'k8s port-forward', tool: k8sPortForwardTool, bin: 'kubectl', input: (_s, l) => ({ resource: 'pod/p', mappings: ['1:2'], ...(l ? { maxRuntimeMs: l } : {}) }), timedOut: /^Port-forward ended \(runtime cap\)/, streamsStdout: true }),
	site({ name: 'test_watch', tool: testWatchTool, input: (sc, l) => ({ argv: ['sh', '-c', sc], ...(l ? { maxRuntimeMs: l } : {}) }), timedOut: /^Watch ended \(runtime cap hit\)/, streamsStdout: true }),
	site({ name: 'ssh exec-detached', tool: sshExecDetachedTool, bin: 'ssh', input: (_s, l) => ({ host: 'box', command: 'x', ...(l ? { maxRuntimeMs: l } : {}) }), timedOut: /^Process ended \(timed out\) with code null/, streamsStdout: true }),
	site({ name: 'ssh port-forward', tool: sshPortForwardTool, bin: 'ssh', input: (_s, l) => ({ host: 'box', localPort: 1, remoteHost: 'h', remotePort: 2, ...(l ? { maxRuntimeMs: l } : {}) }), timedOut: /^Tunnel timed out/, streamsStdout: false }),
	site({ name: 'aws logs tail follow', tool: awsLogsTailTool, bin: 'aws', input: (_s, l) => ({ logGroup: '/g', follow: true, ...(l ? { maxRuntimeMs: l } : {}) }), timedOut: /^Log follow ended \(runtime cap\)/, streamsStdout: true }),
];

let bin: StandInBin | undefined;
let dir: string | undefined;
afterEach(() => { bin?.restore(); if (bin) cleanup(bin.dir); bin = undefined; if (dir) cleanup(dir); dir = undefined; });

/** The process body: mark that it ran, say hello, leave a descendant in the group holding the pipes, wait. */
function body(marker: string, pidFile: string): string {
	return `touch '${marker}'; echo hello; echo hello 1>&2; sleep 30 & echo \$! > '${pidFile}'; wait`;
}
function prepare(s: Site): { script: string; marker: string; pidFile: string } {
	dir = tmp();
	const marker = join(dir, 'marker');
	const pidFile = join(dir, 'pid');
	const script = body(marker, pidFile);
	if (s.bin !== undefined) bin = installStandInBin(s.bin, script);
	return { script, marker, pidFile };
}
async function pidOf(file: string): Promise<number> {
	await waitFor(() => { try { return readPid(file) > 0; } catch { return false; } });
	return readPid(file);
}

for (const s of SITES) {
	test(`direct-spawn-tools-cancellation.test.ts: ${s.name}: an abort kills the whole process group, settles within the bound, returns the usual aborted result and keeps the progress sent before`, async () => {
		const { script, pidFile } = prepare(s);
		const frames: unknown[] = [];
		const c = new AbortController();
		const run = s.tool.execute(s.input(script), toolDeps(frames, c.signal));
		const pid = await pidOf(pidFile);
		await tick(100);
		const t0 = Date.now();
		c.abort();
		const r = await run;
		assert.ok(Date.now() - t0 < BOUND_MS + SLACK_MS, 'settled within the bound');
		assert.equal(r.success, false);
		assert.equal(r.error, 'exit null');
		assert.equal(await waitFor(() => !alive(pid)), true, 'the descendant is gone');
		if (s.streamsStdout) assert.ok(messages(frames).some(m => m.includes('hello')), 'progress sent before the abort was delivered');
	});

	test(`direct-spawn-tools-cancellation.test.ts: ${s.name}: its own time-out ceiling kills the group and keeps today's time-out wording`, async () => {
		const { script, pidFile } = prepare(s);
		const t0 = Date.now();
		const r = await s.tool.execute(s.input(script, 400), toolDeps([]));
		assert.ok(Date.now() - t0 < 400 + BOUND_MS + SLACK_MS);
		assert.match(r.output, s.timedOut);
		assert.equal((r.data as { timedOut: boolean }).timedOut, true);
		const pid = await pidOf(pidFile);
		assert.equal(await waitFor(() => !alive(pid)), true, 'the descendant is gone');
	});

	test(`direct-spawn-tools-cancellation.test.ts: ${s.name}: an already-aborted signal takes the no-spawn branch and returns the aborted result`, async () => {
		const { script, marker } = prepare(s);
		const frames: unknown[] = [];
		const c = new AbortController(); c.abort();
		const r = await s.tool.execute(s.input(script), toolDeps(frames, c.signal));
		await tick(200);
		assert.equal(fileExists(marker), false, 'no process started');
		assert.equal(frames.length, 0, 'no progress frame, not even a tunnel announcement');
		assert.equal(r.success, false);
		assert.equal(r.error, 'exit null');
		assert.equal((r.data as { timedOut: boolean }).timedOut, false);
	});
}
