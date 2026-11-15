import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { developmentPinnedRecovery, readDevelopmentGuestJournal, requireUnusedDevelopmentGuest, verifyDevelopmentPredecessor } from '../install-daemon-development-bundle.mjs';
import { measureBundleRuntime } from '../stage-daemon-bundle.mjs';
import {
	developmentManifestSigningBytes, developmentPolicySigningBytes, encodeDevelopmentManifest, readDevelopmentPolicy,
	verifyAndStageDevelopmentBundle,
} from '../daemon-development-metadata.mjs';
import { manifestSigningBytes, sha256, verifyBundleManifest } from '../daemon-bundle-metadata.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const policy = {
	repository: 'https://github.com/example/daemon.git',
	releaseRef: 'refs/heads/main',
	developmentRefs: ['refs/heads/preview/next'],
};
const manifest = {
	schemaVersion: 1, channel: 'development', repository: policy.repository, sourceRef: 'refs/heads/preview/next',
	fetchedTip: 'a'.repeat(40), commit: 'b'.repeat(40), target: 'darwin-arm64',
	minimumMacOS: '15.0', nodeVersion: '22.22.1', version: '0.2.0-dev.1', sequence: 1,
	archiveName: 'insrc-daemon-0.2.0-dev.1-darwin-arm64.tar.gz', archiveBytes: 100,
	archiveSha256: 'c'.repeat(64), runtimeFingerprint: 'd'.repeat(64),
	keyId: sha256(publicKey.export({ type: 'spki', format: 'der' })),
	compatibility: { graphSchema: 1, formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' } },
	predecessor: null,
};
const host = { platform: 'darwin', architecture: 'arm64', macOSVersion: '15.0', nodeVersion: '22.22.1', requestedVersion: manifest.version };
const bytes = encodeDevelopmentManifest(manifest);
const signature = sign(null, developmentManifestSigningBytes(bytes), privateKey);
const signedPolicy = (value: typeof policy) => {
	const policyBytes = Buffer.from(JSON.stringify(value));
	return { policyBytes, policySignature: sign(null, developmentPolicySigningBytes(policyBytes), privateKey) };
};
const input = { bytes, signature, publicKey: pem, ...signedPolicy(policy), host };

test('development bootstrap admits a cross-ref upgrade only with the exact installed predecessor', () => {
	const digest = sha256(bytes);
	const installed = { proof: { manifestBase64: bytes.toString('base64'), signatureBase64: signature.toString('base64'),
		fingerprint: manifest.runtimeFingerprint, floor: { domain: 'development', repository: manifest.repository,
			sequence: manifest.sequence, manifestSha256: digest, archiveSha256: manifest.archiveSha256 } } };
	const predecessor = { commit: manifest.commit, sequence: manifest.sequence, manifestSha256: digest,
		runtimeFingerprint: manifest.runtimeFingerprint, compatibility: manifest.compatibility };
	const candidate = { ...manifest, commit: 'e'.repeat(40), sourceRef: 'refs/heads/preview/another', sequence: 2, predecessor };
	verifyDevelopmentPredecessor(candidate, 'f'.repeat(64), installed, pem, false);
	verifyDevelopmentPredecessor(manifest, digest, installed, pem, false);
	for (const invalid of [{ ...candidate, predecessor: { ...predecessor, sequence: 2 } },
		{ ...candidate, predecessor: null }, { ...candidate, sequence: 1 },
		{ ...candidate, compatibility: { ...manifest.compatibility, graphSchema: 2 } }]) {
		assert.throws(() => verifyDevelopmentPredecessor(invalid, 'f'.repeat(64), installed, pem, false), /does not qualify/);
	}
});

test('qualification manifest requires an explicit qualification verifier', async () => {
	const trial = encodeDevelopmentManifest({ ...manifest, qualificationOnly: true });
	const signed = { ...input, bytes: trial, signature: sign(null, developmentManifestSigningBytes(trial), privateKey) };
	await assert.rejects(verifyAndStageDevelopmentBundle(signed), /qualification-only mode/);
	await assert.rejects(verifyAndStageDevelopmentBundle({ ...input, qualificationOnly: true }), /qualification-only mode/);
	assert.equal((await verifyAndStageDevelopmentBundle({ ...signed, qualificationOnly: true })).manifest.qualificationOnly, true);
});

test('development verification accepts a configured ref and canonical manifest', async () => {
	assert.deepEqual((await verifyAndStageDevelopmentBundle(input)).manifest, manifest);
	const formatted = Buffer.from(JSON.stringify(manifest, null, 2));
	await assert.rejects(verifyAndStageDevelopmentBundle({
		...input, bytes: formatted, signature: sign(null, developmentManifestSigningBytes(formatted), privateKey),
	}), /canonical manifest/);
	const duplicate = Buffer.concat([Buffer.from('{"sequence":1,'), bytes.subarray(1)]);
	await assert.rejects(verifyAndStageDevelopmentBundle({
		...input, bytes: duplicate, signature: sign(null, developmentManifestSigningBytes(duplicate), privateKey),
	}), /canonical manifest/);
});

test('development verification rejects invalid branch policy, signatures and host before staging', async () => {
	for (const ref of ['refs/heads/main', 'refs/tags/preview', 'refs/heads/a..b']) {
		assert.throws(() => readDevelopmentPolicy({ ...policy, developmentRefs: [ref] }));
	}
	await assert.rejects(verifyAndStageDevelopmentBundle({
		...input, ...signedPolicy({ ...policy, developmentRefs: ['refs/heads/other'] }),
	}), /branch policy/);
	await assert.rejects(verifyAndStageDevelopmentBundle({
		...input, policyBytes: Buffer.from(JSON.stringify({ ...policy, developmentRefs: ['refs/heads/other'] })),
	}), /branch policy signature/);
	await assert.rejects(verifyAndStageDevelopmentBundle({
		...input, policySignature: signature,
	}), /branch policy signature/);
	await assert.rejects(verifyAndStageDevelopmentBundle({ ...input, signature: Buffer.alloc(64) }), /development signature/);
	for (const domain of ['production', 'qualification']) {
		await assert.rejects(verifyAndStageDevelopmentBundle({
			...input, signature: sign(null, manifestSigningBytes(bytes, domain), privateKey),
		}), /development signature/);
		assert.throws(() => verifyBundleManifest(bytes, signature, domain, pem), /manifest signature/);
	}
	for (const [field, value, expected] of [
		['sourceRef', 'refs/tags/preview', /full branch ref/],
		['target', 'linux-arm64', /target or runtime/],
	] as const) {
		const altered = Buffer.from(JSON.stringify({ ...JSON.parse(bytes.toString()), [field]: value }));
		await assert.rejects(verifyAndStageDevelopmentBundle({
			...input, bytes: altered, signature: sign(null, developmentManifestSigningBytes(altered), privateKey),
			archive: '/nonexistent/archive', releaseParent: '/nonexistent/releases',
		}), expected);
	}
	await assert.rejects(verifyAndStageDevelopmentBundle({ ...input, host: { ...host, macOSVersion: '14.9' } }), /below bundle minimum/);
	await assert.rejects(verifyAndStageDevelopmentBundle({ ...input, host: { ...host, nodeVersion: '24.0.0' } }), /Node version/);
});
test('development first-install preflight refuses existing state and symlink markers', async t => {
	const home = await mkdtemp(join(tmpdir(), 'insrc-development-guest-'));
	t.after(() => rm(home, { recursive: true, force: true }));
	const uid = process.getuid!();
	const marker = join(home, '.insrc-development-guest');
	await assert.rejects(requireUnusedDevelopmentGuest(home, uid), /ENOENT/);
	const target = join(home, 'marker');
	await writeFile(target, '', { mode: 0o600 });
	await symlink(target, marker);
	await assert.rejects(requireUnusedDevelopmentGuest(home, uid), /private guest marker/);
	await rm(marker);
	await writeFile(marker, '', { mode: 0o600 });
	await requireUnusedDevelopmentGuest(home, uid);
	await mkdir(join(home, '.insrc'));
	await assert.rejects(requireUnusedDevelopmentGuest(home, uid), /unused guest: .insrc/);
});

test('development bootstrap authenticates an orphaned first activation without an installed receipt', async t => {
	const home = await realpath(await mkdtemp(join(tmpdir(), 'insrc-development-recovery-')));
	t.after(() => rm(home, { recursive: true, force: true }));
	const stateRoot = join(home, '.insrc');
	const releaseParent = join(home, 'releases');
	const releaseRoot = join(releaseParent, 'staged');
	const runtime = join(releaseRoot, 'tools/node');
	for (const directory of [stateRoot, join(stateRoot, 'bundle-trust'), join(stateRoot, 'managed-lifecycle'),
		releaseParent, releaseRoot, join(releaseRoot, 'tools')]) await mkdir(directory, { mode: 0o700 });
	const anchor = join(stateRoot, 'bundle-trust/development.pem');
	await writeFile(anchor, pem, { mode: 0o400 });
	await writeFile(runtime, 'pinned', { mode: 0o700 });
	const fingerprint = await measureBundleRuntime(releaseRoot);
	const pinned = encodeDevelopmentManifest({ ...manifest, runtimeFingerprint: fingerprint });
	const proof = { version: 1, fingerprint, manifestBase64: pinned.toString('base64'),
		signatureBase64: sign(null, developmentManifestSigningBytes(pinned), privateKey).toString('base64'),
		floor: { domain: 'development', channel: 'development', repository: manifest.repository,
			sequence: manifest.sequence, manifestSha256: sha256(pinned), archiveSha256: manifest.archiveSha256 } };
	const journal = { version: 1, root: stateRoot, active: { kind: 'start', activation: {
		bundleProof: proof, installation: { stateRoot, releaseRoot, releaseId: manifest.commit, runtime },
	} }, daemonBundleFloors: [proof.floor] };
	await writeFile(join(stateRoot, 'managed-lifecycle/journal.json'), JSON.stringify(journal), { mode: 0o600 });
	const options = { stateRoot, releaseParent, publicKey: Buffer.from(pem), uid: process.getuid!(), repository: manifest.repository };
	assert.deepEqual(await readDevelopmentGuestJournal(options), journal);
	assert.equal((await developmentPinnedRecovery(journal, options))?.runtime, runtime);
	await assert.rejects(developmentPinnedRecovery({ ...journal, daemonBundleFloors: [] }, options), /admission floor/);
	await assert.rejects(developmentPinnedRecovery(journal, { ...options, repository: 'https://example.test/foreign' }), /authenticated release/);
	await writeFile(runtime, 'tampered');
	await assert.rejects(developmentPinnedRecovery(journal, options), /authenticated release/);
	await writeFile(join(stateRoot, 'bundle-trust/production.pem'), pem, { mode: 0o400 });
	await assert.rejects(readDevelopmentGuestJournal(options), /bootstrap trust differs/);
});
