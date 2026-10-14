// A second process on the same queue file: waits for 'go', acknowledges the head, reports.
import { DatabaseSync } from 'node:sqlite';
import { createChatQueueStore } from '../../chat-queue-store.js';

const [path, windowKey] = process.argv.slice(2) as [string, string];
const store = createChatQueueStore({ path, openDatabase: (p) => new DatabaseSync(p) as never, now: () => Date.now(), pluginVersion: 'test' });
process.on('message', (m: unknown) => {
  if (m !== 'go') return;
  const head = store.head();
  let ok = false;
  let error: string | undefined;
  try {
    ok = head !== undefined && store.acknowledge(head.seq, { windowKey, pid: process.pid });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  process.send?.({ ok, error });
  store.close();
  process.exit(0);
});
process.send?.('ready');
