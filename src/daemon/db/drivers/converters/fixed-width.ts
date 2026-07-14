/**
 * fixed-width → Parquet converter (Phase 2.4 of
 * plans/data-driver-duckdb-files.md).
 *
 * Reads a fixed-width text file according to the connection's
 * `options.columns: { name, start, length, type }[]` spec and emits
 * one Parquet row per source line. Trivial: no schema inference, no
 * type inference, no nested structures -- the spec carries
 * everything needed.
 *
 * Lossy mappings (parquetjs-lite limits): all fields are scalars;
 * the spec doesn't allow nested groups in the source format, so
 * there's nothing to lose.
 */

import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';

// parquetjs-lite is CJS; ESM import resolution can't see its named
// exports. Same trick as `daemon/db/drivers/parquet.ts`.
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

const log = getLogger('converter-fixed-width');

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
	if (!Array.isArray(rawCols) || rawCols.length === 0) {
		throw new Error('converter-fixed-width: options.columns required');
	}
	const columns: ColumnSpec[] = rawCols.map((c, i) => {
		const spec = c as ColumnSpec;
		if (
			c === null || typeof c !== 'object'
			|| typeof spec.name !== 'string'
			|| typeof spec.start !== 'number'
			|| typeof spec.length !== 'number'
			|| typeof spec.type !== 'string'
		) {
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

/** Map our ColumnSpec types onto parquetjs-lite's primitive types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSchema(columns: readonly ColumnSpec[]): any {
	// All columns are optional (nullable=true); the source line might
	// be shorter than `start + length`, in which case we emit null.
	const fields: Record<string, { type: string; optional: boolean }> = {};
	for (const c of columns) {
		fields[c.name] = {
			type: parquetTypeFor(c.type),
			optional: true,
		};
	}
	return new parquet.ParquetSchema(fields);
}

function parquetTypeFor(t: ColumnSpec['type']): string {
	switch (t) {
		case 'string':  return 'UTF8';
		case 'integer': return 'INT64';
		case 'number':  return 'DOUBLE';
		case 'boolean': return 'BOOLEAN';
	}
}

function sliceField(line: string, c: ColumnSpec, trim: boolean): unknown {
	const raw = line.slice(c.start, c.start + c.length);
	const v = trim ? raw.trim() : raw;
	if (v === '') return null;
	switch (c.type) {
		case 'string':  return v;
		case 'integer': {
			const n = Number.parseInt(v, 10);
			return Number.isFinite(n) ? n : null;
		}
		case 'number': {
			const n = Number(v);
			return Number.isFinite(n) ? n : null;
		}
		case 'boolean': {
			const lower = v.toLowerCase();
			if (lower === 'true' || lower === 't' || lower === 'y' || lower === '1') return true;
			if (lower === 'false' || lower === 'f' || lower === 'n' || lower === '0') return false;
			return null;
		}
	}
}

class FixedWidthConverter implements FileConverter {
	readonly kind = 'fixed-width' as const;

	async convertFile(
		source: string,
		dest: string,
		options?: Readonly<Record<string, unknown>>,
	): Promise<ConvertResult> {
		const opts = readOpts(options);
		const schema = buildSchema(opts.columns);
		const t0 = Date.now();
		const writer = await parquet.ParquetWriter.openFile(schema, dest);
		let rowCount = 0;
		const rl = createInterface({
			input: createReadStream(source, { encoding: opts.encoding }),
			crlfDelay: Infinity,
		});
		let first = true;
		for await (const line of rl) {
			if (first && opts.skipFirstLine) { first = false; continue; }
			first = false;
			const row: Record<string, unknown> = {};
			for (const c of opts.columns) {
				row[c.name] = sliceField(line, c, opts.trim);
			}
			await writer.appendRow(row);
			rowCount++;
		}
		await writer.close();
		log.debug({ source, dest, rowCount, durationMs: Date.now() - t0 }, 'fixed-width converted');
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

export const fixedWidthConverter: FileConverter = new FixedWidthConverter();
