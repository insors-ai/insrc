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
import { bodyStub, type BodyStub } from './fake-dom.js';
import { renderRegistryWebviewSource } from '../render-registry.js';
import { KEEP_ROWS, MAX_HELD_ROWS, transcriptPagerWebviewSource } from '../transcript-pager.js';

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
  state(): { sessionId: string; first: number; last: number; total: number };
}
interface Registry {
  renderRow(vm: unknown): BodyStub | null;
  appendKeyed(vm: unknown, key: string | null): BodyStub | null;
  toViewModel(entry: unknown): unknown;
}

/**
 * A transcript element whose height follows its rows (ROW_PX each) in a VIEW_PX viewport, and
 * whose scrollTop is clamped as a browser's is. The pager and the real registry are built on it.
 */
function makeView(): { term: BodyStub; pager: Pager; reg: Registry; maxTop: () => number } {
  const term = bodyStub('div', 'insrc-term');
  term.clientHeight = VIEW_PX;
  let top = 0;
  const maxTop = (): number => Math.max(0, term.children.length * ROW_PX - VIEW_PX);
  Object.defineProperty(term, 'scrollHeight', { get: () => term.children.length * ROW_PX });
  Object.defineProperty(term, 'scrollTop', { get: () => Math.min(top, maxTop()), set: (v: number) => { top = Math.max(0, Math.min(v, maxTop())); } });
  // eslint-disable-next-line no-eval
  const pager = (eval(`(${transcriptPagerWebviewSource()})`) as (t: BodyStub) => Pager)(term);
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
  return { term, pager, reg, maxTop };
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
  assert.deepEqual(v.pager.state(), { sessionId: '', first: 0, last: 359, total: 360 });
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
  assert.deepEqual(v.pager.state(), { sessionId: 'sess-9', first: 800, last: 799, total: 1000 });
  assert.equal(v.pager.atBottom(), true, 'following is on again');
  // The restored rows are replayed with their absolute indexes and the view ends at the bottom.
  liveRows(v, 800, 1000, 20);
  assert.deepEqual(v.pager.state(), { sessionId: 'sess-9', first: 800, last: 999, total: 1000 });
  assert.equal(v.term.children.length, 200);
  assert.equal(v.term.scrollTop, v.maxTop(), 'ends at the bottom');
  // A reset with no index (a short session posted whole) starts at 0.
  v.term.textContent = '';
  v.pager.reset('sess-1', 0, 3);
  assert.deepEqual(v.pager.state(), { sessionId: 'sess-1', first: 0, last: -1, total: 3 });
  // A live row past the restored total raises the total.
  liveRows(v, 0, 5, 20);
  assert.equal(v.pager.state().total, 5);
});
