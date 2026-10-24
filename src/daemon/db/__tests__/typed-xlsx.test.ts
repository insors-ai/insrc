import { assertParquetSchema } from './fixtures/assert-parquet-schema.js';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { DuckDBInstance } from '@duckdb/node-api';
import { xlsxConverter } from '../drivers/converters/xlsx.js';
import { BoundedWorkbook } from '../drivers/converters/xlsx-reader.js';
import { BoundedZip } from '../drivers/converters/bounded-zip.js';
import { DecoderBudget } from '../drivers/converters/decoder-budget.js';
import type { MemoryRowSource } from '../drivers/converters/types.js';
async function fixture(use: (dir: string) => Promise<void>): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), 'cm-typed-xlsx-'));
	try {
		await use(dir);
	}
	finally {
		await rm(dir, { recursive: true, force: true });
	}
}
async function rows(source: MemoryRowSource, target?: string): Promise<Record<string, unknown>[]> {
	const result = [];
	for await (const batch of source.batches(target))
		result.push(...batch.rows.map(row => ({ ...row })));
	return result;
}
async function saved(path: string, timestampColumns: string[] = []): Promise<Record<string, unknown>[]> {
	const db = await DuckDBInstance.create(':memory:'), connection = await db.connect();
	try {
		const columns = (await connection.runAndReadAll('DESCRIBE SELECT * FROM read_parquet(?)', [path])).getRowObjectsJS().map(c => String(c.column_name));
		const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
		const projection = columns.map(c => timestampColumns.includes(c) ? `epoch_ms(${quote(c)}) AS ${quote(c)}` : quote(c)).join(',');
		return (await connection.runAndReadAll(`SELECT ${projection} FROM read_parquet(?)`, [path])).getRowObjectsJS().map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
	}
	finally {
		connection.closeSync();
		db.closeSync();
	}
}
test('CM-S1-W: XLSX sheet names legacy slugs dates shared strings formula normalization and saved rows have complete typed parity', async () => {
	await fixture(async (dir) => {
		const workbook = new ExcelJS.Workbook();
		workbook.properties.date1904 = true;
		const a = workbook.addWorksheet('Sales Q1');
		a.addRow(['id', 'label', 'when', 'flag', 'formula', 'rich']);
		a.addRow([1, 'shared value', new Date('2026-01-01T00:00:00Z'), true, { formula: '1+2', result: 3 }, { richText: [{ text: 'rich value' }] }]);
		a.getCell('C2').numFmt = 'yyyy-mm-dd';
		a.addRow([2, 'shared value', new Date('2026-02-02T00:00:00Z'), false, { formula: '1+3', result: 4 }, 'plain']);
		a.getCell('C3').numFmt = 'yyyy-mm-dd';
		const b = workbook.addWorksheet('Other Sheet');
		b.addRow(['other']);
		b.addRow(['independent schema']);
		const path = join(dir, 'book.xlsx'), dest = join(dir, 'saved');
		await workbook.xlsx.writeFile(path);
		const budget = new DecoderBudget(64 * 1024 * 1024), source = await xlsxConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget });
		try {
			const catalog = await source.targets();
			assert.deepEqual(catalog.map(t => [t.worksheetName, t.worksheetSlug]), [['Sales Q1', 'Sales_Q1'], ['Other Sheet', 'Other_Sheet']]);
			const schema = (await source.describe('Sales Q1'))[0]!;
			assert.deepEqual(schema.columns.map(c => c.physicalType), ['INT64', 'UTF8', 'TIMESTAMP_MILLIS', 'BOOLEAN', 'UTF8', 'UTF8']);
			const memory = await rows(source, 'Sales_Q1');
			assert.deepEqual(memory, [
				{ id: 1, label: 'shared value', when: Date.parse('2026-01-01Z'), flag: true, formula: '[object Object]', rich: '[object Object]' },
				{ id: 2, label: 'shared value', when: Date.parse('2026-02-02Z'), flag: false, formula: '[object Object]', rich: 'plain' },
			]);
			assert.deepEqual(await rows(source, 'Sales Q1'), memory);
			assert.deepEqual((await source.describe('Other_Sheet'))[0]!.columns.map(c => c.name), ['other']);
			assert.deepEqual((await source.describe('Sales_Q1'))[0]!.columns.map(c => c.name), ['id', 'label', 'when', 'flag', 'formula', 'rich']);
			await assert.rejects(source.describe('unknown'), /Unknown/);
			await assert.rejects(rows(source, 'unknown'), /Unknown/);
			await assert.rejects(source.describe(), /Incompatible/);
			await assert.rejects(rows(source), /Incompatible/);
			assert.equal((await xlsxConverter.convertFile(path, dest)).rowCount, 3);
			for (const target of await source.targets())
				await assertParquetSchema(join(dest, target.worksheetSlug! + '.parquet'), target.columns);
			assert.deepEqual(await saved(join(dest, 'Sales_Q1.parquet'), ['when']), memory);
			assert.deepEqual(await saved(join(dest, 'Other_Sheet.parquet')), await rows(source, 'Other Sheet'));
		}
		finally {
			await source.close();
		}
		assert.equal(budget.snapshot().retained, 0);
	});
});
test('CM-S1-W: XLSX empty and all-null worksheets keep declared stub/header schemas with zero rows', async () => {
	await fixture(async (dir) => {
		const workbook = new ExcelJS.Workbook();
		workbook.addWorksheet('Empty');
		const allNull = workbook.addWorksheet('All Null');
		allNull.addRow(['a', 'b']);
		allNull.addRow([null, null]);
		const path = join(dir, 'empty.xlsx'), dest = join(dir, 'saved');
		await workbook.xlsx.writeFile(path);
		const source = await xlsxConverter.openMemory!(path, { memoryBudgetBytes: 64 * 1024 * 1024 });
		try {
			assert.deepEqual((await source.describe('Empty'))[0]!.columns.map(c => [c.name, c.physicalType, c.nullable]), [['_empty', 'UTF8', true]]);
			assert.deepEqual((await source.describe('All Null'))[0]!.columns.map(c => [c.name, c.physicalType, c.nullable]), [['a', 'UTF8', true], ['b', 'UTF8', true]]);
			assert.deepEqual(await rows(source, 'Empty'), []);
			assert.deepEqual(await rows(source, 'All_Null'), []);
			assert.equal((await xlsxConverter.convertFile(path, dest)).rowCount, 0);
			for (const target of await source.targets()) await assertParquetSchema(join(dest,target.worksheetSlug!+'.parquet'),target.columns);
			assert.deepEqual(await saved(join(dest, 'Empty.parquet')), []);
			assert.deepEqual(await saved(join(dest, 'All_Null.parquet')), []);
		}
		finally {
			await source.close();
		}
	});
});
test('CM-S1-W: XLSX compatible no-target union merged headers fallback names and hyperlinks retain saved semantics', async () => {
	await fixture(async (dir) => {
		const workbook = new ExcelJS.Workbook(), a = workbook.addWorksheet('First'), b = workbook.addWorksheet('Second');
		a.addRow(['a', null, 'c']);
		a.addRow([1, 'merged', { text: 'site', hyperlink: 'https://example.test' }]);
		a.mergeCells('B2:B3');
		a.getCell('A3').value = 2;
		b.addRow(['a', 'col_2', 'c']);
		b.addRow([3, 'tail', 'text']);
		const path = join(dir, 'merge.xlsx'), dest = join(dir, 'saved');
		await workbook.xlsx.writeFile(path);
		const source = await xlsxConverter.openMemory!(path, { memoryBudgetBytes: 64 * 1024 * 1024 });
		try {
			const first = await rows(source, 'First');
			assert.deepEqual(first, [{ a: 1, col_2: 'merged', c: '[object Object]' }, { a: 2, col_2: 'merged', c: null }]);
			assert.deepEqual(await rows(source), [...first, { a: 3, col_2: 'tail', c: 'text' }]);
			await xlsxConverter.convertFile(path, dest);
			for (const target of await source.targets())
				await assertParquetSchema(join(dest, target.worksheetSlug! + '.parquet'), target.columns);
			assert.deepEqual(await saved(join(dest, 'First.parquet')), first);
		}
		finally {
			await source.close();
		}
	});
});
test('CM-S1-S: XLSX retained shared-string tables fail cumulative admission and source close clears parser tables', async () => {
	await fixture(async (dir) => {
		const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Data');
		sheet.addRow(['label']);
		for (let i = 0; i < 2000; i++)
			sheet.addRow([`${i}:` + 'x'.repeat(100)]);
		const path = join(dir, 'strings.xlsx');
		await workbook.xlsx.writeFile(path);
		const probe = await BoundedZip.open(path, new DecoderBudget(64 * 1024 * 1024));
		const xmlBytes = probe.entries.find(entry => entry.name === 'xl/sharedStrings.xml')!.expanded;
		await probe.close();
		// Admit the XML parser itself, then exhaust capacity while retaining
		// actual string-table entries. The close spy proves which phase failed.
		const budget = new DecoderBudget(xmlBytes * 5 + 256 * 1024 + 64 * 1024);
		const closed: {
			owner: BoundedWorkbook;
			strings: number;
			sheets: number;
		}[] = [];
		const original = BoundedWorkbook.prototype.close;
		const spy = mock.method(BoundedWorkbook.prototype, 'close', async function (this: BoundedWorkbook) {
			closed.push({ owner: this, strings: this.strings.length, sheets: this.sheets.length });
			await original.call(this);
		});
		try {
			await assert.rejects(xlsxConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget }), /resource-limit/);
			assert(closed[0]!.strings > 0 && closed[0]!.strings < 2001, 'failure occurs after shared-string callbacks retained entries');
			assert.equal(budget.snapshot().retained, 0);
			const sufficient = new DecoderBudget(64 * 1024 * 1024), source = await xlsxConverter.openMemory!(path, { memoryBudgetBytes: sufficient.limit, budget: sufficient });
			const iterator = source.batches('Data')[Symbol.asyncIterator]();
			await iterator.next();
			await source.close();
			assert.equal(sufficient.snapshot().retained, 0);
			await assert.rejects(iterator.next(), /closed/);
			assert(closed.some(record => record.strings === 2001), 'also observes the full retained table on normal source close');
			for (const record of closed) {
				assert.equal(record.owner.strings.length, 0);
				assert.equal(record.owner.dateStyles.length, 0);
				assert.equal(record.owner.sheets.length, 0);
			}
		}
		finally {
			spy.mock.restore();
		}
	});
});
test('CM-S1-W: directory XLSX conversion preserves all worksheets through its returned recursive Parquet glob', async () => {
	await fixture(async (dir) => {
		const { mkdir } = await import('node:fs/promises');
		const input = join(dir, 'input'), output = join(dir, 'output');
		await mkdir(input);
		for (const name of ['a', 'b']) {
			const book = new ExcelJS.Workbook();
			for (const sheetName of ['One', 'Two']) {
				const sheet = book.addWorksheet(sheetName);
				sheet.addRow(['value']);
				sheet.addRow([name + sheetName]);
			}
			await book.xlsx.writeFile(join(input, name + '.xlsx'));
		}
		const result = await xlsxConverter.convertDirectory(input, output, { recursive: false });
		assert.equal(result.sourceCount, 2);
		const values = await saved(result.parquetGlob);
		assert.deepEqual(values.map(r => r.value).sort(), ['aOne', 'aTwo', 'bOne', 'bTwo']);
	});
});
