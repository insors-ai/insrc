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
