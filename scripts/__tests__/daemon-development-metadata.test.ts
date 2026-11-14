import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import {
	developmentManifestSigningBytes, encodeDevelopmentManifest, readDevelopmentPolicy, verifyAndStageDevelopmentBundle,
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
const input = { bytes, signature, publicKey: pem, policy, host };

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
		...input, policy: { ...policy, developmentRefs: ['refs/heads/other'] },
	}), /branch policy/);
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
