/**
 * Story E20260922401ae5fb:S001 / t6 — manifest ↔ CONFIG_CATALOG contract test.
 *
 * Locks the static native `contributes.configuration` keys to the daemon's
 * global CONFIG_CATALOG so the two never drift (the a1 authoring risk). Fails at
 * build on any missing/extra key, a wrong type/enum/default, or a non-machine
 * scope. Reads the shipped package.json + imports the ONE daemon catalog.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CONFIG_CATALOG } from '../../../../src/config/config-catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(HERE, '..', '..', '..', 'package.json'), 'utf8')) as {
  contributes?: { configuration?: unknown };
};

/** Flatten the (array-of-sections) contributes.configuration into one id→schema map. */
function declaredProperties(): Record<string, Record<string, unknown>> {
  const config = PKG.contributes?.configuration;
  const sections = Array.isArray(config) ? config : config ? [config] : [];
  const props: Record<string, Record<string, unknown>> = {};
  for (const section of sections as Array<{ properties?: Record<string, Record<string, unknown>> }>) {
    for (const [id, schema] of Object.entries(section.properties ?? {})) {
      assert.ok(!(id in props), `duplicate declared key ${id}`);
      props[id] = schema;
    }
  }
  return props;
}

const DECLARED = declaredProperties();
const jsonType = (t: string) => (t === 'enum' ? 'string' : t);

test('declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths (no missing, no extra)', () => {
  const expected = new Set(CONFIG_CATALOG.map((o) => 'insrc.' + o.path));
  // The per-role insrc.models.tasks.* keys are S002's dynamic axis (locked by a
  // separate manifest<->taxonomy contract test), not global CONFIG_CATALOG rows.
  const declared = new Set(Object.keys(DECLARED).filter((k) => !k.startsWith('insrc.models.tasks.')));

  const missing = [...expected].filter((k) => !declared.has(k));
  const extra = [...declared].filter((k) => !expected.has(k));
  assert.deepEqual(missing, [], `manifest missing keys: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `manifest has extra keys: ${extra.join(', ')}`);
});

test("each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'", () => {
  for (const option of CONFIG_CATALOG) {
    const id = 'insrc.' + option.path;
    const schema = DECLARED[id];
    assert.ok(schema, `no declared schema for ${id}`);
    assert.equal(schema.type, jsonType(option.type), `${id}: wrong type`);
    assert.deepEqual(schema.default, option.default, `${id}: wrong default`);
    assert.equal(schema.scope, 'machine', `${id}: scope must be 'machine'`);
    if (option.type === 'enum') {
      assert.deepEqual(schema.enum, [...(option.enumValues ?? [])], `${id}: wrong enum`);
    } else {
      assert.ok(!('enum' in schema), `${id}: non-enum option must not declare an enum`);
    }
  }
});
