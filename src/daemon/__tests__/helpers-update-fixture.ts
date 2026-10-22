/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A daemon install as the installer makes it: a `--single-branch` clone of a bare remote with a `main` and a `dev` branch, plus a
 * second remote (a fork) that is one commit ahead on `main`. Used by the tests of the update source.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const GIT_ENV = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

export function git(cwd: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_ENV }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export interface UpdateFixture {
	/** The installed checkout (single-branch clone of `main`). */
	readonly install: string;
	readonly remote:  string;
	/** A second bare remote: `main` is one commit ahead of the first remote's, and it has the same `dev`. */
	readonly fork:    string;
	readonly root:    string;
	cleanup(): void;
}

export function updateFixture(): UpdateFixture {
	const root = mkdtempSync(join(tmpdir(), 'insrc-update-fixture-'));
	const remote = join(root, 'remote.git'), fork = join(root, 'fork.git'), work = join(root, 'work'), install = join(root, 'install');
	git(root, 'init', '-q', '--bare', '-b', 'main', remote);
	mkdirSync(work);
	git(work, 'init', '-q', '-b', 'main');
	const commit = (file: string, text: string): void => { writeFileSync(join(work, file), text); git(work, 'add', '-A'); git(work, 'commit', '-q', '-m', `${file} ${text}`); };
	mkdirSync(join(work, 'src'));
	commit('src/placeholder.txt', 'the checkout needs a src tree');
	commit('package.json', '{"name":"daemon"}\n');
	git(work, 'remote', 'add', 'origin', remote);
	git(work, 'push', '-q', 'origin', 'main');
	git(work, 'checkout', '-q', '-b', 'dev');
	commit('dev.txt', 'on dev');
	git(work, 'push', '-q', 'origin', 'dev');
	git(work, 'checkout', '-q', 'main');
	git(root, 'clone', '-q', '--bare', remote, fork);
	commit('fork.txt', 'only on the fork');
	git(work, 'push', '-q', fork, 'main');
	git(root, 'clone', '-q', '--single-branch', '--branch', 'main', remote, install);
	return { install, remote, fork, root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
