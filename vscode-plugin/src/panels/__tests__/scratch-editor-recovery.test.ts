import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, symlink, stat, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ScratchRecoveryStore, SCRATCH_RECOVERY_BYTES, type ScratchRecoveryIO } from '../scratch-editor-recovery.js';
import { ScratchDocumentController, scratchDigest } from '../scratch-editor-provider.js';
import type { ScratchDraftProposal, ScratchHostToEditor } from '../scratch-editor-protocol.js';

const initial = '# Canonical\n';
const draft = (seq = 1, markdown = '# Draft\n', paneSessionId = 'pane'): ScratchDraftProposal => ({ type: 'draft', paneSessionId, draftSeq: seq, editId: `edit_${seq}`, baseVersion: 1, baseDigest: scratchDigest(initial), markdown, apply: true });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
async function until(predicate: () => boolean): Promise<void> { for (let i = 0; i < 200 && !predicate(); i++) await new Promise(r => setTimeout(r, 5)); assert.ok(predicate(), 'asynchronous checkpoint'); }
async function fixture(run: (root: string, uri: string, note: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'insrc-recovery-'));
  const note = join(dir, 'note.md'); await writeFile(note, initial);
  try { await run(join(dir, 'recovery'), pathToFileURL(note).href, note); } finally { await rm(dir, { recursive: true, force: true }); }
}
function controller(store: ScratchRecoveryStore, uri: string, options: { applyGate?: Promise<void>; refuseApply?: boolean; throwReceipt?: boolean; throwAck?: boolean; clear?: (d: ScratchDraftProposal) => Promise<void> } = {}) {
  let document = { version: 1, markdown: initial }, edits = 0;
  const messages: ScratchHostToEditor[] = [], warnings: string[] = [];
  const c = new ScratchDocumentController({ read: () => document,
    retainDraft: d => store.retain(uri, d), draftApplied: options.clear ?? (async d => { await store.clearApplied(uri, d); }),
    admit: () => ({ allowed: true }), warn: m => warnings.push(m),
    applyEdit: async e => { edits++; if (options.applyGate) await options.applyGate; if (options.refuseApply) return false;
      document = { version: document.version + 1, markdown: document.markdown.slice(0, e.start) + e.text + document.markdown.slice(e.end) }; c.documentChanged(); return true; },
  });
  c.addPane('pane', m => { if (options.throwReceipt && m.type === 'receipt' || options.throwAck && m.type === 'apply-ack') throw new Error('transport failed'); messages.push(m); }, false);
  return { c, messages, warnings, get document() { return document; }, get edits() { return edits; } };
}

test('scratch recovery persists durably before receipt and coalesces waiting drafts without false receipts', async () => fixture(async (root, uri) => {
  const gate = deferred(); let syncStarted = false;
  const store = new ScratchRecoveryStore(root, { io: { open: (async (...args: Parameters<typeof open>) => {
    const handle = await open(...args);
    if (String(args[0]).includes('.tmp-')) {
      const original = handle.sync.bind(handle);
      handle.sync = async () => { syncStarted = true; await gate.promise; await original(); };
    }
    return handle;
  }) as typeof open } });
  const h = controller(store, uri, { refuseApply: true });
  const first = h.c.receive('pane', draft()); await until(() => syncStarted);
  const waiting: Promise<void>[] = [];
  for (let seq = 2; seq <= 100; seq++) waiting.push(h.c.receive('pane', { ...draft(seq, `# Latest ${seq}\n`), apply: false, parentEditId: 'edit_1' }));
  assert.equal(h.messages.some(m => m.type === 'receipt'), false); assert.equal(h.edits, 0);
  gate.resolve(); await first; await Promise.all(waiting); await h.c.flush();
  assert.deepEqual(h.messages.filter(m => m.type === 'receipt').map(m => m.draftSeq), [1, 100]);
  assert.equal((await store.list(uri))[0]?.draft.draftSeq, 100);
  assert.equal((await stat(join(root, (await readdir(root)).find(n => n.endsWith('.json'))!))).mode & 0o777, 0o600);
}));

test('scratch recovery isolates origins and exact clearing never removes a newer revision', async () => fixture(async (root, uri) => {
  const a = new ScratchRecoveryStore(root, { windowSessionId: 'window_a' }), b = new ScratchRecoveryStore(root, { windowSessionId: 'window_b' });
  await a.retain(uri, draft()); const old = (await a.list(uri))[0]!;
  await a.retain(uri, draft(2, '# Newer\n')); await b.retain(uri, draft(1, '# Other window\n'));
  await a.retain(uri, draft(1, '# Other pane\n', 'other_pane'));
  assert.equal(await a.discard(old), false); assert.equal(await a.clearApplied(uri, draft()), false);
  assert.equal((await a.list(uri)).length, 3);
  await assert.rejects(a.retain(uri, draft(1)), /Stale/);
  await assert.rejects(a.retain(uri, { ...draft(2, '# Newer\n'), baseVersion: 99 }), /conflicting/);
  assert.equal(await a.clearApplied(uri, draft(2, '# Newer\n')), true);
  assert.deepEqual((await b.list(uri)).map(r => r.draft.markdown).sort(), ['# Other pane\n', '# Other window\n']);
  const pending = { ...draft(2), apply: false, parentEditId: 'edit_1' };
  await a.retain(uri, pending); await a.retain(uri, { ...pending, apply: true, baseVersion: 2, baseDigest: scratchDigest('# Applied parent\n') });
  assert.equal((await a.list(uri)).find(r => r.draft.draftSeq === 2)?.draft.apply, true);
}));

test('scratch recovery storage and transport failures never acknowledge unpersisted or falsely applied drafts', async () => fixture(async (root, uri) => {
  for (const failure of ['open', 'write', 'sync', 'rename'] as const) {
    const io: Partial<ScratchRecoveryIO> = failure === 'rename' ? { rename: async () => { throw new Error('rename failure'); } } : {
      open: (async (...args: Parameters<typeof open>) => {
        if (String(args[0]).includes('.tmp-') && failure === 'open') throw new Error('open failure');
        const handle = await open(...args);
        if (String(args[0]).includes('.tmp-')) {
          if (failure === 'write') handle.writeFile = async () => { throw new Error('write failure'); };
          if (failure === 'sync') handle.sync = async () => { throw new Error('sync failure'); };
        }
        return handle;
      }) as typeof open,
    };
    const store = new ScratchRecoveryStore(join(root, failure), { io }); const h = controller(store, uri);
    await assert.rejects(h.c.receive('pane', draft())); await h.c.flush();
    assert.equal(h.edits, 0); assert.equal(h.document.markdown, initial);
    assert.equal(h.messages.some(m => m.type === 'receipt' || m.type === 'apply-ack'), false);
    assert.equal(h.messages.some(m => m.type === 'conflict'), true);
    assert.deepEqual(await readdir(join(root, failure)), []);
  }
  for (const opts of [{ throwReceipt: true }, { throwAck: true }, { clear: async () => { throw new Error('clear failure'); } }]) {
    const store = new ScratchRecoveryStore(join(root, `transport-${Object.keys(opts)[0]}`)); const h = controller(store, uri, opts);
    await h.c.receive('pane', draft()); await h.c.flush();
    assert.equal((await store.list(uri))[0]?.draft.markdown, '# Draft\n');
    assert.equal(h.edits, 'throwReceipt' in opts ? 0 : 1);
    assert.equal(h.messages.some(m => m.type === 'conflict'), true);
  }
}));

test('scratch recovery disposal finishes accepted edits and retains unapplied text after failure', async () => fixture(async (root, uri) => {
  for (const refuseApply of [false, true]) {
    const store = new ScratchRecoveryStore(join(root, String(refuseApply))); const gate = deferred();
    const h = controller(store, uri, { applyGate: gate.promise, refuseApply });
    await h.c.receive('pane', draft()); await until(() => h.edits === 1);
    h.c.removePane('pane'); const disposed = h.c.dispose(); gate.resolve(); await disposed;
    assert.equal(h.document.markdown, refuseApply ? initial : '# Draft\n');
    assert.equal((await store.list(uri)).length, 1, 'Unconfirmed closed-pane drafts survive whether or not the native edit applied');
  }
}));

test('scratch recovery reload discovers pending text without modifying canonical source or replaying edits', async () => fixture(async (root, uri, note) => {
  const first = new ScratchRecoveryStore(root, { windowSessionId: 'old_window' });
  const h = controller(first, uri, { refuseApply: true });
  await h.c.receive('pane', draft()); await h.c.dispose();
  const reopened = new ScratchRecoveryStore(root, { windowSessionId: 'new_window' });
  const pending = await reopened.list(uri); assert.equal(pending.length, 1);
  assert.equal(pending[0]?.draft.markdown, '# Draft\n'); assert.equal(pending[0]?.windowSessionId, 'old_window');
  const newController = controller(reopened, uri); await newController.c.flush();
  assert.equal(newController.edits, 0); assert.equal(await readFile(note, 'utf8'), initial);
  assert.equal(await reopened.discard(pending[0]!), true); assert.deepEqual(await reopened.list(uri), []);
  await newController.c.dispose();
}));

test('scratch recovery rejects symlinks, corrupt and oversized records without deleting evidence', async () => fixture(async (root, uri, note) => {
  const absent = new ScratchRecoveryStore(root); assert.deepEqual(await absent.list(uri), []); await assert.rejects(stat(root), { code: 'ENOENT' });
  await symlink(join(root, '..'), root); await assert.rejects(absent.retain(uri, draft()), /plain directory/); await rm(root);
  await absent.retain(uri, draft()); const file = join(root, (await readdir(root))[0]!); await rm(file); await symlink(note, file);
  await assert.rejects(absent.list(uri)); assert.equal(await readFile(note, 'utf8'), initial); await rm(file);
  for (const data of ['{bad', 'x'.repeat(SCRATCH_RECOVERY_BYTES + 1)]) {
    await writeFile(file, data); await assert.rejects(absent.list(uri)); await assert.rejects(absent.retain(uri, draft()));
    assert.equal((await stat(file)).size, Buffer.byteLength(data));
  }
}));

test('scratch recovery preserves the unscheduled parent needed to apply a coalesced descendant', async () => fixture(async (root, uri) => {
  const store = new ScratchRecoveryStore(root), h = controller(store, uri);
  const first = h.c.receive('pane', draft());
  const second = h.c.receive('pane', { ...draft(2, '# Descendant\n'), parentEditId: 'edit_1' });
  await Promise.all([first, second]); await h.c.flush();
  assert.equal(h.document.markdown, '# Descendant\n'); assert.equal(h.c.appliedSequence('pane'), 2);
  assert.deepEqual(await store.list(uri), []);
}));

test('scratch recovery serializes concurrent revision publication across store instances', async () => fixture(async (root, uri) => {
  const a = new ScratchRecoveryStore(root, { windowSessionId: 'same_window' });
  const b = new ScratchRecoveryStore(root, { windowSessionId: 'same_window' });
  await Promise.all([a.retain(uri, draft()), b.retain(uri, draft(2, '# Latest\n'))]);
  assert.deepEqual((await a.list(uri)).map(r => r.draft.draftSeq), [2]);
  const expected = (await a.list(uri))[0]!;
  await Promise.all([a.discard(expected), b.retain(uri, draft(3, '# Survives\n'))]);
  assert.deepEqual((await b.list(uri)).map(r => r.draft.draftSeq), [3]);
}));


test('scratch recovery remains durable throughout a delayed acknowledgement and survives pane disposal', async () => fixture(async (root, uri) => {
  const store = new ScratchRecoveryStore(root), gate = deferred(); let entered = false;
  const h = controller(store, uri); h.c.removePane('pane');
  h.c.addPane('pane', async message => { if (message.type === 'apply-ack') { entered = true; await gate.promise; return false; } return true; }, false);
  await h.c.receive('pane', draft()); await until(() => entered);
  assert.equal((await store.list(uri))[0]?.draft.markdown, '# Draft\n');
  h.c.removePane('pane'); const disposing = h.c.dispose(); gate.resolve(); await disposing;
  assert.equal(h.document.markdown, '# Draft\n');
  assert.equal((await store.list(uri))[0]?.draft.markdown, '# Draft\n');
}));
