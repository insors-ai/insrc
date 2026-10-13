/**
 * Story E20260925edb76e2e:S006 / t7, Story E20261013b2e8109f:S001 / t2 — the git-baseline seam
 * over a fake runGit (no real git; git-baseline.integration.test.ts runs the real one).
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/git-baseline.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitBaseline, DIFF_ARGS } from '../git-baseline.js';

const CWD = '/repo/pkg';
const toRel = (cwd: string, p: string): string => (p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : p).split('\\').join('/');
const toAbs = (cwd: string, rel: string): string => (rel.startsWith('/') ? rel : `${cwd}/${rel}`);

interface Call { args: string[]; env: Record<string, string> | undefined }
type Answer = { ok: boolean; stdout: string };

/** A scripted git: `answer` sees each call and says what git printed. Records args and env. */
function fake(answer: (args: string[], n: number) => Answer | undefined, opts?: { indexExists?: boolean | undefined }) {
  const calls: Call[] = [];
  const copies: Array<[string, string]> = [];
  const removed: string[] = [];
  let seq = 0;
  const baseline = createGitBaseline({
    runGit: async (_cwd, args, env) => {
      calls.push({ args, env });
      return answer(args, calls.length) ?? { ok: false, stdout: '' };
    },
    cwd: () => CWD,
    toAbs,
    toRel,
    tempIndexPath: () => `/tmp/idx-${seq++}`,
    copyFile: async (from, to) => {
      copies.push([from, to]);
      return opts?.indexExists ?? true;
    },
    removeFile: async (p) => {
      removed.push(p);
    },
  });
  return { baseline, calls, copies, removed };
}

test("git-baseline: snapshot resolves the printed index path against cwd, copies it, adds and writes a tree with GIT_INDEX_FILE set to the copy, and returns the tree id and the copy's path", async () => {
  const f = fake((args) => {
    if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return { ok: true, stdout: 'true\n' };
    if (args[0] === 'rev-parse' && args[1] === '--git-path') return { ok: true, stdout: '../.git/index\n' };
    if (args[0] === 'add') return { ok: true, stdout: '' };
    if (args[0] === 'write-tree') return { ok: true, stdout: 'TREE1\n' };
    return undefined;
  });
  assert.equal(await f.baseline.available(CWD), true);
  const handle = await f.baseline.snapshot(CWD);
  assert.deepEqual(handle, { ref: 'TREE1', index: '/tmp/idx-0' });
  // git printed the path relative to the directory it ran in: it is resolved against cwd.
  assert.deepEqual(f.copies, [[`${CWD}/../.git/index`, '/tmp/idx-0']]);
  const [, where, add, write] = f.calls;
  assert.deepEqual(where!.args, ['rev-parse', '--git-path', 'index']);
  assert.equal(where!.env, undefined);
  assert.deepEqual(add!.args, ['add', '-A', '--ignore-errors']);
  assert.deepEqual(add!.env, { GIT_INDEX_FILE: '/tmp/idx-0' });
  assert.deepEqual(write!.args, ['write-tree']);
  assert.deepEqual(write!.env, { GIT_INDEX_FILE: '/tmp/idx-0' });

  // An absolute printed path is used as it is; a repository with no index file still snapshots.
  const abs = fake((args) => (args[0] === 'rev-parse' ? { ok: true, stdout: '/elsewhere/worktrees/w/index\n' } : args[0] === 'write-tree' ? { ok: true, stdout: 'T\n' } : { ok: true, stdout: '' }), { indexExists: false });
  assert.deepEqual(await abs.baseline.snapshot(CWD), { ref: 'T', index: '/tmp/idx-0' });
  assert.deepEqual(abs.copies, [['/elsewhere/worktrees/w/index', '/tmp/idx-0']]);

  // write-tree failing fails the snapshot and leaves no private index behind.
  const bad = fake((args) => (args[0] === 'write-tree' ? { ok: false, stdout: '' } : { ok: true, stdout: 'x\n' }));
  await assert.rejects(() => bad.baseline.snapshot(CWD), /write-tree failed/);
  assert.deepEqual(bad.removed, ['/tmp/idx-0']);
  const empty = fake((args) => (args[0] === 'write-tree' ? { ok: true, stdout: '\n' } : { ok: true, stdout: 'x\n' }));
  await assert.rejects(() => empty.baseline.snapshot(CWD), /write-tree failed/);
  // Outside a repository.
  assert.equal(await fake(() => ({ ok: false, stdout: '' })).baseline.available(CWD), false);
});

test('git-baseline: changes returns an empty string for an unchanged tree, the patch for a changed one and undefined when write-tree or diff fails', async () => {
  let tree = 'TREE1';
  let diffOk = true;
  let writeOk = true;
  const f = fake((args) => {
    if (args[0] === 'add') return { ok: true, stdout: '' };
    if (args[0] === 'write-tree') return { ok: writeOk, stdout: `${tree}\n` };
    if (args.includes('diff')) return { ok: diffOk, stdout: 'PATCH' };
    return undefined;
  });
  const handle = { ref: 'TREE1', index: '/tmp/idx-9' };
  assert.equal(await f.baseline.changes(handle), '');
  assert.equal(f.calls.some((c) => c.args.includes('diff')), false, 'an unchanged tree is not diffed');
  assert.deepEqual(f.calls.map((c) => c.env), [{ GIT_INDEX_FILE: '/tmp/idx-9' }, { GIT_INDEX_FILE: '/tmp/idx-9' }]);

  tree = 'TREE2';
  assert.equal(await f.baseline.changes(handle), 'PATCH');
  const diff = f.calls.at(-1)!;
  assert.deepEqual(diff.args, [...DIFF_ARGS, 'TREE1', 'TREE2']);
  assert.deepEqual(diff.args.slice(0, 3), ['-c', 'core.quotepath=false', 'diff']);
  for (const flag of ['--no-renames', '-U3', '--relative', '--src-prefix=a/', '--dst-prefix=b/', '--no-ext-diff', '--no-textconv', '--no-color']) {
    assert.ok(diff.args.includes(flag), flag);
  }
  assert.equal(diff.env, undefined, 'the diff of two trees needs no index');

  diffOk = false;
  assert.equal(await f.baseline.changes(handle), undefined);
  diffOk = true;
  writeOk = false;
  assert.equal(await f.baseline.changes(handle), undefined);
  // A handle with no private index (not made by this baseline) cannot be compared.
  assert.equal(await f.baseline.changes({ ref: 'TREE1' }), undefined);
});

test('git-baseline: read resolves a path with show <tree>:./<rel> and gives undefined for a path not in the tree', async () => {
  const files: Record<string, string> = { 'src/a.ts': 'OLD\n', 'notes.txt': 'was untracked\n' };
  const f = fake((args) => {
    if (args[0] !== 'show') return undefined;
    const rel = /^TREE1:\.\/(.+)$/.exec(args[1] ?? '')?.[1];
    return rel !== undefined && rel in files ? { ok: true, stdout: files[rel]! } : { ok: false, stdout: 'fatal: path not in tree' };
  });
  const handle = { ref: 'TREE1', index: '/tmp/idx-0' };
  // An absolute path is made cwd-relative; the `./` keeps it relative to cwd in a subfolder workspace.
  assert.equal(await f.baseline.read(handle, `${CWD}/src/a.ts`), 'OLD\n');
  assert.deepEqual(f.calls.at(-1)!.args, ['show', 'TREE1:./src/a.ts']);
  // A file that was untracked when the turn started is in the tree too.
  assert.equal(await f.baseline.read(handle, 'notes.txt'), 'was untracked\n');
  // A file the turn created is not: undefined (a reject removes it).
  assert.equal(await f.baseline.read(handle, 'src/new.ts'), undefined);
});

test('git-baseline: release removes the private index, and a failed git add does not fail snapshot', async () => {
  const f = fake((args) => {
    if (args[0] === 'rev-parse') return { ok: true, stdout: '.git/index\n' };
    if (args[0] === 'add') return { ok: false, stdout: 'error: open("locked"): Permission denied' };
    if (args[0] === 'write-tree') return { ok: true, stdout: 'TREE1\n' };
    return undefined;
  });
  const handle = await f.baseline.snapshot(CWD);
  assert.deepEqual(handle, { ref: 'TREE1', index: '/tmp/idx-0' });
  await f.baseline.release(handle);
  assert.deepEqual(f.removed, ['/tmp/idx-0', '/tmp/idx-0.lock']);
  // Nothing to remove for a handle with no private index.
  await f.baseline.release({ ref: 'X' });
  assert.equal(f.removed.length, 2);
});
