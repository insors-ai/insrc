/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import { ownedNodeEnvironment, resolveOwnedToolchain, toolchainInstallMarker } from '../shared/owned-node-runtime.js';
import { installationPaths } from '../shared/managed-daemon-installation.js';
import { checkUpdateSource } from '../shared/update-source.js';
import type { UpdateSource } from '../shared/update-source.js';
import { readSourceReleaseTarget } from '../shared/source-release-target.js';
import type { SourceReleaseTarget } from '../shared/source-release-target.js';
import { readReleaseCompatibility, requireQualifiedReleasePair } from '../shared/source-release-compatibility.js';
import type { QualifiedReleasePair, ReleaseCompatibility } from '../shared/source-release-compatibility.js';

const exec = promisify(execFile);
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const DECLARATION = 'out/release-compatibility.json';

/** Supplied by the updater from trusted release metadata, before fetching candidate code. */
export interface ManagedReleaseQualification {
	readonly source: Required<Pick<UpdateSource, 'repoUrl' | 'branch'>>;
	readonly candidate: ReleaseCompatibility;
	readonly pairs: readonly (QualifiedReleasePair & { readonly priorFingerprint?: string })[];
}

export interface StagedReleasePin {
	readonly root: string;
	readonly runtime: string;
	readonly commit: string;
	readonly fingerprint: string;
}

interface StageOptions {
	/** Only independently authenticated predecessor rebuilds use the current external build owner. */
	readonly recoveryAuthority?: { readonly root: string } | undefined;
	readonly sourceTarget?: SourceReleaseTarget | undefined;
	readonly stateRoot: string;
	readonly runtime: string;
	readonly source: { readonly repoUrl: string; readonly branch: string };
	readonly qualification: ManagedReleaseQualification;
	readonly prior?: { readonly root: string; readonly runtime: string };
	readonly checkoutAuthorized?: (checkout: string) => Promise<void>;
}

function inside(root: string, path: string): boolean {
	const child = relative(root, path);
	return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

async function privateDirectory(path: string): Promise<void> {
	await mkdir(path, { mode: 0o700 }).catch(error => {
		if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
	});
	const info = await lstat(path);
	if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
		throw new Error('release staging requires an owned private directory');
	}
}

function commandEnvironment(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
	for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
		delete env[key];
	}
	return env;
}

export async function managedReleaseGit(root: string, args: readonly string[]): Promise<string> {
	const result = await exec('git', ['-C', root, '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args], {
		env: commandEnvironment(), timeout: 120_000, maxBuffer: 1024 * 1024,
	});
	return result.stdout.trim();
}

async function cleanCheckoutCommit(root: string): Promise<string> {
	if (await realpath(root) !== root || await managedReleaseGit(root, ['rev-parse', '--show-toplevel']) !== root) {
		throw new Error('release root is not the canonical checkout');
	}
	const commit = await managedReleaseGit(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
	if (!COMMIT.test(commit) || await managedReleaseGit(root, ['status', '--porcelain', '--untracked-files=normal'])) {
		throw new Error('release checkout has uncommitted changes or an invalid commit');
	}
	return commit;
}

async function declaration(root: string): Promise<ReleaseCompatibility | undefined> {
	const path = join(root, DECLARATION);
	const info = await lstat(path).catch(error => {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	});
	if (info === undefined) return undefined;
	if (!info.isFile() || info.size > 8192 || (info.mode & 0o022) !== 0
		|| (info.uid !== process.getuid?.() && info.uid !== 0)) {
		throw new Error('release declaration is not a bounded owned file');
	}
	return readReleaseCompatibility(JSON.parse(await readFile(path, 'utf8')));
}

async function fingerprint(root: string, runtime: string): Promise<string> {
	const hash = createHash('sha256');
	const measured = new Set<string>();
	const linkedTargets = new Set<string>();
	async function visit(path: string, name: string): Promise<void> {
		const info = await lstat(path);
		measured.add(path);
		hash.update(JSON.stringify([name, info.mode, info.isFile() ? info.size : null]) + '\n');
		if (info.isSymbolicLink()) {
			const target = await realpath(path);
			if (!inside(root, target)) throw new Error('release link escapes its checkout');
			linkedTargets.add(target);
			const link = await readlink(path);
			hash.update(JSON.stringify(isAbsolute(link) ? relative(dirname(path), link) : link) + '\n');
		} else if (info.isDirectory()) {
			for (const child of (await readdir(path)).sort()) await visit(join(path, child), join(name, child));
		} else if (info.isFile()) {
			const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
			try {
				const opened = await file.stat();
				if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev) {
					throw new Error('release file changed while being opened');
				}
				for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk as Buffer);
			} finally { await file.close(); }
		} else {
			throw new Error('release contains a non-regular runtime file');
		}
		const after = await lstat(path);
		if (after.ino !== info.ino || after.dev !== info.dev || after.size !== info.size
			|| after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) {
			throw new Error('release bytes changed while being pinned');
		}
	}
	await access(runtime, constants.X_OK);
	await visit(runtime, 'node-runtime');
	for (const name of ['out', 'node_modules', 'package.json', 'package-lock.json', 'packages/project-memory']) {
		await visit(join(root, name), name);
	}
	for (const name of ['scripts', '.npmrc']) {
		const path = join(root, name);
		const present = await lstat(path).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== 'ENOENT') throw error;
		});
		if (present !== undefined) await visit(path, name);
	}
	if ([...linkedTargets].some(target => !measured.has(target))) throw new Error('release link target is outside the measured runtime');
	return hash.digest('hex');
}

/** Measurement only. It deliberately makes no claim that source HEAD produced these bytes. */
export async function measureManagedReleaseFingerprint(root: string, runtime: string): Promise<string> {
	if (await realpath(root) !== root || await realpath(runtime) !== runtime) throw new Error('release measurement requires canonical paths');
	return fingerprint(root, runtime);
}

async function pin(root: string, runtime: string, commit: string): Promise<StagedReleasePin> {
	await access(join(root, 'out/daemon/index.js'), constants.R_OK);
	return { root, runtime, commit, fingerprint: await fingerprint(root, runtime) };
}

/** Capture the fingerprint of an independently built and qualified rollback release. */
export async function captureManagedReleasePin(root: string, runtime: string): Promise<StagedReleasePin> {
	return pin(root, await realpath(runtime), await cleanCheckoutCommit(root));
}

/** Recheck the installed pin before a later cutover can move the launcher or stop the daemon. */
export async function verifyStagedReleasePin(release: StagedReleasePin): Promise<void> {
	if (await cleanCheckoutCommit(release.root) !== release.commit
		|| await realpath(release.runtime) !== release.runtime
		|| await fingerprint(release.root, release.runtime) !== release.fingerprint) {
		throw new Error('pinned release changed before cutover');
	}
}

/** Build beside the installed checkout. No installation selector, process, or live store is touched. */
export async function stageManagedRelease(options: StageOptions): Promise<{
	readonly candidate: StagedReleasePin;
	readonly prior?: StagedReleasePin;
	readonly compatibility?: QualifiedReleasePair;
}> {
	const { stateRoot } = options;
	const priorRoot = options.prior?.root;
	const source = checkUpdateSource(options.source);
	const qualification = options.qualification;
	if (source.repoUrl !== qualification.source.repoUrl || source.branch !== qualification.source.branch
		|| source.repoUrl === undefined || source.branch === undefined) {
		throw new Error('release qualification is for a different update source');
	}
	const candidateProfile = readReleaseCompatibility(qualification.candidate);
	if (!COMMIT.test(candidateProfile.releaseId)) throw new Error('candidate qualification must pin a full Git commit');
	if (await realpath(stateRoot) !== stateRoot) throw new Error('installation root is not canonical');
	// The predecessor runtime remains pinned separately; candidate build/runtime
	// are selected by its verified source bootstrap, never an ambient npm.
	let runtime: string;
	const target = readSourceReleaseTarget(options.sourceTarget);
	if (target !== 'darwin' && target !== `${process.platform}-${process.arch}`) throw new Error('source staging target does not match this host');
	const directory = target === 'darwin' ? installationPaths(stateRoot).directory : join(stateRoot, 'source-lifecycle');
	const releases = join(directory, 'releases');
	if (priorRoot !== undefined && (inside(priorRoot, releases) || priorRoot === releases)) {
		throw new Error('staging would mutate the installed release');
	}
	let prior: StagedReleasePin | undefined;
	let compatibility: QualifiedReleasePair | undefined;
	if (options.prior !== undefined) {
		const { root: priorRoot, runtime: priorRuntime } = options.prior;
		const commit = await cleanCheckoutCommit(priorRoot);
		const qualified = qualification.pairs.find(pair => pair.prior.releaseId === commit
			&& pair.candidate.releaseId === candidateProfile.releaseId);
		if (qualified === undefined) throw new Error('installed commit is not qualified for the candidate');
		const priorProfile = readReleaseCompatibility(qualified.prior);
		const declared = await declaration(priorRoot);
		if (declared !== undefined && !isDeepStrictEqual(declared, priorProfile)) {
			throw new Error('installed release declaration differs from trusted qualification');
		}
		const qualifiedCandidate = readReleaseCompatibility(qualified.candidate);
		compatibility = requireQualifiedReleasePair(priorProfile, candidateProfile, [{ prior: priorProfile, candidate: qualifiedCandidate }]);
		const resolvedPriorRuntime = await realpath(priorRuntime);
		prior = await pin(priorRoot, resolvedPriorRuntime, commit);
		if (qualified.priorFingerprint !== undefined && prior.fingerprint !== qualified.priorFingerprint) {
			throw new Error('installed executable bytes differ from trusted qualification');
		}
	}
	await privateDirectory(directory);
	await privateDirectory(releases);
	const staging = await mkdtemp(join(releases, '.staging-'));
	let destination: string | undefined;
	try {
		const checkout = join(staging, 'checkout');
		if (options.checkoutAuthorized !== undefined) await options.checkoutAuthorized(checkout);
		else await managedReleaseGit(staging, ['clone', '--no-local', '--single-branch', '--branch', source.branch, '--', source.repoUrl, checkout]);
		if (await cleanCheckoutCommit(checkout) !== candidateProfile.releaseId) {
			throw new Error('fetched branch does not match the qualified candidate commit');
		}
		const release = await mkdtemp(join(releases, `${candidateProfile.releaseId}-`));
		destination = release;
		const root = join(release, 'checkout');
		await rename(checkout, root);
		const authority = options.recoveryAuthority?.root;
		if (authority !== undefined && (await realpath(authority) !== authority || inside(root, authority))) throw new Error('recovery authority must be external and canonical');
		const toolchain = await resolveOwnedToolchain(authority ?? root, stateRoot, true);
		runtime = toolchain.node;
		const env = ownedNodeEnvironment(toolchain, commandEnvironment());
		env.PATH = `${dirname(runtime)}${delimiter}${env.PATH ?? '/usr/bin:/bin'}`;
		env.CXXFLAGS = `${env.CXXFLAGS ?? ''} -std=c++17`.trim();
		for (const args of [['ci', '--no-fund', '--no-audit'], ['run', 'build']]) {
			await exec(toolchain.node, [toolchain.npm, ...args], { cwd: root, env, timeout: 600_000, maxBuffer: 4 * 1024 * 1024 });
		}
		const declared = await declaration(root);
		if (declared === undefined) {
			await writeFile(join(root, DECLARATION), JSON.stringify(candidateProfile) + '\n', { flag: 'wx', mode: 0o600 });
		} else if (!isDeepStrictEqual(declared, candidateProfile)) {
			throw new Error('built declaration differs from trusted qualification');
		}
		if (await cleanCheckoutCommit(root) !== candidateProfile.releaseId) throw new Error('candidate commit changed during build');
		if (authority === undefined) await access(join(root, 'out/bin/insrc-daemon-supervisor.js'), constants.R_OK);
		// Native compatibility and binding publication precede activation. The
		// caller's existing journal/descriptor remains the sole cutover authority.
		await exec(runtime, [join(authority ?? root, 'out/bin/insrc-runtime-smoke.js'), ...(authority === undefined ? [] : [root])], { cwd: root, env, timeout: 60_000, maxBuffer: 1024 * 1024 });
		await mkdir(join(root, 'node_modules'), { recursive: true });
		await writeFile(join(root, 'node_modules/.insrc-install-ok'), toolchainInstallMarker(await managedReleaseGit(root, ['hash-object', 'package-lock.json']), toolchain) + '\n', { mode: 0o600 });
		const candidate = await pin(root, runtime, candidateProfile.releaseId);
		if (prior !== undefined) await verifyStagedReleasePin(prior);
		await exec(runtime, [join(authority ?? root, 'scripts/node-runtime-store.mjs'), 'bind', stateRoot, root, dirname(dirname(runtime))], { cwd: root, env, timeout: 180_000 });
		destination = undefined;
		return { candidate, ...(prior !== undefined ? { prior } : {}), ...(compatibility !== undefined ? { compatibility } : {}) };
	} finally {
		await rm(staging, { recursive: true, force: true });
		if (destination !== undefined) await rm(destination, { recursive: true, force: true });
	}
}
