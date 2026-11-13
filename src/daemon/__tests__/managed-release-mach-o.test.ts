/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { access, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { measureManagedReleaseInventory } from '../managed-release-inventory.js';
import { QUALIFIED_NATIVE_PATHS, qualifiedNativeDigest } from '../managed-release-mach-o.js';
import { releaseMetadataDigest, releaseSignatureFrame, verifyReleaseQualification } from '../../shared/managed-release-trust.js';

const nativePath = 'node_modules/fs-ext/build/Release/fs_ext.node';
const darwin = process.platform === 'darwin' && process.arch === 'arm64';
const firstBuild = { root: '', bytes: Buffer.alloc(0) };
const secondBuild = { root: '', bytes: Buffer.alloc(0) };
let fixtureRuntime: string;
let scratch: string | undefined;

before(async () => {
	if (!darwin) return;
	scratch = await realpath(await mkdtemp('/tmp/insrc-native-reference-'));
	const node = await realpath(process.execPath);
	fixtureRuntime = node;
	const npm = await realpath(execFileSync('/usr/bin/which', ['npm'], { encoding: 'utf8' }).trim());
	const candidates = [resolve(dirname(node), '../lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js'),
		resolve(dirname(npm), '../node_modules/node-gyp/bin/node-gyp.js'),
		'/opt/homebrew/opt/node@22/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js'];
	let gyp: string | undefined;
	for (const path of candidates) {
		if (await access(path).then(() => true, () => false)) { gyp = path; break; }
	}
	if (gyp === undefined) throw new Error('node-gyp is required for release qualification');
	const nodeGyp = gyp;
	const headers = join(homedir(), 'Library/Caches/node-gyp/22.22.1');
	const build = async (root: string) => {
		const deps = join(root, 'node_modules');
		const fsExt = join(deps, 'fs-ext');
		await mkdir(deps, { recursive: true });
		const packages = [...QUALIFIED_NATIVE_PATHS].map(path => path.slice('node_modules/'.length).split('/build/')[0]!);
		for (const dependency of [...packages, 'nan', 'node-addon-api']) {
			const source = resolve('node_modules', dependency);
			await mkdir(dirname(join(deps, dependency)), { recursive: true });
			await cp(source, join(deps, dependency), { recursive: true,
				filter: path => path !== join(source, 'build') && path !== join(source, 'node_modules') });
		}
		for (const dependency of packages) {
			execFileSync(node, [nodeGyp, 'rebuild', `--nodedir=${headers}`, '--arch=arm64'], {
				cwd: join(deps, dependency), env: { ...process.env, PATH: `${dirname(node)}:${process.env['PATH'] ?? '/usr/bin:/bin'}`, CXXFLAGS: '-std=c++17', npm_config_napi_build_version: '10' },
				timeout: 120_000, stdio: 'pipe',
			});
		}
		return { root, bytes: await readFile(join(fsExt, 'build/Release/fs_ext.node')) };
	};
	Object.assign(firstBuild, await build(join(scratch, 'first')));
	Object.assign(secondBuild, await build(join(scratch, 'second-deliberately-longer-path')));
});
after(async () => { if (scratch !== undefined) await rm(scratch, { recursive: true, force: true }); });

function command(bytes: Buffer, kind: number): number {
	let offset = 32;
	for (let i = 0; i < bytes.readUInt32LE(16); i++) {
		if (bytes.readUInt32LE(offset) === kind) return offset;
		offset += bytes.readUInt32LE(offset + 4);
	}
	throw new Error('missing Mach-O command');
}

test('Independent same-commit macOS build equivalence and tamper rejection', { skip: !darwin }, async () => {
	const first = firstBuild.bytes;
	const second = secondBuild.bytes;
	assert.notDeepEqual(first, second);
	const expected = qualifiedNativeDigest(first, nativePath, firstBuild.root);
	for (const path of QUALIFIED_NATIVE_PATHS) {
		const left = await readFile(join(firstBuild.root, path));
		const right = await readFile(join(secondBuild.root, path));
		assert.notDeepEqual(left, right);
		assert.equal(qualifiedNativeDigest(left, path, firstBuild.root), qualifiedNativeDigest(right, path, secondBuild.root));
	}
	const reference = await inventoryReference(firstBuild.root);
	assert.notEqual(await measureManagedReleaseInventory(firstBuild.root, fixtureRuntime, reference),
		await measureManagedReleaseInventory(secondBuild.root, fixtureRuntime, reference));
	const modified = Buffer.from(first);
	const textOffset = modified.readUInt32LE(command(modified, 0x19) + 72 + 48);
	modified[textOffset] = modified[textOffset]! ^ 1;
	// Recompute only the fixture's ordinary ad-hoc page hash to model changed
	// executable bytes carrying a valid local signature.
	const codeDirectory = modified.readUInt32LE(command(modified, 0x1d) + 8) + 20;
	const page = Math.floor(textOffset / 4096);
	const hashOffset = codeDirectory + modified.readUInt32BE(codeDirectory + 16) + page * 32;
	createHash('sha256').update(modified.subarray(page * 4096, (page + 1) * 4096)).digest().copy(modified, hashOffset);
	assert.notEqual(qualifiedNativeDigest(modified, nativePath, firstBuild.root), expected);
	const invalidBinding = Buffer.from(first);
	const dyld = command(invalidBinding, 0x80000022);
	invalidBinding.writeUInt32LE(invalidBinding.readUInt32LE(dyld + 8), dyld + 16);
	assert.throws(() => qualifiedNativeDigest(invalidBinding, nativePath, firstBuild.root), /qualified Mach-O/);

	// The reference must reject changed mapped data even if the local page
	// hash is internally consistent. Locate a file-backed __DATA section.
	const changedData = Buffer.from(first);
	let offset = 32;
	let dataOffset: number | undefined;
	for (let i = 0; i < changedData.readUInt32LE(16); i++) {
		if (changedData.readUInt32LE(offset) === 0x19 && changedData.toString('ascii', offset + 8, offset + 14) === '__DATA') {
			for (let section = 0; section < changedData.readUInt32LE(offset + 64); section++) {
				const sectionOffset = offset + 72 + section * 80;
				const fileOffset = changedData.readUInt32LE(sectionOffset + 48);
				if (fileOffset !== 0 && changedData.readBigUInt64LE(sectionOffset + 40) > 0n) { dataOffset = fileOffset; break; }
			}
			if (dataOffset !== undefined) break;
		}
		offset += changedData.readUInt32LE(offset + 4);
	}
	assert.ok(dataOffset !== undefined);
	changedData[dataOffset] = changedData[dataOffset]! ^ 1;
	const dataPage = Math.floor(dataOffset / 4096);
	const signatureOffset = changedData.readUInt32LE(command(changedData, 0x1d) + 8);
	createHash('sha256').update(changedData.subarray(dataPage * 4096, Math.min(signatureOffset, (dataPage + 1) * 4096)))
		.digest().copy(changedData, codeDirectory + changedData.readUInt32BE(codeDirectory + 16) + dataPage * 32);
	assert.notEqual(qualifiedNativeDigest(changedData, nativePath, firstBuild.root), expected);
	await writeFile(join(firstBuild.root, nativePath), changedData);
	await assert.rejects(measureManagedReleaseInventory(firstBuild.root, fixtureRuntime, reference), /differs from signed reference/);

	// Remove the ad-hoc signing flag while leaving executable page hashes unchanged.
	const alteredPolicy = Buffer.from(first);
	alteredPolicy.writeUInt32BE(alteredPolicy.readUInt32BE(codeDirectory + 12) ^ 2, codeDirectory + 12);
	await writeFile(join(firstBuild.root, nativePath), alteredPolicy);
	await assert.rejects(measureManagedReleaseInventory(firstBuild.root, fixtureRuntime, reference), /qualified Mach-O/);
	await writeFile(join(firstBuild.root, nativePath), first);
	assert.notEqual(qualifiedNativeDigest(first, nativePath, secondBuild.root), expected);
});

async function inventoryReference(source: string) {
	const roots = ['out', 'node_modules', 'scripts', 'package.json', 'package-lock.json', '.npmrc', 'packages/project-memory'];
	// Preserve the independently produced binaries, removing only unneeded build
	// scratch from this fixture. The product inventory qualifies its own full tree.
	for (const { root } of [firstBuild, secondBuild]) {
		for (const name of roots) {
			if (name === 'node_modules') continue;
			const path = join(root, name);
			if (name.includes('.')) await writeFile(path, 'fixture');
			else await mkdir(path, { recursive: true });
		}
		for (const path of QUALIFIED_NATIVE_PATHS) {
			const prefix = path.split('/build/')[0]!;
			const binary = await readFile(join(root, path));
			const mode = (await lstat(join(root, path))).mode & 0o777;
			await rm(join(root, prefix), { recursive: true });
			await mkdir(dirname(join(root, path)), { recursive: true });
			await writeFile(join(root, path), binary, { mode });
		}
	}
	const entries: [string, number, string | null][] = [];
	async function visit(path: string, name: string): Promise<void> {
		const stat = await lstat(path);
		if (stat.isDirectory()) {
			entries.push([name, stat.mode, null]);
			for (const child of (await readdir(path)).sort()) await visit(join(path, child), `${name}/${child}`);
		} else {
			const bytes = await readFile(path);
			const digest = QUALIFIED_NATIVE_PATHS.has(name) ? 'mach-o-arm64-v1:' + qualifiedNativeDigest(bytes, name, source)
				: releaseMetadataDigest(bytes);
			entries.push([name, stat.mode, digest]);
		}
	}
	await visit(fixtureRuntime, 'node-runtime');
	for (const name of roots) await visit(join(source, name), name);
	const bytes = Buffer.from(JSON.stringify(entries));
	const signer = generateKeyPairSync('ed25519');
	const root = generateKeyPairSync('ed25519');
	const channel = { repoUrl: 'https://example.invalid/insrc.git', branch: 'v2' };
	const now = Date.now();
	const validity = { notBefore: now - 1_000, expiresAt: now + 10_000 };
	const pair = { priorCommit: '1'.repeat(40), candidateCommit: '2'.repeat(40), priorTree: '3'.repeat(40), candidateTree: '4'.repeat(40) };
	const signed = (domain: Parameters<typeof releaseSignatureFrame>[0], value: unknown, key: typeof signer.privateKey) => {
		const payload = Buffer.from(JSON.stringify(value));
		const signature = sign(null, releaseSignatureFrame(domain, payload), key);
		return Buffer.from(JSON.stringify({ payload: payload.toString('base64'), signature: signature.toString('base64') }));
	};
	const qualified = verifyReleaseQualification({
		rootKey: root.publicKey, now, keyId: 'fixture', channel, ...pair,
		trustEnvelope: signed('release-trust', { version: 1, epoch: 1, ...validity, revoked: [],
			keys: [{ id: 'fixture', channel, ...validity, publicKey: signer.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') }] }, root.privateKey),
		qualificationEnvelope: signed('release-qualification', { version: 1, keyId: 'fixture', channel, ...pair, ...validity,
			profile: 'darwin-arm64', referenceDigest: releaseMetadataDigest(bytes), compatibilityDigest: 'a'.repeat(64),
			testEvidenceDigest: 'b'.repeat(64) }, signer.privateKey),
	});
	return { bytes, digest: qualified.referenceDigest };
}

test('Independent unequal-length debug roots preserve canonical native identity and malformed offsets or codeLimit are rejected', { skip: !darwin }, () => {
	const { root, bytes } = firstBuild;
	const sym = command(bytes, 0x02);
	const sign = command(bytes, 0x1d);
	const signatureOffset = bytes.readUInt32LE(sign + 8);
	assert.notEqual(bytes.readUInt32LE(sym + 20), secondBuild.bytes.readUInt32LE(command(secondBuild.bytes, 0x02) + 20));
	assert.notEqual(signatureOffset, secondBuild.bytes.readUInt32LE(command(secondBuild.bytes, 0x1d) + 8));
	assert.equal(qualifiedNativeDigest(bytes, nativePath, root), qualifiedNativeDigest(secondBuild.bytes, nativePath, secondBuild.root));
	const badStrings = Buffer.from(bytes);
	badStrings.writeUInt32LE(bytes.readUInt32LE(sym + 16) - 1, sym + 16);
	assert.throws(() => qualifiedNativeDigest(badStrings, nativePath, root), /qualified Mach-O/);
	const badLimit = Buffer.from(bytes);
	badLimit.writeUInt32BE(signatureOffset - 1, signatureOffset + 20 + 32);
	assert.throws(() => qualifiedNativeDigest(badLimit, nativePath, root), /qualified Mach-O/);
});
