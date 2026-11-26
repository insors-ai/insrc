/** Runtime-only formats. No application boot, storage, acquisition or IO. */
import type { RuntimeIdentity } from './contracts.js';

export const RUNTIME_PROFILE_VERSION = 'node22-minimal-v1' as const;
export const RUNTIME_LIMITS = Object.freeze({
  completionBytes: 64 * 1024,
  inventoryBytes: 16 * 1024 ** 2,
  entries: 32_768,
  entryBytes: 128 * 1024 ** 2,
  expandedBytes: 1024 ** 3,
  compressedBytes: 256 * 1024 ** 2,
  networkMs: 600_000,
  verificationMs: 120_000,
});

export interface RuntimeAsset { readonly url: string; readonly bytes: number; readonly sha256: string }
export interface RuntimeProfile {
  readonly profileVersion: typeof RUNTIME_PROFILE_VERSION;
  readonly archiveBytes: number;
  readonly nodeSha256: string;
  readonly inventorySha256: string;
  readonly entries: number;
  readonly expandedBytes: number;
}
export interface RuntimeInventoryFile {
  readonly path: string; readonly bytes: number; readonly sha256: string; readonly mode: number;
}
export interface RuntimeInventory { readonly schemaVersion: 1; readonly files: readonly RuntimeInventoryFile[] }
export interface RuntimeCompletion {
  readonly schemaVersion: 1; readonly identity: RuntimeIdentity;
  readonly profileVersion: typeof RUNTIME_PROFILE_VERSION;
  readonly inventorySha256: string; readonly npmVersion: string; readonly headersVersion: string;
}
export interface RuntimeStorePaths {
  readonly root: string; readonly directory: string; readonly inventory: string; readonly completion: string;
}
export interface ResolvedPrivateRuntime {
  readonly identity: RuntimeIdentity; readonly directory: string; readonly node: string;
  readonly npmCli: string; readonly headers: string; readonly nodeLib?: string | undefined;
  readonly inventorySha256: string;
}
/** Fixed key and code-unit path order: independent of locale and archive order.
 * Callers validate file records before serialization. This is not a verifier. */
export function runtimeInventoryJson(files: readonly RuntimeInventoryFile[]): string {
  return JSON.stringify({ schemaVersion: 1, files: [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    .map(({ path, bytes, sha256, mode }) => ({ path, bytes, sha256, mode })) });
}
