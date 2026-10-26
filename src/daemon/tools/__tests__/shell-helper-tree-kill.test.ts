/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t2: a kill reaches the whole process group and a call settles within the
 * bound even when a descendant that left the group still holds the pipes.
 * Run: npx tsx --test src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { runShell, runShellBytes, spawnManaged } from '../shell-helper.js';
import { alive, cleanup, escapedDescendant, groupDescendant, readPid, tick, tmp, waitFor } from './_proc.js';

const BOUND_MS = 2000;
const SLACK_MS = 1500;

async function pidOf(file: string): Promise<number> {
	await waitFor(() => { try { return readPid(file) > 0; } catch { return false; } });
	return readPid(file);
}

test('shell-helper-tree-kill.test.ts: abort and time-out kill the whole group (the descendant is gone) and settle quickly, in runShell, runShellBytes and spawnManaged', async () => {
	const dir = tmp();
	try {
		for (const how of ['abort', 'timeout'] as const) {
			for (const fn of ['runShell', 'runShellBytes', 'spawnManaged'] as const) {
				const pidFile = join(dir, `${how}-${fn}.pid`);
				const script = groupDescendant(pidFile);
				const c = new AbortController();
				const started = Date.now();
				let aborted = false; let timedOut = false;
				if (fn === 'spawnManaged') {
					const m = spawnManaged('sh', ['-c', script], { signal: c.signal, ...(how === 'timeout' ? { timeoutMs: 300 } : {}) });
					assert.equal(m.spawned, true);
					m.spawned && m.child.stdout?.resume();
					if (how === 'abort') setTimeout(() => c.abort(), 300);
					const e = await m.settled; aborted = e.aborted; timedOut = e.timedOut;
				} else {
					const opts = { signal: c.signal, ...(how === 'timeout' ? { timeoutMs: 300 } : {}) };
					if (how === 'abort') setTimeout(() => c.abort(), 300);
					const r = fn === 'runShell' ? await runShell(['sh', '-c', script], opts) : await runShellBytes(['sh', '-c', script], opts);
					aborted = r.aborted === true; timedOut = r.timedOut;
				}
				assert.ok(Date.now() - started < 300 + BOUND_MS + SLACK_MS, `${fn}/${how} settled within the bound`);
				assert.equal(how === 'abort' ? aborted : timedOut, true, `${fn}/${how} flag`);
				const pid = await pidOf(pidFile);
				assert.equal(await waitFor(() => !alive(pid)), true, `${fn}/${how}: the descendant is gone`);
			}
		}
	} finally { cleanup(dir); }
});

test('shell-helper-tree-kill.test.ts: a descendant that left the group and holds the pipes cannot keep the call open past the bound', async () => {
	const dir = tmp();
	const pids: number[] = [];
	try {
		for (const fn of ['runShell', 'runShellBytes', 'spawnManaged'] as const) {
			const pidFile = join(dir, `${fn}.pid`);
			const script = escapedDescendant(pidFile);
			const started = Date.now();
			if (fn === 'spawnManaged') {
				const m = spawnManaged('sh', ['-c', script], { timeoutMs: 300 });
				assert.equal(m.spawned, true);
				m.spawned && m.child.stdout?.resume();
				const e = await m.settled;
				assert.equal(e.timedOut, true);
			} else {
				const r = fn === 'runShell' ? await runShell(['sh', '-c', script], { timeoutMs: 300 }) : await runShellBytes(['sh', '-c', script], { timeoutMs: 300 });
				assert.equal(r.timedOut, true);
			}
			const took = Date.now() - started;
			assert.ok(took >= 300 && took < 300 + BOUND_MS + SLACK_MS, `${fn}: settled in ${took} ms, within the bound`);
			pids.push(await pidOf(pidFile));
		}
	} finally {
		for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
		cleanup(dir);
	}
});

test('shell-helper-tree-kill.test.ts: runShellBytes kills the group on stderr overflow and reports it', async () => {
	const dir = tmp();
	try {
		const pidFile = join(dir, 'ov.pid');
		const script = `sleep 30 & echo \$! > '${pidFile}'; yes xxxxxxxxxxxxxxxx 1>&2`;
		const r = await runShellBytes(['sh', '-c', script], { stderrLimit: 1024, timeoutMs: 10_000 });
		assert.equal(r.stderrOverflow, true);
		const pid = await pidOf(pidFile);
		assert.equal(await waitFor(() => !alive(pid)), true);
	} finally { cleanup(dir); }
});

test('shell-helper-tree-kill.test.ts: a call that is neither aborted nor timed out settles on close as before', async () => {
	const t0 = Date.now();
	const r = await runShell(['sh', '-c', 'echo done']);
	assert.equal(r.stdout, 'done\n'); assert.equal(r.code, 0); assert.equal(r.timedOut, false); assert.equal(r.aborted, undefined);
	assert.ok(Date.now() - t0 < 1500);
	await tick(10);
});
