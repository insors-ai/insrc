/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { link, lstat, mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { sha256 } from './daemon-bundle-metadata.mjs';
import { developmentManifestSigningBytes, encodeDevelopmentManifest, verifyDevelopmentManifest,
	verifyDevelopmentPolicy } from './daemon-development-metadata.mjs';
import { stageVerifiedBundle } from './stage-daemon-bundle.mjs';
import { readBoundedRegular } from './verify-daemon-bundle.mjs';

const metadataLimit = 64 * 1024;
const handoffPrefix = Buffer.from('insrc-daemon-development-handoff-v1\0');
export const developmentHandoffSigningBytes = bytes => Buffer.concat([handoffPrefix, bytes]);
export const developmentQualificationSigningBytes = bytes =>
	Buffer.concat([Buffer.from('insrc-daemon-development-qualification-v1\0'), bytes]);

async function syncDirectory(directory) {
	const handle = await open(directory, 'r');
	try { await handle.sync(); } finally { await handle.close(); }
}

async function publish(directory, name, bytes) {
	const staging = await mkdtemp(join(directory, '.publish-'));
	try {
		const temporary = join(staging, 'value');
		const handle = await open(temporary, 'wx', 0o600);
		try {
			await handle.writeFile(bytes);
			await handle.sync();
		} finally { await handle.close(); }
		const target = join(directory, name);
		try { await link(temporary, target); }
		catch (error) {
			if (error.code !== 'EEXIST' || !(await readBoundedRegular(target, metadataLimit)).equals(bytes)) {
				throw new Error(`conflicting development signing record: ${name}`, { cause: error });
			}
		}
		await syncDirectory(directory);
	} finally { await rm(staging, { recursive: true, force: true }); }
}

function requireHandoff(bytes, signature, builderKey) {
	const builder = createPublicKey(builderKey);
	if (builder.asymmetricKeyType !== 'ed25519' || signature.length !== 64 ||
		!verify(null, developmentHandoffSigningBytes(bytes), builder, signature)) {
		throw new Error('development builder handoff signature failed');
	}
	return JSON.parse(bytes.toString('utf8'));
}

function qualifyPredecessor({
	prior, evidence, evidenceSignature, qualificationKey, qualificationKeyId, staged, candidateFingerprint, publicKey, compatibility,
}) {
	if (!prior && !evidence) return null;
	if (!prior || !evidence) throw new Error('upgrade requires the prior proof and local qualification evidence');
	if (qualificationKeyId === undefined || qualificationKey === undefined) {
		throw new Error('managed upgrades require a qualifier pinned in signed development policy');
	}
	const key = createPublicKey(qualificationKey);
	if (key.asymmetricKeyType !== 'ed25519' || sha256(key.export({ type: 'spki', format: 'der' })) !== qualificationKeyId) {
		throw new Error('qualifier key differs from the signed development policy');
	}
	if (evidenceSignature?.length !== 64 ||
		!verify(null, developmentQualificationSigningBytes(evidence), key, evidenceSignature)) {
		throw new Error('development qualification signature failed');
	}
	const { manifest, manifestSha256 } = verifyDevelopmentManifest(prior.bytes, prior.signature, publicKey);
	if (manifest.repository !== staged.repository || !isDeepStrictEqual(manifest.compatibility, compatibility)) {
		throw new Error('development predecessor writable formats differ');
	}
	const record = JSON.parse(evidence.toString('utf8'));
	const rollback = record?.managedRollback;
	if (record?.launchProfile !== 'managed' || rollback == null) {
		throw new Error('managed upgrade requires a managed rollback receipt; graph-store probe evidence is insufficient');
	}
	const transactionId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
	const digest = /^[a-f0-9]{64}$/;
	if (typeof rollback.transactionId !== 'string' || !transactionId.test(rollback.transactionId) ||
		typeof rollback.candidateGeneration !== 'string' || !transactionId.test(rollback.candidateGeneration) ||
		typeof rollback.restoredGeneration !== 'string' || !transactionId.test(rollback.restoredGeneration) ||
		rollback.candidateGeneration === rollback.restoredGeneration ||
		typeof rollback.expectedStateSha256 !== 'string' || !digest.test(rollback.expectedStateSha256)) {
		throw new Error('invalid managed rollback receipt identity');
	}
	const expected = {
		schemaVersion: 2, predecessorManifestSha256: manifestSha256, predecessorRuntimeFingerprint: manifest.runtimeFingerprint,
		candidateCommit: staged.commit, candidateArchiveSha256: staged.archiveSha256, candidateRuntimeFingerprint: candidateFingerprint,
		predecessorCompatibility: manifest.compatibility, candidateCompatibility: compatibility,
		launchProfile: 'managed', candidateWriteObserved: true, candidateInterrupted: true, predecessorReopened: true,
		managedRollback: {
			transactionId: rollback.transactionId, outcome: 'rolled-back',
			candidateGeneration: rollback.candidateGeneration, restoredGeneration: rollback.restoredGeneration,
			servedRelease: manifest.commit, expectedStateSha256: rollback.expectedStateSha256,
			servedStateSha256: rollback.expectedStateSha256,
		},
	};
	if (!isDeepStrictEqual(record, expected)) throw new Error('crash-reopen evidence does not qualify these exact releases');
	return {
		manifestSha256, commit: manifest.commit, sequence: manifest.sequence, runtimeFingerprint: manifest.runtimeFingerprint,
		compatibility: manifest.compatibility, crashConsistentReopening: true, launchProfiles: ['managed'],
		qualificationProfile: 'managed-rollback-v1',
		qualificationEvidenceSha256: sha256(evidence),
	};
}

// The operator supplies the builder's public trust anchor and independently observed local qualification.
export async function signDevelopmentCandidate({
	directory, ledgerDirectory, sequence, key, builderKey, policyBytes, policySignature, compatibility, prior, evidence,
	evidenceSignature, qualificationKey,
}) {
	const privateKey = createPrivateKey(key);
	if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('development signer must be Ed25519');
	const publicKey = createPublicKey(privateKey);
	const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
	const policy = verifyDevelopmentPolicy(policyBytes, policySignature, publicPem);
	const candidateBytes = await readBoundedRegular(join(directory, 'candidate.json'), metadataLimit);
	const handoff = await readBoundedRegular(join(directory, 'candidate.sig'), 64);
	const candidate = requireHandoff(candidateBytes, handoff, builderKey);
	if (candidate.repository !== policy.repository || !policy.developmentRefs.includes(candidate.sourceRef)) {
		throw new Error('candidate provenance does not match the approved development policy');
	}
	const { runtimeFingerprint, ...fields } = candidate;
	const draft = { ...fields, sequence, runtimeFingerprint, compatibility, predecessor: null,
		keyId: sha256(publicKey.export({ type: 'spki', format: 'der' })) };
	const draftBytes = encodeDevelopmentManifest(draft);
	const staging = await realpath(await mkdtemp(join(tmpdir(), 'insrc-development-signing-')));
	let fingerprint;
	try {
		const extracted = await stageVerifiedBundle(join(directory, draft.archiveName), draft, staging, sha256(draftBytes));
		fingerprint = extracted.fingerprint;
		const declaration = JSON.parse(await readBoundedRegular(join(extracted.root, 'out/release-compatibility.json'), metadataLimit));
		if (!isDeepStrictEqual(declaration, { version: 1, releaseId: draft.commit, startup: 'rollback-compatible', ...compatibility })) {
			throw new Error('measured candidate writable formats differ from the supplied declaration');
		}
	} finally { await rm(staging, { recursive: true, force: true }); }
	const predecessor = qualifyPredecessor({ prior, evidence, evidenceSignature, qualificationKey,
		qualificationKeyId: policy.qualificationKeyId, staged: draft, candidateFingerprint: fingerprint, publicKey: publicPem, compatibility });
	const bytes = encodeDevelopmentManifest({ ...draft, predecessor });
	const signature = sign(null, developmentManifestSigningBytes(bytes), privateKey);
	// Publish the sequence binding before releasing any signed bundle files.
	const ledger = await realpath(ledgerDirectory);
	const ledgerInfo = await lstat(ledger);
	if (!ledgerInfo.isDirectory() || ledgerInfo.uid !== process.getuid() || (ledgerInfo.mode & 0o077)) {
		throw new Error('signing ledger must be a private operator-owned directory');
	}
	const ledgerPrefix = `${sha256(Buffer.from(policy.repository))}-development-`;
	if (sequence > 1) {
		const previous = await readBoundedRegular(join(ledger, ledgerPrefix + (sequence - 1)), 65);
		if (!/^[a-f0-9]{64}\n$/.test(previous.toString('utf8'))) throw new Error('invalid previous signing sequence binding');
	}
	await publish(ledger, ledgerPrefix + sequence, Buffer.from(sha256(bytes) + '\n'));
	await publish(directory, 'manifest.json', bytes);
	await publish(directory, 'manifest.development.sig', signature);
	return { bytes, signature };
}

async function main([directory, sequence, keyPath, builderKeyPath, policyPath, compatibilityPath,
	priorDirectory, evidencePath, qualificationKeyPath, ...extra]) {
	if (!directory || !/^[1-9][0-9]*$/.test(sequence ?? '') || !keyPath || !builderKeyPath ||
		!policyPath || !compatibilityPath || Boolean(priorDirectory) !== Boolean(evidencePath) ||
		Boolean(priorDirectory) !== Boolean(qualificationKeyPath) || extra.length) {
		throw new Error('usage: sign-daemon-development.mjs DIR SEQUENCE KEY BUILDER_PUB POLICY COMPATIBILITY [PRIOR_DIR EVIDENCE QUALIFIER_PUB]');
	}
	const ledgerDirectory = join(homedir(), '.insrc-development-signing', 'ledger');
	await signDevelopmentCandidate({
		directory, ledgerDirectory, sequence: Number(sequence), key: await readBoundedRegular(keyPath, 4096),
		builderKey: await readBoundedRegular(builderKeyPath, 4096), policyBytes: await readBoundedRegular(policyPath, metadataLimit),
		policySignature: await readBoundedRegular(policyPath + '.sig', 64),
		compatibility: JSON.parse(await readBoundedRegular(compatibilityPath, metadataLimit)),
		prior: priorDirectory === undefined ? undefined : {
			bytes: await readBoundedRegular(join(priorDirectory, 'manifest.json'), metadataLimit),
			signature: await readBoundedRegular(join(priorDirectory, 'manifest.development.sig'), 64),
		},
		evidence: evidencePath === undefined ? undefined : await readBoundedRegular(evidencePath, metadataLimit),
		evidenceSignature: evidencePath === undefined ? undefined : await readBoundedRegular(evidencePath + '.sig', 64),
		qualificationKey: qualificationKeyPath === undefined ? undefined : await readBoundedRegular(qualificationKeyPath, 4096),
	});
}

async function attestHandoff([directory, keyPath, ...extra]) {
	if (!directory || !keyPath || extra.length) throw new Error('usage: sign-daemon-development.mjs attest-handoff DIR BUILDER_KEY');
	const key = createPrivateKey(await readBoundedRegular(keyPath, 4096));
	if (key.asymmetricKeyType !== 'ed25519') throw new Error('development builder must be Ed25519');
	const bytes = await readBoundedRegular(join(directory, 'candidate.json'), metadataLimit);
	await publish(directory, 'candidate.sig', sign(null, developmentHandoffSigningBytes(bytes), key));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const args = process.argv.slice(2);
	if (args[0] === 'attest-handoff') await attestHandoff(args.slice(1));
	else await main(args);
}
