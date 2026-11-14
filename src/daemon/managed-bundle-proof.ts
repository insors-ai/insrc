/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ManagedInstallation } from '../shared/managed-daemon-installation.js';
import { readDaemonBundleReleaseFloor } from '../shared/daemon-bundle-release-floor.js';
import type { DaemonBundleReleaseFloor } from '../shared/daemon-bundle-release-floor.js';

export interface ManagedBundleProof {
	readonly version: 1;
	readonly floor: DaemonBundleReleaseFloor;
	readonly fingerprint: string;
	readonly manifestBase64: string;
	readonly signatureBase64: string;
}

export function readManagedBundleProof(value: unknown): ManagedBundleProof {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid bundle proof');
	const v = value as Record<string, unknown>;
	const { fingerprint, manifestBase64, signatureBase64 } = v;
	if (Object.keys(v).length !== 5 || v.version !== 1 || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)
		|| typeof manifestBase64 !== 'string' || manifestBase64.length > 88_000 || typeof signatureBase64 !== 'string'
		|| signatureBase64.length !== 88) throw new Error('invalid bundle proof');
	return { version: 1, floor: readDaemonBundleReleaseFloor(v.floor), fingerprint, manifestBase64, signatureBase64 };
}

export async function verifyManagedBundleManifest(proof: ManagedBundleProof, releaseId: string, stateRoot: string): Promise<Record<string, unknown>> {
	const bytes = Buffer.from(proof.manifestBase64, 'base64');
	const signature = Buffer.from(proof.signatureBase64, 'base64');
	const trustRoot = join(stateRoot, 'bundle-trust');
	const dir = await lstat(trustRoot);
	if (!dir.isDirectory() || dir.uid !== process.getuid?.() || (dir.mode & 0o077) !== 0) throw new Error('unsafe bundle trust directory');
	const anchor = await open(join(trustRoot, proof.floor.domain + '.pem'), constants.O_NOFOLLOW | constants.O_NONBLOCK);
	let pem: Buffer;
	try {
		const info = await anchor.stat();
		if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o077) !== 0 ||
			info.size < 1 || info.size > 1024) throw new Error('unsafe bundle trust anchor');
		const buffer = Buffer.alloc(1025);
		const { bytesRead } = await anchor.read(buffer);
		if (bytesRead !== info.size) throw new Error('bundle trust anchor changed');
		pem = buffer.subarray(0, bytesRead);
	} finally { await anchor.close(); }
	const key = createPublicKey(pem);
	const domain = Buffer.from(`insrc-daemon-bundle-${proof.floor.domain}-v1\0`);
	if (key.asymmetricKeyType !== 'ed25519' || bytes.length === 0 || bytes.length > 64 * 1024 || signature.length !== 64
		|| createHash('sha256').update(bytes).digest('hex') !== proof.floor.manifestSha256
		|| !verify(null, Buffer.concat([domain, bytes]), key, signature)) throw new Error('pinned bundle manifest changed');
	const m = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
	if (m.schemaVersion !== 1 || m.commit !== releaseId || m.sequence !== proof.floor.sequence
		|| m.channel !== proof.floor.channel || m.archiveSha256 !== proof.floor.archiveSha256
		|| m.runtimeFingerprint !== proof.fingerprint) throw new Error('pinned bundle identity changed');
	return m;
}

export async function verifyManagedBundleProof(installation: ManagedInstallation, raw: ManagedBundleProof): Promise<void> {
	const proof = readManagedBundleProof(raw);
	await verifyManagedBundleManifest(proof, installation.releaseId, installation.stateRoot);
	const root = installation.releaseRoot;
	if (await realpath(root) !== root || installation.runtime !== join(root, 'tools/node')
		|| await realpath(installation.runtime) !== installation.runtime) throw new Error('pinned bundle runtime path changed');
	const modulePath = fileURLToPath(new URL('../../scripts/stage-daemon-bundle.mjs', import.meta.url));
	const { measureBundleRuntime } = await import(modulePath) as { measureBundleRuntime: (root: string) => Promise<string> };
	if (await measureBundleRuntime(root) !== proof.fingerprint) throw new Error('pinned bundle runtime changed');
}
