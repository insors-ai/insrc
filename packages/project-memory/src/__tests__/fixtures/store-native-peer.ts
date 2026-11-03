import { acquireOwnership } from '../../ownership.js';
import { encodeRow } from '../../store/codec.js';
import { options } from './options.js';
import { profile } from './store-rows.js';
import { baseline, effects, openNative } from './store-native.js';

const send = (message: unknown) => new Promise<void>((resolve, reject) => process.send!(message, error => error ? reject(error) : resolve()));
async function hold(type: string, detail: Record<string, unknown> = {}): Promise<never> { await send({ type, ...detail }); return new Promise(() => {}); }
async function run() {
  // An unresolved Promise alone does not keep Node alive after a native write.
  // The parent owns termination; keep the IPC channel referenced until SIGKILL.
  process.channel?.ref();
  const root = process.argv[2]!, mode = process.argv[3]!;
  // The process guard deliberately stays owned until the parent kills us.
  const owner = await acquireOwnership(options(root));
  const db = await openNative(root, true);
  const version = await baseline(db.table);
  await send({ type: 'baseline', version });
  const batch = effects(32).map(row => encodeRow(row, profile));
  if (mode === 'before') await hold('before');
  if (mode === 'race') await send({ type: 'race' });
  await db.table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute(batch);
  await owner.assertOwned();
  await hold('after', { version: await db.table.version() });
}
void run().catch(error => { process.stderr.write(String(error)); process.exit(1); });
