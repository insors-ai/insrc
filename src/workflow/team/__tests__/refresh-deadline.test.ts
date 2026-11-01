/**
 * Story s9, task t8: the refresh keeps to its one 10 second deadline over the tool registry.
 * Run: npx tsx --test-force-exit src/workflow/team/__tests__/refresh-deadline.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { cleanup, tmp } from '../../../daemon/tools/__tests__/_proc.js';
import { refreshPolicy } from '../policy-refresh.js';
import { REFRESH_DEADLINE_MS } from '../sighting-store.js';
import { POLICY_PATH } from '../types.js';
import { VALID_POLICY, cloneOf, commitFile, git, makeFixture, makeOrigin } from './git-fixture.js';

const dirs: string[] = [];
let restorePath: (() => void) | undefined;
afterEach(() => { restorePath?.(); restorePath = undefined; for (const d of dirs.splice(0)) cleanup(d); _resetRegistryForTests(); });

/** A git first on PATH that runs the real one, except `ls-remote`, which sleeps (its process id is recorded) and logs every call. */
export function installSleepingLsRemote(): { calls(): string[]; sleeperPid(): number | undefined } {
	const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
	const dir = tmp(); dirs.push(dir);
	const log = join(dir, 'calls.log'); const pidFile = join(dir, 'sleeper.pid');
	writeFileSync(join(dir, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\ncase "$*" in\n  *ls-remote*) sleep 60 & echo $! > '${pidFile}'; wait ;;\n  *) exec '${real}' "$@" ;;\nesac\n`);
	chmodSync(join(dir, 'git'), 0o755);
	const old = process.env['PATH']; process.env['PATH'] = `${dir}:${old}`; restorePath = () => { process.env['PATH'] = old; };
	return {
		calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
		sleeperPid: () => (existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8').trim()) : undefined),
	};
}

export const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch { return false; } };

export function teamClone(): { f: ReturnType<typeof makeFixture>; clone: string } {
	const f = makeFixture();
	const { bare, work } = makeOrigin(f);
	commitFile(work, POLICY_PATH, VALID_POLICY, 'adopt policy', '2026-02-01T00:00:00+00:00');
	git(work, 'push', '-q', 'origin', 'main');
	return { f, clone: cloneOf(f, bare, 'clone') };
}

test('refresh-deadline.test.ts: with a stand-in git that sleeps, the refresh fails with the deadline message at 10 s, starts no call after it, and the process group of the running call is gone within 2 s', async () => {
	assert.equal(REFRESH_DEADLINE_MS, 10_000);
	const { f, clone } = teamClone();
	try {
		const stand = installSleepingLsRemote();
		const started = Date.now();
		const result = await refreshPolicy(clone, { teamDir: f.teamDir });
		const took = Date.now() - started;

		assert.equal(result.ok, false);
		if (!result.ok) assert.match(result.reason, /did not finish within the refresh deadline/);
		assert.ok(took >= 9_000 && took < 12_000, `the refresh ended at the deadline, not before or long after it (${took} ms)`);
		const calls = stand.calls();
		assert.ok(calls.some(c => c.includes('ls-remote')), 'the sleeping call was made');
		assert.ok(!calls.some(c => /\bfetch\b/.test(c)), `no call starts after the deadline: ${calls.join(' | ')}`);
		const pid = stand.sleeperPid();
		assert.ok(pid !== undefined, 'the sleeper recorded its process id');
		await new Promise(r => setTimeout(r, 2_000));
		assert.equal(alive(pid), false, 'the running call and its children are gone within 2 s of the deadline');
	} finally { f.cleanup(); }
});
