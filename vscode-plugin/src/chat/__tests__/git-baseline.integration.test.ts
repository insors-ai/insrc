/**
 * Story E20261013b2e8109f:S001 / t2 — the git baseline against REAL git, in temporary
 * repositories the test makes and removes. Skipped when git is not installed.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { createGitBaseline } from '../git-baseline.js';
import { parsePatch } from '../diff-sections.js';
import type { WorkspaceBaseline } from '../edit-governor.js';

const HAS_GIT = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { encoding: 'utf8' });

function baselineFor(cwd: string, tmp: string): WorkspaceBaseline {
  let n = 0;
  return createGitBaseline({
    runGit: (dir, args, env) =>
      new Promise((resolve) => {
        execFile('git', ['-C', dir, ...args], { encoding: 'utf8', ...(env !== undefined ? { env: { ...process.env, ...env } } : {}) }, (err, stdout) => {
          resolve({ ok: err === null, stdout: stdout ?? '' });
        });
      }),
    cwd: () => cwd,
    toAbs: (dir, p) => (isAbsolute(p) ? p : join(dir, p)),
    toRel: (dir, p) => (isAbsolute(p) ? relative(dir, p) : p).split('\\').join('/'),
    tempIndexPath: () => join(tmp, `idx-${n++}`),
    copyFile: async (from, to) => {
      try {
        copyFileSync(from, to);
        return true;
      } catch {
        return false;
      }
    },
    removeFile: async (p) => rmSync(p, { force: true }),
  });
}

const LINES = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join('\n') + '\n';

/** A repository with a `pkg` subfolder: tracked, untracked and ignored files, and one outside pkg. */
function seed(root: string): void {
  mkdirSync(join(root, 'pkg', 'src'), { recursive: true });
  writeFileSync(join(root, 'pkg', 'src', 'a.txt'), LINES);
  writeFileSync(join(root, 'pkg', 'gone.txt'), 'bye\n');
  writeFileSync(join(root, '.gitignore'), 'ig\n');
  writeFileSync(join(root, 'outside.txt'), 'out\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  writeFileSync(join(root, 'pkg', 'untracked-before.txt'), 'scratch\n');
  writeFileSync(join(root, 'pkg', 'ig'), 'secret\n');
  writeFileSync(join(root, 'outside.txt'), 'out\nmodified before the turn\n');
}

/** What a turn does: two edits of one file, a new file, a changed untracked file, a deletion, a binary, an ignored and an outside change. */
function turn(root: string): void {
  const pkg = join(root, 'pkg');
  writeFileSync(join(pkg, 'src', 'a.txt'), LINES.replace('l2\n', 'L2 changed\n').replace('l18\n', 'L18 changed\n'));
  writeFileSync(join(pkg, 'src', 'new file.txt'), 'new\n');
  writeFileSync(join(pkg, 'untracked-before.txt'), 'scratch\nmore\n');
  unlinkSync(join(pkg, 'gone.txt'));
  writeFileSync(join(pkg, 'bin.dat'), Buffer.from([0, 1, 2, 3]));
  writeFileSync(join(pkg, 'ig'), 'secret\nchanged\n');
  writeFileSync(join(root, 'outside.txt'), 'out\nmodified before the turn\nand in it\n');
}

async function check(root: string, tmp: string): Promise<void> {
  const pkg = join(root, 'pkg');
  const statusBefore = git(root, 'status', '--porcelain');
  const indexPath = git(root, 'rev-parse', '--path-format=absolute', '--git-path', 'index').trim();
  const indexBefore = readFileSync(indexPath);

  const baseline = baselineFor(pkg, tmp);
  assert.equal(await baseline.available(pkg), true);
  const handle = await baseline.snapshot(pkg);
  assert.match(handle.ref, /^[0-9a-f]{40,64}$/);
  assert.equal(await baseline.changes(handle), '', 'nothing changed yet');

  turn(root);
  const patch = await baseline.changes(handle);
  assert.ok(patch !== undefined && patch !== '');
  const sections = parsePatch(patch);
  assert.deepEqual(
    sections.map((s) => [s.path, s.fileState ?? '', s.binary === true, s.oldStart, s.added, s.removed]).sort(),
    [
      ['bin.dat', 'new', true, 0, 0, 0],
      ['gone.txt', 'deleted', false, 1, 0, 1],
      ['src/a.txt', '', false, 1, 1, 1],
      ['src/a.txt', '', false, 15, 1, 1],
      ['src/new file.txt', 'new', false, 0, 1, 0],
      // only the turn's change of a file that was untracked at the start
      ['untracked-before.txt', '', false, 1, 1, 0],
    ].sort(),
  );
  // Nothing for the ignored file, and nothing outside the folder the diff ran in.
  assert.ok(!patch.includes('secret') && !patch.includes('outside.txt'));

  // read gives the start content from the tree id, from a subfolder, tracked or not.
  assert.equal(await baseline.read(handle, join(pkg, 'src', 'a.txt')), LINES);
  assert.equal(await baseline.read(handle, 'untracked-before.txt'), 'scratch\n');
  assert.equal(await baseline.read(handle, 'gone.txt'), 'bye\n');
  assert.equal(await baseline.read(handle, 'src/new file.txt'), undefined);

  // The user's own index and status are what they were before the snapshot, apart from the turn's own changes.
  assert.deepEqual(readFileSync(indexPath), indexBefore, 'the index file is untouched');
  const statusAfter = git(root, 'status', '--porcelain');
  for (const line of statusBefore.split('\n').filter((l) => l !== '')) assert.ok(statusAfter.includes(line), line);
  assert.equal(git(root, 'diff', '--cached', '--name-only'), '', 'nothing was staged');

  await baseline.release(handle);
  assert.throws(() => readFileSync(handle.index!), /ENOENT/);
}

test('git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged', { skip: !HAS_GIT }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'insrc-gitbase-'));
  try {
    // A plain repository.
    const plain = join(tmp, 'plain');
    mkdirSync(plain);
    git(plain, 'init', '-q');
    seed(plain);
    await check(plain, tmp);

    // A repository with a split index.
    const split = join(tmp, 'split');
    mkdirSync(split);
    git(split, 'init', '-q');
    git(split, 'config', 'core.splitIndex', 'true');
    seed(split);
    await check(split, tmp);

    // A linked worktree: its index is not at <worktree>/.git/index.
    const main = join(tmp, 'main');
    mkdirSync(main);
    git(main, 'init', '-q');
    writeFileSync(join(main, 'seed.txt'), 'seed\n');
    git(main, 'add', '-A');
    git(main, 'commit', '-q', '-m', 'seed');
    const linked = join(tmp, 'linked');
    git(main, 'worktree', 'add', '-q', '-b', 'wt', linked);
    seed(linked);
    await check(linked, tmp);

    // A repository with no commit and no index file yet.
    const fresh = join(tmp, 'fresh');
    mkdirSync(join(fresh, 'pkg'), { recursive: true });
    git(fresh, 'init', '-q');
    writeFileSync(join(fresh, 'pkg', 'only.txt'), 'one\n');
    const b = baselineFor(join(fresh, 'pkg'), tmp);
    const h = await b.snapshot(join(fresh, 'pkg'));
    writeFileSync(join(fresh, 'pkg', 'only.txt'), 'one\ntwo\n');
    assert.deepEqual(parsePatch((await b.changes(h))!).map((s) => [s.path, s.added]), [['only.txt', 1]]);
    await b.release(h);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
