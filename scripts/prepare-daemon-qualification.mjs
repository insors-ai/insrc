/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createPrivateKey, sign } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { manifestSigningBytes, readBundleManifest, sha256 } from './daemon-bundle-metadata.mjs';
import { stageVerifiedBundle } from './stage-daemon-bundle.mjs';

const [directory, commit, sequence, compatibilityFile] = process.argv.slice(2);
if (!directory || !commit || !compatibilityFile || !/^[1-9][0-9]*$/.test(sequence ?? '')) {
	throw new Error('usage: prepare-daemon-qualification.mjs ARTIFACT_DIR COMMIT SEQUENCE COMPATIBILITY_JSON');
}
const candidate = JSON.parse(await readFile(join(directory, 'candidate.json'), 'utf8'));
const { compatibility, predecessors } = JSON.parse(await readFile(compatibilityFile, 'utf8'));
const { version, target, minimumMacOS, nodeVersion, archiveName, archiveSha256, archiveBytes } = candidate;
const draft = { schemaVersion: 1, channel: 'macos-arm64-pilot', sequence: Number(sequence), version, commit, target,
	minimumMacOS, nodeVersion, archiveName, archiveSha256, archiveBytes, compatibility, predecessors };
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
const validation = encode({ ...draft, runtimeFingerprint: '0'.repeat(64) });
readBundleManifest(validation);
if (candidate.commit !== commit) throw new Error('candidate commit differs from qualified commit');
const staging = await realpath(await mkdtemp(join(tmpdir(), 'insrc-qualification-inventory-')));
let fingerprint;
try {
	// Derive the signed inventory from the verified archive, not candidate metadata.
	({ fingerprint } = await stageVerifiedBundle(join(directory, archiveName), draft, staging, sha256(validation)));
} finally { await rm(staging, { recursive: true, force: true }); }
const bytes = encode({ ...draft, runtimeFingerprint: fingerprint });
readBundleManifest(bytes);
const key = createPrivateKey(process.env.INSRC_QUALIFICATION_KEY ?? '');
if (key.asymmetricKeyType !== 'ed25519') throw new Error('qualification signer is not Ed25519');
await writeFile(join(directory, 'manifest.json'), bytes, { flag: 'wx' });
await writeFile(join(directory, 'manifest.qualification.sig'), sign(null, manifestSigningBytes(bytes, 'qualification'), key), { flag: 'wx' });
