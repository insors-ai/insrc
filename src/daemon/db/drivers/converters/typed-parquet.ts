import { createRequire } from 'node:module';
import type { MemoryRowSource } from '../../../../shared/connection-management.js';
const require = createRequire(import.meta.url);
// Existing saved converter dependency; never invoked by the memory sink.
const parquet = require('parquetjs-lite') as {
 ParquetSchema: new (fields: Record<string, { type: string; optional: boolean }>) => unknown;
 ParquetWriter: { openFile(schema: unknown, dest: string): Promise<{ appendRow(row: Readonly<Record<string, unknown>>): Promise<void>; close(): Promise<void> }> };
};
export async function writeTypedParquet(source: MemoryRowSource, targetId: string, dest: string): Promise<number> {
 const targets = await source.describe(targetId);
 const target = targets[0];
 if (targets.length !== 1 || target === undefined) throw new Error('Expected one converted target');
 const fields: Record<string, { type: string; optional: boolean }> = Object.create(null) as Record<string, { type: string; optional: boolean }>;
 for (const column of target.columns) fields[column.name] = { type: column.physicalType, optional: column.nullable };
 const writer = await parquet.ParquetWriter.openFile(new parquet.ParquetSchema(fields), dest);
 let count = 0;
 try {
  for await (const batch of source.batches(targetId)) for (const row of batch.rows) { await writer.appendRow(row); count++; }
 } finally { await writer.close(); }
 return count;
}
