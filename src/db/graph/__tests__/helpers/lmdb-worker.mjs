// Worker thread for worker-thread-lock.test.ts: opens the store at workerData.path
// with the daemon's open options, reports what it read, and on request writes or
// closes its handle. Plain JavaScript so a worker can load it without a loader.
import { parentPort, workerData } from 'node:worker_threads';
import { open } from 'lmdb';

const root = open({ path: workerData.path, mapSize: workerData.mapSize, maxDbs: workerData.maxDbs });
const db = root.openDB({ name: 'gate', keyEncoding: 'binary', encoding: 'binary' });
parentPort.postMessage({ step: 'opened', read: db.get(Buffer.from('k'))?.toString() ?? null });
parentPort.on('message', async (m) => {
	if (m === 'write') { await db.put(Buffer.from('w'), Buffer.from('from-worker')); parentPort.postMessage({ step: 'wrote' }); }
	if (m === 'close') { await root.close(); parentPort.postMessage({ step: 'closed' }); }
});
