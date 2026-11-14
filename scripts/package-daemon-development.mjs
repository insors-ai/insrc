/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	DEVELOPMENT_MINIMUM_MACOS, DEVELOPMENT_NODE_VERSION, readDevelopmentPolicy, requireDevelopmentRef,
} from './daemon-development-metadata.mjs';
import { requireBundleTarget } from './daemon-bundle-metadata.mjs';
import { stageRuntime } from './package-daemon-candidate.mjs';
import { measureBundleRuntime } from './stage-daemon-bundle.mjs';

function git(cwd, args) {
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
	return execFileSync('/usr/bin/git', args, { cwd, env, encoding: 'utf8' }).trim();
}

export function requireCleanDevelopmentCheckout(checkout, commit) {
	if (git(checkout, ['rev-parse', 'HEAD']) !== commit ||
		git(checkout, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') {
		throw new Error('development checkout is dirty or has a different commit');
	}
}

// Called with a policy read from the operator's trusted build configuration.
export async function fetchDevelopmentCheckout(policy, ref, commit, workspace) {
	requireDevelopmentRef(ref);
	if (!policy.developmentRefs.includes(ref) || ref === policy.releaseRef) throw new Error('development branch is not approved');
	if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('expected exact lowercase commit SHA');
	git(workspace, ['init', '--bare', '.']);
	// Fetch this ref into the fresh repository. No local tracking refs are reused.
	git(workspace, ['-c', 'protocol.ext.allow=never', 'fetch', '--no-tags', '--', policy.repository, ref]);
	const fetchedTip = git(workspace, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
	try {
		git(workspace, ['merge-base', '--is-ancestor', commit, fetchedTip]);
	} catch {
		throw new Error('requested commit is unreachable from the fetched development branch');
	}
	const checkout = join(workspace, 'checkout');
	git(workspace, ['worktree', 'add', '--detach', checkout, commit]);
	requireCleanDevelopmentCheckout(checkout, commit);
	return { checkout, fetchedTip, commit, sourceRef: ref, repository: policy.repository };
}

export async function measureDevelopmentCandidate(stage, archive) {
	const hash = createHash('sha256');
	let archiveBytes = 0;
	for await (const chunk of createReadStream(archive)) {
		hash.update(chunk);
		archiveBytes += chunk.length;
		if (archiveBytes > 2 ** 32) throw new Error('development candidate archive exceeds the size limit');
	}
	if (archiveBytes === 0 || archiveBytes !== (await stat(archive)).size) throw new Error('development candidate archive size changed');
	return { archiveBytes, archiveSha256: hash.digest('hex'), runtimeFingerprint: await measureBundleRuntime(stage) };
}

// The verified extractor uses private directories and owner-only file modes.
async function normalizeRuntimeModes(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			await chmod(path, 0o700);
			await normalizeRuntimeModes(path);
		} else if (entry.isFile()) {
			await chmod(path, (await lstat(path)).mode & 0o700);
		}
	}
}

async function main([policyPath, ref, commit, version, outputPath, ...extra]) {
	if (!policyPath || !ref || !commit || !outputPath || extra.length ||
		!/^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})-dev\.[1-9][0-9]{0,8}$/.test(version ?? '') ||
		process.platform !== 'darwin' || process.arch !== 'arm64' || process.versions.node !== DEVELOPMENT_NODE_VERSION) {
		throw new Error('requires Apple Silicon and pinned Node: package-daemon-development.mjs POLICY FULL_REF COMMIT VERSION NEW_OUTPUT_DIR');
	}
	const macOSVersion = execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 5000 }).trim();
	requireBundleTarget({ minimumMacOS: DEVELOPMENT_MINIMUM_MACOS, version }, {
		platform: process.platform, architecture: process.arch, macOSVersion, requestedVersion: version,
	});
	const policy = readDevelopmentPolicy(JSON.parse(await readFile(policyPath, 'utf8')));
	await packageDevelopmentCandidate({ policy, ref, commit, version, outputPath });
}

export async function packageDevelopmentCandidate({ policy, ref, commit, version, outputPath }, {
	buildRuntime = buildDevelopmentRuntime,
} = {}) {
	const workspace = await realpath(await mkdtemp(join(tmpdir(), 'insrc-daemon-development-')));
	const output = resolve(outputPath);
	let ownsOutput = false;
	try {
		const { checkout, ...source } = await fetchDevelopmentCheckout(policy, ref, commit, workspace);
		const stage = join(workspace, 'stage');
		await mkdir(stage);
		await buildRuntime(checkout, stage);
		requireCleanDevelopmentCheckout(checkout, commit);
		await normalizeRuntimeModes(stage);
		await mkdir(output, { mode: 0o700 });
		ownsOutput = true;
		const archiveName = `insrc-daemon-${version}-darwin-arm64.tar.gz`;
		const archive = join(output, archiveName);
		execFileSync('/usr/bin/tar', ['--no-mac-metadata', '--no-xattrs', '--format', 'ustar', '-czf', archive,
			'-C', stage, ...(await readdir(stage)).sort()]);
		const identity = await measureDevelopmentCandidate(stage, archive);
		await writeFile(join(output, 'candidate.json'), JSON.stringify({
			schemaVersion: 1, channel: 'development', ...source, version, target: 'darwin-arm64',
			nodeVersion: DEVELOPMENT_NODE_VERSION, minimumMacOS: DEVELOPMENT_MINIMUM_MACOS, archiveName, ...identity,
		}, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
	} catch (error) {
		if (ownsOutput) await rm(output, { recursive: true, force: true });
		throw error;
	} finally {
		await rm(workspace, { recursive: true, force: true });
	}
}

async function buildDevelopmentRuntime(checkout, stage) {
	const env = { ...process.env, CXXFLAGS: '-std=c++17', MACOSX_DEPLOYMENT_TARGET: DEVELOPMENT_MINIMUM_MACOS };
	for (const args of [
		['ci', '--no-fund', '--no-audit'], ['run', 'build'], ['prune', '--omit=dev', '--no-fund', '--no-audit'],
	]) {
		execFileSync('npm', args, { cwd: checkout, env, stdio: 'inherit' });
	}
	await stageRuntime(checkout, stage, await realpath(process.execPath));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
