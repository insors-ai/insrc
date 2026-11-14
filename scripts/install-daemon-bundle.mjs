/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { chmod, lstat, mkdir, open, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBoundedRegular } from './verify-daemon-bundle.mjs';
import { sha256, verifyBundleManifest } from './daemon-bundle-metadata.mjs';
import { measureBundleRuntime } from './stage-daemon-bundle.mjs';

export async function pinnedRecovery(journal, { stateRoot, root, domain, key }) {
	if (journal.version !== 1 || journal.root !== stateRoot) throw new Error('invalid bundle recovery journal identity');
	const { active } = journal;
	if (active === null) return undefined;
	const proof = active?.kind === 'start' ? active.activation?.bundleProof : active?.predecessor?.bundleProof?.candidate;
	const installation = active?.kind === 'start' ? active.activation?.installation : active?.predecessor?.pins?.candidate;
	if (!proof || !installation || installation.stateRoot !== stateRoot) throw new Error('another daemon lifecycle transaction is unfinished');
	const bytes = Buffer.from(proof.manifestBase64, 'base64');
	const m = verifyBundleManifest(bytes, Buffer.from(proof.signatureBase64, 'base64'), domain, key);
	const { releaseRoot, runtime, releaseId } = installation;
	if (proof.floor.domain !== domain || sha256(bytes) !== proof.floor.manifestSha256 || m.commit !== releaseId ||
		m.sequence !== proof.floor.sequence || m.channel !== proof.floor.channel ||
		m.archiveSha256 !== proof.floor.archiveSha256 || dirname(releaseRoot) !== root || await realpath(releaseRoot) !== releaseRoot ||
		runtime !== join(releaseRoot, 'tools/node') || await realpath(runtime) !== runtime ||
		proof.fingerprint !== m.runtimeFingerprint ||
		await measureBundleRuntime(releaseRoot) !== m.runtimeFingerprint) throw new Error('unfinished bundle transaction does not match its authenticated release');
	return { runtime, entry: join(releaseRoot, 'out/bin/insrc-daemon-control.js') };
}

async function main() {
	const [domain, version, manifest, signature, archive, checkout, legacyRuntime] = process.argv.slice(2);
	if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.versions.node !== '22.22.1'
		|| !['qualification', 'production'].includes(domain) || !version || !manifest || !signature || !archive
		|| Boolean(checkout) !== Boolean(legacyRuntime)) {
		throw new Error('usage: install-daemon-bundle.mjs DOMAIN VERSION MANIFEST SIGNATURE ARCHIVE [CHECKOUT LEGACY_NODE]');
	}
	if (domain === 'qualification') {
		const marker = await lstat(join(homedir(), '.insrc-pilot-qualification-account'));
		if (!marker.isFile() || marker.uid !== process.getuid() || (marker.mode & 0o077)) {
			throw new Error('qualification requires a dedicated macOS account with a private qualification marker');
		}
	}
	const parent = join(homedir(), '.insrc-daemon-pilot-releases');
	const made = await mkdir(parent, { recursive: true, mode: 0o700 });
	if (made) await chmod(parent, 0o700);
	const root = await realpath(parent);
	if (root !== parent) throw new Error('release directory must not be a symlink');
	const stateRoot = join(homedir(), '.insrc');
	await mkdir(stateRoot, { mode: 0o700, recursive: true });
	const stateInfo = await lstat(stateRoot);
	if (await realpath(stateRoot) !== stateRoot || !stateInfo.isDirectory() || stateInfo.uid !== process.getuid()
		|| (stateInfo.mode & 0o022)) throw new Error('unsafe installation root');
	const trustRoot = join(stateRoot, 'bundle-trust');
	await mkdir(trustRoot, { mode: 0o700, recursive: true });
	const trustInfo = await lstat(trustRoot);
	if (!trustInfo.isDirectory() || trustInfo.uid !== process.getuid() || (trustInfo.mode & 0o077)) throw new Error('unsafe bundle trust directory');
	const key = await readBoundedRegular(new URL(`./trust/${domain}.pem`, import.meta.url), 1024);
	const anchor = join(trustRoot, domain + '.pem');
	try {
		const file = await open(anchor, 'wx', 0o600);
		try { await file.writeFile(key); await file.sync(); } finally { await file.close(); }
		const dir = await open(trustRoot, 'r');
		try { await dir.sync(); } finally { await dir.close(); }
	} catch (error) { if (error.code !== 'EEXIST') throw error; }
	if (!(await readBoundedRegular(anchor, 1024)).equals(key)) throw new Error('bootstrap key differs from the installed trust anchor');

	const journal = await readBoundedRegular(join(stateRoot, 'managed-lifecycle/journal.json'), 384 * 1024)
		.catch(error => { if (error.code !== 'ENOENT') throw error; });
	if (journal !== undefined) {
		const recovery = await pinnedRecovery(JSON.parse(journal), { stateRoot, root, domain, key });
		if (recovery !== undefined) {
			execFileSync(recovery.runtime, [recovery.entry, 'recover'], { stdio: 'inherit' });
			process.stdout.write('Recovered the existing bundle transaction. Rerun to install a different release.\n');
			return;
		}
	}
	const { staged, proof } = JSON.parse(execFileSync(process.execPath,
		[fileURLToPath(new URL('./verify-daemon-bundle.mjs', import.meta.url)), domain, version, manifest, signature, archive, root],
		{ encoding: 'utf8', maxBuffer: 512 * 1024 }));
	const args = [join(staged.root, 'out/bin/insrc-daemon-control.js'), 'activate-bundle', staged.root, staged.commit];
	if (checkout) args.push(checkout, legacyRuntime);
	// The daemon's executable is reached only after the trusted bootstrap verifies
	// the signed metadata, archive snapshot and extracted runtime.
	execFileSync(staged.runtime, args, { input: JSON.stringify(proof), stdio: ['pipe', 'inherit', 'inherit'] });
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
