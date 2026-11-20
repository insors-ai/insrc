import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { MessageChannel } from 'node:worker_threads';
import { HubClient, serveHub } from '../../threads/channel.js';
import { getStepStateStore, HubStepStateStore, installStepStateStore, LocalStepStateStore, stepStateHubHandlers } from '../../threads/step-state.js';

test('Peer state round-trip terminates with both MessagePorts closed', async () => {
 const original = getStepStateStore(), channel = new MessageChannel();
 const stopServing = serveHub(channel.port1, stepStateHubHandlers(new LocalStepStateStore()));
 const store = new HubStepStateStore(new HubClient(channel.port2));
 installStepStateStore(store);
 try {
  assert.equal(getStepStateStore(), store);
  for (const kind of ['workflow', 'analyze'] as const) {
   const token = await store.mint(kind, { value: 1 });
   assert.deepEqual((await store.read(kind, token))?.payload, { value: 1 });
   const next = await store.update(kind, token, { value: 2 });
   assert.notEqual(next, token); assert.equal(await store.read(kind, token), undefined);
   assert.deepEqual((await store.read(kind, next))?.payload, { value: 2 });
   await store.release(kind, next); assert.equal(await store.read(kind, next), undefined);
  }
 } finally {
  installStepStateStore(original); stopServing();
  const closed = [once(channel.port1, 'close'), once(channel.port2, 'close')];
  channel.port1.close(); channel.port2.close(); await Promise.all(closed);
 }
});
