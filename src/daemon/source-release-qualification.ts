/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { execFile } from 'node:child_process';
import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { readVerifiedSourceRelease } from '../shared/managed-source-release.js';
import type { VerifiedSourceRelease } from '../shared/managed-source-release.js';
import { cleanNodeEnvironment } from '../shared/owned-node-runtime.js';
import { readTaggedReleaseCompatibility } from '../shared/source-release-compatibility.js';
import { readSourceReleaseTarget } from '../shared/source-release-target.js';
import type { SourceReleaseTarget } from '../shared/source-release-target.js';
import { checkUpdateSource } from '../shared/update-source.js';
import { stageManagedRelease } from './managed-release-staging.js';

const exec = promisify(execFile);

export interface SourceQualificationInput {
	readonly stateRoot: string;
	/** Verified bootstrap/prior runtime, supplied by the lifecycle owner. */
	readonly runtime: string;
	/** Independently delivered, key-pinned verifier; never one from the candidate. */
	readonly verifier: string;
	readonly source: { readonly repoUrl: string; readonly branch: string };
	readonly priorCommit: string;
	readonly target?: SourceReleaseTarget | undefined;
	readonly launchProfile?: string | undefined;
	/** Existing lifecycle owner retains its durable source floor at the same boundary. */
	readonly observeSourceRelease?: ((release: VerifiedSourceRelease) => Promise<void>) | undefined;
}

/** Portable source authority. It does not reserve, select, stop or start an installation. */
export async function qualifySourceRelease(input: SourceQualificationInput, checkout?: string, rebuildPredecessor = false) {
	const target = readSourceReleaseTarget(input.target ?? (process.platform === 'darwin' ? 'darwin' : `${process.platform}-${process.arch}`));
	checkUpdateSource(input.source);
	if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.priorCommit)) throw new Error('source qualification requires an exact predecessor commit');
	if (target !== 'darwin' && !input.launchProfile) throw new Error('Linux source qualification requires a launch profile');
	const info = await lstat(input.verifier);
	if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o077) !== 0
		|| info.size > 1024 * 1024) throw new Error('installed release verifier is not a bounded private file');
	const staging = await realpath(await mkdtemp(join(tmpdir(), 'insrc-release-qualification-')));
	try {
		const result = await exec(input.runtime, [input.verifier, rebuildPredecessor ? 'recovery' : 'qualification', staging, input.stateRoot,
			input.source.repoUrl, input.source.branch, ...(checkout === undefined ? [] : [checkout]),
			...(target === 'darwin' && !rebuildPredecessor ? [] : [`--target=${target}`, `--prior=${input.priorCommit}`, `--profile=${input.launchProfile}`])], {
			env: cleanNodeEnvironment(process.env), timeout: 180_000, maxBuffer: 128 * 1024,
		});
		const output = JSON.parse(result.stdout) as { receipt: unknown; catalog: string; compatibility: string; target?: string };
		const receipt = readVerifiedSourceRelease(output.receipt);
		if (!isDeepStrictEqual(input.source, receipt.channel) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(output.catalog)
			|| (target !== 'darwin' && output.target !== target)) {
			throw new Error('verified source receipt does not match the update channel, target or catalog');
		}
		await input.observeSourceRelease?.(receipt);
		const pair = readTaggedReleaseCompatibility(JSON.parse(output.compatibility), input.priorCommit, receipt.commit, target);
		if (input.launchProfile !== undefined && !pair.launchProfiles.includes(input.launchProfile)) {
			throw new Error('signed source does not support the requested launch profile');
		}
		return { receipt, catalog: output.catalog, launchProfiles: pair.launchProfiles,
			...(pair.recovery === undefined ? {} : { recovery: pair.recovery }),
			qualification: { source: input.source, candidate: pair.candidate, pairs: [{ prior: pair.prior, candidate: pair.candidate,
				...(pair.priorFingerprint === undefined ? {} : { priorFingerprint: pair.priorFingerprint }) }] } };
	} finally { await rm(staging, { recursive: true, force: true }); }
}

/** Prepare through the same staging owner without invoking a Darwin lifecycle owner. */
export async function stageQualifiedSourceRelease(input: SourceQualificationInput, priorRoot: string, priorRuntime: string) {
	const target = readSourceReleaseTarget(input.target ?? (process.platform === 'darwin' ? 'darwin' : `${process.platform}-${process.arch}`));
	if (target !== 'darwin' && target !== `${process.platform}-${process.arch}`) throw new Error('source staging target does not match this host');
	const qualifiedInput = { ...input, target };
	const initial = await qualifySourceRelease(qualifiedInput);
	const staged = await stageManagedRelease({ stateRoot: input.stateRoot, runtime: input.runtime,
		source: input.source, qualification: initial.qualification, prior: { root: priorRoot, runtime: priorRuntime },
		sourceTarget: target, checkoutAuthorized: async checkout => {
			const current = await qualifySourceRelease(qualifiedInput, checkout);
			if (!isDeepStrictEqual(current, initial)) throw new Error('source qualification changed during preparation');
		} });
	return { ...staged, sourceRelease: initial.receipt, catalog: initial.catalog, launchProfiles: initial.launchProfiles };
}
