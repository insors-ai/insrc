import test from 'node:test';
import assert from 'node:assert/strict';
import { createScratchHost, SCRATCH_INTENT_TYPES } from '../scratch-host.js';
import { createScratchChatTarget } from '../scratch-chat-target.js';
import type { ScratchChatSeam } from '../scratch-host.js';
import type { ScratchStore, ScratchEntry } from '../scratch-store.js';
import type { ScratchPanels } from '../../panels/scratch-panels.js';
import type { HostToWebview } from '../protocol.js';
const fakeStore = (): ScratchStore & { calls: string[] } => {
  const calls: string[] = []; const entry: ScratchEntry = { id: 'pad.md', name: 'pad', mtime: 1, size: 0 };
  return { calls, resolveScratch: async id => ({ ref: { repo: 'insrc:scratchpads:home', stableId: id }, filePath: `/scratch/${id}` }),
    listScratches: async () => { calls.push('list'); return [entry]; },
    createScratch: async title => { calls.push(`create:${title}`); return { ...entry, id: `${title}.md` }; },
    readScratch: async () => ({ entry, content: 'body' }), deleteScratch: async id => { calls.push(`delete:${id}`); }, updateScratch: async () => {}, };
};
const fakePanels = (): ScratchPanels & { calls: string[] } => {
  const calls: string[] = []; return { calls, openBrowse: async () => { calls.push('browse'); return undefined; }, openDocument: async id => { calls.push(`openDocument:${id}`); }, deleteDocument: async id => { calls.push(`deleteDocument:${id}`); return 'cancelled'; }, refreshBrowse: async () => { calls.push('refresh'); }, dispose: () => {} };
};
const fakeChat = (): ScratchChatSeam & { posted: HostToWebview[] } => { const posted: HostToWebview[] = []; return { posted, open: () => {}, ready: async () => {}, disposed: () => false, post: message => { posted.push(message); } }; };
const flush = async () => { for (let turn = 0; turn < 40; turn++) await Promise.resolve(); };
const makeHost = (store: ReturnType<typeof fakeStore>, panels: ReturnType<typeof fakePanels>, chat: ReturnType<typeof fakeChat>, warnings: string[]) => createScratchHost({ store, panels, chat, promptTitle: async () => undefined, logger: { warn: message => warnings.push(message) } });

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


test('scratch host distinguishes created but open failed from create failure and catches all intent boundaries', async () => {
  const store = fakeStore(), panels = fakePanels(), chat = fakeChat(), warnings: string[] = [];
  panels.openDocument = async () => { throw new Error('renderer failed'); };
  const host = createScratchHost({ store, panels, chat, promptTitle: async () => 'New', logger: { warn: message => warnings.push(message) } });
  host.onMessage({ type: 'scratch-new' }); await flush();
  assert.ok(store.calls.includes('create:New'));
  const created = chat.posted.find(message => message.type === 'scratch-list');
  assert.ok(created?.type === 'scratch-list'); assert.match(created.error ?? '', /Created New.md.*could not be opened/); assert.doesNotMatch(created.error ?? '', /create failed:/);
  chat.posted.length = 0; store.createScratch = async () => { throw new Error('disk full'); };
  host.onMessage({ type: 'scratch-new' }); await flush();
  assert.match((chat.posted[0] as { error: string }).error, /create failed:.*disk full/);
  panels.openBrowse = async () => { throw new Error('browse failed'); }; panels.deleteDocument = async () => { throw new Error('close refused'); };
  for (const message of [{ type: 'scratch-open', id: 'pad.md' }, { type: 'scratch-browse' }, { type: 'scratch-delete', id: 'pad.md' }] as const) host.onMessage(message);
  await flush(); assert.ok(warnings.some(message => message.includes('renderer failed'))); assert.ok(warnings.some(message => message.includes('browse failed'))); assert.ok(warnings.some(message => message.includes('close refused')));
  assert.deepEqual([...SCRATCH_INTENT_TYPES].sort(), ['scratch-browse', 'scratch-delete', 'scratch-new', 'scratch-open', 'scratch-open-menu', 'send-to-chat']);
  assert.equal(store.calls.some(call => call.startsWith('delete:')), false, 'host cannot bypass native guarded deletion');
});
