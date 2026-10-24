/** Bounded two-pass BSON decoding shared by saved and private-memory sinks. */
import { deserialize, ObjectId, Decimal128, Binary, Long } from 'bson';
import { runDirectoryConvert } from './shared.js';
import { BoundedInput, sourceStamp } from './bounded-input.js';
import type { SourceStamp } from './bounded-input.js';
import { DecoderBudget } from './decoder-budget.js';
import { validateBsonDocument } from './bson-framing.js';
import { convertedColumn, normalizeScalar } from './normalization.js';
import { createTypedRowSource, emptyColumn } from './typed-row-source.js';
import { writeTypedParquet } from './typed-parquet.js';
import type { ConvertedColumn, MemoryRowSource, FileConverter, MemorySourceOptions, ConvertDirectoryOpts, ConvertDirectoryResult, ConvertResult } from './types.js';
const MAX_DOCUMENT = 8 * 1024 * 1024;
interface Field {
	name: string;
	type?: string;
	stringify: boolean;
}
function classify(value: unknown): {
	type?: string;
	stringify: boolean;
} {
	if (value === null || value === undefined)
		return { stringify: false };
	if (typeof value === 'boolean')
		return { type: 'BOOLEAN', stringify: false };
	if (typeof value === 'number')
		return { type: Number.isInteger(value) ? 'INT64' : 'DOUBLE', stringify: false };
	if (value instanceof Long)
		return { type: value.greaterThan(Number.MAX_SAFE_INTEGER) || value.lessThan(Number.MIN_SAFE_INTEGER) ? 'UTF8' : 'INT64', stringify: false };
	if (value instanceof Date)
		return { type: 'TIMESTAMP_MILLIS', stringify: false };
	if (value instanceof Binary)
		return { type: 'BYTE_ARRAY', stringify: false };
	if (value instanceof ObjectId || value instanceof Decimal128 || typeof value === 'string')
		return { type: 'UTF8', stringify: false };
	return { type: 'UTF8', stringify: typeof value === 'object' };
}
function merge(a: string | undefined, b: string | undefined): string | undefined {
	if (a === undefined)
		return b;
	if (b === undefined || a === b)
		return a;
	if ([a, b].every(t => t === 'INT64' || t === 'DOUBLE'))
		return 'DOUBLE';
	return 'UTF8';
}
function bsonJson(_key: string, value: unknown): unknown {
	if (value instanceof Long || value instanceof Decimal128)
		return value.toString();
	if (typeof value === 'bigint')
		return value.toString();
	if (value instanceof ObjectId)
		return value.toHexString();
	if (value instanceof Binary)
		return Buffer.from(value.buffer).toString('base64');
	return value;
}
function normalize(value: unknown, field: Field, column: ConvertedColumn): unknown {
	if (value === null || value === undefined)
		return null;
	if (field.stringify)
		return JSON.stringify(value, bsonJson);
	if (value instanceof Long)
		value = column.physicalType === 'UTF8' ? value.toString() : value.toNumber();
	if (value instanceof ObjectId)
		value = value.toHexString();
	if (value instanceof Decimal128)
		value = value.toString();
	if (value instanceof Binary)
		value = Buffer.from(value.buffer);
	if (value instanceof Date)
		value = value.getTime();
	return normalizeScalar(value, column);
}
async function* documents(path: string, stamp: SourceStamp, budget: DecoderBudget, signal?: AbortSignal): AsyncIterable<Record<string, unknown>> {
	const input = await BoundedInput.open(path, budget, stamp);
	try {
		while (input.remaining) {
			signal?.throwIfAborted();
			const header = await input.read(4, 4);
			let length: number;
			try {
				length = header.bytes.readInt32LE(0);
			}
			finally {
				header.release();
			}
			if (length < 5 || length > MAX_DOCUMENT || length - 4 > input.remaining)
				throw new Error('resource-limit');
			input.seek(input.position - 4);
			const doc = await input.read(length, MAX_DOCUMENT);
			let releaseObject: (() => void) | undefined;
			try {
				validateBsonDocument(doc.bytes);
				// Conservative object/string expansion allowance, reserved before deserialize.
				releaseObject = budget.reserve(length * 8);
				yield deserialize(doc.bytes, { promoteLongs: false }) as Record<string, unknown>;
			}
			finally {
				releaseObject?.();
				doc.release();
			}
		}
		if ((await sourceStamp(path)).identity !== stamp.identity)
			throw new Error('Source changed during conversion');
	}
	finally {
		await input.close();
	}
}
class BsonConverter implements FileConverter {
	readonly kind = 'bson' as const;
	async openMemory(source: string, controls: MemorySourceOptions): Promise<MemoryRowSource> {
		const budget = controls.budget ?? new DecoderBudget(controls.memoryBudgetBytes);
		const releases: (() => void)[] = [];
		try {
			const stamp = await sourceStamp(source);
			const fields = new Map<string, Field>();
			// Full streaming inference keeps rare fields; retained schema is separately bounded.
			for await (const doc of documents(source, stamp, budget, controls.signal)) {
				for (const [name, value] of Object.entries(doc)) {
					let field = fields.get(name);
					const observed = classify(value);
					if (!field) {
						if (fields.size >= 16 * 1024)
							throw new Error('resource-limit');
						releases.push(budget.reserve(Buffer.byteLength(name) * 2 + 256));
						field = { name, stringify: false };
						fields.set(name, field);
					}
					const type = merge(field.type, observed.type);
					if (type !== undefined)
						field.type = type;
					field.stringify ||= observed.stringify;
				}
			}
			const columns = fields.size ? [...fields.values()].map(f => convertedColumn(f.name, f.type ?? 'UTF8', true, f.stringify ? 'bson-json' : 'bson-scalar')) : [emptyColumn()];
			const target = { targetId: 'data', sourceIdentity: stamp.identity, columns };
			const close = async () => {
				for (const release of releases.splice(0))
					release();
			};
			return createTypedRowSource([{
					target,
					rows: signal => documents(source, stamp, budget, controls.signal ? AbortSignal.any([controls.signal, ...(signal ? [signal] : [])]) : signal),
					normalize(row) {
						const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
						for (const column of columns) {
							const field = fields.get(column.name);
							out[column.name] = field ? normalize(row[column.name], field, column) : null;
						}
						return out;
					},
				}], { memoryBudgetBytes: controls.memoryBudgetBytes, close });
		}
		catch (error) {
			for (const release of releases)
				release();
			if (error instanceof Error && ['resource-limit', 'Source changed during conversion'].includes(error.message))
				throw error;
			throw new Error('Invalid or unsupported BSON source');
		}
	}
	async convertFile(source: string, dest: string, _options?: Readonly<Record<string, unknown>>): Promise<ConvertResult> {
		const start = Date.now(), rows = await this.openMemory(source, { memoryBudgetBytes: 256 * 1024 * 1024 });
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
export const bsonConverter: FileConverter = new BsonConverter();
