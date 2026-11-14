/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { link, mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
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

async function qualifyPredecessor({ prior, evidence, staged, candidateFingerprint, publicKey, compatibility }) {
	if (!prior && !evidence) return null;
	if (!prior || !evidence) throw new Error('upgrade requires the prior proof and local qualification evidence');
	const { manifest, manifestSha256 } = verifyDevelopmentManifest(prior.bytes, prior.signature, publicKey);
	if (manifest.repository !== staged.repository || !isDeepStrictEqual(manifest.compatibility, compatibility)) {
		throw new Error('development predecessor writable formats differ');
	}
	const record = JSON.parse(evidence.toString('utf8'));
	const expected = {
		schemaVersion: 1, predecessorManifestSha256: manifestSha256, predecessorRuntimeFingerprint: manifest.runtimeFingerprint,
		candidateCommit: staged.commit, candidateArchiveSha256: staged.archiveSha256, candidateRuntimeFingerprint: candidateFingerprint,
		launchProfile: 'managed', candidateWriteObserved: true, candidateInterrupted: true, predecessorReopened: true,
	};
	if (!isDeepStrictEqual(record, expected)) throw new Error('crash-reopen evidence does not qualify these exact releases');
	return {
		manifestSha256, commit: manifest.commit, sequence: manifest.sequence, runtimeFingerprint: manifest.runtimeFingerprint,
		compatibility: manifest.compatibility, crashConsistentReopening: true, launchProfiles: ['managed'],
		qualificationEvidenceSha256: sha256(evidence),
	};
}

// The operator supplies the builder's public trust anchor and independently observed local qualification.
export async function signDevelopmentCandidate({
	directory, ledgerDirectory, sequence, key, builderKey, policyBytes, policySignature, compatibility, prior, evidence,
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
		({ fingerprint } = await stageVerifiedBundle(join(directory, draft.archiveName), draft, staging, sha256(draftBytes)));
	} finally { await rm(staging, { recursive: true, force: true }); }
	const predecessor = await qualifyPredecessor({ prior, evidence, staged: draft, candidateFingerprint: fingerprint,
		publicKey: publicPem, compatibility });
	const bytes = encodeDevelopmentManifest({ ...draft, predecessor });
	const signature = sign(null, developmentManifestSigningBytes(bytes), privateKey);
	// Publish the sequence binding before releasing any signed bundle files.
	const ledgerName = `${sha256(Buffer.from(policy.repository))}-development-${sequence}`;
	await publish(ledgerDirectory, ledgerName, Buffer.from(sha256(bytes) + '\n'));
	await publish(directory, 'manifest.json', bytes);
	await publish(directory, 'manifest.development.sig', signature);
	return { bytes, signature };
}

async function main([directory, ledgerDirectory, sequence, keyPath, builderKeyPath, policyPath, compatibilityPath,
	priorDirectory, evidencePath, ...extra]) {
	if (!directory || !ledgerDirectory || !/^[1-9][0-9]*$/.test(sequence ?? '') || !keyPath || !builderKeyPath ||
		!policyPath || !compatibilityPath || Boolean(priorDirectory) !== Boolean(evidencePath) || extra.length) {
		throw new Error('usage: sign-daemon-development.mjs DIR LEDGER SEQUENCE KEY BUILDER_PUB POLICY COMPATIBILITY [PRIOR_DIR EVIDENCE]');
	}
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
