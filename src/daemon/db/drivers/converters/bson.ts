/**
 * bson → Parquet converter (Phase 2.3 of
 * plans/data-driver-duckdb-files.md).
 *
 * BSON is a length-prefixed binary stream of documents (one or many
 * concatenated). The existing bson driver reads the whole file into
 * memory + walks the length prefixes; we reuse that approach for v1
 * since BSON files in practice are bounded (Mongo dumps are
 * typically <2 GB).
 *
 * Type fidelity (parquetjs-lite, no DECIMAL or nested STRUCTs):
 *
 *   BSON                  Parquet (this converter)
 *   ----                  ------------------------
 *   Double                DOUBLE
 *   String                UTF8
 *   Int32                 INT32
 *   Int64 / Long          INT64
 *   Decimal128            UTF8 (string, precision-preserving)  <- LOSSY type
 *   Boolean               BOOLEAN
 *   Date                  TIMESTAMP_MILLIS
 *   ObjectId              UTF8 (24-char hex)
 *   Binary                BYTE_ARRAY
 *   Embedded document     UTF8 (JSON-stringified)              <- LOSSY shape
 *   Array                 UTF8 (JSON-stringified)              <- LOSSY shape
 *   RegExp / Code         UTF8 (string-ified)
 *
 * Heterogeneous documents (some have field X, some don't) merge into
 * a union schema with all fields nullable. Schema inference samples
 * the first 1000 documents; rare fields appearing only beyond that
 * sample are dropped (typed as a schema warning).
 */

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

import { BSON, deserialize, ObjectId, Decimal128, Binary, Long } from 'bson';

const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parquet: any = _require('parquetjs-lite');

import { getLogger } from '../../../../shared/logger.js';
import { runDirectoryConvert } from './shared.js';
import type {
	ConvertDirectoryOpts,
	ConvertDirectoryResult,
	ConvertResult,
	FileConverter,
} from './types.js';

const log = getLogger('converter-bson');

// Schema inference uses up to this many docs.
const INFER_SAMPLE = 1000;

interface FieldKnowledge {
	readonly name: string;
	parquetType: string;
	optional: boolean;
	stringify: boolean;
}

function classifyValue(v: unknown): { type: string; stringify: boolean } {
	if (v === null || v === undefined) return { type: 'UTF8', stringify: false };
	if (typeof v === 'boolean') return { type: 'BOOLEAN', stringify: false };
	if (typeof v === 'string')  return { type: 'UTF8',    stringify: false };
	if (typeof v === 'number')  return Number.isInteger(v)
		? { type: 'INT64',  stringify: false }
		: { type: 'DOUBLE', stringify: false };
	if (typeof v === 'bigint')  return { type: 'INT64', stringify: false };
	if (v instanceof Date)      return { type: 'TIMESTAMP_MILLIS', stringify: false };
	if (v instanceof ObjectId)  return { type: 'UTF8', stringify: false };
	if (v instanceof Decimal128) return { type: 'UTF8', stringify: false };
	if (v instanceof Binary)    return { type: 'BYTE_ARRAY', stringify: false };
	if (v instanceof Long)      return { type: 'INT64', stringify: false };
	if (Array.isArray(v))       return { type: 'UTF8', stringify: true };
	if (typeof v === 'object')  return { type: 'UTF8', stringify: true };
	return { type: 'UTF8', stringify: false };
}

/** Merge two type observations -- type-promotion rules so e.g. INT64
 *  + DOUBLE collapse to DOUBLE rather than picking one. */
function mergeType(a: string, b: string): string {
	if (a === b) return a;
	// Numeric promotion
	if ((a === 'INT32' && b === 'INT64') || (b === 'INT32' && a === 'INT64')) return 'INT64';
	if ((a === 'INT64' && b === 'DOUBLE') || (b === 'INT64' && a === 'DOUBLE')) return 'DOUBLE';
	if ((a === 'INT32' && b === 'DOUBLE') || (b === 'INT32' && a === 'DOUBLE')) return 'DOUBLE';
	// Anything mixed with strings collapses to UTF8 (lossy).
	if (a === 'UTF8' || b === 'UTF8') return 'UTF8';
	return 'UTF8';
}

function serialiseValue(v: unknown, fm: FieldKnowledge): unknown {
	if (v === null || v === undefined) return null;
	if (fm.stringify) {
		try { return JSON.stringify(v, replacer); }
		catch { return null; }
	}
	if (v instanceof ObjectId)  return v.toHexString();
	if (v instanceof Decimal128) return v.toString();
	if (v instanceof Long)      return Number(v);
	if (v instanceof Date)      return v.getTime();
	if (v instanceof Binary)    return v.buffer;
	return v;
}

/** JSON.stringify replacer that handles BSON-specific types. */
function replacer(_key: string, v: unknown): unknown {
	if (v instanceof ObjectId)   return v.toHexString();
	if (v instanceof Decimal128) return v.toString();
	if (v instanceof Long)       return Number(v);
	if (v instanceof Date)       return v.toISOString();
	if (v instanceof Binary)     return Buffer.from(v.buffer).toString('base64');
	return v;
}

async function readDocs(path: string): Promise<Record<string, unknown>[]> {
	const buf = await readFile(path);
	const out: Record<string, unknown>[] = [];
	let off = 0;
	while (off + 4 <= buf.length) {
		const len = buf.readInt32LE(off);
		if (len < 5 || off + len > buf.length) break;
		const doc = deserialize(buf.subarray(off, off + len)) as Record<string, unknown>;
		out.push(doc);
		off += len;
	}
	return out;
}

class BsonConverter implements FileConverter {
	readonly kind = 'bson' as const;

	async convertFile(
		source: string,
		dest: string,
		_options?: Readonly<Record<string, unknown>>,
	): Promise<ConvertResult> {
		const t0 = Date.now();
		const docs = await readDocs(source);
		// Schema inference -- sample first INFER_SAMPLE docs, merge
		// observed field types.
		const fieldMap = new Map<string, FieldKnowledge>();
		const sample = docs.slice(0, INFER_SAMPLE);
		for (const doc of sample) {
			for (const [k, v] of Object.entries(doc)) {
				const cls = classifyValue(v);
				const existing = fieldMap.get(k);
				if (existing === undefined) {
					fieldMap.set(k, {
						name: k,
						parquetType: cls.type,
						optional: true,
						stringify: cls.stringify,
					});
				} else {
					existing.parquetType = mergeType(existing.parquetType, cls.type);
					existing.stringify = existing.stringify || cls.stringify;
				}
			}
		}

		if (fieldMap.size === 0) {
			// Empty BSON file -- write empty Parquet with a stub column.
			const emptySchema = new parquet.ParquetSchema({ _empty: { type: 'UTF8', optional: true } });
			const emptyWriter = await parquet.ParquetWriter.openFile(emptySchema, dest);
			await emptyWriter.close();
			return { destPath: dest, rowCount: 0, durationMs: Date.now() - t0 };
		}

		const schemaFields: Record<string, { type: string; optional: boolean }> = {};
		for (const fm of fieldMap.values()) {
			schemaFields[fm.name] = { type: fm.parquetType, optional: true };
		}
		const schema = new parquet.ParquetSchema(schemaFields);
		const writer = await parquet.ParquetWriter.openFile(schema, dest);
		for (const doc of docs) {
			const out: Record<string, unknown> = {};
			for (const fm of fieldMap.values()) {
				out[fm.name] = serialiseValue(doc[fm.name], fm);
			}
			await writer.appendRow(out);
		}
		await writer.close();
		log.debug({ source, dest, rowCount: docs.length, durationMs: Date.now() - t0 }, 'bson converted');
		return { destPath: dest, rowCount: docs.length, durationMs: Date.now() - t0 };
	}

	async convertDirectory(
		sourceDir: string,
		destDir: string,
		opts: ConvertDirectoryOpts,
		options?: Readonly<Record<string, unknown>>,
	): Promise<ConvertDirectoryResult> {
		return runDirectoryConvert(sourceDir, destDir, opts, this.kind, async (s, d) => {
			return this.convertFile(s, d, options);
		});
	}
}

void BSON;  // imported for completeness; replacer + ctor checks cover usage.
export const bsonConverter: FileConverter = new BsonConverter();
