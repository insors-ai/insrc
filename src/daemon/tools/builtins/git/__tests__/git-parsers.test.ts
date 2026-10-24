/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** The git output parsers and assertSafeArg (Story s4, task t3). Real git output for the shapes, fixed samples for the edge cases. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Tool } from '../../../types.js';
import { assertSafeArg, UnsafeArgError, withFailureNet } from '../helpers.js';
import { gitStatusTool } from '../status.js';
import {
	forEachRefFormat, LOG_FORMAT, parseForEachRef, parseLogRecords, parseLsTree, parseNulList, parseOutput, parseRevList,
	parseShowRef, parseStatusV2,
} from '../parsers.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function git(repo: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 24 });
}

function repoWith(files: Record<string, string>): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-parsers-'));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'user.email', 't@example.com');
	git(repo, 'config', 'user.name', 'T');
	git(repo, 'config', 'commit.gpgsign', 'false');
	for (const [name, body] of Object.entries(files)) { writeFileSync(join(repo, name), body); }
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'one', '-m', 'the body');
	return repo;
}

const cut = (stdout: string) => ({ stdout, stdoutTruncated: false });

test('each parser turns fixed sample output into the expected records and handles -z paths with spaces, unicode and newlines', () => {
	// status v2 -z: header, ordinary change, rename with its original path, conflict, untracked with spaces, unicode and a newline
	const status = [
		'# branch.oid ' + SHA_A, '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -1',
		'1 M. N... 100644 100644 100644 ' + SHA_A + ' ' + SHA_B + ' src/a b.ts',
		'1 .M N... 100644 100644 100644 ' + SHA_A + ' ' + SHA_B + ' src/é.ts',
		'2 R. N... 100644 100644 100644 ' + SHA_A + ' ' + SHA_B + ' R100 new name.ts', 'old name.ts',
		'u UU N... 100644 100644 100644 100644 ' + SHA_A + ' ' + SHA_A + ' ' + SHA_B + ' both.ts',
		'? untracked file.txt', '? line\nbreak.txt', '! ignored.log',
	].join('\0') + '\0';
	assert.deepEqual(parseStatusV2(status), {
		clean: false, branch: 'main', upstream: 'origin/main', ahead: 2, behind: 1,
		staged: [{ path: 'src/a b.ts', code: 'M' }, { path: 'new name.ts', code: 'R', origPath: 'old name.ts' }],
		unstaged: [{ path: 'src/é.ts', code: 'M' }],
		untracked: ['untracked file.txt', 'line\nbreak.txt'],
		conflicts: [{ path: 'both.ts', code: 'UU' }],
	});
	assert.deepEqual(parseStatusV2(''), { clean: true, branch: '(detached)', staged: [], unstaged: [], untracked: [], conflicts: [] });

	assert.deepEqual(parseNulList('a b\0é.txt\0new\nline\0'), ['a b', 'é.txt', 'new\nline']);
	assert.deepEqual(parseNulList(''), []);
	assert.deepEqual(parseLsTree(`100644 blob ${SHA_A}\tdir/a b.txt\u0000040000 tree ${SHA_B}\tsub\u0000160000 commit ${SHA_A}\tmod\0`), [
		{ mode: '100644', type: 'blob', sha: SHA_A, path: 'dir/a b.txt' },
		{ mode: '040000', type: 'tree', sha: SHA_B, path: 'sub' },
		{ mode: '160000', type: 'commit', sha: SHA_A, path: 'mod' },
	]);
	assert.deepEqual(parseRevList(`${SHA_A}\n${SHA_B}\n`), [SHA_A, SHA_B]);
	assert.deepEqual(parseRevList(''), []);
	assert.deepEqual(parseShowRef(`${SHA_A} refs/heads/main\n${SHA_B} refs/tags/v1\n`), [
		{ sha: SHA_A, name: 'refs/heads/main' }, { sha: SHA_B, name: 'refs/tags/v1' },
	]);
	assert.equal(forEachRefFormat(['refname', 'objectname']), '%(refname)%1f%(objectname)%00');
	assert.deepEqual(parseForEachRef('refs/heads/main\x1f' + SHA_A + '\0\nrefs/tags/v1\x1f' + SHA_B + '\0\n', ['refname', 'objectname']), [
		{ refname: 'refs/heads/main', objectname: SHA_A }, { refname: 'refs/tags/v1', objectname: SHA_B },
	]);
	assert.deepEqual(parseLogRecords(`${SHA_A}\x1faaaaaaa\x1fAnn é\x1fa@x\x1f2024-01-02T03:04:05+00:00\x1fsubject\x1fbody\nline\n\0${SHA_B}\x1fbbbbbbb\x1fBo\x1fb@x\x1f2024-01-01T00:00:00+00:00\x1fs2\x1f`), [
		{ sha: SHA_A, shortSha: 'aaaaaaa', author: 'Ann é', authorEmail: 'a@x', date: '2024-01-02T03:04:05+00:00', subject: 'subject', body: 'body\nline' },
		{ sha: SHA_B, shortSha: 'bbbbbbb', author: 'Bo', authorEmail: 'b@x', date: '2024-01-01T00:00:00+00:00', subject: 's2', body: '' },
	]);
});

test('each parser reads real git output', async () => {
	const repo = repoWith({ 'a b.txt': 'a\n', 'é.txt': 'e\n', 'new\nline.txt': 'n\n' });
	try {
		writeFileSync(join(repo, 'untracked file.txt'), 'u\n');
		git(repo, 'branch', 'side');
		git(repo, 'tag', 'v1');

		const status = parseStatusV2(git(repo, 'status', '--porcelain=v2', '--branch', '--null'));
		assert.equal(status.branch, 'main');
		assert.deepEqual(status.untracked, ['untracked file.txt']);
		assert.equal(status.clean, false);
		// the tool answers with the very same records
		const viaTool = await gitStatusTool.execute({ cwd: repo }, { sessionId: 't', repoPath: repo, send: () => {}, requestId: 0 });
		assert.deepEqual(viaTool.data, status);

		assert.deepEqual(parseNulList(git(repo, 'ls-files', '-z')).sort(), ['a b.txt', 'new\nline.txt', 'é.txt'].sort());
		const tree = parseLsTree(git(repo, 'ls-tree', '-z', 'HEAD'));
		assert.equal(tree.length, 3);
		assert.ok(tree.every(e => e.type === 'blob' && e.mode === '100644'));
		const head = git(repo, 'rev-parse', 'HEAD').trim();
		assert.deepEqual(parseRevList(git(repo, 'rev-list', 'HEAD')), [head]);
		assert.ok(parseShowRef(git(repo, 'show-ref')).some(r => r.name === 'refs/tags/v1' && r.sha === head));
		const refs = parseForEachRef(git(repo, 'for-each-ref', `--format=${forEachRefFormat(['refname', 'objectname'])}`), ['refname', 'objectname']);
		assert.deepEqual(refs.map(r => r['refname']).sort(), ['refs/heads/main', 'refs/heads/side', 'refs/tags/v1']);
		const log = parseLogRecords(git(repo, 'log', '-z', `--pretty=format:${LOG_FORMAT}`));
		assert.equal(log.length, 1);
		assert.equal(log[0]?.sha, head);
		assert.equal(log[0]?.subject, 'one');
		assert.equal(log[0]?.body, 'the body');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a parser refuses cut output and unknown records', () => {
	const bad: [string, () => unknown][] = [
		['status: unknown record', () => parseStatusV2('X what\0')],
		['status: too few fields', () => parseStatusV2('1 M. N... 100644\0')],
		['status: rename without its original path', () => parseStatusV2(`2 R. N... 100644 100644 100644 ${SHA_A} ${SHA_B} R100 new.ts\0`)],
		['status: bare untracked marker', () => parseStatusV2('?\0')],
		['status: unterminated last record', () => parseStatusV2('? file')],
		['status: malformed ignored marker', () => parseStatusV2('!garbage\0')],
		['status: bad XY code', () => parseStatusV2(`1 ZZ N... 100644 100644 100644 ${SHA_A} ${SHA_B} p\0`)],
		['status: bad mode', () => parseStatusV2(`1 M. N... 10 100644 100644 ${SHA_A} ${SHA_B} p\0`)],
		['status: bad object name', () => parseStatusV2(`1 M. N... 100644 100644 100644 xyz ${SHA_B} p\0`)],
		['status: malformed branch.ab header', () => parseStatusV2('# branch.ab garbage\0')],
		['status: empty path', () => parseStatusV2(`1 M. N... 100644 100644 100644 ${SHA_A} ${SHA_B} \0`)],
		['for-each-ref: not an object name', () => parseForEachRef('refs/heads/x\x1fnope\0\n', ['refname', 'objectname'])],
		['status: bad rename score', () => parseStatusV2(`2 R. N... 100644 100644 100644 ${SHA_A} ${SHA_B} Rxx new.ts\0old.ts\0`)],
		['nul list: unterminated', () => parseNulList('a\0b')],
		['nul list: empty path', () => parseNulList('a\0\0')],
		['ls-tree: unknown entry', () => parseLsTree('not a tree entry\0')],
		['ls-tree: bad type', () => parseLsTree(`100644 blobby ${SHA_A}\tp\0`)],
		['rev-list: not an object name', () => parseRevList('nope\n')],
		['rev-list: unterminated', () => parseRevList(SHA_A)],
		['show-ref: unknown record', () => parseShowRef('garbage\n')],
		['show-ref: a ref name cannot hold a space', () => parseShowRef(`${SHA_A} refs/tags/v 1\n`)],
		['for-each-ref: wrong field count', () => parseForEachRef('refs/heads/x\0\n', ['refname', 'objectname'])],
		['for-each-ref: unterminated', () => parseForEachRef('refs/heads/x\x1f' + SHA_A, ['refname', 'objectname'])],
		['log: unknown record', () => parseLogRecords('abc\x1fdef')],
		['log: date is not ISO 8601', () => parseLogRecords(`${SHA_A}\x1faaaaaaa\x1fn\x1fe\x1fyesterday\x1fs\x1fb`)],
		['log: short sha is not a prefix', () => parseLogRecords(`${SHA_A}\x1fbbbbbbb\x1fn\x1fe\x1f2024-01-01T00:00:00Z\x1fs\x1fb`)],
		['for-each-ref: empty ref name', () => parseForEachRef('\x1f' + SHA_A + '\0\n', ['refname', 'objectname'])],
		['log: sha is not an object name', () => parseLogRecords('x\x1fx\x1fx\x1fx\x1fx\x1fx\x1fx')],
	];
	for (const [name, f] of bad) { assert.throws(f, /./, name); }

	// through parseOutput: a rejected failure carrying the raw text
	const raw = 'garbage\n';
	const res = parseOutput('git_show_ref', cut(raw), parseShowRef);
	assert.equal(res.ok, false);
	if (!res.ok) {
		assert.equal(res.failure.success, false);
		assert.equal(res.failure.failure?.kind, 'rejected');
		assert.equal(res.failure.failure?.original, raw);
		assert.match(res.failure.output, /^\[git_show_ref\] failed: could not parse git output/);
	}

	// cut output is never turned into a partial list, even when what was read parses
	const complete = `${SHA_A} refs/heads/main\n`;
	const truncated = parseOutput('git_show_ref', { stdout: complete, stdoutTruncated: true }, parseShowRef);
	assert.equal(truncated.ok, false);
	if (!truncated.ok) {
		assert.equal(truncated.failure.failure?.kind, 'rejected');
		assert.equal(truncated.failure.failure?.original, complete);
		assert.match(truncated.failure.error ?? '', /cut/);
	}
	assert.equal(parseOutput('git_show_ref', cut(complete), parseShowRef).ok, true);
});

test('assertSafeArg rejects a value that starts with a dash or holds a NUL', async () => {
	for (const ok of ['main', 'origin/feature-x', 'v1.0', 'HEAD~2', 'a-b']) { assert.doesNotThrow(() => assertSafeArg(ok, 'ref'), ok); }
	for (const bad of ['-D', '--upload-pack=x', '-', 'a\0b', '\0']) {
		assert.throws(() => assertSafeArg(bad, 'ref'), UnsafeArgError, JSON.stringify(bad));
	}
	// a path goes after '--': a leading dash is fine, a NUL is not
	for (const ok of ['-weird.txt', '--x', 'dir/-y', 'a b']) { assert.doesNotThrow(() => assertSafeArg(ok, 'path'), ok); }
	assert.throws(() => assertSafeArg('a\0b', 'path'), UnsafeArgError);

	// a tool that throws it is answered with a rejected failure by the registration net
	const tool: Tool = { id: 'git_fake', description: 'd', inputSchema: { type: 'object' }, async execute(input) { assertSafeArg(String(input['ref']), 'ref'); return { output: 'ok', format: 'text', success: true }; } };
	const net = withFailureNet(tool);
	const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
	assert.equal((await net.execute({ ref: 'main' }, deps)).success, true);
	const refused = await net.execute({ ref: '--upload-pack=x' }, deps);
	assert.equal(refused.success, false);
	assert.equal(refused.failure?.kind, 'rejected');
	assert.match(refused.output, /^\[git_fake\] failed: unsafe ref/);
});
