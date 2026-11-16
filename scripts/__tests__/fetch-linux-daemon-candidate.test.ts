import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { verifyLinuxArtifactOrigin, retrieveLinuxCandidate } =
	await import(new URL('../fetch-linux-daemon-candidate.mjs', import.meta.url).href);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const archiveName = 'insrc-daemon-0.2.1-dev.1-linux-x64.tar.gz';
const origin = { repository: '42', ref: 'refs/heads/team/v3', commit: 'a'.repeat(40),
	runId: '9223372036854775807', runAttempt: 2, artifactId: '111' };
const lane = 'development';
const version = '0.2.1-dev.1';
const request = { origin, lane, version, workflowId: '63' };
const policy = { releaseRef: 'refs/heads/main', developmentRefs: [origin.ref], releaseRefProtected: true };
const workflow = '.github/workflows/daemon-linux-candidate.yml';
const run = { id: origin.runId, run_attempt: 2, workflow_id: 63, repository: { id: 42 }, head_repository: { id: 42 },
	path: workflow + '@refs/heads/team/v3', head_branch: 'team/v3', head_sha: origin.commit,
	event: 'workflow_dispatch', status: 'completed', conclusion: 'success' };
const job = { run_id: origin.runId, head_sha: origin.commit, name: 'build', status: 'completed',
	conclusion: 'success', started_at: '2026-01-01T01:00:00Z', completed_at: '2026-01-01T01:05:00Z' };
const artifact = { id: 111, name: `daemon-candidate-linux-x64-development-${origin.commit}-2`,
	workflow_run: { id: origin.runId, repository_id: 42, head_repository_id: 42, head_branch: 'team/v3', head_sha: origin.commit },
	created_at: '2026-01-01T01:04:00Z', expires_at: '2026-01-15T01:04:00Z', expired: false,
	size_in_bytes: 100, digest: `sha256:${'b'.repeat(64)}` };
const now = Date.parse('2026-01-02T00:00:00Z');
const expected = () => verifyLinuxArtifactOrigin({ request, policy, run, job, artifact, now });

test('Linux candidate origin distinguishes exact workflow attempt and artifact from Darwin and other revisions', () => {
	assert.equal(expected().archiveName, archiveName);
	const foreign = [
		{ run: { ...run, path: '.github/workflows/daemon-candidate.yml' } },
		{ run: { ...run, path: workflow + '@wrong-branch' } },
		{ run: { ...run, workflow_id: 67 } },
		{ run: { ...run, head_repository: { id: 41 } } },
		{ run: { ...run, run_attempt: 1 } },
		{ job: { ...job, run_attempt: 1 } },
		{ artifact: { ...artifact, id: 112 } },
		{ artifact: { ...artifact, name: `daemon-candidate-development-${origin.commit}-2` } },
		{ artifact: { ...artifact, created_at: '2026-01-01T00:55:00Z' } },
		{ artifact: { ...artifact, expired: true } },
	];
	for (const change of foreign) assert.throws(() => verifyLinuxArtifactOrigin({ request, policy, run, job, artifact, now, ...change }),
		/invalid Linux candidate origin/);
	assert.throws(() => verifyLinuxArtifactOrigin({ request, policy, run, job, artifact: { ...artifact, digest: undefined }, now }),
		/missing authenticated digest/);
	assert.equal(verifyLinuxArtifactOrigin({ request: { ...request, expectedArchiveSha256: 'a'.repeat(64) }, policy, run, job,
		artifact: { ...artifact, digest: undefined }, now }).expectedArchiveSha256, 'a'.repeat(64));
});

test('Linux retrieval verifies both digests and rejects duplicate or foreign ZIP members', async () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-candidate-fetch-'));
	try {
		const content = Buffer.from('exact packaged bytes');
		const { artifactId: _, ...buildOrigin } = origin;
		const record = { schemaVersion: 1, target: 'linux-x64', lane, version, ...buildOrigin, archiveName,
			archiveBytes: content.length, archiveSha256: sha256(content), runtimeFingerprint: 'b'.repeat(64), host: {} };
		writeFileSync(join(root, 'candidate.json'), JSON.stringify(record));
		writeFileSync(join(root, archiveName), content);
		writeFileSync(join(root, 'candidate.txtx'), 'other record');
		const makeZip = (file: string, members: string[]) => {
			const path = join(root, file);
			const zip = spawnSync('zip', ['-q', '-0', path, ...members], { cwd: root, encoding: 'utf8' });
			assert.equal(zip.status, 0, zip.stderr);
			return path;
		};
		const options = (path: string) => {
			const bytes = readFileSync(path);
			return { ...expected(), transportSha256: sha256(bytes), zipBytes: bytes.length };
		};
		const zip = makeZip('valid.zip', ['candidate.json', archiveName]);
		const accepted = join(root, 'accepted');
		await retrieveLinuxCandidate(options(zip), zip, accepted);
		assert.deepEqual(readFileSync(join(accepted, archiveName)), content);
		assert.deepEqual(JSON.parse(readFileSync(join(accepted, 'verified-origin.json'), 'utf8')), origin);
		const tampered = join(root, 'tampered');
		await assert.rejects(retrieveLinuxCandidate({ ...options(zip), transportSha256: 'c'.repeat(64) }, zip, tampered), /ZIP bytes or digest/);
		assert(!existsSync(tampered));
		await assert.rejects(retrieveLinuxCandidate({ ...options(zip), expectedArchiveSha256: 'd'.repeat(64) }, zip, tampered), /record identity/);
		assert(!existsSync(tampered));
		const foreign = makeZip('foreign.zip', ['candidate.json', 'candidate.txtx', archiveName]);
		await assert.rejects(retrieveLinuxCandidate(options(foreign), foreign, tampered), /exactly the candidate record/);
		const duplicateBytes = Buffer.from(readFileSync(foreign).toString('latin1').replaceAll('candidate.txtx', 'candidate.json'), 'latin1');
		const duplicate = join(root, 'duplicate.zip');
		writeFileSync(duplicate, duplicateBytes);
		await assert.rejects(retrieveLinuxCandidate(options(duplicate), duplicate, tampered), /exactly the candidate record/);
		writeFileSync(join(root, archiveName), Buffer.alloc(content.length, 0x61));
		const replacement = makeZip('replacement.zip', ['candidate.json', archiveName]);
		await assert.rejects(retrieveLinuxCandidate(options(replacement), replacement, tampered), /archive bytes or digest/);
		assert(!existsSync(tampered));
	} finally { rmSync(root, { recursive: true, force: true }); }
});
