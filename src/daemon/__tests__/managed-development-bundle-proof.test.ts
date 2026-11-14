import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { developmentManifestSigningBytes, encodeDevelopmentManifest } from '../../../scripts/daemon-development-metadata.mjs';
import { sha256 } from '../../../scripts/daemon-bundle-metadata.mjs';
import { measureBundleRuntime } from '../../../scripts/stage-daemon-bundle.mjs';
import { verifyManagedBundleProof } from '../managed-bundle-proof.js';
import { advanceDaemonBundleReleaseFloor, readDaemonBundleReleaseFloor } from '../../shared/daemon-bundle-release-floor.js';

test('development admission floor survives rollback and only permits exact equal-sequence retry', () => {
	const prior = { domain: 'development' as const, channel: 'development' as const, sequence: 1,
		repository: 'https://github.com/example/project.git', manifestSha256: 'a'.repeat(64), archiveSha256: 'b'.repeat(64) };
	const candidate = { ...prior, sequence: 2, manifestSha256: 'c'.repeat(64) };
	const production = { domain: 'production' as const, channel: 'macos-arm64-pilot' as const, sequence: 9,
		manifestSha256: 'd'.repeat(64), archiveSha256: 'e'.repeat(64) };
	assert.deepEqual(readDaemonBundleReleaseFloor(production), production);
	const state = advanceDaemonBundleReleaseFloor([production, prior], candidate);
	assert.deepEqual(state, [production, candidate]);
	// The installed predecessor may be restored without a fresh floor admission.
	assert.throws(() => advanceDaemonBundleReleaseFloor(state, prior), /replay/);
	assert.throws(() => advanceDaemonBundleReleaseFloor(state, { ...candidate, archiveSha256: 'f'.repeat(64) }), /replace/);
	assert.equal(advanceDaemonBundleReleaseFloor(state, candidate), state);
});

test('managed development proof revalidates signed identity and pinned runtime', async () => {
	const stateRoot = await realpath(await mkdtemp(join(tmpdir(), 'insrc-development-proof-')));
	try {
		const releaseRoot = join(stateRoot, 'release');
		const runtime = join(releaseRoot, 'tools/node');
		await mkdir(join(releaseRoot, 'tools'), { recursive: true });
		await writeFile(runtime, 'runtime fixture', { mode: 0o700 });
		const trust = join(stateRoot, 'bundle-trust');
		await mkdir(trust, { mode: 0o700 });
		const { publicKey, privateKey } = generateKeyPairSync('ed25519');
		await writeFile(join(trust, 'development.pem'), publicKey.export({ type: 'spki', format: 'pem' }), { mode: 0o400 });
		const fingerprint = await measureBundleRuntime(releaseRoot);
		const identity = { repository: 'https://github.com/example/project.git', sequence: 2, archiveSha256: 'b'.repeat(64) };
		const commit = 'a'.repeat(40);
		const bytes = encodeDevelopmentManifest({
			...identity, schemaVersion: 1, channel: 'development', sourceRef: 'refs/heads/archived-dev',
			fetchedTip: commit, commit, target: 'darwin-arm64', minimumMacOS: '15.0', nodeVersion: '22.22.1',
			version: '1.0.0-dev.2', archiveName: 'insrc-daemon-1.0.0-dev.2-darwin-arm64.tar.gz', archiveBytes: 100,
			runtimeFingerprint: fingerprint, keyId: sha256(publicKey.export({ type: 'spki', format: 'der' })),
			compatibility: { graphSchema: 1, formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' } },
			predecessor: null,
		});
		const proof = {
			version: 1 as const, fingerprint, manifestBase64: bytes.toString('base64'),
			signatureBase64: sign(null, developmentManifestSigningBytes(bytes), privateKey).toString('base64'),
			floor: { domain: 'development' as const, channel: 'development' as const, manifestSha256: sha256(bytes), ...identity },
		};
		const install = { version: 1 as const, stateRoot, releaseRoot, runtime, releaseId: commit, pathEnv: '/usr/bin:/bin', enabled: true };
		await verifyManagedBundleProof(install, proof);
		await assert.rejects(verifyManagedBundleProof(install, {
			...proof, floor: { ...proof.floor, repository: 'https://github.com/example/other.git' },
		}), /identity changed/);
		await writeFile(runtime, 'tampered bytes');
		await assert.rejects(verifyManagedBundleProof(install, proof), /runtime changed/);
	} finally {
		await rm(stateRoot, { recursive: true, force: true });
	}
});
