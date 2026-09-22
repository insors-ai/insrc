/**
 * Story E20260921ad0d45c9:S005 / t2 — the uninstall reversal (ac3).
 *
 * PLAIN NODE (no 'vscode' import): the entry VS Code runs via the package.json
 * `scripts["vscode:uninstall"]` hook. It reverses exactly what the extension
 * wired — for every supported host it removes the mcpServers.insrc key + the
 * insrc steering marker block via the shipped sc5 adapter.unwire() (reversible,
 * a no-op when the host was never wired), restoring each host's prior content.
 * One host's failure never aborts the sweep, and the process never exits
 * non-zero, so an uninstall always completes.
 *
 * NOTE: the hook only executes once S006 emits the bundle + packages the .vsix
 * (v1 is noEmit); the reversal logic here is unit-tested now over a fake fs.
 */
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

import { createHostAdapter } from './hosts/adapter.js';
import { HOST_SPECS } from './hosts/specs.js';
import { defaultHostFileSystem, type HostFileSystem } from './hosts/fs.js';
import type { HostEnv, HostSpec } from './hosts/types.js';

/** unwire ignores env/launchTarget entirely, so a no-op env + absent launch target are safe. */
const NOOP_ENV: HostEnv = { getExtension: () => false, appName: '', uriScheme: '' };

export interface UnwireSweepDeps {
  specs: readonly HostSpec[];
  fs: HostFileSystem;
}

/**
 * Unwire every HostSpec over the injected fs: build an adapter per spec and call
 * unwire() inside a per-host guard, counting failures. Returns a { unwired,
 * failed } tally and never throws.
 */
export async function unwireAllHosts(deps: UnwireSweepDeps): Promise<{ unwired: number; failed: number }> {
  let unwired = 0;
  let failed = 0;
  for (const spec of deps.specs) {
    const adapter = createHostAdapter(spec, { env: NOOP_ENV, fs: deps.fs, launchTarget: () => undefined });
    try {
      await adapter.unwire();
      unwired += 1;
    } catch {
      // A per-host HostFileAccessError (read-only / malformed) must not abort the sweep.
      failed += 1;
    }
  }
  return { unwired, failed };
}

/**
 * The vscode:uninstall entry: unwire every supported host over the real node fs.
 * Never throws / never exits non-zero (an uninstall must always complete).
 */
export async function runUninstall(): Promise<void> {
  try {
    await unwireAllHosts({ specs: HOST_SPECS, fs: defaultHostFileSystem });
  } catch {
    /* unreachable — unwireAllHosts never throws — but guard so uninstall never fails */
  }
}

/**
 * True only when this module is invoked directly as the uninstall script
 * (`node out/uninstall.js`), not when imported by a test. Both sides are
 * realpath-normalized so the check still fires when the extension install path
 * (or the OS temp dir) contains a symlink — e.g. macOS `/var` -> `/private/var`,
 * where Node realpaths `import.meta.url`'s `__filename` but leaves `argv[1]`
 * unresolved. A plain `===` would silently skip the reversal in that case.
 */
function isRunAsMain(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argv1);
  } catch {
    return false;
  }
}

if (isRunAsMain()) {
  void runUninstall();
}
