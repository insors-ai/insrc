/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { createPublicKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { execFile } from 'node:child_process';
import { chmod, lstat, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { observeReleaseTrust, verifyReleaseQualification, releaseMetadataDigest } from '../shared/managed-release-trust.js';
import type { ReleaseTrustFloor } from '../shared/managed-release-trust.js';
import { measureManagedReleaseInventory } from '../daemon/managed-release-inventory.js';

// Release packaging replaces the empty key with the independently provisioned
// production SPKI. The development artifact cannot authorize any update.
declare const __INSRC_RELEASE_ROOT__: string | undefined;
const PINNED_RELEASE_ROOT = typeof __INSRC_RELEASE_ROOT__ === 'string' ? __INSRC_RELEASE_ROOT__ : '';

export function packagedReleaseRootKey(): KeyObject {
	if (PINNED_RELEASE_ROOT.length === 0) throw new Error('production release trust root is not provisioned');
	return createPublicKey({ key: Buffer.from(PINNED_RELEASE_ROOT, 'base64'), format: 'der', type: 'spki' });
}

const exec = promisify(execFile);
const TRUST_REF = 'refs/notes/insrc-release-trust';
const PROOF_REF = 'refs/notes/insrc-daemon-updates';
const LOCAL_HEAD = 'refs/insrc/candidate';
const MAX_GIT_OUTPUT = 48 * 1024 * 1024;

interface BootstrapInput {
	readonly workspace: string;
	readonly incumbent: string;
	readonly repoUrl: string;
	readonly branch: string;
	readonly rootKey: KeyObject;
	readonly observeTrust?: (trust: ReleaseTrustFloor) => Promise<void>;
}

const PROOF_FIELDS = ['keyId', 'qualification', 'priorInventory', 'candidateInventory', 'compatibility'] as const;
type ReleaseNote = Record<typeof PROOF_FIELDS[number], string>;

function proofOf(raw: string): ReleaseNote {
	const value: unknown = JSON.parse(raw);
	if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid release note');
	if (JSON.stringify(value) !== raw || Object.keys(value).length !== PROOF_FIELDS.length || !PROOF_FIELDS.every(key =>
		Object.hasOwn(value, key) && typeof (value as Record<string, unknown>)[key] === 'string')) {
		throw new Error('invalid release note');
	}
	return value as ReleaseNote;
}

/** Fetch and authenticate Git objects without checking out or running candidate files. */
export async function fetchReleaseAuthorization(input: BootstrapInput) {
	const { workspace, incumbent, repoUrl, branch } = input;
	if (!/^(?:https:\/\/[^\s]+|ssh:\/\/[^\s]+|[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:[^\s]+|\/[^\s]+)$/.test(repoUrl)
		|| !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)) throw new Error('invalid release source');
	const ownedWorkspace = await realpath(workspace);
	const info = await lstat(ownedWorkspace);
	if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
		throw new Error('release bootstrap workspace is not private');
	}
	const { rootKey } = input;
	const env = {
		PATH: '/usr/bin:/bin', HOME: homedir(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
		GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
		// SSH must use the user's existing host trust and credentials without
		// inheriting executable Git or SSH configuration from the checkout.
		...(process.env['SSH_AUTH_SOCK'] === undefined ? {} : { SSH_AUTH_SOCK: process.env['SSH_AUTH_SOCK'] }),
		GIT_SSH_COMMAND: '/usr/bin/ssh -F /dev/null -o BatchMode=yes -o StrictHostKeyChecking=yes',
	};
	const git = async (cwd: string, args: string[]): Promise<string> => (await exec('/usr/bin/git', [
		'-C', cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.ext.allow=never', ...args,
	], { env, timeout: 120_000, maxBuffer: MAX_GIT_OUTPUT, encoding: 'utf8' })).stdout.trimEnd();
	await git(ownedWorkspace, ['check-ref-format', '--branch', branch]);
	const repository = join(ownedWorkspace, 'objects.git');
	await git(ownedWorkspace, ['init', '--quiet', '--bare', '--template=', repository]);
	await git(repository, ['fetch', '--quiet', '--no-tags', '--depth=1', '--', repoUrl,
		`refs/heads/${branch}:${LOCAL_HEAD}`, `${TRUST_REF}:${TRUST_REF}`]);
	const candidateCommit = await git(repository, ['rev-parse', '--verify', `${LOCAL_HEAD}^{commit}`]);
	const candidateTree = await git(repository, ['rev-parse', '--verify', `${LOCAL_HEAD}^{tree}`]);
	const priorCommit = await git(incumbent, ['rev-parse', '--verify', 'HEAD^{commit}']);
	const priorTree = await git(incumbent, ['rev-parse', '--verify', 'HEAD^{tree}']);
	const trustEnvelope = Buffer.from(await git(repository, ['notes', `--ref=${TRUST_REF}`, 'show', candidateCommit]));
	const now = Date.now();
	const trust = observeReleaseTrust(rootKey, trustEnvelope, now);
	await input.observeTrust?.(trust);
	await git(repository, ['fetch', '--quiet', '--no-tags', '--depth=1', '--', repoUrl, `${PROOF_REF}:${PROOF_REF}`]);
	const proof = proofOf(await git(repository, ['notes', `--ref=${PROOF_REF}`, 'show', candidateCommit]));
	const qualificationEnvelope = Buffer.from(proof.qualification, 'base64');
	const qualification = verifyReleaseQualification({ rootKey, trustEnvelope, qualificationEnvelope, keyId: proof.keyId,
		channel: { repoUrl, branch }, priorCommit, candidateCommit, priorTree, candidateTree, now });
	const priorBytes = Buffer.from(proof.priorInventory, 'base64');
	const candidateBytes = Buffer.from(proof.candidateInventory, 'base64');
	const priorInventory = { bytes: priorBytes, digest: releaseMetadataDigest(priorBytes) };
	const candidateInventory = { bytes: candidateBytes, digest: releaseMetadataDigest(candidateBytes) };
	const reference = Buffer.from(JSON.stringify([priorInventory.digest, candidateInventory.digest]));
	const compatibility = Buffer.from(proof.compatibility, 'base64');
	if (releaseMetadataDigest(reference) !== qualification.referenceDigest
		|| releaseMetadataDigest(compatibility) !== qualification.compatibilityDigest) {
		throw new Error('release inventory or writable formats are unauthorized');
	}
	await chmod(repository, 0o700);
	return { git, ownedWorkspace, repository, qualification, priorInventory, candidateInventory, compatibility, proof };
}

export async function checkoutAuthorizedRelease(
	authorization: Awaited<ReturnType<typeof fetchReleaseAuthorization>>, checkout: string,
): Promise<void> {
	const { git, ownedWorkspace, repository, qualification } = authorization;
	await git(ownedWorkspace, ['clone', '--quiet', '--no-checkout', '--no-local', '--template=', '--', repository, checkout]);
	await git(checkout, ['fetch', '--quiet', '--no-tags', '--', repository, LOCAL_HEAD]);
	await git(checkout, ['checkout', '--quiet', '--detach', qualification.candidateCommit, '--']);
	if (await git(checkout, ['rev-parse', '--verify', 'HEAD^{tree}']) !== qualification.candidateTree) {
		throw new Error('authenticated checkout tree changed');
	}
	await git(checkout, ['remote', 'set-url', 'origin', qualification.channel.repoUrl]);
	await git(checkout, ['config', 'insrc.releaseBranch', qualification.channel.branch]);
}

/** Check out only the Git tree authenticated by the already trusted verifier. */
export async function authenticateReleaseBootstrap(input: BootstrapInput): Promise<void> {
	const authorization = await fetchReleaseAuthorization(input);
	const { ownedWorkspace, qualification } = authorization;
	await checkoutAuthorizedRelease(authorization, join(ownedWorkspace, 'checkout'));
	// This private record is passed only to the controller that was just authenticated.
	await writeFile(join(ownedWorkspace, 'qualification.json'), JSON.stringify({
		qualification,
	}), { flag: 'wx', mode: 0o600 });
}

/** Reauthenticate the signed reference and check the built bridge before starting it. */
async function verifyBuiltBridge(input: BootstrapInput): Promise<void> {
	const refresh = await mkdtemp(join(input.workspace, 'refresh-'));
	const { git, repository, qualification, candidateInventory, compatibility } = await fetchReleaseAuthorization({ ...input, workspace: refresh });
	const ownedWorkspace = await realpath(input.workspace);
	const checkout = join(ownedWorkspace, 'checkout');
	const recorded = JSON.parse(await readFile(join(ownedWorkspace, 'qualification.json'), 'utf8')) as {
		qualification?: { qualificationDigest?: string };
	};
	if (recorded.qualification?.qualificationDigest !== qualification.qualificationDigest
		|| await git(checkout, ['rev-parse', '--verify', 'HEAD^{tree}']) !== qualification.candidateTree
		|| await git(repository, ['rev-parse', '--verify', `${LOCAL_HEAD}^{commit}`]) !== qualification.candidateCommit) {
		throw new Error('release qualification changed while building the bridge');
	}
	const declaration = JSON.stringify((JSON.parse(compatibility.toString('utf8')) as { candidate: unknown }).candidate) + '\n';
	await writeFile(join(checkout, 'out/release-compatibility.json'), declaration, { flag: 'wx', mode: 0o600 })
		.catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
	await measureManagedReleaseInventory(checkout, await realpath(process.execPath), candidateInventory);
}

// The shell invokes the bundled copy of this module. A normal module import
// performs no release operation.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === await realpath(resolve(process.argv[1])).catch(() => '')) {
	const [mode, workspace, incumbent, repoUrl, branch, checkout] = process.argv.slice(2);
	try {
		if (workspace === undefined || incumbent === undefined || repoUrl === undefined || branch === undefined) {
			throw new Error('release bootstrap requires a workspace, incumbent, repository and branch');
		}
		const input = { workspace, incumbent, repoUrl, branch, rootKey: packagedReleaseRootKey() };
		if (mode === 'authorize') await authenticateReleaseBootstrap(input);
		else if (mode === 'verify-built') await verifyBuiltBridge(input);
		else if (mode === 'qualification') {
			const result = await fetchReleaseAuthorization({ ...input, observeTrust: async trust => {
				await writeFile(join(workspace, 'observed-trust.json'), JSON.stringify(trust), { flag: 'wx', mode: 0o600 });
			} });
			if (checkout !== undefined) await checkoutAuthorizedRelease(result, checkout);
			process.stdout.write(JSON.stringify({ qualification: result.qualification, proof: result.proof }));
		}
		else throw new Error('unsupported release bootstrap mode');
	} catch (error) {
		process.stderr.write(`release bootstrap: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 4;
	}
}
