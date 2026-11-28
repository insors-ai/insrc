/** Controller-owned acquisition/publication; read-only launch resolution stays separate. */
import { lstat } from 'node:fs/promises';
import type { ControllerStore } from './controller-store.js';
import type { RuntimeIdentity } from './contracts.js';
import type { DownloadTransport } from './download.js';
import type { ResolvedPrivateRuntime } from './runtime-metadata.js';
import { privateRuntimePaths, runtimeStorePaths } from './runtime-policy.js';
import { discardRuntimeStage, stageRuntime } from './runtime-acquire.js';
import { parseInstaller } from './schemas.js';
import { InstallerError } from './contracts.js';
import { dirname } from 'node:path';
import { flushDirectory, flushParents } from './durability.js';

export async function ensurePrivateRuntime(store: ControllerStore, requested: RuntimeIdentity,
  options: { signal?: AbortSignal | undefined; transport?: DownloadTransport | undefined } = {}): Promise<ResolvedPrivateRuntime> {
  store.assertHeld(); options.signal?.throwIfAborted();
  const identity = structuredClone(parseInstaller('runtime', requested));
  const paths = runtimeStorePaths(store.location.home, identity);
  let missing = false, unfinished = false;
  try { const stat = await lstat(paths.root); unfinished = process.platform !== 'win32' && (stat.mode & 0o7777) === 0o700; }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw new InstallerError('runtime-invalid', `Cannot inspect shared Node runtime at "${paths.root}"; retain the entry and request operator assistance`, { cause });
    missing = true;
  }
  if (!missing) {
    // A corrupt existing entry is a retained conflict, never a download trigger.
    if (unfinished) {
      try { await store.finalizeRuntime(identity, options.signal); }
      catch (cause) {
        if (cause instanceof InstallerError && cause.code === 'resource-close-uncertain') throw cause;
        options.signal?.throwIfAborted();
        // Preserve the canonical resolver's exact unsupported/corruption guidance.
        await privateRuntimePaths(store.location, identity, options); throw cause;
      }
    }
    const runtime = await privateRuntimePaths(store.location, identity, options);
    store.assertHeld(); options.signal?.throwIfAborted();
    // A prior operation may have sealed the root but failed its namespace flush.
    // Reconfirm durability without changing modes/bytes or adopting its stage.
    try { flushDirectory(paths.root); flushParents(dirname(paths.root), store.location.home); }
    catch (cause) { throw new InstallerError('resource-close-uncertain', 'Shared Node runtime namespace durability is uncertain; retain the canonical entry', { cause }); }
    store.assertHeld(); options.signal?.throwIfAborted(); return runtime;
  }
  const stage = await stageRuntime(store, identity, options);
  // Any publication/durability uncertainty retains its stage and final entry.
  await store.publishRuntime(stage, options.signal);
  await discardRuntimeStage(stage, store);
  const runtime = await privateRuntimePaths(store.location, identity, options);
  store.assertHeld(); return runtime;
}
