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

// Story E20261013b2e8109f:S001 / t4 — a diff section is shown in its latest version.
test('transcript window: a diff row is given with the content of the last later row that replaces its sid, wherever those rows sit; a withdrawn one as withdrawn; a row with replaces as it is; firstIndex and the row count do not change', () => {
  const diff = (over: Record<string, unknown>): TranscriptEntry =>
    ({ role: 'diff', path: 'a.ts', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, added: 1, removed: 0, lines: ['+v1'], at: 't', ...over }) as TranscriptEntry;
  const say = (text: string): TranscriptEntry => ({ role: 'assistant', text, at: 't' });
  const t: TranscriptEntry[] = [
    { role: 'user', text: 'go', at: 't' },
    diff({ sid: 'k-0' }), // 1: replaced twice
    diff({ sid: 'k-1', path: 'b.ts' }), // 2: never replaced
    say('between'),
    diff({ replaces: 'k-0', lines: ['+v2'] }), // 4
    diff({ sid: 'k-2', path: 'c.ts' }), // 5: withdrawn later
    say('rows of another window'),
    diff({ replaces: 'k-0', lines: ['+v3'], added: 3 }), // 7: the latest version of k-0
    diff({ replaces: 'k-2', path: 'c.ts', lines: [], withdrawn: true }), // 8
    diff({ replaces: 'k-9', lines: ['+orphan'] }), // 9: names no first row
  ];
  const before = JSON.stringify(t);
  const w = latestWindow(t);
  assert.equal(w.firstIndex, 0);
  assert.equal(w.rows.length, t.length);
  // The first row of k-0 carries the latest content, keeps its sid and has no replaces.
  assert.deepEqual(w.rows[1], diff({ sid: 'k-0', lines: ['+v3'], added: 3 }));
  assert.equal('replaces' in w.rows[1]!, false);
  assert.deepEqual(w.rows[2], t[2]);
  // The withdrawn section's first row is given as withdrawn.
  assert.deepEqual(w.rows[5], diff({ sid: 'k-2', path: 'c.ts', lines: [], withdrawn: true }));
  // Rows with replaces, the orphan included, are given as they are.
  for (const i of [4, 7, 8, 9]) assert.deepEqual(w.rows[i], t[i]);
  assert.equal(JSON.stringify(t), before, 'the transcript is not changed');

  // An older page whose replacing rows lie in a later page still shows the latest version.
  const page = pageBefore(t, 3);
  assert.equal(page.firstIndex, 0);
  assert.equal(page.rows.length, 3);
  assert.deepEqual(page.rows[1], diff({ sid: 'k-0', lines: ['+v3'], added: 3 }));
  // A page that starts after the first row: its replacing rows pass through, nothing to substitute.
  const tail = pageBefore(t, 10, 3);
  assert.deepEqual(tail.rows, t.slice(tail.firstIndex, 10));
  // A transcript with no diff rows is cut exactly as before.
  const plain = rows(250, (i) => i % 20 === 0);
  assert.deepEqual(pageBefore(plain, 250).rows, plain.slice(pageBefore(plain, 250).firstIndex, 250));
});
