/**
 * Story E20261013b2e8109f:S001 / t1 — the patch parser and the section reconciliation.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLAPSED_LINES,
  MAX_NEW_SECTIONS_PER_CHECK,
  MAX_SECTION_LINES,
  parsePatch,
  reconcileSections,
  type DiffSection,
  type KnownSection,
} from '../diff-sections.js';

// The patch git 2.53 printed for two edits of one file (run by hand, 2026-10-13).
const TWO_SECTIONS = [
  'diff --git a/src/a.txt b/src/a.txt',
  'index 86bba90..069e5cc 100644',
  '--- a/src/a.txt',
  '+++ b/src/a.txt',
  '@@ -1,5 +1,5 @@',
  ' l1',
  '-l2',
  '+L2 changed',
  ' l3',
  ' l4',
  ' l5',
  '@@ -15,6 +15,6 @@ l14',
  ' l15',
  ' l16',
  ' l17',
  '-l18',
  '+L18 changed',
  ' l19',
  ' l20',
  '',
].join('\n');

test('parsePatch: one entry per section, with path, ranges, counts and lines, for two sections of one file', () => {
  assert.equal(COLLAPSED_LINES, 8);
  assert.equal(MAX_SECTION_LINES, 400);
  assert.equal(MAX_NEW_SECTIONS_PER_CHECK, 20);
  assert.deepEqual(parsePatch(TWO_SECTIONS), [
    { path: 'src/a.txt', oldStart: 1, oldLines: 5, newStart: 1, newLines: 5, added: 1, removed: 1, lines: [' l1', '-l2', '+L2 changed', ' l3', ' l4', ' l5'] },
    { path: 'src/a.txt', oldStart: 15, oldLines: 6, newStart: 15, newLines: 6, added: 1, removed: 1, lines: [' l15', ' l16', ' l17', '-l18', '+L18 changed', ' l19', ' l20'] },
  ]);
});

test('parsePatch: a new file, a deleted file, a binary file, a name with a space and a quoted name', () => {
  const patch = [
    'diff --git a/bin.dat b/bin.dat',
    'new file mode 100644',
    'index 0000000..8352675',
    'Binary files /dev/null and b/bin.dat differ',
    'diff --git a/src/new file.txt b/src/new file.txt',
    'new file mode 100644',
    'index 0000000..3e75765',
    '--- /dev/null',
    '+++ b/src/new file.txt\t',
    '@@ -0,0 +1 @@',
    '+new',
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    'index 3e75765..0000000',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-one',
    '-two',
    '\\ No newline at end of file',
    'diff --git "a/tab\\there \\"q\\".txt" "b/tab\\there \\"q\\".txt"',
    'index 1..2 100644',
    '--- "a/tab\\there \\"q\\".txt"',
    '+++ "b/tab\\there \\"q\\".txt"',
    '@@ -1 +1 @@',
    '-a',
    '+b',
    'diff --git a/né.txt b/né.txt',
    'index 1..2 100644',
    '--- a/né.txt',
    '+++ b/né.txt',
    '@@ -1 +1,2 @@',
    ' x',
    '+y',
    '',
  ].join('\n');
  const got = parsePatch(patch);
  assert.deepEqual(got.map((s) => [s.path, s.fileState, s.binary, s.added, s.removed]), [
    ['bin.dat', 'new', true, 0, 0],
    ['src/new file.txt', 'new', undefined, 1, 0],
    ['gone.txt', 'deleted', undefined, 0, 2],
    ['tab\there "q".txt', undefined, undefined, 1, 1],
    ['né.txt', undefined, undefined, 1, 0],
  ]);
  assert.deepEqual(got[0]!.lines, []);
  assert.deepEqual([got[1]!.oldStart, got[1]!.oldLines, got[1]!.newStart, got[1]!.newLines], [0, 0, 1, 1]);
  // The no-newline note is kept and counted as neither added nor removed.
  assert.deepEqual(got[2]!.lines, ['-one', '-two', '\\ No newline at end of file']);
});

test('parsePatch: a section over 400 lines is cut, the rest counted in omitted, and added and removed count the whole section', () => {
  const body = Array.from({ length: 900 }, (_, n) => `+line ${n}`);
  const patch = ['diff --git a/big.txt b/big.txt', 'new file mode 100644', '--- /dev/null', '+++ b/big.txt', '@@ -0,0 +1,900 @@', ...body, ''].join('\n');
  const [s] = parsePatch(patch);
  assert.equal(s!.lines.length, 400);
  assert.equal(s!.omitted, 500);
  assert.equal(s!.added, 900);
  assert.equal(s!.removed, 0);
  assert.equal(s!.lines[399], '+line 399');
  // Exactly the limit: nothing is left out.
  const edge = ['diff --git a/e.txt b/e.txt', '--- /dev/null', '+++ b/e.txt', '@@ -0,0 +1,400 @@', ...body.slice(0, 400), ''].join('\n');
  assert.equal(parsePatch(edge)[0]!.omitted, undefined);
});

test('parsePatch: an empty patch gives no sections and an unreadable file part is skipped without a throw', () => {
  assert.deepEqual(parsePatch(''), []);
  assert.deepEqual(parsePatch('not a patch\nat all\n'), []);
  const patch = [
    'diff --git a/ok1.txt b/ok1.txt',
    '--- a/ok1.txt',
    '+++ b/ok1.txt',
    '@@ -1 +1 @@',
    '-a',
    '+b',
    'diff --git a/broken.txt b/broken.txt',
    '--- a/broken.txt',
    '+++ b/broken.txt',
    '@@ -1,3 +1,3 @@',
    ' kept',
    '?? what is this',
    ' more',
    '@@ nonsense @@',
    'diff --git a/short.txt b/short.txt',
    '--- a/short.txt',
    '+++ b/short.txt',
    '@@ -1,5 +1,5 @@',
    ' only one line',
    'diff --git a/ok2.txt b/ok2.txt',
    '--- a/ok2.txt',
    '+++ b/ok2.txt',
    '@@ -4 +4 @@',
    '-c',
    '+d',
    '',
  ].join('\n');
  assert.deepEqual(parsePatch(patch).map((s) => s.path), ['ok1.txt', 'ok2.txt']);
  // A context line whose single space was stripped is still a context line.
  const blank = ['diff --git a/b.txt b/b.txt', '--- a/b.txt', '+++ b/b.txt', '@@ -1,3 +1,3 @@', ' a', '', '-b', '+c', ''].join('\n');
  assert.deepEqual(parsePatch(blank)[0]!.lines, [' a', ' ', '-b', '+c']);
});

const sec = (path: string, oldStart: number, oldLines: number, text = 'x'): DiffSection => ({
  path, oldStart, oldLines, newStart: oldStart, newLines: oldLines, added: 1, removed: 0, lines: [`+${text}`],
});

test('reconcileSections: a new section is added, an unchanged one gives no operation and a changed one is updated under the same id', () => {
  const a = sec('a.ts', 1, 5);
  const first = reconcileSections([], [a], 0);
  assert.deepEqual(first.ops, [{ op: 'add', id: 0, section: a }]);
  assert.deepEqual(first.known, [{ id: 0, section: a, shown: true }]);
  assert.equal(first.nextId, 1);
  assert.equal(first.overflow, undefined);

  // The same sections again: nothing to do.
  const again = reconcileSections(first.known, [a], first.nextId);
  assert.deepEqual(again.ops, []);
  assert.deepEqual(again.known, first.known);

  // The section grew (an edit next to it) and a far one appeared in the same file and in another.
  const grown = sec('a.ts', 1, 9, 'grown');
  const far = sec('a.ts', 40, 6);
  const other = sec('b.ts', 1, 5);
  const third = reconcileSections(again.known, [grown, far, other], again.nextId);
  assert.deepEqual(third.ops, [
    { op: 'update', id: 0, section: grown },
    { op: 'add', id: 1, section: far },
    { op: 'add', id: 2, section: other },
  ]);
  assert.equal(third.nextId, 3);
  // A new file's one section ([0,0]) is the same section when the file changes again.
  const nf = reconcileSections([], [sec('n.ts', 0, 0, 'v1')], 0);
  assert.deepEqual(reconcileSections(nf.known, [sec('n.ts', 0, 0, 'v2')], 1).ops.map((o) => [o.op, o.id]), [['update', 0]]);
  // A binary section is the same section as the file's binary section, and no other.
  const bin: DiffSection = { path: 'i.png', oldStart: 0, oldLines: 0, newStart: 0, newLines: 0, added: 0, removed: 0, lines: [], binary: true };
  const b1 = reconcileSections([], [bin], 0);
  assert.deepEqual(reconcileSections(b1.known, [bin], 1).ops, []);
});

test('reconcileSections: sections that join update the lower id and withdraw the other, and a section that is gone is withdrawn', () => {
  const k: KnownSection[] = [
    { id: 3, section: sec('a.ts', 1, 5), shown: true },
    { id: 5, section: sec('a.ts', 12, 5), shown: true },
    { id: 7, section: sec('b.ts', 1, 5), shown: true },
  ];
  const joined = sec('a.ts', 1, 16, 'joined');
  const r = reconcileSections(k, [joined], 8);
  assert.deepEqual(r.ops, [
    { op: 'update', id: 3, section: joined },
    { op: 'withdraw', id: 5 },
    { op: 'withdraw', id: 7 },
  ]);
  assert.deepEqual(r.known, [{ id: 3, section: joined, shown: true }]);
  // Nothing left: everything is withdrawn.
  assert.deepEqual(reconcileSections(r.known, [], 8).ops, [{ op: 'withdraw', id: 3 }]);
  // A section that splits keeps its id on the first part; the second part is new.
  const split = reconcileSections(r.known, [sec('a.ts', 1, 4), sec('a.ts', 10, 4)], 8);
  assert.deepEqual(split.ops.map((o) => [o.op, o.id]), [['update', 3], ['add', 8]]);
});

test('reconcileSections: beyond the limit new sections are kept hidden, counted in overflow, and never produce an operation later', () => {
  const many = Array.from({ length: 35 }, (_, n) => sec(`f${n % 7}.ts`, 1 + n * 20, 5));
  const r = reconcileSections([], many, 0);
  assert.equal(r.ops.length, 20);
  assert.ok(r.ops.every((o) => o.op === 'add'));
  assert.deepEqual(r.overflow, { sections: 15, files: 7 });
  assert.equal(r.known.filter((k) => !k.shown).length, 15);
  assert.equal(r.nextId, 35);

  // Next check: the hidden ones are known, so they are not new; one changes, one goes: no operation.
  const next = many.slice(0, 34).map((s, n) => (n === 30 ? { ...s, lines: ['+changed'] } : s));
  const r2 = reconcileSections(r.known, next, r.nextId);
  assert.deepEqual(r2.ops, []);
  assert.equal(r2.overflow, undefined);
  assert.equal(r2.known.length, 34);
  assert.equal(r2.known[30]!.shown, false);

  // A smaller limit, given as an argument.
  const small = reconcileSections([], many.slice(0, 3), 0, 2);
  assert.deepEqual(small.ops.map((o) => o.op), ['add', 'add']);
  assert.deepEqual(small.overflow, { sections: 1, files: 1 });
});
