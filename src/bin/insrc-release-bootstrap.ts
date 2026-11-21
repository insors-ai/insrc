/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { assertSourceReleaseFloor, readVerifiedSourceRelease } from '../shared/managed-source-release.js';
import type { VerifiedSourceRelease } from '../shared/managed-source-release.js';
import { readSourceReleaseTarget, sourceReleaseCatalog } from '../shared/source-release-target.js';
import type { SourceReleaseTarget } from '../shared/source-release-target.js';
import { readTaggedReleaseCompatibility } from '../shared/source-release-compatibility.js';
import { readSourceInstallationState } from '../shared/source-installation.js';
import { inspectSourcePredecessor } from '../daemon/source-predecessor.js';

declare const __INSRC_RELEASE_KEY__: string | undefined;
declare const __INSRC_SOURCE_TARGET__: string | undefined;
const exec = promisify(execFile);
const HEAD_REF = 'refs/insrc/candidate';
const TAG_REF = 'refs/insrc/release-tag';
const PRINCIPAL = 'insrc-release';

interface BootstrapInput {
	readonly workspace: string;
	readonly stateRoot: string;
	readonly repoUrl: string;
	readonly branch: string;
	readonly publicKey: string;
}

async function sourceFloors(stateRoot: string): Promise<VerifiedSourceRelease[]> {
	const floors: VerifiedSourceRelease[] = [];
	for (const directory of [join(stateRoot, 'managed-lifecycle'), join(stateRoot, 'source-lifecycle')]) {
		const owner = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== 'ENOENT') throw error;
		});
		if (owner === undefined) continue;
		if (!owner.isDirectory() || owner.uid !== process.getuid?.() || (owner.mode & 0o077) !== 0) {
			throw new Error('installation journal directory is not private and owned');
		}
		const file = await open(join(directory, 'journal.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
			.catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
		if (file === undefined) continue;
		try {
			const info = await file.stat();
			if (!info.isFile() || info.uid !== owner.uid || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > 128 * 1024) {
				throw new Error('installation journal is not a bounded private file');
			}
			const value: unknown = JSON.parse(await file.readFile('utf8'));
			if (directory === join(stateRoot, 'source-lifecycle')) {
				const logical = (value as { installationRoot?: unknown } | null)?.installationRoot;
				if (typeof logical !== 'string') throw new Error('invalid source installation journal identity');
				floors.push(...readSourceInstallationState(value, stateRoot, logical).sourceReleases);
			} else {
				const state = value as { version?: number; root?: string; sourceReleases?: unknown[] };
				if (state.version !== 1 || state.root !== stateRoot) throw new Error('invalid installation journal identity');
				floors.push(...(state.sourceReleases?.map(readVerifiedSourceRelease) ?? []));
			}
		} finally { await file.close(); }
	}
	return floors;
}

function bootstrapFloorDirectory(stateRoot: string, release: VerifiedSourceRelease): string {
	const channel = createHash('sha256').update(JSON.stringify(release.channel)).digest('hex');
	return join(stateRoot, 'source-release-' + channel);
}

async function verifyBootstrapFloor(stateRoot: string, release: VerifiedSourceRelease): Promise<void> {
	const directory = bootstrapFloorDirectory(stateRoot, release);
	const owner = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== 'ENOENT') throw error;
	});
	if (owner === undefined) return;
	if (!owner.isDirectory() || owner.uid !== process.getuid?.() || (owner.mode & 0o077) !== 0) {
		throw new Error('source release journal is not a private owned directory');
	}
	const newest = (await readdir(directory)).filter(item => /^\d{16}$/.test(item)).sort().at(-1);
	if (newest === undefined) return;
	const file = await open(join(directory, newest), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const info = await file.stat();
		if (!info.isFile() || info.uid !== owner.uid || (info.mode & 0o077) !== 0 || info.size > 4096) {
			throw new Error('invalid source release journal record');
		}
		const existing = readVerifiedSourceRelease(JSON.parse(await file.readFile('utf8')));
		if (JSON.stringify(existing.channel) !== JSON.stringify(release.channel)
			|| String(existing.sequence).padStart(16, '0') !== newest) throw new Error('invalid source release journal channel');
		assertSourceReleaseFloor(release, [existing]);
	} finally { await file.close(); }
}

/** Publish immutable observations so concurrent installers cannot replace an accepted tag. */
async function persistBootstrapFloor(stateRoot: string, release: VerifiedSourceRelease): Promise<void> {
	const directory = bootstrapFloorDirectory(stateRoot, release);
	await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== 'EEXIST') throw error;
	});
	await verifyBootstrapFloor(stateRoot, release);
	const path = join(directory, String(release.sequence).padStart(16, '0'));
	const temporary = join(directory, '.' + randomUUID());
	const file = await open(temporary, 'wx', 0o600);
	try {
		try { await file.writeFile(JSON.stringify(release)); await file.sync(); }
		finally { await file.close(); }
		await link(temporary, path).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== 'EEXIST') throw error;
		});
		await verifyBootstrapFloor(stateRoot, release);
		for (const parent of [directory, stateRoot]) {
			const dir = await open(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
			try { await dir.sync(); } finally { await dir.close(); }
		}
	} finally { await rm(temporary, { force: true }); }
}

/** Fetch both refs together and authenticate the immutable source before any checkout. */
export async function fetchReleaseAuthorization({ workspace, stateRoot, repoUrl, branch, publicKey }: BootstrapInput) {
	if (!/^(?:https:\/\/[^\s]+|ssh:\/\/[^\s]+|[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:[^\s]+|\/[^\s]+)$/.test(repoUrl)
		|| /[\u0000-\u0020\u007f]/.test(repoUrl) || repoUrl.length > 2048
		|| !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(branch)) throw new Error('invalid release source');
	if (!/^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43}$/.test(publicKey)) {
		throw new Error('trusted Ed25519 release signing key is not provisioned');
	}
	const ownedWorkspace = await realpath(workspace);
	const info = await lstat(ownedWorkspace);
	if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
		throw new Error('release bootstrap workspace is not private');
	}
	const canonicalState = await realpath(stateRoot);
	const stateInfo = await lstat(canonicalState);
	if (!stateInfo.isDirectory() || stateInfo.uid !== process.getuid?.() || (stateInfo.mode & 0o022) !== 0) {
		throw new Error('installation state is not an owned directory');
	}
	const allowedSigners = join(ownedWorkspace, 'allowed-signers');
	await writeFile(allowedSigners, `${PRINCIPAL} ${publicKey}\n`, { flag: 'wx', mode: 0o600 });
	const env = {
		PATH: '/usr/bin:/bin', HOME: homedir(), LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
		GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1',
		...(process.env['SSH_AUTH_SOCK'] === undefined ? {} : { SSH_AUTH_SOCK: process.env['SSH_AUTH_SOCK'] }),
		GIT_SSH_COMMAND: '/usr/bin/ssh -F /dev/null -o BatchMode=yes -o StrictHostKeyChecking=yes',
	};
	const git = async (cwd: string, args: string[]): Promise<string> => (await exec('/usr/bin/git', [
		'-C', cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.ext.allow=never', ...args,
	], { env, timeout: 120_000, maxBuffer: 128 * 1024, encoding: 'utf8' })).stdout.trimEnd();
	await git(ownedWorkspace, ['check-ref-format', '--branch', branch]);
	const repository = join(ownedWorkspace, 'objects.git');
	await git(ownedWorkspace, ['init', '--quiet', '--bare', '--template=', repository]);
	const tagName = `insrc-release/${branch}`;
	await git(repository, ['fetch', '--quiet', '--no-tags', '--depth=1', '--', repoUrl,
		`refs/heads/${branch}:${HEAD_REF}`, `refs/tags/${tagName}:${TAG_REF}`]);
	const tagObject = await git(repository, ['rev-parse', '--verify', `${TAG_REF}^{tag}`]);
	await git(repository, ['-c', 'gpg.format=ssh', '-c', 'gpg.ssh.program=/usr/bin/ssh-keygen',
		'-c', `gpg.ssh.allowedSignersFile=${allowedSigners}`, 'verify-tag', tagObject]);
	const tag = await git(repository, ['cat-file', 'tag', tagObject]);
	const commit = await git(repository, ['rev-parse', '--verify', `${HEAD_REF}^{commit}`]);
	const tree = await git(repository, ['rev-parse', '--verify', `${HEAD_REF}^{tree}`]);
	const parts = /^(object [^\n]+)\n(type [^\n]+)\n(tag [^\n]+)\ntagger [^\n]+\n\n([^\n]+)\n-----BEGIN SSH SIGNATURE-----\n[A-Za-z0-9+/=\n]+\n-----END SSH SIGNATURE-----$/.exec(tag);
	if (parts?.[1] !== `object ${commit}` || parts[2] !== 'type commit' || parts[3] !== `tag ${tagName}`) {
		throw new Error('signed release tag does not directly authorize the candidate branch head');
	}
	const metadata: unknown = JSON.parse(parts[4]!);
	const sequence = (metadata as { sequence?: unknown } | null)?.sequence;
	const channel = { repoUrl, branch };
	if (typeof sequence !== 'number' || JSON.stringify({ version: 1, ...channel, sequence }) !== parts[4]) {
		throw new Error('signed release tag does not name the configured channel and sequence');
	}
	const receipt = readVerifiedSourceRelease({ channel, sequence, tagObject, commit, tree });
	assertSourceReleaseFloor(receipt, await sourceFloors(canonicalState));
	await verifyBootstrapFloor(canonicalState, receipt);
	return { receipt, git, ownedWorkspace, repository, stateRoot: canonicalState };
}

export async function checkoutAuthorizedRelease(
	authorization: Awaited<ReturnType<typeof fetchReleaseAuthorization>>, checkout: string,
): Promise<void> {
	const { git, ownedWorkspace, repository, receipt, stateRoot } = authorization;
	assertSourceReleaseFloor(receipt, await sourceFloors(stateRoot));
	await persistBootstrapFloor(stateRoot, receipt);
	await git(ownedWorkspace, ['clone', '--quiet', '--no-checkout', '--no-local', '--template=', '--', repository, checkout]);
	await git(checkout, ['fetch', '--quiet', '--no-tags', '--', repository, HEAD_REF]);
	await git(checkout, ['checkout', '--quiet', '--detach', receipt.commit, '--']);
	if (await git(checkout, ['rev-parse', '--verify', 'HEAD^{tree}']) !== receipt.tree) throw new Error('authenticated checkout tree changed');
	await git(checkout, ['remote', 'set-url', 'origin', receipt.channel.repoUrl]);
	await git(checkout, ['config', 'insrc.releaseBranch', receipt.channel.branch]);
}

/** Rebuild authority is explicit in the signed catalog; a compatibility-only entry is insufficient. */
async function checkoutAuthorizedPredecessor(
	authorization: Awaited<ReturnType<typeof fetchReleaseAuthorization>>, checkout: string, commit: string, tree: string,
): Promise<void> {
	const { git, repository, ownedWorkspace, receipt, stateRoot } = authorization;
	assertSourceReleaseFloor(receipt, await sourceFloors(stateRoot));
	await persistBootstrapFloor(stateRoot, receipt);
	const ref = 'refs/insrc/recovery';
	await git(repository, ['fetch', '--quiet', '--no-tags', '--depth=1', '--', receipt.channel.repoUrl, `${commit}:${ref}`]);
	if (await git(repository, ['rev-parse', '--verify', `${ref}^{commit}`]) !== commit
		|| await git(repository, ['rev-parse', '--verify', `${ref}^{tree}`]) !== tree) throw new Error('authenticated predecessor tree differs');
	await git(ownedWorkspace, ['clone', '--quiet', '--no-checkout', '--no-local', '--template=', '--', repository, checkout]);
	await git(checkout, ['fetch', '--quiet', '--no-tags', '--', repository, ref]);
	await git(checkout, ['checkout', '--quiet', '--detach', commit, '--']);
	if (await git(checkout, ['rev-parse', '--verify', 'HEAD^{tree}']) !== tree) throw new Error('recovery checkout tree changed');
	await git(checkout, ['remote', 'set-url', 'origin', receipt.channel.repoUrl]);
	await git(checkout, ['config', 'insrc.releaseBranch', receipt.channel.branch]);
}

/** Read only a catalog from the independently authenticated tree, never a working checkout. */
export async function readAuthorizedReleaseCatalog(
	authorization: Awaited<ReturnType<typeof fetchReleaseAuthorization>>, target: SourceReleaseTarget = 'darwin',
) {
	const path = sourceReleaseCatalog(readSourceReleaseTarget(target));
	const catalog = await authorization.git(authorization.repository, ['rev-parse', '--verify',
		`${authorization.receipt.tree}:${path}`]);
	const size = Number(await authorization.git(authorization.repository, ['cat-file', '-s', catalog]));
	if (!Number.isSafeInteger(size) || size < 1 || size > 64 * 1024) throw new Error('invalid release compatibility catalog size');
	const compatibility = await authorization.git(authorization.repository, ['cat-file', 'blob', catalog]);
	return { catalog, compatibility };
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === await realpath(resolve(process.argv[1])).catch(() => '')) {
	const [mode, workspace, stateRoot, repoUrl, branch, ...rest] = process.argv.slice(2);
	try {
		if (mode === 'inventory') {
			const [root, runtime, ...extra] = process.argv.slice(3);
			if (!root || extra.length) throw new Error('usage: inventory INSTALLATION_ROOT [INCUMBENT_RUNTIME]');
			const inventory = await inspectSourcePredecessor({ root, runtime });
			process.stdout.write(JSON.stringify({ inventory, authority: 'diagnostic-only', activationPermitted: false }) + '\n');
		} else {
		const targets = rest.filter(arg => arg.startsWith('--target='));
		const priors = rest.filter(arg => arg.startsWith('--prior='));
		const profiles = rest.filter(arg => arg.startsWith('--profile='));
		const paths = rest.filter(arg => !arg.startsWith('--target=') && !arg.startsWith('--prior=') && !arg.startsWith('--profile='));
		if (targets.length > 1 || priors.length > 1 || profiles.length > 1 || paths.length > 1) throw new Error('invalid release bootstrap arguments');
		const target = readSourceReleaseTarget(targets[0]?.slice('--target='.length)
			?? (typeof __INSRC_SOURCE_TARGET__ === 'string' ? __INSRC_SOURCE_TARGET__ : 'darwin'));
		const checkout = paths[0];
		if (workspace === undefined || stateRoot === undefined || repoUrl === undefined || branch === undefined
			|| (mode !== 'authorize' && mode !== 'qualification' && mode !== 'recovery')) throw new Error('invalid release bootstrap invocation');
		const publicKey = typeof __INSRC_RELEASE_KEY__ === 'string' ? __INSRC_RELEASE_KEY__ : '';
		const authorization = await fetchReleaseAuthorization({ workspace, stateRoot, repoUrl, branch, publicKey });
		const { catalog, compatibility } = await readAuthorizedReleaseCatalog(authorization, target);
		let predecessor: ReturnType<typeof readTaggedReleaseCompatibility> | undefined;
		if (target !== 'darwin' || priors.length || profiles.length || mode === 'recovery') {
			const prior = priors[0]?.slice('--prior='.length);
			const profile = profiles[0]?.slice('--profile='.length);
			if (!prior || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(prior) || !profile) {
				throw new Error('source qualification requires an exact predecessor and launch profile');
			}
			const pair = readTaggedReleaseCompatibility(JSON.parse(compatibility), prior, authorization.receipt.commit, target);
			if (!pair.launchProfiles.includes(profile)) throw new Error('signed source does not support the requested launch profile');
			predecessor = pair;
		}
		if (mode === 'authorize') {
			await checkoutAuthorizedRelease(authorization, join(authorization.ownedWorkspace, 'checkout'));
			await writeFile(join(authorization.ownedWorkspace, 'source-release.json'),
				JSON.stringify(authorization.receipt), { flag: 'wx', mode: 0o600 });
		} else {
			if (mode === 'recovery') {
				if (!predecessor?.recovery || checkout === undefined) throw new Error('signed source does not authorize a predecessor rebuild with this checkout');
				await checkoutAuthorizedPredecessor(authorization, checkout, predecessor.prior.releaseId, predecessor.recovery.tree);
			} else if (checkout !== undefined) await checkoutAuthorizedRelease(authorization, checkout);
			process.stdout.write(JSON.stringify({ receipt: authorization.receipt, catalog, compatibility,
				...(target === 'darwin' ? {} : { target }) }));
		}
		}
	} catch (error) {
		process.stderr.write(`release bootstrap: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 4;
	}
}
