/** Finite dependency disposal only: no controller, service or install authority. */
import { existsSync } from 'node:fs';
import { lstat, readdir, rmdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { InstallationLocation } from './contracts.js';
import type { DependencyAttemptIdentity, OllamaPolicy } from './ollama-policy.js';
import { controlBinding } from './native.js';
import { privateOllamaDirectory } from './ollama-layout.js';
import { canonicalJson, digest } from './release-descriptor.js';
import { flushParents } from './durability.js';
import { dependencyPath, dependencyUncertain, readDependencyRecord, writeDependencyRecord } from './ollama-records.js';

// An unconfirmed resource may still be active. Keep its native lock reachable
// until process exit; GC must not make this cohort appear positively closed.
const uncertainHandles = new Set<object>();
export function retainUncertainOllamaHandle(handle: object): void { uncertainHandles.add(handle); }
export const disposedPath = (file: string) => file.replace(/\.json$/, '.disposed.json');
export const cleanupPath = (file: string) => file.replace(/\.json$/, '.cleanup.json');

export async function ensureOllamaRecord(location: InstallationLocation, handle: object, file: string, value: unknown): Promise<void> {
  if (!existsSync(file)) { writeDependencyRecord(location, handle, file, value); return; }
  const bytes = await readDependencyRecord(location, file);
  if (!bytes.equals(Buffer.from(canonicalJson(value)))) throw dependencyUncertain('Existing cleanup evidence differs from its exact attempt');
}

/** Validate the entire stage before deleting. Recheck every identity before its
 * unlink, bounded by caller deadline and retained native handle. */
export async function removeOwnedOllamaStage(location: InstallationLocation, identity: DependencyAttemptIdentity,
  policy: OllamaPolicy, current: () => void): Promise<void> {
  const stage = dependencyPath(location, identity.stageRelativePath);
  current(); if (!existsSync(stage)) return;
  await privateOllamaDirectory(stage); current();
  const entries: Array<{ path: string; dev: number; ino: number; directory: boolean }> = [];
  const scan = async (path: string, depth: number): Promise<void> => {
    current(); const info = await lstat(path); current();
    if (depth > 65 || entries.length >= policy.limits.files * 2 + 16 || info.isSymbolicLink()
      || (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))
      || (process.platform !== 'win32' && info.uid !== process.getuid?.())
      || (process.platform === 'win32' && !controlBinding().safePath(path, info.isDirectory(), info.isDirectory()))) {
      throw dependencyUncertain('Private dependency cleanup tree is not proven owned and bounded');
    }
    entries.push({ path, dev: info.dev, ino: info.ino, directory: info.isDirectory() });
    if (info.isDirectory()) for (const name of await readdir(path)) { current(); await scan(join(path, name), depth + 1); }
  };
  await scan(stage, 0);
  for (const entry of entries.reverse()) {
    current(); const info = await lstat(entry.path); current();
    if (info.dev !== entry.dev || info.ino !== entry.ino || info.isSymbolicLink()
      || info.isDirectory() !== entry.directory || (!entry.directory && (!info.isFile() || info.nlink !== 1))) {
      throw dependencyUncertain('Private dependency cleanup identity changed');
    }
    if (entry.directory) await rmdir(entry.path); else await unlink(entry.path);
    current();
  }
  flushParents(dirname(stage), location.home); current();
}

/** Caller has positively closed preparation (or explicitly retired a qualified
 * dead in-process cohort). This never touches published payloads or services. */
export async function disposeOllamaStage(location: InstallationLocation, identity: DependencyAttemptIdentity,
  policy: OllamaPolicy, handle: object, current: () => void, beforeRemoval?: () => Promise<void>): Promise<void> {
  const record = dependencyPath(location, identity.recordRelativePath), identitySha256 = digest(canonicalJson(identity));
  current(); await ensureOllamaRecord(location, handle, cleanupPath(record), { schemaVersion: 1, identitySha256, purpose: 'private-stage-disposal' }); current();
  if (beforeRemoval) { await beforeRemoval(); current(); }
  await removeOwnedOllamaStage(location, identity, policy, current); current();
  await ensureOllamaRecord(location, handle, disposedPath(record), { schemaVersion: 1, identitySha256, closed: true, stageRemoved: true }); current();
}
