import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

const { linuxReleaseChannel, readLinuxReleaseManifest, linuxManifestSigningBytes, verifyLinuxReleaseManifest,
	requireLinuxBranchRef, LINUX_MANIFEST_LIMIT } =
	await import(new URL('../linux-daemon-metadata.mjs', import.meta.url).href);
const { sha256 } = await import(new URL('../daemon-bundle-metadata.mjs', import.meta.url).href);

const encode = (value: object) => Buffer.from(JSON.stringify(value));
const scope = { repository: '241', ref: 'refs/heads/team/v3', lane: 'development', version: '0.2.1-dev.1' };
const manifest = {
	schemaVersion: 1, target: 'linux-x64', lane: scope.lane,
	channel: linuxReleaseChannel(scope.repository, scope.lane, scope.ref), sequence: 1, version: scope.version,
	origin: { repository: scope.repository, ref: scope.ref, commit: 'a'.repeat(40), runId: '9223372036854775807',
		runAttempt: 1, artifactId: '123' },
	archiveName: 'insrc-daemon-0.2.1-dev.1-linux-x64.tar.gz', archiveBytes: 1024, archiveSha256: 'b'.repeat(64),
	runtimeFingerprint: 'c'.repeat(64),
	host: { distribution: 'ubuntu', version: '24.04', architecture: 'amd64', glibc: '2.39', nodeVersion: '22.22.1',
		systemLibraries: ['libc.so.6', 'libsecret-1.so.0'], pidfdRequired: true },
	compatibility: { graphSchema: 1, formats: { lance: 'v1', repoAndIndexQueue: 'v1', config: 'v1', workflowAndSession: 'v1' } },
	predecessors: [],
};

test('Linux manifest rejects noncanonical, malformed, oversized and mismatched metadata', () => {
	const valid = encode(manifest);
	assert.deepEqual(readLinuxReleaseManifest(valid), manifest);
	assert.throws(() => readLinuxReleaseManifest(Buffer.alloc(LINUX_MANIFEST_LIMIT + 1)), /size/);
	assert.throws(() => readLinuxReleaseManifest(Buffer.from([0xc3, 0x28])), TypeError);
	assert.throws(() => readLinuxReleaseManifest(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), valid])));
	const duplicate = valid.toString().replace('"sequence":1', '"sequence":2,"seque\\u006ece":1');
	assert.throws(() => readLinuxReleaseManifest(Buffer.from(duplicate)), /noncanonical/);
	for (const change of [
		{ extra: true }, { target: 'darwin-arm64' }, { sequence: Number.MAX_SAFE_INTEGER + 1 },
		{ origin: { ...manifest.origin, artifactId: '00123' } }, { origin: { ...manifest.origin, runAttempt: 1000 } },
		{ lane: 'production' }, { archiveName: '../insrc-daemon.tar.gz' }, { archiveSha256: 'B'.repeat(64) },
		{ host: { ...manifest.host, systemLibraries: ['libc.so.6', 'libc.so.6'] } },
	]) assert.throws(() => readLinuxReleaseManifest(encode({ ...manifest, ...change })), /invalid Linux daemon release/);
});

test('Linux qualification and channel grants authenticate identical scoped bytes with separate keys', () => {
	const bytes = encode(manifest);
	const trialKey = generateKeyPairSync('ed25519');
	const devKey = generateKeyPairSync('ed25519');
	const trial = sign(null, linuxManifestSigningBytes(bytes, 'qualification'), trialKey.privateKey);
	const final = sign(null, linuxManifestSigningBytes(bytes, 'development'), devKey.privateKey);
	const qualification = { ...scope, role: 'qualification', publicKey: trialKey.publicKey };
	const development = { ...scope, role: 'development', publicKey: devKey.publicKey };
	assert.equal(verifyLinuxReleaseManifest(bytes, trial, qualification).manifestSha256, sha256(bytes));
	assert.equal(verifyLinuxReleaseManifest(bytes, final, development).manifestSha256, sha256(bytes));
	assert.throws(() => verifyLinuxReleaseManifest(bytes, trial, development), /signature/);
	assert.throws(() => verifyLinuxReleaseManifest(bytes, trial, { ...qualification, role: 'development' }), /signature/);
	assert.throws(() => verifyLinuxReleaseManifest(bytes, trial, { ...qualification, publicKey: devKey.publicKey }), /signature/);
	assert.throws(() => verifyLinuxReleaseManifest(bytes, final, { ...development, role: 'production' }), /role and final lane/);
	const tampered = encode({ ...manifest, sequence: 2 });
	assert.throws(() => verifyLinuxReleaseManifest(tampered, final, development), /signature/);
	for (const change of [{ ref: 'refs/heads/team-v3' }, { repository: '242' }, { version: '0.2.1-dev.2' }]) {
		assert.throws(() => verifyLinuxReleaseManifest(bytes, final, { ...development, ...change }), /release context/);
	}
	assert.notEqual(linuxReleaseChannel(scope.repository, scope.lane, 'refs/heads/team-v3'), manifest.channel);
	for (const ref of ['v3', 'refs/tags/v3', 'refs/heads/.hidden', 'refs/heads/feature.lock', 'refs/heads/other@{head', 'refs/heads/a..b']) {
		assert.throws(() => requireLinuxBranchRef(ref), /full branch ref/);
	}
});
