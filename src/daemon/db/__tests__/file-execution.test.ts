import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, readFile, stat, rm, mkdir, chmod, realpath } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { serialize as bson, Long } from 'bson';
import ExcelJS from 'exceljs';
import { MemoryFileExecution } from '../file-execution.js';
import { bsonConverter } from '../drivers/converters/bson.js';
import { deflateRawSync } from 'node:zlib';
import { avroConverter } from '../drivers/converters/avro.js';
import { fixedWidthConverter } from '../drivers/converters/fixed-width.js';
import { xlsxConverter } from '../drivers/converters/xlsx.js';
import { createTypedRowSource } from '../drivers/converters/typed-row-source.js';
import { BoundedZip } from '../drivers/converters/bounded-zip.js';
import { DecoderBudget } from '../drivers/converters/decoder-budget.js';
import { convertedColumn } from '../drivers/converters/normalization.js';
import type { FileExecutionPolicy, MemoryRowSource } from '../../../shared/connection-management.js';
function policy(root: string): FileExecutionPolicy {
	return { identity: { lookupRoot: root, ownerId: 'owner', connectionId: 'fixture', revision: 'revision', sourceIdentity: 'source', converterOptionsDigest: 'options' }, persistence: 'memory-only', memoryBudgetBytes: 64 * 1024 * 1024, allowSpill: false };
}
async function fixture(use: (dir: string) => Promise<void>): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), 'cm-execution-'));
	try {
		await use(dir);
	}
	finally {
		await rm(dir, { recursive: true, force: true });
	}
}
async function snapshot(dir: string): Promise<Record<string, string>> {
	const result: Record<string, string> = {};
	for (const path of await readdir(dir, { recursive: true })) {
		try {
			result[path] = String((await stat(join(dir, path), { bigint: true })).mtimeNs) + ':' + (await readFile(join(dir, path))).toString('base64');
		}
		catch {
		}
	}
	return result;
}
async function query(resource: MemoryFileExecution, target?: string): Promise<Record<string, unknown>[]> {
	const table = await resource.table(target);
	return resource.withConnection(async (connection) => (await connection.runAndReadAll('SELECT * FROM query_table(?)', [table])).getRowObjectsJS().map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]))));
}
test('CM-S1-H: native CSV JSON JSONL and Parquet private resources read complete isolated tables without file writes installs or source-path errors', async () => {
	await fixture(async (dir) => {
		const csv = join(dir, 'private-source.csv'), json = join(dir, 'private-source.json'), jsonl = join(dir, 'private-source.jsonl'), parquet = join(dir, 'private-source.parquet');
		await writeFile(csv, 'id,label\n1,first\n2,second\n');
		await writeFile(json, JSON.stringify([{ id: 1, label: 'first' }, { id: 2, label: 'second' }]));
		await writeFile(jsonl, '{"id":1,"label":"first"}\n{"id":2,"label":"second"}\n');
		const setup = await DuckDBInstance.create(':memory:'), connection = await setup.connect();
		try {
			await connection.run('COPY (SELECT 1 AS id, \'first\' AS label UNION ALL SELECT 2,\'second\') TO ? (FORMAT PARQUET)', [parquet]);
		}
		finally {
			connection.closeSync();
			setup.closeSync();
		}
		const before = await snapshot(dir), events: string[] = [], statements: string[] = [];
		const watcher = watch(dir, { recursive: true }, (_type, name) => events.push(String(name)));
		const original = DuckDBConnection.prototype.run;
		const spy = mock.method(DuckDBConnection.prototype, 'run', function (this: DuckDBConnection, sql: string, ...args: unknown[]) {
			statements.push(sql);
			return original.call(this, sql, ...args as [
			]);
		});
		try {
			for (const [kind, path] of [['csv', csv], ['json', json], ['jsonl', jsonl], ['parquet', parquet]] as const) {
				const resource = await MemoryFileExecution.open(policy(dir), { nativePaths: [path] });
				try {
					await resource.loadNative({ kind, paths: [path], ...(kind === 'csv' ? { header: true } : {}) });
					assert.deepEqual(await query(resource), [{ id: 1, label: 'first' }, { id: 2, label: 'second' }]);
					assert.ok(resource.diagnostics.tables > 0);
					if (kind === 'csv')
						await assert.rejects(resource.withConnection(c => c.runAndReadAll('SELECT * FROM read_json_auto(?)', [json])), error => error instanceof Error && !error.message.includes(dir));
				}
				finally {
					await resource.close();
				}
				assert.deepEqual(resource.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
			}
			assert.ok(statements.every(sql => !/^\s*INSTALL\b/i.test(sql)));
			assert.ok(statements.includes('SET enable_external_access = false'));
			const bad = join(dir, 'missing-secret-name.json');
			await assert.rejects(MemoryFileExecution.open(policy(dir), { nativePaths: [bad] }), error => error instanceof Error && !error.message.includes(dir) && !error.message.includes('missing-secret-name'));
			await delay(20);
			assert.ok(events.every(name => Object.hasOwn(before, name)), JSON.stringify(events));
			assert.deepEqual(await snapshot(dir), before);
		}
		finally {
			spy.mock.restore();
			watcher.close();
		}
	});
});
test('CM-S1-H: BSON and XLSX rows use private typed tables with precise values target isolation and zero cache sidecars', async () => {
	await fixture(async (dir) => {
		const bsonPath = join(dir, 'source.bson');
		await writeFile(bsonPath, bson({ id: Long.fromString('9007199254740993'), when: new Date('2026-01-01Z') }));
		const book = new ExcelJS.Workbook(), a = book.addWorksheet('First Sheet'), b = book.addWorksheet('Other');
		a.addRow(['value']);
		a.addRow(['first']);
		b.addRow(['different']);
		b.addRow([2]);
		const xlsx = join(dir, 'source.xlsx');
		await book.xlsx.writeFile(xlsx);
		const before = await snapshot(dir);
		for (const [converter, path] of [[bsonConverter, bsonPath], [xlsxConverter, xlsx]] as const) {
			const resource = await MemoryFileExecution.open(policy(dir));
			try {
				await resource.loadRows((budget, signal) => converter.openMemory!(path, { memoryBudgetBytes: resource.policy.memoryBudgetBytes, budget, signal }));
				if (converter === bsonConverter) {
					const table = await resource.table();
					const rows = await resource.withConnection(async (c) => (await c.runAndReadAll('SELECT id,epoch_ms("when") AS stamp FROM query_table(?)', [table])).getRowObjectsJS());
					assert.equal(rows[0]?.id, '9007199254740993');
					assert.equal(Number(rows[0]?.stamp), Date.parse('2026-01-01Z'));
				}
				else {
					assert.deepEqual(await query(resource, 'First_Sheet'), [{ value: 'first' }]);
					assert.deepEqual(await query(resource, 'Other'), [{ different: 2 }]);
					assert.deepEqual(await query(resource, 'First Sheet'), [{ value: 'first' }]);
					await assert.rejects(resource.table(), /Incompatible/);
					await assert.rejects(resource.table('unknown'), /Unknown/);
				}
			}
			finally {
				await resource.close();
			}
			assert.equal(resource.diagnostics.decodedBytes, 0);
			assert.equal(resource.diagnostics.tables, 0);
		}
		assert.deepEqual(await snapshot(dir), before);
	});
});
test('CM-S1-H: typed empty and all-null tables preserve declared types and nullability before the first batch', async () => {
	await fixture(async (dir) => {
		for (const allNull of [false, true]) {
			const resource = await MemoryFileExecution.open(policy(dir)), columns = [convertedColumn('integer', 'INT32', allNull), convertedColumn('nullable', 'DOUBLE', true)];
			try {
				await resource.loadRows(async (budget) => createTypedRowSource([{ target: { targetId: 'typed', sourceIdentity: 'source', columns }, async *rows() {
							if (allNull)
								yield { integer: null, nullable: null };
						}, normalize: r => r }], { memoryBudgetBytes: budget.limit, budget }));
				assert.deepEqual(await query(resource), allNull ? [{ integer: null, nullable: null }] : []);
				const table = await resource.table(), schema = await resource.withConnection(async (c) => (await c.runAndReadAll('DESCRIBE SELECT * FROM query_table(?)', [table])).getRowObjectsJS());
				assert.deepEqual(schema.map(r => [r.column_name, r.column_type, r.null]), [['integer', 'INTEGER', allNull ? 'YES' : 'NO'], ['nullable', 'DOUBLE', 'YES']]);
			}
			finally {
				await resource.close();
			}
		}
	});
});
test('CM-S1-S: schema mismatches and decoder admission failures close partial tables native handles and retained budgets', async () => {
	await fixture(async (dir) => {
		for (const failure of ['schema', 'budget', 'bson', 'fixed-width', 'avro', 'xlsx'] as const) {
			let executionPolicy = policy(dir);
			const xlsxPath = join(dir, 'shared-strings.xlsx');
			if (failure === 'xlsx') {
				const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Data');
				sheet.addRow(['label']);
				for (let i = 0; i < 2000; i++)
					sheet.addRow([i + ':' + 'x'.repeat(100)]);
				await workbook.xlsx.writeFile(xlsxPath);
				const probe = await BoundedZip.open(xlsxPath, new DecoderBudget(64 * 1024 * 1024));
				const expanded = probe.entries.find(entry => entry.name === 'xl/sharedStrings.xml')!.expanded;
				await probe.close();
				executionPolicy = { ...executionPolicy, memoryBudgetBytes: expanded * 5 + 256 * 1024 + 64 * 1024 };
			}
			const resource = await MemoryFileExecution.open(executionPolicy);
			let sourceClosed = 0;
			if (failure === 'xlsx') {
				await assert.rejects(resource.loadRows((budget, signal) => xlsxConverter.openMemory!(xlsxPath, { memoryBudgetBytes: budget.limit, budget, signal })), /resource-limit/);
			}
			else if (failure === 'avro') {
				const long = (n: number) => {
					let value = n * 2;
					const bytes = [];
					while (value >= 128) {
						bytes.push((value & 127) | 128);
						value = Math.floor(value / 128);
					}
					bytes.push(value);
					return Buffer.from(bytes);
				};
				const text = (value: string) => {
					const bytes = Buffer.from(value);
					return Buffer.concat([long(bytes.length), bytes]);
				};
				const sync = Buffer.alloc(16, 7), compressed = deflateRawSync(Buffer.alloc(8 * 1024 * 1024 + 1));
				const header = Buffer.concat([Buffer.from([79, 98, 106, 1]), long(2), text('avro.schema'), text(JSON.stringify({ type: 'record', name: 'Oversized', fields: [{ name: 'value', type: 'bytes' }] })), text('avro.codec'), text('deflate'), long(0), sync]);
				const path = join(dir, 'expansion.avro');
				await writeFile(path, Buffer.concat([header, long(1), long(compressed.length), compressed, sync]));
				await assert.rejects(resource.loadRows((budget, signal) => avroConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget, signal })), /resource-limit/);
			}
			else if (failure === 'fixed-width') {
				const path = join(dir, 'giant.txt');
				await writeFile(path, 'x'.repeat(128 * 1024));
				await assert.rejects(resource.loadRows((budget, signal) => fixedWidthConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget, signal }, { columns: [{ name: 'value', start: 0, length: 1, type: 'string' }] })), /resource-limit/);
			}
			else if (failure === 'bson') {
				const path = join(dir, 'bad.bson'), header = Buffer.alloc(4);
				header.writeInt32LE(0x7fffffff);
				await writeFile(path, header);
				await assert.rejects(resource.loadRows((budget, signal) => bsonConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget, signal })), /resource-limit/);
			}
			else {
				const target = { targetId: 'data', sourceIdentity: 'source', columns: [convertedColumn('value', 'UTF8')] };
				const source: MemoryRowSource = { async targets() {
						return [target];
					}, async describe() {
						return [target];
					}, async *batches() {
						yield { targetId: 'data', schemaVersion: failure === 'schema' ? 'wrong' : (await import('../drivers/converters/typed-row-source.js')).schemaVersion(target), rows: [{ value: failure === 'budget' ? 'x'.repeat(64 * 1024 * 1024) : 'value' }], byteSize: 1 };
					}, async close() {
						sourceClosed++;
					} };
				await assert.rejects(resource.loadRows(async () => source), /schema version|resource-limit/);
				assert.equal(sourceClosed, 1);
			}
			assert.deepEqual(resource.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 }, 'rejection itself disposes the private DB before caller cleanup');
			await resource.close();
			assert.deepEqual(resource.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
		}
	});
});
test('CM-S1-H: query admission rejects writes multi-statements and unapproved sources while close waits for actual use', async () => {
	await fixture(async (dir) => {
		const resource = await MemoryFileExecution.open(policy(dir));
		await resource.loadRows(async () => createTypedRowSource([{ target: { targetId: 'data', sourceIdentity: 'source', columns: [convertedColumn('value', 'INT32')] }, async *rows() {
					yield { value: 1 };
				}, normalize: r => r }], { memoryBudgetBytes: policy(dir).memoryBudgetBytes }));
		try {
			for (const sql of ['COPY (SELECT 1) TO \'/tmp/forbidden\'', 'ATTACH \'/tmp/forbidden\'', 'INSTALL httpfs', 'SET memory_limit=\'1TB\'', 'SELECT 1; SELECT 2'])
				await assert.rejects(resource.withConnection(c => c.runAndReadAll(sql)));
			let release!: () => void, started!: () => void;
			const gate = new Promise<void>(r => release = r), ready = new Promise<void>(r => started = r);
			const work = resource.withConnection(async () => {
				started();
				await gate;
				return 7;
			});
			await ready;
			let closed = false;
			const closing = resource.close().then(() => {
				closed = true;
			});
			await delay(5);
			assert.equal(closed, false);
			assert.equal(resource.diagnostics.operations, 1);
			release();
			assert.equal(await work, 7);
			await closing;
			assert.equal(resource.diagnostics.connections, 0);
		}
		finally {
			await resource.close();
		}
	});
});
test('CM-S1-H: unavailable local readers fail explicitly without INSTALL and close their partial instance', async () => {
	await fixture(async (dir) => {
		const statements: string[] = [];
		let closed = 0;
		const originalRun = DuckDBConnection.prototype.run, originalClose = DuckDBInstance.prototype.closeSync;
		const run = mock.method(DuckDBConnection.prototype, 'run', function (this: DuckDBConnection, sql: string, ...args: unknown[]) {
			statements.push(sql);
			if (sql === 'LOAD arrow')
				return Promise.reject(new Error('missing extension /private/source/path'));
			return originalRun.call(this, sql, ...args as [
			]);
		});
		const close = mock.method(DuckDBInstance.prototype, 'closeSync', function (this: DuckDBInstance) {
			closed++;
			return originalClose.call(this);
		});
		try {
			await assert.rejects(MemoryFileExecution.open(policy(dir), { localReaders: ['arrow'] }), { message: 'unsupported-temporary' });
			assert.equal(closed, 1);
			assert.ok(statements.includes('LOAD arrow'));
			assert.ok(statements.every(sql => !/^INSTALL/i.test(sql)));
		}
		finally {
			run.mock.restore();
			close.mock.restore();
		}
	});
});
test('CM-S1-H: resource close waits for decoder source cleanup after native work settles and closes the source once', async () => {
	await fixture(async (dir) => {
		const resource = await MemoryFileExecution.open(policy(dir));
		let begin!: () => void, release!: () => void;
		const started = new Promise<void>(r => begin = r), gate = new Promise<void>(r => release = r);
		let calls = 0;
		const loading = resource.loadRows(async (budget) => {
			const free = budget.reserve(1024);
			return { async targets() {
					return [];
				}, async describe() {
					return [];
				}, async *batches() {
				}, async close() {
					calls++;
					begin();
					await gate;
					free();
				} };
		});
		await started;
		let closed = false;
		const closing = resource.close().then(() => {
			closed = true;
		});
		await delay(5);
		assert.equal(closed, false);
		release();
		await loading;
		await closing;
		assert.equal(calls, 1);
		assert.equal(resource.diagnostics.decodedBytes, 0);
		assert.equal(resource.diagnostics.connections, 0);
	});
});
test('CM-S1-H: isolated native and converted execution leaves home cache temp config working roots and captured logs free of file or path leakage', async () => {
	await fixture(async (dir) => {
		const root = await realpath(dir), sources = join(root, 'sources');
		for (const name of ['sources', 'home', 'temp', 'cache', 'config', 'data', 'working', 'logs'])
			await mkdir(join(root, name));
		await writeFile(join(sources, 'PRIVATE_PATH_CANARY.csv'), 'id,label\n1,first\n2,second\n');
		await writeFile(join(sources, 'PRIVATE_PATH_CANARY.json'), JSON.stringify([{ id: 1, label: 'first' }, { id: 2, label: 'second' }]));
		await writeFile(join(sources, 'PRIVATE_PATH_CANARY.jsonl'), '{"id":1,"label":"first"}\n{"id":2,"label":"second"}\n');
		await writeFile(join(sources, 'PRIVATE_PATH_CANARY.bson'), Buffer.concat([bson({ id: 1, label: 'first' }), bson({ id: 2, label: 'second' })]));
		const bad = Buffer.alloc(4);
		bad.writeInt32LE(0x7fffffff);
		await writeFile(join(sources, 'bad.bson'), bad);
		const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Data');
		sheet.addRow(['id', 'label']);
		sheet.addRow([1, 'first']);
		sheet.addRow([2, 'second']);
		await workbook.xlsx.writeFile(join(sources, 'PRIVATE_PATH_CANARY.xlsx'));
		const setup = await DuckDBInstance.create(':memory:'), connection = await setup.connect();
		try {
			await connection.run("COPY (SELECT 1 AS id, 'first' AS label UNION ALL SELECT 2,'second') TO ? (FORMAT PARQUET)", [join(sources, 'PRIVATE_PATH_CANARY.parquet')]);
		}
		finally {
			connection.closeSync();
			setup.closeSync();
		}
		for (const name of await readdir(sources))
			await chmod(join(sources, name), 0o400);
		await chmod(sources, 0o500);
		try {
			const { stdout, stderr } = await promisify(execFile)(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./fixtures/private-execution-fs-probe.ts', import.meta.url)), root], { cwd: join(root, 'working'), env: { ...process.env, HOME: join(root, 'home'), TMPDIR: join(root, 'temp'), TMP: join(root, 'temp'), TEMP: join(root, 'temp'), XDG_CACHE_HOME: join(root, 'cache'), XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'), INSRC_MODE: 'daemon', INSRC_LOG_LEVEL: 'trace', INSRC_LIVE_TESTS: '0', TSX_DISABLE_CACHE: '1', NODE_DISABLE_COMPILE_CACHE: '1' }, timeout: 45000, maxBuffer: 1024 * 1024 });
			const result = JSON.parse(stdout);
			assert.equal(result.native, 4);
			assert.equal(result.converted, 2);
			assert.equal(result.filesystemUnchanged, true);
			assert.equal(result.logsClean, true);
			for (const marker of [root, 'PRIVATE_PATH_CANARY', 'PRIVATE_CONFIG_CANARY'])
				assert(!(stdout + stderr).includes(marker), 'no source/configuration path leakage through native stdout or stderr');
		}
		finally {
			await chmod(sources, 0o700);
		}
	});
});
