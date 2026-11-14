/**
 * Story E202611134642d49a:S001 / t5+t6 — the scratch panels controller's tests.
 *
 * Fake PanelFactory + fake PanelHandle + the real scratch store over a fake fs:
 * browse table, row buttons, empty/error states, create-or-reveal reuse,
 * panel-factory failure, document render via textContent-only push, the
 * floating Send-to-chat button, A->B switching on one instance with a
 * reversed read completion, stale ENOENT, deleting a non-displayed document,
 * epoch invalidation, dispose-during-read, and the UTF-8 cap boundary.
 *
 * Run: npx tsx --test vscode-plugin/src/panels/__tests__/scratch-panel.test.ts
 */
import { test } from 'node:test';
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
  disposed = false;
  title: string;
  readonly posted: unknown[] = [];
  private readonly disposeListeners: Array<() => void> = [];
  private readonly messageListeners: Array<(message: unknown) => void> = [];
  constructor(readonly viewType: string, title: string) {
    this.title = title;
  }
  setHtml(html: string): void { this.html = html; }
  reveal(): void { this.reveals += 1; }
  onDidDispose(listener: () => void): void { this.disposeListeners.push(listener); }
  onMessage(listener: (message: unknown) => void): void { this.messageListeners.push(listener); }
  postMessage(message: unknown): void { this.posted.push(message); }
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

test('scratch-panel.test.ts: document viewType insrc.scratchpad renders content via textContent only (ac4)', async () => {
  const h = harness();
  await seed(h, '20260113-083000-pad.md', '# Title\n\nbody <b>not markup</b>', 300);
  const handle = await h.controller.openDocument('20260113-083000-pad.md');
  assert.ok(handle !== undefined);
  const panel = h.panels[0]!;
  assert.equal(panel.viewType, SCRATCHPAD_VIEW_TYPE);
  // The static body holds an empty <pre>; content arrives as a push.
  assert.ok(panel.html.includes('<pre id="insrc-scratchdoc" class="scratch-doc"></pre>'), 'the doc element starts empty');
  assert.ok(!panel.html.includes('not markup</b>'), 'content is NOT baked into the HTML');
  const push = panel.posted.find((m) => (m as { payload?: { type?: string } }).payload?.type === 'scratch-content') as { payload: { text: string } } | undefined;
  assert.ok(push !== undefined, 'content was pushed as a message');
  assert.equal(push!.payload.text, '# Title\n\nbody <b>not markup</b>');
  // The bootstrap applies it via textContent only: run the script over a fake DOM.
  const doc = bodyStub('pre', 'insrc-scratchdoc');
  const listeners: Array<(e: unknown) => void> = [];
  runInNewContext(documentBootstrap(1), {
    acquireVsCodeApi: () => ({ postMessage: () => {} }),
    window: {
      addEventListener: (t: string, l: (e: unknown) => void) => { if (t === 'message') listeners.push(l); },
      getSelection: () => ({ toString: () => '', isCollapsed: true }),
    },
    document: {
      getElementById: (id: string) => (id === 'insrc-scratchdoc' ? doc : bodyStub('button', id)),
      addEventListener: () => {},
    },
  });
  for (const l of listeners) l({ data: { v: 1, payload: { type: 'scratch-content', text: '<b>x</b>' } } });
  assert.equal(doc.textContent, '<b>x</b>', 'applied as text, never parsed as markup');
  assert.ok(!allOf(doc).some((n) => n.writes.some((w) => w.prop === 'innerHTML')), 'no innerHTML write for content');
});

test('scratch-panel.test.ts: selectionchange with non-empty selection shows the floating icon-only Send-to-chat button (title) which posts send-to-chat {text}; selection-to-button click preserves the captured selection across focus/selectionchange (ac4, ac5)', () => {
  const body = documentBodyHtml();
  const btn = /<button type="button" id="insrc-sendtochat" class="scratch-send" title="Send to chat" aria-label="Send to chat" hidden>(.*?)<\/button>/.exec(body);
  assert.ok(btn, 'the floating button exists');
  assert.match(btn![1]!, /^<svg /, 'icon-only');
  assert.equal(btn![1]!.replace(/<[^>]*>/g, '').trim(), '', 'no visible text');
  // Run the bootstrap: a selectionchange with text reveals the button, latches the text,
  // and anchors the button at the selection's caret rect.
  const doc = bodyStub('pre', 'insrc-scratchdoc');
  const sendBtn = bodyStub('button', 'insrc-sendtochat');
  let hiddenProp = true;
  Object.defineProperty(sendBtn, 'hidden', { get: () => hiddenProp, set: (v: boolean) => { hiddenProp = v; } });
  const sent: unknown[] = [];
  let selection: { toString: () => string; isCollapsed: boolean; getRangeAt?: () => { getBoundingClientRect: () => { right: number; bottom: number } } } = {
    toString: () => 'selected <text>',
    isCollapsed: false,
    getRangeAt: () => ({ getBoundingClientRect: () => ({ right: 120, bottom: 240 }) }),
  };
  const docListeners: Array<(e?: unknown) => void> = [];
  let activeElement: unknown = undefined; // the document's focused element
  runInNewContext(documentBootstrap(1), {
    acquireVsCodeApi: () => ({ postMessage: (m: unknown) => { sent.push(m); } }),
    window: {
      addEventListener: () => {},
      getSelection: () => selection,
      scrollX: 0,
      scrollY: 0,
    },
    document: {
      getElementById: (id: string) => (id === 'insrc-scratchdoc' ? doc : id === 'insrc-sendtochat' ? sendBtn : bodyStub('div', id)),
      addEventListener: (t: string, l: (e?: unknown) => void) => { if (t === 'selectionchange') docListeners.push(l); },
      get activeElement() { return activeElement; },
    },
  });
  // selectionchange fires with a non-empty selection.
  for (const l of docListeners) l();
  assert.equal((sendBtn as unknown as { hidden: boolean }).hidden, false, 'button revealed on a non-empty selection');
  const style = (sendBtn as unknown as { style: Record<string, string> }).style;
  assert.equal(style['left'], '92px', 'button anchored at the selection caret rect (right-28, viewport-relative)');
  assert.equal(style['top'], '246px', 'button anchored below the selection rect (bottom+6, viewport-relative)');
  // The user presses the button: focus moves to it (activeElement = the button) and a
  // collapsed selectionchange fires — the button must STAY VISIBLE for the click.
  activeElement = sendBtn;
  selection = { toString: () => '', isCollapsed: true };
  for (const l of docListeners) l();
  assert.equal((sendBtn as unknown as { hidden: boolean }).hidden, false, 'button stays visible while it holds focus (the click in flight)');
  fire(sendBtn, 'click');
  const posted = JSON.parse(JSON.stringify(sent)) as Array<{ v: number; payload: { type: string; text?: string } }>;
  assert.deepEqual(posted.filter((m) => m.payload.type === 'send-to-chat'), [{ v: 1, payload: { type: 'send-to-chat', text: 'selected <text>' } }], 'the captured selection was posted, not lost to the focus change');
  assert.ok(posted.some((m) => (m as { payload?: { type?: string; gen?: number } }).payload?.type === 'scratch-ready' && (m as { payload: { gen: number } }).payload.gen === 1), 'the bootstrap signalled scratch-ready with its generation tag echoed');
  // Clicking elsewhere collapses the selection with focus NOT on the button: hidden again.
  activeElement = undefined;
  for (const l of docListeners) l();
  assert.equal((sendBtn as unknown as { hidden: boolean }).hidden, true, 'button hides on a collapsed selection when it does not hold focus');
  // Webview-side cap: a >65,536-byte selection is truncated in the bootstrap before
  // posting, WITHOUT splitting surrogate pairs.
  const big = '😀'.repeat(20_000); // 80,000 UTF-8 bytes
  selection = { toString: () => big, isCollapsed: false };
  for (const l of docListeners) l();
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
  // The two browse row buttons and the one floating send-to-chat button are exactly the
  // buttons the scratchpad panels add.
  assert.equal((browse.match(/<button\b/g) ?? []).length, 2, 'browse renders exactly Open + Delete per row');
  assert.equal((doc.match(/<button\b/g) ?? []).length, 1, 'document renders exactly the Send-to-chat button');
});
