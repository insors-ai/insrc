/**
 * Story E20261012ddc4ede1:S001 — the chat shell's one inline script, run for real.
 *
 * The other shell tests pin the script's text. This one executes the script the host renders,
 * against the shared fake DOM, and drives it with the messages the host posts, so the pager, the
 * registry and the message handler are exercised together as the webview runs them.
 *
 *   npx tsx --test src/chat/__tests__/chat-shell.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { marked } from 'marked';
import { createChatPanelHost, type ChatPanelChannel } from '../chat-panel.js';
import { createInMemoryChatSessionStore } from '../session-store.js';
import type { ProviderRegistry, StreamAdapter } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import { bodyStub, fire, type BodyStub } from './fake-dom.js';

const ROW_PX = 10;
const VIEW_PX = 100;

type Stub = BodyStub & Record<string, unknown>;

/** The shell script running in its own context over fake elements; `msg` delivers a host message. */
function runShell(): { term: BodyStub; bar: BodyStub; sent: Array<Record<string, unknown>>; msg: (payload: Record<string, unknown>) => void; maxTop: () => number } {
  let html = '';
  const channel: ChatPanelChannel = { setHtml: (h) => { html = h; }, postMessage: () => {}, onMessage: () => {}, onDidDispose: () => {}, reveal: () => {}, dispose: () => {} };
  const adapter: StreamAdapter = { async *run(): AsyncIterable<TurnEvent> {}, cancel: () => {}, decide: () => {}, capabilities: { resume: true } };
  const providers: ProviderRegistry = { available: ['claude'], get: () => adapter };
  createChatPanelHost({ createPanel: () => channel, providers, store: createInMemoryChatSessionStore(), cwd: () => '/repo' }).open();
  const script = html.slice(html.indexOf('>', html.indexOf('<script nonce=')) + 1, html.lastIndexOf('</script>'));

  // What the shell touches beyond the shared fake DOM's surface, as inert stand-ins.
  const dress = (e: BodyStub): Stub => {
    const s = e as Stub;
    s['options'] = [];
    s['remove'] = () => {};
    s['focus'] = () => {};
    s['removeAttribute'] = () => {};
    s['classList'] = { add() {}, remove() {}, toggle() {}, contains: () => false };
    return s;
  };
  const byId = new Map<string, Stub>();
  const getElementById = (id: string): Stub => {
    let e = byId.get(id);
    if (e === undefined) {
      e = dress(bodyStub(id === 'insrc-input' ? 'textarea' : 'div', id));
      e['querySelector'] = () => dress(bodyStub('span'));
      byId.set(id, e);
    }
    return e;
  };
  // The transcript element: its height follows its rows, and scrollTop is clamped as a browser's is.
  const term = getElementById('insrc-term');
  term.clientHeight = VIEW_PX;
  let top = 0;
  const maxTop = (): number => Math.max(0, term.children.length * ROW_PX - VIEW_PX);
  Object.defineProperty(term, 'scrollHeight', { get: () => term.children.length * ROW_PX });
  Object.defineProperty(term, 'scrollTop', { get: () => Math.min(top, maxTop()), set: (v: number) => { top = Math.max(0, Math.min(v, maxTop())); } });

  const sent: Array<Record<string, unknown>> = [];
  const listeners: Array<(e: unknown) => void> = [];
  const context: Record<string, unknown> = {
    window: { addEventListener: (type: string, l: (e: unknown) => void) => { if (type === 'message') listeners.push(l); } },
    document: { getElementById, createElement: (tag: string) => dress(bodyStub(tag)), addEventListener: () => {} },
    // Messages cross from the script's context; copy them into this one so they compare by value.
    acquireVsCodeApi: () => ({ postMessage: (m: { payload: unknown }) => { sent.push(JSON.parse(JSON.stringify(m.payload)) as Record<string, unknown>); } }),
    marked,
    setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    Date,
  };
  runInNewContext(script, context);
  const msg = (payload: Record<string, unknown>): void => { for (const l of listeners) l({ data: { v: 1, payload } }); };
  return { term, bar: getElementById('insrc-older'), sent, msg, maxTop };
}

/** Stored rows [from, to): a user row at every multiple of 20, assistant rows between. */
const rows = (from: number, to: number): Array<Record<string, unknown>> =>
  Array.from({ length: to - from }, (_, k) => { const i = from + k; return i % 20 === 0 ? { role: 'user', text: `q${i}`, at: 't' } : { role: 'assistant', text: `a${i}`, at: 't' }; });

test('the shell script runs: a windowed restore shows one page at the bottom with the bar, a page request round-trips and keeps the reader\'s place, a live row does not move a reader who scrolled up, and an old-style restore still works', () => {
  const v = runShell();
  assert.ok(v.sent.some((m) => m['type'] === 'ready'), 'the script ran to the end and announced itself');

  // A long chat opens: one page of rows, at the bottom, with the bar naming the older rows.
  v.msg({ type: 'session-restored', sessionId: 's1', transcript: rows(900, 1000), firstIndex: 900, total: 1000, mode: 'manual' });
  assert.equal(v.term.children.length, 100);
  assert.equal(v.term.scrollTop, v.maxTop(), 'the view ends at the bottom');
  assert.match(v.bar.textContent, /Load earlier messages \(900 older\)/);

  // The reader asks for earlier rows: one request for the first held index.
  fire(v.bar, 'click');
  assert.deepEqual(v.sent.at(-1), { type: 'load-older', sessionId: 's1', before: 900 });
  v.term.scrollTop = 0;
  v.msg({ type: 'transcript-page', sessionId: 's1', before: 900, firstIndex: 800, rows: rows(800, 900), total: 1000 });
  assert.equal(v.term.children.length, 200, 'the page is in the view');
  assert.equal(v.term.scrollTop, 100 * ROW_PX, 'the view moved by the height added: the reader\'s place is kept');
  assert.match(v.bar.textContent, /\(800 older\)/);

  // A page nobody asked for (another session) changes nothing.
  v.msg({ type: 'transcript-page', sessionId: 'other', before: 800, firstIndex: 700, rows: rows(700, 800), total: 1000 });
  assert.equal(v.term.children.length, 200);

  // The reader is up in older rows while a turn streams: rows are added, the view stays put.
  v.msg({ type: 'user-row', text: 'next question', key: 'r1000', rowIndex: 1000 });
  v.msg({ type: 'turn-event', event: { kind: 'assistant-delta', turnId: 't9', text: 'an answer' }, rowIndex: 1001 });
  v.msg({ type: 'turn-event', event: { kind: 'status', turnId: 't9', phase: 'thinking' } });
  assert.equal(v.term.children.length, 202);
  assert.equal(v.term.scrollTop, 100 * ROW_PX, 'a new row does not pull the reader down');

  // Back at the bottom, the next row is followed.
  v.term.scrollTop = v.maxTop();
  v.msg({ type: 'turn-event', event: { kind: 'assistant-delta', turnId: 't9', text: 'more' }, rowIndex: 1002 });
  assert.equal(v.term.scrollTop, v.maxTop(), 'at the bottom, the view follows');

  // A restore that carries the whole transcript and no index (the shape before paging) still works,
  // and a short one shows no bar.
  v.msg({ type: 'session-restored', sessionId: 's3', transcript: rows(0, 40) });
  assert.equal(v.term.children.length, 40);
  assert.equal(v.bar.style['display'], 'none');
  assert.equal(v.term.scrollTop, v.maxTop());
});

test('the shell script bounds the view of a long active session: rows past the limit are trimmed at the bottom and come back on request', () => {
  const v = runShell();
  v.msg({ type: 'session-restored', sessionId: 's1', transcript: [], firstIndex: 0, total: 0 });
  assert.equal(v.bar.style['display'], 'none');
  // 320 live rows in turns of 20, the reader at the bottom throughout.
  for (let i = 0; i < 320; i++) {
    if (i % 20 === 0) v.msg({ type: 'user-row', text: `q${i}`, key: `r${i}`, rowIndex: i });
    else v.msg({ type: 'turn-event', event: { kind: 'assistant-delta', turnId: 't', text: `a${i}` }, rowIndex: i });
  }
  assert.ok(v.term.children.length <= 300, `the view is bounded (${v.term.children.length} rows held)`);
  assert.ok(v.term.children.length >= 200);
  assert.equal(v.term.scrollTop, v.maxTop(), 'still at the bottom');
  const older = Number(/\((\d+) older\)/.exec(v.bar.textContent)?.[1]);
  assert.ok(older > 0 && older % 20 === 0, 'the bar names the trimmed rows, cut at a turn start');
  assert.equal(v.term.children.length, 320 - older);
  // The trimmed rows come back through a page request.
  fire(v.bar, 'click');
  assert.deepEqual(v.sent.at(-1), { type: 'load-older', sessionId: 's1', before: older });
  v.msg({ type: 'transcript-page', sessionId: 's1', before: older, firstIndex: 0, rows: rows(0, older), total: 320 });
  assert.equal(v.term.children.length, 320);
  assert.equal(v.bar.style['display'], 'none');
});
