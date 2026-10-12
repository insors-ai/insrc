/**
 * Story E20261012ddc4ede1:S001 — the webview transcript pager.
 *
 * The pager source is evaluated against the shared fake DOM (fake-dom.ts) and drives the REAL
 * render registry through a line() that appends through the pager, as the shell's does, so the
 * scroll behaviour is observed and not assumed.
 *
 *   npx tsx --test src/chat/__tests__/transcript-pager.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { bodyStub, fire, type BodyStub } from './fake-dom.js';
import { renderRegistryWebviewSource } from '../render-registry.js';
import { KEEP_ROWS, LOAD_WAIT_MS, MAX_HELD_ROWS, transcriptPagerWebviewSource } from '../transcript-pager.js';

// The registry renders assistant markdown through the bundled `marked` global.
(globalThis as unknown as { marked: unknown }).marked = marked;

const ROW_PX = 10;
const VIEW_PX = 100;

interface Pager {
  attach(reg: unknown): void;
  append(node: BodyStub): BodyStub;
  stamp(from: number, rowIndex?: number): void;
  track<T>(rowIndex: number | undefined, fn: () => T): T;
  trimIfNeeded(): boolean;
  reset(sessionId: string, firstIndex: number, total: number): void;
  atBottom(): boolean;
  state(): { sessionId: string; first: number; last: number; total: number; loading: boolean };
  prepend(page: unknown): boolean;
  requestOlder(): boolean;
}
interface Registry {
  renderRow(vm: unknown): BodyStub | null;
  appendKeyed(vm: unknown, key: string | null): BodyStub | null;
  toViewModel(entry: unknown): unknown;
}

/**
 * A transcript element whose height follows its rows (ROW_PX each) in a VIEW_PX viewport, and
 * whose scrollTop is clamped as a browser's is, with the 'load earlier' bar, the host channel and
 * the timer the pager is given. The pager and the real registry are built on it.
 */
interface View {
  term: BodyStub;
  bar: BodyStub;
  pager: Pager;
  reg: Registry;
  maxTop: () => number;
  /** Messages the pager posted to the host. */
  posted: Array<Record<string, unknown>>;
  /** Every value written to scrollTop, in order. */
  scrollWrites: number[];
  /** Run the pager's pending timers (the load wait). */
  runTimers: () => void;
}
function makeView(): View {
  const term = bodyStub('div', 'insrc-term');
  const bar = bodyStub('div', 'insrc-older');
  term.clientHeight = VIEW_PX;
  let top = 0;
  const scrollWrites: number[] = [];
  const maxTop = (): number => Math.max(0, term.children.length * ROW_PX - VIEW_PX);
  Object.defineProperty(term, 'scrollHeight', { get: () => term.children.length * ROW_PX });
  Object.defineProperty(term, 'scrollTop', { get: () => Math.min(top, maxTop()), set: (v: number) => { scrollWrites.push(v); top = Math.max(0, Math.min(v, maxTop())); } });
  const posted: Array<Record<string, unknown>> = [];
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  const opts = {
    bar,
    post: (m: Record<string, unknown>) => { posted.push(m); },
    setTimeout: (fn: () => void, ms: number) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimeout: (t: { live: boolean }) => { t.live = false; },
  };
  // eslint-disable-next-line no-eval
  const pager = (eval(`(${transcriptPagerWebviewSource()})`) as (t: BodyStub, o: unknown) => Pager)(term, opts);
  // The shell's line(): the node joins the terminal through the pager.
  const line = (s: string, cls?: string): BodyStub => {
    const d = bodyStub('div');
    if (cls) d.className = cls;
    d.textContent = s;
    return pager.append(d);
  };
  // eslint-disable-next-line no-eval
  const reg = (eval(`(${renderRegistryWebviewSource()})`) as (doc: unknown, line: unknown) => Registry)({ createElement: (t: string) => bodyStub(t) }, line);
  pager.attach(reg);
  const runTimers = (): void => { for (const t of timers.splice(0)) if (t.live) { assert.equal(t.ms, LOAD_WAIT_MS, 'the wait is the fixed constant'); t.fn(); } };
  return { term, bar, pager, reg, maxTop, posted, scrollWrites, runTimers };
}

/** Render one live row as the shell does: through the registry, stamped with its row index. */
function liveRow(v: { pager: Pager; reg: Registry }, rowIndex: number, kind: 'user' | 'assistant'): BodyStub | null {
  return v.pager.track(rowIndex, () =>
    kind === 'user'
      ? v.reg.appendKeyed(v.reg.toViewModel({ role: 'user', text: `q${rowIndex}`, at: 't' }), `r${rowIndex}`)
      : v.reg.renderRow(v.reg.toViewModel({ kind: 'assistant-delta', turnId: 't', text: `a${rowIndex}` })));
}
/** Rows [from, to): a user row at every multiple of `turn`, assistant rows between. */
function liveRows(v: { pager: Pager; reg: Registry }, from: number, to: number, turn: number): void {
  for (let i = from; i < to; i++) liveRow(v, i, i % turn === 0 ? 'user' : 'assistant');
}
const isUser = (n: BodyStub): boolean => n.className.split(' ').includes('insrc-msg--user');

test('a live row rendered by the registry while the view is scrolled up leaves scrollTop unchanged and trims nothing, even with more than 300 rows held', () => {
  const v = makeView();
  liveRows(v, 0, 250, 20);
  assert.equal(v.term.scrollTop, v.maxTop(), 'at the bottom so far');
  v.term.scrollTop = 500; // the reader scrolls up to read older rows
  assert.equal(v.pager.atBottom(), false);
  liveRows(v, 250, 360, 20); // the turn keeps streaming
  assert.equal(v.term.scrollTop, 500, 'the view did not move');
  assert.equal(v.term.children.length, 360, 'nothing was removed');
  assert.deepEqual(v.pager.state(), { sessionId: '', first: 0, last: 359, total: 360, loading: false });
  assert.ok(v.pager.state().last - v.pager.state().first + 1 > MAX_HELD_ROWS, 'more than the limit is held');
  assert.equal(v.pager.trimIfNeeded(), false, 'and a trim asked for now still does nothing');
});

test('a live row rendered by the registry while the view is at the bottom moves the view to the bottom; with more than 300 rows held the oldest nodes are then removed back to a user row leaving about 200, and the view is still at the bottom', () => {
  assert.deepEqual([MAX_HELD_ROWS, KEEP_ROWS], [300, 200], 'the sizes are fixed constants');
  const v = makeView();
  liveRows(v, 0, 300, 20);
  assert.equal(v.term.children.length, 300, 'exactly the limit: nothing trimmed yet');
  assert.equal(v.term.scrollTop, v.maxTop(), 'each row was followed to the bottom');
  liveRow(v, 300, 'user'); // the 301st row
  const s = v.pager.state();
  // Target start is 300 - 200 + 1 = 101; the nearest turn start at or before it is row 100.
  assert.deepEqual([s.first, s.last], [100, 300]);
  assert.equal(v.term.children.length, 201, 'about 200 rows are left');
  assert.ok(isUser(v.term.children[0]!), 'the first held row starts a turn');
  assert.equal(v.term.scrollTop, v.maxTop(), 'still at the bottom');
  assert.equal(v.pager.atBottom(), true);
  // The removed rows' keys are forgotten: the user row at index 0 renders a new node when asked again.
  const again = v.reg.appendKeyed(v.reg.toViewModel({ role: 'user', text: 'q0', at: 't' }), 'r0');
  assert.equal(again?.parentNode, v.term, 'a trimmed row renders again');
  // A held row's key is kept: asking again returns the node already shown.
  assert.equal(v.reg.appendKeyed(v.reg.toViewModel({ role: 'user', text: 'q100', at: 't' }), 'r100'), v.term.children[0]);
});

test('one turn longer than 300 rows is trimmed by a plain cut, and a pending tool row in the removed range is dropped so a later result renders as its own row', () => {
  const v = makeView();
  liveRow(v, 0, 'user');
  // A tool call early in the turn whose result has not arrived yet.
  v.pager.track(1, () => v.reg.renderRow(v.reg.toViewModel({ kind: 'tool-call', turnId: 't', tool: 'Bash', command: 'npm test', callId: 'call-1' })));
  for (let i = 2; i <= 300; i++) liveRow(v, i, 'assistant');
  // 301 rows, one user row (index 0, the first held): no turn start to cut at, so the cut is plain.
  const s = v.pager.state();
  assert.deepEqual([s.first, s.last], [101, 300]);
  assert.equal(v.term.children.length, 200);
  assert.ok(!v.term.children.some(isUser), 'the cut is not at a user row');
  assert.equal(v.term.scrollTop, v.maxTop());
  // The tool row was removed with the rows around it. Its result now arrives: it must be visible.
  const before = v.term.children.length;
  const result = v.pager.track(301, () => v.reg.renderRow(v.reg.toViewModel({ kind: 'tool-result', turnId: 't', command: 'npm test', output: 'ok', callId: 'call-1' })));
  assert.equal(v.term.children.length, before + 1, 'the result is a new row in the view');
  assert.equal(result?.parentNode, v.term, 'not attached inside the removed tool row');
  assert.ok(result!.className.includes('insrc-msg--toolresult'));
});

test('pager reset: a restore sets the first held index and total and ends at the bottom', () => {
  const v = makeView();
  liveRows(v, 0, 150, 20);
  v.term.scrollTop = 200; // the reader had scrolled up
  // The shell clears the transcript element, then resets the pager for the restored window.
  v.term.textContent = '';
  v.pager.reset('sess-9', 800, 1000);
  assert.deepEqual(v.pager.state(), { sessionId: 'sess-9', first: 800, last: 799, total: 1000, loading: false });
  assert.equal(v.pager.atBottom(), true, 'following is on again');
  // The restored rows are replayed with their absolute indexes and the view ends at the bottom.
  liveRows(v, 800, 1000, 20);
  assert.deepEqual(v.pager.state(), { sessionId: 'sess-9', first: 800, last: 999, total: 1000, loading: false });
  assert.equal(v.term.children.length, 200);
  assert.equal(v.term.scrollTop, v.maxTop(), 'ends at the bottom');
  // A reset with no index (a short session posted whole) starts at 0.
  v.term.textContent = '';
  v.pager.reset('sess-1', 0, 3);
  assert.deepEqual(v.pager.state(), { sessionId: 'sess-1', first: 0, last: -1, total: 3, loading: false });
  // A live row past the restored total raises the total.
  liveRows(v, 0, 5, 20);
  assert.equal(v.pager.state().total, 5);
});

// ---- t6: older pages, load requests and the bar ----

type Row = { role: 'user' | 'assistant'; text: string; at: string };
/** Stored rows [from, to): a user row at every multiple of `turn`, assistant rows between. */
function storedRows(from: number, to: number, turn: number): Row[] {
  return Array.from({ length: to - from }, (_, k): Row => { const i = from + k; return i % turn === 0 ? { role: 'user', text: `q${i}`, at: 't' } : { role: 'assistant', text: `a${i}`, at: 't' }; });
}
/** A view restored for session `sid` holding rows [first, total), as the shell replays them. */
function restored(sid: string, first: number, total: number, turn = 20): View {
  const v = makeView();
  v.pager.reset(sid, first, total);
  storedRows(first, total, turn).forEach((row, k) => v.pager.track(first + k, () => v.reg.appendKeyed(v.reg.toViewModel(row), `r${first + k}`)));
  return v;
}
const page = (sid: string, firstIndex: number, before: number, total: number, turn = 20): Record<string, unknown> =>
  ({ type: 'transcript-page', sessionId: sid, before, firstIndex, rows: storedRows(firstIndex, before, turn), total });
/** The text of each row node, read from wherever its renderer put it. */
const rowText = (n: BodyStub): string => {
  const all = (x: BodyStub): BodyStub[] => [x, ...x.children.flatMap(all)];
  const hit = all(n).map((x) => `${x.textContent} ${x.innerHTML}`).join(' ').match(/[qa]\d+/);
  return hit ? hit[0] : '';
};

test('pager prepend: an older page is rendered above the held rows in transcript order, keyed r<absolute index>; scrollTop grows by exactly the height added and the view is never moved to the bottom while the page renders', () => {
  const v = restored('s1', 900, 1000);
  assert.equal(v.term.children.length, 100);
  v.term.scrollTop = 30; // the reader is near the top, looking at the row at 30px
  const topRow = v.term.children[3]!;
  v.scrollWrites.length = 0;
  assert.equal(v.pager.prepend(page('s1', 800, 900, 1000)), true);
  assert.equal(v.term.children.length, 200);
  assert.deepEqual(v.term.children.map(rowText), storedRows(800, 1000, 20).map((r) => r.text), 'rows 800..999 in transcript order');
  assert.deepEqual([v.pager.state().first, v.pager.state().last], [800, 999]);
  // 100 rows of 10px were added above: the reader's row is 1,000px further down, and so is the view.
  assert.deepEqual(v.scrollWrites, [30 + 100 * ROW_PX], 'scrollTop was written once: the old position plus the height added');
  assert.equal(v.term.scrollTop, 1030);
  assert.equal(v.term.children.indexOf(topRow) * ROW_PX - v.term.scrollTop, 0, 'the row the reader was looking at is where it was on screen');
  assert.ok(v.term.scrollTop < v.maxTop(), 'the view is not at the bottom');
  // Keyed by absolute index: asking for a page row again returns the node already shown.
  assert.equal(v.reg.appendKeyed(v.reg.toViewModel({ role: 'user', text: 'q800', at: 't' }), 'r800'), v.term.children[0]);
  // A live row arriving now (the reader is still up in older rows) does not move the view.
  v.pager.track(1000, () => v.reg.renderRow(v.reg.toViewModel({ kind: 'assistant-delta', turnId: 't', text: 'a1000' })));
  assert.equal(v.term.scrollTop, 1030);
});

test('pager prepend: a page for another session, or whose before is not the first held index, is discarded and adds no row', () => {
  const v = restored('s1', 900, 1000);
  const before = v.term.children.length;
  assert.equal(v.pager.prepend(page('other-session', 800, 900, 1000)), false, 'another session');
  assert.equal(v.pager.prepend(page('s1', 700, 800, 1000)), false, 'ends before the first held row');
  assert.equal(v.pager.prepend(page('s1', 850, 950, 1000)), false, 'overlaps the held rows');
  assert.equal(v.pager.prepend(undefined), false);
  assert.equal(v.term.children.length, before, 'no row was added');
  assert.equal(v.pager.state().first, 900);
  // The right page applies once; the same page again (a duplicate) is discarded.
  assert.equal(v.pager.prepend(page('s1', 800, 900, 1000)), true);
  assert.equal(v.pager.prepend(page('s1', 800, 900, 1000)), false, 'a duplicate');
  assert.equal(v.term.children.length, before + 100);
  // An empty page (nothing older) adds nothing.
  const z = restored('s2', 0, 50);
  assert.equal(z.pager.prepend({ type: 'transcript-page', sessionId: 's2', before: 0, firstIndex: 0, rows: [], total: 50 }), false);
  assert.equal(z.term.children.length, 50);
});

test('trimmed rows render again when their page comes back: the dropped keys are forgotten, so appendKeyed renders new nodes', () => {
  const v = makeView();
  v.pager.reset('s1', 0, 0);
  liveRows(v, 0, 301, 20); // trims to rows 100..300
  assert.equal(v.pager.state().first, 100);
  assert.equal(v.term.children.length, 201);
  const firstHeld = v.term.children[0]!;
  // The reader asks for the earlier rows: the host answers with rows 0..99.
  assert.equal(v.pager.prepend(page('s1', 0, 100, 301)), true);
  assert.equal(v.term.children.length, 301, 'the trimmed rows are rendered again');
  assert.deepEqual(v.term.children.slice(0, 100).map(rowText), storedRows(0, 100, 20).map((r) => r.text));
  assert.equal(v.term.children[100], firstHeld, 'above the rows that were held');
  assert.ok(v.term.children.slice(0, 100).every((n) => n.parentNode === v.term));
  assert.equal(v.pager.state().first, 0);
});

test('pager load request: one load-older is sent for the first held index on a bar click or a scroll to the top; no second request is sent while one is loading; the flag clears on the matching page, on a restore and after 5 seconds', () => {
  assert.equal(LOAD_WAIT_MS, 5000);
  const v = restored('s1', 900, 1000);
  // A bar click asks for the page before the first held row.
  fire(v.bar, 'click');
  assert.deepEqual(v.posted, [{ type: 'load-older', sessionId: 's1', before: 900 }]);
  assert.equal(v.pager.state().loading, true);
  // While it is loading, neither another click nor a scroll to the top asks again.
  fire(v.bar, 'click');
  v.term.scrollTop = 0;
  fire(v.term, 'scroll');
  assert.equal(v.posted.length, 1, 'one request at a time');
  // The matching page clears the flag.
  v.pager.prepend(page('s1', 800, 900, 1000));
  assert.equal(v.pager.state().loading, false);
  // A scroll to the top asks for the next page; a scroll elsewhere does not.
  v.term.scrollTop = 400;
  fire(v.term, 'scroll');
  assert.equal(v.posted.length, 1, 'not at the top: no request');
  v.term.scrollTop = 0;
  fire(v.term, 'scroll');
  assert.deepEqual(v.posted[1], { type: 'load-older', sessionId: 's1', before: 800 });
  // No page ever answers: after the wait the reader can ask again.
  fire(v.bar, 'click');
  assert.equal(v.posted.length, 2, 'still waiting');
  v.runTimers();
  assert.equal(v.pager.state().loading, false, 'the wait gave up');
  fire(v.bar, 'click');
  assert.equal(v.posted.length, 3);
  // A page that does not match leaves the wait running; a restore clears it.
  v.pager.prepend(page('other', 700, 800, 1000));
  assert.equal(v.pager.state().loading, true);
  v.term.textContent = '';
  v.pager.reset('s1', 900, 1000);
  assert.equal(v.pager.state().loading, false, 'a restore clears the flag');
  v.runTimers(); // the cancelled timer does nothing
  assert.equal(v.pager.state().loading, false);
  // Nothing older (first held index 0): no request at all.
  const z = restored('s2', 0, 50);
  fire(z.bar, 'click');
  z.term.scrollTop = 0;
  fire(z.term, 'scroll');
  assert.equal(z.posted.length, 0);
});

test('returning to the bottom with more than 300 rows held runs the trim from the scroll listener', () => {
  const v = restored('s1', 900, 1100); // 200 rows held
  v.term.scrollTop = 0;
  v.pager.prepend(page('s1', 700, 900, 1100)); // 400 held, the reader is up in the older rows
  assert.equal(v.term.children.length, 400);
  fire(v.term, 'scroll'); // a scroll that is not at the bottom
  assert.equal(v.term.children.length, 400, 'nothing is trimmed while the reader is not at the bottom');
  v.term.scrollTop = v.maxTop(); // the reader scrolls back down
  fire(v.term, 'scroll');
  const s = v.pager.state();
  assert.deepEqual([s.first, s.last], [900, 1099], 'trimmed back to a turn start, about 200 rows left');
  assert.equal(v.term.children.length, 200);
  assert.equal(v.term.scrollTop, v.maxTop(), 'still at the bottom');
});

test('a row that throws while an older page renders falls back, and following is switched back on afterwards', () => {
  const v = restored('s1', 900, 1000);
  v.term.scrollTop = 0;
  // One row of the page cannot be turned into a view model.
  const real = v.reg.toViewModel.bind(v.reg);
  v.reg.toViewModel = (entry: unknown): unknown => {
    if ((entry as Row).text === 'a850') throw new Error('bad row');
    return real(entry);
  };
  assert.equal(v.pager.prepend(page('s1', 800, 900, 1000)), true, 'the page is still applied');
  assert.equal(v.term.children.length, 200, 'every row of the page has a node, the bad one a fallback');
  assert.equal(rowText(v.term.children[50]!), 'a850', 'the fallback shows the row text in its place');
  assert.deepEqual(v.term.children.slice(0, 100).map(rowText), storedRows(800, 900, 20).map((r) => r.text));
  // Following is on again: back at the bottom, a live row is followed.
  v.term.scrollTop = v.maxTop();
  v.pager.track(1000, () => v.reg.renderRow(real({ kind: 'assistant-delta', turnId: 't', text: 'a1000' })));
  assert.equal(v.term.scrollTop, v.maxTop(), 'the new row was followed to the bottom');
});

test("the 'load earlier' bar is shown only when the first held index is above 0, names the count of older rows, and appears after a trim", () => {
  const short = restored('s0', 0, 40);
  assert.equal(short.bar.style['display'], 'none', 'nothing older: no bar');
  assert.equal(short.bar.textContent, '');
  const v = restored('s1', 900, 1000);
  assert.notEqual(v.bar.style['display'], 'none');
  assert.match(v.bar.textContent, /Load earlier messages \(900 older\)/);
  v.pager.prepend(page('s1', 800, 900, 1000));
  assert.match(v.bar.textContent, /\(800 older\)/, 'the count follows the first held index');
  // Walking back to the start hides the bar.
  for (let before = 800; before > 0; before -= 100) v.pager.prepend(page('s1', before - 100, before, 1000));
  assert.equal(v.pager.state().first, 0);
  assert.equal(v.bar.style['display'], 'none');
  // A session that started short gets the bar when a trim removes its oldest rows.
  const live = makeView();
  live.pager.reset('s2', 0, 0);
  assert.equal(live.bar.style['display'], 'none');
  liveRows(live, 0, 301, 20);
  assert.notEqual(live.bar.style['display'], 'none', 'the bar appears after a trim');
  assert.match(live.bar.textContent, /\(100 older\)/);
});
