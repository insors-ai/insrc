/**
 * Story E20260922401ae5fb:S002 / t6 — per-role key-map + manifest↔taxonomy tests.
 *
 * Proves buildPerRoleKeyMap projects the fixed reasoning-role taxonomy into
 * correct per-role entries (dot-safe segments, enum option, default=defaultTier),
 * the merged key map is collision-free, and the declared native manifest keys
 * exactly cover the taxonomy — all off VS Code.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildPerRoleKeyMap, buildMergedKeyMap, nativeRoleKey, TIER_VALUES } from '../key-map.js';
import { reasoningRoleTaxonomy } from '../../../../src/config/role-taxonomy.js';

const ROLES = reasoningRoleTaxonomy().roles;

// ── buildPerRoleKeyMap ────────────────────────────────────────────────────────

test('buildPerRoleKeyMap returns one entry per taxonomy role with the right shape', () => {
  const entries = buildPerRoleKeyMap();
  assert.equal(entries.length, ROLES.length); // one per role of the taxonomy

  for (const role of ROLES) {
    const entry = entries.find((e) => e.path === `models.tasks.${role.id}`);
    assert.ok(entry, `no per-role entry for ${role.id}`);
    assert.equal(entry.nativeKey, nativeRoleKey(role.id, ROLES.map((r) => r.id)));
    assert.deepEqual(entry.segments, ['models', 'tasks', role.id]);
    assert.equal(entry.source, 'raw');
    assert.equal(entry.option.type, 'enum');
    assert.deepEqual(entry.option.enumValues, TIER_VALUES);
    assert.equal(entry.option.default, role.defaultTier);
  }
});

test('a dotted roleId yields the roleId as a SINGLE literal 3rd segment (not a dot-split)', () => {
  const entries = buildPerRoleKeyMap();
  const dotted = entries.find((e) => e.path === 'models.tasks.context.assemble');
  assert.ok(dotted, "expected a 'context.assemble' role entry");
  assert.deepEqual(dotted.segments, ['models', 'tasks', 'context.assemble']); // exactly 3 elements
  assert.equal(dotted.segments!.length, 3);
});

test('the merged (global + per-role) key map resolves both a global and a per-role key by nativeKey without collision', () => {
  const merged = buildMergedKeyMap();
  const global = merged.byNativeKey('insrc.logLevel'); // an S001 global key
  const perRole = merged.byNativeKey('insrc.models.tasks.context.assemble');
  assert.ok(global, 'global key insrc.logLevel not resolved in merged map');
  assert.equal(global.segments, undefined); // global keys carry no segments
  assert.ok(perRole, 'per-role key not resolved in merged map');
  assert.deepEqual(perRole.segments, ['models', 'tasks', 'context.assemble']);
  // No native-key collision: the merged entry count is the sum of both maps.
  const nativeKeys = new Set(merged.entries.map((e) => e.nativeKey));
  assert.equal(nativeKeys.size, merged.entries.length);
});

// ── manifest ↔ taxonomy contract ──────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(HERE, '..', '..', '..', 'package.json'), 'utf8')) as {
  contributes?: { configuration?: unknown };
};

function declaredProperties(): Record<string, Record<string, unknown>> {
  const config = PKG.contributes?.configuration;
  const sections = Array.isArray(config) ? config : config ? [config] : [];
  const props: Record<string, Record<string, unknown>> = {};
  for (const section of sections as Array<{ properties?: Record<string, Record<string, unknown>> }>) {
    for (const [id, schema] of Object.entries(section.properties ?? {})) props[id] = schema;
  }
  return props;
}
const DECLARED = declaredProperties();

test('declared insrc.models.tasks.* keys EXACTLY cover the role taxonomy (no missing, no extra)', () => {
  const expected = new Set(ROLES.map((r) => nativeRoleKey(r.id, ROLES.map((x) => x.id))));
  const declared = new Set(Object.keys(DECLARED).filter((k) => k.startsWith('insrc.models.tasks.')));
  const missing = [...expected].filter((k) => !declared.has(k));
  const extra = [...declared].filter((k) => !expected.has(k));
  assert.deepEqual(missing, [], `manifest missing per-role keys: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `manifest has extra per-role keys: ${extra.join(', ')}`);
});

test("each per-role key is a machine-scoped enum with default = the role's defaultTier", () => {
  for (const role of ROLES) {
    const schema = DECLARED[nativeRoleKey(role.id, ROLES.map((r) => r.id))];
    assert.ok(schema, `no declared schema for ${role.id}`);
    assert.equal(schema.type, 'string');
    assert.deepEqual(schema.enum, [...TIER_VALUES]);
    assert.equal(schema.default, role.defaultTier);
    assert.equal(schema.scope, 'machine');
  }
});

// ── nested settings ids (ISSUE-8d7b4704660a5866) ────────────────────────────────

test('nativeRoleKey keeps a role id as it is, and joins a role that extends another role onto its parent in camel case', () => {
  const ids = ['tools.convert', 'tools.convert.escalate', 'context.assemble', 'review'];
  assert.equal(nativeRoleKey('review', ids), 'insrc.models.tasks.review');
  assert.equal(nativeRoleKey('context.assemble', ids), 'insrc.models.tasks.context.assemble');
  assert.equal(nativeRoleKey('tools.convert', ids), 'insrc.models.tasks.tools.convert');
  assert.equal(nativeRoleKey('tools.convert.escalate', ids), 'insrc.models.tasks.tools.convertEscalate');
  assert.equal(nativeRoleKey('a.b.c.d', ['a.b', 'a.b.c.d']), 'insrc.models.tasks.a.bCD');
});

test('the convert escalation role keeps its catalog path and maps to the non-nested native id', () => {
  const merged = buildMergedKeyMap();
  const entry = merged.byPath('models.tasks.tools.convert.escalate');
  assert.ok(entry);
  assert.equal(entry.nativeKey, 'insrc.models.tasks.tools.convertEscalate');
  assert.deepEqual(entry.segments, ['models', 'tasks', 'tools.convert.escalate']);
  assert.equal(merged.byNativeKey('insrc.models.tasks.tools.convert.escalate'), undefined);
});

test('no declared setting id and no key-map native id is a dotted prefix of another (VS Code cannot nest a child under a value)', () => {
  const declared = Object.keys(DECLARED);
  const mapped = buildMergedKeyMap().entries.map((e) => e.nativeKey);
  for (const [label, keys] of [['manifest', declared], ['key map', mapped]] as const) {
    const clashes = keys.flatMap((a) => keys.filter((b) => b.startsWith(a + '.')).map((b) => `${a} / ${b}`));
    assert.deepEqual(clashes, [], `${label}: a native id is a dotted child of another`);
  }
});
