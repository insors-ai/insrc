/**
 * Story E20261013b2e8109f:S001 — real git for the tests that need it: the git baseline over the
 * installed git binary, in a directory the test owns.
 */
import { execFile, execFileSync } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { createGitBaseline } from '../git-baseline.js';
import type { WorkspaceBaseline } from '../edit-governor.js';

export const HAS_GIT = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** Run git in `cwd` with a fixed identity; throws when git fails. */
export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { encoding: 'utf8' });

/** The production baseline over real git for `cwd`; its private index files go in `tmp`. */
export function baselineFor(cwd: string, tmp: string): WorkspaceBaseline {
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
