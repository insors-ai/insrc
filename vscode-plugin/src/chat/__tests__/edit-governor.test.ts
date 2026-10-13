/**
 * Story E20260925edb76e2e:S006 / t1 + t7, Story E20261013b2e8109f:S001 / t6 — EditGovernor unit suite.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/edit-governor.test.ts
 *
 * Pins the governor's checks (what a turn changed, section by section), its lifecycle and the
 * post-write revert in isolation, with fake WorkspaceBaseline / FsSeam / EditRenderSeam. No vscode
 * runtime. The revert path (observe tracks a review edit, decide reverts it) lives in the editor
 * view, so those tests run there.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditGovernor,
  type WorkspaceBaseline,
  type FsSeam,
  type EditRenderSeam,
  type BaselineHandle,
  type DiffView,
} from '../edit-governor.js';
import type { SectionOp } from '../diff-sections.js';
import { patchOf } from './fixtures.js';

type Overflow = { readonly sections: number; readonly files: number } | undefined;

interface Harness {
  gov: ReturnType<typeof createEditGovernor>;
  disk: Map<string, string | undefined>;
  baselineContent: Map<string, string>;
  /** Each showSections call: the operations and the overflow. */
  shown: Array<{ ops: SectionOp[]; overflow: Overflow }>;
  unreadable: { count: number };
  editorCalls: Array<{ path: string; baseline: string | undefined; review: boolean }>;
  notes: string[];
  removed: string[];
  warns: string[];
  /** What baseline.changes returns next (a patch, '' or undefined); a function is called per check. */
  patch: { next: string | undefined | (() => Promise<string | undefined>) };
  changesCalls: { count: number };
  released: BaselineHandle[];
  setView: (v: DiffView) => void;
}

function harness(opts?: { gitAvailable?: boolean | undefined; diffView?: DiffView | undefined }): Harness {
  const disk = new Map<string, string | undefined>();
  const baselineContent = new Map<string, string>();
  const shown: Harness['shown'] = [];
  const unreadable = { count: 0 };
  const editorCalls: Harness['editorCalls'] = [];
  const notes: string[] = [];
  const removed: string[] = [];
  const warns: string[] = [];
  const patch: Harness['patch'] = { next: '' };
  const changesCalls = { count: 0 };
  const released: BaselineHandle[] = [];
  const gitAvailable = opts?.gitAvailable ?? true;
  let view: DiffView = opts?.diffView ?? 'chat';
  let snaps = 0;

  const baseline: WorkspaceBaseline = {
    available: async () => gitAvailable,
    snapshot: async (): Promise<BaselineHandle> => ({ ref: `SNAP${snaps++}`, index: `/tmp/idx-${snaps}` }),
    read: async (_h, path) => baselineContent.get(path),
    changes: async () => {
      changesCalls.count++;
      return typeof patch.next === 'function' ? patch.next() : patch.next;
    },
    release: async (h) => {
      released.push(h);
    },
  };
  const fs: FsSeam = {
    read: async (path) => disk.get(path),
    write: async (path, content) => {
      disk.set(path, content);
    },
    remove: async (path) => {
      disk.delete(path);
      removed.push(path);
    },
  };
  const render: EditRenderSeam = {
    showSections: (ops, overflow) => {
      shown.push({ ops: [...ops], overflow });
    },
    sectionsUnreadable: () => {
      unreadable.count++;
    },
    showEditor: async (path, base, o) => {
      editorCalls.push({ path, baseline: base, review: o.review });
    },
  };
  const gov = createEditGovernor({
    baseline,
    fs,
    render,
    diffView: () => view,
    logger: { warn: (m) => warns.push(m) },
    notify: (m) => notes.push(m),
  });
  return { gov, disk, baselineContent, shown, unreadable, editorCalls, notes, removed, warns, patch, changesCalls, released, setView: (v) => { view = v; } };
}

// ---- Story E20261013b2e8109f:S001 / t6: checks ----

test('governor: check passes the reconciled operations to showSections and calls nothing when nothing changed', async () => {
  const h = harness();
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  assert.equal(h.gov.sectionsActive(), true);

  // Nothing changed yet.
  await h.gov.check();
  assert.deepEqual(h.shown, []);

  // Two sections of one file: two adds.
  h.patch.next = patchOf(['src/a.ts', 1, 'one'], ['src/a.ts', 40, 'two']);
  await h.gov.check();
  assert.equal(h.shown.length, 1);
  assert.deepEqual(h.shown[0]!.ops.map((o) => [o.op, o.id]), [['add', 0], ['add', 1]]);
  assert.equal(h.shown[0]!.overflow, undefined);
  const first = h.shown[0]!.ops[0]!;
  assert.ok(first.op === 'add' && first.section.path === 'src/a.ts' && first.section.lines.includes('+one'));

  // The same patch again: no call.
  await h.gov.check();
  assert.equal(h.shown.length, 1);

  // The first section changed, the second went, a third file appeared.
  h.patch.next = patchOf(['src/a.ts', 1, 'one, changed'], ['src/b.ts', 5, 'three']);
  await h.gov.check();
  assert.deepEqual(h.shown[1]!.ops.map((o) => [o.op, o.id]), [['update', 0], ['add', 2], ['withdraw', 1]]);

  // More new sections than the per-check limit: the rest is counted, not shown.
  h.patch.next = patchOf(...Array.from({ length: 30 }, (_, i): [string, number, string] => [`many/f${i}.ts`, 1, 'x']));
  await h.gov.check();
  const last = h.shown.at(-1)!;
  assert.equal(last.ops.filter((o) => o.op === 'add').length, 20);
  assert.deepEqual(last.overflow, { sections: 10, files: 10 });
  assert.deepEqual(h.warns, []);
});

test('governor: checks run one at a time, a call made during a check causes exactly one more, and its promise resolves after that one', async () => {
  const h = harness();
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  const gates: Array<(v: string) => void> = [];
  let running = 0;
  let most = 0;
  h.patch.next = () => {
    running++;
    most = Math.max(most, running);
    return new Promise<string>((resolve) => {
      gates.push((v) => {
        running--;
        resolve(v);
      });
    });
  };
  const order: string[] = [];
  const first = h.gov.check().then(() => order.push('first'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(h.changesCalls.count, 1);
  // Three calls while the first check runs: one more check, shared by all three.
  const a = h.gov.check().then(() => order.push('a'));
  const b = h.gov.check().then(() => order.push('b'));
  const c = h.gov.check().then(() => order.push('c'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(h.changesCalls.count, 1, 'the second check has not started while the first runs');
  gates[0]!(patchOf(['a.ts', 1, 'v1']));
  await first;
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(h.changesCalls.count, 2, 'exactly one more check');
  assert.deepEqual(order, ['first'], 'the later calls are still waiting for the check that started after them');
  gates[1]!(patchOf(['a.ts', 1, 'v2']));
  await Promise.all([a, b, c]);
  assert.deepEqual([...order].sort(), ['a', 'b', 'c', 'first']);
  assert.equal(h.changesCalls.count, 2, 'no third check');
  assert.equal(most, 1, 'never two at once');
  assert.deepEqual(h.shown.map((s) => s.ops.map((o) => o.op)), [['add'], ['update']]);
  // A call after everything settled starts a fresh check.
  const d = h.gov.check();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(h.changesCalls.count, 3);
  gates[2]!(patchOf(['a.ts', 1, 'v2']));
  await d;
});

test('governor: an unreadable check calls sectionsUnreadable once per turn and a later check still shows sections', async () => {
  const h = harness();
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  h.patch.next = patchOf(['a.ts', 1, 'v1']);
  await h.gov.check();
  h.patch.next = undefined;
  await h.gov.check();
  await h.gov.check();
  assert.equal(h.unreadable.count, 1, 'said once');
  assert.equal(h.warns.filter((w) => w.includes('could not be read')).length, 2, 'logged every time');
  assert.deepEqual([...h.gov.sectionPaths()], ['a.ts'], 'known sections are kept');
  // Readable again.
  h.patch.next = patchOf(['a.ts', 1, 'v2'], ['b.ts', 1, 'new']);
  await h.gov.check();
  assert.deepEqual(h.shown.at(-1)!.ops.map((o) => o.op), ['update', 'add']);
  // A throwing baseline is the same as an unreadable one, and nothing rejects.
  h.patch.next = () => Promise.reject(new Error('git exploded'));
  await assert.doesNotReject(() => h.gov.check());
  assert.equal(h.unreadable.count, 1);
  // A new turn may say it again.
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  h.patch.next = undefined;
  await h.gov.check();
  assert.equal(h.unreadable.count, 2);
});

test('governor: sectionPaths holds the path of every known section, shown or hidden, and is empty after beginTurn', async () => {
  const h = harness();
  assert.deepEqual([...h.gov.sectionPaths()], [], 'no turn yet');
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  assert.deepEqual([...h.gov.sectionPaths()], []);
  // 25 new sections: 20 shown, 5 hidden; every path is known.
  h.patch.next = patchOf(...Array.from({ length: 25 }, (_, i): [string, number, string] => [`f${i}.ts`, 1, 'x']));
  await h.gov.check();
  const paths = h.gov.sectionPaths();
  assert.equal(paths.size, 25);
  assert.ok(paths.has('f0.ts') && paths.has('f24.ts'));
  // A section that went is no longer known.
  h.patch.next = patchOf(['f3.ts', 1, 'x']);
  await h.gov.check();
  assert.deepEqual([...h.gov.sectionPaths()], ['f3.ts']);
  // They stay readable after the turn's end, for the host to settle held paths against.
  await h.gov.resolveTurn();
  assert.deepEqual([...h.gov.sectionPaths()], ['f3.ts']);
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  assert.deepEqual([...h.gov.sectionPaths()], []);
});

test('governor: no snapshot or the editor view means sectionsActive is false and check does nothing; in the chat view observe does nothing', async () => {
  // No turn.
  const none = harness();
  assert.equal(none.gov.sectionsActive(), false);
  await none.gov.check();
  assert.equal(none.changesCalls.count, 0);

  // Not a git folder: no snapshot.
  const nogit = harness({ gitAvailable: false });
  await nogit.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  assert.equal(nogit.gov.sectionsActive(), false);
  nogit.patch.next = patchOf(['a.ts', 1, 'x']);
  await nogit.gov.check();
  assert.equal(nogit.changesCalls.count, 0);
  assert.deepEqual(nogit.shown, []);

  // The editor view: no sections; observe opens the editor diff.
  const ed = harness({ diffView: 'editor' });
  ed.baselineContent.set('a.ts', 'old\n');
  await ed.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  assert.equal(ed.gov.sectionsActive(), false);
  ed.patch.next = patchOf(['a.ts', 1, 'x']);
  await ed.gov.check();
  assert.equal(ed.changesCalls.count, 0);
  await ed.gov.observe('a.ts');
  assert.deepEqual(ed.editorCalls, [{ path: 'a.ts', baseline: 'old\n', review: false }]);

  // The chat view: sections are active and observe does nothing (no editor, no read, no tracking).
  const chat = harness();
  chat.baselineContent.set('a.ts', 'old\n');
  chat.disk.set('a.ts', 'NEW\n');
  await chat.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  assert.equal(chat.gov.sectionsActive(), true);
  await chat.gov.observe('a.ts');
  assert.deepEqual(chat.editorCalls, []);
  await chat.gov.decide('a.ts', false);
  assert.equal(chat.disk.get('a.ts'), 'NEW\n', 'nothing was tracked, so nothing is reverted');
  // The view is read at each call.
  chat.setView('editor');
  assert.equal(chat.gov.sectionsActive(), false);
});

test('governor: a check that ends after a newer turn began shows nothing, and resolveTurn runs a last check then releases the snapshot', async () => {
  const h = harness();
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  let open!: (v: string) => void;
  h.patch.next = () => new Promise<string>((r) => { open = r; });
  const late = h.gov.check(); // parks on the gated baseline.changes of turn 1
  await new Promise((r) => setTimeout(r, 0));
  h.patch.next = '';
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' }); // a new turn supersedes turn 1
  assert.deepEqual(h.released.map((r) => r.ref), ['SNAP0'], "the older turn's snapshot is released when the next begins");
  open(patchOf(['a.ts', 1, 'from turn 1']));
  await late;
  assert.deepEqual(h.shown, [], "turn 1's result did not reach turn 2");
  assert.deepEqual([...h.gov.sectionPaths()], []);

  // resolveTurn: one last check, then the release; afterwards no check runs.
  h.patch.next = patchOf(['b.ts', 1, 'last']);
  const before = h.changesCalls.count;
  await h.gov.resolveTurn();
  assert.equal(h.changesCalls.count, before + 1, 'one last check');
  assert.deepEqual(h.shown.at(-1)!.ops.map((o) => o.op), ['add']);
  assert.deepEqual(h.released.map((r) => r.ref), ['SNAP0', 'SNAP1']);
  assert.equal(h.gov.sectionsActive(), false);
  await h.gov.check();
  assert.equal(h.changesCalls.count, before + 1);
  // Resolving twice, or beginning again, does not release the same snapshot twice.
  await h.gov.resolveTurn();
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  assert.deepEqual(h.released.map((r) => r.ref), ['SNAP0', 'SNAP1']);
});

test('governor: abandonTurn makes sectionsActive false at once, releases the snapshot without a last check, and a check in flight shows nothing', async () => {
  const h = harness();
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  h.patch.next = patchOf(['a.ts', 1, 'v1']);
  await h.gov.check();
  assert.equal(h.shown.length, 1);

  let open!: (v: string) => void;
  h.patch.next = () => new Promise<string>((r) => { open = r; });
  const inFlight = h.gov.check();
  await new Promise((r) => setTimeout(r, 0));
  const calls = h.changesCalls.count;
  const abandoned = h.gov.abandonTurn();
  assert.equal(h.gov.sectionsActive(), false, 'at once, before the release is awaited');
  assert.deepEqual([...h.gov.sectionPaths()], []);
  await abandoned;
  assert.deepEqual(h.released.map((r) => r.ref), ['SNAP0']);
  assert.equal(h.changesCalls.count, calls, 'no last check');
  open(patchOf(['a.ts', 1, 'v2'], ['b.ts', 1, 'late']));
  await inFlight;
  assert.equal(h.shown.length, 1, 'the check in flight showed nothing');
  // Nothing more happens: a later check, a second abandon, a resolve.
  await h.gov.check();
  await h.gov.abandonTurn();
  await h.gov.resolveTurn();
  assert.equal(h.changesCalls.count, calls);
  assert.deepEqual(h.released.map((r) => r.ref), ['SNAP0']);
  // With no turn, both are no-ops.
  const none = harness();
  await assert.doesNotReject(() => none.gov.abandonTurn());
  await assert.doesNotReject(() => none.gov.resolveTurn());
});

// ---- S006: the editor view and the revert (observe tracks a review edit only in the editor view) ----

test('S006 governor: review decide(reject) restores the pre-turn baseline; decide(accept) keeps disk', async () => {
  const h = harness({ diffView: 'editor' });
  h.baselineContent.set('a.ts', 'old\n');
  h.disk.set('a.ts', 'NEW\n');
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h.gov.observe('a.ts');
  assert.equal(h.editorCalls[0]!.review, true, 'review opens the editor diff with accept/reject');
  await h.gov.decide('a.ts', false);
  assert.equal(h.disk.get('a.ts'), 'old\n', 'reject restored the pre-turn baseline');

  // accept keeps
  const h2 = harness({ diffView: 'editor' });
  h2.baselineContent.set('b.ts', 'old\n');
  h2.disk.set('b.ts', 'NEW\n');
  await h2.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h2.gov.observe('b.ts');
  await h2.gov.decide('b.ts', true);
  assert.equal(h2.disk.get('b.ts'), 'NEW\n', 'accept keeps the on-disk change');

  // auto does not track -> a decision is a no-op, disk unchanged
  const h3 = harness({ diffView: 'editor' });
  h3.baselineContent.set('a.ts', 'old\n');
  h3.disk.set('a.ts', 'new\n');
  await h3.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  await h3.gov.observe('a.ts');
  assert.equal(h3.editorCalls[0]!.review, false, 'auto opens the editor diff with no accept/reject');
  await h3.gov.decide('a.ts', false);
  assert.equal(h3.disk.get('a.ts'), 'new\n', 'auto mode: reject is a no-op (not tracked)');
});

test('S006 governor: same path observed twice keeps the FIRST baseline (revert = true pre-turn)', async () => {
  const h = harness({ diffView: 'editor' });
  h.baselineContent.set('a.ts', 'v0\n');
  h.disk.set('a.ts', 'v1\n');
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h.gov.observe('a.ts'); // first observe captures v0
  h.baselineContent.set('a.ts', 'v1\n'); // (a later baseline read would return v1) — must NOT be used
  h.disk.set('a.ts', 'v2\n');
  await h.gov.observe('a.ts'); // second observe must keep the v0 baseline
  assert.equal(h.editorCalls[1]!.baseline, 'v0\n');
  await h.gov.decide('a.ts', false);
  assert.equal(h.disk.get('a.ts'), 'v0\n', 'revert restores the pre-turn content, not an intermediate');
});

test('S006 governor: a NEW file (no baseline) opens with no baseline; reject removes it', async () => {
  const h = harness({ diffView: 'editor' });
  // no baselineContent for new.ts -> baseline.read undefined
  h.disk.set('new.ts', 'created\n');
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h.gov.observe('new.ts');
  assert.equal(h.editorCalls[0]!.baseline, undefined, 'a new file has no pre-turn content');
  await h.gov.decide('new.ts', false);
  assert.ok(h.removed.includes('new.ts'), 'reject removed the created file');
  assert.equal(h.disk.has('new.ts'), false);
});

test('S006 governor: non-git -> no-baseline visualize-only; reject is a no-op with a note, never throws', async () => {
  const h = harness({ gitAvailable: false, diffView: 'editor' });
  h.disk.set('a.ts', 'x\n');
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h.gov.observe('a.ts');
  assert.equal(h.editorCalls[0]!.review, false, 'no baseline -> review controls suppressed (visualize-only)');
  await assert.doesNotReject(() => h.gov.decide('a.ts', false));
  assert.equal(h.disk.get('a.ts'), 'x\n', 'no-baseline reject does not revert');
});

test('S006 governor: diffView=editor routes to showEditor (no sections)', async () => {
  const h = harness({ diffView: 'editor' });
  h.baselineContent.set('a.ts', 'old\n');
  h.disk.set('a.ts', 'new\n');
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h.gov.observe('a.ts');
  assert.equal(h.shown.length, 0, 'the editor view shows no sections in the chat');
  assert.equal(h.editorCalls.length, 1);
  assert.equal(h.editorCalls[0]!.review, true);
  assert.equal(h.editorCalls[0]!.baseline, 'old\n');
});

test('S006 governor: a stale/unknown edit-decision is a no-op', async () => {
  const h = harness();
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await assert.doesNotReject(() => h.gov.decide('never-seen.ts', false));
});

test('S006 governor: a late observe from a SUPERSEDED turn does not render into the new turn (cross-turn guard)', async () => {
  // A baseline.read that blocks until released, to interleave two turns deterministically.
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const editorCalls: Array<{ path: string; review: boolean }> = [];
  const gov = createEditGovernor({
    baseline: {
      available: async () => true,
      snapshot: async () => ({ ref: 'SNAP' }),
      read: async (_h, _p) => { await gate; return 'old\n'; },
      changes: async () => '',
      release: async () => {},
    },
    fs: { read: async () => 'new\n', write: async () => {}, remove: async () => {} },
    render: { showSections: () => {}, sectionsUnreadable: () => {}, showEditor: async (path, _b, o) => { editorCalls.push({ path, review: o.review }); } },
    diffView: () => 'editor',
  });
  await gov.beginTurn({ mode: 'review', cwd: '/repo' });
  const p = gov.observe('a.ts'); // parks on the gated baseline.read
  await gov.beginTurn({ mode: 'auto', cwd: '/repo' }); // a NEW turn supersedes turn 1
  release();
  await p;
  assert.equal(editorCalls.length, 0, 'the superseded turn 1 observe did not render into turn 2');
});
