/**
 * What the text search left out (LLD-b9d5c5c40df5a574-s1, task t3).
 *
 * The Node backend runs on a real temporary directory: an oversized file, an
 * unreadable file, an unreadable directory, a dot-named file and a symbolic
 * link are real entries on disk. The ripgrep path is driven by stand-in
 * binaries, small shell scripts that print what ripgrep prints or exit as it
 * can, so its handling is tested without depending on the installed ripgrep.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runShell } from '../../../shell-helper.js';
import {
	NODE_EXCLUDED_BY_RULE,
	RIPGREP_EXCLUDED_BY_RULE,
	runGrepSearch,
	searchGrepTool,
} from '../grep.js';

/** A binary that cannot be spawned: the Node backend runs, as when ripgrep is not installed. */
const NO_RIPGREP = { rgCommand: '/nonexistent/insrc-no-such-rg' };

function tmp(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-grep-omitted-'));
}

/** Remove a tree that may hold entries with their permissions taken away. */
function cleanup(root: string, locked: readonly string[] = []): void {
	for (const p of locked) { try { chmodSync(p, 0o755); } catch { /* already gone */ } }
	rmSync(root, { recursive: true, force: true });
}

/** A stand-in ripgrep: an executable shell script. */
function standIn(dir: string, name: string, body: string): string {
	const path = join(dir, name);
	writeFileSync(path, `#!/bin/sh\n${body}\n`);
	chmodSync(path, 0o755);
	return path;
}

const isRoot = process.getuid?.() === 0;

// --- Node backend ------------------------------------------------------------

test('the Node backend reports a file skipped for its size, an unreadable file and a shortened line with its full length', { skip: isRoot ? 'permission checks do not apply to root' : false }, async () => {
	const root = tmp();
	const lockedFile = join(root, 'secret.txt');
	try {
		writeFileSync(join(root, 'ok.txt'), 'needle here\nplain line\n');
		const long = 'needle ' + 'x'.repeat(1_800);
		writeFileSync(join(root, 'long.txt'), `first\n${long}\n`);
		writeFileSync(join(root, 'huge.txt'), 'needle\n' + 'y'.repeat(2 * 1024 * 1024 + 10));
		writeFileSync(lockedFile, 'needle in a file nobody may read\n');
		chmodSync(lockedFile, 0o000);

		const r = await runGrepSearch({ pattern: 'needle', root, _backend: NO_RIPGREP });

		assert.equal(r.usedRipgrep, false);
		assert.deepEqual(r.hits.map(h => `${h.path}:${h.line}`).sort(), ['long.txt:2', 'ok.txt:1']);
		assert.equal(r.truncated, false);
		assert.deepEqual(
			[...r.omitted.skippedFiles].sort((a, b) => a.path.localeCompare(b.path)),
			[{ path: 'huge.txt', reason: 'too-large' }, { path: 'secret.txt', reason: 'unreadable' }],
		);
		// The hit's text is still cut to 500; the cut is now reported with the line's real length.
		assert.equal(r.hits.find(h => h.path === 'long.txt')!.text.length, 500);
		assert.deepEqual(r.omitted.shortenedLines, [{ path: 'long.txt', line: 2, totalChars: long.length }]);
		assert.equal(r.omitted.perFileLimitReached, false);
		assert.equal(r.omitted.outputDiscarded, false);
		assert.equal(r.omitted.backendFallback, undefined, 'a missing ripgrep binary is an ordinary condition');
		assert.equal(r.omitted.excludedByRule, NODE_EXCLUDED_BY_RULE);
	} finally {
		cleanup(root, [lockedFile]);
	}
});

test('on the real primitive an unreadable root throws and an unreadable directory below it is skipped (mutation: restore the catch that returns)', { skip: isRoot ? 'permission checks do not apply to root' : false }, async () => {
	const root = tmp();
	const lockedDir = join(root, 'vault');
	try {
		writeFileSync(join(root, 'ok.txt'), 'needle\n');
		mkdirSync(lockedDir);
		writeFileSync(join(lockedDir, 'inside.txt'), 'needle\n');
		chmodSync(lockedDir, 0o000);

		// Below the root: the scan goes on and says what it could not enter.
		const below = await runGrepSearch({ pattern: 'needle', root, _backend: NO_RIPGREP });
		assert.deepEqual(below.hits.map(h => h.path), ['ok.txt']);
		assert.deepEqual(below.omitted.skippedFiles, [{ path: 'vault', reason: 'unreadable' }]);

		// The root itself: the search could not run. It used to return no hits.
		await assert.rejects(
			runGrepSearch({ pattern: 'needle', root: lockedDir, _backend: NO_RIPGREP }),
			(err: unknown) => (err as NodeJS.ErrnoException).code === 'EACCES',
		);
		// A root that does not exist is the same case.
		await assert.rejects(
			runGrepSearch({ pattern: 'needle', root: join(root, 'no-such-dir'), _backend: NO_RIPGREP }),
			(err: unknown) => (err as NodeJS.ErrnoException).code === 'ENOENT',
		);
	} finally {
		cleanup(root, [lockedDir]);
	}
});

test("the Node backend's rule text names dot-named entries and non-regular files, against a fixture holding both", async () => {
	const root = tmp();
	try {
		writeFileSync(join(root, 'seen.txt'), 'needle\n');
		writeFileSync(join(root, '.env'), 'needle in a dot-named file\n');
		mkdirSync(join(root, '.config'));
		writeFileSync(join(root, '.config', 'a.txt'), 'needle under a dot-named directory\n');
		mkdirSync(join(root, 'node_modules'));
		writeFileSync(join(root, 'node_modules', 'dep.txt'), 'needle in an ignored directory\n');
		symlinkSync(join(root, 'seen.txt'), join(root, 'link.txt'));

		const r = await runGrepSearch({ pattern: 'needle', root, _backend: NO_RIPGREP });

		// Four entries hold the pattern and are not read; nothing lists them one by one...
		assert.deepEqual(r.hits.map(h => h.path), ['seen.txt']);
		assert.deepEqual(r.omitted.skippedFiles, []);
		// ...so the rule has to say so, for each kind of entry in this fixture.
		const rule = r.omitted.excludedByRule;
		assert.match(rule, /name starts with a dot, files and directories alike/, 'covers .env and .config');
		assert.match(rule, /directories named .*node_modules/, 'covers node_modules');
		assert.match(rule, /neither a regular file nor a directory, such as a symbolic link/, 'covers link.txt');
	} finally {
		cleanup(root);
	}
});

// --- ripgrep path ------------------------------------------------------------

test('the ripgrep backend reports shortened lines, the per-file limit, discarded output and its exclusion rule', async () => {
	const root = tmp();
	try {
		const long = 'needle ' + 'z'.repeat(900);
		// What ripgrep prints for --no-heading --line-number: <path>:<line>:<text>.
		// a.txt has exactly `limit` matches (ripgrep stops there in each file); b.txt has one long line.
		const rg = standIn(root, 'rg-lines', [
			`echo "${root}/a.txt:1:needle one"`,
			`echo "${root}/a.txt:2:needle two"`,
			`echo "${root}/a.txt:3:needle three"`,
			`echo "${root}/b.txt:7:${long}"`,
		].join('\n'));

		const r = await runGrepSearch({ pattern: 'needle', root, limit: 3, _backend: { rgCommand: rg } });

		assert.equal(r.usedRipgrep, true);
		assert.deepEqual(r.hits.map(h => `${h.path}:${h.line}`), ['a.txt:1', 'a.txt:2', 'a.txt:3'], 'hits are still cut to the limit');
		assert.equal(r.truncated, true);
		assert.equal(r.omitted.perFileLimitReached, true, 'a.txt reached the per-file limit of 3');
		assert.equal(r.omitted.outputDiscarded, false);
		assert.deepEqual(r.omitted.skippedFiles, []);
		assert.equal(r.omitted.excludedByRule, RIPGREP_EXCLUDED_BY_RULE);
		assert.match(r.omitted.excludedByRule, /ignore file/);
		assert.match(r.omitted.excludedByRule, /hidden files/);
		assert.match(r.omitted.excludedByRule, /binary files/);
		assert.deepEqual(r.omitted.shortenedLines, [], 'the long line is past the limit and is not among the hits');

		// With room for it, the long line is a hit, cut to 500 and reported with its real length.
		const roomy = await runGrepSearch({ pattern: 'needle', root, limit: 10, _backend: { rgCommand: rg } });
		assert.equal(roomy.hits.length, 4);
		assert.equal(roomy.hits[3]!.text.length, 500);
		assert.deepEqual(roomy.omitted.shortenedLines, [{ path: 'b.txt', line: 7, totalChars: long.length }]);
		assert.equal(roomy.omitted.perFileLimitReached, false, 'no file has 10 matches');
		assert.equal(roomy.truncated, false);
	} finally {
		cleanup(root);
	}
});

test('a ripgrep run that exits with another code or times out is recorded as backendFallback, and output past the cap sets outputDiscarded', async () => {
	const root = tmp();
	const bin = tmp();
	try {
		writeFileSync(join(root, 'ok.txt'), 'needle\n');

		// Exit code 2: ripgrep's own "an error occurred". The Node backend's result is returned, and says why.
		const exit2 = standIn(bin, 'rg-exit2', 'echo "rg: some/dir: Permission denied (os error 13)" >&2\nexit 2');
		const a = await runGrepSearch({ pattern: 'needle', root, _backend: { rgCommand: exit2 } });
		assert.equal(a.usedRipgrep, false);
		assert.deepEqual(a.hits.map(h => h.path), ['ok.txt']);
		assert.deepEqual(a.omitted.backendFallback, {
			reason: 'exit-code',
			detail: 'ripgrep exited with 2: rg: some/dir: Permission denied (os error 13)',
		});

		// Killed at its time limit.
		const slow = standIn(bin, 'rg-slow', 'sleep 30');
		const b = await runGrepSearch({ pattern: 'needle', root, _backend: { rgCommand: slow, rgTimeoutMs: 150 } });
		assert.equal(b.usedRipgrep, false);
		assert.deepEqual(b.omitted.backendFallback, { reason: 'timeout', detail: 'ripgrep was stopped after 150 ms' });
		assert.deepEqual(b.hits.map(h => h.path), ['ok.txt']);

		// Exit code 1 is ripgrep's "no match": its (empty) result stands and nothing fell back.
		const none = standIn(bin, 'rg-none', 'exit 1');
		const c = await runGrepSearch({ pattern: 'needle', root, _backend: { rgCommand: none } });
		assert.equal(c.usedRipgrep, true);
		assert.deepEqual(c.hits, []);
		assert.equal(c.omitted.backendFallback, undefined);

		// More output than the 4 MB the search keeps: the rest is dropped, and now said to be.
		const flood = standIn(bin, 'rg-flood', `i=0; while [ $i -lt 60000 ]; do echo "${root}/f.txt:$i:needle ${'p'.repeat(90)}"; i=$((i+1)); done`);
		const d = await runGrepSearch({ pattern: 'needle', root, limit: 5000, _backend: { rgCommand: flood } });
		assert.equal(d.usedRipgrep, true);
		assert.equal(d.omitted.outputDiscarded, true);
		assert.equal(d.hits.length, 5000);
	} finally {
		cleanup(root);
		cleanup(bin);
	}
});

test('the shell helper says when stdout passed its cap, and not otherwise', async () => {
	const cut = await runShell(['sh', '-c', 'i=0; while [ $i -lt 2000 ]; do echo 0123456789; i=$((i+1)); done'], { maxBytes: 1_000 });
	assert.equal(cut.stdoutTruncated, true);
	assert.ok(cut.stdout.length <= 1_000);
	const whole = await runShell(['sh', '-c', 'echo hello'], { maxBytes: 1_000 });
	assert.equal(whole.stdoutTruncated, false);
	assert.equal(whole.stdout, 'hello\n');
	const noSpawn = await runShell(['/nonexistent/insrc-no-such-bin']);
	assert.equal(noSpawn.spawnError, true);
	assert.equal(noSpawn.stdoutTruncated, false);
});

// --- the tool, and the callers that only read hits ---------------------------

test("the search tool on an unreadable root fails with 'search-failed' and still says 'bad regex' for an invalid regex", { skip: isRoot ? 'permission checks do not apply to root' : false }, async () => {
	const root = tmp();
	const lockedDir = join(root, 'vault');
	try {
		writeFileSync(join(root, 'ok.txt'), 'needle\n');
		mkdirSync(lockedDir);
		chmodSync(lockedDir, 0o000);

		// Whichever backend runs: ripgrep exits 2 on an unreadable root and the Node backend then throws.
		const failed = await searchGrepTool.execute({ pattern: 'needle', path: lockedDir });
		assert.equal(failed.success, false);
		assert.equal(failed.error, 'search-failed');
		assert.match(String(failed.output), /EACCES/);
		assert.equal(String(failed.output).includes('No matches'), false, 'it used to report "No matches" with success');

		const bad = await searchGrepTool.execute({ pattern: '(unclosed', path: root });
		assert.equal(bad.success, false);
		assert.equal(bad.error, 'bad regex');

		const ok = await searchGrepTool.execute({ pattern: 'needle', path: root });
		assert.equal(ok.success, true);
		assert.match(String(ok.output), /ok\.txt:1: needle/);
	} finally {
		cleanup(root, [lockedDir]);
	}
});

test("the search's hits and limits are unchanged for its other callers", async () => {
	const root = tmp();
	try {
		for (let f = 0; f < 3; f++) {
			writeFileSync(join(root, `f${f}.txt`), Array.from({ length: 4 }, (_, i) => `needle ${f}-${i}`).join('\n') + '\n');
		}
		const all = await runGrepSearch({ pattern: 'needle', root, _backend: NO_RIPGREP });
		assert.equal(all.hits.length, 12);
		assert.equal(all.truncated, false);
		assert.deepEqual(Object.keys(all.hits[0]!).sort(), ['line', 'path', 'text'], 'a hit has the fields it always had');

		const capped = await runGrepSearch({ pattern: 'needle', root, limit: 5, _backend: NO_RIPGREP });
		assert.equal(capped.hits.length, 5, 'the limit still stops the scan at 5 hits');
		assert.equal(capped.truncated, true);

		// A caller that reads only what existed before sees the same five fields with the same meaning.
		const { pattern, root: r, usedRipgrep, hits, truncated } = capped;
		assert.deepEqual({ pattern, r, usedRipgrep, n: hits.length, truncated }, { pattern: 'needle', r: root, usedRipgrep: false, n: 5, truncated: true });
	} finally {
		cleanup(root);
	}
});
