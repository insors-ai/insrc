/**
 * Real-git scenarios for the signoff branch checks and the default-branch resolution (Story s9, task t9): the same
 * repositories are built and read through whichever implementation is passed in, so two implementations can be compared.
 * Not a test file itself.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { VALID_POLICY, cloneOf, commitFile, git, makeFixture, makeOrigin } from '../git-fixture.js';
import type { Fixture } from '../git-fixture.js';
import { POLICY_PATH } from '../../types.js';
import { normalise } from './policy-scenarios.js';

type Value<T> = T | Promise<T>;

export interface SignoffApi {
	publishArtifactsBranch(repo: string, paths: readonly string[], message: string): Value<unknown>;
	currentBranchOf(repo: string): Value<string | undefined>;
	resolveDefaultBranch(input: { repo: string; remote: string; supplied?: string }): Value<unknown>;
}

function cloneWithPolicy(f: Fixture): { bare: string; work: string; clone: string } {
	const { bare, work } = makeOrigin(f);
	commitFile(work, POLICY_PATH, VALID_POLICY, 'adopt policy', '2026-02-01T00:00:00+00:00');
	git(work, 'push', '-q', 'origin', 'main');
	return { bare, work, clone: cloneOf(f, bare, 'clone') };
}

const touch = (repo: string, name: string): string => { const p = join(repo, 'docs', name); mkdirSync(join(repo, 'docs'), { recursive: true }); writeFileSync(p, `${name}\n`); return p; };

export async function runSignoffScenarios(api: SignoffApi): Promise<Record<string, unknown>> {
	const out: Record<string, unknown> = {};
	const scenario = async (name: string, body: (f: Fixture) => Promise<unknown>): Promise<void> => {
		const f = makeFixture();
		try { out[name] = normalise(await body(f)); } finally { f.cleanup(); }
	};

	await scenario('the branch of a checkout', async f => {
		const { clone } = cloneWithPolicy(f);
		const onMain = await api.currentBranchOf(clone);
		git(clone, 'checkout', '-q', '-b', 'feature/x');
		const onFeature = await api.currentBranchOf(clone);
		git(clone, 'checkout', '-q', '--detach');
		return { onMain, onFeature, detached: await api.currentBranchOf(clone) };
	});
	await scenario('not a repository, and a repository with no commit', async f => {
		const plain = join(f.root, 'plain'); mkdirSync(plain);
		const empty = join(f.root, 'empty'); mkdirSync(empty); git(empty, 'init', '-q', '-b', 'main');
		return { plain: await api.currentBranchOf(plain), empty: await api.currentBranchOf(empty) };
	});
	await scenario('publish from a feature branch with an upstream', async f => {
		const { clone } = cloneWithPolicy(f);
		git(clone, 'checkout', '-q', '-b', 'feature/sign'); git(clone, 'push', '-q', '-u', 'origin', 'feature/sign');
		return await api.publishArtifactsBranch(clone, [touch(clone, 'a.md')], 'sign a');
	});
	await scenario('publish from the default branch', async f => {
		const { clone } = cloneWithPolicy(f);
		return await api.publishArtifactsBranch(clone, [touch(clone, 'b.md')], 'sign b');
	});
	await scenario('publish from a detached HEAD', async f => {
		const { clone } = cloneWithPolicy(f);
		git(clone, 'checkout', '-q', '--detach');
		return await api.publishArtifactsBranch(clone, [touch(clone, 'c.md')], 'sign c');
	});
	await scenario('publish from a branch with no upstream', async f => {
		const { clone } = cloneWithPolicy(f);
		git(clone, 'checkout', '-q', '-b', 'feature/lonely');
		return await api.publishArtifactsBranch(clone, [touch(clone, 'd.md')], 'sign d');
	});
	await scenario('default branch resolution', async f => {
		const { bare, clone } = cloneWithPolicy(f);
		const named = await api.resolveDefaultBranch({ repo: clone, remote: 'origin' });
		git(bare, 'symbolic-ref', 'HEAD', 'refs/heads/gone');
		const dangling = await api.resolveDefaultBranch({ repo: clone, remote: 'origin' });
		const pinned = await api.resolveDefaultBranch({ repo: clone, remote: 'origin', supplied: 'main' });
		const missing = await api.resolveDefaultBranch({ repo: clone, remote: 'origin', supplied: 'nope' });
		const unsafe = await api.resolveDefaultBranch({ repo: clone, remote: 'origin', supplied: '--upload-pack=x' });
		git(clone, 'remote', 'set-url', 'origin', join(f.root, 'no-such-remote.git'));
		const unreachable = await api.resolveDefaultBranch({ repo: clone, remote: 'origin', supplied: 'main' });
		return { named, dangling, pinned, missing, unsafe, unreachable };
	});
	void mkdtempSync;
	return out;
}
