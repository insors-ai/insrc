/**
 * Story s9, task t8: an aborted outer signal ends the refresh at the first aborted call.
 * Run: npx tsx --test-force-exit src/workflow/team/__tests__/refresh-abort.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { cleanup, tmp } from '../../../daemon/tools/__tests__/_proc.js';
import { ToolDenied } from '../../tracker/tool-denied.js';
import { refreshPolicy } from '../policy-refresh.js';
import { readSighting } from '../sighting-store.js';
import { POLICY_PATH } from '../git.js';
import { VALID_POLICY, cloneOf, commitFile, git, makeFixture, makeOrigin } from './git-fixture.js';

const dirs: string[] = [];
let restorePath: (() => void) | undefined;
afterEach(() => { restorePath?.(); restorePath = undefined; for (const d of dirs.splice(0)) cleanup(d); _resetRegistryForTests(); });

/** A git first on PATH that runs the real one, except `ls-remote`, which sleeps; every call is logged. */
function sleepingLsRemote(): () => string[] {
	const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
	const dir = tmp(); dirs.push(dir);
	const log = join(dir, 'calls.log');
	writeFileSync(join(dir, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\ncase "$*" in\n  *ls-remote*) sleep 60 & wait ;;\n  *) exec '${real}' "$@" ;;\nesac\n`);
	chmodSync(join(dir, 'git'), 0o755);
	const old = process.env['PATH']; process.env['PATH'] = `${dir}:${old}`; restorePath = () => { process.env['PATH'] = old; };
	return () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
}

function teamClone(): { f: ReturnType<typeof makeFixture>; clone: string } {
	const f = makeFixture();
	const { bare, work } = makeOrigin(f);
	commitFile(work, POLICY_PATH, VALID_POLICY, 'adopt policy', '2026-02-01T00:00:00+00:00');
	git(work, 'push', '-q', 'origin', 'main');
	return { f, clone: cloneOf(f, bare, 'clone') };
}

test('refresh-abort.test.ts: an aborted outer signal ends the refresh at the first aborted call with a cancelled denial and starts no later call', async () => {
	const { f, clone } = teamClone();
	try {
		const calls = sleepingLsRemote();

		// aborted before it starts: the first call is cancelled and nothing runs
		const before = new AbortController(); before.abort();
		await assert.rejects(refreshPolicy(clone, { teamDir: f.teamDir, signal: before.signal }), (e: unknown) => e instanceof ToolDenied && e.reason === 'cancelled');
		assert.equal(calls().length, 0, 'no git ran');

		// aborted while the network call sleeps: that call is stopped and no later call starts
		const during = new AbortController();
		setTimeout(() => during.abort(), 600);
		const started = Date.now();
		await assert.rejects(refreshPolicy(clone, { teamDir: f.teamDir, signal: during.signal }), (e: unknown) => e instanceof ToolDenied && e.reason === 'cancelled');
		assert.ok(Date.now() - started < 5_000, 'the refresh ended at the abort, not at the deadline');
		const ran = calls();
		assert.ok(ran.some(c => c.includes('ls-remote')), 'the network call had started');
		assert.ok(!ran.some(c => /\bfetch\b/.test(c)), `no call started after the abort: ${ran.join(' | ')}`);
		assert.equal((await readSighting(clone, f.teamDir)).kind, 'absent', 'nothing was recorded');
	} finally { f.cleanup(); }
});
