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
 await assertParquetSchema(dest,columns);
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
			assert.ok(budget.snapshot().peak < 9 * 1024 * 1024, 'never retains an over-limit expanded block');
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
