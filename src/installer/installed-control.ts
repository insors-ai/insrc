/** Bounded installed control checks; full application proof belongs to preparation. */
import { lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { InstallerError } from './contracts.js';
import type { ReleaseManifest } from './contracts.js';
import { BUNDLE_LIMITS, digest, parseApplicationInventory } from './release-descriptor.js';
import type { PayloadInventory } from './release-descriptor.js';
import { readBoundedFile } from './safe-zip.js';
import { assertLocalControlRoot } from './location.js';
import { controlBinding } from './native.js';

export async function readInstalledInventory(directory: string, expected: string, signal?: AbortSignal): Promise<PayloadInventory> {
  signal?.throwIfAborted();
  const bytes = await readBoundedFile(join(directory, 'inventory.json'), BUNDLE_LIMITS.inventoryBytes);
  const inventory = parseApplicationInventory(JSON.parse(bytes.toString('utf8')) as unknown);
  if (digest(bytes) !== expected) throw new InstallerError('candidate-conflict', 'Installed inventory differs from its bound receipt');
  signal?.throwIfAborted(); return inventory;
}
export async function verifyInstalledControl(directory: string, manifest: ReleaseManifest, inventory: PayloadInventory, signal?: AbortSignal): Promise<void> {
  const files = new Map(inventory.files.map(file => [file.path, file]));
  const names = new Set(['bootstrap.mjs', 'native/control.node', manifest.managerEntry, manifest.tuiEntry, manifest.daemonEntry,
    ...manifest.migrations.map(hook => hook.module)]);
  // These additional publisher-owned control inputs are checked when present.
  for (const name of ['package.json', 'out/installer/native/control.node', 'out/installer/manager-entry.js', 'out/installer/terminal-entry.js', 'out/bin/insrc-mcp.js']) if (files.has(name)) names.add(name);
  let total = 0;
  for (const name of names) {
    signal?.throwIfAborted(); const record = files.get(name);
    if (!record || record.bytes < 1 || record.bytes > 16 * 1024 ** 2 || (total += record.bytes) > 128 * 1024 ** 2) throw new InstallerError('candidate-conflict', 'Installed control entries are absent or exceed their byte bound');
    const file = join(directory, name);
    assertLocalControlRoot(dirname(file), process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== record.bytes
      || (process.platform !== 'win32' && ((stat.mode & 0o111) ? 0o755 : 0o644) !== record.mode)) throw new InstallerError('candidate-conflict', 'Installed control entry metadata differs');
    const bytes = await readBoundedFile(file, record.bytes);
    if (bytes.length !== record.bytes || digest(bytes) !== record.sha256) throw new InstallerError('candidate-conflict', 'Installed control entry digest differs');
    signal?.throwIfAborted();
  }
}
