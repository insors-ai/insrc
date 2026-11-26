/** Controlled application bytes with a real external runtime and native control.
 * This constructs test receipts, never a qualified production publication. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { InstallationLocation, Target } from '../contracts.js';
import type { PreparedCandidate } from '../bundle.js';
import { canonicalJson, digest, parseReleaseDescriptor } from '../release-descriptor.js';
import { collectTree, inventoryFor } from '../../../scripts/installer-payload.mjs';
import { devRuntimeFixture } from './_dev-runtime-fixture.js';

export async function installedControlFixture(location: InstallationLocation, target: Target, candidate: PreparedCandidate) {
  const { runtime } = await devRuntimeFixture(location.home, target, location.installationId);
  candidate.manifest = { ...candidate.manifest, runtime: runtime.identity };
  const native = readFileSync(new URL('../../../out/installer/native/control.node', import.meta.url));
  const defaults = new Map<string, Buffer | string>([
    ['bootstrap.mjs', '// controlled bootstrap'], ['manager.mjs', '// controlled manager'], ['native/control.node', native],
    ['out/installer/native/control.node', native], [candidate.manifest.daemonEntry, 'export {};'],
    [candidate.manifest.tuiEntry, 'export {};'], ['package.json', '{"type":"module"}'],
  ]);
  for (const [name, bytes] of defaults) {
    const path = join(candidate.directory, name); mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path)) writeFileSync(path, bytes, { mode: name.endsWith('.node') ? 0o755 : 0o644 });
  }
  const files = new Map([...collectTree(candidate.directory, candidate.directory, 'app')]
    .map(([name, value]) => [name.slice(4), value] as const)
    .filter(([name]) => !['inventory.json', '.release.json', '.dev-release.json'].includes(name)));
  const inventoryBytes = canonicalJson({ schemaVersion: 1, files: inventoryFor(files) });
  candidate.inventorySha256 = digest(inventoryBytes);
  const asset = (name: string) => ({ url: `https://fixture.invalid/${name}`, bytes: files.get(name)!.bytes.length, sha256: digest(files.get(name)!.bytes) });
  const descriptor = parseReleaseDescriptor({ schemaVersion: 2, publication: 'qualified', manifest: candidate.manifest,
    inventorySha256: candidate.inventorySha256, payload: { url: 'https://fixture.invalid/app.zip', bytes: 1, sha256: candidate.payloadSha256 },
    bootstrap: asset('bootstrap.mjs'), native: asset('native/control.node') }, { target });
  candidate.descriptorSha256 = digest(canonicalJson(descriptor));
  writeFileSync(join(candidate.directory, 'inventory.json'), inventoryBytes);
  writeFileSync(join(candidate.directory, '.release.json'), canonicalJson(descriptor), { mode: 0o600 });
  return runtime;
}
