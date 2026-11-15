/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { createPublicKey } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './daemon-bundle-metadata.mjs';

const [production, qualification, archive] = process.argv.slice(2);
if (!production || !qualification || !archive || process.platform !== 'darwin' ||
	process.arch !== 'arm64' || process.versions.node !== '22.22.1') {
	throw new Error('requires official Node 22.22.1 on macOS arm64: package-daemon-bootstrap.mjs PRODUCTION_PEM QUALIFICATION_PEM NEW_ARCHIVE');
}

const stage = await mkdtemp(join(tmpdir(), 'insrc-bootstrap-'));
try {
	const runtime = await realpath(process.execPath);
	await cp(runtime, join(stage, 'node'));
	await cp(resolve(dirname(runtime), '..', 'LICENSE'), join(stage, 'LICENSE.node'));
	for (const name of ['daemon-bundle-metadata.mjs', 'verify-daemon-bundle.mjs', 'stage-daemon-bundle.mjs', 'install-daemon-bundle.mjs']) {
		await cp(fileURLToPath(new URL(name, import.meta.url)), join(stage, name));
	}
	await mkdir(join(stage, 'trust'));
	const keys = [];
	for (const [domain, source] of [['production', production], ['qualification', qualification]]) {
		const key = createPublicKey(await readFile(source));
		if (key.asymmetricKeyType !== 'ed25519') throw new Error('bootstrap requires Ed25519 keys');
		const pem = key.export({ type: 'spki', format: 'pem' });
		keys.push(pem);
		await writeFile(join(stage, 'trust', `${domain}.pem`), pem);
	}
	if (keys[0] === keys[1]) throw new Error('production and qualification require distinct keys');
	// Reserve the path so an existing announcement archive cannot be overwritten.
	await writeFile(archive, '', { flag: 'wx' });
	try {
		execFileSync('/usr/bin/tar', ['--no-mac-metadata', '--no-xattrs', '--format', 'ustar', '-czf', resolve(archive),
			'-C', stage, 'node', 'LICENSE.node', 'daemon-bundle-metadata.mjs', 'verify-daemon-bundle.mjs', 'stage-daemon-bundle.mjs', 'install-daemon-bundle.mjs', 'trust']);
		process.stdout.write(`${sha256(await readFile(archive))}  ${archive}\n`);
	} catch (error) {
		await rm(archive, { force: true });
		throw error;
	}
} finally {
	await rm(stage, { recursive: true, force: true });
}
