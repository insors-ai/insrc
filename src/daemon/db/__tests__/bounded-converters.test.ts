import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DuckDBInstance } from '@duckdb/node-api';
import { serialize, Long, Decimal128, ObjectId, Binary } from 'bson';
import { DecoderBudget } from '../drivers/converters/decoder-budget.js';
import { bsonConverter } from '../drivers/converters/bson.js';
import { fixedWidthConverter } from '../drivers/converters/fixed-width.js';
import type { MemoryRowSource } from '../drivers/converters/types.js';
async function fixture(use: (dir: string) => Promise<void>): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), 'cm-converter-'));
	try {
		await use(dir);
	}
	finally {
		await rm(dir, { recursive: true, force: true });
	}
}
async function rows(source: MemoryRowSource): Promise<Record<string, unknown>[]> {
	const out = [];
	for await (const batch of source.batches())
		out.push(...batch.rows.map(row => ({ ...row })));
	return out;
}
function canonical(value: unknown): unknown {
	if (value instanceof Date)
		return value.getTime();
	if (typeof value === 'bigint')
		return Number(value);
	if (value instanceof Uint8Array)
		return Buffer.from(value).toString('hex');
	if (Array.isArray(value))
		return value.map(canonical);
	if (value && typeof value === 'object')
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, canonical(v)]));
	return value;
}
async function savedRows(path: string, columns: string[], timestamps: string[] = []): Promise<unknown[]> {
	const db = await DuckDBInstance.create(':memory:');
	const connection = await db.connect();
	try {
		const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
		const projection = columns.map(name => timestamps.includes(name) ? `epoch_ms(${quote(name)}) AS ${quote(name)}` : quote(name)).join(', ');
		return canonical((await connection.runAndReadAll(`SELECT ${projection} FROM read_parquet(?)`, [path])).getRowObjectsJS()) as unknown[];
	}
	finally {
		connection.closeSync();
		db.closeSync();
	}
}
test('CM-S1-S: BSON admits length and structure before payload/object allocation and releases every retained decoder unit', async () => {
	await fixture(async (dir) => {
		const path = join(dir, 'bad.bson');
		for (const length of [0x7fffffff, 8 * 1024 * 1024 + 1]) {
			const header = Buffer.alloc(4);
			header.writeInt32LE(length);
			await writeFile(path, header);
			const budget = new DecoderBudget(1024 * 1024);
			await assert.rejects(bsonConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget }), /resource-limit/);
			assert.equal(budget.snapshot().retained, 0);
			assert.equal(budget.snapshot().peak, 4);
		}
		for (const doc of [{ huge: 'x'.repeat(64 * 1024) }, (() => {
				let nested: Record<string, unknown> = {};
				for (let i = 0; i < 40; i++)
					nested = { nested };
				return nested;
			})(), Object.fromEntries(Array.from({ length: 16400 }, (_, i) => ['field' + i, i]))]) {
			const data = serialize(doc);
			await writeFile(path, data);
			const budget = new DecoderBudget(16 * 1024 * 1024);
			await assert.rejects(bsonConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget }), /resource-limit/);
			assert.equal(budget.snapshot().retained, 0);
			assert.ok(budget.snapshot().peak <= data.length, 'object expansion was not reserved/materialized');
		}
	});
});
test('CM-S1-S: fixed-width giant records and cumulative schema limits reject with zero retained buffers', async () => {
	await fixture(async (dir) => {
		const path = join(dir, 'bad.txt');
		await writeFile(path, 'x'.repeat(64 * 1024 + 1));
		const budget = new DecoderBudget(1024 * 1024);
		const source = await fixedWidthConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget }, { columns: [{ name: 'v', start: 0, length: 1, type: 'string' }] });
		try {
			await assert.rejects(rows(source), /resource-limit/);
		}
		finally {
			await source.close();
		}
		assert.equal(budget.snapshot().retained, 0);
		assert.ok(budget.snapshot().peak < 256 * 1024);
		const tiny = new DecoderBudget(256);
		await assert.rejects(fixedWidthConverter.openMemory!(path, { memoryBudgetBytes: tiny.limit, budget: tiny }, { columns: [{ name: 'long-field', start: 0, length: 1, type: 'string' }] }), /resource-limit/);
		assert.equal(tiny.snapshot().retained, 0);
	});
});
test('CM-S1-W: BSON saved and memory schemas preserve full dates precise large numbers nested values rare fields and all-null data', async () => {
	await fixture(async (dir) => {
		const path = join(dir, 'data.bson'), dest = join(dir, 'data.parquet');
		const docs = [
			{ when: new Date('2026-01-01Z'), precise: Long.fromString('9007199254740993'), decimal: Decimal128.fromString('12345678901234567890.123'), id: new ObjectId('012345678901234567890123'), data: new Binary(Buffer.from([1, 2, 255])), nested: { a: [1, 2], n: Long.fromString('9007199254740993') }, missing: null },
			...Array.from({ length: 1000 }, (_, i) => ({ when: null, precise: Long.fromNumber(i), missing: null })),
			{ rare: 'last record retained' },
		];
		await writeFile(path, Buffer.concat(docs.map(d => serialize(d))));
		const budget = new DecoderBudget(16 * 1024 * 1024);
		const source = await bsonConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget });
		try {
			const schema = (await source.describe('data'))[0]!;
			assert.equal(schema.columns.find(c => c.name === 'when')?.physicalType, 'TIMESTAMP_MILLIS');
			assert.equal(schema.columns.find(c => c.name === 'precise')?.physicalType, 'UTF8');
			assert.ok(schema.columns.every(c => c.nullable));
			const memory = await rows(source);
			assert.equal(memory.length, docs.length);
			assert.equal(memory[0]?.precise, '9007199254740993');
			assert.match(memory[0]?.nested as string, /9007199254740993/);
			assert.equal(memory.at(-1)?.rare, 'last record retained');
			assert.equal((await bsonConverter.convertFile(path, dest)).rowCount, docs.length);
			assert.deepEqual(await savedRows(dest, schema.columns.map(c => c.name), schema.columns.filter(c => c.physicalType === 'TIMESTAMP_MILLIS').map(c => c.name)), canonical(memory));
		}
		finally {
			await source.close();
		}
		assert.equal(budget.snapshot().retained, 0);
	});
});
test('CM-S1-W: fixed-width saved and memory rows share explicit empty all-null schema and complete incremental decoding', async () => {
	await fixture(async (dir) => {
		const path = join(dir, 'data.txt'), dest = join(dir, 'data.parquet');
		const options = { columns: [{ name: 'id', start: 0, length: 4, type: 'integer' }, { name: 'flag', start: 4, length: 1, type: 'boolean' }, { name: 'label', start: 5, length: 6, type: 'string' }] };
		for (const content of ['', '           \n', '0001Yhello \r\n0002Nworld \n']) {
			await writeFile(path, content);
			const budget = new DecoderBudget(1024 * 1024);
			const source = await fixedWidthConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget }, options);
			try {
				const schema = (await source.describe())[0]!;
				assert.deepEqual(schema.columns.map(c => c.physicalType), ['INT64', 'BOOLEAN', 'UTF8']);
				const memory = await rows(source);
				await fixedWidthConverter.convertFile(path, dest, options);
				assert.deepEqual(await savedRows(dest, schema.columns.map(c => c.name)), canonical(memory));
			}
			finally {
				await source.close();
			}
			assert.equal(budget.snapshot().retained, 0);
		}
	});
});
test('CM-S1-S: source replacement between inference and decoding fails explicitly and clears decoder buffers', async () => {
	await fixture(async (dir) => {
		const path = join(dir, 'data.bson');
		await writeFile(path, serialize({ v: 1 }));
		const budget = new DecoderBudget(1024 * 1024);
		const source = await bsonConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget });
		await writeFile(path, serialize({ v: 2 }));
		try {
			await assert.rejects(rows(source), /Source changed/);
		}
		finally {
			await source.close();
		}
		assert.equal(budget.snapshot().retained, 0);
	});
});
test('CM-S1-W: actual empty and all-null BSON keeps its declared fallback schema with no invented data rows', async () => {
	await fixture(async (dir) => {
		const path = join(dir, 'empty.bson'), dest = join(dir, 'empty.parquet');
		for (const bytes of [Buffer.alloc(0), serialize({ missing: null })]) {
			await writeFile(path, bytes);
			const source = await bsonConverter.openMemory!(path, { memoryBudgetBytes: 1024 * 1024 });
			try {
				const schema = (await source.describe())[0]!;
				assert.deepEqual(schema.columns.map(c => [c.name, c.physicalType, c.nullable]), [[bytes.length ? 'missing' : '_empty', 'UTF8', true]]);
				const memory = await rows(source);
				assert.equal(memory.length, bytes.length ? 1 : 0);
				await bsonConverter.convertFile(path, dest);
				assert.deepEqual(await savedRows(dest, schema.columns.map(c => c.name)), canonical(memory));
			}
			finally {
				await source.close();
			}
		}
	});
});

test('CM-S1-S: rejected and cancelled bounded decoding closes every actual source handle', async () => {
 const fs = await import('node:fs/promises');
 const { default: fsPromises } = fs;
 const { mock } = await import('node:test');
 const { syncBuiltinESMExports } = await import('node:module');
 const original = fsPromises.open;
 let opened = 0, closed = 0;
 const spy = mock.method(fsPromises, 'open', async (...args: Parameters<typeof original>) => {
  const handle = await original(...args); opened++;
  const close = handle.close.bind(handle);
  handle.close = async () => { closed++; await close(); };
  return handle;
 });
 syncBuiltinESMExports();
 try {
  await fixture(async dir => {
   const path = join(dir, 'bad.bson'); await writeFile(path, serialize({ huge: 'x'.repeat(65536) }));
   await assert.rejects(bsonConverter.openMemory!(path, { memoryBudgetBytes: 1024 * 1024 }), /resource-limit/);
   assert.ok(opened > 0); assert.equal(closed, opened);
   const fixed = join(dir, 'bad.txt'); await writeFile(fixed, 'x'.repeat(65537));
   const source = await fixedWidthConverter.openMemory!(fixed, {memoryBudgetBytes: 1024*1024}, {columns:[{name:'v',start:0,length:1,type:'string'}]});
   try { await assert.rejects(rows(source), /resource-limit/); } finally { await source.close(); }
   assert.equal(closed, opened);
   await writeFile(path, Buffer.concat([serialize({v:1}),serialize({v:2})]));
   const live = await bsonConverter.openMemory!(path,{memoryBudgetBytes:1024*1024});
   const controller = new AbortController(); controller.abort();
   try { await assert.rejects(Array.fromAsync(live.batches(undefined,controller.signal)),{name:'AbortError'}); } finally {await live.close();}
   assert.equal(closed,opened);
  });
 } finally {spy.mock.restore();syncBuiltinESMExports();}
});
