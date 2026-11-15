/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, realpath, rmdir } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	DEVELOPMENT_NODE_VERSION, verifyAndStageDevelopmentBundle,
} from './daemon-development-metadata.mjs';
import { retainBundleTrustAnchor } from './install-daemon-bundle.mjs';
import { readBoundedRegular } from './verify-daemon-bundle.mjs';

export async function requireUnusedDevelopmentGuest(home, uid) {
	const marker = await lstat(join(home, '.insrc-development-guest'));
	if (!marker.isFile() || marker.uid !== uid || (marker.mode & 0o077) !== 0) {
		throw new Error('development installation requires a private guest marker');
	}
	for (const name of ['.insrc', '.insrc-daemon-development-releases',
		'.insrc-daemon-pilot-releases', '.insrc-pilot-qualification-account']) {
		const occupied = await lstat(join(home, name)).catch(error => {
			if (error.code !== 'ENOENT') throw error;
		});
		if (occupied !== undefined) throw new Error(`development first install requires an unused guest: ${name}`);
	}
}

async function main([requestedVersion, manifestPath, signaturePath, archive, ...extra]) {
	const qualificationOnly = extra.length === 1 && extra[0] === '--qualify';
	if (!requestedVersion || !manifestPath || !signaturePath || !archive || (extra.length && !qualificationOnly) ||
		process.platform !== 'darwin' || process.arch !== 'arm64' || process.versions.node !== DEVELOPMENT_NODE_VERSION) {
		throw new Error('usage on the pinned Apple Silicon guest runtime: install-daemon-development-bundle.mjs VERSION MANIFEST SIGNATURE ARCHIVE [--qualify]');
	}
	const uid = process.getuid();
	const home = userInfo().homedir;
	if (uid === 0 || await realpath(home) !== home || homedir() !== home) throw new Error('development installer requires the guest account home');
	const inGuest = execFileSync('/usr/sbin/sysctl', ['-n', 'kern.hv_vmm_present'], { encoding: 'utf8', timeout: 5000 }).trim();
	if (inGuest !== '1') throw new Error('development bundle installation requires a macOS virtual machine');
	if (!qualificationOnly) await requireUnusedDevelopmentGuest(home, uid);
	const trustFile = name => new URL(`./trust/${name}`, import.meta.url);
	const publicKey = await readBoundedRegular(trustFile('development.pem'), 1024);
	const verification = {
		bytes: await readBoundedRegular(manifestPath, 64 * 1024),
		signature: await readBoundedRegular(signaturePath, 64),
		publicKey,
		qualificationOnly,
		policyBytes: await readBoundedRegular(trustFile('development-policy.json'), 64 * 1024),
		policySignature: await readBoundedRegular(trustFile('development-policy.sig'), 64),
		host: { platform: process.platform, architecture: process.arch, nodeVersion: process.versions.node, requestedVersion,
			macOSVersion: execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 5000 }).trim() },
	};
	const { manifest } = await verifyAndStageDevelopmentBundle(verification);
	if (manifest.predecessor !== null) throw new Error('development first install requires a fresh-install manifest');
	const releaseParent = join(home, '.insrc-daemon-development-releases');
	const stateRoot = join(home, '.insrc');
	const trustRoot = join(stateRoot, 'bundle-trust');
	if (qualificationOnly) {
		for (const path of [stateRoot, trustRoot, releaseParent]) {
			const info = await lstat(path);
			if (!info.isDirectory() || await realpath(path) !== path || info.uid !== uid || (info.mode & 0o077) !== 0) {
				throw new Error('qualification requires private installed development roots');
			}
		}
		if (!(await readBoundedRegular(join(trustRoot, 'development.pem'), 1024)).equals(publicKey)) {
			throw new Error('qualification trust differs from the installed development key');
		}
	} else await mkdir(releaseParent, { mode: 0o700 });
	const { staged, manifestSha256 } = await verifyAndStageDevelopmentBundle({ ...verification, archive, releaseParent })
		.catch(async error => {
			if (!qualificationOnly) await rmdir(releaseParent);
			throw error;
		});
	if (!qualificationOnly) {
		await mkdir(stateRoot, { mode: 0o700 });
		await mkdir(trustRoot, { mode: 0o700 });
		await retainBundleTrustAnchor(trustRoot, 'development', publicKey);
	}
	const proof = {
		version: 1, floor: { domain: 'development', channel: 'development', repository: manifest.repository,
			sequence: manifest.sequence, manifestSha256, archiveSha256: manifest.archiveSha256 },
		fingerprint: staged.fingerprint, manifestBase64: verification.bytes.toString('base64'),
		signatureBase64: verification.signature.toString('base64'),
	};
	const env = { ...process.env, HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
	delete env.NODE_OPTIONS;
	delete env.NODE_PATH;
	execFileSync(staged.runtime, [join(staged.root, 'out/bin/insrc-daemon-control.js'),
		qualificationOnly ? 'qualify-development-bundle' : 'activate-development-bundle', staged.root, staged.commit], {
		env, input: JSON.stringify(proof), stdio: ['pipe', 'inherit', 'inherit'],
	});
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
