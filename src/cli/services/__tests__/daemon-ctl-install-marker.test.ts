/**
 * ISSUE-ca9883ca S001 t2 -- scripts/daemon-ctl.sh applies the same install rule
 * as maintenance.update. `daemon-ctl.sh update --skip-build` runs over a real
 * scratch daemon checkout (a local bare origin and a clone) with a fake `npm`
 * first on PATH that records each call's arguments and CXXFLAGS: a failed
 * install exits 4 and the next update installs again, then a matching marker
 * skips; a stale or missing marker installs, with -std=c++17 appended to the
 * caller's CXXFLAGS; the script and maintenance.update honour each other's
 * marker; --skip-install leaves npm uncalled; with no lockfile the update
 * installs and writes no marker.
 *
 * HOME points at a temporary directory (for the script and for the
 * maintenance module, imported after it is set), so nothing reaches the real
 * ~/.insrc or the live daemon.
 *
 * Run: npx tsx --test src/cli/services/__tests__/daemon-ctl-install-marker.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'scripts', 'daemon-ctl.sh');

const sandbox = mkdtempSync(join(tmpdir(), 'insrc-ctl-marker-'));
const origin = join(sandbox, 'origin.git');
const root = join(sandbox, 'daemon');
const bin = join(sandbox, 'bin');
const npmLog = join(sandbox, 'npm.log');
const npmExit = join(sandbox, 'npm-exit');

process.env['HOME'] = join(sandbox, 'home');
process.env['INSRC_DAEMON_ROOT'] = root;
process.env['INSRC_CTL_LOG_DIR'] = join(sandbox, 'ctl-logs');
process.env['PATH'] = `${bin}:${process.env['PATH']}`;
mkdirSync(process.env['HOME'], { recursive: true });

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();

// The scratch checkout: a bare origin with one commit, cloned as the daemon root.
mkdirSync(origin);
git(origin, 'init', '--bare', '-q', '-b', 'main');
const seed = join(sandbox, 'seed');
mkdirSync(join(seed, 'src'), { recursive: true });
writeFileSync(join(seed, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
writeFileSync(join(seed, '.gitignore'), 'node_modules/\n');                // as the real checkout ignores it
writeFileSync(join(seed, 'package-lock.json'), '{"lockfileVersion":3}\n');
writeFileSync(join(seed, 'src', 'index.ts'), 'export {};\n');
git(seed, 'init', '-q', '-b', 'main');
git(seed, 'add', '.');
git(seed, 'commit', '-q', '-m', 'seed');
git(seed, 'remote', 'add', 'origin', origin);
git(seed, 'push', '-q', 'origin', 'main');
git(sandbox, 'clone', '-q', origin, root);
const lockHash = git(root, 'hash-object', 'package-lock.json');

// The fake npm: logs "<args>|<CXXFLAGS>", creates node_modules like a real
// install, exits with the code in npm-exit (0 when absent).
mkdirSync(bin);
writeFileSync(join(bin, 'npm'), [
	'#!/bin/sh',
	`echo "$*|$CXXFLAGS" >> '${npmLog}'`,
	'mkdir -p node_modules',
	`if [ -f '${npmExit}' ]; then exit "$(cat '${npmExit}')"; fi`,
	'exit 0',
	'',
].join('\n'));
chmodSync(join(bin, 'npm'), 0o755);

const markerPath = join(root, 'node_modules', '.insrc-install-ok');

const npmCalls = (): string[] => (existsSync(npmLog) ? readFileSync(npmLog, 'utf8').split('\n').filter(Boolean) : []);
/** One `daemon-ctl.sh update --skip-build [...flags]`; it must exit 0 unless `expectStatus` says otherwise. */
function ctl(flags: string[] = [], expectStatus = 0): { status: number | null; out: string; calls: string[] } {
	rmSync(npmLog, { force: true });
	const r = spawnSync('bash', [SCRIPT, 'update', '--skip-build', ...flags], { encoding: 'utf8', env: process.env });
	const out = `${r.stdout}${r.stderr}`;
	assert.equal(r.status, expectStatus, out);
	return { status: r.status, out, calls: npmCalls() };
}
function reset(): void {
	rmSync(join(root, 'node_modules'), { recursive: true, force: true });
	rmSync(npmExit, { force: true });
	delete process.env['CXXFLAGS'];
}

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

test('S001 t2: daemon-ctl.sh update retries after a failed install (exit 4), then skips on a matching marker', () => {
	reset();
	mkdirSync(join(root, 'node_modules'));
	writeFileSync(markerPath, 'a-hash-of-another-lockfile\n');   // a marker from an earlier install
	writeFileSync(npmExit, '1');
	const failed = ctl([], 4);
	assert.match(failed.out, /npm install failed/);
	assert.deepEqual(failed.calls.map(c => c.split('|')[0]), ['install']);
	assert.equal(existsSync(markerPath), false, 'no marker after a failed install: the earlier one was removed before it');

	rmSync(npmExit);
	const retried = ctl();
	assert.deepEqual(retried.calls.map(c => c.split('|')[0]), ['install'], 'the next update installs again, though the lockfile did not change');
	assert.equal(readFileSync(markerPath, 'utf8').trim(), lockHash, 'the marker holds the lockfile blob hash');

	const matching = ctl();
	assert.deepEqual(matching.calls, [], 'a matching marker skips npm');
	assert.match(matching.out, /npm install: the install marker matches package-lock\.json; skipping/);
});

test('S001 t2: daemon-ctl.sh installs on a stale or missing marker, with -std=c++17 appended to CXXFLAGS', () => {
	reset();
	const missing = ctl();
	assert.deepEqual(missing.calls, ['install|-std=c++17'], 'a missing marker installs, with the C++17 flag');

	writeFileSync(markerPath, 'a-hash-of-another-lockfile\n');
	process.env['CXXFLAGS'] = '-O2';
	const stale = ctl();
	assert.deepEqual(stale.calls, ['install|-O2 -std=c++17'], 'a stale marker installs; the caller\'s flags are kept');
	assert.equal(readFileSync(markerPath, 'utf8').trim(), lockHash);
	delete process.env['CXXFLAGS'];
});

test('S001 t2: daemon-ctl.sh and maintenance.update honour each other\'s marker', async () => {
	reset();
	const { update } = await import('../maintenance.js');
	const viaUpdate = await update({ skipBuild: true }, () => {});
	assert.equal(viaUpdate.ok, true, viaUpdate.error);
	assert.ok(viaUpdate.steps.includes('install'));
	assert.deepEqual(ctl().calls, [], 'the script skips on the marker maintenance.update wrote');

	reset();
	ctl();                                                          // the script installs and writes the marker
	rmSync(npmLog, { force: true });
	const viaUpdateAgain = await update({ skipBuild: true }, () => {});
	assert.equal(viaUpdateAgain.ok, true, viaUpdateAgain.error);
	assert.ok(!viaUpdateAgain.steps.includes('install'), 'maintenance.update skips on the marker the script wrote');
	assert.deepEqual(npmCalls(), []);
});

test('S001 t2: --skip-install leaves npm uncalled; an empty lockfile hash installs and writes no marker', () => {
	reset();
	const skipped = ctl(['--skip-install']);
	assert.deepEqual(skipped.calls, []);
	assert.equal(existsSync(markerPath), false);

	reset();
	rmSync(join(root, 'package-lock.json'));
	try {
		const noLock = ctl(['--skip-sync']);
		assert.deepEqual(noLock.calls.map(c => c.split('|')[0]), ['install'], 'no lockfile never matches');
		assert.equal(existsSync(markerPath), false, 'no marker for an empty hash');
		assert.deepEqual(ctl(['--skip-sync']).calls.map(c => c.split('|')[0]), ['install'], 'so the next update installs again');
	} finally {
		git(root, 'checkout', '--', 'package-lock.json');
	}
});
