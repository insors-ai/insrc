/**
 * Real-git scenarios for the team policy reader and the anchor finder (Story s9, task t7): the same repositories are
 * built and read through whichever reader is passed in, so the results of two implementations can be compared. Not a
 * test file itself.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { POLICY_PATH } from '../../git.js';
import { VALID_POLICY, cloneOf, commitFile, git, makeFixture, makeOrigin } from '../git-fixture.js';
import type { Fixture } from '../git-fixture.js';
import type { PolicyAnchor, PolicyResult, TeamPolicy } from '../../types.js';

type Value<T> = T | Promise<T>;

/** The functions a scenario run reads with: the new async ones, or the old synchronous ones. */
export interface PolicyApi {
	readPolicy(repo: string, opts: { readonly teamDir: string; readonly now: () => Date }): Value<PolicyResult<TeamPolicy | 'none'>>;
	findAnchor(repo: string, trackingRef: string): Value<PolicyAnchor>;
	probeGitRepo(repo: string): Value<{ readonly ok: boolean; readonly value?: boolean; readonly reason?: string }>;
	probeRemote(repo: string): Value<{ readonly ok: boolean; readonly value?: string | undefined; readonly reason?: string }>;
	remoteHeadBranch(repo: string, remote: string): Value<string | undefined>;
}

const NOW = new Date('2026-05-05T00:00:00.000Z');

/** Take out what differs between two runs of the same scenario: object names, scratch paths. */
export function normalise(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'string'
		? v.replace(/[0-9a-f]{40,64}/g, '<sha>').replace(/\/[^\s'"]*team-git-[A-Za-z0-9]+/g, '<tmp>')
		: v)));
}

const INVALID_POLICY = '{ "teamMode": ';

function originWith(f: Fixture, policy: string | undefined, name: string): { bare: string; clone: string } {
	const { bare, work } = makeOrigin(f);
	if (policy !== undefined) {
		commitFile(work, POLICY_PATH, policy, 'adopt policy', '2026-02-01T00:00:00+00:00');
		git(work, 'push', '-q', 'origin', 'main');
	}
	return { bare, clone: cloneOf(f, bare, name) };
}

/** Run every scenario through `api`; the result of each, normalised. */
export async function runPolicyScenarios(api: PolicyApi): Promise<Record<string, unknown>> {
	const out: Record<string, unknown> = {};
	const read = async (f: Fixture, repo: string): Promise<unknown> => normalise(await api.readPolicy(repo, { teamDir: f.teamDir, now: () => NOW }));
	const scenario = async (name: string, body: (f: Fixture) => Promise<unknown>): Promise<void> => {
		const f = makeFixture();
		try { out[name] = normalise(await body(f)); } finally { f.cleanup(); }
	};

	await scenario('not a repository', async f => {
		const dir = join(f.root, 'plain'); mkdirSync(dir);
		return { read: await read(f, dir), probe: await api.probeGitRepo(dir), remote: await api.probeRemote(dir) };
	});
	await scenario('no remote', async f => {
		const dir = join(f.root, 'solo'); mkdirSync(dir);
		git(dir, 'init', '-q', '-b', 'main'); commitFile(dir, 'a.txt', 'x\n', 'one');
		return { read: await read(f, dir), probe: await api.probeGitRepo(dir), remote: await api.probeRemote(dir) };
	});
	await scenario('a remote with nothing fetched', async f => {
		const dir = join(f.root, 'unfetched'); mkdirSync(dir);
		git(dir, 'init', '-q', '-b', 'main'); commitFile(dir, 'a.txt', 'x\n', 'one'); git(dir, 'remote', 'add', 'origin', join(f.root, 'nowhere.git'));
		return { read: await read(f, dir), remote: await api.probeRemote(dir), head: await api.remoteHeadBranch(dir, 'origin') };
	});
	await scenario('two remotes and no origin', async f => {
		const { clone } = originWith(f, undefined, 'clone'); git(clone, 'remote', 'rename', 'origin', 'upstream'); git(clone, 'remote', 'add', 'other', join(f.root, 'other.git'));
		return { remote: await api.probeRemote(clone) };
	});
	await scenario('a detached HEAD with the default branch unknown', async f => {
		const { clone } = originWith(f, VALID_POLICY, 'clone');
		git(clone, 'checkout', '-q', '--detach'); git(clone, 'remote', 'set-head', 'origin', '-d');
		return { read: await read(f, clone), head: await api.remoteHeadBranch(clone, 'origin') };
	});
	await scenario('a policy on the default branch', async f => {
		const { clone } = originWith(f, VALID_POLICY, 'clone');
		return { read: await read(f, clone), again: await read(f, clone), anchor: await api.findAnchor(clone, 'refs/remotes/origin/main'), head: await api.remoteHeadBranch(clone, 'origin') };
	});
	await scenario('an invalid policy on the default branch', async f => {
		const { clone } = originWith(f, INVALID_POLICY, 'clone');
		return { read: await read(f, clone) };
	});
	await scenario('no policy on the default branch', async f => {
		const { clone } = originWith(f, undefined, 'clone');
		return { read: await read(f, clone), anchor: await api.findAnchor(clone, 'refs/remotes/origin/main') };
	});
	await scenario('a shallow clone', async f => {
		const { bare } = originWith(f, VALID_POLICY, 'full');
		const shallow = cloneOf(f, bare, 'shallow', '--depth', '1');
		return { anchor: await api.findAnchor(shallow, 'refs/remotes/origin/main'), read: await read(f, shallow) };
	});
	await scenario('a damaged sighting', async f => {
		const { clone } = originWith(f, VALID_POLICY, 'clone');
		await read(f, clone);                                    // the first observation writes the sighting
		const seen = join(f.teamDir, 'seen');
		const { readdirSync } = await import('node:fs');
		for (const name of readdirSync(seen)) if (name.endsWith('.json')) writeFileSync(join(seen, name), 'not json');
		return { read: await read(f, clone) };
	});
	await scenario('a tracking ref that is gone after a sighting', async f => {
		const { clone } = originWith(f, VALID_POLICY, 'clone');
		await read(f, clone);
		git(clone, 'update-ref', '-d', 'refs/remotes/origin/main');
		return { read: await read(f, clone) };
	});
	return out;
}
