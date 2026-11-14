/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { manifestSigningBytes, readBundleManifest } from './daemon-bundle-metadata.mjs';

const [directory, commit, sequence, compatibilityFile] = process.argv.slice(2);
if (!directory || !commit || !compatibilityFile || !/^[1-9][0-9]*$/.test(sequence ?? '')) {
	throw new Error('usage: prepare-daemon-qualification.mjs ARTIFACT_DIR COMMIT SEQUENCE COMPATIBILITY_JSON');
}
const candidate = JSON.parse(await readFile(join(directory, 'candidate.json'), 'utf8'));
const { compatibility, predecessors } = JSON.parse(await readFile(compatibilityFile, 'utf8'));
const { version, target, minimumMacOS, nodeVersion, archiveName, archiveSha256, archiveBytes } = candidate;
const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, channel: 'macos-arm64-pilot', sequence: Number(sequence),
	version, commit, target, minimumMacOS, nodeVersion, archiveName, archiveSha256, archiveBytes, compatibility, predecessors }) + '\n');
readBundleManifest(bytes);
if (candidate.commit !== commit) throw new Error('candidate commit differs from qualified commit');
const archive = join(directory, archiveName);
if ((await stat(archive)).size !== archiveBytes) throw new Error('candidate archive size mismatch');
const hash = createHash('sha256');
for await (const chunk of createReadStream(archive)) hash.update(chunk);
if (hash.digest('hex') !== archiveSha256) throw new Error('candidate archive checksum mismatch');
const key = createPrivateKey(process.env.INSRC_QUALIFICATION_KEY ?? '');
if (key.asymmetricKeyType !== 'ed25519') throw new Error('qualification signer is not Ed25519');
await writeFile(join(directory, 'manifest.json'), bytes, { flag: 'wx' });
await writeFile(join(directory, 'manifest.qualification.sig'), sign(null, manifestSigningBytes(bytes, 'qualification'), key), { flag: 'wx' });
