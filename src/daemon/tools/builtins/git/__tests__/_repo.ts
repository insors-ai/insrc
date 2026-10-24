/** Shared helpers of the git tool tests: a real temporary repository and a registry holding the git tools. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
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

