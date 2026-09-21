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

export interface DaemonPaths {
  /** The installed daemon checkout — ~/.insrc/daemon (DAEMON_ROOT). */
  daemonRoot: string;
  /** The lifecycle control script — ~/.insrc/daemon/scripts/daemon-ctl.sh. */
  ctlScript: string;
  /** The compiled daemon entry — ~/.insrc/daemon/out/daemon/index.js (DAEMON_ENTRY). */
  daemonEntry: string;
  /** The installer bundled in the extension package (assets/insrc-daemon-install.sh). */
  bundledInstaller: string;
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
  };
}
