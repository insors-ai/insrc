/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Installed-commit reader (Story S002 / sc2 — DaemonStatus.installedCommit).
 *
 * Reports the daemon's currently-installed source commit so a caller can judge
 * freshness by git-commit comparison (no version scheme, k1). The commit is the
 * `git rev-parse HEAD` of the daemon checkout root — the same tree daemon-ctl.sh
 * updates — read best-effort: any failure (a non-git or absent root, git off the
 * PATH, a non-zero exit) degrades to '' rather than throwing, so it can be called
 * inside daemon.status's never-throw contract.
 *
 * S002-internal: resolves DAEMON_ROOT with its own env-var+default so it does NOT
 * import S001's update-runner module — sc2 stays independent of sc1.
 */

import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where the installed daemon checkout lives. Resolved with the same
 *  env-var+default as cli/services/maintenance.ts DAEMON_ROOT, kept local so this
 *  module does not depend on S001's update-runner. */
export const DAEMON_ROOT = process.env['INSRC_DAEMON_ROOT'] ?? join(homedir(), '.insrc', 'daemon');

/** Injected git-exec seam: runs a command and returns its stdout. Default is an
 *  execFileSync-based runner; a test injects a fake so the reader is unit-testable
 *  without a real git process. */
export type ExecFn = (cmd: string, args: readonly string[]) => string;

const defaultExec: ExecFn = (cmd, args) =>
  execFileSync(cmd, args as string[], { encoding: 'utf8' });

/**
 * Read the daemon root's installed source commit — the trimmed `git rev-parse
 * HEAD` sha, or '' when it cannot be determined (non-git/missing root, git absent,
 * or any thrown exec). Never throws, so daemon.status's never-throw guarantee
 * holds. `root` defaults to DAEMON_ROOT.
 */
export function readInstalledCommit(root: string = DAEMON_ROOT, deps: { exec?: ExecFn } = {}): string {
  const exec = deps.exec ?? defaultExec;
  try {
    return exec('git', ['-C', root, 'rev-parse', 'HEAD']).trim();
  } catch {
    return ''; // non-git/missing root, git ENOENT, or non-zero exit → undeterminable
  }
}
