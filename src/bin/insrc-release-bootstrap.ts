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

declare const __INSRC_RELEASE_KEY__: string | undefined;
const exec = promisify(execFile);
const HEAD_REF = 'refs/insrc/candidate';
const TAG_REF = 'refs/insrc/release-tag';
const PRINCIPAL = 'insrc-release';
const CATALOG = 'release/macos-compatibility.json';

interface BootstrapInput {
	readonly workspace: string;
	readonly stateRoot: string;
	readonly repoUrl: string;
	readonly branch: string;
	readonly publicKey: string;
}

async function sourceFloors(stateRoot: string): Promise<VerifiedSourceRelease[]> {
	const directory = join(stateRoot, 'managed-lifecycle');
	const owner = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== 'ENOENT') throw error;
	});
	if (owner === undefined) return [];
	if (!owner.isDirectory() || owner.uid !== process.getuid?.() || (owner.mode & 0o077) !== 0) {
		throw new Error('installation journal directory is not private and owned');
	}
	const file = await open(join(directory, 'journal.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
		.catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
	if (file === undefined) return [];
	try {
		const info = await file.stat();
		if (!info.isFile() || info.uid !== owner.uid || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > 128 * 1024) {
			throw new Error('installation journal is not a bounded private file');
		}
		const state = JSON.parse(await file.readFile('utf8')) as { version?: number; root?: string; sourceReleases?: unknown[] };
		if (state.version !== 1 || state.root !== stateRoot) throw new Error('invalid installation journal identity');
		return state.sourceReleases?.map(readVerifiedSourceRelease) ?? [];
	} finally { await file.close(); }
}

/** The installer runs before the lifecycle helper exists. Publish immutable observations
 * by sequence so concurrent installers cannot replace an already accepted tag. */
async function persistBootstrapFloor(stateRoot: string, release: VerifiedSourceRelease): Promise<void> {
	const channel = createHash('sha256').update(JSON.stringify(release.channel)).digest('hex');
	const directory = join(stateRoot, 'source-release-' + channel);
	await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== 'EEXIST') throw error;
	});
	const owner = await lstat(directory);
	if (!owner.isDirectory() || owner.uid !== process.getuid?.() || (owner.mode & 0o077) !== 0) {
		throw new Error('source release journal is not a private owned directory');
	}
	const name = String(release.sequence).padStart(16, '0');
	const path = join(directory, name);
	const verify = async () => {
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
	};
	await verify();
	const temporary = join(directory, '.' + randomUUID());
	const file = await open(temporary, 'wx', 0o600);
	try {
		try { await file.writeFile(JSON.stringify(release)); await file.sync(); }
		finally { await file.close(); }
		await link(temporary, path).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== 'EEXIST') throw error;
		});
		await verify();
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

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === await realpath(resolve(process.argv[1])).catch(() => '')) {
	const [mode, workspace, stateRoot, repoUrl, branch, checkout] = process.argv.slice(2);
	try {
		if (workspace === undefined || stateRoot === undefined || repoUrl === undefined || branch === undefined
			|| (mode !== 'authorize' && mode !== 'qualification')) throw new Error('invalid release bootstrap invocation');
		const publicKey = typeof __INSRC_RELEASE_KEY__ === 'string' ? __INSRC_RELEASE_KEY__ : '';
		const authorization = await fetchReleaseAuthorization({ workspace, stateRoot, repoUrl, branch, publicKey });
		const catalog = await authorization.git(authorization.repository, ['rev-parse', '--verify',
			`${authorization.receipt.tree}:${CATALOG}`]);
		const size = Number(await authorization.git(authorization.repository, ['cat-file', '-s', catalog]));
		if (!Number.isSafeInteger(size) || size < 1 || size > 64 * 1024) throw new Error('invalid release compatibility catalog size');
		const compatibility = await authorization.git(authorization.repository, ['cat-file', 'blob', catalog]);
		if (mode === 'authorize') {
			await checkoutAuthorizedRelease(authorization, join(authorization.ownedWorkspace, 'checkout'));
			await writeFile(join(authorization.ownedWorkspace, 'source-release.json'),
				JSON.stringify(authorization.receipt), { flag: 'wx', mode: 0o600 });
		} else {
			if (checkout !== undefined) await checkoutAuthorizedRelease(authorization, checkout);
			process.stdout.write(JSON.stringify({ receipt: authorization.receipt, catalog, compatibility }));
		}
	} catch (error) {
		process.stderr.write(`release bootstrap: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 4;
	}
}
