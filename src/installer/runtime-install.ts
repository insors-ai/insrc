/** Controller-owned acquisition/publication; read-only launch resolution stays separate. */
import { lstat } from 'node:fs/promises';
import type { ControllerStore } from './controller-store.js';
import type { RuntimeIdentity } from './contracts.js';
import type { DownloadTransport } from './download.js';
import type { ResolvedPrivateRuntime } from './runtime-metadata.js';
import { privateRuntimePaths, runtimeStorePaths } from './runtime-policy.js';
import { discardRuntimeStage, stageRuntime } from './runtime-acquire.js';
import { parseInstaller } from './schemas.js';

export async function ensurePrivateRuntime(store: ControllerStore, requested: RuntimeIdentity,
  options: { signal?: AbortSignal | undefined; transport?: DownloadTransport | undefined } = {}): Promise<ResolvedPrivateRuntime> {
  store.assertHeld(); options.signal?.throwIfAborted();
  const identity = structuredClone(parseInstaller('runtime', requested));
  const paths = runtimeStorePaths(store.location.home, identity);
  let missing = false;
  try { await lstat(paths.root); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; missing = true; }
  if (!missing) {
    // A corrupt existing entry is a retained conflict, never a download trigger.
    const runtime = await privateRuntimePaths(store.location, identity, options);
    store.assertHeld(); return runtime;
  }
  const stage = await stageRuntime(store, identity, options);
  // Any publication/durability uncertainty retains its stage and final entry.
  await store.publishRuntime(stage, options.signal);
  await discardRuntimeStage(stage, store);
  const runtime = await privateRuntimePaths(store.location, identity, options);
  store.assertHeld(); return runtime;
}
