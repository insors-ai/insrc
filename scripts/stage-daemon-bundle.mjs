/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readdir, readlink, realpath, rename, rm, symlink } from 'node:fs/promises';
import { isAbsolute, join, posix, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const BLOCK = 512;
const MAX_ENTRIES = 180_000;
const MAX_FILE = 512 * 1024 ** 2;
const MAX_TOTAL = 4 * 1024 ** 3;
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const NOFOLLOW = constants.O_NOFOLLOW | constants.O_NONBLOCK;

function field(bytes) {
	const nul = bytes.indexOf(0);
	if (nul >= 0 && bytes.subarray(nul).some(byte => byte !== 0)) throw new Error('invalid archive field padding');
	return UTF8.decode(nul < 0 ? bytes : bytes.subarray(0, nul));
}

function octal(bytes) {
	const value = Buffer.from(bytes).toString('ascii').replace(/[\0 ]+$/, '').trimStart();
	if (!/^[0-7]+$/.test(value)) throw new Error('invalid archive number');
	const n = Number.parseInt(value, 8);
	if (!Number.isSafeInteger(n)) throw new Error('archive number is out of bounds');
	return n;
}

function archivePath(path) {
	if (!path || path.length > 255 || isAbsolute(path) || /[\\\u0000-\u001f\u007f:]/u.test(path) ||
		path.split('/').some(part => !part || part === '.' || part === '..')) {
		throw new Error('unsafe archive path');
	}
	return path;
}

function header(block) {
	if (field(block.subarray(257, 263)) !== 'ustar') throw new Error('only USTAR archive entries are allowed');
	const checksum = block.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
	if (checksum !== octal(block.subarray(148, 156))) throw new Error('archive header checksum mismatch');
	const mode = octal(block.subarray(100, 108));
	const size = octal(block.subarray(124, 136));
	const type = String.fromCharCode(block[156] || 48);
	const prefix = field(block.subarray(345, 500));
	const raw = [prefix, field(block.subarray(0, 100))].filter(Boolean).join('/');
	const name = archivePath(type === '5' ? raw.replace(/\/$/, '') : raw);
	if (mode > 0o777 || (type !== '2' && (mode & 0o022) !== 0) || !['0', '2', '5'].includes(type) ||
		(type !== '0' && size !== 0) || size > MAX_FILE) throw new Error('unsupported archive entry type, size or mode');
	return { name, mode, size, type, link: field(block.subarray(157, 257)) };
}

async function snapshot(source, destination, manifest) {
	const input = await open(source, constants.O_RDONLY | NOFOLLOW);
	try {
		const info = await input.stat();
		if (!info.isFile() || info.size !== manifest.archiveBytes || info.size > MAX_TOTAL) throw new Error('archive size mismatch');
		const output = await open(destination, 'wx', 0o600);
		const hash = createHash('sha256');
		let size = 0;
		try {
			for await (const chunk of input.createReadStream({ autoClose: false })) {
				size += chunk.length;
				if (size > manifest.archiveBytes) throw new Error('archive grew during verification');
				hash.update(chunk);
				await output.writeFile(chunk);
			}
		} finally {
			await output.close();
		}
		if (size !== manifest.archiveBytes || hash.digest('hex') !== manifest.archiveSha256) throw new Error('archive digest mismatch');
	} finally {
		await input.close();
	}
}

async function extractArchive(archive, root) {
	const seen = new Map();
	const folded = new Set();
	const links = [];
	let bytes = 0;
	let total = 0;
	let remainder = Buffer.alloc(0);
	let zeros = 0;
	let current;
	let skip = 0;
	let file;

	try {
		await pipeline(createReadStream(archive), createGunzip(), async stream => {
			for await (const chunk of stream) {
				bytes += chunk.length;
				if (bytes > MAX_TOTAL + MAX_ENTRIES * 1024 + 10240) throw new Error('expanded archive exceeds limit');
				remainder = Buffer.concat([remainder, chunk]);
				while (remainder.length > 0) {
					if (current?.size > 0) {
						const count = Math.min(current.size, remainder.length);
						await file.writeFile(remainder.subarray(0, count));
						current.size -= count;
						remainder = remainder.subarray(count);
						if (current.size === 0) { await file.close(); file = undefined; }
					} else if (skip > 0) {
						const count = Math.min(skip, remainder.length);
						if (remainder.subarray(0, count).some(Boolean)) throw new Error('invalid archive data padding');
						skip -= count;
						remainder = remainder.subarray(count);
					} else if (remainder.length < BLOCK) break;
					else {
						const block = remainder.subarray(0, BLOCK);
						remainder = remainder.subarray(BLOCK);
						if (!block.some(Boolean)) { zeros++; continue; }
						if (zeros > 0) throw new Error('unexpected archive data after end marker');
						current = header(block);
						const { name, mode, size, type, link } = current;
						const key = name.normalize('NFD').toLowerCase();
						if (folded.has(key) || seen.size >= MAX_ENTRIES) throw new Error('duplicate archive entry or entry limit exceeded');
						folded.add(key);
						const parent = posix.dirname(name);
						if (parent !== '.' && seen.get(parent) !== '5') throw new Error('archive parent must be a declared directory');
						seen.set(name, type);
						const path = join(root, name);
						if (type === '5') await mkdir(path, { mode: 0o700 });
						else if (type === '2') {
							if (!link || posix.isAbsolute(link) || /[\\\u0000-\u001f\u007f:]/u.test(link)) throw new Error('unsafe archive link');
							const target = archivePath(posix.normalize(posix.join(parent, link)));
							links.push({ path, link, target });
						} else {
							total += size;
							if (total > MAX_TOTAL) throw new Error('archive payload exceeds limit');
							file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, mode & 0o700);
							await chmod(path, mode & 0o700);
							if (size === 0) { await file.close(); file = undefined; }
							skip = (BLOCK - size % BLOCK) % BLOCK;
						}
					}
				}
			}
		});
		if (zeros < 2 || remainder.length !== 0 || file || skip) throw new Error('truncated daemon archive');
		for (const { path, link, target } of links) {
			if (seen.get(target) !== '0') throw new Error('archive link target is not a declared regular file');
			await symlink(link, path);
		}
		return seen;
	} finally {
		if (file) await file.close();
	}
}

// The caller supplies a manifest already authenticated by its bootstrap.
export async function stageVerifiedBundle(archive, manifest, releaseParent) {
	const parent = resolve(releaseParent);
	const info = await lstat(parent);
	if (await realpath(parent) !== parent || !info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
		throw new Error('release staging requires a canonical, user-owned private parent');
	}
	const work = await mkdtemp(join(parent, '.candidate-'));
	try {
		const copy = join(work, 'verified.tar.gz');
		const root = join(work, 'payload');
		await snapshot(archive, copy, manifest);
		await mkdir(root, { mode: 0o700 });
		await extractArchive(copy, root);
		const runtime = join(root, 'tools/node');
		const entry = join(root, 'out/daemon/index.js');
		if (!(await lstat(runtime)).isFile() || ((await lstat(runtime)).mode & 0o100) === 0 ||
			!(await lstat(entry)).isFile()) throw new Error('bundle runtime or entrypoint missing');
		const final = `${work}.staged`;
		const fingerprint = await measureBundleRuntime(root);
		await rename(root, final);
		return { root: final, runtime: join(final, 'tools/node'), commit: manifest.commit, fingerprint };
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

export async function measureBundleRuntime(root) {
	const hash = createHash('sha256');
	const walk = async (directory, prefix) => {
		for (const name of (await readdir(directory)).sort()) {
			const path = join(directory, name);
			const rel = prefix + name;
			const info = await lstat(path);
			if (info.isDirectory()) {
				hash.update(JSON.stringify([rel, 'directory', info.mode & 0o777]));
				await walk(path, rel + '/');
			} else if (info.isSymbolicLink()) {
				hash.update(JSON.stringify([rel, 'link', await readlink(path)]));
			} else if (info.isFile()) {
				const content = createHash('sha256');
				await pipeline(createReadStream(path, { flags: constants.O_RDONLY | NOFOLLOW }),
					async source => { for await (const chunk of source) content.update(chunk); });
				hash.update(JSON.stringify([rel, 'file', info.mode & 0o777, content.digest('hex')]));
			} else throw new Error('unsupported staged runtime entry');
		}
	};
	await walk(root, '');
	return hash.digest('hex');
}
