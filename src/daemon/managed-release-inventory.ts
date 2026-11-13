/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat, open, readdir, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { TextDecoder } from 'node:util';
import { releaseMetadataDigest } from '../shared/managed-release-trust.js';
import { QUALIFIED_NATIVE_PATHS, qualifiedNativeDigest } from './managed-release-mach-o.js';

const ROOTS = ['node-runtime', 'out', 'node_modules', 'scripts', 'package.json', 'package-lock.json', '.npmrc', 'packages/project-memory'];
const MAX_ENTRIES = 150_000;
const MAX_REFERENCE_BYTES = 32 * 1024 * 1024;
const DIGEST = /^[a-f0-9]{64}$/;

type InventoryEntry = readonly [path: string, mode: number, value: string | null];

function safePath(path: string): boolean {
	return path.length > 0 && path.length <= 4_096 && !/[\u0000-\u001f\u007f\\]/.test(path)
		&& path.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

function contained(root: string, path: string): boolean {
	const child = relative(root, path);
	return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function stable(before: Stats, after: Stats): boolean {
	return before.dev === after.dev && before.ino === after.ino && before.mode === after.mode
		&& before.uid === after.uid && before.size === after.size && before.nlink === after.nlink
		&& before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}

function invalidReference(): never {
	throw new Error('invalid signed runtime inventory reference');
}

function readReference(reference: Buffer, digest: string): Map<string, InventoryEntry> {
	if (reference.length > MAX_REFERENCE_BYTES || releaseMetadataDigest(reference) !== digest) return invalidReference();
	const encoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(reference);
	const value: unknown = JSON.parse(encoded);
	if (JSON.stringify(value) !== encoded || !Array.isArray(value) || value.length > MAX_ENTRIES) return invalidReference();
	const entries = new Map<string, InventoryEntry>();
	for (const item of value as unknown[]) {
		if (!Array.isArray(item) || item.length !== 3) return invalidReference();
		const [path, mode, content] = item as unknown[];
		if (typeof path !== 'string' || !safePath(path) || entries.has(path)
			|| typeof mode !== 'number' || !Number.isInteger(mode) || mode < 0 || mode > 0xffff
			|| (content !== null && typeof content !== 'string')) return invalidReference();
		entries.set(path, [path, mode, content]);
	}
	return entries;
}

/** Walk the complete installation inventory without following directory symlinks. */
export async function measureManagedReleaseInventory(root: string, runtime: string, reference?: {
	readonly bytes: Buffer;
	readonly digest: string;
}): Promise<string> {
	if (await realpath(root) !== root || await realpath(runtime) !== runtime) {
		throw new Error('runtime inventory paths must be canonical');
	}
	const expected = reference === undefined ? undefined : readReference(reference.bytes, reference.digest);
	const raw = createHash('sha256');
	const visited: { path: string; stat: Stats }[] = [];
	const links: { path: string; target: string }[] = [];
	const uid = process.getuid?.();
	async function visit(path: string, name: string): Promise<void> {
		if (!safePath(name) || visited.length >= MAX_ENTRIES) throw new Error('runtime inventory exceeds its path bounds');
		const info = await lstat(path);
		if ((info.uid !== uid && info.uid !== 0) || (!info.isSymbolicLink() && (info.mode & 0o7022) !== 0)
			|| (info.isFile() && info.nlink !== 1)) throw new Error(`unsafe runtime inventory entry: ${name}`);
		visited.push({ path, stat: info });
		const entry = expected?.get(name);
		if (expected !== undefined && (entry === undefined || entry[1] !== info.mode)) {
			throw new Error(`unexpected runtime inventory entry: ${name}`);
		}
		let value: string | null = null;
		let pinnedValue: string | null = null;
		if (info.isSymbolicLink()) {
			const target = await readlink(path);
			const lexical = resolve(dirname(path), target);
			const resolved = await realpath(path);
			if (isAbsolute(target) || !contained(root, lexical) || !contained(root, resolved)) {
				throw new Error(`runtime inventory link escapes its checkout: ${name}`);
			}
			links.push({ path, target: resolved });
			value = target;
			pinnedValue = target;
		} else if (info.isFile()) {
			const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
			try {
				if (!stable(info, await file.stat())) throw new Error(`runtime inventory changed while opening: ${name}`);
				if (entry?.[2]?.startsWith('mach-o-arm64-v1:')) {
					if (!QUALIFIED_NATIVE_PATHS.has(name) || info.size > 32 * 1024 * 1024) return invalidReference();
					const bytes = await file.readFile();
					pinnedValue = releaseMetadataDigest(bytes);
					value = 'mach-o-arm64-v1:' + qualifiedNativeDigest(bytes, name, root);
				} else {
					const digest = createHash('sha256');
					for await (const chunk of file.createReadStream({ autoClose: false })) digest.update(chunk as Buffer);
					value = digest.digest('hex');
					pinnedValue = value;
				}
				if (!stable(info, await file.stat())) throw new Error(`runtime inventory changed while reading: ${name}`);
			} finally { await file.close(); }
		} else if (!info.isDirectory()) {
			throw new Error(`unsupported runtime inventory entry: ${name}`);
		}
		if (entry !== undefined && (entry[2] !== value
			|| (info.isFile() && !DIGEST.test((entry[2] ?? '').replace(/^mach-o-arm64-v1:/, ''))))) {
			throw new Error(`runtime inventory differs from signed reference: ${name}`);
		}
		expected?.delete(name);
		raw.update(JSON.stringify([name, info.mode, info.isFile() ? info.size : null, pinnedValue]) + '\n');
		if (info.isDirectory()) {
			for (const child of (await readdir(path)).sort()) await visit(join(path, child), `${name}/${child}`);
		}
	}
	const runtimeInfo = await lstat(runtime);
	if (!runtimeInfo.isFile() || (runtimeInfo.mode & 0o111) === 0) throw new Error('invalid release runtime executable');
	const rootInfo = await lstat(root);
	for (const name of ROOTS) {
		const path = name === 'node-runtime' ? runtime : join(root, name);
		if (await realpath(dirname(path)) !== dirname(path)) throw new Error(`runtime inventory parent is not canonical: ${name}`);
		await visit(path, name);
	}
	if (expected !== undefined && expected.size !== 0) throw new Error('signed runtime inventory entry is missing');
	const measuredPaths = new Set(visited.map(entry => entry.path));
	for (const link of links) {
		if (!measuredPaths.has(link.target) || await realpath(link.path) !== link.target) {
			throw new Error('runtime inventory link target is unmeasured or changed');
		}
	}
	for (const { path, stat } of visited) {
		if (!stable(stat, await lstat(path))) throw new Error(`runtime inventory changed during measurement: ${path}`);
	}
	if (!stable(rootInfo, await lstat(root))) throw new Error('runtime checkout changed during measurement');
	return raw.digest('hex');
}
