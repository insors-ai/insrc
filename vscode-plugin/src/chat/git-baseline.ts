/**
 * Story E20260925edb76e2e:S006 — the git-backed WorkspaceBaseline seam (vscode-free).
 * Story E20261013b2e8109f:S001 — the baseline is a git TREE of the working tree.
 *
 * Captures the working tree as it is when a turn starts, so the EditGovernor can show what the
 * turn changed and revert a rejected edit to its true pre-turn content. The snapshot is written
 * through a PRIVATE COPY of the repository's index (GIT_INDEX_FILE): `git add -A` then
 * `git write-tree` against the copy give a tree that holds tracked AND untracked files, leaves
 * out what git ignores, and never writes the user's own index. A later check writes a second tree
 * the same way and diffs the two, so one comparison covers every kind of change.
 *
 * Two subtleties:
 *   1. `git rev-parse --git-path index` prints the index path relative to the directory git ran
 *      in (the `-C` cwd), so it is resolved against cwd before the copy. In a linked worktree or
 *      with a split index the path is still the right one to copy.
 *   2. `git show <tree>:<path>` resolves <path> relative to the tree's root. We prefix `./` so it
 *      is cwd-relative — correct when the VS Code workspace folder is a subdirectory of the repo.
 * All git/fs access is injected, so the logic is unit-testable with fakes.
 */
import type { WorkspaceBaseline, BaselineHandle } from './edit-governor.js';

export interface GitBaselineDeps {
  /** Run `git -C cwd <args>` with `env` added to the environment; resolves { ok, stdout } and NEVER rejects. */
  runGit: (cwd: string, args: string[], env?: Record<string, string>) => Promise<{ ok: boolean; stdout: string }>;
  /** The workspace root (also the `git -C` dir). */
  cwd: () => string;
  /** Join the workspace root + a cwd-relative path into an absolute fs path. */
  toAbs: (cwd: string, rel: string) => string;
  /** Normalize an incoming edit path to a cwd-relative, forward-slash git path. */
  toRel: (cwd: string, path: string) => string;
  /** A fresh absolute path in the system temporary directory for one turn's private index. */
  tempIndexPath: () => string;
  /** Copy a file; false when the source does not exist or cannot be read. */
  copyFile: (from: string, to: string) => Promise<boolean>;
  /** Remove a file; a missing file is not an error. */
  removeFile: (path: string) => Promise<void>;
}

/** The arguments of the diff between two trees: plain, with fixed prefixes, cwd-relative. */
export const DIFF_ARGS: readonly string[] = [
  '-c', 'core.quotepath=false', 'diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '-U3',
  '--src-prefix=a/', '--dst-prefix=b/', '--relative',
];

export function createGitBaseline(deps: GitBaselineDeps): WorkspaceBaseline {
  /** The working tree as a tree id, written through the private index; undefined when write-tree fails. */
  const writeTree = async (cwd: string, index: string): Promise<string | undefined> => {
    const env = { GIT_INDEX_FILE: index };
    // A file git cannot read fails `add`; the rest is still added, and only write-tree decides.
    await deps.runGit(cwd, ['add', '-A', '--ignore-errors'], env);
    const tree = await deps.runGit(cwd, ['write-tree'], env);
    const id = tree.stdout.trim();
    return tree.ok && id !== '' ? id : undefined;
  };

  return {
    available: async (cwd) => (await deps.runGit(cwd, ['rev-parse', '--is-inside-work-tree'])).ok,

    snapshot: async (cwd): Promise<BaselineHandle> => {
      const index = deps.tempIndexPath();
      const where = await deps.runGit(cwd, ['rev-parse', '--git-path', 'index']);
      const printed = where.stdout.trim();
      // No index yet (a repository with nothing staged or committed): git starts the private one empty.
      if (where.ok && printed !== '') await deps.copyFile(deps.toAbs(cwd, printed), index);
      const ref = await writeTree(cwd, index);
      if (ref === undefined) {
        await deps.removeFile(index).catch(() => {});
        throw new Error('git write-tree failed');
      }
      return { ref, index };
    },

    changes: async (handle) => {
      if (handle.index === undefined) return undefined;
      const cwd = deps.cwd();
      const now = await writeTree(cwd, handle.index);
      if (now === undefined) return undefined;
      if (now === handle.ref) return '';
      const diff = await deps.runGit(cwd, [...DIFF_ARGS, handle.ref, now]);
      return diff.ok ? diff.stdout : undefined;
    },

    read: async (handle, path) => {
      const cwd = deps.cwd();
      const rel = deps.toRel(cwd, path);
      const res = await deps.runGit(cwd, ['show', `${handle.ref}:./${rel}`]);
      // The tree holds every file that existed when the turn started, tracked or not; a path that
      // is not in it is a file the turn created (a reject removes it).
      return res.ok ? res.stdout : undefined;
    },

    release: async (handle) => {
      if (handle.index === undefined) return;
      await deps.removeFile(handle.index);
      await deps.removeFile(`${handle.index}.lock`);
    },
  };
}
