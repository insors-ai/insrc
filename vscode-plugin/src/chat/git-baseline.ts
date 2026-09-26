/**
 * Story E20260925edb76e2e:S006 — the git-backed WorkspaceBaseline seam (vscode-free).
 *
 * Captures an exact pre-turn working-tree baseline so the EditGovernor can render a
 * faithful diff AND revert a rejected edit to its true pre-turn content. Two subtleties
 * this module gets right (both were data-loss bugs when handled naively):
 *   1. `git stash create` ignores UNTRACKED files, so an untracked-but-existing file
 *      (a gitignored config, a scratch file) has no git baseline. We snapshot those
 *      files' content at beginTurn so a reject RESTORES them; only a file that existed
 *      in NEITHER the tree NOR the untracked set (a genuinely new file) is removed.
 *   2. `git show <rev>:<path>` resolves <path> relative to the repo TOP-LEVEL, not the
 *      `-C` cwd. We prefix `./` so it is cwd-relative — correct when the VS Code
 *      workspace folder is a subdirectory of the repo (monorepo / package folder).
 * All git/fs access is injected, so the logic is unit-testable with fakes.
 */
import type { WorkspaceBaseline, BaselineHandle } from './edit-governor.js';

export interface GitBaselineDeps {
  /** Run `git -C cwd <args>`; resolves { ok, stdout } and NEVER rejects. */
  runGit: (cwd: string, args: string[]) => Promise<{ ok: boolean; stdout: string }>;
  /** Read a file's UTF-8 text, or undefined if missing / binary. */
  readText: (absPath: string) => Promise<string | undefined>;
  /** The workspace root (also the `git -C` dir). */
  cwd: () => string;
  /** Join the workspace root + a cwd-relative path into an absolute fs path. */
  toAbs: (cwd: string, rel: string) => string;
  /** Normalize an incoming edit path to a cwd-relative, forward-slash git path. */
  toRel: (cwd: string, path: string) => string;
}

export function createGitBaseline(deps: GitBaselineDeps): WorkspaceBaseline {
  // Untracked-but-existing files captured at snapshot (keyed by absolute path), so a
  // reject restores their pre-turn content rather than deleting them.
  let untracked = new Map<string, string>();

  return {
    available: async (cwd) => (await deps.runGit(cwd, ['rev-parse', '--is-inside-work-tree'])).ok,

    snapshot: async (cwd): Promise<BaselineHandle> => {
      const stash = await deps.runGit(cwd, ['stash', 'create']);
      // `stash create` returns a dangling commit of the tracked working tree without
      // touching it; empty output (clean tree) -> HEAD (working == HEAD for tracked files).
      const ref = stash.ok && stash.stdout.trim() !== '' ? stash.stdout.trim() : 'HEAD';
      untracked = new Map();
      const list = await deps.runGit(cwd, ['ls-files', '--others', '--exclude-standard']);
      if (list.ok) {
        for (const rel of list.stdout.split('\n').map((s) => s.trim()).filter((s) => s !== '')) {
          const abs = deps.toAbs(cwd, rel);
          const content = await deps.readText(abs);
          if (content !== undefined) untracked.set(abs, content);
        }
      }
      return { ref };
    },

    read: async (handle, path) => {
      const cwd = deps.cwd();
      const rel = deps.toRel(cwd, path);
      const res = await deps.runGit(cwd, ['show', `${handle.ref}:./${rel}`]);
      if (res.ok) return res.stdout; // tracked: exact pre-turn content
      // Not in the tree -> an untracked-but-existing file captured at snapshot, else
      // undefined (a genuinely new file the turn created -> reject removes it).
      return untracked.get(deps.toAbs(cwd, rel));
    },
  };
}
