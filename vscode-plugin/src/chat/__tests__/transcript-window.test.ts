/**
 * Story E20261012ddc4ede1:S001 t1 — the page-cutting rule.
 *
 *   npx tsx --test src/chat/__tests__/transcript-window.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_ROWS, latestWindow, pageBefore } from '../transcript-window.js';
import type { TranscriptEntry } from '../session-store.js';

/** `n` rows; a user row at every index in `userAt`, an assistant row elsewhere. Text is the index. */
function rows(n: number, userAt: (i: number) => boolean): TranscriptEntry[] {
  return Array.from({ length: n }, (_, i): TranscriptEntry => ({ role: userAt(i) ? 'user' : 'assistant', text: String(i), at: 't' }));
}
const texts = (r: readonly TranscriptEntry[]): string[] => r.map((x) => (x as { text: string }).text);

test('latestWindow: a transcript no longer than one page is returned whole with firstIndex 0', () => {
  assert.equal(PAGE_ROWS, 100, 'the page size is a fixed constant');
  for (const n of [0, 1, 99, 100]) {
    const t = rows(n, (i) => i % 7 === 3);
    const w = latestWindow(t);
    assert.equal(w.firstIndex, 0, `${n} rows`);
    assert.deepEqual(texts(w.rows), texts(t));
  }
});

test('latestWindow: a long transcript returns its last page, moved back to the start of the turn when a user row is within one more page, and never more than two pages of rows', () => {
  // A user row every 20 rows: the plain cut at 900 is itself a user row.
  const even = rows(1000, (i) => i % 20 === 0);
  assert.equal(latestWindow(even).firstIndex, 900);
  // A user row every 70 rows: the plain cut (900) is mid-turn, and the turn started at 840.
  assert.equal(latestWindow(rows(1000, (i) => i % 70 === 0)).firstIndex, 840);
  // A user row only at 850: the start moves back from 900 to 850.
  const one = rows(1000, (i) => i === 850);
  const w = latestWindow(one);
  assert.equal(w.firstIndex, 850);
  assert.equal(w.rows.length, 150);
  assert.equal(w.rows[0]!.role, 'user');
  // The farthest it can move is one more page: a user row at exactly 800 is used, one at 799 is not.
  assert.equal(latestWindow(rows(1000, (i) => i === 800)).firstIndex, 800);
  assert.equal(latestWindow(rows(1000, (i) => i === 800)).rows.length, 2 * PAGE_ROWS, 'never more than two pages');
  assert.equal(latestWindow(rows(1000, (i) => i === 799)).firstIndex, 900, 'out of reach: the plain cut');
  // The NEAREST user row at or before the plain cut wins.
  assert.equal(latestWindow(rows(1000, (i) => i === 820 || i === 880)).firstIndex, 880);
});

test('latestWindow and pageBefore: with no user row within reach the cut is the plain page; consecutive pages cover every row exactly once', () => {
  const none = rows(350, () => false);
  const w = latestWindow(none);
  assert.deepEqual([w.firstIndex, w.rows.length], [250, 100]);
  const p1 = pageBefore(none, w.firstIndex);
  assert.deepEqual([p1.firstIndex, p1.rows.length], [150, 100]);
  const p2 = pageBefore(none, p1.firstIndex);
  const p3 = pageBefore(none, p2.firstIndex);
  assert.deepEqual([p2.firstIndex, p3.firstIndex, p3.rows.length], [50, 0, 50]);
  assert.deepEqual([...texts(p3.rows), ...texts(p2.rows), ...texts(p1.rows), ...texts(w.rows)], texts(none));
  // A caller-given page size is honoured.
  assert.deepEqual(texts(latestWindow(rows(10, () => false), 4).rows), ['6', '7', '8', '9']);
});

test('pageBefore: before is clamped to 0..length; at 0 it returns no rows and firstIndex 0', () => {
  const t = rows(250, (i) => i % 50 === 0);
  assert.deepEqual(pageBefore(t, 0), { firstIndex: 0, rows: [] });
  assert.deepEqual(pageBefore(t, -5), { firstIndex: 0, rows: [] });
  const over = pageBefore(t, 9999);
  assert.deepEqual([over.firstIndex, over.rows.length], [150, 100], 'clamped to the length');
  assert.deepEqual(over, latestWindow(t));
  assert.deepEqual(pageBefore(t, 30).firstIndex, 0, 'fewer rows than a page: from the start');
  assert.equal(pageBefore(t, 30).rows.length, 30);
  assert.deepEqual(pageBefore([], 3), { firstIndex: 0, rows: [] });
});

test('walking pageBefore from the latest window down to 0 reproduces the whole transcript in order with no row skipped or repeated', () => {
  for (const [n, userAt] of [
    [1000, (i: number) => i % 20 === 0],
    [1000, (i: number) => i % 137 === 5],
    [733, (i: number) => i === 0 || i === 400],
    [512, () => false],
  ] as Array<[number, (i: number) => boolean]>) {
    const t = rows(n, userAt);
    const pages = [latestWindow(t)];
    while (pages[0]!.firstIndex > 0) {
      const p = pageBefore(t, pages[0]!.firstIndex);
      assert.ok(p.rows.length > 0 && p.rows.length <= 2 * PAGE_ROWS, 'each page is non-empty and at most two pages of rows');
      assert.ok(p.firstIndex < pages[0]!.firstIndex, 'each request moves back');
      pages.unshift(p);
    }
    assert.deepEqual(pages.flatMap((p) => texts(p.rows)), texts(t), `${n} rows`);
    assert.deepEqual(pageBefore(t, 0), { firstIndex: 0, rows: [] }, 'nothing older than index 0');
  }
});
