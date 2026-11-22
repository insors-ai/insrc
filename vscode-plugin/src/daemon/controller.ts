/** IDE adapter: current packaged installer for updates; qualified owner for pure lifecycle. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { IpcClient, DaemonReachability } from '../../../src/shared/ipc-client.js';
import type { SubprocessRunner } from './subprocess.js';
import type { DaemonPaths } from './paths.js';
import { selectedDaemonRoot, selectedControlRoot } from './paths.js';

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
  /** Start/restart always skip legacy sync/npm/build. `plain` is retained for callers. */
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
    case 2: return 'verified local runtime or shell/git prerequisites are unavailable';
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
  const install = async (migrate = false): Promise<LifecycleResult> => {
    if (!existsSync(paths.bundledInstaller)) {
      return { ok: false, state: 'errored', message: 'the bundled insrc installer is missing — reinstall the extension' };
    }
    const { code, output } = await runner.run(['/bin/bash', paths.bundledInstaller, '-y', '--target', paths.daemonRoot,
      ...(migrate ? ['--migrate-runtime', '--no-start'] : [])]);
    return code === 0 ? { ok: true, state: await reachability() }
      : { ok: false, state: 'errored', message: output?.trim().slice(-8192) || installerReason(code) };
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

    install,

    async run(action: LifecycleAction, options?: LifecycleRunOptions | undefined): Promise<LifecycleResult> {
      if (action === 'update') return install(true);
      let managed: string | undefined;
      try { managed = await selectedControlRoot(paths); }
      catch (error) { return { ok: false, state: 'errored', message: String(error) }; }
      const script = managed === undefined ? paths.ctlScript : join(managed, 'scripts/daemon-ctl.sh');
      // Pure lifecycle retains the qualified owner and never runs legacy npm functions.
      if (!existsSync(script)) {
        return { ok: false, state: 'errored', message: 'insrc daemon is not installed — run Install first' };
      }
      const { code, output } = await runner.run(['/bin/bash', script, action, ...(action === 'start' || action === 'restart' ? PLAIN_FLAGS : [])],
        managed === undefined ? undefined : { env: { INSRC_DAEMON_ROOT: managed, INSRC_DAEMON_UPDATE_WAIT: '1' } });
      if (code === 0) {
        return { ok: true, state: await reachability() };
      }
      return { ok: false, state: 'errored', message: output?.trim().slice(-8192) || ctlReason(code) };
    },
  };
}
