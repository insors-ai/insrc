/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { realpath } from 'node:fs/promises';
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
	readonly publicKey: string;
}

export function readManagedBundleProof(value: unknown): ManagedBundleProof {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid bundle proof');
	const v = value as Record<string, unknown>;
	const { fingerprint, manifestBase64, signatureBase64, publicKey } = v;
	if (Object.keys(v).length !== 6 || v.version !== 1 || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)
		|| typeof manifestBase64 !== 'string' || manifestBase64.length > 88_000 || typeof signatureBase64 !== 'string'
		|| signatureBase64.length !== 88 || typeof publicKey !== 'string' || publicKey.length > 1024) throw new Error('invalid bundle proof');
	return { version: 1, floor: readDaemonBundleReleaseFloor(v.floor), fingerprint, manifestBase64, signatureBase64, publicKey };
}

export function verifyManagedBundleManifest(proof: ManagedBundleProof, releaseId: string): Record<string, unknown> {
	const bytes = Buffer.from(proof.manifestBase64, 'base64');
	const signature = Buffer.from(proof.signatureBase64, 'base64');
	const key = createPublicKey(proof.publicKey);
	const domain = Buffer.from(`insrc-daemon-bundle-${proof.floor.domain}-v1\0`);
	if (key.asymmetricKeyType !== 'ed25519' || bytes.length === 0 || bytes.length > 64 * 1024 || signature.length !== 64
		|| createHash('sha256').update(bytes).digest('hex') !== proof.floor.manifestSha256
		|| !verify(null, Buffer.concat([domain, bytes]), key, signature)) throw new Error('pinned bundle manifest changed');
	const m = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
	if (m.schemaVersion !== 1 || m.commit !== releaseId || m.sequence !== proof.floor.sequence
		|| m.channel !== proof.floor.channel || m.archiveSha256 !== proof.floor.archiveSha256) throw new Error('pinned bundle identity changed');
	return m;
}

export async function verifyManagedBundleProof(installation: ManagedInstallation, raw: ManagedBundleProof): Promise<void> {
	const proof = readManagedBundleProof(raw);
	verifyManagedBundleManifest(proof, installation.releaseId);
	const root = installation.releaseRoot;
	if (await realpath(root) !== root || installation.runtime !== join(root, 'tools/node')
		|| await realpath(installation.runtime) !== installation.runtime) throw new Error('pinned bundle runtime path changed');
	const modulePath = fileURLToPath(new URL('../../scripts/stage-daemon-bundle.mjs', import.meta.url));
	const { measureBundleRuntime } = await import(modulePath) as { measureBundleRuntime: (root: string) => Promise<string> };
	if (await measureBundleRuntime(root) !== proof.fingerprint) throw new Error('pinned bundle runtime changed');
}
