/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { sha256 } from './daemon-bundle-metadata.mjs';
import { LINUX_MANIFEST_LIMIT, LINUX_RELEASE_TARGET, linuxReleaseChannel, linuxManifestSigningBytes,
	readLinuxReleaseManifest, readLinuxReleaseJson, requireLinuxFields, verifyLinuxReleaseManifest } from './linux-daemon-metadata.mjs';

const digest = /^[a-f0-9]{64}$/;
const testId = /^[a-z0-9][a-z0-9-]{0,62}$/;
const evidencePrefix = Buffer.from('insrc-daemon-bundle-linux-x64-local-evidence-v1\0');

function requireQualification(condition, name) {
	if (!condition) throw new Error(`invalid Linux daemon qualification: ${name}`);
}

function publicKey(input) {
	const key = input?.type === 'public' ? input : createPublicKey(input);
	requireQualification(key.asymmetricKeyType === 'ed25519', 'expected Ed25519 public key');
	return key;
}

export function linuxSigningKeyId(input) {
	return sha256(publicKey(input).export({ format: 'der', type: 'spki' }));
}

export function prepareLinuxQualificationGrant({ verifiedCandidate, sequence, compatibility, predecessors, qualificationPrivateKey }) {
	const { record, origin } = verifiedCandidate;
	requireQualification(record.target === LINUX_RELEASE_TARGET && record.commit === origin.commit &&
		record.repository === origin.repository && record.ref === origin.ref &&
		record.runId === origin.runId && record.runAttempt === origin.runAttempt, 'verified candidate coordinates');
	const { lane, version, archiveName, archiveBytes, archiveSha256, runtimeFingerprint, host } = record;
	const channel = linuxReleaseChannel(origin.repository, lane, origin.ref);
	const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, target: LINUX_RELEASE_TARGET,
		lane, channel, sequence, version, origin, archiveName, archiveBytes, archiveSha256, runtimeFingerprint,
		host, compatibility, predecessors }));
	readLinuxReleaseManifest(bytes);
	const key = qualificationPrivateKey?.type === 'private' ? qualificationPrivateKey : createPrivateKey(qualificationPrivateKey);
	requireQualification(key.asymmetricKeyType === 'ed25519', 'expected Ed25519 qualification key');
	return { bytes, signature: sign(null, linuxManifestSigningBytes(bytes, 'qualification'), key) };
}

export function linuxEvidenceSigningBytes(evidence) {
	requireQualification(Buffer.isBuffer(evidence) && evidence.length > 0 && evidence.length <= LINUX_MANIFEST_LIMIT, 'evidence size');
	return Buffer.concat([evidencePrefix, evidence]);
}

export function linuxQualificationSubject(manifest) {
	const { target, channel, manifestSha256, archiveSha256, origin } = manifest;
	return { target, channel, manifestSha256, archiveSha256, origin };
}

function verifyLocalHost(host, required) {
	requireLinuxFields(host, ['distribution', 'version', 'architecture', 'kernelArchitecture', 'glibc', 'nodeVersion',
		'virtualization', 'deviceProfileDigest'], 'qualification host fields');
	requireQualification(host.distribution === required.distribution && host.version === required.version &&
		host.architecture === required.architecture && host.kernelArchitecture === 'x86_64' &&
		host.glibc === required.glibc && host.nodeVersion === required.nodeVersion &&
		['native', 'full-system-vm'].includes(host.virtualization) &&
		typeof host.deviceProfileDigest === 'string' && digest.test(host.deviceProfileDigest), 'local baseline host');
}

function verifyCases(tests, requiredTests) {
	requireQualification(Array.isArray(requiredTests) && requiredTests.length > 0 && requiredTests.length <= 64 &&
		requiredTests.every(id => typeof id === 'string' && testId.test(id)) &&
		new Set(requiredTests).size === requiredTests.length, 'invalid trusted test policy');
	requireQualification(Array.isArray(tests) && tests.length === requiredTests.length, 'required test set');
	const missing = new Set(requiredTests);
	for (const test of tests) {
		requireLinuxFields(test, ['id', 'result', 'evidenceSha256'], 'qualification case fields');
		requireQualification(missing.delete(test.id) && test.result === 'pass' &&
			typeof test.evidenceSha256 === 'string' && digest.test(test.evidenceSha256), 'required test result');
	}
}

function verifyPredecessors(proofs, predecessors, stateContract) {
	requireQualification(Array.isArray(proofs) && proofs.length === predecessors.length, 'predecessor proof count');
	const identity = ({ commit, manifestSha256, runtimeFingerprint }) => JSON.stringify([commit, manifestSha256, runtimeFingerprint]);
	const missing = new Set(predecessors.map(identity));
	const expectedState = sha256(Buffer.from(JSON.stringify(stateContract)));
	for (const proof of proofs) {
		requireLinuxFields(proof, ['commit', 'manifestSha256', 'runtimeFingerprint', 'stateContractSha256', 'caseEvidenceSha256'],
			'predecessor proof fields');
		requireQualification(missing.delete(identity(proof)) && proof.stateContractSha256 === expectedState &&
			typeof proof.caseEvidenceSha256 === 'string' && digest.test(proof.caseEvidenceSha256), 'exact predecessor state evidence');
	}
}

export function verifyLinuxQualification({ bytes, qualificationSignature, qualificationKey, evidence,
	evidenceSignature, evidenceKey, expected, requiredTests }) {
	requireQualification(linuxSigningKeyId(qualificationKey) !== linuxSigningKeyId(evidenceKey), 'independent qualification and evidence keys');
	const manifest = verifyLinuxReleaseManifest(bytes, qualificationSignature,
		{ ...expected, role: 'qualification', publicKey: qualificationKey });
	const message = linuxEvidenceSigningBytes(evidence);
	requireQualification(Buffer.isBuffer(evidenceSignature) && evidenceSignature.length === 64 &&
		verify(null, message, publicKey(evidenceKey), evidenceSignature), 'local evidence signature');
	const receipt = readLinuxReleaseJson(evidence);
	requireLinuxFields(receipt, ['schemaVersion', 'subject', 'host', 'tests', 'predecessors'], 'qualification receipt fields');
	requireQualification(receipt.schemaVersion === 1 &&
		isDeepStrictEqual(receipt.subject, linuxQualificationSubject(manifest)), 'exact qualification subject');
	verifyLocalHost(receipt.host, manifest.host);
	verifyCases(receipt.tests, requiredTests);
	verifyPredecessors(receipt.predecessors, manifest.predecessors, manifest.compatibility);
	return { manifest, receipt, evidenceSha256: sha256(evidence) };
}
