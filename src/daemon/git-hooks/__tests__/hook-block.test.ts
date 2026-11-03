/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBlock, removeBlock, BLOCK_START, BLOCK_END } from '../hook-block.js';

const ENTRY = "/opt/insrc's/out/bin/insrc-git-hook.js";
const HUSKY = '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\nnpx lint-staged\n';
const USER = '#!/bin/bash\necho "mine"\n';
const dir = () => mkdtempSync(join(tmpdir(), 'hook-block-'));
const blockCount = (text: string) => text.split(BLOCK_START).length - 1;

test('src/daemon/git-hooks/__tests__/hook-block.test.ts: the hook block is written into an absent, an empty, a husky-style and a user-written hook file and the existing content is kept byte for byte', async () => {
	const d = dir();
	try {
		const absent = join(d, 'absent');
		assert.deepEqual(await applyBlock(absent, ENTRY, 'post-merge'), { ok: true, changed: true });
		const text = readFileSync(absent, 'utf8');
		assert.ok(text.startsWith('#!/bin/sh\n'), 'a new file gets a shebang');
		assert.ok(text.includes(BLOCK_START) && text.includes(BLOCK_END) && text.includes('exit 0'));
		assert.ok(text.includes(`'/opt/insrc'\\''s/out/bin/insrc-git-hook.js'`), 'the entry path is shell-quoted');
		assert.equal(statSync(absent).mode & 0o111, 0o111, 'a new file is executable');
		const empty = join(d, 'empty'); writeFileSync(empty, '');
		await applyBlock(empty, ENTRY, 'post-merge');
		assert.ok(readFileSync(empty, 'utf8').startsWith('#!/bin/sh\n'));
		for (const [name, content] of [['husky', HUSKY], ['user', USER], ['nonl', '#!/bin/sh\nexit_code=1']] as const) {
			const file = join(d, name); writeFileSync(file, content, { mode: 0o644 });
			await applyBlock(file, ENTRY, 'post-rewrite');
			const after = readFileSync(file, 'utf8');
			assert.ok(after.startsWith(content), `${name}: existing content kept byte for byte`);
			assert.equal(blockCount(after), 1);
			assert.equal(statSync(file).mode & 0o111, 0o111, `${name}: made executable`);
		}
	} finally { rmSync(d, { recursive: true, force: true }); }
});

test('src/daemon/git-hooks/__tests__/hook-block.test.ts: applying is idempotent and removing takes only the marked block and deletes a file that held nothing else', async () => {
	const d = dir();
	try {
		const user = join(d, 'user'); writeFileSync(user, USER, { mode: 0o750 });
		await applyBlock(user, ENTRY, 'post-merge');
		const once = readFileSync(user, 'utf8');
		assert.deepEqual(await applyBlock(user, ENTRY, 'post-merge'), { ok: true, changed: false });
		assert.equal(readFileSync(user, 'utf8'), once);
		await applyBlock(user, '/new/entry.js', 'post-merge');
		const replaced = readFileSync(user, 'utf8');
		assert.equal(blockCount(replaced), 1);
		assert.ok(replaced.includes('/new/entry.js') && !replaced.includes('insrc-git-hook.js'), 'the block is replaced in place');
		assert.equal(statSync(user).mode & 0o777, 0o750, 'the mode is kept');
		assert.deepEqual(await removeBlock(user), { ok: true, changed: true });
		assert.equal(readFileSync(user, 'utf8'), USER);
		assert.deepEqual(await removeBlock(user), { ok: true, changed: false });
		const only = join(d, 'only');
		await applyBlock(only, ENTRY, 'post-merge');
		await removeBlock(only);
		assert.equal(existsSync(only), false, 'a file that held only the block is deleted');
		assert.deepEqual(await removeBlock(join(d, 'never')), { ok: true, changed: false });
	} finally { rmSync(d, { recursive: true, force: true }); }
});

test('src/daemon/git-hooks/__tests__/hook-block.test.ts: a hook file that cannot be written is reported with its reason and left unchanged', async () => {
	const d = dir();
	try {
		const file = join(d, 'hook'); writeFileSync(file, USER, { mode: 0o755 });
		chmodSync(d, 0o555);
		const applied = await applyBlock(file, ENTRY, 'post-merge');
		chmodSync(d, 0o755);
		assert.equal(applied.ok, false);
		if (!applied.ok) assert.match(applied.reason, /EACCES|EPERM|EROFS/);
		assert.equal(readFileSync(file, 'utf8'), USER, 'the file is unchanged');
		assert.deepEqual(readdirSync(d), ['hook'], 'no temporary file is left');
		const dirAsFile = await applyBlock(d, ENTRY, 'post-merge');
		assert.equal(dirAsFile.ok, false, 'an unreadable path is reported, not thrown');
	} finally { chmodSync(d, 0o755); rmSync(d, { recursive: true, force: true }); }
});
