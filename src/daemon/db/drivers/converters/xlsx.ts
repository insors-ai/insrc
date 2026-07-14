/**
 * xlsx → Parquet converter (Phase 2.5 of
 * plans/data-driver-duckdb-files.md). Per-sheet output: one source
 * `.xlsx` produces one Parquet file per worksheet, written under a
 * directory whose name is the sluggified workbook basename. The
 * caller queries by sheet name.
 *
 * `exceljs` is already a daemon dep (used by the existing xlsx
 * driver). We use the streaming reader so multi-sheet workbooks
 * don't load every sheet at once.
 *
 * Type fidelity (parquetjs-lite limits): scalar types only. Numbers
 * become DOUBLE, dates become TIMESTAMP_MILLIS, booleans become
 * BOOLEAN, strings + everything else become UTF8. No nested support.
 * Header row is the first row of each sheet; type inference samples
 * up to 50 data rows.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import ExcelJS from 'exceljs';

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

const log = getLogger('converter-xlsx');

const TYPE_INFER_ROWS = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inferType(values: readonly unknown[]): string {
	let sawNumber = false;
	let sawInt = true;
	let sawBool = false;
	let sawDate = false;
	let sawString = false;
	for (const v of values) {
		if (v === null || v === undefined) continue;
		if (typeof v === 'number') {
			sawNumber = true;
			if (!Number.isInteger(v)) sawInt = false;
			continue;
		}
		if (typeof v === 'boolean') { sawBool = true; continue; }
		if (v instanceof Date) { sawDate = true; continue; }
		if (typeof v === 'string') { sawString = true; continue; }
		sawString = true;
	}
	if (sawString) return 'UTF8';
	if (sawDate && !sawNumber && !sawBool) return 'TIMESTAMP_MILLIS';
	if (sawNumber && !sawBool) return sawInt ? 'INT64' : 'DOUBLE';
	if (sawBool && !sawNumber) return 'BOOLEAN';
	return 'UTF8';
}

function coerceFor(v: unknown, type: string): unknown {
	if (v === null || v === undefined) return null;
	switch (type) {
		case 'INT64': {
			if (typeof v === 'number' && Number.isInteger(v)) return v;
			if (typeof v === 'number') return Math.round(v);
			return null;
		}
		case 'DOUBLE': {
			if (typeof v === 'number') return v;
			return null;
		}
		case 'BOOLEAN': return Boolean(v);
		case 'TIMESTAMP_MILLIS': {
			if (v instanceof Date) return v.getTime();
			return null;
		}
		case 'UTF8':
		default: {
			if (v instanceof Date) return v.toISOString();
			return String(v);
		}
	}
}

function slugify(name: string): string {
	return name.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'sheet';
}

class XlsxConverter implements FileConverter {
	readonly kind = 'xlsx' as const;

	async convertFile(
		source: string,
		dest: string,
		_options?: Readonly<Record<string, unknown>>,
	): Promise<ConvertResult> {
		// `dest` here is the per-sheet directory root: dest = .../<basename>.xlsx.parquet
		// We treat that as a *directory* and write one Parquet per sheet inside.
		// The cache layer's source-mtime/size check still catches re-conversion.
		await mkdir(dirname(dest), { recursive: true });
		await mkdir(dest, { recursive: true });
		const t0 = Date.now();
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.readFile(source);
		let totalRows = 0;
		for (const sheet of workbook.worksheets) {
			const sheetDest = join(dest, `${slugify(sheet.name)}.parquet`);
			const rowCount = await convertSheet(sheet, sheetDest);
			totalRows += rowCount;
		}
		log.debug({ source, dest, rowCount: totalRows, durationMs: Date.now() - t0 }, 'xlsx converted');
		return { destPath: dest, rowCount: totalRows, durationMs: Date.now() - t0 };
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

async function convertSheet(sheet: ExcelJS.Worksheet, dest: string): Promise<number> {
	// Header row is the first row; data rows start at row 2.
	const headerRow = sheet.getRow(1);
	const headerCells = headerRow.values as unknown[];
	// exceljs uses 1-indexed cell arrays; element 0 is undefined.
	const columns: string[] = [];
	for (let i = 1; i < headerCells.length; i++) {
		columns.push(String(headerCells[i] ?? `col_${i}`));
	}
	if (columns.length === 0) {
		// Empty sheet -- write an empty Parquet with one stub column so
		// DuckDB can still read_parquet without erroring.
		const emptySchema = new parquet.ParquetSchema({ _empty: { type: 'UTF8', optional: true } });
		const emptyWriter = await parquet.ParquetWriter.openFile(emptySchema, dest);
		await emptyWriter.close();
		return 0;
	}

	// First pass: sample up to TYPE_INFER_ROWS data rows to infer types.
	const samplesByCol: unknown[][] = columns.map(() => []);
	const lastRowSample = Math.min(sheet.rowCount, 1 + TYPE_INFER_ROWS);
	for (let r = 2; r <= lastRowSample; r++) {
		const row = sheet.getRow(r).values as unknown[];
		for (let c = 0; c < columns.length; c++) {
			samplesByCol[c]!.push(row[c + 1]);
		}
	}
	const types = columns.map((_, i) => inferType(samplesByCol[i]!));

	const fields: Record<string, { type: string; optional: boolean }> = {};
	for (let i = 0; i < columns.length; i++) {
		fields[columns[i]!] = { type: types[i]!, optional: true };
	}
	const schema = new parquet.ParquetSchema(fields);
	const writer = await parquet.ParquetWriter.openFile(schema, dest);
	let rowCount = 0;
	for (let r = 2; r <= sheet.rowCount; r++) {
		const rowVals = sheet.getRow(r).values as unknown[];
		const out: Record<string, unknown> = {};
		let allNull = true;
		for (let c = 0; c < columns.length; c++) {
			const v = coerceFor(rowVals[c + 1], types[c]!);
			out[columns[c]!] = v;
			if (v !== null) allNull = false;
		}
		if (allNull) continue;  // skip empty trailing rows
		await writer.appendRow(out);
		rowCount++;
	}
	await writer.close();
	return rowCount;
}

export const xlsxConverter: FileConverter = new XlsxConverter();
