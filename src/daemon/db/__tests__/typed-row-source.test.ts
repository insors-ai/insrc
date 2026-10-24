import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTypedRowSource, emptyColumn, schemaVersion } from '../drivers/converters/typed-row-source.js';
import type { TypedTargetReader } from '../drivers/converters/typed-row-source.js';

function reader(id: string, rows: Record<string, unknown>[], worksheetName?: string): TypedTargetReader {
 return {
  target: { targetId: id, sourceIdentity: 'fixture', ...(worksheetName === undefined ? {} : { worksheetName, worksheetSlug: worksheetName.replaceAll(' ', '_') }), columns: [{ ...emptyColumn(), name: 'value' }] },
  async *rows() { yield* rows; }, normalize: row => row,
 };
}
test('CM-S1-W: schema-first typed batches preserve declared empty and all-null schemas and isolate worksheet targets', async () => {
 const empty = reader('empty', []), nullable = reader('null', [{ value: null }], 'Null Sheet');
 const source = createTypedRowSource([empty, nullable], { memoryBudgetBytes: 1024 });
 assert.deepEqual((await source.describe('empty'))[0]?.columns, empty.target.columns);
 assert.deepEqual(await Array.fromAsync(source.batches('empty')), []);
 const batches = await Array.fromAsync(source.batches('Null_Sheet'));
 assert.equal(batches.length, 1); assert.equal(batches[0]?.rows[0]?.['value'], null);
 assert.equal(batches[0]?.schemaVersion, schemaVersion(nullable.target));
 assert.notEqual(schemaVersion(empty.target), schemaVersion(nullable.target));
 await assert.rejects(source.describe('missing'), /Unknown/);
 assert.equal((await source.describe('empty'))[0]?.targetId, 'empty');
 await source.close(); await source.close(); await assert.rejects(source.targets(), /closed/);
});
test('CM-S1-W: batch limits cancellation required values and schema identity are enforced before row emission', async () => {
 const source = createTypedRowSource([reader('one', [{ value: 'a' }, { value: 'b' }])], { memoryBudgetBytes: 512, batchRows: 1 });
 assert.equal((await Array.fromAsync(source.batches())).length, 2);
 const abort = new AbortController(); abort.abort();
 await assert.rejects(Array.fromAsync(source.batches(undefined, abort.signal)), { name: 'AbortError' });
 const tooLarge = createTypedRowSource([reader('large', [{ value: 'x'.repeat(256) }])], { memoryBudgetBytes: 128 });
 await assert.rejects(Array.fromAsync(tooLarge.batches()), /budget/);
 const required = reader('required', [{ value: null }]);
 const nonnull = { ...required, target: { ...required.target, columns: required.target.columns.map(c => ({ ...c, nullable: false })) } };
 await assert.rejects(Array.fromAsync(createTypedRowSource([nonnull], { memoryBudgetBytes: 512 }).batches()), /required/);
 assert.throws(() => createTypedRowSource([reader('duplicate', []), reader('duplicate', [])], { memoryBudgetBytes: 128 }), /Duplicate/);
});

test('CM-S1-W: saved Parquet uses the same declared schema and normalized rows as memory batches including zero rows', async () => {
 const { mkdtemp, rm } = await import('node:fs/promises');
 const { tmpdir } = await import('node:os');
 const { join } = await import('node:path');
 const { createRequire } = await import('node:module');
 const { writeTypedParquet } = await import('../drivers/converters/typed-parquet.js');
 const parquet = createRequire(import.meta.url)('parquetjs-lite');
 const dir = await mkdtemp(join(tmpdir(), 'cm-typed-'));
 try {
  for (const rows of [[], [{ value: null }], [{ value: 'full value' }]]) {
   const source = createTypedRowSource([reader('one', rows)], { memoryBudgetBytes: 1024 });
   const path = join(dir, 'fixture.parquet');
   assert.equal(await writeTypedParquet(source, 'one', path), rows.length);
   const saved = await parquet.ParquetReader.openFile(path);
   try {
    assert.equal(saved.schema.fields.value.originalType, 'UTF8');
    assert.equal(saved.schema.fields.value.repetitionType, 'OPTIONAL');
    const cursor = saved.getCursor(), actual = [];
    for (;;) { const row = await cursor.next(); if (row === null) break; actual.push(row); }
    assert.equal(actual.length, rows.length);
    for (let i = 0; i < rows.length; i++) assert.equal(actual[i]?.value ?? null, rows[i]?.value);
   } finally { await saved.close(); await source.close(); }
  }
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CM-S1-W: legacy all-sheet union rejects divergent schemas rather than reusing another worksheet schema', async () => {
 const { assertCompatibleTargets } = await import('../drivers/converters/typed-row-source.js');
 const a = reader('a', []).target, b = reader('b', []).target;
 assert.doesNotThrow(() => assertCompatibleTargets([a, b]));
 assert.throws(() => assertCompatibleTargets([a, { ...b, columns: [{ ...emptyColumn(), name: 'different' }] }]), /Incompatible/);
});

test('CM-S1-W: shared normalization describes dates binary nested and numeric values explicitly', async () => {
 const { convertedColumn, normalizeScalar } = await import('../drivers/converters/normalization.js');
 const date = new Date('2026-01-01T00:00:00Z');
 assert.equal(normalizeScalar(date, convertedColumn('when', 'TIMESTAMP_MILLIS')), date.getTime());
 assert.equal(convertedColumn('when', 'TIMESTAMP_MILLIS').logicalType, 'timestamp');
 assert.deepEqual(normalizeScalar(new Uint8Array([0, 255]), convertedColumn('bytes', 'BYTE_ARRAY')), Buffer.from([0, 255]));
 assert.equal(normalizeScalar({ exact: 9007199254740993n }, convertedColumn('nested', 'UTF8', true, 'json')), '{"exact":"9007199254740993"}');
 assert.equal(normalizeScalar(null, convertedColumn('missing', 'INT64')), null);
 assert.throws(() => convertedColumn('unknown', 'UNKNOWN'), /Unsupported/);
});

test('CM-S1-W: closing a partially consumed source releases the active reader once and rejects further batches', async () => {
 let released = 0;
 const base = reader('one', []);
 const source = createTypedRowSource([{ ...base, async *rows() { try { yield { value: 'first' }; yield { value: 'second' }; yield { value: 'third' }; } finally { released++; } } }], { memoryBudgetBytes: 1024, batchRows: 1 });
 const iterator = source.batches()[Symbol.asyncIterator]();
 assert.equal((await iterator.next()).value.rows[0].value, 'first');
 await source.close(); assert.equal(released, 1);
 await assert.rejects(iterator.next(), /closed/); assert.equal(released, 1);
});
