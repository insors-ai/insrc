/** Actual test-owned source writers shared by file lifecycle acceptance. */
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DuckDBInstance} from '@duckdb/node-api';
import avsc from 'avsc';
import {serialize} from 'bson';
import ExcelJS from 'exceljs';
import {tableFromArrays,tableToIPC} from 'apache-arrow';
import type {ConnectionConfig} from '../../../../shared/db-driver.js';
export async function source(root: string, kind: string, marker: string, pathStem = marker): Promise<ConnectionConfig> {
 const path = join(root, pathStem + '.' + kind); let options: Record<string, unknown> | undefined;
 if (kind === 'csv' || kind === 'tsv') { await writeFile(path, `marker${kind === 'tsv' ? '\t' : ','}n\n${marker}${kind === 'tsv' ? '\t' : ','}1\n`); options = { header: true }; }
 else if (kind === 'json') await writeFile(path, JSON.stringify([{ marker }]));
 else if (kind === 'jsonl' || kind === 'ndjson') await writeFile(path, JSON.stringify({ marker }) + '\n');
	else if (kind === 'arrow' || kind === 'feather') await writeFile(path, tableToIPC(tableFromArrays({ marker: [marker] }), 'file'));
 else if (kind === 'bson') await writeFile(path, serialize({ marker }));
 else if (kind === 'fixed-width') { await writeFile(path, marker + '\n'); options = { columns: [{ name: 'marker', start: 0, length: marker.length, type: 'string' }] }; }
 else if (kind === 'xlsx') { const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Data'); sheet.addRow(['marker']); sheet.addRow([marker]); await book.xlsx.writeFile(path); }
 else if (kind === 'avro') { const writer = new avsc.streams.BlockEncoder({ type: 'record', name: 'Row', fields: [{ name: 'marker', type: 'string' }] }); const parts: Buffer[] = []; const ended = new Promise<void>((resolve, reject) => { writer.on('data', part => parts.push(part)); writer.on('end', resolve); writer.on('error', reject); }); writer.end({ marker }); await ended; await writeFile(path, Buffer.concat(parts)); }
 else if (kind === 'parquet') { const db = await DuckDBInstance.create(':memory:'), c = await db.connect(); try { await c.run("COPY (SELECT '" + marker.replaceAll("'", "''") + "' AS marker) TO ? (FORMAT PARQUET)", [path]); } finally { c.closeSync(); db.closeSync(); } }
 else await writeFile(path, 'unsupported');
 return { id: kind, kind, path, ...(options ? { options } : {}) };
}
