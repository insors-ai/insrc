import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readManagedBundleProof, verifyManagedBundleManifest } from '../../src/daemon/managed-bundle-proof.js';

const { manifestSigningBytes, verifyBundleManifest, requireBundleTarget, readQualification, sha256, QUALIFICATION_TESTS } =
	await import(new URL('../daemon-bundle-metadata.mjs', import.meta.url).href);
const manifest = {
	schemaVersion: 1, channel: 'macos-arm64-pilot', sequence: 1, version: '0.2.1-pilot.1',
	commit: 'a'.repeat(40), target: 'darwin-arm64', minimumMacOS: '15.2', nodeVersion: '22.22.1',
	archiveName: 'insrc-daemon-0.2.1-pilot.1-darwin-arm64.tar.gz', archiveSha256: 'b'.repeat(64), archiveBytes: 1024,
	runtimeFingerprint: 'e'.repeat(64),
	compatibility: { graphSchema: 1, formats: { lance: 'v1', repoAndIndexQueue: 'v1', config: 'v1', workflowAndSession: 'v1' } },
	predecessors: [],
};
const encode = (value: object) => Buffer.from(JSON.stringify(value));
const { verifyAndStageBundle } = await import(new URL('../verify-daemon-bundle.mjs', import.meta.url).href);
const { pinnedRecovery } = await import(new URL('../install-daemon-bundle.mjs', import.meta.url).href);
const { measureBundleRuntime } = await import(new URL('../stage-daemon-bundle.mjs', import.meta.url).href);

test('installed trust rejects a self-signed proof and recovery selects only the pinned runtime', async () => {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-bundle-trust-')));
	try {
		const trusted = generateKeyPairSync('ed25519');
		const other = generateKeyPairSync('ed25519');
		const key = trusted.publicKey.export({ type: 'spki', format: 'pem' });
		const stateRoot = join(dir, 'state');
		const trustRoot = join(stateRoot, 'bundle-trust');
		mkdirSync(trustRoot, { recursive: true, mode: 0o700 });
		writeFileSync(join(trustRoot, 'production.pem'), key, { mode: 0o600 });
		const root = join(dir, 'releases');
		const releaseRoot = join(root, 'pinned');
		const runtime = join(releaseRoot, 'tools/node');
		mkdirSync(join(releaseRoot, 'tools'), { recursive: true });
		writeFileSync(runtime, 'runtime fixture');
		const fingerprint = await measureBundleRuntime(releaseRoot);
		const bytes = encode({ ...manifest, runtimeFingerprint: fingerprint });
		const signed = (privateKey: typeof trusted.privateKey) =>
			sign(null, manifestSigningBytes(bytes, 'production'), privateKey).toString('base64');
		const proof = readManagedBundleProof({
			version: 1, floor: { domain: 'production', channel: manifest.channel, sequence: 1,
				manifestSha256: sha256(bytes), archiveSha256: manifest.archiveSha256 },
			fingerprint, manifestBase64: bytes.toString('base64'),
			signatureBase64: signed(trusted.privateKey),
		});
		await verifyManagedBundleManifest(proof, manifest.commit, stateRoot);
		await assert.rejects(verifyManagedBundleManifest({ ...proof, signatureBase64: signed(other.privateKey) }, manifest.commit, stateRoot), /manifest changed/);
		assert.throws(() => readManagedBundleProof({ ...proof, publicKey: other.publicKey }), /invalid bundle proof/);
		const journal = { version: 1, root: stateRoot, active: { kind: 'start', activation: {
			installation: { stateRoot, releaseRoot, releaseId: manifest.commit, runtime }, bundleProof: proof,
		} } };
		const context = { stateRoot, root, domain: 'production', key };
		assert.equal((await pinnedRecovery(journal, context)).runtime, runtime);
		writeFileSync(runtime, 'modified runtime');
		await assert.rejects(pinnedRecovery(journal, context), /does not match/);
		const altered = { ...proof, fingerprint: await measureBundleRuntime(releaseRoot) };
		journal.active.activation.bundleProof = altered;
		await assert.rejects(pinnedRecovery(journal, context), /does not match/);
		await assert.rejects(verifyManagedBundleManifest(altered, manifest.commit, stateRoot), /identity changed/);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bootstrap rejects invalid manifest and target before opening any archive', async () => {
	const key = generateKeyPairSync('ed25519');
	const pem = key.publicKey.export({ format: 'pem', type: 'spki' });
	const bytes = encode(manifest);
	const signed = (b: Buffer) => sign(null, manifestSigningBytes(b, 'qualification'), key.privateKey);
	const host = { platform: 'darwin', architecture: 'arm64', macOSVersion: '15.2', requestedVersion: manifest.version };
	const args = { bytes, signature: signed(bytes), domain: 'qualification', key: pem, host,
		archive: '/nonexistent-candidate.tar.gz', releaseParent: '/nonexistent-release-parent' };
	await assert.rejects(verifyAndStageBundle({ ...args, signature: Buffer.alloc(64) }), /signature/);
	await assert.rejects(verifyAndStageBundle({ ...args, host: { ...host, architecture: 'x64' } }), /unsupported/);
	const invalid = encode({ ...manifest, schemaVersion: 2 });
	await assert.rejects(verifyAndStageBundle({ ...args, bytes: invalid, signature: signed(invalid) }), /channel or sequence/);
	await assert.rejects(verifyAndStageBundle(args), { code: 'ENOENT' });
});

test('bundle signatures bind raw bytes, signer, trust domain and supported target', () => {
	const key = generateKeyPairSync('ed25519');
	const pem = key.publicKey.export({ format: 'pem', type: 'spki' });
	const wrongPem = generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' });
	const bytes = encode(manifest);
	const signature = sign(null, manifestSigningBytes(bytes, 'qualification'), key.privateKey);
	const parsed = verifyBundleManifest(bytes, signature, 'qualification', pem);
	assert.throws(() => verifyBundleManifest(bytes, signature, 'production', pem), /signature/);
	assert.throws(() => verifyBundleManifest(bytes, signature, 'qualification', wrongPem), /signature/);
	assert.throws(() => verifyBundleManifest(Buffer.concat([bytes, Buffer.from('\n')]), signature, 'qualification', pem), /signature/);
	const extra = encode({ ...manifest, surprise: true });
	assert.throws(() => verifyBundleManifest(extra, sign(null, manifestSigningBytes(extra, 'qualification'), key.privateKey), 'qualification', pem), /fields/);
	const host = { platform: 'darwin', architecture: 'arm64', macOSVersion: '15.10', requestedVersion: manifest.version };
	requireBundleTarget(parsed, host);
	assert.throws(() => requireBundleTarget(parsed, { ...host, macOSVersion: '15.1.9' }), /minimum/);
	assert.throws(() => requireBundleTarget(parsed, { ...host, architecture: 'x64' }), /unsupported/);
});

test('qualification requires one passing record per required local test', () => {
	const q = {
		schemaVersion: 1, qualifiedAt: '2026-11-14T07:00:00Z',
		candidate: { repository: 'insors-ai/insrc', commit: manifest.commit, version: manifest.version, target: manifest.target,
			runId: '100', artifactId: '101', archiveBytes: 1024, archiveSha256: manifest.archiveSha256, manifestSha256: 'c'.repeat(64) },
		host: { macOSVersion: '15.2', arch: 'arm64', nodeVersion: '22.22.1' },
		tests: QUALIFICATION_TESTS.map((id: string) => ({ id, result: 'pass', evidenceSha256: 'd'.repeat(64) })),
	};
	assert.equal(readQualification(encode(q)).candidate.artifactId, '101');
	assert.throws(() => readQualification(encode({ ...q, tests: q.tests.slice(1) })), /test set/);
	assert.throws(() => readQualification(encode({ ...q, tests: [...q.tests.slice(1), q.tests[1]] })), /test evidence/);
});

test('bootstrap checksum rejects changed bytes before bootstrap execution', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-bootstrap-test-'));
	try {
		const archive = join(dir, 'fixture');
		const bytes = Buffer.from('bootstrap bytes');
		writeFileSync(archive, bytes);
		const script = new URL('../verify-daemon-bootstrap.sh', import.meta.url).pathname;
		assert.equal(spawnSync('/bin/bash', [script, sha256(bytes), archive]).status, 0);
		writeFileSync(archive, 'modified bytes');
		assert.equal(spawnSync('/bin/bash', [script, sha256(bytes), archive]).status, 1);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
