/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { fetchLinuxDaemonCandidate } from './fetch-linux-daemon-candidate.mjs';
import { readLinuxBuildPolicy } from './linux-daemon-dispatch.mjs';
import { LINUX_MANIFEST_LIMIT, linuxManifestSigningBytes, readLinuxReleaseJson, requireLinuxFields } from './linux-daemon-metadata.mjs';
import { linuxSigningKeyId, verifyLinuxQualification } from './linux-daemon-qualification.mjs';
import { reserveLinuxSigningSequence } from './linux-daemon-signing-ledger.mjs';
import { readBoundedRegular } from './verify-daemon-bundle.mjs';

export async function issueLinuxFinalSignature({ verifiedCandidate, policy, qualification, finalPrivateKey, finalPublicKey, ledger }) {
	const { manifest, evidenceSha256 } = verifyLinuxQualification(qualification);
	const { record, origin } = verifiedCandidate;
	const role = manifest.lane;
	const sourceRef = manifest.origin.ref;
	const permitted = role === 'production'
		? sourceRef === policy.releaseRef && policy.releaseRefProtected === true
		: policy.developmentRefs.includes(sourceRef) && sourceRef !== policy.releaseRef;
	if (!permitted || !isDeepStrictEqual(manifest.origin, origin) || !isDeepStrictEqual(manifest.host, record.host) ||
		['target', 'lane', 'version', 'archiveName', 'archiveSha256', 'archiveBytes', 'runtimeFingerprint']
			.some(field => manifest[field] !== record[field])) throw new Error('Linux final signing candidate or ref differs from qualification');
	const key = finalPrivateKey?.type === 'private' ? finalPrivateKey : createPrivateKey(finalPrivateKey);
	if (key.asymmetricKeyType !== 'ed25519') throw new Error('Linux final signing requires an Ed25519 key');
	const finalId = linuxSigningKeyId(createPublicKey(key));
	if (finalId !== linuxSigningKeyId(finalPublicKey)) throw new Error('Linux final signing key differs from the pinned channel key');
	if (finalId === linuxSigningKeyId(qualification.qualificationKey) || finalId === linuxSigningKeyId(qualification.evidenceKey)) {
		throw new Error('Linux final signature requires an independent signing key');
	}
	await reserveLinuxSigningSequence({ ...ledger, channel: manifest.channel,
		sequence: manifest.sequence, manifestSha256: manifest.manifestSha256 });
	return { bytes: qualification.bytes, signature: sign(null, linuxManifestSigningBytes(qualification.bytes, role), key),
		role, manifestSha256: manifest.manifestSha256, evidenceSha256 };
}

async function main([approvalPath, inputDir, keyDir, output, ...extra]) {
	if (!approvalPath || !inputDir || !keyDir || !output || extra.length) {
		throw new Error('usage: sign-linux-daemon-candidate.mjs PROTECTED_APPROVAL QUALIFICATION_INPUT TRUSTED_KEY_DIRECTORY NEW_OUTPUT');
	}
	const approval = readLinuxReleaseJson(await readBoundedRegular(approvalPath, LINUX_MANIFEST_LIMIT));
	requireLinuxFields(approval, ['origin', 'lane', 'version', 'expectedArchiveSha256', 'requiredTests'], 'protected signing approval');
	const policy = readLinuxBuildPolicy(process.env.LINUX_RELEASE_REF, process.env.LINUX_DEVELOPMENT_REFS);
	const workspace = await mkdtemp(join(tmpdir(), 'insrc-linux-final-signing-'));
	let created = false;
	try {
		// The protected fetch checks live repository/ref policy and exact
		// artifact bytes without importing from any candidate path.
		const verifiedCandidate = await fetchLinuxDaemonCandidate({
			...approval, repo: process.env.GH_REPO, policy, destination: join(workspace, 'candidate'),
		});
		const input = (name, size) => readBoundedRegular(join(inputDir, name), size);
		const key = name => readBoundedRegular(join(keyDir, name), 4096);
		const qualification = {
			bytes: await input('manifest.json', LINUX_MANIFEST_LIMIT),
			qualificationSignature: await input('manifest.qualification.sig', 64), qualificationKey: await key('qualification.pub'),
			evidence: await input('qualification.json', LINUX_MANIFEST_LIMIT),
			evidenceSignature: await input('qualification.sig', 64), evidenceKey: await key('evidence.pub'),
			requiredTests: approval.requiredTests,
			expected: { repository: approval.origin.repository, ref: approval.origin.ref, lane: approval.lane, version: approval.version },
		};
		const result = await issueLinuxFinalSignature({
			verifiedCandidate, policy: { ...policy, releaseRefProtected: approval.lane === 'production' },
			qualification, finalPrivateKey: await key(`${approval.lane}.key`), finalPublicKey: await key(`${approval.lane}.pub`),
			ledger: { remote: process.env.LINUX_SIGNING_LEDGER_REMOTE, ref: process.env.LINUX_SIGNING_LEDGER_REF },
		});
		await mkdir(output, { mode: 0o700 });
		created = true;
		await writeFile(join(output, 'manifest.json'), result.bytes, { flag: 'wx', mode: 0o600 });
		await writeFile(join(output, `manifest.${result.role}.sig`), result.signature, { flag: 'wx', mode: 0o600 });
	} catch (error) {
		if (created) await rm(output, { recursive: true, force: true });
		throw error;
	} finally { await rm(workspace, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main(process.argv.slice(2));
