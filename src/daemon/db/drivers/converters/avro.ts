import { validateAvroSchemaDefinition } from './avro-schema.js';
/** Explicit container framing + bounded inflater + schema-first Avro rows. */
import avsc from 'avsc';
import { inflateRawSync } from 'node:zlib';
import { BoundedInput, sourceStamp } from './bounded-input.js';
import type { SourceStamp } from './bounded-input.js';
import type { DecoderReservation } from './decoder-budget.js';
import { DecoderBudget } from './decoder-budget.js';
import { AvroCursor, avroStructure, validateAvroRecord, validateAvroSchema } from './avro-binary.js';
import { convertedColumn, normalizeScalar } from './normalization.js';
import { createTypedRowSource, emptyColumn } from './typed-row-source.js';
import { writeTypedParquet } from './typed-parquet.js';
import { runDirectoryConvert } from './shared.js';
import type { ConvertedColumn, FileConverter, MemoryRowSource, MemorySourceOptions, ConvertResult, ConvertDirectoryOpts, ConvertDirectoryResult } from './types.js';
const MAX_BLOCK = 8 * 1024 * 1024;
async function long(input: BoundedInput): Promise<number> {
	const values: number[] = [];
	for (let i = 0; i < 10; i++) {
		const unit = await input.read(1, 1);
		let byte: number;
		try {
			byte = unit.bytes[0]!;
			values.push(byte);
		}
		finally {
			unit.release();
		}
		if (!(byte & 128))
			return new AvroCursor(Buffer.from(values)).long();
	}
	throw new Error('Invalid Avro integer');
}
async function bytes(input: BoundedInput, ceiling: number): Promise<{
	bytes: Buffer;
	release: () => void;
}> {
	return input.read(await long(input), ceiling);
}
function validateSchemaJson(bytes: Buffer): void {
	let depth = 0, nodes = 0, quoted = false, escaped = false, start = 0;
	for (let i = 0; i < bytes.length; i++) {
		const ch = bytes[i];
		if (quoted) {
			if (i - start > 64 * 1024)
				throw new Error('resource-limit');
			if (escaped) {
				escaped = false;
				continue;
			}
			if (ch === 92) {
				escaped = true;
				continue;
			}
			if (ch === 34)
				quoted = false;
			continue;
		}
		if (ch === 34) {
			quoted = true;
			start = i;
		}
		else if (ch === 123 || ch === 91) {
			if (++depth > 32 || ++nodes > 16 * 1024)
				throw new Error('resource-limit');
		}
		else if (ch === 125 || ch === 93)
			depth--;
	}
	if (quoted || depth !== 0)
		throw new Error('Invalid Avro schema');
}
interface Header {
	readonly type: avsc.Type;
	readonly sync: Buffer;
	readonly codec: 'null' | 'deflate';
	readonly offset: number;
	readonly release: () => void;
}
async function header(path: string, stamp: SourceStamp, budget: DecoderBudget): Promise<Header> {
	const input = await BoundedInput.open(path, budget, stamp);
	const retained: (() => void)[] = [];
	try {
		const magic = await input.read(4, 4);
		try {
			if (!magic.bytes.equals(Buffer.from([79, 98, 106, 1])))
				throw new Error('Invalid Avro header');
		}
		finally {
			magic.release();
		}
		let schema: Buffer | undefined, codec = 'null', entries = 0, metadataBytes = 0;
		for (;;) {
			let count = await long(input);
			if (count === 0)
				break;
			let end: number | undefined;
			if (count < 0) {
				count = -count;
				const blockSize = await long(input);
				if (blockSize < 0 || blockSize > 1024 * 1024)
					throw new Error('resource-limit');
				end = input.position + blockSize;
			}
			entries += count;
			if (entries > 64)
				throw new Error('resource-limit');
			for (let i = 0; i < count; i++) {
				const key = await bytes(input, 1024);
				let name: string;
				try {
					name = key.bytes.toString('utf8');
				}
				finally {
					key.release();
				}
				const value = await bytes(input, name === 'avro.schema' ? 256 * 1024 : 64 * 1024);
				try {
					metadataBytes += value.bytes.length;
					if (metadataBytes > 1024 * 1024)
						throw new Error('resource-limit');
					if (name === 'avro.schema') {
						if (schema)
							throw new Error('Invalid Avro metadata');
						retained.push(budget.reserve(value.bytes.length * 16));
						schema = Buffer.from(value.bytes);
					}
					else if (name === 'avro.codec') {
						codec = value.bytes.toString('utf8');
					}
				}
				finally {
					value.release();
				}
			}
			if (end !== undefined && end !== input.position)
				throw new Error('Invalid Avro metadata');
		}
		if (!schema)
			throw new Error('Invalid Avro schema');
		if (codec !== 'null' && codec !== 'deflate')
			throw new Error('unsupported-temporary');
		validateSchemaJson(schema);
		const definition:unknown=JSON.parse(schema.toString('utf8'));
		validateAvroSchemaDefinition(definition);
		const type = avsc.Type.forSchema(definition as avsc.Schema);
		if (type.typeName !== 'record')
			throw new Error('unsupported-temporary');
		validateAvroSchema(type);
		const marker = await input.read(16, 16);
		let sync: Buffer;
		try {
			retained.push(budget.reserve(16));
			sync = Buffer.from(marker.bytes);
		}
		finally {
			marker.release();
		}
		return { type, sync, codec, offset: input.position, release: () => {
				for (const release of retained.splice(0))
					release();
			} };
	}
	catch (error) {
		for (const release of retained)
			release();
		throw error;
	}
	finally {
		await input.close();
	}
}
function columnFor(name: string, type: avsc.Type): ConvertedColumn {
	let kind = type.typeName;
	if (kind.startsWith('union')) {
		const nonNull = avroStructure(type).types!.filter(t => t.typeName !== 'null');
		if (nonNull.length === 1)
			return columnFor(name, nonNull[0]!);
		return convertedColumn(name, 'UTF8', true, 'json');
	}
	const physical: Record<string, string> = { boolean: 'BOOLEAN', int: 'INT32', long: 'INT64', float: 'FLOAT', double: 'DOUBLE', string: 'UTF8', enum: 'UTF8', bytes: 'BYTE_ARRAY', fixed: 'BYTE_ARRAY' };
	return convertedColumn(name, physical[kind] ?? 'UTF8', true, physical[kind] === undefined ? 'json' : 'scalar');
}
async function* records(path: string, stamp: SourceStamp, h: Header, budget: DecoderBudget, signal?: AbortSignal): AsyncIterable<Readonly<Record<string, unknown>>> {
	const input = await BoundedInput.open(path, budget, stamp);
	input.seek(h.offset);
	try {
		while (input.remaining) {
			signal?.throwIfAborted();
			const count = await long(input), size = await long(input);
			if (count <= 0 || count > 1024 * 1024 || size < 0 || size > MAX_BLOCK)
				throw new Error('resource-limit');
			const compressed = await input.read(size, MAX_BLOCK);
			let releaseExpansion: DecoderReservation | undefined;
			try {
				let data = compressed.bytes;
				if (h.codec === 'deflate') {
					// Native output admission is fixed before inflation; no unbounded collector.
					const allowance = Math.min(MAX_BLOCK, budget.limit - budget.snapshot().retained);
					if (allowance <= 0)
						throw new Error('resource-limit');
					releaseExpansion = budget.reserve(allowance);
					try {
						data = inflateRawSync(compressed.bytes, { maxOutputLength: allowance });
						releaseExpansion.shrinkTo(data.length);
					}
					catch {
						throw new Error('resource-limit');
					}
				}
				const cursor = new AvroCursor(data);
				for (let row = 0; row < count; row++) {
					signal?.throwIfAborted();
					const offset = cursor.offset, nodes = validateAvroRecord(h.type, cursor);
					const releaseObject = budget.reserve((cursor.offset - offset) * 8 + nodes * 128);
					try {
						const decoded = h.type.decode(data, offset);
						if (decoded.offset !== cursor.offset)
							throw new Error('Invalid Avro record');
						yield decoded.value as Readonly<Record<string, unknown>>;
					}
					finally {
						releaseObject();
					}
				}
				if (cursor.offset !== data.length)
					throw new Error('Invalid Avro block');
			}
			finally {
				releaseExpansion?.();
				compressed.release();
			}
			const marker = await input.read(16, 16);
			try {
				if (!marker.bytes.equals(h.sync))
					throw new Error('Invalid Avro sync marker');
			}
			finally {
				marker.release();
			}
		}
		if ((await sourceStamp(path)).identity !== stamp.identity)
			throw new Error('Source changed during conversion');
	}
	finally {
		await input.close();
	}
}
class AvroConverter implements FileConverter {
	readonly kind = 'avro' as const;
	async openMemory(source: string, controls: MemorySourceOptions): Promise<MemoryRowSource> {
		const budget = controls.budget ?? new DecoderBudget(controls.memoryBudgetBytes);
		let h: Header | undefined;
		try {
			controls.signal?.throwIfAborted();
			const stamp = await sourceStamp(source);
			h = await header(source, stamp, budget);
			const owned = h;
			const columns = avroStructure(h.type).fields!.map(f => columnFor(f.name, f.type));
			if (!columns.length)
				columns.push(emptyColumn());
			return createTypedRowSource([{
					target: { targetId: 'data', sourceIdentity: stamp.identity, columns },
					rows: signal => records(source, stamp, owned, budget, controls.signal ? AbortSignal.any([controls.signal, ...(signal ? [signal] : [])]) : signal),
					normalize(row) {
						const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
						for (const column of columns)
							out[column.name] = normalizeScalar(row[column.name], column);
						return out;
					},
				}], { memoryBudgetBytes: controls.memoryBudgetBytes, budget, close: async () => {
					owned.release();
				} });
		}
		catch (error) {
			h?.release();
			if (error instanceof Error && ['resource-limit', 'unsupported-temporary', 'Source changed during conversion'].includes(error.message))
				throw error;
			throw new Error('Invalid or unsupported Avro source');
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
export const avroConverter: FileConverter = new AvroConverter();
