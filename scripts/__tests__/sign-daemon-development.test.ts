import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { sha256 } from '../daemon-bundle-metadata.mjs';
import { developmentPolicySigningBytes, verifyDevelopmentManifest } from '../daemon-development-metadata.mjs';
import { measureBundleRuntime } from '../stage-daemon-bundle.mjs';
import { developmentHandoffSigningBytes, signDevelopmentCandidate } from '../sign-daemon-development.mjs';

test('development signer binds the authenticated archive, sequence and exact qualified predecessor', async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'insrc-development-signer-')));
	try {
		const issuer = generateKeyPairSync('ed25519');
		const builder = generateKeyPairSync('ed25519');
		const pem = issuer.publicKey.export({ type: 'spki', format: 'pem' });
		const repository = 'https://github.com/example/daemon.git';
		const sourceRef = 'refs/heads/preview';
		const policyBytes = Buffer.from(JSON.stringify({ repository, releaseRef: 'refs/heads/main', developmentRefs: [sourceRef] }));
		const ledgerDirectory = join(root, 'ledger');
		await mkdir(ledgerDirectory);
		const compatibility = { graphSchema: 1, formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' } };
		const payload = join(root, 'payload');
		await mkdir(join(payload, 'tools'), { recursive: true, mode: 0o700 });
		await mkdir(join(payload, 'out'), { mode: 0o700 });
		await mkdir(join(payload, 'out/daemon'), { mode: 0o700 });
		await writeFile(join(payload, 'tools/node'), 'fixture', { mode: 0o700 });
		await writeFile(join(payload, 'out/daemon/index.js'), 'fixture', { mode: 0o600 });
		const handoff = async (label: string, sourceCommit: string) => {
			const directory = join(root, label);
			await mkdir(directory);
			const version = '1.0.0-dev.1';
			const archiveName = `insrc-daemon-${version}-darwin-arm64.tar.gz`;
			execFileSync('/usr/bin/tar', ['--format', 'ustar', '-czf', join(directory, archiveName), '-C', payload, 'tools', 'out']);
			const archive = await readFile(join(directory, archiveName));
			const candidate = { schemaVersion: 1, channel: 'development', repository, sourceRef, fetchedTip: sourceCommit,
				commit: sourceCommit, version, target: 'darwin-arm64', minimumMacOS: '15.0', nodeVersion: '22.22.1', archiveName,
				archiveBytes: archive.length, archiveSha256: sha256(archive), runtimeFingerprint: await measureBundleRuntime(payload) };
			const bytes = Buffer.from(JSON.stringify(candidate));
			await writeFile(join(directory, 'candidate.json'), bytes);
			await writeFile(join(directory, 'candidate.sig'), sign(null, developmentHandoffSigningBytes(bytes), builder.privateKey));
			return { directory, candidate };
		};
		const first = await handoff('first', 'a'.repeat(40));
		const next = await handoff('next', 'b'.repeat(40));
		const common = { ledgerDirectory, key: issuer.privateKey.export({ type: 'pkcs8', format: 'pem' }),
			builderKey: builder.publicKey.export({ type: 'spki', format: 'pem' }), policyBytes,
			policySignature: sign(null, developmentPolicySigningBytes(policyBytes), issuer.privateKey), compatibility };
		const prior = await signDevelopmentCandidate({ ...common, directory: first.directory, sequence: 1 });
		assert.deepEqual(await signDevelopmentCandidate({ ...common, directory: first.directory, sequence: 1 }), prior);
		await assert.rejects(signDevelopmentCandidate({ ...common, directory: next.directory, sequence: 1 }), /conflicting.*record/);
		await assert.rejects(signDevelopmentCandidate({ ...common, builderKey: pem, directory: next.directory, sequence: 2 }), /handoff signature/);
		const record = { schemaVersion: 1, predecessorManifestSha256: sha256(prior.bytes),
			predecessorRuntimeFingerprint: first.candidate.runtimeFingerprint, candidateCommit: next.candidate.commit,
			candidateArchiveSha256: next.candidate.archiveSha256, candidateRuntimeFingerprint: next.candidate.runtimeFingerprint,
			launchProfile: 'managed', candidateWriteObserved: true, candidateInterrupted: true, predecessorReopened: true };
		const upgrade = { ...common, directory: next.directory, sequence: 2, prior };
		await assert.rejects(signDevelopmentCandidate({ ...upgrade, evidence: Buffer.from(JSON.stringify({ ...record, predecessorReopened: false })) }), /crash-reopen/);
		const evidence = Buffer.from(JSON.stringify(record));
		await assert.rejects(signDevelopmentCandidate({ ...upgrade, evidence, compatibility: { ...compatibility, graphSchema: 2 } }), /writable formats/);
		const signed = await signDevelopmentCandidate({ ...upgrade, evidence });
		const { manifest } = verifyDevelopmentManifest(signed.bytes, signed.signature, pem);
		assert.equal(manifest.predecessor?.manifestSha256, sha256(prior.bytes));
		assert.equal(manifest.predecessor?.qualificationEvidenceSha256, sha256(evidence));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
