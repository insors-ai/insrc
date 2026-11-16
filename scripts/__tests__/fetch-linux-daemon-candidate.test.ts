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

test('GitHub fetch path separates same-version Linux and Darwin artifacts by workflow and exact attempt', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-linux-fetch-gh-'));
	try {
		const bytes = Buffer.from('independent fixture runtime');
		const branch = 'main';
		const productionVersion = '0.2.1-pilot.1';
		const source = { repository: '42', ref: 'refs/heads/main', commit: origin.commit, runId: '100', runAttempt: 2, artifactId: '101' };
		const runtimeOrigin = { ...source, artifactId: undefined };
		const build = { ...run, id: 100, workflow_id: 63, path: workflow, head_branch: branch };
		const current = new Date(Date.now() - 2_000).toISOString();
		const created = new Date(Date.now() - 1_000).toISOString();
		const completed = new Date().toISOString();
		const expiry = new Date(Date.now() + 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
		const actionJob = { ...job, run_id: 100, started_at: current, completed_at: completed };
		const archiveLinux = `insrc-daemon-${productionVersion}-linux-x64.tar.gz`;
		const archiveDarwin = `insrc-daemon-${productionVersion}-darwin-arm64.tar.gz`;
		const zip = (member: string, candidate: object, file: string) => {
			writeFileSync(join(root, 'candidate.json'), JSON.stringify(candidate));
			writeFileSync(join(root, member), bytes);
			const result = spawnSync('zip', ['-q', '-0', file, 'candidate.json', member], { cwd: root, encoding: 'utf8' });
			assert.equal(result.status, 0, result.stderr);
			return join(root, file);
		};
		const linuxZip = zip(archiveLinux, { schemaVersion: 1, target: 'linux-x64', lane: 'production', version: productionVersion,
			...runtimeOrigin, archiveName: archiveLinux, archiveBytes: bytes.length, archiveSha256: sha256(bytes),
			runtimeFingerprint: 'c'.repeat(64), host: {} }, 'linux.zip');
		const darwinZip = zip(archiveDarwin, { branch, lane: 'release', commit: source.commit, runId: '100',
			runAttempt: '2', archiveName: archiveDarwin }, 'darwin.zip');
		const linuxZipBytes = readFileSync(linuxZip);
		const artifactLinux = { ...artifact, id: 101, name: `daemon-candidate-linux-x64-production-${source.commit}-2`,
			workflow_run: { ...artifact.workflow_run, id: 100, head_branch: branch }, created_at: created, expires_at: expiry,
			size_in_bytes: linuxZipBytes.length, digest: 'sha256:' + sha256(linuxZipBytes) };
		const artifactDarwin = { ...artifactLinux, id: 102, name: `daemon-candidate-release-${source.commit}-2` };
		const requests = join(root, 'requests.log');
		writeFileSync(join(root, 'gh'), `#!/bin/bash
printf '%s\\n' "$2" >> "$MOCK_LOG"
case "$2" in
 repos/owner/repo) if [[ "$3" == --jq ]]; then echo 42; else echo '{"id":42}'; fi;;
 */workflows/daemon-linux-candidate.yml) echo '{"id":63}';;
 */workflows/daemon-candidate.yml) echo 44;;
 */branches/main) echo '{"protected":true}';;
 */runs/100/attempts/2/jobs*) printf '%s' "$MOCK_JOB";;
 */runs/100/attempts/2) printf '%s' "$MOCK_RUN";;
 */artifacts/101|*/artifacts/102) printf '%s' "$MOCK_ARTIFACT";;
 */artifacts/101/zip|*/artifacts/102/zip) cat "$MOCK_ZIP";;
 *) exit 3;;
esac
`, { mode: 0o700 });
		const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, GH_REPO: 'owner/repo',
			LINUX_RELEASE_REF: source.ref, LINUX_DEVELOPMENT_REFS: '[]', MOCK_LOG: requests,
			MOCK_JOB: JSON.stringify({ total_count: 1, jobs: [actionJob] }) };
		const where = join(root, 'expected.json');
		writeFileSync(where, JSON.stringify({ origin: source, expectedArchiveSha256: sha256(bytes) }));
		const linux = (directory: string, details = artifactLinux) => spawnSync(process.execPath,
			[new URL('../fetch-linux-daemon-candidate.mjs', import.meta.url).pathname, where, 'production', productionVersion, directory],
			{ encoding: 'utf8', env: { ...env, MOCK_RUN: JSON.stringify(build), MOCK_ARTIFACT: JSON.stringify(details), MOCK_ZIP: linuxZip } });
		const linuxOutput = join(root, 'linux-output');
		const received = linux(linuxOutput);
		assert.equal(received.status, 0, received.stderr);
		assert(existsSync(join(linuxOutput, archiveLinux)));
		const darwinOutput = join(root, 'darwin-output');
		const darwin = spawnSync('/bin/bash', [new URL('../daemon-release-artifact.sh', import.meta.url).pathname,
			'100', '2', '102', source.commit, darwinOutput], { encoding: 'utf8', env: { ...env,
				MOCK_RUN: JSON.stringify({ ...build, workflow_id: 44, path: '.github/workflows/daemon-candidate.yml' }),
				MOCK_ARTIFACT: JSON.stringify(artifactDarwin), MOCK_ZIP: darwinZip } });
		assert.equal(darwin.status, 0, darwin.stderr);
		assert(existsSync(join(darwinOutput, archiveDarwin)));
		assert(!existsSync(join(darwinOutput, archiveLinux)));
		writeFileSync(requests, '');
		const substituted = linux(join(root, 'substituted'), { ...artifactDarwin, id: 101 });
		assert.notEqual(substituted.status, 0);
		assert.match(substituted.stderr, /exact uploaded artifact/);
		assert.doesNotMatch(readFileSync(requests, 'utf8'), /\/zip/);
	} finally { rmSync(root, { recursive: true, force: true }); }
});
