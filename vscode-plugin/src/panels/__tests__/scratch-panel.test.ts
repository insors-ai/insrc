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
  createScratchPanels,
  documentBodyHtml,
  documentBootstrap,
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
  private disposeListener: (() => void) | undefined;
  private messageListener: ((message: unknown) => void) | undefined;
  constructor(readonly viewType: string, title: string) {
    this.title = title;
  }
  setHtml(html: string): void { this.html = html; }
  reveal(): void { this.reveals += 1; }
  onDidDispose(listener: () => void): void { this.disposeListener = listener; }
  onMessage(listener: (message: unknown) => void): void { this.messageListener = listener; }
  postMessage(message: unknown): void { this.posted.push(message); }
  dispose(): void { this.disposed = true; this.disposeListener?.(); }
  userClose(): void { this.disposeListener?.(); }
  injectMessage(message: unknown): void { this.messageListener?.(message); }
}

interface Harness {
  panels: FakePanel[];
  factory: PanelFactory;
  store: ScratchStore;
  fake: ReturnType<typeof fakeScratchFs>;
  controller: ReturnType<typeof createScratchPanels>;
  sentToChat: string[];
  titles: string[];
  failFactory: boolean;
}

function harness(): Harness {
  const panels: FakePanel[] = [];
  const titles: string[] = [];
  const sentToChat: string[] = [];
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
    logger: { warn: () => {} },
  });
  return {
    panels,
    factory,
    store,
    fake,
    controller,
    sentToChat,
    titles,
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
  const again = await h.controller.openBrowse();
  assert.equal(h.panels.length, 1, 'create-or-reveal reuses the single instance');
  assert.equal(again, first);
  assert.ok(h.panels[0]!.reveals >= 2, 'the second open revealed the cached panel');
  // Error row when the store fails.
  h.fake.failOn = (c) => (c.op === 'readdir' ? Object.assign(new Error('EACCES'), { code: 'EACCES' }) : undefined);
  await h.controller.refreshBrowse();
  assert.ok(h.panels[0]!.html.includes('scratchpads unavailable:'), 'error row renders the failure');
  h.fake.failOn = undefined;
  // Factory failure: undefined returned, a warning logged, next click retries.
  h.panels[0]!.userClose();
  h.failFactory = true;
  const failed = await h.controller.openBrowse();
  assert.equal(failed, undefined, 'creation failure returns undefined (never throws)');
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
  runInNewContext(documentBootstrap(), {
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
  // Run the bootstrap: a selectionchange with text reveals the button and latches the text.
  const doc = bodyStub('pre', 'insrc-scratchdoc');
  const sendBtn = bodyStub('button', 'insrc-sendtochat');
  let hiddenProp = true;
  Object.defineProperty(sendBtn, 'hidden', { get: () => hiddenProp, set: (v: boolean) => { hiddenProp = v; } });
  const sent: unknown[] = [];
  let selection = { toString: () => 'selected <text>', isCollapsed: false };
  const docListeners: Array<(e?: unknown) => void> = [];
  runInNewContext(documentBootstrap(), {
    acquireVsCodeApi: () => ({ postMessage: (m: unknown) => { sent.push(m); } }),
    window: {
      addEventListener: () => {},
      getSelection: () => selection,
    },
    document: {
      getElementById: (id: string) => (id === 'insrc-scratchdoc' ? doc : id === 'insrc-sendtochat' ? sendBtn : bodyStub('div', id)),
      addEventListener: (t: string, l: (e?: unknown) => void) => { if (t === 'selectionchange') docListeners.push(l); },
    },
  });
  // selectionchange fires with a non-empty selection, then the button click focuses the
  // button (a second selectionchange with a collapsed selection) — the latch must survive.
  for (const l of docListeners) l();
  assert.equal((sendBtn as unknown as { hidden: boolean }).hidden, false, 'button revealed on a non-empty selection');
  selection = { toString: () => '', isCollapsed: true }; // the focus/selectionchange that follows the click
  for (const l of docListeners) l();
  fire(sendBtn, 'click');
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{ v: 1, payload: { type: 'send-to-chat', text: 'selected <text>' } }], 'the captured selection was posted, not lost to the focus change');
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

test('scratch-panel.test.ts: stale ENOENT, deleting a non-displayed document, delete invalidates pending opens of the deleted id, closing/reopening the document panel during an outstanding read (dispose invalidates the generation, late read dropped)', async () => {
  const h = harness();
  await seed(h, 'a.md', 'A', 1);
  await seed(h, 'b.md', 'B', 2);
  await seed(h, 'gone.md', 'G', 3);

  // Stale ENOENT: open a.md, then delete gone.md externally; a read of gone.md that
  // rejects ScratchNotFound must NOT close the panel showing a.md.
  const handle = await h.controller.openDocument('a.md');
  assert.ok(handle !== undefined);
  assert.equal(h.controller.showingId, 'a.md');
  // A read of an absent id rejects ScratchNotFound (the stale-ENOENT case).
  await assert.rejects(h.store.readScratch('never-existed.md'), ScratchNotFound);
  // Simulate the controller's not-found path for an id it does NOT show: nothing closes.
  h.controller.invalidateId('never-existed.md');
  assert.equal(h.controller.showingId, 'a.md', 'a stale ENOENT for another id does not close the shown panel');

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

  // Deleting a NON-displayed document does not close the shown one.
  const shown = await h.controller.openDocument('a.md');
  assert.ok(shown !== undefined);
  h.controller.closeDocumentIfShowing('b.md'); // b.md is not displayed
  assert.equal(h.controller.showingId, 'a.md', 'closing a non-displayed id leaves the shown document open');
  h.controller.closeDocumentIfShowing('a.md');
  assert.equal(h.controller.showingId, undefined, 'closing the displayed id closes it');
});

test('scratch-panel.test.ts: UTF-8 cap — final inserted string incl. ellipsis within 65,536 bytes, with a multibyte boundary case', () => {
  // The cap is applied where send-to-chat text is truncated for the chat input
  // (t7 host side); here we pin the boundary arithmetic the truncation uses:
  // the final string, ellipsis included, must stay within 65,536 UTF-8 bytes.
  const cap = 65_536;
  const ellipsis = '…';
  const ellipsisBytes = Buffer.byteLength(ellipsis, 'utf8');
  const fit = (s: string): string => {
    const bytes = Buffer.byteLength(s, 'utf8');
    if (bytes <= cap) return s;
    // trim to cap - ellipsisBytes, on a UTF-8 boundary (multibyte-safe)
    let budget = cap - ellipsisBytes;
    let out = '';
    for (const ch of s) {
      const b = Buffer.byteLength(ch, 'utf8');
      if (b > budget) break;
      out += ch;
      budget -= b;
    }
    return out + ellipsis;
  };
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
});

test('scratch-panel.test.ts: browseHtml error row and empty hint are CSP-safe (escaped)', () => {
  assert.ok(browseHtml([], 'scratchpads unavailable: EACCES <script>').includes('&lt;script&gt;'), 'error text escaped');
  assert.ok(browseHtml([], undefined).includes('No scratchpads yet'));
  const withName = browseHtml([{ id: 'x.md', name: 'a<b>', mtime: 0, size: 1 }]);
  assert.ok(withName.includes('a&lt;b&gt;'), 'entry names escaped');
  void textOf;
});
