import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectTree } from '../../../scripts/installer-payload.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ips-links-')), tree = join(root, 'native');
  const original = join(tree, 'build/Release/addon.node'), alias = join(tree, 'build/Release/obj.target/addon.node');
  mkdirSync(join(alias, '..'), { recursive: true });
  writeFileSync(original, 'controlled native build bytes', { mode: 0o755 }); linkSync(original, alias);
  return { root, tree, original, alias, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('payload collector snapshots complete internal native build hardlink pairs without mutating source', () => {
  const f = fixture();
  try {
    const before = lstatSync(f.original), files = collectTree(f.root, f.tree, 'node_modules/native');
    assert.equal(files.size, 2);
    for (const file of files.values()) {
      assert.equal(file.bytes.toString(), 'controlled native build bytes'); assert.equal(file.mode, (before.mode & 0o111) ? 0o755 : 0o644);
    }
    assert.equal(lstatSync(f.original).ino, before.ino); assert.equal(lstatSync(f.original).nlink, 2);
    writeFileSync(f.alias, 'changed after snapshot');
    for (const file of files.values()) assert.equal(file.bytes.toString(), 'controlled native build bytes');
  } finally { f.cleanup(); }
});

test('payload collector rejects unaccounted hardlink aliases inside or outside the source root', () => {
  for (const external of [false, true]) {
    const f = fixture(), outside = mkdtempSync(join(tmpdir(), 'ips-outside-'));
    try {
      linkSync(f.original, join(external ? outside : f.root, 'uncollected.node'));
      assert.throws(() => collectTree(f.root, f.tree, 'native'), /hardlink|alias/);
      assert.equal(readFileSync(f.original, 'utf8'), 'controlled native build bytes');
    } finally { f.cleanup(); rmSync(outside, { recursive: true, force: true }); }
  }
});

test('payload collector does not count repeated directory symlink paths as distinct inode aliases', () => {
  const f = fixture();
  try {
    // Only one of the two physical links is in the selected directory. Visiting
    // that directory twice must not make the uncollected second link safe.
    const selected = join(f.root, 'selected'); mkdirSync(selected);
    for (const name of ['one', 'two']) symlinkSync(join(f.tree, 'build/Release/obj.target'), join(selected, name), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => collectTree(f.root, selected, 'native'), /hardlink|alias/);
  } finally { f.cleanup(); }
});

test('payload collector rejects alias or content changes after collecting the complete hardlink group', () => {
  for (const kind of ['extra-alias', 'content']) {
    const f = fixture(); let changed = false;
    try {
      assert.throws(() => collectTree(f.root, f.tree, 'native', { admitFile() {
        if (changed) return; changed = true;
        if (kind === 'extra-alias') linkSync(f.original, join(f.root, 'late-alias.node'));
        else writeFileSync(f.original, 'changed native build bytes');
      } }), /changed|hardlink|alias/);
      assert.equal(changed, true, 'the complete group reached the read boundary');
    } finally { f.cleanup(); }
  }
});
