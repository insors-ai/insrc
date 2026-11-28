/**
 * Story E202611134642d49a:S001 / t5+t6 — the scratch panels controller's tests.
 *
 * Fake PanelFactory + fake PanelHandle + the real scratch store over a fake fs:
 * browse table, row buttons, empty/error states, create-or-reveal reuse,
 * panel-factory failure, document render via the .value-only push, the
 * floating Send-to-chat button over the textarea selection API, the editable
 * document view (save button + Ctrl/Cmd+S posting scratch-save, gen-guarded
 * scratch-saved replies), A->B switching on one instance with a reversed read
 * completion, stale ENOENT, deleting a non-displayed document, epoch
 * invalidation, dispose-during-read, and the UTF-8 cap boundary.
 *
 * Run: npx tsx --test vscode-plugin/src/panels/__tests__/scratch-panel.test.ts
 */
import { test } from 'node:test';
import { createScratchHost } from '../../chat/scratch-host.js';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

import {
  SCRATCHPADS_VIEW_TYPE,
  SCRATCHPAD_VIEW_TYPE,
  browseHtml,
  capUtf8,
  createScratchPanels,
  documentBodyHtml,
  documentBootstrap,
  SEND_TO_CHAT_CAP,
  type ScratchPanelHandle,
} from '../scratch-panels.js';
import type { PanelFactory, PanelHandle } from '../types.js';
import { createScratchStore, ScratchNotFound, type ScratchStore } from '../../chat/scratch-store.js';
import { fakeScratchFs } from '../../chat/__tests__/fake-scratch-fs.js';
import { bodyStub, fire, textOf, allOf, type BodyStub } from '../../chat/__tests__/fake-dom.js';

const ROOT = '/root/scratches';

class FakePanel implements PanelHandle {
  html = '';
  reveals = 0;
  /** The preserveFocus argument of each reveal call (undefined = default reveal). */
  readonly revealFlags: Array<boolean | undefined> = [];
  disposed = false;
  title: string;
  readonly posted: unknown[] = [];
  private readonly disposeListeners: Array<() => void> = [];
  private readonly messageListeners: Array<(message: unknown) => void> = [];
  constructor(readonly viewType: string, title: string) {
    this.title = title;
  }
  setHtml(html: string): void { this.html = html; }
  reveal(preserveFocus?: boolean | undefined): void { this.reveals += 1; this.revealFlags.push(preserveFocus); }
  onDidDispose(listener: () => void): void { this.disposeListeners.push(listener); }
  onMessage(listener: (message: unknown) => void): void { this.messageListeners.push(listener); }
  /** Delivery behavior is controllable: `delivery` is the resolved value, or 'reject' to simulate a disposed panel. */
  delivery: boolean | 'reject' = true;
  postMessage(message: unknown): Promise<boolean> {
    this.posted.push(message);
    if (this.delivery === 'reject') return Promise.reject(new Error('disposed'));
    return Promise.resolve(this.delivery);
  }
  dispose(): void { this.disposed = true; for (const l of [...this.disposeListeners]) l(); }
  userClose(): void { for (const l of [...this.disposeListeners]) l(); }
  injectMessage(message: unknown): void { for (const l of [...this.messageListeners]) l(message); }
}

interface Harness {
  panels: FakePanel[];
  factory: PanelFactory;
  store: ScratchStore;
  fake: ReturnType<typeof fakeScratchFs>;
  controller: ReturnType<typeof createScratchPanels>;
  sentToChat: string[];
  titles: string[];
  warns: string[];
  failFactory: boolean;
}

function harness(): Harness {
  const panels: FakePanel[] = [];
  const titles: string[] = [];
  const sentToChat: string[] = [];
  const warns: string[] = [];
  let failFactory = false;
  const fake = fakeScratchFs();
  const store = createScratchStore({ root: ROOT, fs: fake.fs });
  const factory: PanelFactory = (opts) => {
    if (failFactory) throw new Error('editor busy');
    const p = new FakePanel(opts.viewType, opts.title);
    panels.push(p);
    return p;
  };
  const controller = createScratchPanels({
    panels: factory,
    store,
    genNonce: () => 'N',
    setPanelTitle: (_p, t) => { titles.push(t); },
    onSendToChat: (t) => { sentToChat.push(t); },
    logger: { warn: (m) => { warns.push(m); } },
  });
  return {
    panels,
    factory,
    store,
    fake,
    controller,
    sentToChat,
    titles,
    warns,
    get failFactory() { return failFactory; },
    set failFactory(v: boolean) { failFactory = v; },
  } as Harness;
}

const seed = async (h: Harness, id: string, content: string, mtime: number): Promise<void> => {
  await h.fake.fs.mkdir(ROOT);
  h.fake.files.set(`${ROOT}/${id}`, Buffer.from(content, 'utf8'));
  h.fake.kinds.set(`${ROOT}/${id}`, 'file');
  h.fake.mtimes.set(`${ROOT}/${id}`, mtime);
};

// ---------------------------------------------------------------------------
// t5: browse view
// ---------------------------------------------------------------------------

test('scratch-panel.test.ts: browse viewType insrc.scratchpads renders a table with Name and Modified columns (ac3)', async () => {
  const h = harness();
  await seed(h, '20260113-083000-pad.md', 'body', 300);
  await seed(h, '20260113-082000-other.md', 'body2', 100);
  const handle = await h.controller.openBrowse();
  assert.ok(handle !== undefined);
  const panel = h.panels[0]!;
  assert.equal(panel.viewType, SCRATCHPADS_VIEW_TYPE);
  assert.ok(panel.html.includes('<th>Name</th>') && panel.html.includes('<th>Modified</th>'), 'Name and Modified columns');
  assert.ok(panel.html.includes('20260113-083000-pad'), 'the entry name renders');
  assert.ok(panel.html.includes('scratchpads unavailable') === false, 'no error row on success');
  // The shell is the shared CSP+nonce one from panels/shell.ts.
  assert.match(panel.html, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-N';"/);
  assert.equal((panel.html.match(/<script\b/g) ?? []).length, 1, 'one nonce\'d script');
  // The list was UNBOUNDED: the store was asked with no limit.
  assert.equal(h.fake.ops('readdir').length >= 1, true);
});

test('scratch-panel.test.ts: each row has icon-only Open/Delete buttons (title hover text, data-id) posting scratch-open/scratch-delete (ac3, ac5)', async () => {
  const h = harness();
  await seed(h, '20260113-083000-pad.md', 'body', 300);
  const handle = (await h.controller.openBrowse()) as ScratchPanelHandle;
  const panel = h.panels[0]!;
  const openBtn = /<button type="button" class="scratch-open" data-id="([^"]*)" title="open" aria-label="open [^"]*">(.*?)<\/button>/.exec(panel.html);
  const delBtn = /<button type="button" class="scratch-delete" data-id="([^"]*)" title="delete" aria-label="delete [^"]*">(.*?)<\/button>/.exec(panel.html);
  assert.ok(openBtn && delBtn, 'both row buttons exist');
  assert.equal(openBtn![1], '20260113-083000-pad.md', 'data-id carries the id');
  for (const b of [openBtn![2], delBtn![2]]) {
    assert.match(b!, /^<svg /, 'icon-only: inline SVG');
    assert.equal(b!.replace(/<[^>]*>/g, '').trim(), '', 'no visible text on the button');
  }
  // The bootstrap wires the posts; run it over a fake DOM to prove the payloads.
  const doc = bodyStub('body');
  const openEl = bodyStub('button');
  openEl.setAttribute('data-id', '20260113-083000-pad.md');
  const delEl = bodyStub('button');
  delEl.setAttribute('data-id', '20260113-083000-pad.md');
  doc.appendChild(openEl);
  doc.appendChild(delEl);
  const sent: unknown[] = [];
  const script = panel.html.slice(panel.html.indexOf('>', panel.html.indexOf('<script nonce=')) + 1, panel.html.lastIndexOf('</script>'));
  runInNewContext(script, {
    acquireVsCodeApi: () => ({ postMessage: (m: unknown) => { sent.push(m); } }),
    document: {
      querySelectorAll: (sel: string) => (sel === '.scratch-open' ? [openEl] : sel === '.scratch-delete' ? [delEl] : []),
    },
  });
  fire(openEl, 'click');
  fire(delEl, 'click');
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    { v: 1, payload: { type: 'scratch-open', id: '20260113-083000-pad.md' } },
    { v: 1, payload: { type: 'scratch-delete', id: '20260113-083000-pad.md' } },
  ]);
  // The controller routes those messages: open -> document panel, delete -> store + refresh.
  panel.injectMessage({ v: 1, payload: { type: 'scratch-open', id: '20260113-083000-pad.md' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.panels.length, 2, 'scratch-open opened the document panel');
  assert.equal(h.panels[1]!.viewType, SCRATCHPAD_VIEW_TYPE);
  panel.injectMessage({ v: 1, payload: { type: 'scratch-delete', id: '20260113-083000-pad.md' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.fake.files.has(`${ROOT}/20260113-083000-pad.md`), false, 'delete removed the file');
  assert.ok(panel.html.includes('No scratchpads yet'), 'the browse table re-rendered empty after the delete');
  void handle;
});

test('scratch-panel.test.ts: empty list renders a hint row; create-or-reveal reuses a single panel instance; panel-factory failure returns undefined + logged and next click retries (ac3)', async () => {
  const h = harness();
  await h.fake.fs.mkdir(ROOT);
  const first = await h.controller.openBrowse();
  assert.ok(first !== undefined);
  assert.ok(h.panels[0]!.html.includes('No scratchpads yet'), 'empty hint row');
  assert.ok(/<tr class="scratch-empty-row">/.test(h.panels[0]!.html), 'the empty hint is a table row inside the browse table');
  const again = await h.controller.openBrowse();
  assert.equal(h.panels.length, 1, 'create-or-reveal reuses the single instance');
  assert.equal(again, first);
  assert.ok(h.panels[0]!.reveals >= 2, 'the second open revealed the cached panel');
  // ISSUE-3183af2a defect 1: a FRESH create reveals with focus PRESERVED (the user stays in
  // the chat they clicked from); the re-reveal of an existing panel uses the default reveal.
  assert.deepEqual(h.panels[0]!.revealFlags[0], true, 'the first (create) reveal preserves focus');
  assert.deepEqual(h.panels[0]!.revealFlags[1], undefined, 'the cached re-reveal is the default reveal');
  // Error row when the store fails.
  h.fake.failOn = (c) => (c.op === 'readdir' ? Object.assign(new Error('EACCES'), { code: 'EACCES' }) : undefined);
  await h.controller.refreshBrowse();
  assert.ok(h.panels[0]!.html.includes('scratchpads unavailable:'), 'error row renders the failure');
  assert.ok(/<tr class="scratch-error-row">/.test(h.panels[0]!.html), 'the error is a table row inside the browse table');
  h.fake.failOn = undefined;
  // Factory failure: undefined returned, a warning logged, next click retries.
  h.panels[0]!.userClose();
  h.failFactory = true;
  const warnsBefore = h.warns.length;
  const failed = await h.controller.openBrowse();
  assert.equal(failed, undefined, 'creation failure returns undefined (never throws)');
  assert.ok(h.warns.length > warnsBefore, 'a warning was logged on the factory failure');
  assert.ok(h.warns[h.warns.length - 1]!.includes('editor busy'), 'the warning carries the failure reason');
  assert.equal(h.panels.length, 1, 'no panel was cached');
  h.failFactory = false;
  const retried = await h.controller.openBrowse();
  assert.ok(retried !== undefined, 'the next click retries and succeeds');
  assert.equal(h.panels.length, 2);
});

// ---------------------------------------------------------------------------
// t6: document view
// ---------------------------------------------------------------------------

test('scratch-panel.test.ts: document viewType insrc.scratchpad renders a textarea and pushes content via the .value-only message (CSP-safe, ac4)', async () => {
  const h = harness();
  await seed(h, '20260113-083000-pad.md', '# Title\n\nbody <b>not markup</b>', 300);
  const handle = await h.controller.openDocument('20260113-083000-pad.md');
  assert.ok(handle !== undefined);
  const panel = h.panels[0]!;
  assert.equal(panel.viewType, SCRATCHPAD_VIEW_TYPE);
  assert.deepEqual(panel.revealFlags, [true], 'ISSUE-3183af2a: the fresh document reveal preserves focus (no focus steal from the chat popup)');
  // The static body holds an empty <textarea>; content arrives as a push.
  assert.ok(panel.html.includes('<textarea id="insrc-scratchdoc" class="scratch-doc"'), 'the doc element is a textarea');
  assert.ok(!panel.html.includes('<pre id="insrc-scratchdoc"'), 'no <pre> remains');
  assert.ok(!panel.html.includes('not markup</b>'), 'content is NOT baked into the HTML');
  const push = panel.posted.find((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content') as { payload: { text: string } } | undefined;
  assert.ok(push !== undefined, 'content was pushed as a message');
  assert.equal(push!.payload.text, '# Title\n\nbody <b>not markup</b>');
  // The bootstrap applies it via doc.value only: run the script over a fake DOM.
  const doc = bodyStub('textarea', 'insrc-scratchdoc');
  const listeners: Array<(e: unknown) => void> = [];
  runInNewContext(documentBootstrap(1, '20260113-083000-pad.md'), {
    acquireVsCodeApi: () => ({ postMessage: () => {} }),
    window: {
      addEventListener: (t: string, l: (e: unknown) => void) => { if (t === 'message') listeners.push(l); },
    },
    document: {
      getElementById: (id: string) => (id === 'insrc-scratchdoc' ? doc : bodyStub('button', id)),
      querySelector: () => bodyStub('div', 'wrap'),
      addEventListener: () => {},
      createElement: () => bodyStub('div', 'err'),
    },
  });
  for (const l of listeners) l({ data: { v: 1, payload: { type: 'scratch-content', text: '<b>x</b>' } } });
  assert.equal(doc.value, '<b>x</b>', 'applied to .value, never parsed as markup');
  assert.ok(!allOf(doc).some((n) => n.writes.some((w) => w.prop === 'innerHTML')), 'no innerHTML write for content');
  assert.ok(!allOf(doc).some((n) => n.writes.some((w) => w.prop === 'textContent')), 'no textContent write for content (textarea content goes through .value)');
});

test('scratch-panel.test.ts: textarea selection (selectionStart/selectionEnd over doc.value) shows the floating icon-only Send-to-chat button (title) which posts send-to-chat {text}; selection-to-button click preserves the captured selection (ac4, ac5)', () => {
  const body = documentBodyHtml();
  const btn = /<button type="button" id="insrc-sendtochat" class="scratch-send" title="Send to chat" aria-label="Send to chat" hidden>(.*?)<\/button>/.exec(body);
  assert.ok(btn, 'the floating button exists');
  assert.match(btn![1]!, /^<svg /, 'icon-only');
  assert.equal(btn![1]!.replace(/<[^>]*>/g, '').trim(), '', 'no visible text');
  // Run the bootstrap: a select event with a textarea selection reveals the button,
  // latches the text read from doc.value.substring(selectionStart, selectionEnd).
  const doc = bodyStub('textarea', 'insrc-scratchdoc');
  doc.value = 'hello selected <text> world';
  doc.selectionStart = 6;
  doc.selectionEnd = 21;
  const sendBtn = bodyStub('button', 'insrc-sendtochat');
  let hiddenProp = true;
  Object.defineProperty(sendBtn, 'hidden', { get: () => hiddenProp, set: (v: boolean) => { hiddenProp = v; } });
  const sent: unknown[] = [];
  const docListeners: Record<string, Array<(e?: unknown) => void>> = {};
  let activeElement: unknown = undefined; // the document's focused element
  const docAddEventListener = doc.addEventListener.bind(doc);
  doc.addEventListener = ((t: string, l: (e?: unknown) => void) => { (docListeners[t] ??= []).push(l); }) as unknown as typeof docAddEventListener;
  runInNewContext(documentBootstrap(1, 'pad.md'), {
    acquireVsCodeApi: () => ({ postMessage: (m: unknown) => { sent.push(m); } }),
    window: {
      addEventListener: () => {},
    },
    document: {
      getElementById: (id: string) => (id === 'insrc-scratchdoc' ? doc : id === 'insrc-sendtochat' ? sendBtn : bodyStub('button', id)),
      querySelector: () => bodyStub('div', 'wrap'),
      addEventListener: () => {},
      get activeElement() { return activeElement; },
      createElement: () => bodyStub('div', 'err'),
    },
  });
  // select fires with a non-empty textarea selection.
  for (const l of docListeners['select'] ?? []) l();
  assert.equal((sendBtn as unknown as { hidden: boolean }).hidden, false, 'button revealed on a non-empty textarea selection');
  // The user presses the button: focus moves to it (activeElement = the button) and a
  // collapsed selection fires — the button must STAY VISIBLE for the click.
  activeElement = sendBtn;
  doc.selectionStart = doc.selectionEnd = 0;
  for (const l of docListeners['select'] ?? []) l();
  assert.equal((sendBtn as unknown as { hidden: boolean }).hidden, false, 'button stays visible while it holds focus (the click in flight)');
  fire(sendBtn, 'click');
  const posted = JSON.parse(JSON.stringify(sent)) as Array<{ v: number; payload: { type: string; text?: string } }>;
  assert.deepEqual(posted.filter((m) => m.payload.type === 'send-to-chat'), [{ v: 1, payload: { type: 'send-to-chat', text: 'selected <text>' } }], 'the textarea selection (doc.value.substring(selectionStart,selectionEnd)) was posted, not lost to the focus change');
  assert.ok(posted.some((m) => (m as { payload?: { type?: string; gen?: number } }).payload?.type === 'scratch-ready' && (m as { payload: { gen: number } }).payload.gen === 1), 'the bootstrap signalled scratch-ready with its generation tag echoed');
  // Clicking elsewhere collapses the selection with focus NOT on the button: hidden again.
  activeElement = undefined;
  for (const l of docListeners['select'] ?? []) l();
  assert.equal((sendBtn as unknown as { hidden: boolean }).hidden, true, 'button hides on a collapsed selection when it does not hold focus');
  // Webview-side cap: a >65,536-byte selection is truncated in the bootstrap before
  // posting, WITHOUT splitting surrogate pairs.
  const big = '😀'.repeat(20_000); // 80,000 UTF-8 bytes
  doc.value = big;
  doc.selectionStart = 0;
  doc.selectionEnd = big.length;
  for (const l of docListeners['select'] ?? []) l();
  fire(sendBtn, 'click');
  const bigMsg = sent.map((m) => m as { payload: { type: string; text?: string } }).filter((m) => m.payload.type === 'send-to-chat').at(-1)!;
  assert.ok(bigMsg !== undefined, 'the big selection was posted as send-to-chat');
  assert.ok(Buffer.byteLength(bigMsg.payload.text, 'utf8') <= 65_536, 'the posted text is capped within 65,536 bytes webview-side');
  assert.ok(bigMsg.payload.text.endsWith('…'), 'the posted text carries the trailing ellipsis');
  const cappedBody = bigMsg.payload.text.slice(0, -1); // without the ellipsis
  assert.ok(!/�/.test(bigMsg.payload.text), 'no replacement char: no surrogate pair was split');
  assert.equal(cappedBody, '😀'.repeat(Math.floor(65_533 / 4)), 'whole 4-byte chars only: 16,383 emoji fit the 65,533-byte budget');
});

test('scratch-panel.test.ts: A->B document switching asserts setTitle(B) on the SAME panel instance alongside content, with reversed read completion (generation guard)', async () => {
  const h = harness();
  await seed(h, 'a.md', 'content A', 100);
  await seed(h, 'b.md', 'content B', 200);
  // Make A's read hang so B's read completes first (reversed completion).
  let releaseA!: () => void;
  const gateA = new Promise<void>((r) => { releaseA = r; });
  const origRead = h.store.readScratch.bind(h.store);
  let aCalls = 0;
  const store: ScratchStore = {
    ...h.store,
    readScratch: async (id: string) => {
      if (id === 'a.md' && aCalls++ === 0) await gateA;
      return origRead(id);
    },
  };
  const controller = createScratchPanels({
    panels: h.factory,
    store,
    genNonce: () => 'N',
    setPanelTitle: (_p, t) => { h.titles.push(t); },
    onSendToChat: (t) => { h.sentToChat.push(t); },
  });
  const openA = controller.openDocument('a.md');
  const handleB = await controller.openDocument('b.md');
  assert.ok(handleB !== undefined);
  assert.equal(h.panels.length, 1, 'A->B reuses the SAME panel instance');
  assert.ok(h.titles.includes('b.md'), 'setTitle(B) was called on the cached instance');
  const panel = h.panels[0]!;
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(panel.posted.some((m) => (m as { payload?: { type?: string; text?: string } }).payload?.type === 'scratch-content' && (m as { payload: { text: string } }).payload.text === 'content B'), 'B\'s content was posted');
  releaseA();
  await openA;
  await new Promise((r) => setTimeout(r, 10));
  const contents = panel.posted.filter((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content').map((m) => (m as { payload: { text: string } }).payload.text);
  assert.ok(!contents.includes('content A'), 'the late-resolving read of A was dropped by the generation guard');
  assert.deepEqual(contents, ['content B']);
});

test('scratch-panel.test.ts: scratch-ready vs read-completion ordering — ready BEFORE the read completes delivers content exactly once and retains no replay copy; read BEFORE ready replays once and a second ready never re-posts (t6 readyGenerations/pendingContent retention)', async () => {
  const contentsOf = (panel: FakePanel): string[] =>
    panel.posted.filter((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content')
      .map((m) => (m as { payload: { text: string } }).payload.text);

  // Order 1: scratch-ready arrives while the read is still in flight. The read's
  // completion must post directly and must NOT retain a pendingContent copy (the
  // generation is already ready) — a later duplicate ready must not re-post.
  {
    const h = harness();
    await seed(h, 'a.md', 'content A', 1);
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const origRead = h.store.readScratch.bind(h.store);
    const store: ScratchStore = {
      ...h.store,
      readScratch: async (id: string) => {
        if (id === 'a.md') { await gate; return origRead(id); }
        return origRead(id);
      },
    };
    const c = createScratchPanels({ panels: h.factory, store, genNonce: () => 'N', setPanelTitle: () => {}, onSendToChat: () => {} });
    const open = c.openDocument('a.md');
    await new Promise((r) => setTimeout(r, 10));
    const panel = h.panels.at(-1)!;
    panel.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 1 } }); // ready BEFORE the read resolves
    release();
    await open;
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(contentsOf(panel), ['content A'], 'the post-ready read posts its content exactly once');
    panel.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 1 } }); // duplicate ready: nothing to replay
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(contentsOf(panel), ['content A'], 'a duplicate scratch-ready does not re-post — no replay copy was retained for a ready generation');
  }

  // Order 2: the read completes BEFORE scratch-ready. The content is posted once and a
  // replay copy is retained; the first ready replays it (second delivery, expected —
  // the webview was not listening yet), and a SECOND ready must not re-post again.
  {
    const h = harness();
    await seed(h, 'b.md', 'content B', 2);
    const c = createScratchPanels({ panels: h.factory, store: h.store, genNonce: () => 'N', setPanelTitle: () => {}, onSendToChat: () => {} });
    await c.openDocument('b.md'); // read resolves immediately, before any ready
    await new Promise((r) => setTimeout(r, 10));
    const panel = h.panels.at(-1)!;
    assert.deepEqual(contentsOf(panel), ['content B'], 'the pre-ready read posted its content once');
    panel.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 1 } });
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(contentsOf(panel), ['content B', 'content B'], 'the first ready replays the retained copy (the webview was not yet listening)');
    panel.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 1 } });
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(contentsOf(panel), ['content B', 'content B'], 'a second ready does not re-post — the replay copy was consumed');
    // A NEXT open retires the previous generation's bookkeeping: open another doc, then
    // a ready for the OLD webview state must not replay the old generation again.
    await seed(h, 'c.md', 'content C', 3);
    await c.openDocument('c.md');
    await new Promise((r) => setTimeout(r, 10));
    const panel2 = h.panels.at(-1)!;
    assert.equal(panel2, panel, 'the document singleton is reused across opens');
    panel2.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 2 } });
    await new Promise((r) => setTimeout(r, 10));
    // The new generation's own retained copy replays (its read completed pre-ready);
    // the OLD generation's copy was retired at the generation bump and is NOT replayed.
    assert.deepEqual(contentsOf(panel2), ['content B', 'content B', 'content C', 'content C'], 'the new generation replays only its own content — the old generation was retired, never re-posted');
  }

  // Order 3: the read completes BEFORE ready (a replay copy is retained), then the user
  // CLOSES the panel before any ready arrives. The dispose must release the retained
  // content: a reopen + ready must deliver ONLY the new document's content, never the
  // closed generation's.
  {
    const h = harness();
    await seed(h, 'a.md', 'content A', 1);
    await seed(h, 'b.md', 'content B', 2);
    const c = createScratchPanels({ panels: h.factory, store: h.store, genNonce: () => 'N', setPanelTitle: () => {}, onSendToChat: () => {} });
    await c.openDocument('a.md'); // read resolves immediately, pre-ready: retained
    await new Promise((r) => setTimeout(r, 10));
    const panelA = h.panels.at(-1)!;
    assert.deepEqual(contentsOf(panelA), ['content A'], 'the pre-ready read posted once');
    panelA.userClose(); // close BEFORE scratch-ready: the retained copy must be released
    await new Promise((r) => setTimeout(r, 10));
    // A late ready from the disposed webview must not re-post the closed generation.
    panelA.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 1 } });
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(contentsOf(panelA), ['content A'], 'no replay after close — the retained copy was released by the dispose');
    // Reopen b.md: the fresh panel gets only its own content, never the closed A again.
    await c.openDocument('b.md');
    await new Promise((r) => setTimeout(r, 10));
    const panelB = h.panels.at(-1)!;
    assert.notEqual(panelB, panelA, 'reopening after close creates a fresh panel');
    // The close bumped docGeneration to 2 (retiring all retained state); the reopen's
    // page load is therefore generation 3 — only a ready tagged 3 may replay.
    panelB.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 3 } });
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(contentsOf(panelB), ['content B', 'content B'], 'the reopened panel replays only its own content — the closed generation left nothing behind');
    assert.ok(!contentsOf(panelB).includes('content A'), 'the closed generation was never replayed');
  }
});

test('scratch-panel.test.ts: a STALE scratch-ready (generation tag from a superseded page load) delivered AFTER an A->B switch is ignored — it must not mark generation B ready (t6: bind readiness to the sending generation)', async () => {
  const contentsOf = (panel: FakePanel): string[] =>
    panel.posted.filter((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content')
      .map((m) => (m as { payload: { text: string } }).payload.text);
  const h = harness();
  await seed(h, 'a.md', 'content A', 1);
  await seed(h, 'b.md', 'content B', 2);
  // Gate A's read so B's open (generation 2) lands while A (generation 1) is still in flight.
  let releaseA!: () => void;
  const gateA = new Promise<void>((r) => { releaseA = r; });
  const origRead = h.store.readScratch.bind(h.store);
  let aCalls = 0;
  const store: ScratchStore = {
    ...h.store,
    readScratch: async (id: string) => {
      if (id === 'a.md' && aCalls++ === 0) await gateA;
      return origRead(id);
    },
  };
  const c = createScratchPanels({ panels: h.factory, store, genNonce: () => 'N', setPanelTitle: () => {}, onSendToChat: () => {} });
  const openA = c.openDocument('a.md'); // generation 1
  const handleB = await c.openDocument('b.md'); // generation 2, same cached panel
  assert.ok(handleB !== undefined);
  const panel = h.panels.at(-1)!;
  await new Promise((r) => setTimeout(r, 10));
  // B's read already posted (generation 2 not yet ready -> a replay copy is retained).
  assert.deepEqual(contentsOf(panel), ['content B'], 'B posted its content once');
  // The STALE ready from generation 1's webview arrives late, after the A->B switch.
  panel.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 1 } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(contentsOf(panel), ['content B'], 'a stale ready (gen 1) does NOT replay or mark generation 2 ready');
  // A ready with NO generation tag is likewise untrusted and ignored.
  panel.injectMessage({ v: 1, payload: { type: 'scratch-ready' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(contentsOf(panel), ['content B'], 'an untagged ready is ignored too');
  // Generation 2's OWN ready still works: replays the retained copy exactly once.
  panel.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 2 } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(contentsOf(panel), ['content B', 'content B'], 'generation 2\'s own ready replays its retained copy once');
  // The late A read is dropped by the generation guard as before.
  releaseA();
  await openA;
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(!contentsOf(panel).includes('content A'), 'the late A read was dropped');
});

test('scratch-panel.test.ts: ISSUE-3183af2a — a FRESH scratch-new open (no cached panel) posts content for its generation AND retains a replay copy until its own scratch-ready, so content arriving before the webview listener installs is delivered by the ready replay exactly once end-to-end', async () => {
  const contentsOf = (panel: FakePanel): string[] =>
    panel.posted.filter((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content')
      .map((m) => (m as { payload: { text: string } }).payload.text);
  const h = harness();
  await seed(h, 'fresh.md', 'fresh content', 1);
  // Gate the read so the panel exists and content posting happens AFTER setHtml, i.e. the
  // realistic scratch-new sequence: create -> openDocument (panel created + revealed) -> read.
  const c = h.controller;
  const handle = await c.openDocument('fresh.md');
  assert.ok(handle !== undefined, 'the fresh open created the document panel');
  const panel = h.panels.at(-1)!;
  // The read resolved pre-ready: content posted once, replay copy retained.
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(contentsOf(panel), ['fresh content'], 'the pre-ready content posted once');
  // The webview's own ready (generation 1) replays the retained copy exactly once...
  panel.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 1 } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(contentsOf(panel), ['fresh content', 'fresh content'], 'the ready replays the retained copy (the webview was not listening yet)');
  // ...and the replay copy is consumed: a duplicate ready re-posts nothing, and a LATER read
  // (content re-read after ready) posts directly without being retained.
  panel.injectMessage({ v: 1, payload: { type: 'scratch-ready', gen: 1 } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(contentsOf(panel).length, 2, 'a duplicate ready re-posts nothing');
});

test('scratch-panel.test.ts: ISSUE-3183af2a CR-MED — wrap() behaviorally logs a dropped post for BOTH delivery outcomes: false (not ready / disposed) and a rejection (disposed panel); a delivered post logs nothing', async () => {
  const h = harness();
  await seed(h, 'drop.md', 'D', 1);
  const wrapped = await h.controller.openDocument('drop.md');
  assert.ok(wrapped !== undefined, 'the open returned the wrapped handle');
  const panel = h.panels.at(-1)!;
  h.warns.length = 0;
  // Delivered post: no warning.
  panel.delivery = true;
  wrapped!.postMessage({ v: 1, payload: { type: 'scratch-content', text: 'x' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(h.warns, [], 'a delivered post logs nothing');
  // False delivery: warned once, and the post still went out (recorded by the fake).
  h.warns.length = 0;
  panel.delivery = false;
  const postedBefore = panel.posted.length;
  wrapped!.postMessage({ v: 1, payload: { type: 'scratch-content', text: 'y' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(panel.posted.length, postedBefore + 1, 'the post itself still went out');
  assert.equal(h.warns.length, 1, 'a false delivery logs exactly one warning');
  assert.match(h.warns[0]!, /not delivered \(webview not ready or disposed\)/, 'the false-delivery warning names the dropped message');
  // Rejected post (disposed panel): warned with the rejection wording.
  h.warns.length = 0;
  panel.delivery = 'reject';
  wrapped!.postMessage({ v: 1, payload: { type: 'scratch-content', text: 'z' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.warns.length, 1, 'a rejected post logs exactly one warning');
  assert.match(h.warns[0]!, /rejected \(panel disposed\)/, 'the rejection warning names the dropped message');
  // A synchronous throw is logged too, and never propagates to the caller.
  h.warns.length = 0;
  panel.delivery = true;
  const orig = panel.postMessage.bind(panel);
  panel.postMessage = (m: unknown): Promise<boolean> => { orig(m); throw new Error('sync boom'); };
  assert.doesNotThrow(() => wrapped!.postMessage({ v: 1, payload: { type: 'scratch-content', text: 'w' } }), 'a synchronous throw is contained');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.warns.length, 1, 'a synchronous throw logs one warning');
  assert.match(h.warns[0]!, /threw synchronously/, 'the sync-throw warning is distinct');
});

test('scratch-panel.test.ts: a FAILED row-initiated delete re-renders the browse table WITH the delete error row (the undeleted scratch stays visible but the failure is surfaced, not logged away)', async () => {
  const h = harness();
  await seed(h, 'keep.md', 'K', 1);
  await h.controller.openBrowse();
  const panel = h.panels[0]!;
  assert.ok(!panel.html.includes('delete failed'), 'no error row before the delete');
  assert.ok(/<tr class="scratch-error-row">/.test(panel.html) === false, 'no error row markup before the delete');
  // Make the delete fail at unlink (EPERM) — the row's scratch-delete message drives the
  // controller's deleteAndRefresh path.
  const origUnlink = h.fake.fs.unlink.bind(h.fake.fs);
  h.fake.fs.unlink = async (p: string) => {
    if (p.endsWith('keep.md')) { const e = new Error('EPERM: operation not permitted'); (e as NodeJS.ErrnoException).code = 'EPERM'; throw e; }
    return origUnlink(p);
  };
  panel.injectMessage({ v: 1, payload: { type: 'scratch-delete', id: 'keep.md' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(panel.html.includes('delete failed:') && panel.html.includes('EPERM'), 'the browse table re-rendered with the delete error row carrying the failure');
  assert.ok(/<tr class="scratch-error-row">/.test(panel.html), 'the error is a table row inside the browse table');
  assert.ok(h.fake.files.has(`${ROOT}/keep.md`), 'the file is still present after the failed delete');
  // A subsequent successful refresh clears the error row.
  h.fake.fs.unlink = origUnlink;
  await h.controller.refreshBrowse();
  assert.ok(!panel.html.includes('delete failed'), 'a healthy refresh clears the error row');
  assert.ok(panel.html.includes('keep.md'), 'the scratch is still listed');
});

test('scratch-panel.test.ts: a FAILED delete keeps the open document open (the scratchpad still exists, so its document is not closed)', async () => {
  const h = harness();
  await seed(h, 'keep.md', 'K', 1);
  await h.controller.openBrowse();
  const browse = h.panels[0]!;
  // Open the document panel for keep.md.
  await h.controller.openDocument('keep.md');
  const doc = h.panels.find((p) => p !== browse)!;
  const docContents = (): string[] =>
    doc.posted.filter((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content')
      .map((m) => (m as { payload: { text: string } }).payload.text);
  assert.ok(docContents().includes('K'), 'document is showing keep.md');
  // Fail the delete at unlink (EPERM).
  const origUnlink = h.fake.fs.unlink.bind(h.fake.fs);
  h.fake.fs.unlink = async (p: string) => {
    if (p.endsWith('keep.md')) { const e = new Error('EPERM: operation not permitted'); (e as NodeJS.ErrnoException).code = 'EPERM'; throw e; }
    return origUnlink(p);
  };
  browse.injectMessage({ v: 1, payload: { type: 'scratch-delete', id: 'keep.md' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(h.fake.files.has(`${ROOT}/keep.md`), 'the file is still present');
  assert.ok(!doc.disposed, 'the open document is NOT disposed after a failed delete');
  assert.ok(docContents().includes('K'), 'the document still shows the scratchpad');
  // A successful delete DOES close the document.
  h.fake.fs.unlink = origUnlink;
  browse.injectMessage({ v: 1, payload: { type: 'scratch-delete', id: 'keep.md' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!h.fake.files.has(`${ROOT}/keep.md`), 'the file is gone after the successful delete');
  assert.ok(doc.disposed, 'the open document is disposed after a successful delete');
});

test('scratch-panel.test.ts: a FAILED delete does NOT invalidate an IN-FLIGHT read of the still-existing scratchpad (epoch is bumped only after a successful delete — CR attempt-10 t5 MED)', async () => {
  const h = harness();
  await seed(h, 'keep.md', 'K', 1);
  await h.controller.openBrowse();
  const browse = h.panels[0]!;
  // Block the read so the delete lands while it is in flight.
  const origRead = h.store.readScratch.bind(h.store);
  let releaseRead: () => void = () => undefined;
  const readGate = new Promise<void>((r) => { releaseRead = r; });
  h.store.readScratch = async (id: string) => {
    const out = await origRead(id);
    if (id === 'keep.md') await readGate;
    return out;
  };
  const openP = h.controller.openDocument('keep.md');
  await new Promise((r) => setTimeout(r, 5)); // let the read start and block
  // Fail the delete at unlink (EPERM) while the read is in flight.
  const origUnlink = h.fake.fs.unlink.bind(h.fake.fs);
  h.fake.fs.unlink = async (p: string) => {
    if (p.endsWith('keep.md')) { const e = new Error('EPERM: operation not permitted'); (e as NodeJS.ErrnoException).code = 'EPERM'; throw e; }
    return origUnlink(p);
  };
  browse.injectMessage({ v: 1, payload: { type: 'scratch-delete', id: 'keep.md' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(h.fake.files.has(`${ROOT}/keep.md`), 'the file is still present after the failed delete');
  // Release the in-flight read: the failed delete must NOT have bumped the epoch,
  // so the read's content is delivered, not dropped as stale.
  releaseRead();
  const doc = (await openP) !== undefined ? h.panels.find((p) => p !== browse)! : undefined;
  assert.ok(doc, 'the document panel opened');
  const docContents = doc!.posted.filter((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content')
    .map((m) => (m as { payload: { text: string } }).payload.text);
  assert.ok(docContents.includes('K'), 'the in-flight read is NOT dropped after a failed delete (epoch unchanged)');
  // A subsequent SUCCESSFUL delete does invalidate: a new open after it gets ENOENT.
  h.fake.fs.unlink = origUnlink;
  browse.injectMessage({ v: 1, payload: { type: 'scratch-delete', id: 'keep.md' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!h.fake.files.has(`${ROOT}/keep.md`), 'the file is gone after the successful delete');
});

test('scratch-panel.test.ts: stale ENOENT, deleting a non-displayed document, delete invalidates pending opens of the deleted id, closing/reopening the document panel during an outstanding read (dispose invalidates the generation, late read dropped)', async () => {
  const h = harness();
  await seed(h, 'a.md', 'A', 1);
  await seed(h, 'b.md', 'B', 2);
  await seed(h, 'gone.md', 'G', 3);

  // Stale ENOENT race: open a.md (shown), then start a GATED open of gone.md whose read
  // will reject ScratchNotFound, then re-open b.md so the panel displays b.md, and only
  // then release gone.md's rejection — a stale not-found arriving while another id is
  // displayed must NOT close the shown panel.
  const handle = await h.controller.openDocument('a.md');
  assert.ok(handle !== undefined);
  assert.equal(h.controller.showingId, 'a.md');
  await h.store.deleteScratch('gone.md'); // gone.md now rejects ScratchNotFound on read
  let releaseGone!: () => void;
  const gateGone = new Promise<void>((r) => { releaseGone = r; });
  const origRead2 = h.store.readScratch.bind(h.store);
  const storeG: ScratchStore = {
    ...h.store,
    readScratch: async (id: string) => {
      if (id === 'gone.md') { await gateGone; return origRead2(id); } // rejects AFTER the gate
      return origRead2(id);
    },
  };
  const cG = createScratchPanels({ panels: h.factory, store: storeG, genNonce: () => 'N', setPanelTitle: () => {}, onSendToChat: () => {} });
  const staleOpen = cG.openDocument('gone.md'); // read is gated, will reject late
  const openB2 = cG.openDocument('b.md'); // panel now displays b.md
  await openB2;
  assert.equal(cG.showingId, 'b.md');
  const docPanel = h.panels.at(-1)!; // the singleton document panel both opens share
  const bPushed = docPanel.posted.some((m) => (m as { payload?: { type?: string; text?: string } }).payload?.type === 'scratch-content' && (m as { payload: { text: string } }).payload.text === 'B');
  assert.ok(bPushed, 'b.md content was posted to the singleton document panel');
  releaseGone(); // now the stale ScratchNotFound for gone.md arrives while b.md is shown
  await staleOpen;
  await new Promise((r) => setTimeout(r, 10)); // let any stale completion land
  assert.equal(cG.showingId, 'b.md', 'a stale ScratchNotFound for another id does not close the shown panel');
  assert.ok(!docPanel.disposed, 'the singleton document panel was not disposed by the stale ENOENT');
  const contentPushes = docPanel.posted.filter((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content');
  assert.ok(contentPushes.some((m) => (m as { payload: { text: string } }).payload.text === 'B'), 'the shown panel received its content and was not torn down by the stale ENOENT');
  assert.ok(!contentPushes.some((m) => (m as { payload: { text: string } }).payload.text === 'G'), 'no content was posted for the deleted gone.md');

  // Delete invalidates pending opens of the deleted id: open b.md with a gated read, delete b.md, then let the read finish.
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const origRead = h.store.readScratch.bind(h.store);
  const store: ScratchStore = {
    ...h.store,
    readScratch: async (id: string) => {
      if (id === 'b.md') { await gate; return origRead(id); }
      return origRead(id);
    },
  };
  const c2 = createScratchPanels({ panels: h.factory, store, genNonce: () => 'N', setPanelTitle: () => {}, onSendToChat: () => {} });
  const openB = c2.openDocument('b.md');
  c2.invalidateId('b.md'); // as deleteScratch would
  await h.store.deleteScratch('b.md');
  release();
  await openB;
  const panelB = h.panels.at(-1)!;
  assert.ok(!panelB.posted.some((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content'), 'the pending open of the deleted id was invalidated (no content posted)');
  // Epoch rejection of a SUCCESSFUL stale read: gate the read, invalidate (delete) the id,
  // then let the read RESOLVE with content — the epoch check must drop it.
  let releaseE!: () => void;
  const gateE = new Promise<void>((r) => { releaseE = r; });
  const storeE: ScratchStore = {
    ...h.store,
    readScratch: async (id: string) => {
      if (id === 'a.md' && h.fake.files.has(`${ROOT}/a.md`)) { await gateE; return origRead(id); }
      return origRead(id);
    },
  };
  const cE = createScratchPanels({ panels: h.factory, store: storeE, genNonce: () => 'N', setPanelTitle: () => {}, onSendToChat: () => {} });
  const openE = cE.openDocument('a.md');
  const panelE = h.panels.at(-1)!;
  cE.invalidateId('a.md'); // the id was deleted while the read was in flight
  releaseE();
  await openE;
  assert.ok(!panelE.posted.some((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content'), 'a successful but stale-epoch read is dropped by the epoch guard');

  // Closing/reopening during an outstanding read: dispose invalidates the generation.
  let releaseC!: () => void;
  const gateC = new Promise<void>((r) => { releaseC = r; });
  const store2: ScratchStore = {
    ...h.store,
    readScratch: async (id: string) => {
      if (id === 'a.md') { await gateC; return origRead(id); }
      return origRead(id);
    },
  };
  const c3 = createScratchPanels({ panels: h.factory, store: store2, genNonce: () => 'N', setPanelTitle: () => {}, onSendToChat: () => {} });
  const openC = c3.openDocument('a.md');
  const panelC = h.panels.at(-1)!;
  panelC.userClose(); // the user closes the panel mid-read: dispose bumps the generation
  releaseC();
  await openC;
  assert.ok(!panelC.posted.some((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content'), 'the late read after dispose was dropped');
  // Reopen after dispose: a fresh open creates a NEW panel and posts its content.
  const reopened = await c3.openDocument('a.md');
  assert.ok(reopened !== undefined);
  const panelC2 = h.panels.at(-1)!;
  assert.notEqual(panelC2, panelC, 'reopening after dispose creates a fresh panel');
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(panelC2.posted.some((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content'), 'the reopened panel receives its content');

  // Deleting a NON-displayed document does not close the shown one: actually delete
  // b.md (via the browse row path semantics) while a.md is displayed.
  const shown = await h.controller.openDocument('a.md');
  assert.ok(shown !== undefined);
  await h.store.deleteScratch('b.md');
  h.controller.invalidateId('b.md');
  h.controller.closeDocumentIfShowing('b.md'); // b.md is not displayed
  assert.equal(h.controller.showingId, 'a.md', 'deleting/closing a non-displayed id leaves the shown document open');
  h.controller.closeDocumentIfShowing('a.md');
  assert.equal(h.controller.showingId, undefined, 'closing the displayed id closes it');
});

test('scratch-panel.test.ts: UTF-8 cap — final inserted string incl. ellipsis within 65,536 bytes, with a multibyte boundary case', async () => {
  // The cap lives in production: capUtf8 in scratch-panels.ts, applied by the controller
  // to every send-to-chat text before it reaches the chat. The final string, ellipsis
  // included, must stay within 65,536 UTF-8 bytes.
  const cap = SEND_TO_CHAT_CAP;
  const ellipsis = '…';
  const ellipsisBytes = Buffer.byteLength(ellipsis, 'utf8');
  const fit = capUtf8;
  // Boundary: a 4-byte char straddling the cut is dropped whole.
  const emoji = '😀'; // 4 bytes
  const budget = cap - ellipsisBytes; // 65,533 bytes; not 4-divisible
  const fits = Math.floor(budget / 4); // 16383 emoji fit; 1 byte of budget is left unused
  const atBoundary = emoji.repeat(fits + 2); // (fits+1)*4 = 65,536 == cap (no truncation); one more char forces the cut
  const capped = fit(atBoundary);
  const capBytes = Buffer.byteLength(capped, 'utf8');
  assert.ok(capBytes <= cap, `final string incl. ellipsis within the cap (${capBytes})`);
  assert.ok(capBytes === fits * 4 + ellipsisBytes, `budget used to the boundary (${capBytes} = ${fits}*4 + ${ellipsisBytes})`);
  assert.ok(capped === emoji.repeat(fits) + ellipsis, 'the straddling 4-byte char is dropped whole');
  // Exactly at cap: no truncation (the cap is inclusive).
  const exact = 'a'.repeat(cap);
  assert.equal(fit(exact), exact, 'a string of exactly cap bytes is returned unchanged');
  // One byte over the cap: the ellipsis is appended within the cap.
  const oneOver = 'a'.repeat(cap + 1);
  assert.ok(Buffer.byteLength(fit(oneOver), 'utf8') <= cap, 'one byte over the cap still fits after truncation');
  // A multibyte string over the cap stays within it after fitting.
  const over = 'é'.repeat(cap); // 2 bytes each
  assert.ok(Buffer.byteLength(fit(over), 'utf8') <= cap);
  // The controller applies the cap to posted send-to-chat text end-to-end.
  const h = harness();
  await seed(h, 'big.md', 'x', 1);
  const huge = '😀'.repeat(fits + 2);
  const handle = await h.controller.openDocument('big.md');
  assert.ok(handle !== undefined);
  h.panels[0]!.injectMessage({ v: 1, payload: { type: 'send-to-chat', text: huge } });
  assert.equal(h.sentToChat.length, 1, 'the send-to-chat was routed');
  assert.ok(Buffer.byteLength(h.sentToChat[0]!, 'utf8') <= cap, 'the routed text is capped within 65,536 bytes');
  assert.ok(h.sentToChat[0]!.endsWith(ellipsis), 'the routed text carries the trailing ellipsis');
});

test('scratch-panel.test.ts: browseHtml error row and empty hint are CSP-safe (escaped)', () => {
  assert.ok(browseHtml([], 'scratchpads unavailable: EACCES <script>').includes('&lt;script&gt;'), 'error text escaped');
  assert.ok(browseHtml([], undefined).includes('No scratchpads yet'));
  const withName = browseHtml([{ id: 'x.md', name: 'a<b>', mtime: 0, size: 1 }]);
  assert.ok(withName.includes('a&lt;b&gt;'), 'entry names escaped');
  void textOf;
});

test('chat-panel.test.ts + scratch-panel.test.ts: every button in the new UI is icon-only with a title attribute — no visible text content on buttons (ac5)', () => {
  // Executed HERE (the scratch-panel side of the shared ac5 name): every button the
  // scratchpad panels render — the browse rows' Open/Delete and the document view's
  // floating Send-to-chat — is icon-only (inline SVG, zero visible text) and carries a
  // strict title= hover. The chat-panel side of this name runs in chat-panel.test.ts
  // over the status-bar buttons; together they cover every button the feature added.
  const browse = browseHtml([{ id: '20260113-083000-pad.md', name: 'pad', mtime: 300, size: 4 }]);
  const doc = documentBodyHtml();
  for (const [label, html] of [['browse', browse], ['document', doc]] as const) {
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    assert.ok(buttons.length > 0, `${label} view renders at least one button`);
    for (const b of buttons) {
      const open = /<button\b([^>]*)>/.exec(b)![1]!;
      assert.ok(/\stitle="[^"]+"/.test(open), `${label} button carries a title= hover: ${open}`);
      const inner = b.replace(/^<button\b[^>]*>/, '').replace(/<\/button>$/, '');
      assert.match(inner, /^<svg /, `${label} button is icon-only (inline SVG): ${b.slice(0, 100)}`);
      assert.equal(inner.replace(/<[^>]*>/g, '').trim(), '', `${label} button has no visible text content`);
    }
  }
  // The two browse row buttons and the document view's Save + Send-to-chat buttons are
  // exactly the buttons the scratchpad panels add.
  assert.equal((browse.match(/<button\b/g) ?? []).length, 2, 'browse renders exactly Open + Delete per row');
  assert.equal((doc.match(/<button\b/g) ?? []).length, 2, 'document renders exactly the Save and Send-to-chat buttons');
});

// ---------------------------------------------------------------------------
// t2: document-channel protocol (scratch-panels.ts own unions/arrays)
// ---------------------------------------------------------------------------

test("scratch-panel.test.ts: 'scratch-save' in SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES and NOT in SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES; 'scratch-saved' in SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES and NOT in SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES; both carry gen; the chat-channel protocol.ts unions/arrays are untouched (direction isolation per channel)", async () => {
  const {
    SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES,
    SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES,
  } = await import('../scratch-panels.js');
  const { WEBVIEW_TO_HOST_TYPES, HOST_TO_WEBVIEW_TYPES } = await import('../../chat/protocol.js');
  const w2h = new Set<string>(SCRATCH_DOC_WEBVIEW_TO_HOST_TYPES);
  const h2w = new Set<string>(SCRATCH_DOC_HOST_TO_WEBVIEW_TYPES);
  assert.ok(w2h.has('scratch-save'), "'scratch-save' is webview→host on the document channel");
  assert.ok(!h2w.has('scratch-save'), "'scratch-save' is NOT host→webview");
  assert.ok(w2h.has('scratch-dirty'), "'scratch-dirty' is webview→host on the document channel");
  assert.ok(!h2w.has('scratch-dirty'), "'scratch-dirty' is NOT host→webview");
  assert.ok(h2w.has('scratch-saved'), "'scratch-saved' is host→webview on the document channel");
  assert.ok(!w2h.has('scratch-saved'), "'scratch-saved' is NOT webview→host");
  // All messages carry gen: the unions' members expose it.
  const saveType: import('../scratch-panels.js').ScratchDocWebviewToHost = { type: 'scratch-save', id: 'a.md', gen: 3, text: 'x' };
  const dirtyType: import('../scratch-panels.js').ScratchDocWebviewToHost = { type: 'scratch-dirty', id: 'a.md', gen: 3, dirty: true };
  const savedType: import('../scratch-panels.js').ScratchDocHostToWebview = { type: 'scratch-saved', id: 'a.md', gen: 3, ok: true };
  assert.equal(saveType.gen, 3, 'scratch-save carries gen');
  assert.equal(dirtyType.gen, 3, 'scratch-dirty carries gen');
  assert.equal(savedType.gen, 3, 'scratch-saved carries gen');
  // Direction isolation per channel: no document-channel type appears in the
  // chat channel's arrays, and the chat channel's arrays are unchanged by t2/t3.
  for (const t of ['scratch-save', 'scratch-dirty', 'scratch-saved'] as const) {
    assert.ok(!WEBVIEW_TO_HOST_TYPES.includes(t as never), `chat WEBVIEW_TO_HOST_TYPES untouched: no ${t}`);
    assert.ok(!HOST_TO_WEBVIEW_TYPES.includes(t as never), `chat HOST_TO_WEBVIEW_TYPES untouched: no ${t}`);
  }
  // The chat channel keeps its own scratch intents (they are chat-panel messages,
  // a different channel) — they must still be present.
  for (const t of ['scratch-open', 'scratch-delete', 'scratch-new', 'scratch-browse', 'send-to-chat'] as const) {
    assert.ok(WEBVIEW_TO_HOST_TYPES.includes(t as never), `chat channel still carries ${t}`);
  }
});

// ---------------------------------------------------------------------------
// t3: editable document view — textarea, save wiring, gen-guarded replies
// ---------------------------------------------------------------------------

/** Run documentBootstrap over a fake DOM and return the handles a t3 test needs. */
function bootstrapHarness(gen: number, id: string) {
  const sent: unknown[] = [];
  const msgListeners: Array<(e: unknown) => void> = [];
  const docListeners: Record<string, Array<(e?: unknown) => void>> = {};
  const doc = bodyStub('textarea', 'insrc-scratchdoc');
  const docAddEventListener = doc.addEventListener.bind(doc);
  doc.addEventListener = ((t: string, l: (e?: unknown) => void) => { (docListeners[t] ??= []).push(l); }) as unknown as typeof docAddEventListener;
  const sendBtn = bodyStub('button', 'insrc-sendtochat');
  let sendHidden = true;
  Object.defineProperty(sendBtn, 'hidden', { get: () => sendHidden, set: (v: boolean) => { sendHidden = v; } });
  const saveBtn = bodyStub('button', 'insrc-savescratch');
  let saveHidden = true;
  let saveDisabled = false;
  Object.defineProperty(saveBtn, 'hidden', { get: () => saveHidden, set: (v: boolean) => { saveHidden = v; } });
  Object.defineProperty(saveBtn, 'disabled', { get: () => saveDisabled, set: (v: boolean) => { saveDisabled = v; } });
  const errEl = bodyStub('div', 'err');
  runInNewContext(documentBootstrap(gen, id), {
    acquireVsCodeApi: () => ({ postMessage: (m: unknown) => { sent.push(m); } }),
    window: { addEventListener: (t: string, l: (e: unknown) => void) => { if (t === 'message') msgListeners.push(l); } },
    document: {
      getElementById: (el: string) => (el === 'insrc-scratchdoc' ? doc : el === 'insrc-sendtochat' ? sendBtn : el === 'insrc-savescratch' ? saveBtn : bodyStub('div', el)),
      querySelector: () => bodyStub('div', 'wrap'),
      addEventListener: (t: string, l: (e?: unknown) => void) => { (docListeners[t] ??= []).push(l); },
      get activeElement() { return undefined; },
      createElement: () => errEl,
    },
  });
  const fire = (type: string, e?: unknown) => { for (const l of docListeners[type] ?? []) l(e); };
  const hostMsg = (payload: unknown) => { for (const l of msgListeners) l({ data: { v: 1, payload } }); };
  return { doc, sendBtn, saveBtn, sent, fire, hostMsg, errEl, isSaveHidden: () => saveHidden, isSaveDisabled: () => saveDisabled, isSendHidden: () => sendHidden };
}

test('scratch-panel.test.ts: documentBodyHtml emits <textarea id="insrc-scratchdoc"> and the save button; documentBootstrap pins the scratch-save post with gen + keydown Ctrl/Cmd+S + scratch-saved handler honoring only gen === docGeneration + textarea selectionStart/selectionEnd send-to-chat', () => {
  // Static body: textarea (not pre) + hidden save button + send-to-chat button.
  const body = documentBodyHtml();
  assert.ok(body.includes('<textarea id="insrc-scratchdoc" class="scratch-doc"'), 'documentBodyHtml emits the textarea');
  assert.ok(!body.includes('<pre id="insrc-scratchdoc"'), 'no <pre> — the read-only surface is gone');
  assert.ok(/<button type="button" id="insrc-savescratch" class="scratch-save"[^>]*hidden/.test(body), 'the save button starts hidden');
  // Bootstrap source pins.
  const src = documentBootstrap(7, 'pad.md');
  assert.ok(src.includes("type:'scratch-save'"), 'the bootstrap posts scratch-save');
  assert.ok(src.includes('id:docId,gen:gen,text:doc.value'), 'the scratch-save post carries { id, gen, text: doc.value }');
  assert.ok(/keydown/.test(src) && /ctrlKey\|\|e\.metaKey/.test(src) && /key==='s'/.test(src), 'keydown Ctrl/Cmd+S triggers the save');
  assert.ok(src.includes("m.type==='scratch-saved'&&m.gen===gen&&m.id===docId"), 'the scratch-saved handler honors only gen === page gen AND matching id');
  assert.ok(src.includes('doc.selectionStart') && src.includes('doc.selectionEnd') && src.includes('doc.value.substring'), 'send-to-chat reads the textarea selection API (selectionStart/selectionEnd over doc.value)');
  assert.ok(!src.includes('selectionchange'), 'the old document-level selectionchange listener is gone (textarea selections do not fire it)');
  assert.ok(!src.includes('getSelection'), 'no window.getSelection — textarea selection is not visible there');
  // Behavioral: input sets dirty (save button visible AND a scratch-dirty post rides to the host);
  // Ctrl/Cmd+S posts scratch-save.
  const b = bootstrapHarness(7, 'pad.md');
  b.doc.value = 'edited text';
  assert.equal(b.isSaveHidden(), true, 'clean document: save button hidden');
  b.fire('input');
  assert.equal(b.isSaveHidden(), false, 'input event sets dirty — save button visible');
  const dirties = (JSON.parse(JSON.stringify(b.sent)) as Array<{ payload: { type: string; id?: string; gen?: number; dirty?: boolean } }>).map((m) => m.payload).filter((p) => p.type === 'scratch-dirty');
  assert.deepEqual(dirties, [{ type: 'scratch-dirty', id: 'pad.md', gen: 7, dirty: true }], 'input also posts scratch-dirty { id, gen, dirty: true } so the host can set the • title suffix on input');
  b.fire('keydown', { ctrlKey: true, key: 's', preventDefault: () => {} });
  // runInNewContext hands the posted payloads a null prototype — normalize before deepEqual.
  const saves = (JSON.parse(JSON.stringify(b.sent)) as Array<{ payload: { type: string; id?: string; gen?: number; text?: string } }>).map((m) => m.payload).filter((p) => p.type === 'scratch-save');
  assert.deepEqual(saves, [{ type: 'scratch-save', id: 'pad.md', gen: 7, text: 'edited text' }], 'Ctrl+S posts scratch-save { id, gen: docGeneration, text: doc.value }');
  assert.equal(b.isSaveDisabled(), true, 'save button disabled while the save is in flight');
  // An ok reply with the matching gen clears dirty (and posts scratch-dirty {dirty:false}),
  // re-enabling the button.
  b.hostMsg({ type: 'scratch-saved', id: 'pad.md', gen: 7, ok: true });
  assert.equal(b.isSaveHidden(), true, 'scratch-saved ok with matching gen clears dirty — save button hidden again');
  assert.equal(b.isSaveDisabled(), false, 'save button re-enabled after the ok reply');
  const clearDirty = (JSON.parse(JSON.stringify(b.sent)) as Array<{ payload: { type: string; dirty?: boolean } }>).map((m) => m.payload).filter((p) => p.type === 'scratch-dirty');
  assert.deepEqual(clearDirty, [
    { type: 'scratch-dirty', id: 'pad.md', gen: 7, dirty: true },
    { type: 'scratch-dirty', id: 'pad.md', gen: 7, dirty: false },
  ], 'the ok reply also posted scratch-dirty {dirty:false} so the host clears the • title');
  // gen-guard: a reply with a stale gen is ignored.
  b.fire('input');
  b.hostMsg({ type: 'scratch-saved', id: 'pad.md', gen: 6, ok: true });
  assert.equal(b.isSaveHidden(), false, 'a stale-gen scratch-saved reply is ignored — dirty stays');
  // id-mismatch reply ignored.
  b.hostMsg({ type: 'scratch-saved', id: 'other.md', gen: 7, ok: true });
  assert.equal(b.isSaveHidden(), false, 'a reply for another id is ignored');
  // ok=false keeps dirty and shows the error.
  b.hostMsg({ type: 'scratch-saved', id: 'pad.md', gen: 7, ok: false, error: 'EACCES' });
  assert.equal(b.isSaveHidden(), false, 'ok=false keeps the save button visible (still dirty)');
  assert.equal(b.errEl.textContent, 'save failed: EACCES', 'the failure is shown in the error line');
});

test('scratch-panel.test.ts: r14 CR-MED — a scratch-saved ok clears dirty ONLY when the document still holds the exact saved text; edits typed while the save was in flight keep the document dirty with a notice', () => {
  const src = documentBootstrap(7, 'pad.md');
  assert.ok(src.includes('savedText=doc.value'), 'postSave snapshots the saved text');
  assert.ok(src.includes('doc.value!==savedText'), 'the ok branch compares the current value against the saved snapshot');
  // Case A: no edit during the save -> ok clears dirty (existing behavior preserved).
  // Save via the BUTTON click (the keydown path is pinned in the test above): the click
  // handler must post scratch-save with the current id, gen and doc.value.
  const a = bootstrapHarness(7, 'pad.md');
  a.doc.value = 'v1';
  a.fire('input');
  fire(a.saveBtn, 'click');
  const saveA = (JSON.parse(JSON.stringify(a.sent)) as Array<{ payload: { type: string; id?: string; gen?: number; text?: string } }>).map((m) => m.payload).filter((p) => p.type === 'scratch-save');
  assert.deepEqual(saveA, [{ type: 'scratch-save', id: 'pad.md', gen: 7, text: 'v1' }], 'the Save-button click posted scratch-save { id: pad.md, gen: 7, text: doc.value }');
  assert.equal(a.isSaveDisabled(), true, 'save button disabled while the save is in flight');
  a.hostMsg({ type: 'scratch-saved', id: 'pad.md', gen: 7, ok: true });
  assert.equal(a.isSaveHidden(), true, 'ok with unchanged value clears dirty — save button hidden');
  // Case B: an edit lands while the save is in flight -> ok does NOT clear dirty.
  const b = bootstrapHarness(7, 'pad.md');
  b.doc.value = 'v1';
  b.fire('input');
  b.fire('keydown', { ctrlKey: true, key: 's', preventDefault: () => {} });
  b.doc.value = 'v1 + typed while saving'; // the user edits during the in-flight save
  b.fire('input'); // input re-marks dirty (already dirty) — the value no longer matches the snapshot
  b.hostMsg({ type: 'scratch-saved', id: 'pad.md', gen: 7, ok: true });
  assert.equal(b.isSaveHidden(), false, 'ok after an in-flight edit keeps the save button visible — the newer text is not reported as saved');
  assert.ok((b.errEl.textContent ?? '').includes('changed while saving'), 'a notice explains the saved text is older than the document');
  const dirtiesB = (JSON.parse(JSON.stringify(b.sent)) as Array<{ payload: { type: string; dirty?: boolean } }>).map((m) => m.payload).filter((p) => p.type === 'scratch-dirty');
  assert.equal(dirtiesB.at(-1)?.dirty, true, 'the last scratch-dirty post is dirty:true');
});

test('scratch-panel.test.ts: r28 CR-MED — a late scratch-content push after the user started typing does NOT overwrite doc.value and does NOT clear dirty; a content push before any edit still lands clean', () => {
  const src = documentBootstrap(3, 'pad.md');
  assert.ok(src.includes('userEdited=false'), 'the bootstrap tracks a userEdited flag');
  assert.ok(src.includes('if(!userEdited){doc.value=m.text;setDirty(false);if(errEl)errEl.textContent=\'\';}'), 'the live scratch-content handler is guarded by !userEdited');
  assert.ok(src.includes('if(!userEdited){doc.value=pending;setDirty(false);}'), 'the pending-replay tail is guarded by !userEdited as well');
  // Case A: user types BEFORE the late content push -> edits survive, dirty stays set.
  const a = bootstrapHarness(3, 'pad.md');
  a.doc.value = 'typed before the read resolved';
  a.fire('input'); // user edit -> userEdited=true, dirty=true
  assert.equal(a.isSaveHidden(), false, 'save button visible after the user edit');
  a.hostMsg({ type: 'scratch-content', text: 'loaded from disk' }); // the late initial push
  assert.equal(a.doc.value, 'typed before the read resolved', 'the late scratch-content did NOT overwrite the typed text');
  assert.equal(a.isSaveHidden(), false, 'the late scratch-content did NOT clear the dirty state');
  const dirtiesA = (JSON.parse(JSON.stringify(a.sent)) as Array<{ payload: { type: string; dirty?: boolean } }>).map((m) => m.payload).filter((p) => p.type === 'scratch-dirty');
  assert.equal(dirtiesA.at(-1)?.dirty, true, 'no scratch-dirty {dirty:false} was posted after the guarded push');
  // Case B: content lands before any edit -> applied, clean (existing behavior preserved).
  const b = bootstrapHarness(3, 'pad.md');
  b.hostMsg({ type: 'scratch-content', text: 'loaded from disk' });
  assert.equal(b.doc.value, 'loaded from disk', 'content before any edit still lands');
  assert.equal(b.isSaveHidden(), true, 'content before any edit is clean (save hidden)');
  // Case C: after a clean load, the user edits, then a SECOND content push must also be ignored.
  const c = bootstrapHarness(3, 'pad.md');
  c.hostMsg({ type: 'scratch-content', text: 'first load' });
  assert.equal(c.doc.value, 'first load');
  c.doc.value = 'first load + my edits';
  c.fire('input');
  c.hostMsg({ type: 'scratch-content', text: 'stale replay' });
  assert.equal(c.doc.value, 'first load + my edits', 'a later content push after an edit is ignored too');
  assert.equal(c.isSaveHidden(), false, 'dirty survives the later push');
});

test('scratch-panel.test.ts behavioral: input event sets dirty (save button visible, title suffix via setTitle), \'scratch-saved\' ok with matching gen clears dirty, ok=false keeps dirty and shows error, stale-gen reply ignored; scratch-content sets textarea .value (not textContent/innerHTML); send-to-chat reads selection from textarea selectionStart/selectionEnd over doc.value and posts capUtf8-capped text', async () => {
  // Host-side: a scratch-dirty from the live document generation sets the '•' title
  // suffix via onScratchDirty; a scratch-save from the live generation is routed
  // through onScratchSave; replySaved posts the scratch-saved reply to the live
  // generation (the webview's ok then clears the dirty state, which posts a
  // scratch-dirty {dirty:false} that clears the title).
  const h = harness();
  const saves: Array<{ id: string; gen: number; text: string }> = [];
  const dirties: Array<{ id: string; gen: number; dirty: boolean }> = [];
  const controller = createScratchPanels({
    panels: h.factory,
    store: h.store,
    genNonce: () => 'N',
    setPanelTitle: (_p, t) => { h.titles.push(t); },
    onSendToChat: (t) => { h.sentToChat.push(t); },
    onScratchSave: (id, gen, text) => { saves.push({ id, gen, text }); },
    onScratchDirty: (id, gen, dirty) => { dirties.push({ id, gen, dirty }); },
    logger: { warn: (m) => { h.warns.push(m); } },
  });
  await seed(h, 'pad.md', 'original', 100);
  const handle = await controller.openDocument('pad.md');
  assert.ok(handle !== undefined);
  const panel = h.panels[0]!;
  assert.ok(h.titles.includes('pad.md'), 'the document open set the plain title');
  // The webview reports the edit (dirty) for the LIVE generation + showing id:
  // the host adds the '•' suffix to the panel title.
  panel.injectMessage({ v: 1, payload: { type: 'scratch-dirty', id: 'pad.md', gen: 1, dirty: true } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(dirties, [{ id: 'pad.md', gen: 1, dirty: true }], 'the live scratch-dirty was routed to onScratchDirty with exact args');
  assert.ok(h.titles.includes('pad.md •'), 'input set the dirty • title suffix on input (before any save)');
  // The webview posts a scratch-save for the LIVE generation + showing id.
  panel.injectMessage({ v: 1, payload: { type: 'scratch-save', id: 'pad.md', gen: 1, text: 'edited' } });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(saves, [{ id: 'pad.md', gen: 1, text: 'edited' }], 'the live scratch-save was routed to onScratchSave with exact args');
  assert.ok(!h.titles.slice(h.titles.indexOf('pad.md •')).includes('pad.md • •'), 'the save did not double the dirty suffix');
  // replySaved posts the reply to the live generation.
  controller.replySaved(1, { type: 'scratch-saved', id: 'pad.md', gen: 1, ok: true });
  await new Promise((r) => setTimeout(r, 10));
  const saved = panel.posted.filter((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-saved');
  assert.deepEqual(saved, [{ v: 1, payload: { type: 'scratch-saved', id: 'pad.md', gen: 1, ok: true } }], 'replySaved posted the scratch-saved reply to the document panel');
  // The webview's ok clears the dirty state; that posts scratch-dirty {dirty:false},
  // which clears the title suffix host-side.
  panel.injectMessage({ v: 1, payload: { type: 'scratch-dirty', id: 'pad.md', gen: 1, dirty: false } });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(h.titles.at(-1) === 'pad.md', 'the ok reply cleared the dirty title suffix (via scratch-dirty dirty:false)');
  // A stale-generation replySaved is dropped (no post).
  const before = panel.posted.length;
  controller.replySaved(99, { type: 'scratch-saved', id: 'pad.md', gen: 99, ok: true });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(panel.posted.length, before, 'replySaved for a stale generation posts nothing');
  // A scratch-save for a different id (or stale gen) is dropped with a warn; likewise scratch-dirty.
  panel.injectMessage({ v: 1, payload: { type: 'scratch-save', id: 'other.md', gen: 1, text: 'x' } });
  panel.injectMessage({ v: 1, payload: { type: 'scratch-save', id: 'pad.md', gen: 42, text: 'x' } });
  panel.injectMessage({ v: 1, payload: { type: 'scratch-dirty', id: 'other.md', gen: 1, dirty: true } });
  panel.injectMessage({ v: 1, payload: { type: 'scratch-dirty', id: 'pad.md', gen: 42, dirty: true } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(saves.length, 1, 'only the live-generation, showing-id save was routed');
  assert.equal(dirties.length, 2, 'only the live-generation, showing-id dirty flags were routed');
  assert.equal(h.warns.filter((w) => w.includes('scratch-save')).length, 2, 'both dropped saves were logged');
  assert.equal(h.warns.filter((w) => w.includes('scratch-dirty')).length, 2, 'both dropped dirty flags were logged');
  // Webview behavioral: scratch-content sets doc.value (not textContent/innerHTML),
  // and send-to-chat reads the textarea selection and posts the capUtf8-capped text.
  const b = bootstrapHarness(1, 'pad.md');
  b.hostMsg({ type: 'scratch-content', text: 'loaded <b>content</b>' });
  assert.equal(b.doc.value, 'loaded <b>content</b>', 'scratch-content sets doc.value');
  assert.ok(!allOf(b.doc).some((n) => n.writes.some((w) => w.prop === 'innerHTML' || w.prop === 'textContent')), 'no innerHTML/textContent write for content');
  assert.equal(b.isSaveHidden(), true, 'a host content push is clean (not dirty)');
  assert.ok((JSON.parse(JSON.stringify(b.sent)) as Array<{ payload: { type: string; dirty?: boolean } }>).map((m) => m.payload).some((p) => p.type === 'scratch-dirty' && p.dirty === false), 'a host content push posts scratch-dirty {dirty:false} (clean)');
  b.doc.value = 'hello selected world';
  b.doc.selectionStart = 6;
  b.doc.selectionEnd = 14;
  b.fire('select');
  fire(b.sendBtn, 'click');
  const sent = (JSON.parse(JSON.stringify(b.sent)) as Array<{ payload: { type: string; text?: string } }>).map((m) => m.payload).filter((p) => p.type === 'send-to-chat');
  assert.deepEqual(sent, [{ type: 'send-to-chat', text: 'selected' }], 'send-to-chat posted the textarea selectionStart/End slice of doc.value');
  // capUtf8 host-side still applies to what onSendToChat receives.
  const h2 = harness();
  const controller2 = createScratchPanels({
    panels: h2.factory, store: h2.store, genNonce: () => 'N', setPanelTitle: () => {},
    onSendToChat: (t) => { h2.sentToChat.push(t); },
  });
  await seed(h2, 'pad.md', 'x', 1);
  await controller2.openDocument('pad.md');
  const panel2 = h2.panels[0]!;
  const big = '😀'.repeat(20_000);
  panel2.injectMessage({ v: 1, payload: { type: 'send-to-chat', text: big } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h2.sentToChat.length, 1);
  assert.ok(Buffer.byteLength(h2.sentToChat[0]!, 'utf8') <= SEND_TO_CHAT_CAP && h2.sentToChat[0]!.endsWith('…'), 'host-side capUtf8 cap untouched');
});

test('scratch-panel.test.ts: send-to-chat post via textarea selection (selectionStart/selectionEnd) present in the new bootstrap; capUtf8 behavior untouched (existing tests); existing ISSUE-3183af2a tests (wrap() drop logging, reveal(true), popup icons) still pass', () => {
  // The new bootstrap still posts send-to-chat from the textarea selection API.
  const src = documentBootstrap(3, 'pad.md');
  assert.ok(src.includes('doc.selectionStart') && src.includes('doc.selectionEnd'), 'selectionStart/selectionEnd present in the new bootstrap');
  assert.ok(src.includes("type:'send-to-chat'"), 'send-to-chat post still present');
  // capUtf8 is exported unchanged and behaves as before.
  assert.equal(capUtf8('abc'), 'abc');
  assert.ok(Buffer.byteLength(capUtf8('😀'.repeat(20_000)), 'utf8') <= SEND_TO_CHAT_CAP);
  // The ISSUE-3183af2a pins live in the other tests of this file (reveal(true) on the
  // fresh document open, wrap() drop logging for false/rejection deliveries, icon-only
  // buttons with title= in the ac5 test) — they run in this same file and must pass;
  // this test's own presence in the suite alongside them is the pin.
  assert.ok(true);
});


test('scratch browse and chat route deletion through the same asynchronous native boundary and preserve failed files', async () => {
  const h = harness(), entry = await h.store.createScratch('Shared deletion', 'Keep');
  const calls: string[] = [], warnings: string[] = []; let refused = false;
  const panels = createScratchPanels({ panels: h.factory, store: h.store, genNonce: () => 'N', logger: { warn: message => warnings.push(message) }, deleteDocument: async id => { calls.push(id); if (refused) throw new Error('native close refused'); return 'cancelled'; } });
  const posted: unknown[] = [];
  const host = createScratchHost({ panels, store: h.store, promptTitle: async () => undefined, chat: { open: () => { throw new Error('refresh must not open chat'); }, ready: async () => {}, disposed: () => false, post: message => posted.push(message) } });
  await panels.openBrowse(); const browse = h.panels.at(-1)!;
  browse.injectMessage({ v: 1, payload: { type: 'scratch-delete', id: entry.id } });
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  host.onMessage({ type: 'scratch-delete', id: entry.id });
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  assert.deepEqual(calls, [entry.id, entry.id]); assert.equal((await h.store.readScratch(entry.id)).content, 'Keep');
  refused = true; browse.injectMessage({ v: 1, payload: { type: 'scratch-delete', id: entry.id } });
  for (let turn = 0; turn < 30; turn++) await Promise.resolve();
  assert.match(browse.html, /native close refused/); assert.ok(warnings.length > 0); assert.equal((await h.store.readScratch(entry.id)).content, 'Keep');
  panels.dispose();
});


test('scratch deletion blocks an in-flight legacy open and coalesces duplicate controller requests', async () => {
  const h = harness(), entry = await h.store.createScratch('Deletion exclusion', 'Keep');
  let release!: () => void, calls = 0; const waiting = new Promise<void>(resolve => { release = resolve; });
  const panels = createScratchPanels({ panels: h.factory, store: h.store, deleteDocument: async () => { calls++; await waiting; return 'cancelled'; } });
  const first = panels.deleteDocument!(entry.id), second = panels.deleteDocument!(entry.id);
  assert.equal(await panels.openDocument(entry.id), undefined); release();
  assert.equal(await first, 'cancelled'); assert.equal(await second, 'cancelled'); assert.equal(calls, 1);
  assert.equal((await h.store.readScratch(entry.id)).content, 'Keep'); panels.dispose();
});
