/**
 * Story E20260925edb76e2e:S006 / t7 — git-baseline seam unit suite.
 *
 * Pins the two data-loss-critical behaviors the cold review caught, with a fake
 * runGit + readText (no real git): (1) an untracked-but-existing file is captured
 * so a reject RESTORES it (baseline defined, not undefined -> no delete); (2) the
 * git-show path is cwd-relative via a `./` prefix (correct in a subdir workspace).
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/git-baseline.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitBaseline } from '../git-baseline.js';

const toRel = (cwd: string, p: string): string => (p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : p).split('\\').join('/');
const toAbs = (cwd: string, rel: string): string => (rel.startsWith('/') ? rel : `${cwd}/${rel}`);

interface FakeGit {
  gitCalls: string[][];
  make: (opts: {
    isRepo?: boolean;
    stashSha?: string; // '' -> clean tree -> HEAD fallback
    tree?: Record<string, string>; // rel -> content resolvable by `show <ref>:./<rel>`
    untrackedList?: string[]; // rel paths ls-files --others returns
    disk?: Record<string, string>; // abs -> content for readText
  }) => ReturnType<typeof createGitBaseline>;
}

function fakeGit(cwd: string): FakeGit {
  const gitCalls: string[][] = [];
  return {
    gitCalls,
    make: (opts) => {
      const disk = opts.disk ?? {};
      const runGit = async (_cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> => {
        gitCalls.push(args);
        if (args[0] === 'rev-parse') return { ok: opts.isRepo ?? true, stdout: 'true\n' };
        if (args[0] === 'stash' && args[1] === 'create') return { ok: true, stdout: (opts.stashSha ?? 'STASHSHA') + '\n' };
        if (args[0] === 'ls-files') return { ok: true, stdout: (opts.untrackedList ?? []).join('\n') };
        if (args[0] === 'show') {
          // arg is `${ref}:./${rel}`
          const spec = args[1] ?? '';
          const m = /^[^:]+:\.\/(.+)$/.exec(spec);
          const rel = m?.[1];
          if (rel !== undefined && opts.tree && rel in opts.tree) return { ok: true, stdout: opts.tree[rel]! };
          return { ok: false, stdout: `fatal: path not in tree` };
        }
        return { ok: false, stdout: '' };
      };
      const readText = async (abs: string): Promise<string | undefined> => (abs in disk ? disk[abs] : undefined);
      return createGitBaseline({ runGit, readText, cwd: () => cwd, toAbs, toRel });
    },
  };
}

test('S006 git-baseline: a TRACKED file resolves via `show <ref>:./<rel>` (cwd-relative; subdir-safe)', async () => {
  const cwd = '/r/pkg';
  const fg = fakeGit(cwd);
  const bl = fg.make({ tree: { 'a.ts': 'old\n' } });
  const h = await bl.snapshot(cwd);
  const content = await bl.read(h, '/r/pkg/a.ts');
  assert.equal(content, 'old\n', 'tracked file returns its pre-turn content');
  // the show spec MUST carry the ./ prefix (bare path would resolve at repo top-level).
  const show = fg.gitCalls.find((c) => c[0] === 'show');
  assert.ok(show, 'a git show ran');
  assert.match(show![1]!, /:\.\//, 'git show uses a ./-prefixed (cwd-relative) path');
});

test('S006 git-baseline: an UNTRACKED-but-existing file is captured at snapshot -> read returns its content (reject restores, not deletes)', async () => {
  const cwd = '/r';
  const fg = fakeGit(cwd);
  const bl = fg.make({
    stashSha: '', // clean tracked tree -> HEAD fallback
    tree: {}, // notes.txt is NOT tracked
    untrackedList: ['notes.txt'],
    disk: { '/r/notes.txt': 'user content\n' },
  });
  const h = await bl.snapshot(cwd);
  const content = await bl.read(h, '/r/notes.txt');
  assert.equal(content, 'user content\n', 'untracked-existing file has a captured baseline -> NOT treated as new');
});

test('S006 git-baseline: a genuinely NEW file (not tracked, not captured) reads undefined -> reject removes it', async () => {
  const cwd = '/r';
  const fg = fakeGit(cwd);
  const bl = fg.make({ tree: {}, untrackedList: [], disk: {} });
  const h = await bl.snapshot(cwd);
  const content = await bl.read(h, '/r/created-this-turn.ts');
  assert.equal(content, undefined, 'a file absent from tree AND the untracked snapshot is a genuine new file');
});

test('S006 git-baseline: snapshot uses the stash sha when non-empty, else HEAD; available reflects rev-parse', async () => {
  const cwd = '/r';
  const fg = fakeGit(cwd);
  const bl = fg.make({ stashSha: 'ABC123', tree: { 'a.ts': 'x' } });
  assert.equal(await bl.available(cwd), true);
  const h = await bl.snapshot(cwd);
  await bl.read(h, '/r/a.ts');
  const show = fg.gitCalls.find((c) => c[0] === 'show');
  assert.match(show![1]!, /^ABC123:/, 'uses the stash-create sha as the ref');

  const fg2 = fakeGit(cwd);
  const bl2 = fg2.make({ stashSha: '', tree: { 'a.ts': 'x' } });
  const h2 = await bl2.snapshot(cwd);
  await bl2.read(h2, '/r/a.ts');
  assert.match(fg2.gitCalls.find((c) => c[0] === 'show')![1]!, /^HEAD:/, 'clean tree -> HEAD fallback');

  const fg3 = fakeGit(cwd);
  const bl3 = fg3.make({ isRepo: false });
  assert.equal(await bl3.available(cwd), false, 'non-git workspace -> not available');
});
