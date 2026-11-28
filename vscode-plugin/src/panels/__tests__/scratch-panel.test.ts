/** Browse and native-document delegation regressions after retirement of the
 * independent document webview. Guarded storage remains tested separately. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScratchPanels, browseHtml, capUtf8, SEND_TO_CHAT_CAP, SCRATCHPADS_VIEW_TYPE } from '../scratch-panels.js';
import type { PanelHandle } from '../types.js';
import { createScratchStore } from '../../chat/scratch-store.js';
import { fakeScratchFs } from '../../chat/__tests__/fake-scratch-fs.js';
class Panel implements PanelHandle {
  html = ''; reveals: (boolean | undefined)[] = [];
  private listeners: ((message: unknown) => void)[] = []; private closed: (() => void)[] = [];
  setHtml(html: string) { this.html = html; }
  reveal(preserve?: boolean) { this.reveals.push(preserve); }
  onMessage(listener: (message: unknown) => void) { this.listeners.push(listener); }
  onDidDispose(listener: () => void) { this.closed.push(listener); }
  postMessage = async () => true;
  dispose() { for (const listener of this.closed) listener(); }
  send(payload: unknown) { for (const listener of this.listeners) listener({ v: 1, payload }); }
}
const tick = async () => { for (let turn = 0; turn < 40; turn++) await Promise.resolve(); };
function harness() {
  const fake = fakeScratchFs(), store = createScratchStore({ root: '/scratch', fs: fake.fs });
  const panels: Panel[] = [], opened: string[] = [], deleted: string[] = [], warnings: string[] = [];
  let failOpen = false, failDelete = false, failFactory = false;
  const controller = createScratchPanels({ store, panels: options => { assert.equal(options.viewType, SCRATCHPADS_VIEW_TYPE); if (failFactory) throw new Error('busy'); const panel = new Panel(); panels.push(panel); return panel; }, genNonce: () => 'N', logger: { warn: message => warnings.push(message) }, editor: {
    openDocument: async id => { if (failOpen) throw new Error('renderer failed'); opened.push(id); },
    deleteDocument: async id => { if (failDelete) throw new Error('close refused'); deleted.push(id); await store.deleteScratch(id); await controller.refreshBrowse(); return 'deleted'; },
  } });
  return { store, panels, controller, opened, deleted, warnings, failOpen: () => { failOpen = true; }, failDelete: () => { failDelete = true; }, failFactory: () => { failFactory = true; } };
}
test('scratch browse preserves unbounded table icons CSP escaping singleton lifecycle and quiet refresh', async () => {
  const h = harness(); const entries = [];
  for (let i = 0; i < 7; i++) entries.push(await h.store.createScratch(`Note ${i}`, 'body'));
  const panel = await h.controller.openBrowse(); assert.ok(panel); assert.equal(h.panels.length, 1); assert.equal(h.panels[0]!.reveals[0], true);
  for (const entry of entries) assert.ok(h.panels[0]!.html.includes(entry.id));
  assert.match(h.panels[0]!.html, /aria-label="delete/); assert.match(h.panels[0]!.html, /Content-Security-Policy/);
  await h.controller.openBrowse(); assert.equal(h.panels.length, 1);
  h.panels[0]!.dispose(); await h.controller.refreshBrowse(); assert.equal(h.panels.length, 1, 'refresh cannot open closed UI');
  await h.controller.openBrowse(); assert.equal(h.panels.length, 2);
  assert.match(browseHtml([], '<script>unsafe</script>'), /&lt;script&gt;/); assert.doesNotMatch(browseHtml([], '<script>unsafe</script>'), /<script>/);
  assert.match(browseHtml([]), /No scratchpads yet/); h.controller.dispose();
});
test('scratch browse and chat document actions delegate to native lifecycle without reading or saving a second buffer', async () => {
  const h = harness(), entry = await h.store.createScratch('Native document', '# Keep\n');
  await h.controller.openDocument(entry.id); assert.deepEqual(h.opened, [entry.id]); assert.equal(h.panels.length, 0);
  await h.controller.openBrowse(); const panel = h.panels[0]!;
  panel.send({ type: 'scratch-open', id: entry.id }); await tick(); assert.deepEqual(h.opened, [entry.id, entry.id]);
  panel.send({ type: 'scratch-delete', id: entry.id }); await tick(); assert.deepEqual(h.deleted, [entry.id]); assert.equal((await h.store.listScratches()).length, 0);
  h.controller.dispose();
});
test('scratch browse surfaces deletion failure preserves file and catches row open rejection', async () => {
  const h = harness(), entry = await h.store.createScratch('Failure', 'Keep'); await h.controller.openBrowse(); h.failDelete(); h.failOpen();
  h.panels[0]!.send({ type: 'scratch-delete', id: entry.id }); h.panels[0]!.send({ type: 'scratch-open', id: entry.id }); await tick();
  assert.match(h.panels[0]!.html, /close refused/); assert.equal((await h.store.readScratch(entry.id)).content, 'Keep'); assert.ok(h.warnings.some(message => message.includes('renderer failed')));
  await assert.rejects(h.controller.deleteDocument(entry.id), /close refused/); h.controller.dispose();
});
test('scratch browse rejects stale render after disposal or a newer list and reports factory failure', async () => {
  const h = harness(); h.failFactory(); assert.equal(await h.controller.openBrowse(), undefined); assert.ok(h.warnings.length);
  const live = harness(); let release!: (value: never[]) => void; live.store.listScratches = () => new Promise(resolve => { release = resolve; });
  const opening = live.controller.openBrowse(); live.panels[0]!.dispose(); release([]); await opening; assert.equal(live.panels[0]!.html, '');
  live.controller.dispose(); await assert.rejects(live.controller.openDocument('pad.md'), /disposed/); assert.equal(await live.controller.openBrowse(), undefined);
});
test('scratch composer cap retains complete Unicode code points including the ellipsis budget', () => {
  const input = '😀é'.repeat(20_000), result = capUtf8(input);
  assert.ok(Buffer.byteLength(result, 'utf8') <= SEND_TO_CHAT_CAP); assert.ok(result.endsWith('…')); assert.equal(capUtf8('exact'), 'exact');
  assert.doesNotMatch(result, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
});
