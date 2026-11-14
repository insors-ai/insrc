/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { manifestSigningBytes, readCandidateOrigin, readQualification, sha256, verifyBundleManifest, requireBundleTarget } from './daemon-bundle-metadata.mjs';
import { readBoundedRegular } from './verify-daemon-bundle.mjs';

export async function checkPromotion({ recordDir, artifactDir, repository, archiveSha256, qualificationKey }) {
	const q = readQualification(await readBoundedRegular(join(recordDir, 'qualification.v1.json'), 32768));
	const c = q.candidate;
	if (c.repository !== repository || c.archiveSha256 !== archiveSha256) throw new Error('approval does not identify the qualified archive');
	const bytes = await readBoundedRegular(join(recordDir, 'manifest.json'), 65536);
	if (sha256(bytes) !== c.manifestSha256) throw new Error('qualification manifest checksum mismatch');
	const signature = await readBoundedRegular(join(recordDir, 'manifest.qualification.sig'), 64);
	const manifest = verifyBundleManifest(bytes, signature, 'qualification', qualificationKey);
	const origin = readCandidateOrigin(JSON.parse((await readBoundedRegular(join(artifactDir, 'verified-origin.json'), 8192)).toString('utf8')));
	if (!isDeepStrictEqual(origin, c.candidateOrigin) || !isDeepStrictEqual(origin, manifest.candidateOrigin)) {
		throw new Error('signed candidate origin differs from approved evidence or GitHub artifact');
	}
	requireBundleTarget(manifest, { platform: 'darwin', architecture: q.host.arch, macOSVersion: q.host.macOSVersion, requestedVersion: c.version });
	const build = JSON.parse((await readBoundedRegular(join(artifactDir, 'candidate.json'), 8192)).toString('utf8'));
	for (const field of ['branch', 'lane', 'commit', 'runId', 'runAttempt']) {
		if (build[field] !== origin[field]) throw new Error(`candidate origin differs: ${field}`);
	}
	for (const field of ['commit', 'version', 'target', 'archiveSha256', 'archiveBytes']) {
		if (manifest[field] !== c[field] || build[field] !== c[field]) throw new Error(`candidate identity mismatch: ${field}`);
	}
	for (const field of ['archiveName', 'minimumMacOS', 'nodeVersion']) {
		if (manifest[field] !== build[field]) throw new Error(`candidate identity mismatch: ${field}`);
	}
	for (const { id, evidenceSha256 } of q.tests) {
		if (sha256(await readBoundedRegular(join(recordDir, `${id}.log`), 8 * 1024 ** 2)) !== evidenceSha256) {
			throw new Error(`local evidence checksum mismatch: ${id}`);
		}
	}
	const archive = join(artifactDir, manifest.archiveName);
	if ((await stat(archive)).size !== c.archiveBytes) throw new Error('archive size mismatch');
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(archive)) hash.update(chunk);
	if (hash.digest('hex') !== archiveSha256) throw new Error('archive digest mismatch');
	return { manifest, bytes };
}

async function main([recordDir, artifactDir, repository, archiveSha256]) {
	const { bytes, manifest } = await checkPromotion({ recordDir, artifactDir, repository, archiveSha256,
		qualificationKey: process.env.INSRC_QUALIFICATION_PUBLIC_KEY ?? '' });
	const key = createPrivateKey(process.env.INSRC_PRODUCTION_KEY ?? '');
	if (key.asymmetricKeyType !== 'ed25519') throw new Error('production signer is not Ed25519');
	const signature = sign(null, manifestSigningBytes(bytes, 'production'), key);
	await writeFile(join(artifactDir, 'manifest.json'), bytes, { flag: 'wx' });
	await writeFile(join(artifactDir, 'manifest.production.sig'), signature, { flag: 'wx' });
	process.stdout.write(JSON.stringify({ tag: `daemon-v${manifest.version}`, commit: manifest.commit, archive: manifest.archiveName }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
