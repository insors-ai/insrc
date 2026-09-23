/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * OllamaProvider.listLocalModels() tests (Epic ba132c185fe45860, S002 / t1).
 *
 * The mapping + bounded timeout + rejection paths are exercised via the `listFn`
 * seam (a fake ollama client.list()) so no live ollama is needed. Read-only.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/ollama-list-models.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OllamaProvider } from '../ollama.js';

const provider = new OllamaProvider();

test('listLocalModels: maps client.list() {models:[{name}]} -> [{id:name}] (no displayName)', async () => {
  const models = await provider.listLocalModels({
    listFn: async () => ({ models: [{ name: 'llama3' }, { name: 'qwen3' }] }),
  });
  assert.deepEqual(models, [{ id: 'llama3' }, { id: 'qwen3' }]);
  // displayName omitted, not set to undefined
  assert.ok(!('displayName' in models[0]!));
});

test('listLocalModels: reachable-but-zero -> empty array (not an error)', async () => {
  const models = await provider.listLocalModels({ listFn: async () => ({ models: [] }) });
  assert.deepEqual(models, []);
});

test('listLocalModels: a client.list() rejection (unreachable) rejects (caller maps to available:false)', async () => {
  await assert.rejects(
    () => provider.listLocalModels({ listFn: async () => { throw new Error('fetch failed'); } }),
    /fetch failed/,
  );
});

test('listLocalModels({timeoutMs}) rejects on timeout (does NOT hang; own short bound, not 300s)', async () => {
  const start = Date.now();
  await assert.rejects(
    () => provider.listLocalModels({
      timeoutMs: 20,
      listFn: () => new Promise(() => { /* never resolves */ }),
    }),
    /timed out after 20ms/,
  );
  assert.ok(Date.now() - start < 1000, 'settled fast via the bound, did not hang');
});

test('listLocalModels: malformed response (no models array) rejects (no partial/garbage list)', async () => {
  await assert.rejects(
    () => provider.listLocalModels({ listFn: async () => ({ models: 'nope' as unknown as [] }) }),
    /malformed response/,
  );
});

test('listLocalModels: an entry without a string name rejects (never fabricated into an id)', async () => {
  await assert.rejects(
    () => provider.listLocalModels({ listFn: async () => ({ models: [{ name: 'ok' }, { size: 1 }] }) }),
    /without a valid name/,
  );
});
