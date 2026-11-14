import { parentPort, workerData, threadId } from 'node:worker_threads';
import { HubClient } from '../../channel.js';
import { startDaemonWorker } from '../../worker-entry.js';
import { PreparedContextReader } from '../../../../workflow/review/prepared-context.js';

startDaemonWorker(workerData);
const context = new HubClient(workerData.contextPort);
parentPort!.on('message', raw => {
 if (raw.method !== 'context.read') return;
 void (async () => {
  const { receipt, access, limits, query } = raw.params;
  const reader = await PreparedContextReader.open(receipt, limits,
   async () => { await context.request('context.resolve', access); },
   async () => { await context.request('context.invalidate', access); });
  const view = await reader.view('current') as { projection: { identity: string } };
  const blob = await reader.query('file', query) as { bytes: Uint8Array };
  parentPort!.postMessage({ kind: 'reply', requestId: raw.requestId, result: { threadId, scopeIdentity: view.projection.identity, source: Buffer.from(blob.bytes).toString() } });
 })().catch(error => parentPort!.postMessage({ kind: 'reply', requestId: raw.requestId, error: String(error) }));
});
parentPort!.postMessage('worker-ready');
