/**
 * ISSUE-ca9883ca S001 t1 -- maintenance.update's install decision. Over a real
 * scratch daemon checkout (a local bare origin and a clone) with a fake `npm`
 * first on PATH that records each call's arguments and CXXFLAGS: an update
 * after a failed install installs again, and the install marker exists only
 * after a successful install; a matching marker skips the install, a stale or
 * missing one installs; npm runs with -std=c++17 appended to the caller's
 * CXXFLAGS; skipInstall leaves npm uncalled; with no lockfile the update
 * installs and writes no marker; a marker that cannot be written fails it.
 *
 * HOME points at a temporary directory before the module is imported, so the
 * post-build steps never reach the real ~/.insrc or the live daemon.
 *
 * Run: npx tsx --test src/cli/services/__tests__/maintenance-install-marker.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sandbox = mkdtempSync(join(tmpdir(), 'insrc-install-marker-'));
const origin = join(sandbox, 'origin.git');
const root = join(sandbox, 'daemon');
const bin = join(sandbox, 'bin');
const npmLog = join(sandbox, 'npm.log');
const npmExit = join(sandbox, 'npm-exit');

process.env['HOME'] = join(sandbox, 'home');
process.env['INSRC_DAEMON_ROOT'] = root;
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

// The fake npm: logs "<args>|<CXXFLAGS>", creates node_modules and rewrites
// package-lock.json as a real install may, exits with the code in npm-exit (0 when absent). With
// FAKE_NPM_MARKER_DIR set it occupies the marker path with a directory, so
// the marker cannot be written.
mkdirSync(bin);
writeFileSync(join(bin, 'npm'), [
	'#!/bin/sh',
	`echo "$*|$CXXFLAGS" >> '${npmLog}'`,
	'mkdir -p node_modules',
	'if [ -f package-lock.json ]; then echo " " >> package-lock.json; fi',   // npm may rewrite the lockfile
	'if [ -n "$FAKE_NPM_MARKER_DIR" ]; then mkdir -p node_modules/.insrc-install-ok; fi',
	`if [ -f '${npmExit}' ]; then exit "$(cat '${npmExit}')"; fi`,
	'exit 0',
	'',
].join('\n'));
chmodSync(join(bin, 'npm'), 0o755);

const { update, INSTALL_MARKER } = await import('../maintenance.js');
const markerPath = join(root, INSTALL_MARKER);

const npmCalls = (): string[] => (existsSync(npmLog) ? readFileSync(npmLog, 'utf8').split('\n').filter(Boolean) : []);
/** One update with the build skipped; it must succeed unless `expectFail` (so a skip can never pass by failing early). */
async function run(opts: { skipInstall?: boolean; skipSync?: boolean } = {}, expectFail = false): Promise<{ ok: boolean; steps: readonly string[]; error?: string | undefined; log: string[]; calls: string[] }> {
	rmSync(npmLog, { force: true });
	const log: string[] = [];
	const r = await update({ skipBuild: true, ...opts }, line => log.push(line));
	if (!expectFail) assert.equal(r.ok, true, `the update failed: ${r.error}`);
	return { ...r, log, calls: npmCalls() };
}
function reset(): void {
	rmSync(join(root, 'node_modules'), { recursive: true, force: true });
	rmSync(npmExit, { force: true });
	delete process.env['FAKE_NPM_MARKER_DIR'];
	delete process.env['CXXFLAGS'];
}

test.after(() => rmSync(sandbox, { recursive: true, force: true }));

test('S001 t1: an update after a failed install installs again, and the marker exists only after a successful install', async () => {
	reset();
	mkdirSync(join(root, 'node_modules'));
	writeFileSync(markerPath, 'a-hash-of-another-lockfile\n');   // a marker from an earlier install
	writeFileSync(npmExit, '1');
	const failed = await run({}, true);
	assert.equal(failed.ok, false);
	assert.equal(failed.error, 'npm install failed');
	assert.deepEqual(failed.calls.map(c => c.split('|')[0]), ['install']);
	assert.ok(existsSync(join(root, 'node_modules')), 'the failed install left node_modules behind, as a real one does');
	assert.equal(existsSync(markerPath), false, 'no marker after a failed install: the earlier one was removed before it');

	rmSync(npmExit);
	const retried = await run();
	assert.equal(retried.ok, true, retried.error);
	assert.deepEqual(retried.calls.map(c => c.split('|')[0]), ['install'], 'the next update installs again, though the lockfile did not change');
	assert.ok(retried.steps.includes('install'));
	assert.equal(readFileSync(markerPath, 'utf8').trim(), lockHash, 'the marker holds the lockfile blob hash');
});

test('S001 t1: a matching marker skips the install; a stale or missing marker installs', async () => {
	reset();
	await run();                                                   // installs, writes the marker
	const matching = await run();
	assert.deepEqual(matching.calls, [], 'a matching marker skips npm');
	assert.ok(!matching.steps.includes('install'));
	assert.ok(matching.log.includes('npm install: the install marker matches package-lock.json; skipping'));

	writeFileSync(markerPath, 'a-hash-of-another-lockfile\n');
	const stale = await run();
	assert.deepEqual(stale.calls.map(c => c.split('|')[0]), ['install'], 'a stale marker installs');
	assert.equal(readFileSync(markerPath, 'utf8').trim(), lockHash);

	rmSync(join(root, 'node_modules'), { recursive: true });       // node_modules deleted by hand: the marker goes with it
	const missing = await run();
	assert.deepEqual(missing.calls.map(c => c.split('|')[0]), ['install'], 'a missing marker installs');
	assert.equal(readFileSync(markerPath, 'utf8').trim(), lockHash);
});

test('S001 t1: npm runs with -std=c++17 appended to the caller\'s CXXFLAGS', async () => {
	reset();
	const plain = await run();
	assert.deepEqual(plain.calls, ['install|-std=c++17']);

	reset();
	process.env['CXXFLAGS'] = '-O2';
	const kept = await run();
	assert.deepEqual(kept.calls, ['install|-O2 -std=c++17'], 'the caller\'s flags are kept');
	delete process.env['CXXFLAGS'];
});

test('S001 t1: skipInstall leaves npm uncalled and the marker unchanged', async () => {
	reset();
	const r = await run({ skipInstall: true });
	assert.equal(r.ok, true, r.error);
	assert.deepEqual(r.calls, []);
	assert.equal(existsSync(markerPath), false, 'no marker written');

	mkdirSync(join(root, 'node_modules'));
	writeFileSync(markerPath, 'stale\n');
	await run({ skipInstall: true });
	assert.equal(readFileSync(markerPath, 'utf8'), 'stale\n', 'an existing marker is left as it is');
});

test('S001 t1: an empty lockfile hash installs and writes no marker; a marker write failure fails the update', async () => {
	reset();
	rmSync(join(root, 'package-lock.json'));
	try {
		const noLock = await run({ skipSync: true });
		assert.equal(noLock.ok, true, noLock.error);
		assert.deepEqual(noLock.calls.map(c => c.split('|')[0]), ['install'], 'no lockfile never matches');
		assert.equal(existsSync(markerPath), false, 'no marker for an empty hash');
		const again = await run({ skipSync: true });
		assert.deepEqual(again.calls.map(c => c.split('|')[0]), ['install'], 'so the next update installs again');
	} finally {
		git(root, 'checkout', '--', 'package-lock.json');
	}

	reset();
	process.env['FAKE_NPM_MARKER_DIR'] = '1';
	const unwritable = await run({}, true);
	assert.equal(unwritable.ok, false);
	assert.match(unwritable.error ?? '', /^npm install succeeded but the install marker could not be written: /);
	assert.ok(!unwritable.steps.includes('install'));
	delete process.env['FAKE_NPM_MARKER_DIR'];
	rmSync(markerPath, { recursive: true, force: true });
});
