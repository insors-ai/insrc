// Another process for worker-thread-lock.test.ts: opens the store, reads, closes.
import { open } from 'lmdb';

const [path, mapSize, maxDbs] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const root = open({ path, mapSize, maxDbs });
const db = root.openDB({ name: 'gate', keyEncoding: 'binary', encoding: 'binary' });
process.stdout.write(`read ${db.get(Buffer.from('k'))?.toString() ?? 'nothing'}\n`);
await root.close();
