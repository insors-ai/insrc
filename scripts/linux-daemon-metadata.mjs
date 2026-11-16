/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createPublicKey, verify } from 'node:crypto';
import { requireBundleCompatibility, sha256 } from './daemon-bundle-metadata.mjs';

export const LINUX_RELEASE_TARGET = 'linux-x64';
export const LINUX_NODE_VERSION = '22.22.1';
export const LINUX_MANIFEST_LIMIT = 32 * 1024;
export const LINUX_ARCHIVE_LIMIT = 2 ** 32;
const decimalId = /^[1-9][0-9]{0,19}$/;
const commitId = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const releaseVersion = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})-(dev|pilot)\.[1-9][0-9]{0,8}$/;
const roles = new Set(['qualification', 'development', 'production']);

function requireField(condition, name) {
	if (!condition) throw new Error(`invalid Linux daemon release: ${name}`);
}

export function requireLinuxFields(value, fields, name) {
	requireField(value !== null && typeof value === 'object' && !Array.isArray(value) &&
		Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)), name);
}

const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const positive = (value, limit = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value > 0 && value <= limit;

export function readLinuxReleaseJson(bytes, limit = LINUX_MANIFEST_LIMIT) {
	requireField(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= limit, 'metadata size');
	const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
	const value = JSON.parse(source);
	// Compact JSON, as emitted by JSON.stringify. The round trip rejects duplicates,
	// including escaped spellings of the same key, without a second JSON parser.
	requireField(JSON.stringify(value) === source, 'noncanonical JSON');
	return value;
}

export function requireLinuxBranchRef(ref) {
	// The bootstrap has no Git dependency. Accept the bounded ASCII subset used
	// by our protected release configuration and reject Git's forbidden forms.
	requireField(typeof ref === 'string' && ref.startsWith('refs/heads/') && ref.length <= 1024 &&
		!/[^\x21-\x7e]/.test(ref) && !/[~^:?*\[\\]/.test(ref) && !ref.includes('..') && !ref.includes('@{') &&
		!ref.endsWith('.') && ref.split('/').every(part => part.length > 0 && !part.startsWith('.') && !part.endsWith('.lock')),
		'full branch ref');
}

export function readLinuxCandidateOrigin(value) {
	requireLinuxFields(value, ['repository', 'ref', 'commit', 'runId', 'runAttempt', 'artifactId'], 'origin fields');
	requireLinuxBranchRef(value.ref);
	requireField([value.repository, value.runId, value.artifactId].every(id => matches(decimalId, id)) &&
		matches(commitId, value.commit) && positive(value.runAttempt, 999), 'origin identity');
	return value;
}

export function linuxReleaseChannel(repository, lane, ref) {
	requireLinuxBranchRef(ref);
	requireField(matches(decimalId, repository) && ['development', 'production'].includes(lane), 'channel context');
	return `linux-x64-${lane}-${sha256(Buffer.from(JSON.stringify([repository, ref])))}`;
}

export function linuxArchiveName(version, lane) {
	const match = typeof version === 'string' ? releaseVersion.exec(version) : null;
	requireField(match && ((lane === 'development' && match[4] === 'dev') ||
		(lane === 'production' && match[4] === 'pilot')), 'version and lane');
	return `insrc-daemon-${version}-linux-x64.tar.gz`;
}

function readHostContract(host) {
	requireLinuxFields(host, ['distribution', 'version', 'architecture', 'glibc', 'nodeVersion', 'systemLibraries', 'pidfdRequired'], 'host fields');
	requireField(host.distribution === 'ubuntu' && host.version === '24.04' && host.architecture === 'amd64' &&
		host.glibc === '2.39' && host.nodeVersion === LINUX_NODE_VERSION && host.pidfdRequired === true, 'host baseline');
	const libraries = host.systemLibraries;
	requireField(Array.isArray(libraries) && libraries.length > 0 && libraries.length <= 128 &&
		libraries.every((library, i) => matches(/^[a-zA-Z0-9_-][a-zA-Z0-9_.+-]{0,119}\.so(?:\.[a-zA-Z0-9_.-]{1,40})?$/, library) &&
			(i === 0 || libraries[i - 1] < library)), 'host library allowlist');
}

export function readLinuxReleaseManifest(bytes) {
	const manifest = readLinuxReleaseJson(bytes);
	requireLinuxFields(manifest, ['schemaVersion', 'target', 'lane', 'channel', 'sequence', 'version', 'origin',
		'archiveName', 'archiveBytes', 'archiveSha256', 'runtimeFingerprint', 'host', 'compatibility', 'predecessors'],
		'manifest v1 fields');
	const origin = readLinuxCandidateOrigin(manifest.origin);
	requireField(manifest.schemaVersion === 1 && manifest.target === LINUX_RELEASE_TARGET &&
		manifest.channel === linuxReleaseChannel(origin.repository, manifest.lane, origin.ref) &&
		positive(manifest.sequence), 'schema, target, channel or sequence');
	requireField(manifest.archiveName === linuxArchiveName(manifest.version, manifest.lane) &&
		positive(manifest.archiveBytes, LINUX_ARCHIVE_LIMIT) &&
		[manifest.archiveSha256, manifest.runtimeFingerprint].every(value => matches(digest, value)), 'archive or runtime identity');
	readHostContract(manifest.host);
	requireBundleCompatibility(manifest.compatibility);
	requireField(Array.isArray(manifest.predecessors) && manifest.predecessors.length <= 64, 'predecessor list');
	const seen = new Set();
	for (const predecessor of manifest.predecessors) {
		requireLinuxFields(predecessor, ['commit', 'manifestSha256', 'runtimeFingerprint'], 'predecessor fields');
		const identity = JSON.stringify([predecessor.commit, predecessor.manifestSha256, predecessor.runtimeFingerprint]);
		requireField(matches(commitId, predecessor.commit) && matches(digest, predecessor.runtimeFingerprint) &&
			(predecessor.manifestSha256 === null || matches(digest, predecessor.manifestSha256)) && !seen.has(identity),
			'predecessor identity');
		seen.add(identity);
	}
	return manifest;
}

export function linuxManifestSigningBytes(bytes, role) {
	requireField(roles.has(role) && Buffer.isBuffer(bytes) && bytes.length > 0 &&
		bytes.length <= LINUX_MANIFEST_LIMIT, 'signature role or manifest size');
	return Buffer.concat([Buffer.from(`insrc-daemon-bundle-linux-x64-${role}-v1\0`), bytes]);
}

export function verifyLinuxReleaseManifest(bytes, signature, { role, publicKey, repository, lane, ref, version }) {
	const signed = linuxManifestSigningBytes(bytes, role);
	requireField(role === 'qualification' || role === lane, 'signature role and final lane');
	const key = publicKey?.type === 'public' ? publicKey : createPublicKey(publicKey);
	requireField(key.asymmetricKeyType === 'ed25519' && Buffer.isBuffer(signature) && signature.length === 64 &&
		verify(null, signed, key, signature), 'manifest signature');
	const manifest = readLinuxReleaseManifest(bytes);
	requireField(manifest.origin.repository === repository && manifest.origin.ref === ref &&
		manifest.lane === lane && manifest.version === version &&
		manifest.channel === linuxReleaseChannel(repository, lane, ref), 'unexpected release context');
	// commit is a projection for the shared archive stager. Neither it nor the
	// manifest digest is a second signed claim inside the wire object.
	return { ...manifest, commit: manifest.origin.commit, manifestSha256: sha256(bytes) };
}
