/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash, createPublicKey, verify } from 'node:crypto';

const sha = /^[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
const version = /^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}-pilot\.[1-9][0-9]{0,8}$/;
const macOS = /^[1-9][0-9]{0,2}\.[0-9]{1,3}(?:\.[0-9]{1,3})?$/;
const formats = ['lance', 'repoAndIndexQueue', 'config', 'workflowAndSession'];
export const QUALIFICATION_TESTS = Object.freeze(['source-tests', 'fresh-install', 'legacy-migration', 'restart', 'rollback']);
const namespaces = {
	qualification: 'insrc-daemon-bundle-qualification-v1',
	production: 'insrc-daemon-bundle-production-v1',
};

function requireField(condition, description) {
	if (!condition) throw new Error(`invalid daemon release metadata: ${description}`);
}

function keys(value, expected, description) {
	requireField(value !== null && typeof value === 'object' && !Array.isArray(value) &&
		Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)), description);
}

function boundedJson(bytes, limit) {
	requireField(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= limit, 'metadata size');
	return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

const matches = (pattern, value) => typeof value === 'string' && pattern.test(value);
const positive = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value > 0 && value <= max;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function compatibility(value) {
	keys(value, ['graphSchema', 'formats'], 'compatibility declaration');
	keys(value.formats, formats, 'writable formats');
	requireField(positive(value.graphSchema) && formats.every(key => matches(/^[a-zA-Z0-9._-]{1,128}$/, value.formats[key])),
		'compatibility formats');
}

export function readBundleManifest(bytes) {
	const m = boundedJson(bytes, 64 * 1024);
	keys(m, ['schemaVersion', 'channel', 'sequence', 'version', 'commit', 'target', 'minimumMacOS', 'nodeVersion',
		'archiveName', 'archiveSha256', 'archiveBytes', 'compatibility', 'predecessors'], 'manifest v1 fields');
	requireField(m.schemaVersion === 1 && m.channel === 'macos-arm64-pilot' && positive(m.sequence), 'channel or sequence');
	requireField(matches(version, m.version) && matches(commit, m.commit), 'version or commit');
	requireField(m.target === 'darwin-arm64' && matches(macOS, m.minimumMacOS) && m.nodeVersion === '22.22.1', 'target or node runtime');
	requireField(m.archiveName === `insrc-daemon-${m.version}-darwin-arm64.tar.gz` && matches(sha, m.archiveSha256) &&
		positive(m.archiveBytes, 2 ** 32), 'archive identity');
	compatibility(m.compatibility);
	requireField(Array.isArray(m.predecessors) && m.predecessors.length <= 64, 'predecessors');
	const seen = new Set();
	for (const p of m.predecessors) {
		keys(p, ['kind', 'commit', 'manifestSha256', 'compatibility', 'crashConsistentReopening', 'launchProfiles'], 'predecessor fields');
		requireField(matches(commit, p.commit) && (p.kind === 'source' ? p.manifestSha256 === null :
			p.kind === 'bundle' && matches(sha, p.manifestSha256)), 'predecessor identity');
		const id = `${p.kind}:${p.commit}:${p.manifestSha256}`;
		requireField(!seen.has(id), 'duplicate predecessor');
		seen.add(id);
		compatibility(p.compatibility);
		requireField(p.crashConsistentReopening === true && Array.isArray(p.launchProfiles) && p.launchProfiles.length > 0 &&
			new Set(p.launchProfiles).size === p.launchProfiles.length &&
			p.launchProfiles.every(x => ['managed', 'legacy-direct', 'legacy-stopped', 'legacy-shell-job', 'legacy-node-job'].includes(x)) &&
			(p.kind !== 'bundle' || p.launchProfiles.every(x => x === 'managed')), 'predecessor launch profiles');
	}
	return m;
}

export function manifestSigningBytes(bytes, domain) {
	requireField(Object.hasOwn(namespaces, domain) && Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 64 * 1024,
		'manifest signature domain or size');
	return Buffer.concat([Buffer.from(namespaces[domain] + '\0'), bytes]);
}

export function verifyBundleManifest(bytes, signature, domain, publicKey) {
	const signed = manifestSigningBytes(bytes, domain);
	const key = createPublicKey(publicKey);
	requireField(key.asymmetricKeyType === 'ed25519' && Buffer.isBuffer(signature) && signature.length === 64 &&
		verify(null, signed, key, signature), 'manifest signature');
	return readBundleManifest(bytes);
}

export function requireBundleTarget(manifest, { platform, architecture, macOSVersion, requestedVersion }) {
	const parts = value => value.split('.').map(Number);
	requireField(platform === 'darwin' && architecture === 'arm64' &&
		matches(macOS, macOSVersion) && manifest.version === requestedVersion, 'unsupported host or requested version');
	const host = parts(macOSVersion);
	const minimum = parts(manifest.minimumMacOS);
	for (let i = 0; i < 3; i++) {
		const delta = (host[i] ?? 0) - (minimum[i] ?? 0);
		if (delta > 0) return;
		requireField(delta === 0, 'host macOS version below bundle minimum');
	}
}

export function readQualification(bytes) {
	const q = boundedJson(bytes, 32 * 1024);
	keys(q, ['schemaVersion', 'qualifiedAt', 'candidate', 'host', 'tests'], 'qualification v1 fields');
	keys(q.candidate, ['repository', 'commit', 'version', 'target', 'runId', 'artifactId', 'archiveSha256', 'archiveBytes', 'manifestSha256'], 'candidate fields');
	keys(q.host, ['macOSVersion', 'arch', 'nodeVersion'], 'qualification host');
	const c = q.candidate;
	requireField(q.schemaVersion === 1 && matches(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/, q.qualifiedAt) &&
		Number.isFinite(Date.parse(q.qualifiedAt)), 'qualification time');
	requireField(matches(/^[a-zA-Z0-9_.-]{1,100}\/[a-zA-Z0-9_.-]{1,100}$/, c.repository) &&
		matches(commit, c.commit) && matches(version, c.version) && c.target === 'darwin-arm64' &&
		matches(/^[1-9][0-9]{0,19}$/, c.runId) && matches(/^[1-9][0-9]{0,19}$/, c.artifactId) &&
		matches(sha, c.archiveSha256) && matches(sha, c.manifestSha256) && positive(c.archiveBytes, 2 ** 32), 'qualification identity');
	requireField(q.host.arch === 'arm64' && q.host.nodeVersion === '22.22.1' && matches(macOS, q.host.macOSVersion), 'qualification host');
	requireField(Array.isArray(q.tests) && q.tests.length === QUALIFICATION_TESTS.length, 'qualification test set');
	const pending = new Set(QUALIFICATION_TESTS);
	for (const t of q.tests) {
		keys(t, ['id', 'result', 'evidenceSha256'], 'qualification test fields');
		requireField(pending.delete(t.id) && t.result === 'pass' && matches(sha, t.evidenceSha256), 'qualification test evidence');
	}
	return q;
}
