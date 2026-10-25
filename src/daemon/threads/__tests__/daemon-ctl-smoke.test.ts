/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Smoke (Epic 86197ac6, Story s2, t17): scripts/daemon-ctl.sh starts the
 * compiled daemon of this checkout (threads on, the default) on a temporary
 * HOME, `status` prints the daemon's status, and `stop` leaves no pid file,
 * socket or process -- the workers are threads of that process.
 *
 * It runs the compiled build (out/), so it runs only when asked:
 *   npm run build && INSRC_SMOKE_TESTS=1 npx tsx --test src/daemon/threads/__tests__/daemon-ctl-smoke.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, alive, childEnv, rpc } from '../../../mcp/__tests__/helpers/mcp-e2e.js';

const SMOKE = process.env['INSRC_SMOKE_TESTS'] === '1';

test('scripts/daemon-ctl.sh start, then status prints the daemon status; stop leaves no pid file, socket or worker behind', { skip: !SMOKE && 'needs a build: set INSRC_SMOKE_TESTS=1 after npm run build', timeout: 180_000 }, async () => {
	assert.ok(existsSync(join(REPO_ROOT, 'out', 'daemon', 'index.js')), 'run npm run build first');
	// Short: the socket path must fit a Unix socket name.
	const home = mkdtempSync('/tmp/isc-');
	const env = { ...childEnv(home), INSRC_DAEMON_ROOT: REPO_ROOT, INSRC_CTL_LOG_DIR: join(home, 'ctl') };
	const ctl = (cmd: string): { status: number | null; out: string } => {
		const r = spawnSync('bash', [join(REPO_ROOT, 'scripts', 'daemon-ctl.sh'), cmd, '--skip-sync', '--skip-install', '--skip-build'], { env, encoding: 'utf8', timeout: 120_000 });
		return { status: r.status, out: `${r.stdout}${r.stderr}` };
	};
	const pidFile = join(home, '.insrc', 'daemon.pid');
	const sock = join(home, '.insrc', 'daemon.sock');
	let pid: number | undefined;
	try {
		const start = ctl('start');
		assert.equal(start.status, 0, start.out);
		pid = Number(readFileSync(pidFile, 'utf8').trim());
		assert.ok(alive(pid), 'the daemon runs');
		const status = await rpc(sock, 'daemon.status') as { queueLanes?: unknown; repos?: unknown };
		assert.ok(status.queueLanes !== undefined, 'served by the threaded daemon (lanes from the status board)');

		const printed = ctl('status');
		assert.equal(printed.status, 0, printed.out);
		assert.match(printed.out, /"queueDepth"/, 'status prints the daemon status');

		const stop = ctl('stop');
		assert.equal(stop.status, 0, stop.out);
		assert.equal(existsSync(pidFile), false, 'no pid file');
		assert.equal(existsSync(sock), false, 'no socket');
		// The daemon removes its pid file after its workers exited and its stores closed; its process
		// then logs 'bye' and exits, a moment after the script saw the pid file and socket gone.
		const gone = Date.now() + 10_000;
		while (alive(pid) && Date.now() < gone) await new Promise(r => setTimeout(r, 100));
		assert.equal(alive(pid), false, 'no daemon process, so none of its worker threads');
		const left = spawnSync('pgrep', ['-f', join(REPO_ROOT, 'out', 'daemon', 'index.js')], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(Number);
		assert.ok(!left.includes(pid), 'nothing of it left running');
	} finally {
		if (pid !== undefined && alive(pid)) process.kill(pid, 'SIGKILL');
		rmSync(home, { recursive: true, force: true });
	}
});
