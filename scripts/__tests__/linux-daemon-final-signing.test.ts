import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { linuxQualificationFixture, sha256 } from './fixtures/linux-daemon-release.js';

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
