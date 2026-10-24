import { boundedInflateRaw } from './bounded-inflate.js';
import { BoundedInput, sourceStamp } from './bounded-input.js';
import type { SourceStamp } from './bounded-input.js';
import { DecoderBudget } from './decoder-budget.js';
const MAX_ENTRY = 8 * 1024 * 1024;
export interface ZipEntry {
	readonly name: string;
	readonly compressed: number;
	readonly expanded: number;
	readonly crc: number;
	readonly method: number;
	readonly flags: number;
	readonly offset: number;
}
function crc32(bytes: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit++)
			crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}
function extra(bytes: Buffer): void {
	let offset = 0;
	while (offset < bytes.length) {
		if (offset + 4 > bytes.length)
			throw new Error('Invalid ZIP extra data');
		const id = bytes.readUInt16LE(offset), size = bytes.readUInt16LE(offset + 2);
		if (id === 1)
			throw new Error('unsupported-temporary');
		offset += 4 + size;
		if (offset > bytes.length)
			throw new Error('Invalid ZIP extra data');
	}
}
function entryName(bytes: Buffer, flags: number): string {
	if (!(flags & 0x800) && bytes.some(b => b > 127))
		throw new Error('unsupported-temporary');
	const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	if (!name || name.length > 1024 || name.startsWith('/') || name.includes('\\') || name.split('/').some(p => p === '..' || p === '.') || name.includes('\0'))
		throw new Error('Invalid ZIP entry');
	return name;
}
export class BoundedZip {
	#closed = false;
	#buffers = new Set<() => void>();
	private constructor(readonly path: string, readonly stamp: SourceStamp, readonly budget: DecoderBudget, readonly entries: readonly ZipEntry[], readonly centralOffset: number, readonly releases: (() => void)[]) {
	}
	static async open(path: string, budget: DecoderBudget): Promise<BoundedZip> {
		const stamp = await sourceStamp(path), input = await BoundedInput.open(path, budget, stamp), releases: (() => void)[] = [];
		try {
			if (stamp.size < 22)
				throw new Error('Invalid ZIP archive');
			const tailSize = Math.min(stamp.size, 65557);
			input.seek(stamp.size - tailSize);
			const tail = await input.read(tailSize, 65557);
			let count: number, centralSize: number, centralOffset: number;
			try {
				let at = tail.bytes.length - 22;
				for (; at >= 0; at--)
					if (tail.bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + tail.bytes.readUInt16LE(at + 20) === tail.bytes.length)
						break;
				if (at < 0)
					throw new Error('Invalid ZIP end record');
				if (tail.bytes.readUInt16LE(at + 4) || tail.bytes.readUInt16LE(at + 6))
					throw new Error('unsupported-temporary');
				count = tail.bytes.readUInt16LE(at + 10);
				centralSize = tail.bytes.readUInt32LE(at + 12);
				centralOffset = tail.bytes.readUInt32LE(at + 16);
				if (count === 65535 || centralSize === 0xffffffff || centralOffset === 0xffffffff)
					throw new Error('unsupported-temporary');
				if (count !== tail.bytes.readUInt16LE(at + 8) || count > 1024 || centralSize > 1024 * 1024)
					throw new Error('resource-limit');
				if (centralOffset + centralSize !== stamp.size - tailSize + at)
					throw new Error('Invalid ZIP central directory');
			}
			finally {
				tail.release();
			}
			input.seek(centralOffset);
			const directory = await input.read(centralSize, 1024 * 1024), entries: ZipEntry[] = [];
			let total = 0;
			try {
				let offset = 0;
				const names = new Set<string>();
				for (let i = 0; i < count; i++) {
					if (offset + 46 > directory.bytes.length || directory.bytes.readUInt32LE(offset) !== 0x02014b50)
						throw new Error('Invalid ZIP directory');
					const flags = directory.bytes.readUInt16LE(offset + 8), method = directory.bytes.readUInt16LE(offset + 10), crc = directory.bytes.readUInt32LE(offset + 16), compressed = directory.bytes.readUInt32LE(offset + 20), expanded = directory.bytes.readUInt32LE(offset + 24), nameSize = directory.bytes.readUInt16LE(offset + 28), extraSize = directory.bytes.readUInt16LE(offset + 30), commentSize = directory.bytes.readUInt16LE(offset + 32), localOffset = directory.bytes.readUInt32LE(offset + 42);
					if (flags & ~0x80e || ![0, 8].includes(method) || directory.bytes.readUInt16LE(offset + 34))
						throw new Error('unsupported-temporary');
					if (compressed === 0xffffffff || expanded === 0xffffffff || localOffset === 0xffffffff)
						throw new Error('unsupported-temporary');
					if (expanded > MAX_ENTRY || compressed > MAX_ENTRY || nameSize > 1024 || extraSize > 65535)
						throw new Error('resource-limit');
					const end = offset + 46 + nameSize + extraSize + commentSize;
					if (end > directory.bytes.length || localOffset + 30 + compressed > centralOffset)
						throw new Error('Invalid ZIP entry');
					const name = entryName(directory.bytes.subarray(offset + 46, offset + 46 + nameSize), flags);
					if (names.has(name))
						throw new Error('Invalid ZIP duplicate entry');
					names.add(name);
					extra(directory.bytes.subarray(offset + 46 + nameSize, offset + 46 + nameSize + extraSize));
					total += expanded;
					if (total > 64 * 1024 * 1024)
						throw new Error('resource-limit');
					releases.push(budget.reserve(Buffer.byteLength(name) * 2 + 256));
					entries.push(Object.freeze({ name, flags, method, crc, compressed, expanded, offset: localOffset }));
					offset = end;
				}
				if (offset !== directory.bytes.length)
					throw new Error('Invalid ZIP directory');
			}
			finally {
				directory.release();
			}
			if ((await sourceStamp(path)).identity !== stamp.identity)
				throw new Error('Source changed during conversion');
			return new BoundedZip(path, stamp, budget, Object.freeze(entries), centralOffset, releases);
		}
		catch (error) {
			for (const release of releases)
				release();
			throw error;
		}
		finally {
			await input.close();
		}
	}
	async read(name: string): Promise<{
		bytes: Buffer;
		release: () => void;
	}> {
		if (this.#closed)
			throw new Error('Converted archive closed');
		const entry = this.entries.find(e => e.name === name);
		if (!entry)
			throw new Error('Missing workbook entry');
		const input = await BoundedInput.open(this.path, this.budget, this.stamp);
		let payload: {
			bytes: Buffer;
			release: () => void;
		} | undefined, releaseExpanded: (() => void) | undefined;
		try {
			input.seek(entry.offset);
			const local = await input.read(30, 30);
			let nameSize: number, extraSize: number;
			try {
				if (local.bytes.readUInt32LE(0) !== 0x04034b50 || local.bytes.readUInt16LE(6) !== entry.flags || local.bytes.readUInt16LE(8) !== entry.method)
					throw new Error('Invalid ZIP local entry');
				nameSize = local.bytes.readUInt16LE(26);
				extraSize = local.bytes.readUInt16LE(28);
				if (!(entry.flags & 8) && (local.bytes.readUInt32LE(14) !== entry.crc || local.bytes.readUInt32LE(18) !== entry.compressed || local.bytes.readUInt32LE(22) !== entry.expanded))
					throw new Error('Invalid ZIP local sizes');
			}
			finally {
				local.release();
			}
			if (nameSize > 1024 || input.position + nameSize + extraSize + entry.compressed > this.centralOffset)
				throw new Error('Invalid ZIP local entry');
			const metadata = await input.read(nameSize + extraSize, 66559);
			try {
				if (entryName(metadata.bytes.subarray(0, nameSize), entry.flags) !== entry.name)
					throw new Error('Invalid ZIP local name');
				extra(metadata.bytes.subarray(nameSize));
			}
			finally {
				metadata.release();
			}
			payload = await input.read(entry.compressed, MAX_ENTRY);
			let data = payload.bytes;
			if (entry.method === 8) {
				const expanded=boundedInflateRaw(data,this.budget,Math.max(1,entry.expanded));
				data=expanded.bytes;releaseExpanded=expanded.release;
			}
			if (data.length !== entry.expanded || crc32(data) !== entry.crc)
				throw new Error('Invalid ZIP expanded entry');
			if ((await sourceStamp(this.path)).identity !== this.stamp.identity)
				throw new Error('Source changed during conversion');
			if (this.#closed)
				throw new Error('Converted archive closed');
			const ownedPayload = payload, ownedExpansion = releaseExpanded;
			payload = undefined;
			releaseExpanded = undefined;
			let live = true;
			const release = () => {
				if (!live)
					return;
				live = false;
				this.#buffers.delete(release);
				ownedExpansion?.();
				ownedPayload.release();
			};
			this.#buffers.add(release);
			return { bytes: data, release };
		}
		finally {
			releaseExpanded?.();
			payload?.release();
			await input.close();
		}
	}
	async close(): Promise<void> {
		if (this.#closed)
			return;
		this.#closed = true;
		for (const release of this.#buffers)
			release();
		for (const release of this.releases.splice(0))
			release();
	}
}
