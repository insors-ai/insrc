/**
 * Shared git operations — auto-commit helper.
 *
 * Stages specific files and commits with a generated message.
 * Does NOT push — local only.
 *
 * Used by Delegate, Tester, and any future agent that needs to commit.
 */

import { execFile } from 'node:child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommitResult {
  success: boolean;
  commitHash?: string | undefined;
  message: string;
  error?: string | undefined;
}

export interface CommitOpts {
  /** Files to stage (absolute paths). */
  files: string[];
  /** Short description used in the commit message. */
  title: string;
  /** Repository root path. */
  repoPath: string;
  /** Commit message prefix (e.g. 'feat(delegate)', 'test(tester)'). Default: 'feat'. */
  prefix?: string | undefined;
}

// ---------------------------------------------------------------------------
// Auto-commit
// ---------------------------------------------------------------------------

/**
 * Stage specific files and commit with a message derived from the title.
 *
 * @returns CommitResult with success status, hash, and message.
 */
export async function autoCommit(opts: CommitOpts): Promise<CommitResult> {
  const { files, title, repoPath, prefix = 'feat' } = opts;

  if (files.length === 0) {
    return { success: true, message: 'No files to commit' };
  }

  try {
    // Stage files
    await stageFiles(files, repoPath);

    // Generate commit message
    const message = `${prefix}: ${title}`;

    // Commit
    const hash = await gitCommit(message, repoPath);

    return {
      success: true,
      commitHash: hash,
      message,
    };
  } catch (err) {
    return {
      success: false,
      message: `Commit failed: ${err instanceof Error ? err.message : String(err)}`,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Stage files
// ---------------------------------------------------------------------------

/**
 * Stage specific files for commit.
 */
export async function stageFiles(
  files: string[],
  repoPath: string,
): Promise<void> {
  if (files.length === 0) return;

  await execCommand('git', ['add', ...files], repoPath);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run git commit and return the commit hash. */
async function gitCommit(message: string, cwd: string): Promise<string> {
  const output = await execCommand('git', ['commit', '-m', message], cwd);
  // Extract commit hash from output like "[branch abc1234] message"
  const match = output.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
  return match?.[1] ?? 'unknown';
}

/** Execute a command and return stdout. */
function execCommand(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${cmd} ${args.join(' ')} failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}
