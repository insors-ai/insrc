/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Real-git fixtures for the team module tests: a bare remote, clones and
 * deterministic commits in temporary directories. Not a test file itself.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const IDENTITY = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

export function git(cwd: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...IDENTITY } }).trim();
}

export interface Fixture {
	readonly root: string;
	/** A scratch team directory so tests never touch ~/.insrc. */
	readonly teamDir: string;
	cleanup(): void;
}

export function makeFixture(): Fixture {
	const root = mkdtempSync(join(tmpdir(), 'team-git-'));
	return { root, teamDir: join(root, 'team'), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export const VALID_POLICY = JSON.stringify({ teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: ['lead'] }, null, 2) + '\n';

/** Write a file in a work tree (creating directories) and commit it; returns the new commit sha. */
export function commitFile(work: string, path: string, content: string, message: string, date?: string): string {
	mkdirSync(dirname(join(work, path)), { recursive: true });
	writeFileSync(join(work, path), content);
	git(work, 'add', '-A');
	const env = date === undefined ? {} : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
	execFileSync('git', ['commit', '-q', '-m', message], { cwd: work, env: { ...process.env, ...IDENTITY, ...env } });
	return git(work, 'rev-parse', 'HEAD');
}

export function removeAndCommit(work: string, path: string, message: string, date?: string): string {
	git(work, 'rm', '-q', path);
	const env = date === undefined ? {} : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
	execFileSync('git', ['commit', '-q', '-m', message], { cwd: work, env: { ...process.env, ...IDENTITY, ...env } });
	return git(work, 'rev-parse', 'HEAD');
}

/** An origin repo (work tree + bare remote) on branch `main`, pushed once. */
export function makeOrigin(f: Fixture): { bare: string; work: string } {
	const bare = join(f.root, 'remote.git');
	const work = join(f.root, 'origin-work');
	git(f.root, 'init', '-q', '--bare', '-b', 'main', bare);
	mkdirSync(work);
	git(work, 'init', '-q', '-b', 'main');
	commitFile(work, 'README.md', 'hello\n', 'initial', '2026-01-01T00:00:00+00:00');
	git(work, 'remote', 'add', 'origin', bare);
	git(work, 'push', '-q', 'origin', 'main');
	return { bare, work };
}

/** Clone the bare remote into `dest` (a normal clone, so origin/HEAD is set). */
export function cloneOf(f: Fixture, bare: string, name: string, ...extra: string[]): string {
	const dest = join(f.root, name);
	git(f.root, 'clone', '-q', ...extra, `file://${bare}`, dest);
	return dest;
}
