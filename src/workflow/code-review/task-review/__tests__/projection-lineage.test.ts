/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGitTools } from '../../../../daemon/tools/builtins/git/index.js';
import { RegistryReviewSources } from '../sources.js';
import type { ReviewSources } from '../sources.js';
import { projectReviewScope, ProjectionBudget, boundedProjectionSources } from '../projection.js';
import { TaskReviewInputError } from '../contracts.js';
import type { SelectedChange } from '../packet.js';

registerGitTools();

/** A repository whose commit ids never vary: fixed identity and dates per commit,
 * explicit merge messages, and no user or system git configuration. */
function deterministicRepo() {
 const repo = mkdtempSync(join(tmpdir(), 'projection-lineage-'));
 let tick = 0;
 const git = (...args: string[]) => {
  const at = `2026-11-11T00:00:${String(tick).padStart(2, '0')}Z`;
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env,
   GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
   GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test', GIT_AUTHOR_DATE: at,
   GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test', GIT_COMMITTER_DATE: at } }).trim();
 };
 const put = (path: string, text: string) => { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), text); };
 const commit = (message: string) => { tick++; git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
 git('init', '-q', '-b', 'main');
 return { repo, git, put, commit, tick: () => tick++, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

async function selected(sources: ReviewSources, commit: string, parent: string, path: string, previousPath: string, segments: SelectedChange['segments']): Promise<SelectedChange> {
 return { commit, parent, path, previousPath, segments, before: await sources.file(parent, previousPath), after: await sources.file(commit, path), limitations: [] };
}

/** Selected change to source.js, then a side branch and main commits that touch only
 * other files, an explicit merge, and a selected rename of source.js to moved.js. */
async function identityFixture() {
 const r = deterministicRepo();
 r.put('source.js', 'a\nb\nc\n'); r.put('other.txt', 'o\n'); const base = r.commit('base');
 r.put('source.js', 'a\nB\nc\n'); const first = r.commit('selected change');
 r.git('checkout', '-q', '-b', 'side'); r.put('side.txt', 'side\n'); r.commit('side work');
 r.git('checkout', '-q', 'main'); r.put('other.txt', 'o2\n'); r.commit('main work');
 r.tick(); r.git('merge', '-q', '--no-ff', '-m', 'merge side', 'side');
 renameSync(join(r.repo, 'source.js'), join(r.repo, 'moved.js')); r.put('moved.js', 'a\nB\nC\n'); const moved = r.commit('selected rename');
 const sources = new RegistryReviewSources({ repoPath: r.repo, sessionId: 'projection-lineage', requestId: 1, send: () => {} });
 const origins = [await selected(sources, first, base, 'source.js', 'source.js', [{ after: [2, 2] }]),
  await selected(sources, moved, r.git('rev-parse', `${moved}^`), 'moved.js', 'source.js', [{ after: [3, 3] }])];
 const projection = await projectReviewScope(origins, moved, sources);
 return { r, first, moved, projection };
}

/** Computed by the code before pathContinuity read a path listing (Story 66d4d41d99f805af/s1, t1). */
const PINNED_IDENTITY = 'c38a52e51e363cfc60c9a95375cb6e7a8a563d7f01bf1dc28405cc2a4e473401';

test('projection identity matches the identity pinned from the code before the change', async () => {
 const one = await identityFixture(), two = await identityFixture();
 try {
  assert.equal(one.moved, two.moved, 'the fixture yields the same commit ids on every run');
  assert.equal(one.projection.identity, two.projection.identity);
  assert.deepEqual(one.projection.entries.map(e => e.path), ['moved.js', 'moved.js']);
  assert.equal(one.projection.identity, PINNED_IDENTITY);
 } finally { one.r.cleanup(); two.r.cleanup(); }
});

test('pathChanges lists the commits that changed the path and refuses a failed or malformed listing as a source error', async () => {
 const { r, first, moved } = await identityFixture();
 try {
  const sources = new RegistryReviewSources({ repoPath: r.repo, sessionId: 'projection-lineage', requestId: 1, send: () => {} });
  const base = r.git('rev-list', '--max-parents=0', 'HEAD');
  assert.deepEqual(new Set(await sources.pathChanges(base, moved, 'source.js')), new Set([first, moved]), 'the merge and the commits that touch other files are not listed');
  assert.deepEqual(new Set(await sources.pathChanges(base, moved, 'side.txt')), new Set([r.git('rev-parse', 'side'), r.git('rev-parse', `${moved}^`)]), 'the merge differs from its main parent at side.txt, so it is listed');
  const source = (error: unknown) => error instanceof TaskReviewInputError && error.field === 'source';
  await assert.rejects(sources.pathChanges('f'.repeat(40), moved, 'source.js'), source, 'a listing git cannot produce is a source error');
  await assert.rejects(sources.pathChanges(base.slice(0, 12), moved, 'source.js'), source, 'a listed sha whose length differs from the range OIDs is refused');
 } finally { r.cleanup(); }
});

test('boundedProjectionSources caches pathChanges and charges one read per uncached listing', async () => {
 const { r, moved } = await identityFixture();
 try {
  const registry = new RegistryReviewSources({ repoPath: r.repo, sessionId: 'projection-lineage', requestId: 1, send: () => {} });
  let listings = 0;
  const counting: ReviewSources = { commit: registry.commit.bind(registry), isAncestor: registry.isAncestor.bind(registry), file: registry.file.bind(registry),
   changedRanges: registry.changedRanges.bind(registry), pathChanges: async (...args) => { listings++; return registry.pathChanges(...args); } };
  const base = r.git('rev-list', '--max-parents=0', 'HEAD');
  const bounded = boundedProjectionSources(counting, new ProjectionBudget({ reads: 1 }));
  const once = await bounded.pathChanges(base, moved, 'source.js');
  assert.deepEqual(await bounded.pathChanges(base, moved, 'source.js'), once);
  assert.equal(listings, 1, 'a repeated listing is served from the cache');
  await assert.rejects(bounded.pathChanges(base, moved, 'other.txt'), (error: unknown) => error instanceof TaskReviewInputError && error.field === 'projection_limit', 'an uncached listing is charged as a read');
  assert.equal(listings, 1);
 } finally { r.cleanup(); }
});

/** A selected change to source.js, then `n` commits on main and `n` on a side branch merged
 * twice, all touching only other files; the pin is the last merge. */
async function interleaved(n: number) {
 const r = deterministicRepo();
 r.put('source.js', 'a\nb\nc\n'); r.put('other.txt', '0\n'); const base = r.commit('base');
 r.put('source.js', 'a\nB\nc\n'); const origin = r.commit('selected change');
 for (let round = 0; round < 2; round++) {
  r.git('checkout', '-q', '-B', 'side'); for (let i = 0; i < n / 2; i++) { r.put(`side-${round}-${i}.txt`, `${i}\n`); r.commit(`side ${round} ${i}`); }
  r.git('checkout', '-q', 'main'); for (let i = 0; i < n / 2; i++) { r.put('other.txt', `${round}-${i}\n`); r.commit(`main ${round} ${i}`); }
  r.tick(); r.git('merge', '-q', '--no-ff', '-m', `merge side ${round}`, 'side');
 }
 const pin = r.git('rev-parse', 'HEAD');
 return { r, base, origin, pin };
}

function counting(registry: ReviewSources, path: string) {
 const seen = { reads: 0, bytes: 0, listings: 0 };
 const sources: ReviewSources = { commit: registry.commit.bind(registry), isAncestor: registry.isAncestor.bind(registry), changedRanges: registry.changedRanges.bind(registry),
  file: async (commit, at) => { const blob = await registry.file(commit, at); if (at === path) { seen.reads++; seen.bytes += blob?.bytes.byteLength ?? 0; } return blob; },
  pathChanges: async (...args) => { seen.listings++; return registry.pathChanges(...args); } };
 return { sources, seen };
}

test('lineage reads do not grow with interleaved commits that leave the selected path untouched', async () => {
 const measure = async (n: number) => {
  const { r, base, origin, pin } = await interleaved(n);
  try {
   const registry = new RegistryReviewSources({ repoPath: r.repo, sessionId: 'projection-lineage', requestId: 1, send: () => {} });
   const { sources, seen } = counting(registry, 'source.js');
   const projection = await projectReviewScope([await selected(registry, origin, base, 'source.js', 'source.js', [{ after: [2, 2] }])], pin, sources);
   assert.deepEqual(projection.entries.map(e => e.findingScope), ['selected']);
   return { ...seen, commits: Number(r.git('rev-list', '--count', `${origin}..${pin}`)) };
  } finally { r.cleanup(); }
 };
 const small = await measure(4), large = await measure(40);
 assert.ok(large.commits - small.commits >= 36, `the fixtures differ by ${large.commits - small.commits} commits`);
 assert.deepEqual({ reads: large.reads, bytes: large.bytes, listings: large.listings }, { reads: small.reads, bytes: small.bytes, listings: small.listings });
 assert.equal(small.listings, 1, 'one listing for the one lineage leg');
});

/** source.js is selected, then a side branch forked after the origin changes it and is merged. */
async function sideBranchLineage(side: (r: ReturnType<typeof deterministicRepo>) => void, mergeArgs: readonly string[]) {
 const r = deterministicRepo();
 r.put('source.js', 'a\nb\nc\n'); r.put('other.txt', '0\n'); const base = r.commit('base');
 r.put('source.js', 'a\nB\nc\n'); const origin = r.commit('selected change');
 r.git('checkout', '-q', '-b', 'side'); side(r);
 r.git('checkout', '-q', 'main'); r.put('other.txt', '1\n'); r.commit('main work');
 r.tick(); r.git('merge', '-q', '--no-ff', ...mergeArgs, '-m', 'merge side', 'side');
 const pin = r.git('rev-parse', 'HEAD');
 const sources = new RegistryReviewSources({ repoPath: r.repo, sessionId: 'projection-lineage', requestId: 1, send: () => {} });
 return { r, pin, sources, origins: [await selected(sources, origin, base, 'source.js', 'source.js', [{ after: [2, 2] }])] };
}

test('a side-branch deletion merged back with the file kept still interrupts lineage', async () => {
 const f = await sideBranchLineage(r => { r.git('rm', '-q', 'source.js'); r.commit('side deletes source.js'); }, ['-s', 'ours']);
 try {
  assert.equal(f.r.git('rev-parse', `${f.pin}:source.js`).length, 40, 'the merge kept source.js');
  await assert.rejects(projectReviewScope(f.origins, f.pin, f.sources), /Unselected path disappearance or recreation interrupts lineage/);
 } finally { f.r.cleanup(); }
});

test('a side-branch deletion and recreation merged back still interrupts lineage', async () => {
 const f = await sideBranchLineage(r => { r.git('rm', '-q', 'source.js'); r.commit('side deletes source.js'); r.put('source.js', 'a\nB\nc\n'); r.commit('side recreates source.js'); }, []);
 try {
  await assert.rejects(projectReviewScope(f.origins, f.pin, f.sources), /Unselected path disappearance or recreation interrupts lineage/);
 } finally { f.r.cleanup(); }
});

test('a path history failure is a source error, not a projection limit or lineage conflict', async () => {
 const { r, base, origin, pin } = await interleaved(4);
 try {
  const registry = new RegistryReviewSources({ repoPath: r.repo, sessionId: 'projection-lineage', requestId: 1, send: () => {} });
  const failure = new TaskReviewInputError('source', 'git log failed');
  const broken: ReviewSources = { commit: registry.commit.bind(registry), isAncestor: registry.isAncestor.bind(registry), file: registry.file.bind(registry), changedRanges: registry.changedRanges.bind(registry), pathChanges: async () => { throw failure; } };
  await assert.rejects(projectReviewScope([await selected(registry, origin, base, 'source.js', 'source.js', [{ after: [2, 2] }])], pin, broken), error => error === failure);
 } finally { r.cleanup(); }
});

test('the read limit still refuses with projection_limit when the selected file itself changed too often', async () => {
 const r = deterministicRepo();
 try {
  r.put('source.js', 'a\nb\nc\n'); const base = r.commit('base');
  r.put('source.js', 'a\nB\nc\n'); const origin = r.commit('selected change');
  for (let i = 0; i < 30; i++) { r.put('source.js', `a\nB\nc\n${i}\n`); r.commit(`unselected edit ${i}`); }
  const pin = r.git('rev-parse', 'HEAD');
  const sources = new RegistryReviewSources({ repoPath: r.repo, sessionId: 'projection-lineage', requestId: 1, send: () => {} });
  const origins = [await selected(sources, origin, base, 'source.js', 'source.js', [{ after: [2, 2] }])];
  await assert.rejects(projectReviewScope(origins, pin, sources, new ProjectionBudget({ reads: 40 })), (error: unknown) => error instanceof TaskReviewInputError && error.field === 'projection_limit');
  assert.equal((await projectReviewScope(origins, pin, sources)).entries.length, 1, 'the same projection fits the production limits');
 } finally { r.cleanup(); }
});
