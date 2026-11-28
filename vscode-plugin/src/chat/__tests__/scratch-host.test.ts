/**
 * Story 01ac1e4b6a6c9c2f/s1 t4 — the document-channel scratch-save route in
 * createScratchHost.onDocMessage (chat/scratch-host.ts), driven over fakes:
 *   ok:        store.updateScratch called with exact args -> replySaved(gen, ok:true)
 *              posted to the document panel + refreshBrowse + scratch-list re-pushed
 *   failure:   store throws -> replySaved ok:false with error + log.warn; browse/list still refresh
 *   malformed: non-string id/text or non-number gen -> dropped with warn, no store call, no reply
 * plus the scratch-dirty validation pass-through.
 */

import test from 'node:test';
import { createScratchChatTarget } from '../scratch-chat-target.js';
import assert from 'node:assert/strict';

import { createScratchHost, SCRATCH_DOC_INTENT_TYPES } from '../scratch-host.js';
import type { ScratchChatSeam } from '../scratch-host.js';
import type { ScratchStore, ScratchEntry } from '../scratch-store.js';
import type { ScratchDocHostToWebview, ScratchPanels } from '../../panels/scratch-panels.js';
import type { HostToWebview } from '../protocol.js';

interface FakeStore extends ScratchStore {
  readonly calls: string[];
  failUpdate: boolean;
  updated: Array<{ id: string; text: string }>;
}
const fakeStore = (): FakeStore => {
  const s: FakeStore = {
    calls: [], failUpdate: false, updated: [],
    listScratches: async (limit?: number) => {
      s.calls.push(`list:${limit ?? 'all'}`);
      const e: ScratchEntry = { id: 'pad.md', name: 'pad', mtime: 500, size: 1 };
      return limit === undefined ? [e] : [e].slice(0, limit);
    },
    createScratch: async (title: string) => ({ id: `${title}.md`, name: title, mtime: 1, size: 0 }),
    readScratch: async (id: string) => ({ entry: { id, name: id, mtime: 0, size: 0 }, content: 'body' }),
    deleteScratch: async (id: string) => { s.calls.push(`delete:${id}`); },
    updateScratch: async (id: string, text: string) => {
      s.calls.push(`update:${id}`);
      if (s.failUpdate) throw new Error('EACCES: permission denied');
      s.updated.push({ id, text });
    },
  };
  return s;
};

interface FakePanels extends ScratchPanels {
  readonly calls: string[];
  readonly saved: Array<{ gen: number; msg: ScratchDocHostToWebview }>;
}
const fakePanels = (): FakePanels => {
  const p: FakePanels = {
    calls: [], saved: [],
    openBrowse: async () => { p.calls.push('openBrowse'); return undefined; },
    openDocument: async (id: string) => { p.calls.push(`openDocument:${id}`); return undefined; },
    refreshBrowse: async () => { p.calls.push('refreshBrowse'); },
    replySaved: (gen: number, msg: ScratchDocHostToWebview) => { p.saved.push({ gen, msg }); },
    closeDocumentIfShowing: (id: string) => { p.calls.push(`closeDocumentIfShowing:${id}`); },
    invalidateId: (id: string) => { p.calls.push(`invalidateId:${id}`); },
    showingId: undefined,
    dispose: () => { p.calls.push('dispose'); },
  };
  return p;
};

const fakeChat = (): ScratchChatSeam & { posted: HostToWebview[] } => {
  const posted: HostToWebview[] = [];
  return { posted, open: () => {}, ready: () => Promise.resolve(), disposed: () => false, post: (m) => { posted.push(m); } };
};

/** Flush the microtask queue so the fire-and-forget save handler settles. */
const flush = async (): Promise<void> => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

const makeHost = (store: FakeStore, panels: FakePanels, chat: ReturnType<typeof fakeChat>, warns: string[]) =>
  createScratchHost({ store, panels, chat, promptTitle: async () => undefined, logger: { warn: (m) => { warns.push(m); } } });

test("scratch-host.test.ts (NEW): 'scratch-save' {id,gen,text} → store.updateScratch called with exact args → replySaved(gen, {type:'scratch-saved', id, gen, ok:true, ...}) posted to the document panel + refreshBrowse + scratch-list re-pushed; store failure → ok:false with error and log.warn; malformed (non-string id/text, non-number gen) dropped with warn", async () => {
  // SCRATCH_DOC_INTENT_TYPES covers the document channel's two intents.
  assert.ok(SCRATCH_DOC_INTENT_TYPES.has('scratch-save'));
  assert.ok(SCRATCH_DOC_INTENT_TYPES.has('scratch-dirty'));
  assert.equal(SCRATCH_DOC_INTENT_TYPES.size, 2);

  // ---- ok path ----
  {
    const store = fakeStore(); const panels = fakePanels(); const chat = fakeChat(); const warns: string[] = [];
    const host = makeHost(store, panels, chat, warns);
    host.onDocMessage({ type: 'scratch-save', id: 'pad.md', gen: 7, text: 'edited body' });
    await flush();
    assert.deepEqual(store.updated, [{ id: 'pad.md', text: 'edited body' }], 'store.updateScratch called with exact (id, text)');
    assert.deepEqual(panels.saved, [{ gen: 7, msg: { type: 'scratch-saved', id: 'pad.md', gen: 7, ok: true } }], 'replySaved posted the ok reply with the same gen');
    assert.ok(panels.calls.includes('refreshBrowse'), 'browse refreshed after the save');
    assert.ok(chat.posted.some((m) => m.type === 'scratch-list'), 'the chat scratch-list was re-pushed so the menu mtime refreshes');
    assert.equal(warns.length, 0, 'no warnings on the ok path');
  }

  // ---- store failure path ----
  {
    const store = fakeStore(); store.failUpdate = true;
    const panels = fakePanels(); const chat = fakeChat(); const warns: string[] = [];
    const host = makeHost(store, panels, chat, warns);
    host.onDocMessage({ type: 'scratch-save', id: 'pad.md', gen: 3, text: 'x' });
    await flush();
    assert.equal(store.updated.length, 0, 'the failed update recorded nothing');
    assert.deepEqual(panels.saved, [{ gen: 3, msg: { type: 'scratch-saved', id: 'pad.md', gen: 3, ok: false, error: 'Error: EACCES: permission denied' } }], 'replySaved posted ok:false with the error string');
    assert.ok(warns.some((w) => w.includes('save failed') && w.includes('pad.md')), 'the failure was logged');
    assert.ok(panels.calls.includes('refreshBrowse'), 'browse still refreshed on failure');
    assert.ok(chat.posted.some((m) => m.type === 'scratch-list'), 'the chat list still re-pushed on failure');
  }

  // ---- malformed drops ----
  {
    const store = fakeStore(); const panels = fakePanels(); const chat = fakeChat(); const warns: string[] = [];
    const host = makeHost(store, panels, chat, warns);
    host.onDocMessage({ type: 'scratch-save', id: 42 as never, gen: 1, text: 'x' });
    host.onDocMessage({ type: 'scratch-save', id: 'pad.md', gen: 1, text: 7 as never });
    host.onDocMessage({ type: 'scratch-save', id: 'pad.md', gen: 'seven' as never, text: 'x' });
    host.onDocMessage({ type: 'scratch-save', id: 'pad.md', gen: Number.NaN, text: 'x' });
    await flush();
    assert.equal(store.calls.filter((c) => c.startsWith('update:')).length, 0, 'no store call for any malformed save');
    assert.equal(panels.saved.length, 0, 'no reply for any malformed save');
    assert.equal(warns.filter((w) => w.includes('scratch-save')).length, 4, 'all four malformed saves warned + dropped');

    // scratch-dirty: valid shape accepted (no persist), malformed warned.
    host.onDocMessage({ type: 'scratch-dirty', id: 'pad.md', gen: 2, dirty: true });
    host.onDocMessage({ type: 'scratch-dirty', id: 'pad.md', gen: 2, dirty: 'yes' as never });
    await flush();
    assert.equal(warns.filter((w) => w.includes('scratch-dirty')).length, 1, 'malformed scratch-dirty warned');
    assert.equal(store.calls.filter((c) => c.startsWith('update:')).length, 0, 'scratch-dirty never persists');

    // unknown type on the doc channel warned + dropped.
    host.onDocMessage({ type: 'bogus' as never });
    await flush();
    assert.equal(warns.filter((w) => w.includes('unknown type')).length, 1, 'unknown document-channel type warned + dropped');
  }
});


test('scratch checked selection route preserves paragraphs caps UTF-8 and only inserts after exact chat readiness', async () => {
  const chat = fakeChat(), posted: HostToWebview[] = []; let opens = 0, checks = 0;
  const target = createScratchChatTarget(async message => { posted.push(message); return true; });
  chat.open = () => { opens++; }; chat.capture = () => target;
  const host = makeHost(fakeStore(), fakePanels(), chat, []);
  const text = 'First paragraph.\n\n' + '😀é'.repeat(20_000);
  const sending = host.sendSelectionToChat(text, () => { checks++; });
  await flush(); assert.equal(opens, 1); assert.deepEqual(posted, []); assert.equal(checks, 0);
  target.markReady(); await sending;
  assert.equal(checks, 1); assert.equal(posted.length, 1);
  const message = posted[0]!; assert.equal(message.type, 'insert-into-input');
  if (message.type !== 'insert-into-input') throw new Error('Expected composer insertion');
  assert.ok(message.text.startsWith('First paragraph.\n\n')); assert.ok(message.text.endsWith('…'));
  assert.ok(Buffer.byteLength(message.text, 'utf8') <= 65_536);
  assert.doesNotMatch(message.text, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  target.dispose();
});

test('scratch checked selection route refuses disposed replacement stale source and rejected delivery', async () => {
  const chat = fakeChat(), posted: HostToWebview[] = [];
  let target = createScratchChatTarget(async message => { posted.push(message); return true; });
  chat.capture = () => target;
  const host = makeHost(fakeStore(), fakePanels(), chat, []);
  const pending = host.sendSelectionToChat('captured', () => {});
  const refused = assert.rejects(pending, /closed/);
  target.dispose(); target = createScratchChatTarget(async message => { posted.push(message); return true; }); target.markReady();
  await refused; assert.deepEqual(posted, []);
  await assert.rejects(host.sendSelectionToChat('captured', () => { throw new Error('stale source'); }), /stale source/);
  assert.deepEqual(posted, []); target.dispose();
  target = createScratchChatTarget(async () => false); target.markReady();
  await assert.rejects(host.sendSelectionToChat('captured', () => {}), /not confirmed/); target.dispose();
  target = createScratchChatTarget(async () => { throw new Error('transport'); }); target.markReady();
  await assert.rejects(host.sendSelectionToChat('captured', () => {}), /not confirmed/); target.dispose();
});

test('scratch checked selection readiness timeout is bounded and disposed targets cannot post', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let posted = false;
  const target = createScratchChatTarget(async () => { posted = true; return true; });
  const ready = target.ready(), refused = assert.rejects(ready, /did not become ready/);
  t.mock.timers.tick(10_001); await refused;
  target.dispose(); target.markReady();
  assert.equal(await target.post({ type: 'insert-into-input', text: 'captured' }), false);
  assert.equal(posted, false); await assert.rejects(target.ready(), /closed/);
});


test('scratch creation uses the shared refresh boundary without suppressing opening when refresh fails', async () => {
  const panels = fakePanels(), chat = fakeChat(), warnings: string[] = []; let refreshed = 0;
  const host = createScratchHost({ store: fakeStore(), panels, chat, promptTitle: async () => 'New pad', refresh: async () => { refreshed++; throw new Error('refresh refused'); }, logger: { warn: message => warnings.push(message) } });
  host.onMessage({ type: 'scratch-new' }); await flush();
  assert.equal(refreshed, 1); assert.ok(panels.calls.includes('openDocument:New pad.md')); assert.ok(warnings.some(message => message.includes('refresh')));
});
