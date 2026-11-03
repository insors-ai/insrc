/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic ce99b72065d03b1b, Story s6 · t1 — the config gateway returns config.write's answer as the
 * daemon gives it: restartRequired on success, the daemon's reason and detail on refusal.
 *
 * Run: npx tsx --test vscode-plugin/src/config/__tests__/gateway.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { IpcClient } from '../../../../src/shared/ipc-client.js';
import { createDaemonConfigGateway } from '../gateway.js';

/** A client whose config.write answers with each scripted value in turn. */
function clientAnswering(answers: unknown[]): IpcClient {
  return {
    rpc: async (method: string) => {
      if (method !== 'config.write') throw new Error(`unexpected ${method}`);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next as never;
    },
  } as unknown as IpcClient;
}

test("gateway.test.ts: writeKey and writeKeyPath pass through the daemon's restartRequired, reason and detail, and fall back to 'refused' for a bare { ok:false }", async () => {
  const answers = [
    { ok: true, restartRequired: true },
    { ok: true },
    { ok: false, reason: 'rejected-model', detail: "models.tiers.core: model 'x' is rejected in cli-codex" },
    { ok: false },
    { ok: false, reason: 'per-repo-tier', detail: 'tiers are global' },
  ];
  const gw = createDaemonConfigGateway(clientAnswering([...answers, ...answers]));
  for (const write of [(v: unknown) => gw.writeKey('models.tiers.core', v), (v: unknown) => gw.writeKeyPath(['models', 'tiers', 'core'], v)]) {
    assert.deepEqual(await write({}), { ok: true, restartRequired: true });
    assert.deepEqual(await write({}), { ok: true });
    assert.deepEqual(await write({}), { ok: false, reason: 'rejected-model', detail: "models.tiers.core: model 'x' is rejected in cli-codex" });
    assert.deepEqual(await write({}), { ok: false, reason: 'refused' });
    assert.deepEqual(await write({}), { ok: false, reason: 'per-repo-tier', detail: 'tiers are global' });
  }

  // A socket failure still rejects.
  const down = createDaemonConfigGateway(clientAnswering([new Error('daemon is not running'), new Error('daemon is not running')]));
  await assert.rejects(down.writeKey('logLevel', 'debug'), /daemon is not running/);
  await assert.rejects(down.writeKeyPath(['logLevel'], 'debug'), /daemon is not running/);
});
