/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The CLI's post-update steering refresh asks THE DAEMON for the registered
 * repositories (Epic c2ba6fa6, Story s4, t9). It used to read the registry
 * itself, which opened the live store from the CLI's process during every
 * update, beside a running daemon. Found by the repeated search for openers.
 *
 * This process is "the CLI": its home is a temporary one, set before the
 * service is imported.
 *
 * Run: npx tsx --test src/cli/services/__tests__/steering-refresh-through-daemon.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// A short root: the socket lives under it (path limit ~104 bytes on macOS).
const HOME = mkdtempSync('/tmp/insrc-cli-steer-');
process.env['HOME'] = HOME;
mkdirSync(join(HOME, '.insrc'), { recursive: true });

const { runUpdateSteeringRefresh } = await import('../maintenance.js');
const { STEERING_MARKER_START, STEERING_MARKER_END } = await import('../../../daemon/steering-inject.js');
const { killAllStoreChildren, spawnStoreChild } = await import('../../../db/graph/__tests__/helpers/store-child-driver.js');

after(() => {
	killAllStoreChildren();
	rmSync(HOME, { recursive: true, force: true });
});

const STORE = join(HOME, '.insrc', 'graph.lmdb');
const openStoreFiles = (): string[] =>
	execFileSync('lsof', ['-p', String(process.pid), '-Fn'], { encoding: 'utf8' }).split('\n').filter(l => l.includes('graph.lmdb'));

test('the steering refresh of an update gets the repositories from the daemon and opens no store', { skip: process.platform === 'win32' }, async () => {
	// A daemon root with a freshly built steering block, and a repository that carries the markers.
	const root = join(HOME, 'daemon-root');
	mkdirSync(join(root, 'out', 'prompts'), { recursive: true });
	writeFileSync(join(root, 'out', 'prompts', 'steering-block.md'), 'THE REFRESHED BLOCK\n');
	const repo = join(HOME, 'repo');
	mkdirSync(repo, { recursive: true });
	writeFileSync(join(repo, 'CLAUDE.md'), `# proj\n${STEERING_MARKER_START}\nOLD\n${STEERING_MARKER_END}\n`);

	// No daemon: the refresh fails, says why, and creates no store.
	const down: string[] = [];
	assert.equal(await runUpdateSteeringRefresh(root, l => down.push(l)), undefined);
	assert.ok(down.some(l => /steering refresh failed: daemon is not running/.test(l)), down.join('\n'));
	assert.equal(existsSync(STORE), false, 'the CLI did not create (open) the store');
	assert.match(readFileSync(join(repo, 'CLAUDE.md'), 'utf8'), /OLD/);

	// The "daemon": holds the store, in which the repository is registered, and serves repo.list.
	const daemon = await spawnStoreChild(STORE, { env: { HOME } });
	assert.deepEqual(await daemon.send({ op: 'open' }), { ok: true });
	assert.deepEqual(await daemon.send({ op: 'seed-repo', repoPath: repo, files: [] }), { ok: true });
	const served = await daemon.send({ op: 'daemon-like', logPath: join(HOME, 'daemon.log'), crashLogDir: join(HOME, 'crash') });
	assert.ok(served.ok, served.ok ? '' : served.message);

	const logs: string[] = [];
	const report = await runUpdateSteeringRefresh(root, l => logs.push(l));
	assert.ok(report, logs.join('\n'));
	assert.equal(report.find(o => o.file === join(repo, 'CLAUDE.md'))?.action, 'replaced');
	assert.match(readFileSync(join(repo, 'CLAUDE.md'), 'utf8'), /THE REFRESHED BLOCK/);
	assert.deepEqual(openStoreFiles(), [], 'no descriptor on the store or its lock file in the CLI');

	await daemon.kill();
});
