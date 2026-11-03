/** Test-only native primitives. This is not the production store/queue adapter. */
import { join, dirname } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Connection, Table } from '@lancedb/lancedb';
import { arrowSchema, decodeRow, encodeRow, logicalId, makeRow, rootRow } from '../../store/codec.js';
import type { EmbeddingProfile, StoreRow } from '../../store/types.js';
import { epoch, ns, profile, queueId, scope, storeId, storeRows } from './store-rows.js';

export const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
export async function openNative(root: string, create = false, actualProfile: EmbeddingProfile = profile): Promise<{ connection: Connection; table: Table; close(): void }> {
  const lance = await import('@lancedb/lancedb');
  const connection = await lance.connect(join(root, 'memory.lance'), { readConsistencyInterval: 0 });
  try {
    const table = create ? await connection.createEmptyTable('records', await arrowSchema(actualProfile)) : await connection.openTable('records');
    return { connection, table, close() { table.close(); connection.close(); } };
  } catch (error) { connection.close(); throw error; }
}
export async function baseline(table: Table): Promise<number> {
  await table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute([encodeRow(rootRow(storeId, profile, 99), profile)]);
  return table.version();
}
export function effects(count = 1): StoreRow[] {
  const examples = storeRows();
  const template = examples.find(r => r.rowKind === 'current')!;
  const revision = examples.find(r => r.rowKind === 'revision')!;
  const evidence = examples.find(r => r.rowKind === 'evidence')!;
  const receipt = examples.find(r => r.rowKind === 'receipt')!;
  const root = examples[0]!;
  if (template.rowKind !== 'current' || revision.rowKind !== 'revision' || evidence.rowKind !== 'evidence' || receipt.rowKind !== 'receipt' || root.rowKind !== 'control' || root.payload.kind !== 'root') throw Error('Invalid native fixture.');
  const result: StoreRow[] = [makeRow('control', scope, epoch, { ...root.payload, generation: '1', queueId }, profile), ...examples.filter(r => r.rowKind === 'source' || (r.rowKind === 'control' && r.payload.kind === 'namespace'))];
  const affected = [];
  for (let i = 0; i < count; i++) {
    const memoryId = logicalId('memory', ns, 'native-' + i), revisionId = logicalId('revision', ns, 'native-revision-' + i);
    const p = { ...template.payload, memoryId, revisionId, validFrom: 100, validUntil: 5000, text: template.payload.text + (count > 1 ? ' x'.repeat(4096) : '') };
    result.push(makeRow('current', scope, epoch, p, profile, [1, 0], '1'));
    result.push(makeRow('revision', scope, epoch, { ...revision.payload, memoryId, revisionId, snapshot: p }, profile));
    result.push(makeRow('evidence', scope, epoch, { ...evidence.payload, evidenceId: logicalId('evidence', ns, 'native-evidence-' + i), memoryId, revisionId }, profile));
    affected.push({ memoryId, previousRevisionId: null, revisionId });
  }
  result.push(makeRow('receipt', scope, epoch, { ...receipt.payload, affectedRevisions: affected }, profile));
  return result;
}
/** Arrow StructRow/Vector conversion happens only at this trusted SDK boundary. */
export function decodedNative(value: Record<string, unknown>, actualProfile: EmbeddingProfile = profile): StoreRow {
  const row = { ...value };
  if (row.embedding !== null) row.embedding = Array.from(row.embedding as Iterable<number>);
  for (const key of ['validFrom', 'validUntil']) if (typeof row[key] === 'bigint') row[key] = Number(row[key]);
  return decodeRow(row, actualProfile);
}
export async function fingerprint() {
  const require = createRequire(import.meta.url);
  const versions: Record<string, string> = {};
  for (const name of ['@lancedb/lancedb', 'apache-arrow']) {
    let directory = dirname(require.resolve(name));
    for (;;) {
      try { const p = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')); if (p.name === name) { versions[name] = p.version; break; } } catch { /* Parent manifest. */ }
      const parent = dirname(directory); if (parent === directory) throw Error('Cannot identify dependency: ' + name); directory = parent;
    }
  }
  const files = ['package.json', 'tsconfig.json'];
  async function sources(path: string): Promise<void> {
    const entries = await readdir(join(packageRoot, path), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path + '/' + entry.name;
      if (entry.isDirectory()) await sources(file);
      else if (/\.(?:ts|mts|mjs)$/.test(file)) files.push(file);
    }
  }
  await sources('src');
  const source: Record<string, string> = {};
  for (const file of files) source[file] = createHash('sha256').update(await readFile(join(packageRoot, file))).digest('hex');
  const nativePackage = '@lancedb/lancedb-' + process.platform + '-' + process.arch + (process.platform === 'linux' ? '-gnu' : '');
  const nativePath = require.resolve(nativePackage);
  const nativeSha256 = createHash('sha256').update(await readFile(nativePath)).digest('hex');
  return { versions, source, nativePackage, nativeSha256 };
}
