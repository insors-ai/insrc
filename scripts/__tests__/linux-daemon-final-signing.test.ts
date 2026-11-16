import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { encode, linuxQualificationFixture, sha256 } from './fixtures/linux-daemon-release.js';

const ledgerModule = new URL('../linux-daemon-signing-ledger.mjs', import.meta.url);
const { reserveLinuxSigningSequence } = await import(ledgerModule.href);
const { issueLinuxFinalSignature } = await import(new URL('../sign-linux-daemon-candidate.mjs', import.meta.url).href);
const { linuxReleaseChannel, verifyLinuxReleaseManifest } =
	await import(new URL('../linux-daemon-metadata.mjs', import.meta.url).href);

const ref = 'refs/heads/release-sequences';
const owner = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid'];
const channel = linuxReleaseChannel('42', 'development', 'refs/heads/team/v3');
const otherChannel = linuxReleaseChannel('42', 'development', 'refs/heads/team/v4');
type Binding = { channel: string; sequence: number; manifestSha256: string };

function fixtureLedger() {
	const root = mkdtempSync(join(tmpdir(), 'insrc-sequence-authority-'));
	const remote = join(root, 'ledger.git');
	const git = (args: string[], input?: string) => execFileSync('git', ['-C', remote, ...args], { encoding: 'utf8', input }).trim();
	execFileSync('git', ['init', '--bare', '--quiet', '--object-format=sha1', remote]);
	const tree = git(['mktree'], '');
	const initial = git([...owner, 'commit-tree', tree], 'Initial protected ledger\n');
	git(['update-ref', ref, initial]);
	git(['config', 'receive.denyNonFastForwards', 'true']);
	return { root, remote, git, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function reserveInProcess(remote: string, binding: Binding, interrupt = false) {
	const program = `
		import { reserveLinuxSigningSequence } from ${JSON.stringify(ledgerModule.href)};
		await reserveLinuxSigningSequence(JSON.parse(process.argv[1]));
		if (process.argv[2] === 'interrupt') process.kill(process.pid, 'SIGKILL');
	`;
	return new Promise<{code: number | null; signal: NodeJS.Signals | null; stderr: string}>((resolve, reject) => {
		const child = spawn(process.execPath, ['--input-type=module', '-e', program,
			JSON.stringify({ remote, ref, ...binding }), interrupt ? 'interrupt' : 'normal'], { stdio: ['ignore', 'ignore', 'pipe'] });
		let stderr = '';
		child.stderr.on('data', chunk => { stderr += chunk; });
		child.once('error', reject);
		child.once('close', (code, signal) => resolve({ code, signal, stderr }));
	});
}

test('Protected Linux signing ledger serializes independent writers and preserves exact interrupted retries', async () => {
	const { remote, git, cleanup } = fixtureLedger();
	try {
		const first = { channel, sequence: 1, manifestSha256: 'a'.repeat(64) };
		const competing = { ...first, manifestSha256: 'b'.repeat(64) };
		const attempts = await Promise.all([reserveInProcess(remote, first), reserveInProcess(remote, competing)]);
		assert.equal(attempts.filter(result => result.code === 0).length, 1);
		assert.match(attempts.find(result => result.code !== 0)!.stderr, /already bound to different bytes/);
		const winning = attempts[0]?.code === 0 ? first : competing;
		const firstHead = git(['rev-parse', ref]);
		const exact = await reserveLinuxSigningSequence({ remote, ref, ...winning });
		assert.equal(exact.manifestSha256, winning.manifestSha256);
		assert.equal(git(['rev-parse', ref]), firstHead);

		const interrupted = { channel, sequence: 2, manifestSha256: 'c'.repeat(64) };
		assert.equal((await reserveInProcess(remote, interrupted, true)).signal, 'SIGKILL');
		const beforeRetry = git(['rev-parse', ref]);
		assert.equal((await reserveLinuxSigningSequence({ remote, ref, ...interrupted })).manifestSha256, interrupted.manifestSha256);
		assert.equal(git(['rev-parse', ref]), beforeRetry);
		await assert.rejects(reserveLinuxSigningSequence({ remote, ref, ...winning }), /stale/);
		await reserveLinuxSigningSequence({ remote, ref, ...first, channel: otherChannel });

		const live = git(['rev-parse', ref]);
		git(['read-tree', live]);
		git(['update-index', '--index-info'], `0 ${'0'.repeat(40)}\tlinux-signing/${channel}/head.json\n`);
		const invalid = git([...owner, 'commit-tree', git(['write-tree']), '-p', live], 'Fixture corruption\n');
		git(['update-ref', ref, invalid, live]);
		await assert.rejects(reserveLinuxSigningSequence({ remote, ref, ...interrupted }), /corrupt Linux signing ledger/);
		await assert.rejects(reserveLinuxSigningSequence({ remote, ref: 'refs/heads/absent', ...interrupted }));
	} finally { cleanup(); }
});

test('Linux final signing revalidates qualification, artifact and lane before allocating a signature', async () => {
	const { remote, git, cleanup } = fixtureLedger();
	try {
		const { verifiedCandidate, inputs, release, qualifier, manifest } = linuxQualificationFixture();
		const policy = { releaseRef: inputs.expected.ref, developmentRefs: ['refs/heads/v3'], releaseRefProtected: true };
		const final = { verifiedCandidate, qualification: inputs, finalPrivateKey: release.privateKey,
			finalPublicKey: release.publicKey, policy, ledger: { remote, ref } };
		const before = git(['rev-parse', ref]);
		await assert.rejects(issueLinuxFinalSignature({ ...final, policy: { ...policy, releaseRefProtected: false } }), /candidate or ref/);
		await assert.rejects(issueLinuxFinalSignature({ ...final, verifiedCandidate: { ...verifiedCandidate,
			origin: { ...verifiedCandidate.origin, artifactId: '999' } } }), /candidate or ref/);
		await assert.rejects(issueLinuxFinalSignature({ ...final, verifiedCandidate: { ...verifiedCandidate,
			record: { ...verifiedCandidate.record, archiveSha256: '0'.repeat(64) } } }), /candidate or ref/);
		await assert.rejects(issueLinuxFinalSignature({ ...final, qualification: { ...inputs,
			evidenceSignature: Buffer.alloc(64) } }), /evidence signature/);
		await assert.rejects(issueLinuxFinalSignature({ ...final, finalPrivateKey: qualifier.privateKey }), /pinned channel key/);
		await assert.rejects(issueLinuxFinalSignature({ ...final, finalPrivateKey: qualifier.privateKey,
			finalPublicKey: qualifier.publicKey }), /independent/);
		assert.equal(git(['rev-parse', ref]), before);

		const signed = await issueLinuxFinalSignature(final);
		assert.deepEqual(signed.bytes, inputs.bytes);
		assert.equal(signed.manifestSha256, sha256(signed.bytes));
		assert.deepEqual(verifyLinuxReleaseManifest(signed.bytes, signed.signature,
			{ ...inputs.expected, role: 'production', publicKey: release.publicKey }), manifest);
		assert.throws(() => verifyLinuxReleaseManifest(signed.bytes, signed.signature,
			{ ...inputs.expected, role: 'qualification', publicKey: release.publicKey }), /signature/);
		const committed = git(['rev-parse', ref]);
		assert.notEqual(committed, before);
		assert.deepEqual((await issueLinuxFinalSignature(final)).signature, signed.signature);
		assert.equal(git(['rev-parse', ref]), committed);
		const development = linuxQualificationFixture(1, 'development');
		const dev = await issueLinuxFinalSignature({ ...final, verifiedCandidate: development.verifiedCandidate,
			qualification: development.inputs, finalPrivateKey: development.release.privateKey,
			finalPublicKey: development.release.publicKey });
		assert.equal(dev.role, 'development');
		assert.equal(verifyLinuxReleaseManifest(dev.bytes, dev.signature,
			{ ...development.inputs.expected, role: 'development', publicKey: development.release.publicKey }).channel,
			development.manifest.channel);
	} finally { cleanup(); }
});

test('Protected Linux signer CLI verifies hosted origin and local evidence without running candidate files', () => {
	const { root, remote, git, cleanup } = fixtureLedger();
	try {
		const sentinel = join(root, 'candidate-executed');
		const payload = join(root, 'payload');
		mkdirSync(payload);
		writeFileSync(join(payload, 'start.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed')\n`);
		const tar = join(root, 'insrc-daemon-0.2.1-pilot.1-linux-x64.tar.gz');
		execFileSync('tar', ['-czf', tar, '-C', payload, 'start.cjs']);
		const { verifiedCandidate, inputs, release } = linuxQualificationFixture(1, 'production', readFileSync(tar));
		const { origin, record } = verifiedCandidate;
		writeFileSync(join(root, 'candidate.json'), encode(record));
		const zip = join(root, 'asset.zip');
		execFileSync('zip', ['-q', '-0', zip, 'candidate.json', record.archiveName], { cwd: root });
		const zipBytes = readFileSync(zip);
		const branch = 'main';
		const now = Date.now();
		const action = { id: Number(origin.runId), run_attempt: origin.runAttempt, workflow_id: 63,
			repository: { id: Number(origin.repository) }, head_repository: { id: Number(origin.repository) },
			path: '.github/workflows/daemon-linux-candidate.yml', head_branch: branch, head_sha: origin.commit,
			event: 'workflow_dispatch', status: 'completed', conclusion: 'success' };
		const job = { run_id: action.id, head_sha: origin.commit, name: 'build', status: 'completed', conclusion: 'success',
			started_at: new Date(now - 2000).toISOString(), completed_at: new Date(now).toISOString() };
		const artifact = { id: Number(origin.artifactId), name: `daemon-candidate-linux-x64-production-${origin.commit}-2`,
			workflow_run: { id: action.id, repository_id: 123, head_repository_id: 123, head_branch: branch, head_sha: origin.commit },
			created_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 120_000).toISOString(),
			expired: false, size_in_bytes: zipBytes.length, digest: 'sha256:' + sha256(zipBytes) };
		writeFileSync(join(root, 'gh'), `#!/bin/bash
case "$2" in
 repos/owner/repo) echo '{"id":123}';;
 */workflows/daemon-linux-candidate.yml) echo '{"id":63}';;
 */branches/main) echo '{"protected":true}';;
 */runs/100/attempts/2/jobs*) printf '%s' "$MOCK_JOB";;
 */runs/100/attempts/2) printf '%s' "$MOCK_RUN";;
 */artifacts/110) printf '%s' "$MOCK_ARTIFACT";;
 */artifacts/110/zip) cat "$MOCK_ZIP";;
 *) exit 3;;
esac
`, { mode: 0o700 });
		const qualification = join(root, 'input');
		const trustedKeys = join(root, 'keys');
		mkdirSync(qualification);
		mkdirSync(trustedKeys);
		for (const [name, value] of [
			['manifest.json', inputs.bytes], ['manifest.qualification.sig', inputs.qualificationSignature],
			['qualification.json', inputs.evidence], ['qualification.sig', inputs.evidenceSignature],
		] as const) writeFileSync(join(qualification, name), value);
		const pub = (key: typeof inputs.qualificationKey) => key.export({ format: 'pem', type: 'spki' });
		writeFileSync(join(trustedKeys, 'qualification.pub'), pub(inputs.qualificationKey));
		writeFileSync(join(trustedKeys, 'evidence.pub'), pub(inputs.evidenceKey));
		writeFileSync(join(trustedKeys, 'production.pub'), pub(release.publicKey));
		writeFileSync(join(trustedKeys, 'production.key'), release.privateKey.export({ format: 'pem', type: 'pkcs8' }));
		const approval = join(root, 'approval.json');
		writeFileSync(approval, encode({ origin, lane: record.lane, version: record.version,
			expectedArchiveSha256: record.archiveSha256, requiredTests: inputs.requiredTests }));
		const cli = new URL('../sign-linux-daemon-candidate.mjs', import.meta.url).pathname;
		const run = (output: string, artifactInfo = artifact) => spawnSync(process.execPath,
			[cli, approval, qualification, trustedKeys, output], { encoding: 'utf8', env: { ...process.env,
				PATH: `${root}:${process.env.PATH}`, GH_REPO: 'owner/repo', LINUX_RELEASE_REF: origin.ref,
				LINUX_DEVELOPMENT_REFS: '[]', LINUX_SIGNING_LEDGER_REMOTE: remote, LINUX_SIGNING_LEDGER_REF: ref,
				MOCK_RUN: JSON.stringify(action), MOCK_JOB: JSON.stringify({ total_count: 1, jobs: [job] }),
				MOCK_ARTIFACT: JSON.stringify(artifactInfo), MOCK_ZIP: zip } });
		const initial = git(['rev-parse', ref]);
		const output = join(root, 'out');
		const foreign = run(output, { ...artifact, id: 111 });
		assert.notEqual(foreign.status, 0);
		assert.match(foreign.stderr, /exact uploaded artifact/);
		writeFileSync(join(qualification, 'qualification.sig'), Buffer.alloc(64));
		const forged = run(output);
		assert.notEqual(forged.status, 0);
		assert.match(forged.stderr, /local evidence signature/);
		assert.equal(git(['rev-parse', ref]), initial);
		assert(!existsSync(output));
		assert(!existsSync(sentinel));
		writeFileSync(join(qualification, 'qualification.sig'), inputs.evidenceSignature);
		const accepted = run(output);
		assert.equal(accepted.status, 0, accepted.stderr);
		const signed = readFileSync(join(output, 'manifest.json'));
		assert.deepEqual(signed, inputs.bytes);
		assert.equal(verifyLinuxReleaseManifest(signed, readFileSync(join(output, 'manifest.production.sig')),
			{ ...inputs.expected, role: 'production', publicKey: release.publicKey }).origin.artifactId, origin.artifactId);
		assert(!existsSync(sentinel));
	} finally { cleanup(); }
});
