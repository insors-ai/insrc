/**
 * Story E20260921ad0d45c9:S002 / t1+t3 — the DaemonPaths locator (sc6).
 *
 * The invocation targets sc6 spawns + the isInstalled() probe key off these
 * paths; injecting them keeps the daemon-ctl.sh / installer locations private to
 * s2 and lets tests point them at fixtures. Mirrors the JetBrains
 * DaemonScriptLocator + the DAEMON_ROOT / DAEMON_ENTRY constants in daemon-ctl.sh.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readManagedInstallation } from '../../../src/shared/managed-daemon-installation.js';
import { lstat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export interface DaemonPaths {
  /** The installed daemon checkout — ~/.insrc/daemon (DAEMON_ROOT). */
  daemonRoot: string;
  /** The lifecycle control script — ~/.insrc/daemon/scripts/daemon-ctl.sh. */
  ctlScript: string;
  /** The compiled daemon entry — ~/.insrc/daemon/out/daemon/index.js (DAEMON_ENTRY). */
  daemonEntry: string;
  /** The installer bundled in the extension package (assets/insrc-daemon-install.sh). */
  bundledInstaller: string;
  managedStateRoot?: string;
  sourceStateRoot?: string;
}

export async function selectedDaemonRoot(paths: DaemonPaths): Promise<string | undefined> {
  return (await sourceDaemonRoute(paths))?.launchRoot ??
    (paths.managedStateRoot === undefined ? undefined : (await readManagedInstallation(paths.managedStateRoot))?.releaseRoot);
}

export async function selectedControlRoot(paths: DaemonPaths): Promise<string | undefined> {
  return (await sourceDaemonRoute(paths))?.controlRoot ??
    (paths.managedStateRoot === undefined ? undefined : (await readManagedInstallation(paths.managedStateRoot))?.releaseRoot);
}

/** Keep the current wrapper: it resolves the verified prior even after rollback. */
export async function selectedMcpRoot(paths: DaemonPaths): Promise<string | undefined> {
  return selectedControlRoot(paths);
}

/** Ask the current packaged shell owner; no ambient Node or duplicate journal schema. */
export async function sourceDaemonRoute(paths: DaemonPaths): Promise<{ launchRoot: string; controlRoot: string } | undefined> {
  if (paths.sourceStateRoot === undefined) return undefined;
  try { await lstat(join(paths.sourceStateRoot, 'source-lifecycle/journal.json')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  const env = { ...process.env };
  delete env['NODE_OPTIONS']; delete env['NODE_PATH'];
  const { stdout } = await promisify(execFile)('/bin/bash', [paths.bundledInstaller, '--print-source-route', '--target', paths.daemonRoot],
    { env, timeout: 180_000, maxBuffer: 256 * 1024 });
  const route: unknown = JSON.parse(stdout);
  if (route === null) return undefined;
  if (!route || typeof route !== 'object' || !('launchRoot' in route) || !('controlRoot' in route) ||
      typeof route.launchRoot !== 'string' || typeof route.controlRoot !== 'string' ||
      !isAbsolute(route.launchRoot) || !isAbsolute(route.controlRoot)) throw new Error('Invalid authenticated source route');
  return { launchRoot: route.launchRoot, controlRoot: route.controlRoot };
}

/** The installed-daemon root, honoring INSRC_DAEMON_ROOT like daemon-ctl.sh does. */
function daemonRootDir(): string {
  const override = process.env.INSRC_DAEMON_ROOT;
  return override !== undefined && override !== '' ? override : join(homedir(), '.insrc', 'daemon');
}

/**
 * Build the default DaemonPaths. `extensionPath` is the VS Code extension install
 * dir (context.extensionPath) under which the bundled installer asset ships; when
 * omitted (tests), the installer path is still resolved but points nowhere real.
 */
export function defaultDaemonPaths(extensionPath: string): DaemonPaths {
  const daemonRoot = daemonRootDir();
  return {
    daemonRoot,
    ctlScript: join(daemonRoot, 'scripts', 'daemon-ctl.sh'),
    daemonEntry: join(daemonRoot, 'out', 'daemon', 'index.js'),
    bundledInstaller: join(extensionPath, 'assets', 'insrc-daemon-install.sh'),
    ...(process.platform === 'darwin' ? { managedStateRoot: join(homedir(), '.insrc') } : {}),
    ...(process.platform === 'linux' ? { sourceStateRoot: join(homedir(), '.insrc') } : {}),
  };
}
