/**
 * Story E20260921ad0d45c9:S002 / t1 — sc6 DaemonLifecycleController.
 *
 * Carries out start/stop/restart/update through the daemon's OWN scripts/daemon-ctl.sh
 * and provisions the daemon (on consent, gated by the caller) from the bundled
 * installer — reproducing none of the scripts' logic (lc2/k5). The resulting
 * LifecycleResult.state is the TRUE post-action reachability, re-probed via the
 * shared sc1 client (correct even for `update`, which does not start the daemon).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { IpcClient, DaemonReachability } from '../../../src/shared/ipc-client.js';
import type { SubprocessRunner } from './subprocess.js';
import type { DaemonPaths } from './paths.js';
import { selectedDaemonRoot } from './paths.js';

export type LifecycleAction = 'start' | 'stop' | 'restart' | 'update';

export interface LifecycleRunOptions {
  plain?: boolean | undefined;
}

/** daemon-ctl.sh flags that make a start spawn the built daemon without updating it. */
const PLAIN_FLAGS = ['--skip-sync', '--skip-install', '--skip-build'] as const;

export interface LifecycleResult {
  ok: boolean;
  state: 'running' | 'stopped' | 'errored';
  message?: string;
}

export interface DaemonLifecycleController {
  /** true iff the built daemon entry exists. Pure fs check; never throws. */
  isInstalled(): Promise<boolean>;
  /** Provision the daemon from the bundled installer (caller must have consent). */
  install(): Promise<LifecycleResult>;
  /**
   * Run a lifecycle action through daemon-ctl.sh. `plain` adds --skip-sync, --skip-install and
   * --skip-build, so a start only spawns the daemon that is already built (no pull, install or
   * build); without it the command is exactly what it always was.
   */
  run(action: LifecycleAction, options?: LifecycleRunOptions | undefined): Promise<LifecycleResult>;
}

/** daemon-ctl.sh's documented exit codes → a user-facing reason. */
function ctlReason(code: number): string {
  switch (code) {
    case 1: return 'insrc daemon control: usage error';
    case 2: return 'the insrc daemon is not a git checkout (reinstall may be needed)';
    case 3: return 'the daemon checkout has uncommitted or diverged changes';
    case 4: return 'the daemon git / npm / build / start step failed';
    default: return `daemon-ctl.sh failed (exit ${code})`;
  }
}

/** insrc-daemon-install.sh's documented exit codes → a user-facing reason. */
function installerReason(code: number): string {
  switch (code) {
    case 1: return 'insrc daemon install: usage error or aborted';
    case 2: return 'prerequisites missing: Node.js >= 20 and git are required';
    default: return `the insrc daemon installer failed (exit ${code})`;
  }
}

export interface ControllerDeps {
  runner: SubprocessRunner;
  paths: DaemonPaths;
  client: IpcClient;
}

/**
 * Build the sc6 controller over an injected subprocess runner, path locator, and
 * shared daemon client. Every method resolves a LifecycleResult and never throws.
 */
export function createDaemonLifecycleController(deps: ControllerDeps): DaemonLifecycleController {
  const { runner, paths, client } = deps;

  const reachability = async (): Promise<DaemonReachability> => client.reachability();
  const install = async (existing = false): Promise<LifecycleResult> => {
    if (!existsSync(paths.bundledInstaller)) {
      return { ok: false, state: 'errored', message: 'the bundled insrc installer is missing — reinstall the extension' };
    }
    const { code } = await runner.run(['bash', paths.bundledInstaller, '-y',
      ...(existing || paths.managedStateRoot !== undefined ? ['--target', paths.daemonRoot] : [])]);
    return code === 0 ? { ok: true, state: await reachability() }
      : { ok: false, state: 'errored', message: installerReason(code) };
  };

  return {
    async isInstalled(): Promise<boolean> {
      try {
        const root = await selectedDaemonRoot(paths);
        return existsSync(root === undefined ? paths.daemonEntry : join(root, 'out/daemon/index.js'));
      } catch {
        return false;
      }
    },

    install: () => install(),

    async run(action: LifecycleAction, options?: LifecycleRunOptions | undefined): Promise<LifecycleResult> {
      let managed: string | undefined;
      try { managed = await selectedDaemonRoot(paths); }
      catch (error) { return { ok: false, state: 'errored', message: String(error) }; }
      const script = managed === undefined ? paths.ctlScript : join(managed, 'scripts/daemon-ctl.sh');
      if (action === 'update' && paths.managedStateRoot !== undefined && managed === undefined
        && (existsSync(paths.daemonEntry) || existsSync(paths.ctlScript))) return install(true);
      if (!existsSync(script)) {
        return { ok: false, state: 'errored', message: 'insrc daemon is not installed — run Install first' };
      }
      const { code } = await runner.run(['bash', script, action, ...(options?.plain === true ? PLAIN_FLAGS : [])],
        managed === undefined ? undefined : { env: { INSRC_DAEMON_ROOT: managed, INSRC_DAEMON_UPDATE_WAIT: '1' } });
      if (code === 0) {
        return { ok: true, state: await reachability() };
      }
      return { ok: false, state: 'errored', message: ctlReason(code) };
    },
  };
}
