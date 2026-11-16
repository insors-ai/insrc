import { createHash, generateKeyPairSync, sign } from 'node:crypto';

const { prepareLinuxQualificationGrant, linuxQualificationSubject, linuxEvidenceSigningBytes } =
	await import(new URL('../../linux-daemon-qualification.mjs', import.meta.url).href);
const { verifyLinuxReleaseManifest } = await import(new URL('../../linux-daemon-metadata.mjs', import.meta.url).href);

export const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export const encode = (value: object) => Buffer.from(JSON.stringify(value));

export function linuxQualificationFixture(sequence = 1, lane: 'production' | 'development' = 'production',
	archive = Buffer.from('release archive fixture')) {
	const qualifier = generateKeyPairSync('ed25519');
	const operator = generateKeyPairSync('ed25519');
	const release = generateKeyPairSync('ed25519');
	const origin = { repository: '123', ref: lane === 'production' ? 'refs/heads/main' : 'refs/heads/v3', commit: 'a'.repeat(40), runId: '100',
		runAttempt: 2, artifactId: '110' };
	const version = lane === 'production' ? '0.2.1-pilot.1' : '0.2.1-dev.1';
	const host = { distribution: 'ubuntu', version: '24.04', architecture: 'amd64', glibc: '2.39',
		nodeVersion: '22.22.1', systemLibraries: ['libc.so.6'], pidfdRequired: true };
	const { artifactId: _, ...buildOrigin } = origin;
	const record = { schemaVersion: 1, target: 'linux-x64', ...buildOrigin, lane, version,
		archiveName: `insrc-daemon-${version}-linux-x64.tar.gz`, archiveBytes: archive.length,
		archiveSha256: sha256(archive), runtimeFingerprint: 'b'.repeat(64), host };
	const compatibility = { graphSchema: 1, formats: { lance: 'v1', repoAndIndexQueue: 'v1', config: 'v1', workflowAndSession: 'v1' } };
	const predecessor = { commit: 'c'.repeat(40), manifestSha256: null, runtimeFingerprint: 'd'.repeat(64) };
	const expected = { repository: origin.repository, ref: origin.ref, lane, version };
	const { bytes, signature } = prepareLinuxQualificationGrant({ verifiedCandidate: { record, origin },
		sequence, compatibility, predecessors: [predecessor], qualificationPrivateKey: qualifier.privateKey });
	const manifest = verifyLinuxReleaseManifest(bytes, signature, { ...expected, role: 'qualification', publicKey: qualifier.publicKey });
	const requiredTests = ['fresh-install', 'source-migration', 'after-durable-write-recovery'];
	const receipt = {
		schemaVersion: 1,
		subject: linuxQualificationSubject(manifest),
		host: { distribution: host.distribution, version: host.version, architecture: host.architecture,
			kernelArchitecture: 'x86_64', glibc: host.glibc, nodeVersion: host.nodeVersion, virtualization: 'full-system-vm',
			deviceProfileDigest: 'e'.repeat(64) },
		tests: requiredTests.map(id => ({ id, result: 'pass', evidenceSha256: 'f'.repeat(64) })),
		predecessors: [{ ...predecessor, stateContractSha256: sha256(encode(compatibility)), caseEvidenceSha256: '1'.repeat(64) }],
	};
	const evidenceFor = (value: object) => {
		const evidence = encode(value);
		return { evidence, evidenceSignature: sign(null, linuxEvidenceSigningBytes(evidence), operator.privateKey) };
	};
	const inputs = { bytes, qualificationSignature: signature, qualificationKey: qualifier.publicKey,
		...evidenceFor(receipt), evidenceKey: operator.publicKey, expected, requiredTests };
	return { inputs, evidenceFor, receipt, qualifier, operator, release, verifiedCandidate: { record, origin }, archive, manifest };
}
