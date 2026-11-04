/**
 * ISSUE-8d7b4704660a5866 — a value under a renamed native settings id moves to the new id once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMergedKeyMap } from '../key-map.js';
import { LEGACY_NATIVE_KEYS, migrateLegacyKeys } from '../legacy-keys.js';
import type { ChangedKey } from '../types.js';

const LEGACY = 'insrc.models.tasks.tools.convert.escalate';
const CURRENT = 'insrc.models.tasks.tools.convertEscalate';

function world(values: Record<string, unknown>) {
  const applied: ChangedKey[] = [];
  const cleared: string[] = [];
  return {
    applied, cleared,
    deps: {
      keyMap: buildMergedKeyMap(),
      read: (key: string) => values[key],
      apply: async (changed: readonly ChangedKey[]) => { applied.push(...changed); },
      clear: async (key: string) => { cleared.push(key); },
    },
  };
}

test('the renamed escalation id is in the legacy list and its replacement is a mapped id', () => {
  assert.deepEqual(LEGACY_NATIVE_KEYS.map((k) => [k.legacy, k.current]), [[LEGACY, CURRENT]]);
  assert.ok(buildMergedKeyMap().byNativeKey(CURRENT));
  assert.equal(buildMergedKeyMap().byNativeKey(LEGACY), undefined);
});

test('a valid value under the old id moves to the new id when the new id still shows its default, and the old id is cleared', async () => {
  const w = world({ [LEGACY]: 'core', [CURRENT]: 'mid' });   // mid is the default of the role
  assert.deepEqual(await migrateLegacyKeys(w.deps), [CURRENT]);
  assert.deepEqual(w.applied, [{ key: CURRENT, value: 'core' }]);
  assert.deepEqual(w.cleared, [LEGACY]);
});

test('a value already held under the new id, an invalid value or no value is never moved', async () => {
  const held = world({ [LEGACY]: 'core', [CURRENT]: 'cheap' });
  assert.deepEqual(await migrateLegacyKeys(held.deps), []);
  assert.deepEqual(held.applied, []);
  const invalid = world({ [LEGACY]: 'ultra', [CURRENT]: 'mid' });
  assert.deepEqual(await migrateLegacyKeys(invalid.deps), []);
  assert.deepEqual(invalid.applied, []);
  const none = world({});
  assert.deepEqual(await migrateLegacyKeys(none.deps), []);
  assert.deepEqual(none.cleared, []);
});

test('a failing clear or apply never throws', async () => {
  const w = world({ [LEGACY]: 'core', [CURRENT]: 'mid' });
  const deps = { ...w.deps, clear: async () => { throw new Error('Unable to write to User Settings because it is not a registered configuration.'); } };
  assert.deepEqual(await migrateLegacyKeys(deps), [CURRENT]);
  const broken = { ...w.deps, apply: async () => { throw new Error('daemon down'); } };
  assert.deepEqual(await migrateLegacyKeys(broken), []);
});
