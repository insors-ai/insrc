/**
 * Epic ce99b72065d03b1b, Story s3 · t9 — scripts/sync-manifest-catalog.mjs
 * regenerates the manifest's backend-derived settings from CONFIG_CATALOG + the
 * role taxonomy and is idempotent: run on a stale copy it reproduces the committed
 * manifest, and a second run (and --check) changes nothing. ISSUE-1e2052060dec3efb
 * extends the fixtures to the repair paths: missing security section, removed final
 * role, retired role, corrupted role schema, misplaced role key, and duplicate
 * per-role sections (lossless consolidation + collision refusal).
 *
 * Run: npx tsx --test vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONFIG_CATALOG } from '../../../../src/config/config-catalog.js';
import { reasoningRoleTaxonomy } from '../../../../src/config/role-taxonomy.js';
import { buildPerRoleKeyMap, nativeRoleKey } from '../key-map.js';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = join(PLUGIN, 'scripts', 'sync-manifest-catalog.mjs');
const TSX = fileURLToPath(import.meta.resolve('tsx/esm'));

function sync(pkgPath: string, ...args: string[]): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, ['--import', TSX, SCRIPT, ...args], { env: { ...process.env, SYNC_MANIFEST_PKG: pkgPath }, encoding: 'utf8', timeout: 120_000 });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

type Section = { title: string; properties: Record<string, Record<string, unknown>>; [k: string]: unknown };
type Manifest = { contributes: { configuration: Section[] } };

const committedText = () => readFileSync(join(PLUGIN, 'package.json'), 'utf8');
const committed = () => JSON.parse(committedText()) as Manifest;
const section = (m: Manifest, title: string): Section => {
  const s = m.contributes.configuration.find((x) => x.title === title);
  assert.ok(s, `no section titled '${title}'`);
  return s;
};

// The canonical per-role section + the final taxonomy role, derived (not hardcoded).
const PER_ROLE_TITLE = buildPerRoleKeyMap()[0]!.option.group;
const ROLES = reasoningRoleTaxonomy().roles;
const ROLE_IDS = ROLES.map((r) => r.id);
const FINAL_ROLE_KEY = nativeRoleKey(ROLES[ROLES.length - 1]!.id, ROLE_IDS);
const SECURITY_GROUP = CONFIG_CATALOG.find((o) => o.path === 'models.security.runner')!.group;

function tempCopy(mutate: (m: Manifest) => void): { dir: string; copy: string; text: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sync-manifest-'));
  const m = committed();
  mutate(m);
  const text = JSON.stringify(m, null, 2) + '\n';
  const copy = join(dir, 'package.json');
  writeFileSync(copy, text);
  return { dir, copy, text };
}

test('sync-manifest-catalog.test.ts: the committed manifest is in sync, and the script is idempotent on a stale copy', () => {
  const committed = committedText();
  const check = sync(join(PLUGIN, 'package.json'), '--check');
  assert.equal(check.status, 0, check.out);

  const { dir, copy, text } = tempCopy((stale) => {
    // Stale: a changed default, a missing key and a retired one.
    const tiers = section(stale, 'Models — tiers');
    tiers.properties['insrc.models.tiers.core.model']!['default'] = '';
    delete tiers.properties['insrc.models.tiers.cheap.effort'];
    section(stale, 'Models — shaper').properties['insrc.models.shaper.ollamaNumCtx'] = { type: 'number', default: 32768, scope: 'machine' };
    // A catalog-backed key duplicated into a DIFFERENTLY titled section: the row's
    // group section owns it, so the stray copy must be removed on repair.
    section(stale, 'General').properties['insrc.models.tiers.core.model'] = { type: 'string', default: 'bogus', scope: 'machine' };
  });
  try {
    assert.equal(sync(copy, '--check').status, 1, 'a stale manifest fails --check');
    assert.equal(sync(copy).status, 0);
    const once = JSON.parse(readFileSync(copy, 'utf8')) as unknown;
    assert.deepEqual(once, JSON.parse(committed), 'the stale copy is brought back to the committed manifest');
    const after = readFileSync(copy, 'utf8');
    assert.match(sync(copy).out, /up to date/);
    assert.equal(readFileSync(copy, 'utf8'), after, 'a second run changes nothing');
    assert.ok(text !== after, 'the stale copy really was stale');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sync-manifest-catalog.test.ts: a stale copy missing the security section and the final role, carrying a retired role and a corrupted role schema, is reported by --check without writing, repaired by one sync, and byte-identical on the next, with explicit surviving and appended key order', () => {
  const { dir, copy, text } = tempCopy((stale) => {
    // The security group section is missing entirely.
    const si = stale.contributes.configuration.findIndex((s) => s.title === SECURITY_GROUP);
    assert.ok(si >= 0, 'the committed manifest carries the security section');
    stale.contributes.configuration.splice(si, 1);
    // The FINAL taxonomy role is removed, so the append rule restores its committed
    // position and the order assertion is independent of the recovery history.
    const perRole = section(stale, PER_ROLE_TITLE);
    assert.ok(FINAL_ROLE_KEY in perRole.properties, 'the committed manifest declares the final role');
    delete perRole.properties[FINAL_ROLE_KEY];
    // A retired role and a corrupted role schema.
    perRole.properties['insrc.models.tasks.retired.old'] = { type: 'string', enum: ['cheap', 'mid', 'core'], default: 'cheap', scope: 'machine' };
    const someRole = Object.keys(perRole.properties).find((k) => k.startsWith('insrc.models.tasks.'))!;
    perRole.properties[someRole] = { ...perRole.properties[someRole]!, enum: ['cheap'], default: 'cheap' };
    // Tier / shaper / retired-global mutations.
    const tiers = section(stale, 'Models — tiers');
    tiers.properties['insrc.models.tiers.core.model']!['default'] = '';
    delete tiers.properties['insrc.models.tiers.cheap.effort'];
    section(stale, 'Models — shaper').properties['insrc.models.shaper.ollamaNumCtx'] = { type: 'number', default: 32768, scope: 'machine' };
  });
  try {
    const check = sync(copy, '--check');
    assert.equal(check.status, 1, 'a stale manifest fails --check');
    assert.equal(readFileSync(copy, 'utf8'), text, '--check reports the drift WITHOUT writing');

    assert.equal(sync(copy).status, 0, 'one sync repairs');
    const onceText = readFileSync(copy, 'utf8');
    const once = JSON.parse(onceText) as Manifest;
    assert.deepEqual(once, committed(), 'one sync repairs to the committed manifest');

    // Explicit key order: surviving keys keep their committed order and the removed
    // final role is re-appended in its committed (last) position.
    const repairedKeys = Object.keys(section(once, PER_ROLE_TITLE).properties);
    const committedKeys = Object.keys(section(committed(), PER_ROLE_TITLE).properties);
    assert.deepEqual(repairedKeys, committedKeys, 'surviving + appended key order is explicit');
    assert.equal(repairedKeys[repairedKeys.length - 1], FINAL_ROLE_KEY, 'the final role is re-appended last');
    assert.ok(!('insrc.models.tasks.retired.old' in section(once, PER_ROLE_TITLE).properties), 'the retired role is gone');
    assert.ok(section(once, SECURITY_GROUP).properties['insrc.models.security.runner'], 'the missing security section is recreated');

    assert.match(sync(copy).out, /up to date/);
    assert.equal(readFileSync(copy, 'utf8'), onceText, 'the next sync is byte-identical');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sync-manifest-catalog.test.ts: a misplaced or duplicated per-role key is removed from its wrong section and regenerated in the canonical section, while unrelated local keys survive', () => {
  const { dir, copy } = tempCopy((stale) => {
    const perRole = section(stale, PER_ROLE_TITLE);
    const roleKey = Object.keys(perRole.properties).find((k) => k.startsWith('insrc.models.tasks.'))!;
    // Misplaced/duplicated: the role key also sits in another section with a wrong schema.
    section(stale, 'General').properties[roleKey] = { type: 'number', default: 1, scope: 'machine' };
    // An unrelated plugin-local key sharing the canonical section must survive.
    perRole.properties['insrc.chat.testFlag'] = { type: 'boolean', default: false, scope: 'machine' };
    // A NON-insrc property whose tail matches a retired path must survive too
    // (the retirement lookup only applies to insrc.* keys).
    section(stale, 'General').properties['other.models.embedding'] = { type: 'string', default: 'x' };
  });
  try {
    assert.equal(sync(copy).status, 0);
    const repaired = JSON.parse(readFileSync(copy, 'utf8')) as Manifest;
    const expected = committed();
    section(expected, PER_ROLE_TITLE).properties['insrc.chat.testFlag'] = { type: 'boolean', default: false, scope: 'machine' };
    section(expected, 'General').properties['other.models.embedding'] = { type: 'string', default: 'x' };
    assert.deepEqual(repaired, expected, 'the wrong-section copy is removed and the canonical section regenerated; the local keys survive');

    const roleKey = Object.keys(section(expected, PER_ROLE_TITLE).properties).find((k) => k.startsWith('insrc.models.tasks.'))!;
    const wrong = section(repaired, 'General').properties;
    assert.ok(!(roleKey in wrong), 'the misplaced role key is removed from the wrong section');
    assert.deepEqual(section(repaired, PER_ROLE_TITLE).properties[roleKey], section(expected, PER_ROLE_TITLE).properties[roleKey], 'regenerated canonically in its section');
    assert.deepEqual(section(repaired, PER_ROLE_TITLE).properties['insrc.chat.testFlag'], { type: 'boolean', default: false, scope: 'machine' }, 'the unrelated local key survives');
    assert.deepEqual(section(repaired, 'General').properties['other.models.embedding'], { type: 'string', default: 'x' }, 'a non-insrc key is never treated as a retired insrc path');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sync-manifest-catalog.test.ts: duplicate per-role sections consolidate losslessly (first section metadata kept, distinct local properties merged first-wins) and a colliding local key is refused with a diagnostic', () => {
  // Lossless consolidation.
  const a = tempCopy((stale) => {
    const perRole = section(stale, PER_ROLE_TITLE);
    perRole['markdownDescription'] = 'canonical section note'; // section-level metadata on the FIRST
    const dup: Section = JSON.parse(JSON.stringify(perRole));
    dup['order'] = 7; // DISTINCT section-level metadata the first lacks — must be preserved, not dropped
    dup.properties['insrc.chat.dupOnly'] = { type: 'boolean', default: true, scope: 'machine' }; // distinct chat-local key, merged in
    dup.properties['insrc.custom.local'] = { type: 'string', default: 'keep', scope: 'machine' }; // distinct NON-role local key, merged in and preserved
    const roleKey = Object.keys(perRole.properties).find((k) => k.startsWith('insrc.models.tasks.'))!;
    // Same role schema with REORDERED fields: equal, not conflicting — must consolidate, not refuse.
    const reordered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(perRole.properties[roleKey]!).reverse()) reordered[k] = v;
    dup.properties[roleKey] = reordered;
    stale.contributes.configuration.push(dup);
  });
  try {
    assert.equal(sync(a.copy).status, 0, 'duplicate-titled sections consolidate (reordered equal schemas do not conflict)');
    const repaired = JSON.parse(readFileSync(a.copy, 'utf8')) as Manifest;
    const withTitle = repaired.contributes.configuration.filter((s) => s.title === PER_ROLE_TITLE);
    assert.equal(withTitle.length, 1, 'one canonical section survives');
    assert.equal(withTitle[0]!['markdownDescription'], 'canonical section note', 'the FIRST section keeps its own metadata');
    assert.equal(withTitle[0]!['order'], 7, 'the duplicate\'s distinct metadata is preserved, not dropped');
    assert.deepEqual(withTitle[0]!.properties['insrc.chat.dupOnly'], { type: 'boolean', default: true, scope: 'machine' }, 'the duplicate\'s distinct chat-local key is merged first-wins');
    assert.deepEqual(withTitle[0]!.properties['insrc.custom.local'], { type: 'string', default: 'keep', scope: 'machine' }, 'a merged NON-role local property survives everywhere');
    const expected = committed();
    section(expected, PER_ROLE_TITLE).properties['insrc.chat.dupOnly'] = { type: 'boolean', default: true, scope: 'machine' };
    section(expected, PER_ROLE_TITLE).properties['insrc.custom.local'] = { type: 'string', default: 'keep', scope: 'machine' };
    (section(expected, PER_ROLE_TITLE) as Section)['markdownDescription'] = 'canonical section note';
    (section(expected, PER_ROLE_TITLE) as Section)['order'] = 7;
    assert.deepEqual(repaired, expected, 'consolidation is lossless: metadata and distinct local keys all survive');
  } finally {
    rmSync(a.dir, { recursive: true, force: true });
  }

  // Collision refusal — three same-titled sections: the FIRST does not declare the
  // key, the next introduces it and the last conflicts; the diagnostic must name
  // the two sections that actually declare it, not the first of the title.
  const b = tempCopy((stale) => {
    stale.contributes.configuration.push({ title: PER_ROLE_TITLE, properties: { 'insrc.chat.collide': { type: 'boolean', default: true, scope: 'machine' } } });
    stale.contributes.configuration.push({ title: PER_ROLE_TITLE, properties: { 'insrc.chat.collide': { type: 'string', default: 'x', scope: 'machine' } } });
  });
  try {
    const r = sync(b.copy);
    assert.notEqual(r.status, 0, 'a conflicting duplicate schema is refused');
    assert.match(r.out, /sync-duplicate-conflict/, 'the diagnostic names the refusal');
    assert.match(r.out, /insrc\.chat\.collide/, 'the diagnostic names the key');
    const n = (JSON.parse(b.text) as Manifest).contributes.configuration.length;
    assert.match(r.out, new RegExp(`#${n - 1} and #${n}\\b`), 'the diagnostic names the two declaring sections (the last two), not the first of the title');
    assert.equal(readFileSync(b.copy, 'utf8'), b.text, 'a refused conflict writes nothing');
  } finally {
    rmSync(b.dir, { recursive: true, force: true });
  }

  // Section-METADATA conflict: both duplicates declare markdownDescription with
  // different values — the LLD error contract refuses only conflicting PROPERTY
  // schemas, so metadata resolves deterministically to the FIRST section's value.
  const c = tempCopy((stale) => {
    const perRole = section(stale, PER_ROLE_TITLE);
    perRole['markdownDescription'] = 'first note';
    stale.contributes.configuration.push({ title: PER_ROLE_TITLE, properties: {}, markdownDescription: 'second note' } as Section);
  });
  try {
    const r = sync(c.copy);
    assert.equal(r.status, 0, 'conflicting section metadata consolidates (first wins; no extra error path)');
    const repaired = JSON.parse(readFileSync(c.copy, 'utf8')) as Manifest;
    const withTitle = repaired.contributes.configuration.filter((s) => s.title === PER_ROLE_TITLE);
    assert.equal(withTitle.length, 1);
    assert.equal(withTitle[0]!['markdownDescription'], 'first note', 'the FIRST section\'s metadata value wins');
  } finally {
    rmSync(c.dir, { recursive: true, force: true });
  }
});
