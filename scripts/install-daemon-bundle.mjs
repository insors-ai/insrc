/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { chmod, lstat, mkdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const { staged, proof } = JSON.parse(execFileSync(process.execPath,
	[fileURLToPath(new URL('./verify-daemon-bundle.mjs', import.meta.url)), domain, version, manifest, signature, archive, root],
	{ encoding: 'utf8', maxBuffer: 512 * 1024 }));
const args = [join(staged.root, 'out/bin/insrc-daemon-control.js'), 'activate-bundle', staged.root, staged.commit];
if (checkout) args.push(checkout, legacyRuntime);
// The daemon's executable is reached only after the trusted bootstrap verifies
// the signed metadata, archive snapshot and extracted runtime.
execFileSync(staged.runtime, args, { input: JSON.stringify(proof), stdio: ['pipe', 'inherit', 'inherit'] });
