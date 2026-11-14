/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { lstat, mkdir, mkdtemp, open, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { isDeepStrictEqual, promisify } from 'node:util';
import { accepted, openManagedSupervisorLink } from '../cli/services/managed-daemon-control.js';
import { readDarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { runFileIdentity } from '../shared/daemon-run-files.js';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';
import type { MutationReservation } from '../shared/installation-mutation-gate.js';
import { installationPaths, readInstallationSelector, readManagedInstallation } from '../shared/managed-daemon-installation.js';
import type { ManagedInstallation } from '../shared/managed-daemon-installation.js';
import { checkUpdateSource, readUpdateSource } from '../shared/update-source.js';
import type { UpdateSource } from '../shared/update-source.js';
import { discoverLegacyLaunch } from './legacy-cutover-admission.js';
import { captureManagedReleasePin, managedReleaseGit as git, stageManagedRelease, verifyStagedReleasePin } from './managed-release-staging.js';
import { readVerifiedSourceRelease } from '../shared/managed-source-release.js';
import type { VerifiedSourceRelease } from '../shared/managed-source-release.js';
import { completeLegacyMigration, completeManagedUpdate } from './managed-update-recovery.js';
import { readTaggedReleaseCompatibility } from './release-compatibility.js';
import { readReleaseCompatibility, requireQualifiedReleasePair } from './release-compatibility.js';
import { verifyManagedBundleManifest, verifyManagedBundleProof } from './managed-bundle-proof.js';
import type { ManagedBundleProof } from './managed-bundle-proof.js';

type Update = Extract<MutationReservation, { kind: 'update' }>;
type Source = { readonly repoUrl: string; readonly branch: string };
const exec = promisify(execFile);
const VERIFIER = 'release-verifier.mjs';

function installedVerifier(stateRoot: string): string {
	return join(installationPaths(stateRoot).directory, VERIFIER);
}

/** Retain the verifier supplied by the current installer for subsequent managed updates. */
export async function retainManagedReleaseVerifier(stateRoot: string, verifier: string): Promise<void> {
	const directory = installationPaths(stateRoot).directory;
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const parent = await lstat(directory);
	if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o077) !== 0) {
		throw new Error('release verifier directory is not private and owned');
	}
	const input = await lstat(verifier);
	if (!input.isFile() || input.uid !== process.getuid?.() || input.nlink !== 1 || (input.mode & 0o077) !== 0
		|| input.size > 1024 * 1024) throw new Error('installer release verifier is not a bounded private file');
	const bytes = await readFile(verifier);
	const path = installedVerifier(stateRoot);
	const output = await open(path, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => {
		if (error.code !== 'EEXIST') throw error;
	});
	if (output === undefined) {
		const existing = await lstat(path);
		if (!existing.isFile() || existing.uid !== input.uid || existing.nlink !== 1 || (existing.mode & 0o077) !== 0
			|| existing.size !== bytes.length || !(await readFile(path)).equals(bytes)) {
			throw new Error('existing release verifier differs from the installer');
		}
		return;
	}
	try {
		await output.writeFile(bytes);
		await output.sync();
	} finally { await output.close(); }
}

async function sourceFor(stateRoot: string, releaseRoot: string, override?: UpdateSource): Promise<Source> {
	const config = readUpdateSource(join(stateRoot, 'config.json'));
	const repoUrl = override?.repoUrl || config.repoUrl || await git(releaseRoot, ['remote', 'get-url', 'origin']);
	const branch = override?.branch || config.branch || await git(releaseRoot, ['config', '--get', 'insrc.releaseBranch']).catch(() =>
		git(releaseRoot, ['symbolic-ref', '--short', 'HEAD']));
	checkUpdateSource({ repoUrl, branch });
	return { repoUrl, branch };
}

async function originQualification(prior: ManagedInstallation, source: Source, gate: InstallationMutationGate,
	verifier: string, checkout?: string,
) {
	const info = await lstat(verifier);
	if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o077) !== 0
		|| info.size > 1024 * 1024) throw new Error('installed release verifier is not a bounded private file');
	const staging = await realpath(await mkdtemp(join(tmpdir(), 'insrc-release-qualification-')));
	try {
		const { NODE_OPTIONS: _options, NODE_PATH: _modulePath, ...env } = process.env;
		const result = await exec(prior.runtime, [verifier, 'qualification', staging, prior.stateRoot, source.repoUrl,
			source.branch, ...(checkout === undefined ? [] : [checkout])], {
			env, timeout: 180_000, maxBuffer: 128 * 1024,
		});
		const output = JSON.parse(result.stdout) as { receipt: unknown; catalog: string; compatibility: string };
		const receipt = readVerifiedSourceRelease(output.receipt);
		if (!isDeepStrictEqual(source, receipt.channel) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(output.catalog)) {
			throw new Error('verified source receipt does not match the update channel or catalog');
		}
		await gate.observeSourceRelease(receipt);
		const pair = readTaggedReleaseCompatibility(JSON.parse(output.compatibility), prior.releaseId, receipt.commit);
		return { receipt, catalog: output.catalog, launchProfiles: pair.launchProfiles,
			qualification: { source, candidate: pair.candidate, pairs: [{ prior: pair.prior, candidate: pair.candidate }] } };
	} finally { await rm(staging, { recursive: true, force: true }); }
}

async function stageRelease(prior: ManagedInstallation, runtime: string, gate: InstallationMutationGate,
	verifier: string, override?: UpdateSource, bridgeSource?: VerifiedSourceRelease,
) {
	const source = await sourceFor(prior.stateRoot, prior.releaseRoot, override);
	const initial = await originQualification(prior, source, gate, verifier);
	if (bridgeSource !== undefined && !isDeepStrictEqual(initial.receipt, bridgeSource)) {
		throw new Error('release channel changed after authorizing the installer bridge');
	}
	if (prior.enabled && !initial.launchProfiles.includes('managed')) {
		throw new Error('installed managed launch profile is not supported by the signed source');
	}
	const verifyUnchanged = async (checkout?: string) => {
		const { receipt } = await originQualification(prior, source, gate, verifier, checkout);
		if (!isDeepStrictEqual(receipt, initial.receipt)) {
			throw new Error('release qualification changed during preparation');
		}
		return receipt;
	};
	const staged = await stageManagedRelease({ stateRoot: prior.stateRoot, runtime, source, qualification: initial.qualification,
		prior: { root: prior.releaseRoot, runtime: prior.runtime },
		checkoutAuthorized: async checkout => { await verifyUnchanged(checkout); } });
	if (staged.prior === undefined || staged.compatibility === undefined) throw new Error('prior release did not qualify for cutover');
	await verifyStagedReleasePin(staged.prior);
	await verifyStagedReleasePin(staged.candidate);
	return { prior: staged.prior, compatibility: staged.compatibility, sourceRelease: {
		source: await verifyUnchanged(), catalog: initial.catalog, priorFingerprint: staged.prior.fingerprint,
		candidateFingerprint: staged.candidate.fingerprint,
	}, launchProfiles: initial.launchProfiles, candidate: { ...prior, enabled: true, releaseRoot: staged.candidate.root,
		releaseId: staged.candidate.commit, runtime: staged.candidate.runtime } };
}

/** Admission uses only the installed selector and authenticated supervisor state. */
export async function admitManagedPreparation(root: string) {
	const prior = await readManagedInstallation(root);
	if (prior === undefined) throw new Error('managed update requires an enabled installed daemon');
	const link = await openManagedSupervisorLink(prior);
	const gate = new InstallationMutationGate(root);
	try {
		const status = accepted(await link.call({ op: 'status', generation: null }));
		if (!['idle', 'exited', 'running'].includes(status.state)) throw new Error('predecessor is already changing state');
		const owner = await readDarwinIncarnation(process.pid);
		return { prior, gate, state: status.state,
			reserve: async (): Promise<Update> => {
				const update = await gate.reserve({ kind: 'update', owner, predecessor: { preparing: true,
					priorRelease: prior.releaseId, priorCommit: prior.releaseId, candidateRelease: 'unqualified',
					wasRunning: status.state === 'running', generation: status.generation } });
				if (update.kind !== 'update') throw new Error('expected update preparation reservation');
				try {
					if (!isDeepStrictEqual(await readManagedInstallation(root), prior)) throw new Error('installed release changed before update admission');
					return update;
				} catch (error) { await gate.cancelUnstartedUpdate(update); throw error; }
			} };
	} finally { link.close(); }
}

export async function runManagedPreparation(gate: InstallationMutationGate, update: Update, prior: ManagedInstallation,
	override?: UpdateSource,
) {
	let prepared: Awaited<ReturnType<typeof stageRelease>>;
	try {
		await gate.admit(update);
		prepared = await stageRelease(prior, prior.runtime, gate, installedVerifier(prior.stateRoot), override);
	} catch (error) {
		const detail = `Update preparation failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 900)}`;
		await gate.publishOutcome(update, 'rolled-back', detail);
		await gate.release(update);
		return { id: update.id, decision: 'rolled-back', detail } as const;
	}
	const qualified = await gate.qualifyUpdate(update, { priorRelease: prior.releaseId, priorCommit: prepared.prior.commit,
		candidateRelease: prepared.candidate.releaseId, wasRunning: update.predecessor.wasRunning,
		...(update.predecessor.generation === undefined ? {} : { generation: update.predecessor.generation }),
		pins: { prior, candidate: prepared.candidate } });
	return completeManagedUpdate(gate, qualified, { prior, candidate: prepared.candidate, compatibility: prepared.compatibility,
		sourceRelease: { ...prepared.sourceRelease, launchProfile: 'managed' } });
}

/** A current installer runs this bridge from outside the incumbent checkout. */
export async function prepareLegacyUpgrade(root: string, checkout: string, override: UpdateSource, bootstrap: string) {
	const baseline = await readInstallationSelector(root);
	if (baseline?.enabled) throw new Error('legacy upgrade requires an unmanaged installation');
	const pidFile = installationPaths(root).daemonPid;
	const pid = runFileIdentity(pidFile) === undefined ? undefined : Number((await readFile(pidFile, 'utf8')).trim());
	const runtime = pid === undefined ? await realpath(process.execPath) : (await readDarwinIncarnation(pid)).executable;
	const priorRoot = await realpath(checkout);
	const priorCommit = await git(priorRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
	const prior: ManagedInstallation = { version: 1, stateRoot: root, releaseRoot: priorRoot, releaseId: priorCommit,
		runtime, enabled: false, pathEnv: process.env['PATH'] ?? '/usr/bin:/bin' };
	const gate = new InstallationMutationGate(root);
	const verifier = join(bootstrap, 'verifier.mjs');
	const bridgeSource = readVerifiedSourceRelease(JSON.parse(await readFile(join(bootstrap, 'source-release.json'), 'utf8')));
	const prepared = await stageRelease(prior, process.execPath, gate, verifier, override, bridgeSource);
	await retainManagedReleaseVerifier(root, verifier);
	if (baseline !== undefined && !isDeepStrictEqual(baseline, { ...prepared.candidate, enabled: false })) {
		throw new Error('a different provisional installation owns the selector');
	}
	const route = await discoverLegacyLaunch(prior, baseline ?? { ...prepared.candidate, enabled: false });
	const profile = route.legacy === undefined ? (route.wasRunning ? 'legacy-direct' : 'legacy-stopped')
		: route.legacy.job.program === '/bin/bash' ? 'legacy-shell-job' : 'legacy-node-job';
	if (!prepared.launchProfiles.includes(profile)) throw new Error('legacy launch profile is not supported by the signed source');
	const reservation = await gate.reserve({ kind: 'update', owner: await readDarwinIncarnation(process.pid), predecessor: {
		...route, priorRelease: prior.releaseId, candidateRelease: prepared.candidate.releaseId, priorCommit,
		generation: null, pins: { prior, candidate: prepared.candidate }, ...(baseline === undefined ? { selectorAbsent: true } : {}),
	} });
	if (reservation.kind !== 'update') throw new Error('expected legacy upgrade reservation');
	return completeLegacyMigration(gate, reservation, { prior, candidate: prepared.candidate, compatibility: prepared.compatibility,
		sourceRelease: { ...prepared.sourceRelease, launchProfile: profile } });
}

/** The independently authenticated bootstrap has already staged this exact candidate. */
export async function prepareBundleLegacyUpgrade(candidate: ManagedInstallation, proof: ManagedBundleProof, checkout: string, priorRuntime: string) {
	const root = candidate.stateRoot;
	if (await readInstallationSelector(root) !== undefined) throw new Error('pilot clone migration requires a legacy installation without a selector');
	await verifyManagedBundleProof(candidate, proof);
	const manifest = verifyManagedBundleManifest(proof, candidate.releaseId);
	const source = await captureManagedReleasePin(await realpath(checkout), priorRuntime);
	const predecessors = manifest.predecessors as Array<{ kind: string; commit: string; compatibility: object;
		launchProfiles: string[]; crashConsistentReopening: boolean }>;
	const exact = predecessors.find(item => item.kind === 'source' && item.commit === source.commit && item.crashConsistentReopening);
	if (exact === undefined) throw new Error('bundle does not qualify this clone predecessor');
	const priorProfile = readReleaseCompatibility({ ...exact.compatibility, version: 1, startup: 'rollback-compatible', releaseId: source.commit });
	const declared = await readFile(join(source.root, 'out/release-compatibility.json'), 'utf8')
		.catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
	if (declared !== undefined && !isDeepStrictEqual(readReleaseCompatibility(JSON.parse(declared)), priorProfile)) {
		throw new Error('installed compatibility differs from the signed predecessor declaration');
	}
	const candidateProfile = readReleaseCompatibility({ ...(manifest.compatibility as object), version: 1,
		startup: 'rollback-compatible', releaseId: candidate.releaseId });
	const compatibility = requireQualifiedReleasePair(priorProfile, candidateProfile, [{ prior: priorProfile, candidate: candidateProfile }]);
	const prior: ManagedInstallation = { ...candidate, releaseRoot: source.root, releaseId: source.commit, runtime: source.runtime, enabled: false };
	const route = await discoverLegacyLaunch(prior, { ...candidate, enabled: false });
	const profile = route.legacy === undefined ? (route.wasRunning ? 'legacy-direct' : 'legacy-stopped')
		: route.legacy.job.program === '/bin/bash' ? 'legacy-shell-job' : 'legacy-node-job';
	if (!exact.launchProfiles.includes(profile)) throw new Error('bundle does not qualify the incumbent launch profile');
	const gate = new InstallationMutationGate(root);
	const bundleProof = { priorSourceFingerprint: source.fingerprint, candidate: proof };
	const reservation = await gate.reserve({ kind: 'update', owner: await readDarwinIncarnation(process.pid), predecessor: {
		...route, priorRelease: prior.releaseId, candidateRelease: candidate.releaseId, priorCommit: source.commit,
		generation: null, pins: { prior, candidate }, selectorAbsent: true, bundleProof,
	} }, proof.floor);
	if (reservation.kind !== 'update') throw new Error('expected bundle migration reservation');
	return completeLegacyMigration(gate, reservation, { prior, candidate, compatibility, bundleProof });
}
