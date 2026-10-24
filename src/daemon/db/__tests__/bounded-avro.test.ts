import { assertParquetSchema } from './fixtures/assert-parquet-schema.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import avsc from 'avsc';
import { DuckDBInstance } from '@duckdb/node-api';
import { avroConverter } from '../drivers/converters/avro.js';
import type { MemoryRowSource } from '../drivers/converters/types.js';
import { DecoderBudget } from '../drivers/converters/decoder-budget.js';
function long(n: number): Buffer {
	let value = (BigInt(n) << 1n) ^ (BigInt(n) >> 63n);
	const out = [];
	do {
		const b = Number(value & 127n);
		value >>= 7n;
		out.push(value ? b | 128 : b);
	} while (value);
	return Buffer.from(out);
}
function bytes(value: Buffer | string): Buffer {
	const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
	return Buffer.concat([long(data.length), data]);
}
const sync = Buffer.alloc(16, 7);
function header(schema: avsc.Schema, codec = 'null'): Buffer {
	return Buffer.concat([Buffer.from([79, 98, 106, 1]), long(2), bytes('avro.schema'), bytes(JSON.stringify(schema)), bytes('avro.codec'), bytes(codec), long(0), sync]);
}
function block(data: Buffer, count: number, codec = 'null'): Buffer {
	const encoded = codec === 'deflate' ? deflateRawSync(data) : data;
	return Buffer.concat([long(count), long(encoded.length), encoded, sync]);
}
async function fixture(use: (dir: string) => Promise<void>): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), 'cm-avro-'));
	try {
		await use(dir);
	}
	finally {
		await rm(dir, { recursive: true, force: true });
	}
}
async function all(source: MemoryRowSource): Promise<Record<string, unknown>[]> {
	const out = [];
	for await (const batch of source.batches())
		out.push(...batch.rows.map(r => ({ ...r })));
	return out;
}
test('CM-S1-W: Avro explicit writer schemas and full normalized values match saved output with zero rows nullable fields and nested unions', async () => {
	await fixture(async (dir) => {
		const schema: avsc.Schema = { type: 'record', name: 'Fixture', fields: [{ name: 'count', type: 'long' }, { name: 'optional', type: ['null', 'double'] }, { name: 'label', type: 'string' }, { name: 'nested', type: { type: 'array', items: ['null', 'int'] } }] };
		const type = avsc.Type.forSchema(schema);
		for (const codec of ['null', 'deflate'])
			for (const values of [[], [{ count: 1, optional: null, label: 'full string', nested: [1, null, 3] }, { count: 2, optional: 1.25, label: 'tail', nested: [] }]]) {
				const sourcePath = join(dir, 'fixture.avro'), dest = join(dir, 'saved.parquet');
				await writeFile(sourcePath, Buffer.concat([header(schema, codec), ...(values.length ? [block(Buffer.concat(values.map(v => type.toBuffer(v))), values.length, codec)] : [])]));
				const budget = new DecoderBudget(32 * 1024 * 1024), source = await avroConverter.openMemory!(sourcePath, { memoryBudgetBytes: budget.limit, budget });
				try {
					const columns = (await source.describe())[0]!.columns;
					assert.deepEqual(columns.map(c => c.physicalType), ['INT64', 'DOUBLE', 'UTF8', 'UTF8']);
					assert.ok(columns.every(c => c.nullable));
					const memory = await all(source);
					assert.equal(memory.length, values.length);
					if (values.length) {
						assert.equal(memory[0]?.nested, '[1,null,3]');
						assert.equal(memory[0]?.optional, null);
					}
					await avroConverter.convertFile(sourcePath, dest);
					await assertParquetSchema(dest, columns);
					const db = await DuckDBInstance.create(':memory:'), connection = await db.connect();
					try {
						const saved = (await connection.runAndReadAll('SELECT * FROM read_parquet(?)', [dest])).getRowObjectsJS().map(row => ({ ...row, count: Number(row.count) }));
						assert.deepEqual(saved, memory);
					}
					finally {
						connection.closeSync();
						db.closeSync();
					}
				}
				finally {
					await source.close();
				}
				assert.equal(budget.snapshot().retained, 0);
			}
	});
});
test('CM-S1-S: Avro declared block and inflated expansion bounds reject before object decoding and release all reservations', async () => {
	await fixture(async (dir) => {
		const schema: avsc.Schema = { type: 'record', name: 'Fixture', fields: [{ name: 'text', type: 'string' }] };
		const path = join(dir, 'bad.avro');
		await writeFile(path, Buffer.concat([header(schema), long(1), long(8 * 1024 * 1024 + 1)]));
		let budget = new DecoderBudget(32 * 1024 * 1024), source = await avroConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget });
		try {
			await assert.rejects(all(source), /resource-limit/);
			assert.ok(budget.snapshot().peak < 1024 * 1024);
		}
		finally {
			await source.close();
		}
		assert.equal(budget.snapshot().retained, 0);
		await writeFile(path, Buffer.concat([header(schema, 'deflate'), block(Buffer.alloc(8 * 1024 * 1024 + 1), 1, 'deflate')]));
		budget = new DecoderBudget(32 * 1024 * 1024);
		source = await avroConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget });
		try {
			await assert.rejects(all(source), /resource-limit/);
			assert.ok(budget.snapshot().peak < 17 * 1024 * 1024, 'admits bounded native chunks and concatenation before inflation');
		}
		finally {
			await source.close();
		}
		assert.equal(budget.snapshot().retained, 0);
	});
});
test('CM-S1-S: Avro collection lengths text units schema recursion and metadata admission fail before bulk materialization', async () => {
	await fixture(async (dir) => {
		const path = join(dir, 'bad.avro');
		const schema: avsc.Schema = { type: 'record', name: 'Fixture', fields: [{ name: 'items', type: { type: 'array', items: 'null' } }] };
		await writeFile(path, Buffer.concat([header(schema), block(Buffer.concat([long(1000000), long(0)]), 1)]));
		let budget = new DecoderBudget(32 * 1024 * 1024), source = await avroConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget });
		try {
			await assert.rejects(all(source), /resource-limit/);
			assert.ok(budget.snapshot().peak < 1024 * 1024);
		}
		finally {
			await source.close();
		}
		assert.equal(budget.snapshot().retained, 0);
		const recursive: avsc.Schema = { type: 'record', name: 'Node', fields: [{ name: 'next', type: ['null', 'Node'] }] };
		await writeFile(path, header(recursive));
		budget = new DecoderBudget(32 * 1024 * 1024);
		await assert.rejects(avroConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget }), /unsupported-temporary/);
		assert.equal(budget.snapshot().retained, 0);
		const textSchema: avsc.Schema = { type: 'record', name: 'Text', fields: [{ name: 'text', type: 'string' }] };
		await writeFile(path, Buffer.concat([header(textSchema), block(Buffer.concat([long(65537), Buffer.alloc(65537, 97)]), 1)]));
		budget = new DecoderBudget(32 * 1024 * 1024);
		source = await avroConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget });
		try {
			await assert.rejects(all(source), /resource-limit/);
		}
		finally {
			await source.close();
		}
		assert.equal(budget.snapshot().retained, 0);
		await writeFile(path, Buffer.concat([Buffer.from([79, 98, 106, 1]), long(1), bytes('avro.schema'), long(256 * 1024 + 1)]));
		budget = new DecoderBudget(32 * 1024 * 1024);
		await assert.rejects(avroConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget }), /resource-limit/);
		assert.equal(budget.snapshot().retained, 0);
	});
});
test('CM-S1-W: standard avsc container encoder remains readable without saved-output staging', async () => {
	await fixture(async (dir) => {
		const { pipeline } = await import('node:stream/promises');
		const { Readable } = await import('node:stream');
		const { createWriteStream } = await import('node:fs');
		const schema: avsc.Schema = { type: 'record', name: 'Standard', fields: [{ name: 'value', type: 'int' }] };
		const path = join(dir, 'standard.avro'), encoder = new avsc.streams.BlockEncoder(schema, { codec: 'deflate' });
		await pipeline(Readable.from([{ value: 7 }, { value: 8 }]), encoder, createWriteStream(path));
		const source = await avroConverter.openMemory!(path, { memoryBudgetBytes: 32 * 1024 * 1024 });
		try {
			assert.deepEqual(await all(source), [{ value: 7 }, { value: 8 }]);
		}
		finally {
			await source.close();
		}
	});
});
test('CM-S1-W: tiny deflate Avro records preserve saved parity within a small admitted memory budget', async () => {
	await fixture(async (dir) => {
		const schema: avsc.Schema = { type: 'record', name: 'Small', fields: [{ name: 'value', type: 'string' }] }, type = avsc.Type.forSchema(schema), path = join(dir, 'small.avro'), dest = join(dir, 'small.parquet');
		await writeFile(path, Buffer.concat([header(schema, 'deflate'), block(type.toBuffer({ value: 'valid small record' }), 1, 'deflate')]));
		const budget = new DecoderBudget(1024 * 1024), source = await avroConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget });
		try {
			const columns = (await source.describe())[0]!.columns;
			assert.deepEqual(await all(source), [{ value: 'valid small record' }]);
			await avroConverter.convertFile(path, dest);
			await assertParquetSchema(dest, columns);
			const db = await DuckDBInstance.create(':memory:'), connection = await db.connect();
			try {
				assert.deepEqual((await connection.runAndReadAll('SELECT * FROM read_parquet(?)', [dest])).getRowObjectsJS(), await all(source));
			}
			finally {
				connection.closeSync();
				db.closeSync();
			}
			assert(budget.snapshot().peak <= budget.limit);
		}
		finally {
			await source.close();
		}
		assert.equal(budget.snapshot().retained, 0);
	});
});
test('CM-S1-S: Avro rejects schema field union fixed and recursive graphs before invoking avsc materialization', async () => {
	const { mock } = await import('node:test');
	let compiles = 0;
	const original = avsc.Type.forSchema;
	const spy = mock.method(avsc.Type, 'forSchema', (...args: Parameters<typeof original>) => {
		compiles++;
		return original(...args);
	});
	try {
		await fixture(async (dir) => {
			const oversized: unknown[] = [{ type: 'record', name: 'Wide', fields: Array.from({ length: 4097 }, (_, i) => ({ name: 'f' + i, type: 'int' })) }, { type: 'record', name: 'Union', fields: [{ name: 'u', type: Array(65).fill('null') }] }, { type: 'record', name: 'Large', fields: [{ name: 'f', type: { type: 'fixed', name: 'Block', size: 65537 } }] }, { type: 'record', name: 'Recursive', fields: [{ name: 'next', type: ['null', 'Recursive'] }] }];
			for (const schema of oversized) {
				const path = join(dir, 'schema.avro');
				await writeFile(path, header(schema as avsc.Schema));
				const budget = new DecoderBudget(32 * 1024 * 1024);
				await assert.rejects(avroConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget }), /resource-limit|unsupported-temporary/);
				assert.equal(compiles, 0);
				assert.equal(budget.snapshot().retained, 0);
			}
		});
	}
	finally {
		spy.mock.restore();
	}
});
test('CM-S1-S: real Avro inflater failure closes actual source handles and releases admission before caller cleanup', async () => {
	const { default: fs } = await import('node:fs/promises'), { default: zlib } = await import('node:zlib'), { syncBuiltinESMExports } = await import('node:module'), { mock } = await import('node:test');
	const originalOpen = fs.open, originalInflate = zlib.inflateRawSync;
	let opened = 0, closed = 0, inflaters = 0, calls = 0;
	let budget: DecoderBudget;
	const openSpy = mock.method(fs, 'open', async (...args: Parameters<typeof originalOpen>) => {
		const handle = await originalOpen(...args);
		opened++;
		const close = handle.close.bind(handle);
		handle.close = async () => {
			closed++;
			await close();
		};
		return handle;
	});
	const inflateSpy = mock.method(zlib, 'inflateRawSync', (...args: Parameters<typeof originalInflate>) => {
		calls++;
		inflaters++;
		assert((args[1]?.maxOutputLength ?? Infinity) <= budget.snapshot().retained);
		try {
			return originalInflate(...args);
		}
		finally {
			inflaters--;
		}
	});
	syncBuiltinESMExports();
	try {
		await fixture(async (dir) => {
			const schema: avsc.Schema = { type: 'record', name: 'Expansion', fields: [{ name: 'value', type: 'bytes' }] }, path = join(dir, 'expansion.avro');
			await writeFile(path, Buffer.concat([header(schema, 'deflate'), block(Buffer.alloc(8 * 1024 * 1024 + 1), 1, 'deflate')]));
			budget = new DecoderBudget(32 * 1024 * 1024);
			const source = await avroConverter.openMemory!(path, { memoryBudgetBytes: budget.limit, budget });
			await assert.rejects(all(source), /resource-limit/);
			assert.equal(calls, 1);
			assert.equal(inflaters, 0);
			assert.equal(opened, closed);
			assert.equal(budget.snapshot().retained, 0);
			await source.close();
		});
	}
	finally {
		openSpy.mock.restore();
		inflateSpy.mock.restore();
		syncBuiltinESMExports();
	}
});
