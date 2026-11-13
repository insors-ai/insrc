/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { qualifiedNativeDigest } from '../managed-release-mach-o.js';
import { releaseSignatureFrame } from '../../shared/managed-release-trust.js';

const nativePath = 'node_modules/fs-ext/build/Release/fs_ext.node';
const darwin = process.platform === 'darwin' && process.arch === 'arm64';
const firstBuild = { root: '', bytes: Buffer.alloc(0) };
const secondBuild = { root: '', bytes: Buffer.alloc(0) };
let scratch: string | undefined;

before(async () => {
	if (!darwin) return;
	scratch = await realpath(await mkdtemp('/tmp/insrc-native-reference-'));
	const node = await realpath(process.execPath);
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
		for (const dependency of ['fs-ext', 'nan']) {
			const source = resolve('node_modules', dependency);
			await cp(source, join(deps, dependency), { recursive: true,
				filter: path => path !== join(source, 'build') && path !== join(source, 'node_modules') });
		}
		execFileSync(node, [nodeGyp, 'rebuild', `--nodedir=${headers}`, '--arch=arm64'], {
			cwd: fsExt, env: { ...process.env, PATH: `${dirname(node)}:${process.env['PATH'] ?? '/usr/bin:/bin'}`, CXXFLAGS: '-std=c++17' },
			timeout: 90_000, stdio: 'pipe',
		});
		return { root, bytes: await readFile(join(root, nativePath)) };
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

test('Independent same-commit macOS build equivalence and tamper rejection', { skip: !darwin }, () => {
	const first = firstBuild.bytes;
	const second = secondBuild.bytes;
	assert.notDeepEqual(first, second);
	const expected = qualifiedNativeDigest(first, nativePath, firstBuild.root);
	const signer = generateKeyPairSync('ed25519');
	const payload = Buffer.from(JSON.stringify({ path: nativePath, digest: expected }));
	const frame = releaseSignatureFrame('release-qualification', payload);
	const signature = sign(null, frame, signer.privateKey);
	assert.equal(verify(null, frame, signer.publicKey, signature), true);
	const reference = JSON.parse(payload.toString('utf8')) as { path: string; digest: string };
	assert.equal(qualifiedNativeDigest(second, reference.path, secondBuild.root), reference.digest);
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
	assert.notEqual(qualifiedNativeDigest(first, nativePath, secondBuild.root), expected);
});

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
