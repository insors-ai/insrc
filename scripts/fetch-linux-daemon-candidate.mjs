/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { linuxCandidateArtifactName, readLinuxBuildPolicy } from './linux-daemon-dispatch.mjs';
import { LINUX_ARCHIVE_LIMIT, LINUX_RELEASE_TARGET, linuxArchiveName, readLinuxCandidateOrigin,
	readLinuxReleaseJson, requireLinuxFields } from './linux-daemon-metadata.mjs';

const workflow = '.github/workflows/daemon-linux-candidate.yml';
const digest = /^[a-f0-9]{64}$/;
const positive = (n, max) => Number.isSafeInteger(n) && n > 0 && n <= max;
const matchesId = (a, b) => String(a) === b;
const maxZip = LINUX_ARCHIVE_LIMIT + 1024 ** 2;
const maxMetadata = 8192;

function requireOrigin(condition, note) {
	if (!condition) throw new Error(`invalid Linux candidate origin: ${note}`);
}

export function verifyLinuxArtifactOrigin({ request, policy, run, job, artifact, now = Date.now() }) {
	const { repository, ref, commit, runId, runAttempt, artifactId } = readLinuxCandidateOrigin(request.origin);
	const { lane, version, workflowId } = request;
	const archiveName = linuxArchiveName(version, lane);
	const branch = ref.slice('refs/heads/'.length);
	requireOrigin(lane === 'production'
		? ref === policy.releaseRef && policy.releaseRefProtected === true
		: policy.developmentRefs.includes(ref), 'release ref policy');
	requireOrigin(matchesId(run.id, runId) && run.run_attempt === runAttempt && matchesId(run.workflow_id, workflowId) &&
		matchesId(run.repository?.id, repository) && matchesId(run.head_repository?.id, repository) &&
		[workflow, `${workflow}@${branch}`, `${workflow}@${ref}`].includes(run.path) &&
		run.head_branch === branch && run.head_sha === commit &&
		run.event === 'workflow_dispatch' && run.status === 'completed' && run.conclusion === 'success', 'exact workflow attempt');
	// The jobs response is fetched from the exact-attempt endpoint. Older
	// responses omit run_attempt inside individual jobs.
	requireOrigin(matchesId(job.run_id, runId) && (job.run_attempt === undefined || job.run_attempt === runAttempt) && job.head_sha === commit &&
		job.name === 'build' && job.status === 'completed' && job.conclusion === 'success', 'exact candidate job');
	const uploadedAt = Date.parse(artifact.created_at);
	requireOrigin(matchesId(artifact.id, artifactId) && artifact.name === linuxCandidateArtifactName(lane, commit, runAttempt) &&
		matchesId(artifact.workflow_run?.id, runId) && matchesId(artifact.workflow_run?.repository_id, repository) &&
		matchesId(artifact.workflow_run?.head_repository_id, repository) && artifact.workflow_run?.head_branch === branch &&
		artifact.workflow_run?.head_sha === commit, 'exact uploaded artifact');
	requireOrigin(uploadedAt >= Date.parse(job.started_at) && uploadedAt <= Date.parse(job.completed_at) &&
		artifact.expired === false && Date.parse(artifact.expires_at) > now && positive(artifact.size_in_bytes, maxZip),
		'artifact upload window, expiry or size');
	const transportSha256 = /^sha256:([a-f0-9]{64})$/.exec(artifact.digest ?? '')?.[1];
	requireOrigin(transportSha256 || digest.test(request.expectedArchiveSha256), 'missing authenticated digest');
	return { origin: request.origin, lane, version, archiveName, zipBytes: artifact.size_in_bytes, transportSha256,
		expectedArchiveSha256: request.expectedArchiveSha256 };
}

async function writeBounded(input, path, limit, child) {
	const hash = createHash('sha256');
	let bytes = 0;
	const count = new Transform({
		transform(chunk, _encoding, done) {
			bytes += chunk.length;
			if (bytes > limit) return done(new Error('candidate output exceeds its bound'));
			hash.update(chunk);
			done(null, chunk);
		},
	});
	const status = child ? new Promise((done, reject) => {
		child.once('error', reject);
		child.once('close', code => code === 0 ? done() : reject(new Error('candidate data command failed')));
	}) : undefined;
	try {
		await Promise.all([pipeline(input, count, createWriteStream(path, { flags: 'wx', mode: 0o600 })), status]);
	} catch (error) {
		child?.kill();
		throw error;
	}
	return { bytes, sha256: hash.digest('hex') };
}

function extractMember(zip, member, path, limit) {
	const child = spawn('/usr/bin/unzip', ['-p', zip, member], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 });
	return writeBounded(child.stdout, path, limit, child);
}

async function extractCandidate(zip, destination, expected) {
	const names = execFileSync('/usr/bin/unzip', ['-Z1', zip], { encoding: 'utf8', timeout: 15_000, maxBuffer: 4096 })
		.trimEnd().split('\n').sort();
	requireOrigin(names.length === 2 && names[0] === 'candidate.json' && names[1] === expected.archiveName,
		'ZIP must contain exactly the candidate record and expected archive');
	const recordPath = join(destination, 'candidate.json');
	await extractMember(zip, 'candidate.json', recordPath, maxMetadata);
	const record = readLinuxReleaseJson(await readFile(recordPath), maxMetadata);
	requireLinuxFields(record, ['schemaVersion', 'target', 'lane', 'version', 'repository', 'ref', 'commit', 'runId', 'runAttempt',
		'archiveName', 'archiveBytes', 'archiveSha256', 'runtimeFingerprint', 'host'], 'candidate record fields');
	const { artifactId, ...origin } = expected.origin;
	requireOrigin(record.schemaVersion === 1 && record.target === LINUX_RELEASE_TARGET &&
		Object.entries(origin).every(([key, value]) => record[key] === value) &&
		record.lane === expected.lane && record.version === expected.version && record.archiveName === expected.archiveName &&
		positive(record.archiveBytes, LINUX_ARCHIVE_LIMIT) && digest.test(record.archiveSha256) && digest.test(record.runtimeFingerprint) &&
		(!expected.expectedArchiveSha256 || record.archiveSha256 === expected.expectedArchiveSha256), 'candidate record identity');
	const archive = await extractMember(zip, expected.archiveName, join(destination, expected.archiveName), record.archiveBytes);
	requireOrigin(archive.bytes === record.archiveBytes && archive.sha256 === record.archiveSha256, 'archive bytes or digest');
	await writeFile(join(destination, 'verified-origin.json'), JSON.stringify(expected.origin), { flag: 'wx', mode: 0o600 });
	return { record, origin: expected.origin };
}

export async function retrieveLinuxCandidate(expected, source, destination) {
	const temporary = await mkdtemp(join(tmpdir(), 'insrc-linux-download-'));
	await chmod(temporary, 0o700);
	let created = false;
	try {
		const zip = join(temporary, 'artifact.zip');
		const child = typeof source === 'string' ? undefined
			: spawn('gh', ['api', source.endpoint], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 });
		const input = typeof source === 'string' ? createReadStream(source) : child.stdout;
		const transport = await writeBounded(input, zip, expected.zipBytes, child);
		requireOrigin(transport.bytes === expected.zipBytes &&
			(!expected.transportSha256 || transport.sha256 === expected.transportSha256), 'ZIP bytes or digest');
		await mkdir(destination, { mode: 0o700 });
		created = true;
		return await extractCandidate(zip, destination, expected);
	} catch (error) {
		if (created) await rm(destination, { recursive: true, force: true });
		throw error;
	} finally { await rm(temporary, { recursive: true, force: true }); }
}

function githubJson(endpoint) {
	const json = execFileSync('gh', ['api', endpoint], { encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024 });
	// The API represents IDs as JSON numbers. Preserve their exact decimal token.
	return JSON.parse(json, (key, value, context) =>
		typeof value === 'number' && (key === 'id' || key.endsWith('_id')) ? context.source : value);
}

export async function fetchLinuxDaemonCandidate({ repo, lane, version, expectedArchiveSha256, origin, policy, destination }) {
	readLinuxCandidateOrigin(origin);
	requireOrigin(typeof repo === 'string' && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo), 'repository slug');
	const prefix = `repos/${repo}`;
	const { ref, runId, runAttempt, artifactId } = origin;
	const repository = githubJson(prefix);
	requireOrigin(matchesId(repository.id, origin.repository), 'configured repository id');
	const workflowId = String(githubJson(`${prefix}/actions/workflows/daemon-linux-candidate.yml`).id);
	const runPath = `${prefix}/actions/runs/${runId}/attempts/${runAttempt}`;
	const run = githubJson(runPath);
	const jobs = githubJson(`${runPath}/jobs?per_page=100`);
	requireOrigin(jobs.total_count === jobs.jobs.length, 'candidate job list is incomplete');
	const candidates = jobs.jobs.filter(job => job.name === 'build');
	requireOrigin(candidates.length === 1, 'missing or ambiguous candidate job');
	const artifactPath = `${prefix}/actions/artifacts/${artifactId}`;
	const releaseRefProtected = lane === 'production' &&
		githubJson(`${prefix}/branches/${encodeURIComponent(ref.slice('refs/heads/'.length))}`).protected === true;
	const expected = verifyLinuxArtifactOrigin({ request: { origin, lane, version, workflowId, expectedArchiveSha256 },
		policy: { ...policy, releaseRefProtected }, run, job: candidates[0], artifact: githubJson(artifactPath) });
	return retrieveLinuxCandidate(expected, { endpoint: `${artifactPath}/zip` }, destination);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	const [originPath, lane, version, destination, ...extra] = process.argv.slice(2);
	if (!originPath || !lane || !version || !destination || extra.length) {
		throw new Error('usage: fetch-linux-daemon-candidate.mjs EXPECTED_ORIGIN LANE VERSION NEW_DIRECTORY');
	}
	const request = readLinuxReleaseJson(await readFile(originPath), maxMetadata);
	requireLinuxFields(request, ['origin', 'expectedArchiveSha256'], 'protected request fields');
	const policy = readLinuxBuildPolicy(process.env.LINUX_RELEASE_REF, process.env.LINUX_DEVELOPMENT_REFS);
	await fetchLinuxDaemonCandidate({ ...request, repo: process.env.GH_REPO, policy, lane, version, destination });
}
