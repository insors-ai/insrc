/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readdir, realpath, rm, rmdir } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
	DEVELOPMENT_NODE_VERSION, verifyAndStageDevelopmentBundle, verifyDevelopmentManifest, verifyDevelopmentPolicy,
} from './daemon-development-metadata.mjs';
import { pinnedRecovery, retainBundleTrustAnchor } from './install-daemon-bundle.mjs';
import { readBoundedRegular } from './verify-daemon-bundle.mjs';

async function requireDevelopmentGuest(home, uid) {
	const marker = await lstat(join(home, '.insrc-development-guest'));
	if (!marker.isFile() || marker.uid !== uid || (marker.mode & 0o077) !== 0) {
		throw new Error('development installation requires a private guest marker');
	}
	for (const name of ['.insrc-daemon-pilot-releases', '.insrc-pilot-qualification-account']) {
		if (await lstat(join(home, name)).catch(error => { if (error.code !== 'ENOENT') throw error; })) {
			throw new Error(`development installation refuses foreign state: ${name}`);
		}
	}
}

export async function requireUnusedDevelopmentGuest(home, uid) {
	await requireDevelopmentGuest(home, uid);
	for (const name of ['.insrc', '.insrc-daemon-development-releases']) {
		const occupied = await lstat(join(home, name)).catch(error => {
			if (error.code !== 'ENOENT') throw error;
		});
		if (occupied !== undefined) throw new Error(`development first install requires an unused guest: ${name}`);
	}
}

async function requirePrivateDirectory(path, uid) {
	const info = await lstat(path);
	if (!info.isDirectory() || await realpath(path) !== path || info.uid !== uid || (info.mode & 0o077) !== 0) {
		throw new Error('development installation requires private, canonical roots');
	}
}

const verifyPinnedManifest = (bytes, signature, _domain, key) => verifyDevelopmentManifest(bytes, signature, key).manifest;

export function developmentPinnedRecovery(journal, { stateRoot, releaseParent, publicKey, repository }) {
	return pinnedRecovery(journal, { stateRoot, root: releaseParent, domain: 'development',
		key: publicKey, verifyManifest: verifyPinnedManifest, repository });
}

export async function readDevelopmentGuestJournal({ stateRoot, releaseParent, publicKey, uid }) {
	const info = await lstat(stateRoot).catch(error => { if (error.code !== 'ENOENT') throw error; });
	if (info === undefined) return undefined;
	try {
		for (const path of [stateRoot, join(stateRoot, 'bundle-trust'), join(stateRoot, 'managed-lifecycle'), releaseParent]) {
			await requirePrivateDirectory(path, uid);
		}
	} catch (error) {
		if (error.code === 'ENOENT') throw new Error('development first install requires an unused guest: .insrc');
		throw error;
	}
	const trustRoot = join(stateRoot, 'bundle-trust');
	if ((await readdir(trustRoot)).some(name => name !== 'development.pem') ||
		!(await readBoundedRegular(join(trustRoot, 'development.pem'), 1024)).equals(publicKey)) {
		throw new Error('bootstrap trust differs from the installed development key');
	}
	const journalPath = join(stateRoot, 'managed-lifecycle', 'journal.json');
	const journalInfo = await lstat(journalPath);
	if (!journalInfo.isFile() || journalInfo.uid !== uid || journalInfo.nlink !== 1 || (journalInfo.mode & 0o077) !== 0) {
		throw new Error('development installation requires a private owned journal');
	}
	const journal = JSON.parse(await readBoundedRegular(journalPath, 384 * 1024));
	if (journal.version !== 1 || journal.root !== stateRoot || !Object.hasOwn(journal, 'active')) {
		throw new Error('invalid development installation journal');
	}
	return journal;
}

export function verifyDevelopmentPredecessor(manifest, manifestSha256, installed, publicKey, qualificationOnly) {
	const proof = installed?.proof;
	if (proof?.floor?.domain !== 'development') throw new Error('development activation requires an installed development bundle');
	const { manifest: prior, manifestSha256: digest } = verifyDevelopmentManifest(Buffer.from(proof.manifestBase64, 'base64'),
		Buffer.from(proof.signatureBase64, 'base64'), publicKey);
	if (prior.qualificationOnly || prior.repository !== manifest.repository || proof.floor.repository !== prior.repository ||
		proof.floor.sequence !== prior.sequence || proof.floor.manifestSha256 !== digest ||
		proof.floor.archiveSha256 !== prior.archiveSha256 || proof.fingerprint !== prior.runtimeFingerprint) {
		throw new Error('installed development proof identity differs from its receipt');
	}
	if (!qualificationOnly && digest === manifestSha256) return;
	if (manifest.sequence <= prior.sequence || manifest.commit === prior.commit || !isDeepStrictEqual(manifest.compatibility, prior.compatibility)) {
		throw new Error('candidate does not qualify the installed development bundle');
	}
	if (!qualificationOnly) {
		const pin = manifest.predecessor;
		if (pin?.commit !== prior.commit || pin.manifestSha256 !== digest || pin.sequence !== prior.sequence ||
			pin.runtimeFingerprint !== prior.runtimeFingerprint || !isDeepStrictEqual(pin.compatibility, prior.compatibility)) {
			throw new Error('candidate does not qualify the installed development bundle');
		}
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
	await requireDevelopmentGuest(home, uid);
	const trustFile = name => new URL(`./trust/${name}`, import.meta.url);
	const publicKey = await readBoundedRegular(trustFile('development.pem'), 1024);
	const policyBytes = await readBoundedRegular(trustFile('development-policy.json'), 64 * 1024);
	const policySignature = await readBoundedRegular(trustFile('development-policy.sig'), 64);
	const policy = verifyDevelopmentPolicy(policyBytes, policySignature, publicKey);
	const releaseParent = join(home, '.insrc-daemon-development-releases');
	const stateRoot = join(home, '.insrc');
	const trustRoot = join(stateRoot, 'bundle-trust');
	const env = { ...process.env, HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
	delete env.NODE_OPTIONS;
	delete env.NODE_PATH;
	const journal = await readDevelopmentGuestJournal({ stateRoot, releaseParent, publicKey, uid });
	if (journal && journal.active !== null) {
		const recovery = await developmentPinnedRecovery(journal, { stateRoot, releaseParent, publicKey, repository: policy.repository });
		execFileSync(recovery.runtime, [recovery.entry, 'recover'], { env, stdio: 'inherit' });
		process.stdout.write('Recovered the existing development transaction. Rerun to install a different release.\n');
		return;
	}
	const verification = {
		bytes: await readBoundedRegular(manifestPath, 64 * 1024),
		signature: await readBoundedRegular(signaturePath, 64),
		publicKey,
		qualificationOnly,
		policyBytes, policySignature,
		host: { platform: process.platform, architecture: process.arch, nodeVersion: process.versions.node, requestedVersion,
			macOSVersion: execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 5000 }).trim() },
	};
	const { manifest, manifestSha256: incomingDigest } = await verifyAndStageDevelopmentBundle(verification);
	const fresh = journal === undefined;
	if (fresh) {
		if (qualificationOnly || manifest.predecessor !== null) throw new Error('development first install requires a fresh-install manifest');
		await requireUnusedDevelopmentGuest(home, uid);
		await mkdir(releaseParent, { mode: 0o700 });
	} else verifyDevelopmentPredecessor(manifest, incomingDigest, journal.installedBundle, publicKey, qualificationOnly);
	const { staged, manifestSha256 } = await verifyAndStageDevelopmentBundle({ ...verification, archive, releaseParent })
		.catch(async error => {
			if (fresh) await rmdir(releaseParent);
			throw error;
		});
	if (fresh) {
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
	execFileSync(staged.runtime, [join(staged.root, 'out/bin/insrc-daemon-control.js'),
		qualificationOnly ? 'qualify-development-bundle' : 'activate-development-bundle', staged.root, staged.commit], {
		env, input: JSON.stringify(proof), stdio: ['pipe', 'inherit', 'inherit'],
	});
	if (!qualificationOnly && journal?.installedBundle?.proof.floor.manifestSha256 === incomingDigest) {
		await rm(staged.root, { recursive: true, force: true });
	}
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
