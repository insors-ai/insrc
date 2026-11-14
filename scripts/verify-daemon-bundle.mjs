/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBundleTarget, sha256, verifyBundleManifest } from './daemon-bundle-metadata.mjs';
import { stageVerifiedBundle } from './stage-daemon-bundle.mjs';

export async function readBoundedRegular(path, limit) {
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const stat = await file.stat();
		if (!stat.isFile() || stat.size < 1 || stat.size > limit) throw new Error('not a bounded regular release metadata file');
		const bytes = Buffer.alloc(stat.size + 1);
		let offset = 0;
		while (offset < bytes.length) {
			const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, null);
			if (bytesRead === 0) break;
			offset += bytesRead;
		}
		if (offset !== stat.size) throw new Error('release metadata size changed while reading');
		return bytes.subarray(0, offset);
	} finally {
		await file.close();
	}
}

export async function verifyAndStageBundle({ bytes, signature, domain, key, host, archive, releaseParent }) {
	const manifest = verifyBundleManifest(bytes, signature, domain, key);
	requireBundleTarget(manifest, host);
	const manifestSha256 = sha256(bytes);
	const staged = archive === undefined ? undefined : await stageVerifiedBundle(archive, manifest, releaseParent);
	return { manifest, manifestSha256, domain, staged };
}

async function main([domain, requestedVersion, manifestPath, signaturePath, archive, releaseParent]) {
	if (!['production', 'qualification'].includes(domain) || !requestedVersion || !manifestPath || !signaturePath) {
		throw new Error('usage: verify-daemon-bundle.mjs production|qualification VERSION MANIFEST SIGNATURE [ARCHIVE RELEASE_PARENT]');
	}
	if (Boolean(archive) !== Boolean(releaseParent)) throw new Error('archive and release parent must be supplied together');
	// This file is installed only by the separately authenticated bootstrap.
	// No downloaded release, environment variable or argument sets trusted keys.
	const key = await readBoundedRegular(new URL(`./trust/${domain}.pem`, import.meta.url), 1024);
	const bytes = await readBoundedRegular(manifestPath, 64 * 1024);
	const signature = await readBoundedRegular(signaturePath, 64);
	const host = {
		platform: process.platform, architecture: process.arch, requestedVersion,
		macOSVersion: execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 5000 }).trim(),
	};
	const result = await verifyAndStageBundle({ bytes, signature, domain, key, host, archive, releaseParent });
	process.stdout.write(JSON.stringify(result) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
