/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { createHash } from 'node:crypto';
import { basename } from 'node:path';

const SEGMENT = 0x19;
const SYMTAB = 0x02;
const DYSYMTAB = 0x0b;
const UUID = 0x1b;
const SIGNATURE = 0x1d;
const DYLD_INFO = 0x80000022;
const DEBUG_SOURCE = 0x64;
const DEBUG_OBJECT = 0x66;
const MAX_NATIVE_BYTES = 32 * 1024 * 1024;

export const QUALIFIED_NATIVE_PATHS = new Set([
	'node_modules/fs-ext/build/Release/fs_ext.node',
	'node_modules/tree-sitter/build/Release/tree_sitter_runtime_binding.node',
	'node_modules/tree-sitter-kotlin/build/Release/tree_sitter_kotlin_binding.node',
	'node_modules/@derekstride/tree-sitter-sql/build/Release/tree_sitter_sql_binding.node',
]);

interface Region { offset: number; size: number }
const reject = (): never => { throw new Error('unsupported or inconsistent qualified Mach-O layout'); };
function inside(region: Region, start: number, end: number): boolean {
	return Number.isSafeInteger(region.offset) && Number.isSafeInteger(region.size)
		&& region.offset >= start && region.size >= 0 && region.offset <= end - region.size;
}

function signaturePolicy(bytes: Buffer, signature: Region, moduleName: string, executable: Region): Buffer {
	const blob = bytes.subarray(signature.offset);
	const blobLength = blob.length >= 8 ? blob.readUInt32BE(4) : 0;
	if (blob.length < 112 || blob.length !== signature.size || blob.readUInt32BE(0) !== 0xfade0cc0
		|| blobLength < 112 || blobLength > blob.length || blob.length !== Math.ceil(blobLength / 8) * 8
		|| blob.subarray(blobLength).some(value => value !== 0) || blob.readUInt32BE(8) !== 1
		|| blob.readUInt32BE(12) !== 0 || blob.readUInt32BE(16) !== 20) return reject();
	const cd = blob.subarray(20, blobLength);
	if (cd.readUInt32BE(0) !== 0xfade0c02 || cd.readUInt32BE(4) !== cd.length
		|| cd.readUInt32BE(8) !== 0x20400 || cd.readUInt32BE(12) !== 0x20002
		|| cd.readUInt32BE(20) !== 88 || cd.readUInt32BE(24) !== 0
		|| cd.readUInt32BE(32) !== signature.offset || cd.readUInt32BE(36) !== 0x2002000c
		|| cd.subarray(40, 64).some(value => value !== 0)
		|| cd.readBigUInt64BE(64) !== BigInt(executable.offset)
		|| cd.readBigUInt64BE(72) !== BigInt(executable.size) || cd.readBigUInt64BE(80) !== 0n) return reject();
	const hashes = cd.readUInt32BE(16);
	const pages = cd.readUInt32BE(28);
	const identifierEnd = cd.indexOf(0, 88);
	if (identifierEnd < 88 || hashes !== identifierEnd + 1 || cd.toString('utf8', 88, identifierEnd) !== moduleName
		|| pages !== Math.ceil(signature.offset / 4096) || hashes + 32 * pages !== cd.length) return reject();
	for (let page = 0; page < pages; page++) {
		const digest = createHash('sha256').update(bytes.subarray(page * 4096, Math.min((page + 1) * 4096, signature.offset))).digest();
		if (!digest.equals(cd.subarray(hashes + page * 32, hashes + (page + 1) * 32))) return reject();
	}
	const policy = Buffer.from(cd.subarray(0, hashes));
	// These values are derived from the original, validated code boundary.
	for (const field of [4, 28, 32]) policy.writeUInt32BE(0, field);
	return policy;
}

/** Preserve all executable bytes and loader references. Canonicalize only proven linker debug variance. */
export function qualifiedNativeDigest(bytes: Buffer, relativePath: string, root: string): string {
	if (!QUALIFIED_NATIVE_PATHS.has(relativePath) || bytes.length < 32 || bytes.length > MAX_NATIVE_BYTES) return reject();
	const u32 = (offset: number) => bytes.readUInt32LE(offset);
	const u64 = (offset: number) => Number(bytes.readBigUInt64LE(offset));
	if (u32(0) !== 0xfeedfacf || u32(4) !== 0x0100000c || u32(12) !== 8) return reject();
	const commandsEnd = 32 + u32(20);
	const count = u32(16);
	if (count > 128 || commandsEnd > bytes.length) return reject();
	const commands = new Map<number, number>();
	const segmentNames = new Set<string>();
	let link: Region | undefined;
	let executable: Region | undefined;
	let linkCommand = 0;
	let cursor = 32;
	for (let i = 0; i < count; i++) {
		if (cursor + 8 > commandsEnd) return reject();
		const kind = u32(cursor);
		const size = u32(cursor + 4);
		if (size < 8 || size % 8 !== 0 || cursor + size > commandsEnd) return reject();
		if (kind === SEGMENT) {
			if (size < 72 || size !== 72 + 80 * u32(cursor + 64)) return reject();
			const name = bytes.toString('ascii', cursor + 8, cursor + 24).replace(/\0+$/, '');
			const region = { offset: u64(cursor + 40), size: u64(cursor + 48) };
			if (!inside(region, 0, bytes.length) || segmentNames.has(name)) return reject();
			segmentNames.add(name);
			if (name === '__LINKEDIT') {
				if (size !== 72 || u32(cursor + 56) !== 1 || u32(cursor + 60) !== 1 || region.offset + region.size !== bytes.length) return reject();
				link = region;
				linkCommand = cursor;
			} else if (name === '__TEXT') {
				for (let section = cursor + 72; section < cursor + size; section += 80) {
					if (bytes.toString('ascii', section, section + 16).replace(/\0+$/, '') === '__text') {
						executable = { offset: region.offset, size: u64(section + 40) };
					}
				}
			}
		} else {
			const expected = new Map([[SYMTAB, 24], [DYSYMTAB, 80], [UUID, 24], [SIGNATURE, 16],
				[DYLD_INFO, 48], [0x26, 16], [0x29, 16], [0x2a, 16]]);
			if (expected.has(kind) ? size !== expected.get(kind)
				: kind === 0x32 ? size < 24 || size !== 24 + 8 * u32(cursor + 20)
					: kind !== 0x0c || size < 24) return reject();
			if (kind !== 0x0c && commands.has(kind)) return reject();
			commands.set(kind, cursor);
		}
		cursor += size;
	}
	if (cursor !== commandsEnd || link === undefined || executable === undefined || link.offset < commandsEnd) return reject();
	const sym = commands.get(SYMTAB);
	const dysym = commands.get(DYSYMTAB);
	const uuid = commands.get(UUID);
	const sign = commands.get(SIGNATURE);
	const dyld = commands.get(DYLD_INFO);
	if (sym === undefined || dysym === undefined || uuid === undefined || sign === undefined || dyld === undefined) return reject();
	const symbols = { offset: u32(sym + 8), size: u32(sym + 12) * 16 };
	const strings = { offset: u32(sym + 16), size: u32(sym + 20) };
	const signature = { offset: u32(sign + 8), size: u32(sign + 12) };
	if (!inside(symbols, link.offset, strings.offset) || !inside(strings, symbols.offset + symbols.size, signature.offset)
		|| signature.offset !== Math.ceil((strings.offset + strings.size) / 16) * 16
		|| signature.offset + signature.size !== bytes.length
		|| bytes.subarray(strings.offset + strings.size, signature.offset).some(value => value !== 0)) return reject();
	const immutableRegions = [symbols];
	const addRegion = (offset: number, size: number) => {
		if (size !== 0) immutableRegions.push({ offset, size });
	};
	for (let field = 8; field < 48; field += 8) addRegion(u32(dyld + field), u32(dyld + field + 4));
	for (const kind of [0x26, 0x29]) {
		const command = commands.get(kind);
		if (command !== undefined) addRegion(u32(command + 8), u32(command + 12));
	}
	// The qualified profile has only an indirect symbol table here. Reject
	// relocation or reference layouts that need a different proof.
	for (const field of [32, 40, 48, 64, 72]) {
		if (u32(dysym + field) !== 0 || u32(dysym + field + 4) !== 0) return reject();
	}
	const indirect = { offset: u32(dysym + 56), size: 4 * u32(dysym + 60) };
	addRegion(indirect.offset, indirect.size);
	let previous = link.offset;
	for (const region of immutableRegions.sort((a, b) => a.offset - b.offset)) {
		if (!inside(region, previous, strings.offset) || bytes.subarray(previous, region.offset).some(value => value !== 0)) return reject();
		previous = region.offset + region.size;
	}
	if (bytes.subarray(previous, strings.offset).some(value => value !== 0)) return reject();
	const policy = signaturePolicy(bytes, signature, basename(relativePath), executable);
	const prefix = Buffer.from(bytes.subarray(0, strings.offset));
	prefix.fill(0, uuid + 8, uuid + 24);
	prefix.fill(0, linkCommand + 48, linkCommand + 56);
	prefix.fill(0, sym + 20, sym + 24);
	prefix.fill(0, sign + 8, sign + 16);
	const stringTable = bytes.subarray(strings.offset, strings.offset + strings.size);
	const covered = Buffer.alloc(stringTable.length);
	if (stringTable[0] !== 0x20 || stringTable[1] !== 0) return reject();
	covered[0] = 1;
	const nativeRoot = Buffer.from(root + '/' + relativePath.split('/build/')[0] + '/build/');
	const debugIndexes = new Set<number>();
	const debugStrings: Region[] = [];
	const runtimeStrings: Region[] = [];
	const stableStrings: string[] = [];
	const canonicalOffsets = new Map<string, number>();
	let nextOffset = 2;
	for (let offset = symbols.offset; offset < symbols.offset + symbols.size; offset += 16) {
		const start = u32(offset);
		const end = stringTable.indexOf(0, start);
		if (start >= stringTable.length || end < start) return reject();
		const type = bytes[offset + 4];
		let name = stringTable.subarray(start, end);
		covered.fill(1, start, end + 1);
		const stringRegion = { offset: start, size: end + 1 - start };
		if ((type === DEBUG_SOURCE || type === DEBUG_OBJECT) && name.subarray(0, nativeRoot.length).equals(nativeRoot)) {
			const suffix = name.subarray(nativeRoot.length).toString('ascii');
			const validSuffix = type === DEBUG_SOURCE
				? /^\.\.\/(?:[a-zA-Z0-9_-]+\/)*$/.test(suffix)
				: /^Release\/(?:obj\.target\/[a-zA-Z0-9._/-]+\.o|[a-zA-Z0-9_]+\.a\([a-zA-Z0-9_-]+\.o\))$/.test(suffix)
					&& !suffix.split('/').includes('..');
			if (!validSuffix) return reject();
			const index = (offset - symbols.offset) / 16;
			if (index < u32(dysym + 8) || index >= u32(dysym + 8) + u32(dysym + 12)) return reject();
			debugIndexes.add(index);
			debugStrings.push(stringRegion);
			name = Buffer.concat([Buffer.from('$BUILD/'), name.subarray(nativeRoot.length)]);
			if (type === DEBUG_OBJECT) prefix.fill(0, offset + 8, offset + 16);
		} else runtimeStrings.push(stringRegion);
		const encoded = name.toString('hex');
		let canonical = canonicalOffsets.get(encoded);
		if (canonical === undefined) {
			canonical = nextOffset;
			nextOffset += name.length + 1;
			canonicalOffsets.set(encoded, canonical);
			stableStrings.push(encoded);
		}
		prefix.writeUInt32LE(canonical, offset);
	}
	for (const debug of debugStrings) {
		if (runtimeStrings.some(runtime => runtime.offset < debug.offset + debug.size
			&& debug.offset < runtime.offset + runtime.size)) return reject();
	}
	for (let offset = indirect.offset; offset < indirect.offset + indirect.size; offset += 4) {
		const index = u32(offset);
		if (index !== 0x80000000 && index !== 0x40000000 && index !== 0xc0000000
			&& (index >= symbols.size / 16 || debugIndexes.has(index))) return reject();
	}
	if (stringTable.some((value, offset) => value !== 0 && covered[offset] !== 1)) return reject();
	const canonicalCodeLimit = Math.ceil((strings.offset + nextOffset) / 16) * 16;
	const canonicalLayout = [nextOffset, canonicalCodeLimit, canonicalCodeLimit - link.offset];
	return createHash('sha256').update('insrc-native-arm64-v1\0').update(prefix)
		.update(JSON.stringify([stableStrings, canonicalLayout])).update(policy).digest('hex');
}
