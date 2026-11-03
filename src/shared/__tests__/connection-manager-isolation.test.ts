import test from 'node:test';
import { runConnectionJUnit } from './fixtures/connection-junit.js';

test('CM-S5-WINDOW: two real project owners, same roots/IDs, overlapping RPC IDs and isolated replies/disposal', {timeout:180000}, () => {
  runConnectionJUnit('ai.insors.insrc.jetbrains.connections.ConnectionsIsolationTest',1);
});
