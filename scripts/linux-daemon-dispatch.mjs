/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linuxArchiveName, LINUX_RELEASE_TARGET, readLinuxReleaseJson, requireLinuxBranchRef } from './linux-daemon-metadata.mjs';

const commitId = /^[a-f0-9]{40}$/;
const id = /^[1-9][0-9]{0,19}$/;

export function readLinuxBuildPolicy(releaseRef, developmentRefsJson) {
	requireLinuxBranchRef(releaseRef);
	const refs = JSON.parse(developmentRefsJson);
	if (!Array.isArray(refs) || refs.length > 128 || new Set(refs).size !== refs.length || refs.includes(releaseRef)) {
		throw new Error('invalid Linux release ref policy');
	}
	for (const ref of refs) requireLinuxBranchRef(ref);
	return { releaseRef, developmentRefs: refs };
}

export function linuxCandidateArtifactName(lane, commit, runAttempt) {
	if (!['development', 'production'].includes(lane) || !commitId.test(commit) ||
		!Number.isSafeInteger(runAttempt) || runAttempt < 1 || runAttempt > 999) throw new Error('invalid Linux candidate coordinate');
	return `daemon-candidate-linux-x64-${lane}-${commit}-${runAttempt}`;
}

export function linuxBuildDispatch(env) {
	const { REQUESTED_COMMIT: commit, RELEASE_VERSION: version, RELEASE_LANE: lane, GITHUB_SHA: sha,
		GITHUB_REF: ref, GITHUB_REF_PROTECTED: protectedRef, GITHUB_REPOSITORY_ID: repository, GITHUB_RUN_ID: runId,
		GITHUB_RUN_ATTEMPT: attempt, GITHUB_EVENT_NAME: event, LINUX_RELEASE_REF, LINUX_DEVELOPMENT_REFS } = env;
	const policy = readLinuxBuildPolicy(LINUX_RELEASE_REF, LINUX_DEVELOPMENT_REFS);
	linuxArchiveName(version, lane);
	if (!commitId.test(commit) || commit !== sha || !id.test(repository) || !id.test(runId) ||
		!/^[1-9][0-9]{0,2}$/.test(attempt) || event !== 'workflow_dispatch') throw new Error('invalid exact Linux build dispatch');
	if (lane === 'production' ? (ref !== policy.releaseRef || protectedRef !== 'true') : !policy.developmentRefs.includes(ref)) {
		throw new Error('Linux build ref is not authorized for this lane');
	}
	const runAttempt = Number(attempt);
	return { repository, ref, commit, runId, runAttempt, lane, version, artifactName: linuxCandidateArtifactName(lane, commit, runAttempt) };
}

async function recordCandidate(path, identity) {
	const record = readLinuxReleaseJson(await readFile(path), 8192);
	if (record.target !== LINUX_RELEASE_TARGET || record.commit !== identity.commit || record.version !== identity.version ||
		record.lane !== identity.lane) throw new Error('packaged Linux candidate differs from dispatch');
	const { repository, ref, runId, runAttempt } = identity;
	await writeFile(path, JSON.stringify({ ...record, repository, ref, runId, runAttempt }));
	return record.archiveSha256;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	const [phase, directory, ...extra] = process.argv.slice(2);
	const identity = linuxBuildDispatch(process.env);
	if (phase === 'record' && directory && !extra.length) {
		const archiveSha256 = await recordCandidate(join(directory, 'candidate.json'), identity);
		process.stdout.write(`artifact_name=${identity.artifactName}\narchive_sha256=${archiveSha256}\n`);
	} else if (phase !== 'check' || directory) {
		throw new Error('usage: linux-daemon-dispatch.mjs check | record BUILD_DIRECTORY');
	}
}
