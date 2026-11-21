/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type { StopTarget } from '../shared/daemon-process-client.js';
import { readDarwinIncarnation, readDarwinLaunchContext } from '../shared/darwin-lifecycle.js';
import { readReleaseCompatibility } from '../shared/source-release-compatibility.js';
import { managedReleaseGit as git, measureManagedReleaseFingerprint, stageManagedRelease } from './managed-release-staging.js';
import type { StagedReleasePin } from './managed-release-staging.js';
import { qualifySourceRelease } from './source-release-qualification.js';
import type { SourceQualificationInput } from './source-release-qualification.js';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Read metadata without following a leaf link or running incumbent scripts. */
async function bounded(path: string, max: number): Promise<Buffer | undefined> {
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
		.catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
	if (file === undefined) return undefined;
	try {
		const before = await file.stat();
		if (!before.isFile() || before.nlink !== 1 || before.size > max || (before.mode & 0o022) !== 0
			|| (before.uid !== process.getuid?.() && before.uid !== 0)) throw new Error('unsafe or oversized predecessor metadata');
		const bytes = Buffer.alloc(before.size + 1), { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
		const after = await file.stat(), current = await lstat(path);
		if (bytesRead !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
			|| current.ino !== before.ino || current.dev !== before.dev) throw new Error('predecessor metadata changed during inventory');
		return bytes.subarray(0, bytesRead);
	} finally { await file.close(); }
}

export interface PredecessorInventoryInput {
	readonly root: string;
	readonly runtime?: string | undefined;
	/** From a previously qualified installation-owner receipt, never manufactured from current HEAD. */
	readonly knownBuild?: StagedReleasePin | undefined;
	/** The caller retains ownership of this capability across preparation and cutover. */
	readonly target?: StopTarget | undefined;
}

async function observe(target: StopTarget, root: string) {
	if (await target.handle.hasExited()) throw new Error('captured incumbent has exited');
	let executable: string, cwd: string;
	if (process.platform === 'linux') {
		executable = await realpath(await readlink(`/proc/${target.pid}/exe`));
		cwd = await realpath(await readlink(`/proc/${target.pid}/cwd`));
	} else if (process.platform === 'darwin') {
		const before = await readDarwinIncarnation(target.pid), context = await readDarwinLaunchContext(target.pid);
		const after = await readDarwinIncarnation(target.pid);
		if (!isDeepStrictEqual(before, after)) throw new Error('incumbent incarnation changed during inventory');
		executable = await realpath(before.executable); cwd = await realpath(context.cwd);
	} else throw new Error('incumbent observation is unsupported on this platform');
	if (await target.handle.hasExited() || !target.commandLine.endsWith(join(root, 'out/daemon/index.js'))) {
		throw new Error('captured incumbent does not match this source installation');
	}
	return { pid: target.pid, startedAt: target.startedAt, executable, cwd, entry: join(root, 'out/daemon/index.js') };
}

export async function inspectSourcePredecessor(input: PredecessorInventoryInput) {
	const root = input.root, issues: string[] = [];
	if (!isAbsolute(root) || await realpath(root) !== root || await git(root, ['rev-parse', '--show-toplevel']) !== root) {
		throw new Error('predecessor inventory requires a canonical source checkout');
	}
	const sourceHead = await git(root, ['rev-parse', '--verify', 'HEAD^{commit}']);
	const dirty = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
	const changes = dirty.split('\0').filter(Boolean);
	if (changes.length) issues.push('source-or-lockfile-dirty');
	let live: Awaited<ReturnType<typeof observe>> | undefined;
	if (input.target) { try { live = await observe(input.target, root); } catch { issues.push('live-incarnation-unverifiable'); } }
	let runtime: string | undefined;
	try {
		if (input.runtime !== undefined && !isAbsolute(input.runtime)) throw new Error('runtime is not absolute');
		runtime = live?.executable ?? (input.runtime === undefined ? undefined : await realpath(input.runtime));
		if (live && input.runtime && await realpath(input.runtime) !== live.executable) issues.push('live-runtime-mismatch');
		const info = runtime === undefined ? undefined : await lstat(runtime);
		if (!info?.isFile() || !(info.mode & 0o111)) { issues.push('prior-runtime-unknown'); runtime = undefined; }
	} catch { issues.push('prior-runtime-unknown'); }
	let lockBlob: string | undefined, lockSha256: string | undefined, marker: string | undefined;
	try {
		const lock = await bounded(join(root, 'package-lock.json'), 16 * 1024 * 1024);
		if (!lock) issues.push('lockfile-missing');
		else { JSON.parse(lock.toString('utf8')); lockSha256 = digest(lock); lockBlob = await git(root, ['hash-object', 'package-lock.json']); }
		marker = (await bounded(join(root, 'node_modules/.insrc-install-ok'), 8192))?.toString('utf8').trim();
		if (!marker) issues.push('install-marker-missing');
		else if (marker !== lockBlob && !marker.startsWith(`v2:${lockBlob}:`)) issues.push('install-marker-mismatch');
	} catch { issues.push('dependency-metadata-unverifiable'); }
	let declaration: ReturnType<typeof readReleaseCompatibility> | undefined;
	try {
		const bytes = await bounded(join(root, 'out/release-compatibility.json'), 8192);
		if (bytes) declaration = readReleaseCompatibility(JSON.parse(bytes.toString('utf8')));
	} catch { issues.push('built-declaration-unverifiable'); }
	// Existing compiler attestation is a diagnostic hint, not authority to relabel compiled bytes.
	let sourceMatchesBuild: boolean | undefined;
	try {
		const bytes = await bounded(join(root, 'out/assets/connection-management-build.json'), 8 * 1024 * 1024);
		if (bytes) {
			const manifest = JSON.parse(bytes.toString('utf8')) as { sourceFiles?: Record<string, string>; compiledFiles?: Record<string, string> };
			if (!manifest.sourceFiles || !manifest.compiledFiles || Object.keys(manifest.sourceFiles).length > 10_000) throw new Error('invalid build attestation');
			sourceMatchesBuild = true;
			for (const [base, files] of [[join(root, 'src'), manifest.sourceFiles], [join(root, 'out'), manifest.compiledFiles]] as const) {
				for (const [name, expected] of Object.entries(files)) {
					const path = resolve(base, name), child = relative(base, path);
					if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child) || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('unsafe build attestation');
					const found = await bounded(path, 8 * 1024 * 1024);
					if (!found || digest(found) !== expected) sourceMatchesBuild = false;
				}
			}
			if (!sourceMatchesBuild) issues.push('source-or-output-ahead-of-build-attestation');
		}
	} catch { issues.push('build-attestation-unverifiable'); }
	let fingerprint: string | undefined, builtCommit: string | undefined;
	try {
		if (!await bounded(join(root, 'out/daemon/index.js'), 32 * 1024 * 1024)) throw new Error('compiled daemon entry is absent');
		if (runtime) fingerprint = await measureManagedReleaseFingerprint(root, runtime);
	}
	catch { issues.push('compiled-output-or-dependencies-incomplete'); }
	if (input.knownBuild && input.knownBuild.root === root && input.knownBuild.runtime === runtime
		&& input.knownBuild.fingerprint === fingerprint) builtCommit = input.knownBuild.commit;
	else if (input.knownBuild) issues.push('known-build-bytes-mismatch');
	if (builtCommit && builtCommit !== sourceHead) issues.push('source-head-ahead-of-known-built-release');
	if (declaration && builtCommit && declaration.releaseId !== builtCommit) issues.push('built-declaration-mismatch');
	if (!builtCommit) issues.push('built-provenance-unproven');
	return { root, sourceHead, changes, runtime, live, lockBlob, lockSha256, marker, declaration, sourceMatchesBuild,
		fingerprint, builtCommit, issues: [...new Set(issues)] };
}

/** Structured argv avoids shell interpolation and never proposes reusing an unqualified data directory. */
export function sourceRecoveryGuidance(stateRoot: string, installationRoot: string, runtime: string) {
	return {
		inspect: [runtime, join(packageRoot, 'out/bin/insrc-source-recovery.js'), 'inspect', stateRoot, installationRoot, runtime],
		stageRollback: { argv: [runtime, join(packageRoot, 'out/bin/insrc-source-recovery.js'), 'prepare', '<request.json>', '--rebuild-predecessor'],
			prerequisite: 'Use a current independently authenticated bootstrap, an exact last-known-good commit and a signed catalog explicitly authorizing its recovery tree.' },
		sideBySide: { argv: ['/bin/bash', '<current-authenticated-installer>', '--target', `${installationRoot}-recovery`, '--no-start'],
			env: { HOME: `${stateRoot}-recovery-home` },
			prerequisite: 'Use a separate empty home/state; retain the incumbent data. Reusing data requires explicit compatibility qualification and original-process closure by its lifecycle owner.' },
	};
}

/** Preparation only: even a rebuilt baseline is never an authorization to select or start it. */
export async function prepareSourcePredecessor(input: SourceQualificationInput, incumbent: PredecessorInventoryInput,
	options: { readonly rebuildPredecessor?: boolean | undefined; readonly bootstrapRoot: string },
) {
	const guidance = sourceRecoveryGuidance(input.stateRoot, incumbent.root, input.runtime);
	let inventory: Awaited<ReturnType<typeof inspectSourcePredecessor>>;
	try { inventory = await inspectSourcePredecessor(incumbent); }
	catch (error) { return { decision: 'recovery-required' as const, guidance,
		reason: `Predecessor inventory is unavailable; retain all incumbent files and data: ${error instanceof Error ? error.message : String(error)}` }; }
	let qualified: Awaited<ReturnType<typeof qualifySourceRelease>>;
	try { qualified = await qualifySourceRelease(input); }
	catch (error) { return { decision: 'recovery-required' as const, inventory, guidance,
		reason: `Authenticated predecessor compatibility is unavailable: ${error instanceof Error ? error.message : String(error)}` }; }
	const pair = qualified.qualification.pairs[0]!;
	const expected = incumbent.knownBuild?.fingerprint ?? pair.priorFingerprint;
	const pin: StagedReleasePin | undefined = inventory.runtime && inventory.fingerprint && expected === inventory.fingerprint
		? { root: inventory.root, runtime: inventory.runtime, fingerprint: inventory.fingerprint, commit: input.priorCommit } : undefined;
	const severe = inventory.issues.filter(issue => issue !== 'built-provenance-unproven' && issue !== 'install-marker-missing');
	if (!options.rebuildPredecessor) {
		if (!pin || severe.length || inventory.sourceHead !== input.priorCommit
			|| (incumbent.knownBuild && incumbent.knownBuild.commit !== input.priorCommit)
			|| (pair.priorFingerprint && pair.priorFingerprint !== inventory.fingerprint)) {
			return { decision: 'recovery-required' as const, inventory, guidance, reason: 'Actual predecessor bytes/build provenance must qualify independently of source HEAD; no incumbent files were changed.' };
		}
		return { decision: 'existing-qualified' as const, baseline: pin, compatibility: { prior: pair.prior, candidate: pair.candidate },
			inventory, sourceRelease: qualified.receipt, guidance, activationPrerequisites: ['Retain and verify incumbent process capability', 'Qualify quiesced writable stores through their lifecycle owner'] };
	}
	if (!qualified.recovery) return { decision: 'recovery-required' as const, inventory, guidance, reason: 'The authenticated catalog does not authorize rebuilding this predecessor; obtain qualified recovery metadata or use separate empty state.' };
	const authority = await realpath(options.bootstrapRoot), incumbentRoot = await realpath(incumbent.root);
	const rel = relative(incumbentRoot, authority);
	if (!rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw new Error('Recovery bootstrap must be delivered outside the incumbent checkout');
	let baseline: Awaited<ReturnType<typeof stageManagedRelease>>;
	try { baseline = await stageManagedRelease({ stateRoot: input.stateRoot, runtime: input.runtime, source: input.source,
		sourceTarget: input.target, recoveryAuthority: { root: authority },
		qualification: { source: input.source, candidate: pair.prior, pairs: [] }, checkoutAuthorized: async checkout => {
			const current = await qualifySourceRelease(input, checkout, true);
			if (!isDeepStrictEqual(current, qualified)) throw new Error('Recovery authorization changed while staging the predecessor');
		} }); } catch (error) {
		return { decision: 'recovery-required' as const, inventory, guidance,
			reason: `Independent predecessor staging failed; incumbent remains unchanged: ${error instanceof Error ? error.message : String(error)}` };
	}
	return { decision: 'rebuild-staged' as const, baseline: baseline.candidate, compatibility: { prior: pair.prior, candidate: pair.candidate },
		inventory, sourceRelease: qualified.receipt, recoveryTree: qualified.recovery.tree, guidance,
		activationPrerequisites: ['Retain and verify incumbent process capability', 'Qualify quiesced writable stores through their lifecycle owner', 'Use the platform transaction owner for selection/rollback; never start the retained checkout directly'] };
}
