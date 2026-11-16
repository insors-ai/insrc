import assert from 'node:assert/strict';
import { sign } from 'node:crypto';
import test from 'node:test';
import { encode, linuxQualificationFixture, sha256 } from './fixtures/linux-daemon-release.js';

const { verifyLinuxQualification, linuxEvidenceSigningBytes } =
	await import(new URL('../linux-daemon-qualification.mjs', import.meta.url).href);
const { verifyLinuxReleaseManifest } = await import(new URL('../linux-daemon-metadata.mjs', import.meta.url).href);

test('Linux qualification authenticates exact immutable subject and separate signer privileges', () => {
	const { inputs, manifest, receipt, qualifier, release } = linuxQualificationFixture();
	const result = verifyLinuxQualification(inputs);
	assert.deepEqual(result.manifest, manifest);
	assert.equal(result.evidenceSha256, sha256(inputs.evidence));
	assert.equal(manifest.manifestSha256, sha256(inputs.bytes));
	assert(!inputs.bytes.includes(Buffer.from('caseEvidenceSha256')));
	assert.throws(() => verifyLinuxReleaseManifest(inputs.bytes, inputs.qualificationSignature,
		{ ...inputs.expected, role: 'production', publicKey: release.publicKey }), /signature/);
	assert.throws(() => verifyLinuxQualification({ ...inputs, evidenceKey: qualifier.publicKey }), /independent/);
	const unrelated = encode({ ...receipt, subject: { ...receipt.subject, archiveSha256: '0'.repeat(64) } });
	assert.throws(() => verifyLinuxQualification({ ...inputs, evidence: unrelated }), /evidence signature/);
	const foreignSignature = sign(null, linuxEvidenceSigningBytes(unrelated), qualifier.privateKey);
	assert.throws(() => verifyLinuxQualification({ ...inputs, evidence: unrelated, evidenceSignature: foreignSignature }), /evidence signature/);
});

test('Linux qualification rejects foreign host, artifact, test and predecessor evidence', () => {
	const { inputs, evidenceFor, receipt } = linuxQualificationFixture();
	for (const [change, error] of [
		[{ host: { ...receipt.host, kernelArchitecture: 'aarch64' } }, /baseline host/],
		[{ host: { ...receipt.host, virtualization: 'translated' } }, /baseline host/],
		[{ subject: { ...receipt.subject, target: 'darwin-arm64' } }, /exact qualification subject/],
		[{ subject: { ...receipt.subject, origin: { ...receipt.subject.origin, artifactId: '999' } } }, /exact qualification subject/],
		[{ tests: receipt.tests.slice(1) }, /required test set/],
		[{ tests: [receipt.tests[0], receipt.tests[0], receipt.tests[2]] }, /required test result/],
		[{ tests: [{ ...receipt.tests[0], result: 'fail' }, ...receipt.tests.slice(1)] }, /required test result/],
		[{ tests: [{ ...receipt.tests[0], id: 'unapproved' }, ...receipt.tests.slice(1)] }, /required test result/],
		[{ predecessors: [] }, /predecessor proof count/],
		[{ predecessors: [{ ...receipt.predecessors[0], runtimeFingerprint: '4'.repeat(64) }] }, /exact predecessor/],
		[{ predecessors: [{ ...receipt.predecessors[0], stateContractSha256: '4'.repeat(64) }] }, /exact predecessor/],
	] as const) assert.throws(() => verifyLinuxQualification({ ...inputs, ...evidenceFor({ ...receipt, ...change }) }), error);
});
