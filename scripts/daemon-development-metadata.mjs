/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { createPublicKey, verify } from 'node:crypto';
import { requireBundleCompatibility, requireBundleTarget, sha256 } from './daemon-bundle-metadata.mjs';
import { stageVerifiedBundle } from './stage-daemon-bundle.mjs';

export const DEVELOPMENT_NODE_VERSION = '22.22.1';
export const DEVELOPMENT_MINIMUM_MACOS = '15.0';
const MAX_MANIFEST_BYTES = 64 * 1024;
const signingPrefix = Buffer.from('insrc-daemon-bundle-development-v1\0');
const policyPrefix = Buffer.from('insrc-daemon-bundle-development-policy-v1\0');
const oid = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const version = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})-dev\.[1-9][0-9]{0,8}$/;

function requireField(condition, field) {
	if (!condition) throw new Error(`invalid daemon development metadata: ${field}`);
}

function requireKeys(value, fields, name) {
	requireField(value !== null && typeof value === 'object' && !Array.isArray(value) &&
		Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)), name);
}

const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;

export function requireDevelopmentRef(ref) {
	requireField(typeof ref === 'string' && ref.startsWith('refs/heads/') && ref.length <= 1024 &&
		!/[^\x21-\x7e]/.test(ref), 'full branch ref');
	try {
		execFileSync('git', ['check-ref-format', ref], { stdio: 'ignore', timeout: 5000 });
	} catch {
		throw new Error('invalid daemon development metadata: Git branch ref');
	}
}

// The policy must come from the authenticated bootstrap or protected build configuration.
export function readDevelopmentPolicy(value) {
	requireKeys(value, ['repository', 'releaseRef', 'developmentRefs'], 'policy fields');
	const { repository, releaseRef, developmentRefs } = value;
	requireField(typeof repository === 'string' && repository.length <= 2048, 'repository');
	const remote = URL.parse(repository);
	requireField(remote?.protocol === 'https:' && !remote.username && !remote.password &&
		!remote.search && !remote.hash && remote.pathname.length > 1 && remote.href === repository, 'canonical repository URL');
	requireDevelopmentRef(releaseRef);
	requireField(Array.isArray(developmentRefs) && developmentRefs.length > 0 && developmentRefs.length <= 128 &&
		new Set(developmentRefs).size === developmentRefs.length, 'development ref list');
	for (const ref of developmentRefs) {
		requireDevelopmentRef(ref);
		requireField(ref !== releaseRef, 'release ref cannot be a development ref');
	}
	return { repository, releaseRef, developmentRefs: [...developmentRefs] };
}

function requireDevelopmentIdentity(manifest) {
	requireKeys(manifest, ['schemaVersion', 'channel', 'repository', 'sourceRef', 'fetchedTip', 'commit', 'target',
		'minimumMacOS', 'nodeVersion', 'version', 'sequence', 'archiveName', 'archiveBytes', 'archiveSha256',
		'runtimeFingerprint', 'keyId', 'compatibility', 'predecessor'], 'manifest fields');
	requireField(manifest.schemaVersion === 1 && manifest.channel === 'development' && positive(manifest.sequence), 'channel or sequence');
	requireField(typeof manifest.repository === 'string' && matches(oid, manifest.fetchedTip) &&
		matches(oid, manifest.commit) && matches(version, manifest.version), 'source identity or version');
	requireDevelopmentRef(manifest.sourceRef);
	requireField(manifest.target === 'darwin-arm64' && manifest.minimumMacOS === DEVELOPMENT_MINIMUM_MACOS &&
		manifest.nodeVersion === DEVELOPMENT_NODE_VERSION, 'target or runtime');
	requireField(manifest.archiveName === `insrc-daemon-${manifest.version}-darwin-arm64.tar.gz` &&
		positive(manifest.archiveBytes) && manifest.archiveBytes <= 2 ** 32 &&
		[manifest.archiveSha256, manifest.runtimeFingerprint, manifest.keyId].every(value => matches(digest, value)), 'archive or runtime identity');
	requireBundleCompatibility(manifest.compatibility);
	if (manifest.predecessor === null) return;
	const p = manifest.predecessor;
	requireKeys(p, ['manifestSha256', 'commit', 'sequence', 'runtimeFingerprint', 'compatibility',
		'crashConsistentReopening', 'launchProfiles', 'qualificationProfile', 'qualificationEvidenceSha256'], 'predecessor fields');
	requireField(matches(oid, p.commit) && p.commit !== manifest.commit && positive(p.sequence) &&
		p.sequence < manifest.sequence && [p.manifestSha256, p.runtimeFingerprint, p.qualificationEvidenceSha256]
			.every(value => matches(digest, value)), 'predecessor identity');
	requireField(p.crashConsistentReopening === true && Array.isArray(p.launchProfiles) &&
		p.launchProfiles.length === 1 && p.launchProfiles[0] === 'managed' &&
		p.qualificationProfile === 'managed-rollback-v1', 'predecessor launch profile');
	requireBundleCompatibility(p.compatibility);
}

// Manifest validation restricts objects to named fields and numbers to safe integers.
function canonicalJson(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}

export function encodeDevelopmentManifest(manifest) {
	requireDevelopmentIdentity(manifest);
	requireField(!/[\uD800-\uDFFF]/u.test(manifest.repository), 'repository Unicode');
	const bytes = Buffer.from(canonicalJson(manifest));
	requireField(bytes.length <= MAX_MANIFEST_BYTES, 'manifest size');
	return bytes;
}

export function developmentManifestSigningBytes(bytes) {
	requireField(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_MANIFEST_BYTES, 'manifest size');
	return Buffer.concat([signingPrefix, bytes]);
}

export function developmentPolicySigningBytes(bytes) {
	requireField(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= MAX_MANIFEST_BYTES, 'policy size');
	return Buffer.concat([policyPrefix, bytes]);
}

function requireSignature(signed, signature, key, description) {
	requireField(key.asymmetricKeyType === 'ed25519' && Buffer.isBuffer(signature) && signature.length === 64 &&
		verify(null, signed, key, signature), description);
}

export async function verifyAndStageDevelopmentBundle({ bytes, signature, publicKey, policyBytes, policySignature, host, archive, releaseParent }) {
	const trusted = verifyDevelopmentPolicy(policyBytes, policySignature, publicKey);
	const { manifest, manifestSha256 } = verifyDevelopmentManifest(bytes, signature, publicKey);
	requireField(trusted.repository === manifest.repository && trusted.developmentRefs.includes(manifest.sourceRef), 'branch policy');
	requireField(host.nodeVersion === DEVELOPMENT_NODE_VERSION, 'bootstrap Node version');
	requireBundleTarget(manifest, host);
	requireField(Boolean(archive) === Boolean(releaseParent), 'archive staging inputs');
	const staged = archive === undefined ? undefined : await stageVerifiedBundle(archive, manifest, releaseParent, manifestSha256);
	return { manifest, manifestSha256, staged };
}

export function verifyDevelopmentPolicy(bytes, signature, publicKey) {
	requireSignature(developmentPolicySigningBytes(bytes), signature, createPublicKey(publicKey), 'branch policy signature');
	return readDevelopmentPolicy(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}

export function verifyDevelopmentManifest(bytes, signature, publicKey) {
	const key = createPublicKey(publicKey);
	requireSignature(developmentManifestSigningBytes(bytes), signature, key, 'development signature');
	const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
	requireField(encodeDevelopmentManifest(manifest).equals(bytes), 'canonical manifest bytes');
	requireField(manifest.keyId === sha256(key.export({ type: 'spki', format: 'der' })), 'pinned key identity');
	return { manifest, manifestSha256: sha256(bytes) };
}
