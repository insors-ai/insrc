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
import { allOf, bodyStub, fire, type BodyStub } from './fake-dom.js';
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
}
/** `attach` gives the host its attachment seams, so the shell has the attach controls. */
function runShell(opts: { attach?: boolean } = {}): Shell {
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
    // Reads a pasted file at once: the test's file carries the data: URL it would produce.
    FileReader: class {
      result = '';
      onload: (() => void) | undefined;
      readAsDataURL(f: { dataUrl: string }): void { this.result = f.dataUrl; this.onload?.(); }
    },
  };
  runInNewContext(script, context);
  const msg = (payload: Record<string, unknown>): void => { for (const l of listeners) l({ data: { v: 1, payload } }); };
  return { term, bar: getElementById('insrc-older'), sent, msg, maxTop, html, el: getElementById };
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
function pasteEvent(items: Array<{ kind: string; type: string; file?: { type: string; name: string; dataUrl: string } }>): { event: Record<string, unknown>; prevented: () => number } {
  let prevented = 0;
  return {
    prevented: () => prevented,
    event: {
      clipboardData: { items: items.map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file ?? null })) },
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
  const pdf = pasteEvent([{ kind: 'file', type: 'application/pdf', file: { type: 'application/pdf', name: 'a.pdf', dataUrl: 'data:application/pdf;base64,CCCC' } }]);
  fire(box, 'paste', pdf.event);
  assert.doesNotThrow(() => fire(box, 'paste', { preventDefault: () => { throw new Error('must not be prevented'); } }));
  assert.equal(text.prevented() + pdf.prevented(), 0);
  assert.equal(v.sent.length, sentBefore);

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
  assert.ok(on.indexOf('id="insrc-attach"') < on.indexOf('id="insrc-provider"'));
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
  assert.ok(off.includes('<div class="statusbar"><span class="seg"><select id="insrc-provider"'));
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
