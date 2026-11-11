/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitPathHistoryTool } from '../path-history.js';
import type { GitPathHistoryData } from '../schemas.js';

/** base adds f; side deletes then recreates f and is merged; side2 deletes f and is
 * merged with -s ours, so the merge keeps main's f. Default history simplification
 * drops side2's deletion; full history must list it and both merges. */
function sideBranchRepo() {
 const repo = mkdtempSync(join(tmpdir(), 'git-path-history-full-'));
 const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env,
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test',
  GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test' } }).trim();
 const put = (path: string, text: string) => writeFileSync(join(repo, path), text);
 git('init', '-q', '-b', 'main');
 put('f', 'a\n'); put('g', 'x\n'); git('add', '-A'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
 git('checkout', '-q', '-b', 'side'); git('rm', '-q', 'f'); git('commit', '-qm', 'side deletes f'); const sideDelete = git('rev-parse', 'HEAD');
 put('f', 'b\n'); git('add', 'f'); git('commit', '-qm', 'side recreates f'); const sideRecreate = git('rev-parse', 'HEAD');
 git('checkout', '-q', 'main'); put('g', 'y\n'); git('commit', '-qam', 'main g');
 git('merge', '-q', '--no-ff', '-m', 'merge side', 'side'); const mergeSide = git('rev-parse', 'HEAD');
 git('checkout', '-q', '-b', 'side2'); git('rm', '-q', 'f'); git('commit', '-qm', 'side2 deletes f'); const side2Delete = git('rev-parse', 'HEAD');
 git('checkout', '-q', 'main'); put('g', 'z\n'); git('commit', '-qam', 'main g2');
 git('merge', '-q', '--no-ff', '-s', 'ours', '-m', 'merge side2 keeping f', 'side2'); const mergeOurs = git('rev-parse', 'HEAD');
 return { repo, git, base, sideDelete, sideRecreate, mergeSide, side2Delete, mergeOurs, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

async function listed(input: Record<string, unknown>): Promise<string[]> {
 const result = await gitPathHistoryTool.execute(input);
 assert.equal(result.success, true, result.output);
 return (result.data as GitPathHistoryData).commits.map(c => c.sha);
}

test('fullHistory lists a side-branch deletion and the merge that default history omits', async () => {
 const r = sideBranchRepo();
 try {
  const rev = `${r.base}..HEAD`;
  const simplified = await listed({ cwd: r.repo, rev, path: 'f' });
  assert.ok(!simplified.includes(r.side2Delete), 'default simplification hides the side2 deletion');
  const full = await listed({ cwd: r.repo, rev, path: 'f', fullHistory: true });
  assert.deepEqual(new Set(full), new Set([r.sideDelete, r.sideRecreate, r.mergeSide, r.side2Delete, r.mergeOurs]));
 } finally { r.cleanup(); }
});

test('without fullHistory the listing is unchanged', async () => {
 const r = sideBranchRepo();
 try {
  for (const input of [{ path: 'f' }, { path: 'f', fullHistory: false }, { path: 'g', firstParent: true }]) {
   const expected = r.git('log', '--format=%H', ...(input.firstParent ? ['--first-parent'] : []), 'HEAD', '--', `:(top,literal)${input.path}`).split('\n').filter(Boolean);
   assert.deepEqual(await listed({ cwd: r.repo, ...input }), expected);
  }
 } finally { r.cleanup(); }
});
