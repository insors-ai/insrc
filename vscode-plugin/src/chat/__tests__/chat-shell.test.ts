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
import { createAttachmentStore } from '../attachment-store.js';
import { allOf, bodyStub, fire, textNode, textOf, type BodyStub } from './fake-dom.js';
import { fakeAttachmentFs } from './fake-attachment-fs.js';

const ROW_PX = 10;
const VIEW_PX = 100;

type Stub = BodyStub & Record<string, unknown>;

/** The shell script running in its own context over fake elements; `msg` delivers a host message. */
interface Shell {
  term: BodyStub;
  bar: BodyStub;
  sent: Array<Record<string, unknown>>;
  msg: (payload: Record<string, unknown>) => void;
  maxTop: () => number;
  /** The rendered document. */
  html: string;
  /** The fake element the script got for an id. */
  el: (id: string) => BodyStub;
  /** Runs every interval the script set (its countdown tick). */
  tickIntervals: () => void;
}
/** `attach` gives the host its attachment seams, so the shell has the attach controls. */
function runShell(opts: { attach?: boolean | undefined; queue?: boolean | undefined; clock?: { t: number } | undefined } = {}): Shell {
  let html = '';
  const channel: ChatPanelChannel = { setHtml: (h) => { html = h; }, postMessage: () => {}, onMessage: () => {}, onDidDispose: () => {}, reveal: () => {}, dispose: () => {} };
  const adapter: StreamAdapter = { async *run(): AsyncIterable<TurnEvent> {}, cancel: () => {}, decide: () => {}, capabilities: { resume: true } };
  const providers: ProviderRegistry = { available: ['claude'], get: () => adapter };
  createChatPanelHost({
    createPanel: () => channel,
    providers,
    store: createInMemoryChatSessionStore(),
    cwd: () => '/repo',
    genNonce: () => 'N',
    // Epic E20261014613abdb3 Story S002: a queue, so the shell has the outbox (the worker is inert here).
    ...(opts.queue === true
      ? { queue: () => ({ submit: () => ({ ok: false as const, reason: 'unavailable' as const, note: '' }), onChange: () => ({ dispose: () => {} }), liveSessionIds: () => new Set<string>(), running: () => false, act: () => ({ ok: true as const }), dispose: () => {} }) }
      : {}),
    ...(opts.attach === true
      ? { attachments: { store: createAttachmentStore({ root: '/att', fs: fakeAttachmentFs().fs }), pickFiles: async () => [], open: () => {} } }
      : {}),
  }).open();
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
      // The progress widget's label is one stable element, so the test can read what the page set on it.
      const label = id === 'insrc-progress' ? dress(bodyStub('span')) : undefined;
      e['querySelector'] = (sel: string) => (label !== undefined && sel === '.plabel' ? label : dress(bodyStub('span')));
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
  const intervals: Array<() => void> = [];
  const context: Record<string, unknown> = {
    window: { addEventListener: (type: string, l: (e: unknown) => void) => { if (type === 'message') listeners.push(l); } },
    document: { getElementById, createElement: (tag: string) => dress(bodyStub(tag)), createTextNode: (t: string) => textNode(t), addEventListener: () => {} },
    // Messages cross from the script's context; copy them into this one so they compare by value.
    acquireVsCodeApi: () => ({ postMessage: (m: { payload: unknown }) => { sent.push(JSON.parse(JSON.stringify(m.payload)) as Record<string, unknown>); } }),
    marked,
    setTimeout, clearTimeout,
    setInterval: (fn: () => void) => { intervals.push(fn); return intervals.length; }, clearInterval: () => {},
    Date: opts.clock !== undefined ? { now: () => opts.clock!.t } : Date,
    // Reads a pasted file at once: the test's file carries the data: URL it would produce.
    FileReader: class {
      result = '';
      onload: (() => void) | undefined;
      readAsDataURL(f: { dataUrl: string }): void { this.result = f.dataUrl; this.onload?.(); }
    },
  };
  runInNewContext(script, context);
  const msg = (payload: Record<string, unknown>): void => { for (const l of listeners) l({ data: { v: 1, payload } }); };
  return { term, bar: getElementById('insrc-older'), sent, msg, maxTop, html, el: getElementById, tickIntervals: () => { for (const f of intervals) f(); } };
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

// ---- Story E2026101259da3204:S001 t7: the attach button, the chips and the paste ----

const ofType = (v: Shell, type: string): Array<Record<string, unknown>> => v.sent.filter((m) => m['type'] === type);
const byClass = (root: BodyStub, cls: string): BodyStub[] => allOf(root).filter((n) => n.className.split(/\s+/).includes(cls));
/** A paste event over clipboard items; counts preventDefault calls. */
function pasteEvent(items: Array<{ kind: string; type: string; file?: { type: string; name: string; dataUrl: string } | undefined }>): { event: Record<string, unknown>; prevented: () => number } {
  let prevented = 0;
  return {
    prevented: () => prevented,
    event: {
      clipboardData: {
        items: items.map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file ?? null })),
        files: items.filter((i) => i.file).map((i) => i.file),
        types: [...new Set(items.map((i) => (i.kind === 'file' ? 'Files' : i.type)))],
      },
      preventDefault: () => { prevented++; },
    },
  };
}
const PNG_URL = 'data:image/png;base64,iVBORw0KGgo=';

test('shell script: the attach button posts pick-attachments, an image paste posts attach-image with its base64 and is prevented, a text paste is untouched, chips render from attachments-pending with a remove control, and a blank box with chips submits', () => {
  const v = runShell({ attach: true });
  v.msg({ type: 'session-restored', sessionId: 's1', transcript: [], firstIndex: 0, total: 0, mode: 'manual' });
  v.msg({ type: 'attachments-pending', sessionId: 's1', items: [] });
  const box = v.el('insrc-input');
  const bar = v.el('insrc-attachments');
  const list = v.el('insrc-attlist');
  const send = v.el('insrc-prompt');
  assert.equal((bar as unknown as { hidden: boolean }).hidden, true, 'no chips: the row is hidden');

  // A blank box with no chips does not submit.
  box.value = '   ';
  fire(send, 'click');
  assert.deepEqual(ofType(v, 'submit-turn'), []);

  // The attach button asks the host for its file dialog.
  fire(v.el('insrc-attach'), 'click');
  assert.deepEqual(ofType(v, 'pick-attachments'), [{ type: 'pick-attachments' }]);

  // A paste with an image: read here, sent as base64 with its mime, and the paste is prevented.
  const image = pasteEvent([
    { kind: 'string', type: 'text/plain' },
    { kind: 'file', type: 'image/png', file: { type: 'image/png', name: 'image.png', dataUrl: PNG_URL } },
  ]);
  fire(box, 'paste', image.event);
  assert.deepEqual(ofType(v, 'attach-image'), [{ type: 'attach-image', mime: 'image/png', dataBase64: 'iVBORw0KGgo=', name: 'image.png', clientId: 'p1' }]);
  assert.equal(image.prevented(), 1);
  // Two images in one paste: one message each, with their own client ids.
  const two = pasteEvent([
    { kind: 'file', type: 'image/jpeg', file: { type: 'image/jpeg', name: '', dataUrl: 'data:image/jpeg;base64,AAAA' } },
    { kind: 'file', type: 'image/gif', file: { type: 'image/gif', name: 'b.gif', dataUrl: 'data:image/gif;base64,BBBB' } },
  ]);
  fire(box, 'paste', two.event);
  assert.deepEqual(ofType(v, 'attach-image').slice(1).map((m) => [m['mime'], m['dataBase64'], m['name'], m['clientId']]), [['image/jpeg', 'AAAA', '', 'p2'], ['image/gif', 'BBBB', 'b.gif', 'p3']]);
  assert.equal(two.prevented(), 1);

  // A paste with no image is left to the browser: text, a non-image file, or no clipboard at all.
  const sentBefore = v.sent.length;
  const text = pasteEvent([{ kind: 'string', type: 'text/plain' }, { kind: 'string', type: 'text/html' }]);
  fire(box, 'paste', text.event);
  assert.equal(v.el('insrc-atterr').textContent, '', 'a text paste says nothing');
  const pdf = pasteEvent([{ kind: 'file', type: 'application/pdf', file: { type: 'application/pdf', name: 'a.pdf', dataUrl: 'data:application/pdf;base64,CCCC' } }]);
  fire(box, 'paste', pdf.event);
  assert.doesNotThrow(() => fire(box, 'paste', { preventDefault: () => { throw new Error('must not be prevented'); } }));
  assert.equal(text.prevented() + pdf.prevented(), 0);
  assert.equal(v.sent.length, sentBefore);
  const errLine = v.el('insrc-atterr') as BodyStub & { hidden?: boolean };
  assert.equal(errLine.textContent, 'The clipboard gave this panel no image to paste (it offered: Files).', 'a file that is not an image is named as such');
  // An image offered only as a file (not as an item) is attached too.
  let filePrevented = 0;
  fire(box, 'paste', { clipboardData: { items: [], files: [{ type: 'image/png', name: 'f.png', dataUrl: 'data:image/png;base64,FFFF' }], types: ['Files'] }, preventDefault: () => { filePrevented++; } });
  assert.deepEqual(ofType(v, 'attach-image').at(-1), { type: 'attach-image', mime: 'image/png', dataBase64: 'FFFF', name: 'f.png', clientId: 'p4' });
  assert.equal(filePrevented, 1);
  // A paste with neither text nor an image says what the clipboard offered, and is not prevented.
  fire(box, 'paste', { clipboardData: { items: [], files: [], types: ['application/x-thing'] }, preventDefault: () => { throw new Error('must not be prevented'); } });
  assert.equal(errLine.textContent, 'The clipboard gave this panel no image to paste (it offered: application/x-thing).');
  assert.equal(errLine.hidden, false);
  fire(box, 'paste', { clipboardData: { items: [], files: [], types: [] }, preventDefault: () => {} });
  assert.equal(errLine.textContent, 'The clipboard gave this panel no image to paste (it offered: nothing).');

  // The host's list is drawn as chips: thumbnail or glyph, name, size and a remove control.
  v.msg({
    type: 'attachments-pending',
    sessionId: 's1',
    items: [
      { id: '1-image.png', name: 'image.png', kind: 'image', size: 2048, clientId: 'p1' },
      { id: '2-notes.txt', name: 'notes <b>.txt', kind: 'file', size: 12 },
      { id: '3-old.png', name: 'old.png', kind: 'image', size: 3 * 1024 * 1024, clientId: 'gone' },
    ],
  });
  assert.equal((bar as unknown as { hidden: boolean }).hidden, false);
  assert.equal(list.children.length, 3);
  const [first, second, third] = list.children as [BodyStub, BodyStub, BodyStub];
  // The pasted image shows the thumbnail the webview kept; the others a glyph. No path is involved.
  assert.equal(first.children[0]!.tagName, 'img');
  assert.equal((first.children[0] as unknown as { src: string }).src, PNG_URL);
  assert.deepEqual(first.children.slice(1).map((c) => c.textContent), ['image.png', '2.0 KB', '×']);
  assert.deepEqual(second.children.map((c) => c.textContent), ['▤', 'notes <b>.txt', '12 B', '×']);
  assert.deepEqual(third.children.map((c) => c.textContent), ['▨', 'old.png', '3.0 MB', '×']);
  for (const n of allOf(bar)) assert.ok(!n.writes.some((w) => w.prop === 'innerHTML'), 'chips are built with textContent');
  const remove = byClass(second, 'attchip__x')[0]!;
  assert.equal(remove.attrs['role'], 'button');
  assert.equal(remove.attrs['aria-label'], 'remove notes <b>.txt');
  fire(remove, 'click');
  assert.deepEqual(ofType(v, 'remove-attachment'), [{ type: 'remove-attachment', attachmentId: '2-notes.txt' }]);

  // A list for a chat that is not shown is not drawn.
  v.msg({ type: 'attachments-pending', sessionId: 'other', items: [] });
  assert.equal(list.children.length, 3);

  // A blank box with chips submits.
  box.value = '';
  fire(send, 'click');
  assert.deepEqual(ofType(v, 'submit-turn'), [{ type: 'submit-turn', text: '' }]);

  // The host clears the list: the row hides, and the sent image's thumbnail is let go.
  v.msg({ type: 'attachments-pending', sessionId: 's1', items: [] });
  assert.equal(list.children.length, 0);
  assert.equal((bar as unknown as { hidden: boolean }).hidden, true);
  v.msg({ type: 'attachments-pending', sessionId: 's1', items: [{ id: '1-image.png', name: 'image.png', kind: 'image', size: 2048, clientId: 'p1' }] });
  assert.equal(list.children[0]!.children[0]!.textContent, '▨', 'a rebuilt chip with no kept thumbnail shows the glyph');
});

test('shell: the attach button is icon-only with an aria-label, sits first in the status bar, and the content security policy is unchanged', () => {
  const on = runShell({ attach: true }).html;
  const off = runShell().html;

  // Icon only: an inline drawing, no text, named for assistive technology and on hover.
  const button = /<button id="insrc-attach" type="button" class="attachbtn" aria-label="attach files" title="attach files">(.*?)<\/button>/.exec(on);
  assert.ok(button, 'the attach button is in the shell');
  assert.match(button[1]!, /^<svg [^>]*aria-hidden="true"[^>]*><path [^>]*\/><\/svg>$/);
  assert.equal(button[1]!.replace(/<[^>]*>/g, '').trim(), '', 'no text inside the button');
  // First in the status bar, before the provider select.
  assert.ok(on.includes('<div class="statusbar"><button id="insrc-attach"'));
  assert.ok(on.indexOf('id="insrc-attach"') < on.indexOf('class="runctl"'), 'the attach button precedes the bottom-right run controls');
  // The chip row sits between the input and the status bar, hidden until there is something in it.
  const row = on.indexOf('<div id="insrc-attachments" class="attachbar" hidden>');
  assert.ok(on.indexOf('<div class="inputbar">') < row && row < on.indexOf('<div class="statusbar">'));

  // The policy is the same one, and the document is still one nonce'd inline script.
  const policy = (html: string): string => /Content-Security-Policy" content="([^"]*)"/.exec(html)![1]!;
  assert.equal(policy(on), "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-N';");
  assert.equal(policy(on), policy(off));
  assert.equal((on.match(/<script\b/g) ?? []).length, 1);
  assert.match(on, /<script nonce="N">/);
  // Nothing new is written as markup or loaded from elsewhere.
  const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;
  assert.equal(count(on, /innerHTML/g), count(off, /innerHTML/g));
  assert.equal(count(on, /https?:\/\//g), count(off, /https?:\/\//g));
  assert.equal(count(on, /<(img|link|iframe)\b/g), count(off, /<(img|link|iframe)\b/g));

  // Without the seams: no button, no chip row, no paste handler, and the submit rule as it was.
  for (const absent of ['insrc-attach', 'attachbar', 'renderPending', "'paste'", 'attCount', 'onAttachmentOpen(function']) {
    assert.ok(!off.includes(absent), `the shell without the seams has no ${absent}`);
  }
  assert.ok(off.includes('function doSubmit(){if(!box.value.trim())return;'));
  assert.ok(on.includes('function doSubmit(){if(!box.value.trim()&&attCount===0)return;'));
  assert.ok(off.includes('<div class="statusbar"><span class="seg" id="insrc-modeseg">'), 'without the attach seam the status bar opens with the mode seg');
  assert.ok(off.includes('<span class="runctl">'), 'the bottom-right runctl group is present');
});

test('shell script: a chip click on a sent message posts open-attachment, and the error sentence is shown and cleared', () => {
  const v = runShell({ attach: true });
  const sentFile = { id: '1-a.png', name: 'a.png', kind: 'image', size: 10, path: '/att/s1/1-a.png' };
  v.msg({ type: 'session-restored', sessionId: 's1', transcript: [{ role: 'user', text: 'see', at: 't', attachments: [sentFile] }], firstIndex: 0, total: 1, mode: 'manual' });
  // A restored message's chip names its file by id.
  const restored = byClass(v.term, 'insrc-attchip');
  assert.equal(restored.length, 1);
  fire(restored[0]!, 'click');
  assert.deepEqual(ofType(v, 'open-attachment'), [{ type: 'open-attachment', attachmentId: '1-a.png' }]);
  // So does the live echo of a message just sent.
  v.msg({ type: 'user-row', text: 'two', key: 'r1', rowIndex: 1, attachments: [{ id: '2-b.pdf', name: 'b.pdf', kind: 'file', size: 2048, path: '/att/s1/2-b.pdf' }] });
  const chips = byClass(v.term, 'insrc-attchip');
  assert.equal(chips.length, 2);
  fire(chips[1]!, 'click');
  assert.deepEqual(ofType(v, 'open-attachment').map((m) => m['attachmentId']), ['1-a.png', '2-b.pdf']);
  // No message carries a path, and the transcript loads no image.
  for (const m of v.sent) assert.ok(!JSON.stringify(m).includes('/att/'));
  assert.deepEqual(allOf(v.term).filter((n) => n.tagName === 'img'), []);

  // A refusal: the sentence is shown under the prompt, even with no chip, and cleared by the next list.
  const bar = v.el('insrc-attachments') as BodyStub & { hidden?: boolean };
  const err = v.el('insrc-atterr') as BodyStub & { hidden?: boolean };
  v.msg({ type: 'attachments-pending', sessionId: 's1', items: [], error: 'big.png is larger than the 20 MB limit.' });
  assert.equal(err.textContent, 'big.png is larger than the 20 MB limit.');
  assert.deepEqual([err.hidden, bar.hidden], [false, false]);
  assert.ok(!err.writes.some((w) => w.prop === 'innerHTML'));
  v.msg({ type: 'attachments-pending', sessionId: 's1', items: [{ id: '3-ok.png', name: 'ok.png', kind: 'image', size: 5 }] });
  assert.equal(err.textContent, '');
  assert.deepEqual([err.hidden, bar.hidden], [true, false]);
  v.msg({ type: 'attachments-pending', sessionId: 's1', items: [] });
  assert.deepEqual([err.hidden, bar.hidden], [true, true]);

  // Without the seams a message's chips are still drawn, a click does nothing, and a pending list is ignored.
  const plain = runShell();
  plain.msg({ type: 'session-restored', sessionId: 's1', transcript: [{ role: 'user', text: 'see', at: 't', attachments: [sentFile] }], firstIndex: 0, total: 1, mode: 'manual' });
  const before = plain.sent.length;
  fire(byClass(plain.term, 'insrc-attchip')[0]!, 'click');
  assert.doesNotThrow(() => plain.msg({ type: 'attachments-pending', sessionId: 's1', items: [{ id: 'x', name: 'x', kind: 'file', size: 1 }] }));
  assert.equal(plain.sent.length, before);
});

// Story E20261013b2e8109f:S001 / t5 — the row message and the diff widget, run in the real shell script.
const diffRowMsg = (over: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ role: 'diff', sid: 'k-0', path: 'src/a.ts', oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, added: 1, removed: 0, lines: [' a', '+b', ' c'], at: 't', ...over });
const widgets = (v: Shell): BodyStub[] => v.term.children.filter((n) => n.className.split(/\s+/).includes('insrc-diffw'));
const rowOf = (n: BodyStub): unknown => (n as unknown as { __row: unknown }).__row;

test('transcript-row: a diff row without replaces appends a widget stamped with its row index; one with replaces redraws the widget of that sid and keeps it open; a withdrawn one hides it; one for an unknown or trimmed sid changes nothing', () => {
  const v = runShell();
  v.msg({ type: 'session-restored', sessionId: 's1', transcript: [{ role: 'user', text: 'go', at: 't' }], firstIndex: 0, total: 1, mode: 'manual' });
  assert.equal(v.term.children.length, 1);

  // A new section: one widget, appended, stamped with the row's index.
  const long = Array.from({ length: 10 }, (_, i) => `+v1 ${i}`);
  v.msg({ type: 'transcript-row', rowIndex: 1, row: diffRowMsg({ lines: long, added: 10 }) });
  v.msg({ type: 'transcript-row', rowIndex: 2, row: diffRowMsg({ sid: 'k-1', path: 'src/b.ts' }) });
  assert.equal(v.term.children.length, 3);
  const [first, second] = widgets(v);
  assert.equal(rowOf(first!), 1);
  assert.equal(rowOf(second!), 2);
  assert.equal(textOf(byClass(first!, 'insrc-diffw__text')[0]!), 'v1 0');

  // The reader opens the first widget; a later version redraws it in place and it stays open.
  fire(byClass(first!, 'insrc-diffw__more')[0]!, 'click');
  assert.ok(first!.className.includes('insrc-diffw--open'));
  v.msg({ type: 'transcript-row', rowIndex: 3, row: diffRowMsg({ sid: undefined, replaces: 'k-0', lines: Array.from({ length: 12 }, (_, i) => `+v2 ${i}`), added: 12 }) });
  assert.equal(v.term.children.length, 3, 'no new node for a later version');
  assert.equal(widgets(v)[0], first, 'the same widget');
  assert.ok(first!.className.includes('insrc-diffw--open'));
  assert.equal(textOf(byClass(first!, 'insrc-diffw__text')[0]!), 'v2 0');
  assert.equal(byClass(first!, 'insrc-diffw__line').length, 12);
  assert.equal(rowOf(first!), 1, 'it keeps its own row index');

  // A withdrawn section is hidden in place.
  v.msg({ type: 'transcript-row', rowIndex: 4, row: diffRowMsg({ sid: undefined, replaces: 'k-1', path: 'src/b.ts', lines: [], withdrawn: true }) });
  assert.equal(v.term.children.length, 3);
  assert.ok(second!.className.split(/\s+/).includes('insrc-diffw--gone'));
  assert.equal(second!.children.length, 0);

  // A later version of a section the view does not hold changes nothing.
  const before = v.term.children.map((n) => n.className).join('|');
  v.msg({ type: 'transcript-row', rowIndex: 5, row: diffRowMsg({ sid: undefined, replaces: 'never-seen' }) });
  assert.equal(v.term.children.length, 3);
  assert.equal(v.term.children.map((n) => n.className).join('|'), before);

  // After the view is reset the remembered widgets are forgotten: a late version of an old section is ignored.
  v.msg({ type: 'session-restored', sessionId: 's2', transcript: [], firstIndex: 0, total: 0, mode: 'manual' });
  v.msg({ type: 'transcript-row', rowIndex: 0, row: diffRowMsg({ sid: undefined, replaces: 'k-0' }) });
  assert.equal(v.term.children.length, 0);

  // A widget the pager trimmed from the view is forgotten too.
  const t = runShell();
  t.msg({ type: 'session-restored', sessionId: 's3', transcript: [{ role: 'user', text: 'q0', at: 't' }], firstIndex: 0, total: 1, mode: 'manual' });
  t.msg({ type: 'transcript-row', rowIndex: 1, row: diffRowMsg() });
  for (let i = 2; i < 420; i++) t.msg({ type: 'turn-event', rowIndex: i, event: i % 20 === 0 ? { kind: 'done', turnId: 't', ok: true } : { kind: 'assistant-delta', turnId: 't', text: `a${i}` } });
  for (let i = 420; i < 440; i++) t.msg({ type: 'user-row', rowIndex: i, text: `q${i}`, key: `u${i}` });
  assert.equal(widgets(t).length, 0, 'the widget was trimmed from the view');
  const held = t.term.children.map((n) => n.className + n.textContent).join('|');
  t.msg({ type: 'transcript-row', rowIndex: 440, row: diffRowMsg({ sid: undefined, replaces: 'k-0', lines: ['+late'] }) });
  assert.equal(t.term.children.map((n) => n.className + n.textContent).join('|'), held, 'a version for a trimmed widget changes nothing');
});

test('transcript-row: a marker row appends the same line a restored marker row draws', () => {
  const marker = { role: 'marker', text: '15 more changed sections in 4 files are not shown', cssClass: 'insrc-term__marker--edit', at: 't' };
  const live = runShell();
  live.msg({ type: 'session-restored', sessionId: 's1', transcript: [{ role: 'user', text: 'go', at: 't' }], firstIndex: 0, total: 1, mode: 'manual' });
  live.msg({ type: 'transcript-row', rowIndex: 1, row: marker });
  const restored = runShell();
  restored.msg({ type: 'session-restored', sessionId: 's1', transcript: [{ role: 'user', text: 'go', at: 't' }, marker], firstIndex: 0, total: 2, mode: 'manual' });
  assert.equal(live.term.children.length, 2);
  assert.equal(restored.term.children.length, 2);
  const a = live.term.children[1]!;
  const b = restored.term.children[1]!;
  assert.equal(a.textContent, marker.text);
  assert.equal(a.className, 'insrc-term__marker--edit');
  assert.deepEqual([a.tagName, a.className, a.textContent, a.children.length], [b.tagName, b.className, b.textContent, b.children.length]);
  assert.equal(rowOf(a), 1);
});

test('diff widget: a diff row in a session-restored window and in a transcript-page is appended as a widget', () => {
  const v = runShell();
  // Rows 100..103 are restored: a first row already in its latest version (as the host cuts it), a
  // later version (draws nothing), a withdrawn first row (draws nothing).
  const window = [
    { role: 'user', text: 'q100', at: 't' },
    diffRowMsg({ sid: 'k-9', lines: ['+latest'] }),
    diffRowMsg({ sid: undefined, replaces: 'k-9', lines: ['+latest'] }),
    diffRowMsg({ sid: 'k-8', path: 'src/gone.ts', lines: [], withdrawn: true }),
  ];
  v.msg({ type: 'session-restored', sessionId: 's1', transcript: window, firstIndex: 100, total: 104, mode: 'manual' });
  assert.equal(v.term.children.length, 2, 'the user row and one widget');
  const [w] = widgets(v);
  assert.ok(w, 'the restored diff row is in the transcript element');
  assert.equal(rowOf(w!), 101);
  assert.equal(textOf(byClass(w!, 'insrc-diffw__text')[0]!), 'latest');
  assert.equal(byClass(w!, 'insrc-diffw__path')[0]!.attrs['title'], 'src/a.ts');
  // A restored widget is remembered too: a live later version redraws it.
  v.msg({ type: 'transcript-row', rowIndex: 104, row: diffRowMsg({ sid: undefined, replaces: 'k-9', lines: ['+newer'] }) });
  assert.equal(textOf(byClass(w!, 'insrc-diffw__text')[0]!), 'newer');

  // An older page: its diff row is drawn above the held rows.
  fire(v.bar, 'click');
  assert.deepEqual(v.sent.at(-1), { type: 'load-older', sessionId: 's1', before: 100 });
  const page = [{ role: 'user', text: 'q98', at: 't' }, diffRowMsg({ sid: 'k-1', path: 'src/older.ts', lines: ['+old page'] })];
  v.msg({ type: 'transcript-page', sessionId: 's1', before: 100, firstIndex: 98, rows: page, total: 105 });
  assert.equal(v.term.children.length, 4);
  const older = widgets(v)[0]!;
  assert.equal(rowOf(older), 99);
  assert.equal(byClass(older, 'insrc-diffw__path')[0]!.attrs['title'], 'src/older.ts');
  assert.equal(v.term.children.indexOf(older), 1, 'above the rows held before');
});

// Epic E20261014613abdb3 Story S002 t6.
test('chat shell: the outbox band is present only with the queue, and the queue hint replaces the input placeholder only with it; an outbox message draws its rows and summary and each action posts its seq; with the queue a submit does not mark the turn running', () => {
  const off = runShell();
  for (const absent of ['insrc-outbox', 'renderOutbox']) assert.ok(!off.html.includes(absent), `no ${absent} without the queue`);
  assert.ok(!off.html.includes('Ctrl+Enter to queue'), 'no queue hint without the queue');
  assert.ok(off.html.includes("setRunning(true);setProgress('working\\u2026');}"), 'without the queue a submit still marks the turn running');

  const v = runShell({ queue: true });
  assert.ok(v.html.includes('id="insrc-outbox"'));
  assert.ok(v.html.indexOf('id="insrc-outbox"') < v.html.indexOf('class="inputbar"'), 'the band sits above the input bar');
  v.msg({ type: 'session-restored', sessionId: 's1', transcript: [], firstIndex: 0, total: 0 });

  // The queue hint replaces the input's placeholder while a turn runs and is restored after.
  const ph = v.el('insrc-input') as BodyStub & { placeholder?: string };
  v.msg({ type: 'turn-running', sessionId: 's1' });
  assert.ok(ph.placeholder?.includes('\u2318/Ctrl+Enter to queue'));
  v.msg({ type: 'turn-event', event: { kind: 'done', turnId: 't', ok: true } });
  assert.ok(ph.placeholder?.includes('\u2318\u21b5 send'));

  // A submit posts the message and does not mark the turn running: it waits in the outbox.
  const box = v.el('insrc-input') as BodyStub & { value: string };
  const send = v.el('insrc-prompt');
  box.value = 'later';
  fire(send, 'click');
  assert.deepEqual(ofType(v, 'submit-turn').map((m) => m['text']), ['later']);
  assert.equal(send.textContent, '\u276f', 'still the send control');
  assert.ok(ph.placeholder?.includes('\u2318\u21b5 send'));

  // An outbox for another chat is not drawn; this chat's is.
  const band = v.el('insrc-outbox') as BodyStub & { hidden?: boolean };
  v.msg({ type: 'outbox', view: { sessionId: 'other', rows: [{ seq: 9, position: 1, state: 'queued', text: 'x', attachments: 0, origin: 'typed' }], aheadFromOtherChats: 0 } });
  assert.equal(v.el('insrc-oblist').children.length, 0);
  v.msg({
    type: 'outbox',
    view: {
      sessionId: 's1',
      rows: [
        { seq: 4, position: 2, state: 'queued', text: 'add a test\nwith detail', attachments: 2, origin: 'typed' },
        { seq: 2, state: 'failed', text: 'refactor', attachments: 0, origin: 'typed', error: 'stopped by the user' },
      ],
      aheadFromOtherChats: 1,
      runningChat: { title: 'board search', here: false },
      blockedBy: { chatTitle: 'board search', reason: 'approval' },
    },
  });
  assert.equal(band.hidden, false);
  assert.equal(v.el('insrc-obsum').textContent, '1 message from other chats ahead \u00b7 running: \u201cboard search\u201d \u00b7 waiting for an approval in \u201cboard search\u201d');
  const rowsEl = v.el('insrc-oblist').children;
  assert.equal(rowsEl.length, 2);
  const texts = (n: BodyStub): string[] => n.children.map((c) => c.textContent);
  assert.deepEqual(texts(rowsEl[0]!), ['#2', 'add a test', '\ud83d\udcce2', '\u2715']);
  assert.deepEqual(texts(rowsEl[1]!), ['failed', 'refactor', 'stopped by the user', '\u21bb', '\u2715']);
  assert.equal(rowsEl[0]!.children[1]!.attrs['title'], 'add a test\nwith detail', 'the full text in the tooltip');

  // Each action posts its type with the row's seq; buttons are named and reachable by keyboard.
  const cancel = byClass(rowsEl[0]!, 'outbox__btn')[0]!;
  assert.equal(cancel.attrs['aria-label'], 'cancel this message');
  assert.equal(cancel.attrs['tabindex'], '0');
  fire(cancel, 'click');
  const [resend, dismiss] = byClass(rowsEl[1]!, 'outbox__btn');
  fire(resend!, 'click');
  fire(dismiss!, 'keydown', { key: 'Enter', preventDefault: () => {} });
  assert.deepEqual(v.sent.filter((m) => String(m['type']).startsWith('outbox-')), [
    { type: 'outbox-cancel', seq: 4 }, { type: 'outbox-resend', seq: 2 }, { type: 'outbox-dismiss', seq: 2 },
  ]);

  // A note is shown; an empty outbox hides the band.
  v.msg({ type: 'outbox', view: { sessionId: 's1', rows: [], aheadFromOtherChats: 0, note: 'That message has already started; it is in the chat now.' } });
  assert.equal(band.hidden, false);
  assert.equal(v.el('insrc-obnote').textContent, 'That message has already started; it is in the chat now.');
  v.msg({ type: 'outbox', view: { sessionId: 's1', rows: [], aheadFromOtherChats: 0 } });
  assert.equal(band.hidden, true);
});

test("a retrying row shows 'attempt n of 3', a countdown, a retry-now button and a cancel button, and retry-now posts outbox-retry-now with its seq", () => {
  const clock = { t: 1_000_000 };
  const v = runShell({ queue: true, clock });
  v.msg({ type: 'session-restored', sessionId: 's1', transcript: [], mode: 'manual' });
  v.msg({
    type: 'outbox',
    view: {
      sessionId: 's1',
      rows: [{ seq: 7, position: 1, state: 'retrying', text: 'go', attachments: 0, origin: 'typed', error: 'API Error: 529 overloaded_error', attempt: 2, nextAttemptAt: clock.t + 65_000 }],
      aheadFromOtherChats: 0,
    },
  });
  const rowEl = v.el('insrc-oblist').children[0]!;
  const texts = rowEl.children.map((c) => c.textContent);
  assert.deepEqual(texts, ['#1', 'go', 'API Error: 529 overloaded_error', 'attempt 2 of 3', 'retrying in 1m 5s', '\u25b6', '\u2715']);
  // The countdown ticks.
  clock.t += 30_000;
  v.tickIntervals();
  assert.equal(rowEl.children[4]!.textContent, 'retrying in 35s');
  clock.t += 40_000;
  v.tickIntervals();
  assert.equal(rowEl.children[4]!.textContent, 'retrying now');
  // The buttons are named and post their seq; cancel is still there.
  const [retryNow, cancel] = byClass(rowEl, 'outbox__btn');
  assert.equal(retryNow!.attrs['aria-label'], 'retry this message now');
  assert.equal(cancel!.attrs['aria-label'], 'cancel this message');
  fire(retryNow!, 'click');
  fire(cancel!, 'click');
  assert.deepEqual(v.sent.filter((m) => String(m['type']).startsWith('outbox-')), [{ type: 'outbox-retry-now', seq: 7 }, { type: 'outbox-cancel', seq: 7 }]);
});

test('chat shell: the progress widget is never hidden: idle at the start, working after turn-running, idle after done, error, Stop and session-restored', () => {
  const v = runShell();
  const prog = v.el('insrc-progress') as BodyStub & { hidden?: boolean; className?: string; querySelector(s: string): BodyStub };
  const label = prog.querySelector('.plabel');
  const elapsed = v.el('insrc-elapsed');
  const state = (): string => `${prog.className ?? ''}|${label.textContent}|hidden=${String(prog.hidden === true)}`;

  v.msg({ type: 'session-restored', sessionId: 's1', transcript: [], mode: 'manual' });
  assert.equal(state(), 'progress idle|idle|hidden=false', 'idle after the chat is shown');

  // A turn starts: working, with its label and no idle class.
  v.msg({ type: 'turn-running', sessionId: 's1' });
  assert.equal(state(), 'progress|working\u2026|hidden=false');

  // done ends it: idle, the elapsed text empty.
  v.msg({ type: 'turn-event', event: { kind: 'done', turnId: 't1', ok: true } });
  assert.equal(state(), 'progress idle|idle|hidden=false');
  assert.equal(elapsed.textContent, '');

  // error ends it the same way.
  v.msg({ type: 'turn-running', sessionId: 's1' });
  v.msg({ type: 'turn-event', event: { kind: 'error', turnId: 't1', message: 'boom' } });
  assert.equal(state(), 'progress idle|idle|hidden=false');

  // Stop: the prompt posts cancel-turn and the widget goes idle.
  v.msg({ type: 'turn-running', sessionId: 's1' });
  fire(v.el('insrc-prompt'), 'click');
  assert.ok(v.sent.some((m) => m['type'] === 'cancel-turn'));
  assert.equal(state(), 'progress idle|idle|hidden=false');

  // A chat switch while running: idle with the restored view.
  v.msg({ type: 'turn-running', sessionId: 's1' });
  v.msg({ type: 'session-restored', sessionId: 's2', transcript: [], mode: 'manual' });
  assert.equal(state(), 'progress idle|idle|hidden=false');
});

test("chat shell: an informational line's done does not end a running turn, and the turn's own done and error still do", () => {
  const v = runShell();
  const prog = v.el('insrc-progress') as BodyStub & { className?: string };
  const prompt = v.el('insrc-prompt') as BodyStub;
  v.msg({ type: 'session-restored', sessionId: 's1', transcript: [], mode: 'manual' });
  v.msg({ type: 'turn-running', sessionId: 's1' });
  assert.deepEqual([prog.className, prompt.textContent], ['progress', '\u25a0'], 'working, with Stop');

  // An informational line (a retry note) arrives under its own turn id, closed by a marked done: still running.
  v.msg({ type: 'turn-event', event: { kind: 'assistant-delta', turnId: 'queue-retry-x', text: 'the turn failed with overloaded; retrying (attempt 1 of 3)' } });
  v.msg({ type: 'turn-event', event: { kind: 'done', turnId: 'queue-retry-x', ok: true }, info: true });
  assert.deepEqual([prog.className, prompt.textContent], ['progress', '\u25a0'], 'the line did not end the turn');

  // The turn's own done ends it.
  v.msg({ type: 'turn-event', event: { kind: 'done', turnId: 't1', ok: true } });
  assert.deepEqual([prog.className, prompt.textContent], ['progress idle', '\u276f'], "the turn's done ends it");

  // So does the turn's own error, and a done that is not marked, whatever its turn id, is read as a turn's.
  v.msg({ type: 'turn-running', sessionId: 's1' });
  v.msg({ type: 'turn-event', event: { kind: 'error', turnId: 't2', message: 'boom' } });
  assert.deepEqual([prog.className, prompt.textContent], ['progress idle', '\u276f'], "the turn's error ends it");
});
