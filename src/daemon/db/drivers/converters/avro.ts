/**
 * avro → Parquet converter (Phase 2.2 of
 * plans/data-driver-duckdb-files.md).
 *
 * Type fidelity (parquetjs-lite, no DECIMAL or nested STRUCTs):
 *
 *   Avro            Parquet (this converter)
 *   ----            ------------------------
 *   null            -- (handled via optional)
 *   boolean         BOOLEAN
 *   int             INT32
 *   long            INT64
 *   float           FLOAT
 *   double          DOUBLE
 *   bytes           BYTE_ARRAY
 *   string          UTF8
 *   record          UTF8 (JSON-stringified)    <- LOSSY
 *   enum            UTF8
 *   array           UTF8 (JSON-stringified)    <- LOSSY
 *   map             UTF8 (JSON-stringified)    <- LOSSY
 *   union           if [null, T]: optional T
 *                   else: UTF8 (JSON-stringified)  <- LOSSY
 *   fixed           BYTE_ARRAY
 *
 * The lossy nested mappings keep the row queryable (DuckDB can still
 * project / count / sample) while preserving textual fidelity. A
 * follow-up using `@dsnp/parquetjs` (broader type support, including
 * nested groups + DECIMAL128) is the natural upgrade if a Family-5
 * skill ever needs typed nested aggregation. Tracked in plan 2.6.
 */

import { createRequire } from 'node:module';
import avsc from 'avsc';

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

const log = getLogger('converter-avro');

interface AvroFieldMap {
	readonly name: string;
	readonly parquetType: string;
	readonly optional: boolean;
	readonly stringify: boolean;     // true => JSON.stringify on write
}

/**
 * Decompose one Avro union arm into the underlying type + a
 * nullability flag. `[null, T]` and `[T, null]` collapse to "T,
 * optional"; wider unions fall back to JSON-stringification.
 */
function classifyType(t: avsc.Type): { type: string; optional: boolean; stringify: boolean } {
	const typeName = t.typeName;
	switch (typeName) {
		case 'boolean': return { type: 'BOOLEAN', optional: false, stringify: false };
		case 'int':     return { type: 'INT32',   optional: false, stringify: false };
		case 'long':    return { type: 'INT64',   optional: false, stringify: false };
		case 'float':   return { type: 'FLOAT',   optional: false, stringify: false };
		case 'double':  return { type: 'DOUBLE',  optional: false, stringify: false };
		case 'string':  return { type: 'UTF8',    optional: false, stringify: false };
		case 'bytes':
		case 'fixed':   return { type: 'BYTE_ARRAY', optional: false, stringify: false };
		case 'enum':    return { type: 'UTF8', optional: false, stringify: false };
		case 'record':
		case 'array':
		case 'map':     return { type: 'UTF8', optional: true, stringify: true };
		case 'union': {
			// Inspect the union's constituent types via avsc's API.
			const types = (t as unknown as { types: avsc.Type[] }).types;
			const nonNull = types.filter(x => x.typeName !== 'null');
			const nullable = types.length !== nonNull.length;
			if (nonNull.length === 1) {
				const inner = classifyType(nonNull[0]!);
				return { type: inner.type, optional: nullable || inner.optional, stringify: inner.stringify };
			}
			return { type: 'UTF8', optional: true, stringify: true };
		}
		default: return { type: 'UTF8', optional: true, stringify: true };
	}
}

/** Promise-style first-schema read from a file decoder. */
async function firstSchemaFromDecoder(decoder: avsc.streams.BlockDecoder): Promise<avsc.Type> {
	return new Promise<avsc.Type>((resolve, reject) => {
		decoder.once('metadata', (writerType: avsc.Type) => resolve(writerType));
		decoder.once('error', reject);
	});
}

class AvroConverter implements FileConverter {
	readonly kind = 'avro' as const;

	async convertFile(
		source: string,
		dest: string,
		_options?: Readonly<Record<string, unknown>>,
	): Promise<ConvertResult> {
		const t0 = Date.now();
		const decoder = avsc.createFileDecoder(source);
		const headerType = await firstSchemaFromDecoder(decoder);
		if (headerType.typeName !== 'record') {
			throw new Error(`converter-avro: top-level schema must be a record, got '${headerType.typeName}'`);
		}
		const fields = (headerType as unknown as { fields: { name: string; type: avsc.Type }[] }).fields;

		const fieldMap: AvroFieldMap[] = fields.map(f => {
			const cls = classifyType(f.type);
			return { name: f.name, parquetType: cls.type, optional: cls.optional || true, stringify: cls.stringify };
		});

		const schemaFields: Record<string, { type: string; optional: boolean }> = {};
		for (const fm of fieldMap) {
			schemaFields[fm.name] = { type: fm.parquetType, optional: fm.optional };
		}
		const schema = new parquet.ParquetSchema(schemaFields);
		const writer = await parquet.ParquetWriter.openFile(schema, dest);
		let rowCount = 0;
		for await (const record of decoder) {
			const out: Record<string, unknown> = {};
			for (const fm of fieldMap) {
				const v = (record as Record<string, unknown>)[fm.name];
				out[fm.name] = serialiseValue(v, fm);
			}
			await writer.appendRow(out);
			rowCount++;
		}
		await writer.close();
		log.debug({ source, dest, rowCount, durationMs: Date.now() - t0 }, 'avro converted');
		return { destPath: dest, rowCount, durationMs: Date.now() - t0 };
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

function serialiseValue(v: unknown, fm: AvroFieldMap): unknown {
	if (v === null || v === undefined) return null;
	if (fm.stringify) {
		try { return JSON.stringify(v); }
		catch { return null; }
	}
	if (fm.parquetType === 'BYTE_ARRAY') {
		if (Buffer.isBuffer(v)) return v;
		if (v instanceof Uint8Array) return Buffer.from(v);
		return Buffer.from(String(v));
	}
	return v;
}

export const avroConverter: FileConverter = new AvroConverter();
