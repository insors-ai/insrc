import { open, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DecoderBudget } from './decoder-budget.js';
export interface SourceStamp {
	readonly identity: string;
	readonly size: number;
}
export async function sourceStamp(path: string): Promise<SourceStamp> {
	try {
		const s = await stat(path, { bigint: true });
		if (!s.isFile() || s.size > BigInt(Number.MAX_SAFE_INTEGER))
			throw new Error('unsupported-temporary');
		return { identity: createHash('sha256').update([s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':')).digest('hex'), size: Number(s.size) };
	}
	catch {
		throw new Error('Invalid or unsupported converted source');
	}
}
/** Exact positional input, reserving before each bounded allocation. */
export class BoundedInput {
	#offset = 0;
	private constructor(readonly handle: FileHandle, readonly budget: DecoderBudget, readonly size: number) {
	}
	static async open(path: string, budget: DecoderBudget, expected: SourceStamp): Promise<BoundedInput> {
		const handle = await open(path, 'r').catch(() => {
			throw new Error('Invalid or unsupported converted source');
		});
		try {
			const s = await handle.stat({ bigint: true });
			const identity = createHash('sha256').update([s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':')).digest('hex');
			if (!s.isFile() || identity !== expected.identity)
				throw new Error('Source changed during conversion');
			return new BoundedInput(handle, budget, expected.size);
		}
		catch (error) {
			await handle.close();
			throw error;
		}
	}
	get remaining(): number {
		return this.size - this.#offset;
	}
	get position(): number {
		return this.#offset;
	}
	seek(position: number): void {
		if (!Number.isSafeInteger(position) || position < 0 || position > this.size)
			throw new Error('Invalid converted source position');
		this.#offset = position;
	}
	async read(length: number, ceiling: number): Promise<{
		bytes: Buffer;
		release: () => void;
	}> {
		if (!Number.isSafeInteger(length) || length < 0 || length > ceiling || length > this.remaining)
			throw new Error('resource-limit');
		const release = this.budget.reserve(length);
		try {
			const bytes = Buffer.allocUnsafe(length);
			let offset = 0;
			while (offset < length) {
				const result = await this.handle.read(bytes, offset, Math.min(64 * 1024, length - offset), this.#offset + offset);
				if (!result.bytesRead)
					throw new Error('Invalid converted source framing');
				offset += result.bytesRead;
			}
			this.#offset += length;
			return { bytes, release };
		}
		catch (error) {
			release();
			throw error;
		}
	}
	async close(): Promise<void> {
		await this.handle.close();
	}
}
