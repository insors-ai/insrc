/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
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
import { managedReleaseGit as git, stageManagedRelease, verifyStagedReleasePin } from './managed-release-staging.js';
import type { ManagedReleaseQualification } from './managed-release-staging.js';
import { completeLegacyMigration, completeManagedUpdate } from './managed-update-recovery.js';
import { readReleaseCompatibility } from './release-compatibility.js';

type Update = Extract<MutationReservation, { kind: 'update' }>;
type Source = { readonly repoUrl: string; readonly branch: string };
const NOTES = 'refs/notes/insrc-daemon-updates';

async function sourceFor(stateRoot: string, releaseRoot: string, override?: UpdateSource): Promise<Source> {
	const config = readUpdateSource(join(stateRoot, 'config.json'));
	const repoUrl = override?.repoUrl || config.repoUrl || await git(releaseRoot, ['remote', 'get-url', 'origin']);
	const branch = override?.branch || config.branch || await git(releaseRoot, ['symbolic-ref', '--short', 'HEAD']);
	checkUpdateSource({ repoUrl, branch });
	return { repoUrl, branch };
}

/** Read the release authority's Git note for the exact configured origin head. */
async function originQualification(source: Source): Promise<ManagedReleaseQualification> {
	const staging = await mkdtemp(join(tmpdir(), 'insrc-release-qualification-'));
	try {
		await git(staging, ['init', '--quiet']);
		await git(staging, ['fetch', '--quiet', '--depth=1', '--no-tags', '--', source.repoUrl,
			`refs/heads/${source.branch}:refs/insrc/candidate`, `${NOTES}:${NOTES}`]);
		const commit = await git(staging, ['rev-parse', '--verify', 'refs/insrc/candidate^{commit}']);
		const text = await git(staging, ['notes', `--ref=${NOTES}`, 'show', commit]);
		const note = JSON.parse(text) as Partial<ManagedReleaseQualification>;
		if (note?.source?.repoUrl !== source.repoUrl || note.source?.branch !== source.branch || !Array.isArray(note.pairs)) {
			throw new Error('release qualification does not name the configured source');
		}
		const candidate = readReleaseCompatibility(note.candidate);
		if (candidate.releaseId !== commit) throw new Error('release qualification does not pin the configured head');
		const pairs = note.pairs.map(pair => {
			if (typeof pair.priorFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(pair.priorFingerprint)) {
				throw new Error('release qualification is missing an independent prior fingerprint');
			}
			return { prior: readReleaseCompatibility(pair.prior), candidate: readReleaseCompatibility(pair.candidate),
				priorFingerprint: pair.priorFingerprint };
		});
		return { source, candidate, pairs };
	} finally { await rm(staging, { recursive: true, force: true }); }
}

async function stageRelease(prior: ManagedInstallation, runtime: string, override?: UpdateSource) {
	const source = await sourceFor(prior.stateRoot, prior.releaseRoot, override);
	const qualification = await originQualification(source);
	const staged = await stageManagedRelease({ stateRoot: prior.stateRoot, runtime, source, qualification,
		prior: { root: prior.releaseRoot, runtime: prior.runtime } });
	if (staged.prior === undefined || staged.compatibility === undefined) throw new Error('prior release did not qualify for cutover');
	await verifyStagedReleasePin(staged.prior);
	await verifyStagedReleasePin(staged.candidate);
	return { prior: staged.prior, compatibility: staged.compatibility,
		candidate: { ...prior, enabled: true, releaseRoot: staged.candidate.root,
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
		prepared = await stageRelease(prior, prior.runtime, override);
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
	return completeManagedUpdate(gate, qualified, { prior, candidate: prepared.candidate, compatibility: prepared.compatibility });
}

/** A current installer runs this bridge from outside the incumbent checkout. */
export async function prepareLegacyUpgrade(root: string, checkout: string, override: UpdateSource) {
	const baseline = await readInstallationSelector(root);
	if (baseline?.enabled) throw new Error('legacy upgrade requires an unmanaged installation');
	const pidFile = installationPaths(root).daemonPid;
	const pid = runFileIdentity(pidFile) === undefined ? undefined : Number((await readFile(pidFile, 'utf8')).trim());
	const runtime = pid === undefined ? await realpath(process.execPath) : (await readDarwinIncarnation(pid)).executable;
	const priorRoot = await realpath(checkout);
	const priorCommit = await git(priorRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
	const prior: ManagedInstallation = { version: 1, stateRoot: root, releaseRoot: priorRoot, releaseId: priorCommit,
		runtime, enabled: false, pathEnv: process.env['PATH'] ?? '/usr/bin:/bin' };
	const prepared = await stageRelease(prior, process.execPath, override);
	if (baseline !== undefined && !isDeepStrictEqual(baseline, { ...prepared.candidate, enabled: false })) {
		throw new Error('a different provisional installation owns the selector');
	}
	const route = await discoverLegacyLaunch(prior, baseline ?? { ...prepared.candidate, enabled: false });
	const gate = new InstallationMutationGate(root);
	const reservation = await gate.reserve({ kind: 'update', owner: await readDarwinIncarnation(process.pid), predecessor: {
		...route, priorRelease: prior.releaseId, candidateRelease: prepared.candidate.releaseId, priorCommit,
		generation: null, pins: { prior, candidate: prepared.candidate }, ...(baseline === undefined ? { selectorAbsent: true } : {}),
	} });
	if (reservation.kind !== 'update') throw new Error('expected legacy upgrade reservation');
	return completeLegacyMigration(gate, reservation, { prior, candidate: prepared.candidate, compatibility: prepared.compatibility });
}
