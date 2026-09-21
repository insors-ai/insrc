/**
 * Story E20260921ad0d45c9:S002 / t1 — the injectable subprocess seam (sc6).
 *
 * The daemon lifecycle controller never spawns directly: it goes through this
 * SubprocessRunner so command construction + exit-code mapping are unit-testable
 * with a fake (no real shell). Mirrors the JetBrains SubprocessRunner precedent.
 */
import { spawn } from 'node:child_process';

export interface SubprocessOptions {
  env?: Record<string, string> | undefined;
  cwd?: string | undefined;
}

export interface SubprocessRunner {
  /** Spawn `command` (argv) and resolve its exit code. Never rejects. */
  run(command: readonly string[], opts?: SubprocessOptions): Promise<{ code: number }>;
}

/** A non-zero sentinel used when the child cannot be spawned at all. */
const SPAWN_FAILURE_CODE = 127;

/**
 * The production runner over node:child_process. Resolves the child's exit code;
 * a spawn error (missing bash, ENOENT) resolves to a non-zero sentinel rather
 * than throwing, so the controller maps every failure to a LifecycleResult.
 */
export const defaultSubprocessRunner: SubprocessRunner = {
  run(command, opts) {
    return new Promise<{ code: number }>((resolve) => {
      const [cmd, ...args] = command;
      if (cmd === undefined) {
        resolve({ code: SPAWN_FAILURE_CODE });
        return;
      }
      const env = opts?.env !== undefined ? { ...process.env, ...opts.env } : process.env;
      const child = spawn(cmd, args, {
        env,
        ...(opts?.cwd !== undefined ? { cwd: opts.cwd } : {}),
        stdio: 'ignore',
      });
      let settled = false;
      const finish = (code: number): void => {
        if (settled) return;
        settled = true;
        resolve({ code });
      };
      child.on('error', () => finish(SPAWN_FAILURE_CODE));
      child.on('close', (code) => finish(code ?? SPAWN_FAILURE_CODE));
    });
  },
};
