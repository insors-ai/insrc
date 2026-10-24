/** Bounded fixed-width rows; one schema/normalizer feeds both saved and memory sinks. */
import { BoundedInput, sourceStamp } from './bounded-input.js';
import type { SourceStamp } from './bounded-input.js';
import { DecoderBudget } from './decoder-budget.js';
import { convertedColumn } from './normalization.js';
import { createTypedRowSource } from './typed-row-source.js';
import { writeTypedParquet } from './typed-parquet.js';
import { runDirectoryConvert } from './shared.js';
import type { MemoryRowSource, MemorySourceOptions, FileConverter, ConvertResult, ConvertDirectoryOpts, ConvertDirectoryResult } from './types.js';
interface ColumnSpec {
	readonly name: string;
	readonly start: number;
	readonly length: number;
	readonly type: 'string' | 'integer' | 'number' | 'boolean';
}
interface FixedWidthOpts {
	readonly columns: readonly ColumnSpec[];
	readonly encoding: BufferEncoding;
	readonly trim: boolean;
	readonly skipFirstLine: boolean;
}
function readOpts(options: Readonly<Record<string, unknown>> | undefined): FixedWidthOpts {
	const o = (options ?? {}) as Record<string, unknown>;
	const rawCols = o['columns'];
	if (!Array.isArray(rawCols) || rawCols.length === 0 || rawCols.length > 4096) {
		throw new Error('converter-fixed-width: options.columns required');
	}
	const columns: ColumnSpec[] = rawCols.map((c, i) => {
		const spec = c as ColumnSpec;
		if (c === null || typeof c !== 'object'
			|| typeof spec.name !== 'string'
			|| typeof spec.start !== 'number'
			|| typeof spec.length !== 'number'
			|| typeof spec.type !== 'string'
			|| !Number.isSafeInteger(spec.start) || spec.start < 0
			|| !Number.isSafeInteger(spec.length) || spec.length <= 0
			|| spec.start + spec.length > 64 * 1024) {
			throw new Error(`converter-fixed-width: column ${i} must be { name, start, length, type }`);
		}
		if (!['string', 'integer', 'number', 'boolean'].includes(spec.type)) {
			throw new Error(`converter-fixed-width: column '${spec.name}' has unknown type '${spec.type}'`);
		}
		return spec;
	});
	return {
		columns,
		encoding: typeof o['encoding'] === 'string' ? (o['encoding'] as BufferEncoding) : 'utf8',
		trim: o['trim'] !== false,
		skipFirstLine: o['skipFirstLine'] === true,
	};
}
function parquetTypeFor(t: ColumnSpec['type']): string {
	switch (t) {
		case 'string': return 'UTF8';
		case 'integer': return 'INT64';
		case 'number': return 'DOUBLE';
		case 'boolean': return 'BOOLEAN';
	}
}
function sliceField(line: string, c: ColumnSpec, trim: boolean): unknown {
	const raw = line.slice(c.start, c.start + c.length);
	const v = trim ? raw.trim() : raw;
	if (v === '')
		return null;
	switch (c.type) {
		case 'string': return v;
		case 'integer': {
			const n = Number.parseInt(v, 10);
			if (!Number.isFinite(n))
				return null;
			if (!Number.isSafeInteger(n))
				throw new Error('Unsupported fixed-width integer precision');
			return n;
		}
		case 'number': {
			const n = Number(v);
			return Number.isFinite(n) ? n : null;
		}
		case 'boolean': {
			const lower = v.toLowerCase();
			if (lower === 'true' || lower === 't' || lower === 'y' || lower === '1')
				return true;
			if (lower === 'false' || lower === 'f' || lower === 'n' || lower === '0')
				return false;
			return null;
		}
	}
}
async function* lines(path: string, stamp: SourceStamp, budget: DecoderBudget, encoding: BufferEncoding, signal?: AbortSignal): AsyncIterable<string> {
	const input = await BoundedInput.open(path, budget, stamp);
	let pending = Buffer.alloc(0), releasePending = () => {
	};
	const append = (part: Buffer): void => {
		const length = pending.length + part.length;
		if (length > 64 * 1024)
			throw new Error('resource-limit');
		const release = budget.reserve(length);
		try {
			const next = Buffer.concat([pending, part], length);
			releasePending();
			pending = next;
			releasePending = release;
		}
		catch (error) {
			release();
			throw error;
		}
	};
	try {
		while (input.remaining) {
			signal?.throwIfAborted();
			const chunk = await input.read(Math.min(input.remaining, 64 * 1024), 64 * 1024);
			try {
				let start = 0;
				for (;;) {
					const end = chunk.bytes.indexOf(10, start);
					if (end === -1) {
						append(chunk.bytes.subarray(start));
						break;
					}
					append(chunk.bytes.subarray(start, end));
					const releaseText = budget.reserve(pending.length * 2);
					try {
						yield pending.toString(encoding).replace(/\r$/, '');
					}
					finally {
						releaseText();
						releasePending();
						pending = Buffer.alloc(0);
						releasePending = () => {
						};
					}
					start = end + 1;
				}
			}
			finally {
				chunk.release();
			}
		}
		if (pending.length) {
			const releaseText = budget.reserve(pending.length * 2);
			try {
				yield pending.toString(encoding).replace(/\r$/, '');
			}
			finally {
				releaseText();
			}
		}
		if ((await sourceStamp(path)).identity !== stamp.identity)
			throw new Error('Source changed during conversion');
	}
	finally {
		releasePending();
		await input.close();
	}
}
class FixedWidthConverter implements FileConverter {
	readonly kind = 'fixed-width' as const;
	async openMemory(source: string, controls: MemorySourceOptions, options?: Readonly<Record<string, unknown>>): Promise<MemoryRowSource> {
		const opts = readOpts(options);
		if (!['utf8', 'utf-8', 'ascii', 'latin1', 'binary'].includes(opts.encoding))
			throw new Error('unsupported-temporary');
		if (new Set(opts.columns.map(c => c.name)).size !== opts.columns.length || opts.columns.some(c => !c.name))
			throw new Error('Invalid fixed-width schema');
		const budget = controls.budget ?? new DecoderBudget(controls.memoryBudgetBytes);
		const stamp = await sourceStamp(source);
		const releaseSchema = budget.reserve(opts.columns.reduce((sum, c) => sum + Buffer.byteLength(c.name) * 2 + 256, 0));
		try {
			const columns = opts.columns.map(c => convertedColumn(c.name, parquetTypeFor(c.type), true, 'fixed-width'));
			return createTypedRowSource([{
					target: { targetId: 'data', sourceIdentity: stamp.identity, columns },
					async *rows(signal) {
						const combined = controls.signal ? AbortSignal.any([controls.signal, ...(signal ? [signal] : [])]) : signal;
						let first = true;
						for await (const line of lines(source, stamp, budget, opts.encoding, combined)) {
							if (first && opts.skipFirstLine) {
								first = false;
								continue;
							}
							first = false;
							const releaseRow = budget.reserve(opts.columns.reduce((sum,c)=>sum+c.name.length*2+64+c.length*4,32));
							try {
								const row: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
								for (const column of opts.columns) row[column.name] = sliceField(line, column, opts.trim);
								yield row;
							} finally { releaseRow(); }
						}
					},
					normalize: row => row,
				}], { memoryBudgetBytes: controls.memoryBudgetBytes, budget, close: async () => {
					releaseSchema();
				} });
		}
		catch (error) {
			releaseSchema();
			throw error;
		}
	}
	async convertFile(source: string, dest: string, options?: Readonly<Record<string, unknown>>): Promise<ConvertResult> {
		const start = Date.now(), rows = await this.openMemory(source, { memoryBudgetBytes: 256 * 1024 * 1024 }, options);
		try {
			return { destPath: dest, rowCount: await writeTypedParquet(rows, 'data', dest), durationMs: Date.now() - start };
		}
		finally {
			await rows.close();
		}
	}
	async convertDirectory(source: string, dest: string, opts: ConvertDirectoryOpts, options?: Readonly<Record<string, unknown>>): Promise<ConvertDirectoryResult> {
		return runDirectoryConvert(source, dest, opts, this.kind, (s, d) => this.convertFile(s, d, options));
	}
}
export const fixedWidthConverter: FileConverter = new FixedWidthConverter();
