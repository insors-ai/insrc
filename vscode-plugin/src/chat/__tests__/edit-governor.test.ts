/**
 * Story E20260925edb76e2e:S006 / t1 + t7 — EditGovernor unit suite.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/edit-governor.test.ts
 *
 * Pins the governor lifecycle + post-write revert in isolation, with fake
 * WorkspaceBaseline / FsSeam / EditRenderSeam. No vscode runtime.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditGovernor,
  defaultComputeDiff,
  type WorkspaceBaseline,
  type FsSeam,
  type EditRenderSeam,
  type BaselineHandle,
  type DiffView,
} from '../edit-governor.js';
import type { UnifiedDiff } from '../stream-events.js';

interface Harness {
  gov: ReturnType<typeof createEditGovernor>;
  disk: Map<string, string | undefined>;
  baselineContent: Map<string, string>;
  chatCalls: Array<{ path: string; diff: UnifiedDiff; review: boolean }>;
  editorCalls: Array<{ path: string; baseline: string | undefined; review: boolean }>;
  notes: string[];
  removed: string[];
}

function harness(opts?: { gitAvailable?: boolean; diffView?: DiffView }): Harness {
  const disk = new Map<string, string | undefined>();
  const baselineContent = new Map<string, string>();
  const chatCalls: Harness['chatCalls'] = [];
  const editorCalls: Harness['editorCalls'] = [];
  const notes: string[] = [];
  const removed: string[] = [];
  const gitAvailable = opts?.gitAvailable ?? true;

  const baseline: WorkspaceBaseline = {
    available: async () => gitAvailable,
    snapshot: async (): Promise<BaselineHandle> => ({ ref: 'SNAP' }),
    read: async (_h, path) => baselineContent.get(path),
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
    showChat: (path, diff, o) => {
      chatCalls.push({ path, diff, review: o.review });
    },
    showEditor: async (path, base, o) => {
      editorCalls.push({ path, baseline: base, review: o.review });
    },
  };
  const gov = createEditGovernor({
    baseline,
    fs,
    computeDiff: defaultComputeDiff,
    render,
    diffView: () => opts?.diffView ?? 'chat',
    notify: (m) => notes.push(m),
  });
  return { gov, disk, baselineContent, chatCalls, editorCalls, notes, removed };
}

test('S006 governor: beginTurn snapshots; auto observe renders visualize-only (review:false) + no tracking', async () => {
  const h = harness();
  h.baselineContent.set('a.ts', 'old\n');
  h.disk.set('a.ts', 'new\n');
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  await h.gov.observe('a.ts');
  assert.equal(h.chatCalls.length, 1);
  assert.equal(h.chatCalls[0]!.review, false, 'auto renders visualize-only, no accept/reject');
  // auto does not track -> a decision is a no-op, disk unchanged
  await h.gov.decide('a.ts', false);
  assert.equal(h.disk.get('a.ts'), 'new\n', 'auto mode: reject is a no-op (not tracked)');
});

test('S006 governor: review decide(reject) restores the pre-turn baseline; decide(accept) keeps disk', async () => {
  const h = harness();
  h.baselineContent.set('a.ts', 'old\n');
  h.disk.set('a.ts', 'NEW\n');
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h.gov.observe('a.ts');
  assert.equal(h.chatCalls[0]!.review, true, 'review renders with accept/reject');
  await h.gov.decide('a.ts', false);
  assert.equal(h.disk.get('a.ts'), 'old\n', 'reject restored the pre-turn baseline');

  // accept keeps
  const h2 = harness();
  h2.baselineContent.set('b.ts', 'old\n');
  h2.disk.set('b.ts', 'NEW\n');
  await h2.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h2.gov.observe('b.ts');
  await h2.gov.decide('b.ts', true);
  assert.equal(h2.disk.get('b.ts'), 'NEW\n', 'accept keeps the on-disk change');
});

test('S006 governor: same path observed twice keeps the FIRST baseline (revert = true pre-turn)', async () => {
  const h = harness();
  h.baselineContent.set('a.ts', 'v0\n');
  h.disk.set('a.ts', 'v1\n');
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h.gov.observe('a.ts'); // first observe captures v0
  h.baselineContent.set('a.ts', 'v1\n'); // (a later baseline read would return v1) — must NOT be used
  h.disk.set('a.ts', 'v2\n');
  await h.gov.observe('a.ts'); // second observe must keep the v0 baseline
  await h.gov.decide('a.ts', false);
  assert.equal(h.disk.get('a.ts'), 'v0\n', 'revert restores the pre-turn content, not an intermediate');
});

test('S006 governor: a NEW file (no baseline) renders all-additions; reject removes it', async () => {
  const h = harness();
  // no baselineContent for new.ts -> baseline.read undefined
  h.disk.set('new.ts', 'created\n');
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h.gov.observe('new.ts');
  const diff = h.chatCalls[0]!.diff;
  assert.ok(diff.hunks[0]!.lines.every((l) => l.startsWith('+')), 'new file diff is all-additions');
  await h.gov.decide('new.ts', false);
  assert.ok(h.removed.includes('new.ts'), 'reject removed the created file');
  assert.equal(h.disk.has('new.ts'), false);
});

test('S006 governor: non-git -> no-baseline visualize-only; reject is a no-op with a note, never throws', async () => {
  const h = harness({ gitAvailable: false });
  h.disk.set('a.ts', 'x\n');
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h.gov.observe('a.ts');
  assert.equal(h.chatCalls[0]!.review, false, 'no baseline -> review controls suppressed (visualize-only)');
  await assert.doesNotReject(() => h.gov.decide('a.ts', false));
  assert.equal(h.disk.get('a.ts'), 'x\n', 'no-baseline reject does not revert');
});

test('S006 governor: computes its own diff from before/after (provider-agnostic; independent of sc2)', async () => {
  const h = harness();
  h.baselineContent.set('a.ts', 'line1\nline2\n');
  h.disk.set('a.ts', 'line1\nCHANGED\n');
  await h.gov.beginTurn({ mode: 'auto', cwd: '/repo' });
  await h.gov.observe('a.ts');
  const lines = h.chatCalls[0]!.diff.hunks[0]!.lines;
  assert.ok(lines.includes(' line1'), 'context line preserved');
  assert.ok(lines.includes('-line2'), 'removed line present');
  assert.ok(lines.includes('+CHANGED'), 'added line present');
});

test('S006 governor: diffView=editor routes to showEditor (no chat render)', async () => {
  const h = harness({ diffView: 'editor' });
  h.baselineContent.set('a.ts', 'old\n');
  h.disk.set('a.ts', 'new\n');
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await h.gov.observe('a.ts');
  assert.equal(h.chatCalls.length, 0, 'editor mode does not post a chat edit-prompt');
  assert.equal(h.editorCalls.length, 1);
  assert.equal(h.editorCalls[0]!.review, true);
  assert.equal(h.editorCalls[0]!.baseline, 'old\n');
});

test('S006 governor: a stale/unknown edit-decision is a no-op', async () => {
  const h = harness();
  await h.gov.beginTurn({ mode: 'review', cwd: '/repo' });
  await assert.doesNotReject(() => h.gov.decide('never-seen.ts', false));
});

test('S006 defaultComputeDiff: unchanged content yields all-context lines', () => {
  const d = defaultComputeDiff('a\nb\n', 'a\nb\n', 'x.ts');
  assert.ok(d.hunks[0]!.lines.every((l) => l.startsWith(' ')), 'no add/remove for identical content');
});

test('S006 governor: a late observe from a SUPERSEDED turn does not render into the new turn (cross-turn guard)', async () => {
  // A baseline.read that blocks until released, to interleave two turns deterministically.
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const chatCalls: Array<{ path: string; review: boolean }> = [];
  const gov = createEditGovernor({
    baseline: {
      available: async () => true,
      snapshot: async () => ({ ref: 'SNAP' }),
      read: async (_h, _p) => { await gate; return 'old\n'; },
    },
    fs: { read: async () => 'new\n', write: async () => {}, remove: async () => {} },
    computeDiff: defaultComputeDiff,
    render: { showChat: (path, _d, o) => { chatCalls.push({ path, review: o.review }); }, showEditor: async () => {} },
    diffView: () => 'chat',
  });
  await gov.beginTurn({ mode: 'review', cwd: '/repo' });
  const p = gov.observe('a.ts'); // parks on the gated baseline.read
  await gov.beginTurn({ mode: 'auto', cwd: '/repo' }); // a NEW turn supersedes turn 1
  release();
  await p;
  assert.equal(chatCalls.length, 0, 'the superseded turn 1 observe did not render into turn 2');
});
