/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitHooks } from '../git-hooks-methods.js';

const ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true' };
function git(cwd: string, ...args: string[]): { status: number | null; out: string } {
	const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: ENV });
	return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
const must = (cwd: string, ...args: string[]): string => { const r = git(cwd, ...args); assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.out}`); return r.out; };
async function waitFor(check: () => boolean, ms = 5000): Promise<boolean> {
	const end = Date.now() + ms;
	while (Date.now() < end) { if (check()) return true; await new Promise(r => setTimeout(r, 50)); }
	return check();
}

test('src/daemon/__tests__/git-hooks-real-git.test.ts: a real git pull and a real git pull --rebase run the installed hooks and git exits 0 even when the hook entry is missing or the daemon is down', async () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'git-hooks-real-')));
	try {
		const remote = join(root, 'remote.git'), local = join(root, 'local'), other = join(root, 'other');
		mkdirSync(remote); must(remote, 'init', '-q', '--bare', '-b', 'main');
		for (const dir of [local, other]) { must(root, 'clone', '-q', remote, dir); must(dir, 'config', 'user.name', 'T'); must(dir, 'config', 'user.email', 't@example.test'); must(dir, 'config', 'commit.gpgsign', 'false'); }
		writeFileSync(join(other, 'a.txt'), 'one\n'); must(other, 'add', '.'); must(other, 'commit', '-qm', 'first'); must(other, 'push', '-q', 'origin', 'HEAD:main');
		must(local, 'pull', '-q', 'origin', 'main');

		// a stand-in entry that records the call and then fails, as a hook entry with the daemon down would at worst
		const log = join(root, 'calls.log');
		const entry = join(root, 'entry.js');
		writeFileSync(entry, `require('node:fs').appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(' ') + '\\n'); process.exit(1);\n`);
		const hooks = createGitHooks({ registeredRepos: async () => [local], entryPath: entry, setFlag: async () => ({ ok: true }) });
		const installed = await hooks.handlers['repo.gitHooks.install']!({ repo: local }) as any;
		assert.equal(installed.ok, true, JSON.stringify(installed));
		assert.equal(installed.hooksDir, join(local, '.git', 'hooks'));

		// a real pull that merges (a commit on each side) runs post-merge, and git exits 0 although the entry exits 1
		writeFileSync(join(local, 'b.txt'), 'local\n'); must(local, 'add', '.'); must(local, 'commit', '-qm', 'local work');
		writeFileSync(join(other, 'c.txt'), 'two\n'); must(other, 'add', '.'); must(other, 'commit', '-qm', 'second'); must(other, 'push', '-q', 'origin', 'HEAD:main');
		const merged = git(local, 'pull', '--no-rebase', '--no-edit', 'origin', 'main');
		assert.equal(merged.status, 0, merged.out);
		assert.ok(await waitFor(() => existsSync(log) && readFileSync(log, 'utf8').includes('post-merge')), 'post-merge ran the entry');
		assert.ok(readFileSync(log, 'utf8').split('\n').some(l => l.startsWith(`${local} post-merge`)), 'with the repository root and the hook name');

		// a real pull --rebase runs post-rewrite
		writeFileSync(join(local, 'd.txt'), 'local2\n'); must(local, 'add', '.'); must(local, 'commit', '-qm', 'local work 2');
		writeFileSync(join(other, 'e.txt'), 'three\n'); must(other, 'add', '.'); must(other, 'commit', '-qm', 'third'); must(other, 'push', '-q', 'origin', 'HEAD:main');
		const rebased = git(local, 'pull', '--rebase', 'origin', 'main');
		assert.equal(rebased.status, 0, rebased.out);
		assert.ok(await waitFor(() => readFileSync(log, 'utf8').includes('post-rewrite')), 'post-rewrite ran the entry');

		// the entry is gone (the daemon was moved): git is unaffected
		rmSync(entry);
		writeFileSync(join(other, 'f.txt'), 'four\n'); must(other, 'add', '.'); must(other, 'commit', '-qm', 'fourth'); must(other, 'push', '-q', 'origin', 'HEAD:main');
		const missing = git(local, 'pull', '--rebase', 'origin', 'main');
		assert.equal(missing.status, 0, missing.out);
		const status = await hooks.handlers['repo.gitHooks.status']!({ repo: local }) as any;
		assert.deepEqual(status.hooks.map((h: any) => h.installed), [true, true], 'the blocks are still there');
	} finally { rmSync(root, { recursive: true, force: true }); }
});
