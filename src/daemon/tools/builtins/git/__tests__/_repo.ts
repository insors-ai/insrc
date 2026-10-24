/** Shared helpers of the git tool tests: a real temporary repository and a registry holding the git tools. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetRegistryForTests } from '../../../registry.js';
import type { ToolDeps } from '../../../types.js';
import { registerGitTools } from '../index.js';

export function git(repo: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function newRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gittools-'));
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'user.email', 't@example.com');
	git(repo, 'config', 'user.name', 'T');
	git(repo, 'config', 'commit.gpgsign', 'false');
	return repo;
}

export const toolDeps = (repo: string): ToolDeps => ({ sessionId: 'test', repoPath: repo, send: () => {}, requestId: 0 });

export function registerForTests(): void {
	_resetRegistryForTests();
	registerGitTools();
}


/** A repository with two commits, a branch b, a tag t, one stash entry, a linked worktree and a dirty a.txt. */
export function richRepo(): { repo: string; wt: string; remote: string } {
	const repo = newRepo();
	writeFileSync(join(repo, 'a.txt'), 'one\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'first');
	writeFileSync(join(repo, 'a.txt'), 'two\n');
	git(repo, 'commit', '-q', '-am', 'second');
	git(repo, 'branch', 'b'); git(repo, 'tag', 't');
	writeFileSync(join(repo, 'a.txt'), 'stashed\n');
	git(repo, 'stash', 'push', '-q');
	const wt = mkdtempSync(join(tmpdir(), 'insrc-wt-')) + '/linked';
	git(repo, 'worktree', 'add', '-q', '-b', 'wtb', wt);
	writeFileSync(join(repo, 'a.txt'), 'dirty\n');
	const remote = mkdtempSync(join(tmpdir(), 'insrc-remote-'));
	git(remote, 'init', '-q', '--bare', '-b', 'main');
	git(repo, 'remote', 'add', 'origin', remote);
	git(repo, 'push', '-q', 'origin', 'main', 'b');
	return { repo, wt, remote };
}

