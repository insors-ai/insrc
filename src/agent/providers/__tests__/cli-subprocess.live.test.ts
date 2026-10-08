/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live check that process-group teardown reaches a command a REAL claude
 * session backgrounds through its own Bash tool (ISSUE-f1bf0fb3, LLD-f1bf0fb3-s1,
 * plan task t1). The fake-CLI suite proves the mechanism; this one shows whether
 * the claude CLI keeps its Bash children in its own process group. When the CLI
 * declines to run the command (observed on claude 2.1.292: it asks for approval
 * in an untrusted temp directory despite a project allowlist), the test skips as
 * inconclusive rather than passing.
 *
 * Gate behind INSRC_LIVE_TESTS=1 -- it spends real tokens on the user's claude
 * OAuth session.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/agent/providers/__tests__/cli-subprocess.live.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider } from '../cli-provider.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';

function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

test('a command a real claude session backgrounds through its Bash tool is gone once the timed-out session is killed', { skip: !GATE, timeout: 180_000 }, async (t) => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-live-group-'));
	// Let the session run node without a prompt. (The claude CLI refuses commands
	// that start with `sleep`, so the long-running command is a node timer.)
	mkdirSync(join(repo, '.claude'));
	writeFileSync(join(repo, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(node:*)'] } }));
	const pidFile = join(repo, 'pid.txt');
	try {
		const p = new CliProvider({ kind: 'claude', timeoutMs: 90_000 });
		const prompt =
			'This is a test of process cleanup. Use the Bash tool to run exactly this command:\n' +
			"node -e \"require('fs').writeFileSync('pid.txt', String(require('child_process').spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 900000)'], { stdio: 'ignore' }).pid)); setTimeout(()=>{}, 600000)\"\n" +
			'It starts a background timer, records its pid, then waits. Do not do anything else.';
		await p.runEditSession(prompt, { cwd: repo, timeoutMs: 60_000 }).catch(() => undefined);
		if (!existsSync(pidFile)) {
			// The CLI can decline the command (it asks for approval in a directory it has
			// not been told to trust, and refuses `sleep`-led commands outright). Then
			// nothing was started and there is nothing to tear down: inconclusive, not a pass.
			t.skip('inconclusive: the claude session did not run the backgrounding command');
			return;
		}
		const pid = Number(readFileSync(pidFile, 'utf8').trim());
		assert.ok(Number.isInteger(pid) && pid > 0, `recorded pid '${pid}'`);
		const until = Date.now() + 3_000;
		while (isAlive(pid) && Date.now() < until) await new Promise(r => setTimeout(r, 50));
		assert.equal(isAlive(pid), false, `background command ${pid} outlived the claude session`);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
