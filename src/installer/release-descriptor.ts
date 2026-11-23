import { Ajv } from 'ajv';
import { createHash } from 'node:crypto';
import { InstallerError } from './contracts.js';
import type { ReleaseManifest, Target } from './contracts.js';
import { installerSchemas, parseReleaseManifest } from './schemas.js';
import { assertRelativeFile } from './location.js';
import { runtimeArchive } from './runtime-policy.js';
export interface ReleaseAsset { url: string; bytes: number; sha256: string }
export interface InventoryFile { path: string; bytes: number; sha256: string; mode: number }
export interface PayloadInventory { schemaVersion: 1; files: InventoryFile[] }
export interface ReleaseDescriptor {
  schemaVersion: 1; publication: 'qualified'; manifest: ReleaseManifest; inventorySha256: string;
  payload: ReleaseAsset; bootstrap: ReleaseAsset; native: ReleaseAsset;
  runtimeArchive: { path: string; sha256: string; bytes: number };
}
export const BUNDLE_LIMITS = Object.freeze({ compressed: 2 * 1024 ** 3, expanded: 4 * 1024 ** 3, entryBytes: 1024 ** 3, entries: 50_000, ratio: 2_000, inventoryBytes: 32 * 1024 ** 2, descriptorBytes: 2 * 1024 ** 2 });
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' }, bytes = { type: 'integer', minimum: 0, maximum: BUNDLE_LIMITS.compressed };
const object = (properties: Record<string, object>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const path = { type: 'string', minLength: 1, maxLength: 1024 };
const asset = object({ url: { type: 'string', minLength: 1, maxLength: 4096 }, bytes: { ...bytes, minimum: 1 }, sha256: hash });
const ajv = new Ajv({ strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const descriptorValidator = ajv.compile<ReleaseDescriptor>(object({ schemaVersion: { const: 1 }, publication: { const: 'qualified' }, manifest: installerSchemas.manifest, inventorySha256: hash, payload: asset, bootstrap: asset, native: asset, runtimeArchive: object({ path, sha256: hash, bytes }) }));
const inventoryValidator = ajv.compile<PayloadInventory>(object({ schemaVersion: { const: 1 }, files: { type: 'array', maxItems: BUNDLE_LIMITS.entries, items: object({ path, bytes: { type: 'integer', minimum: 0, maximum: BUNDLE_LIMITS.entryBytes }, sha256: hash, mode: { enum: [0o644, 0o755] } }) } }));
export function httpsUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new InstallerError('download-invalid', 'Invalid release URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || /[\u0000-\u0020\u007f]/.test(value)) throw new InstallerError('download-invalid', 'Release URLs must be HTTPS without credentials or fragments');
  return url;
}
export function digest(bytes: string | Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
export function canonicalJson(input: unknown): string {
  function order(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(order);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, order(item)]));
    return value;
  }
  return JSON.stringify(order(input));
}
export function parseReleaseDescriptor(input: unknown, expected: { target: Target; predecessorId?: string | undefined }): ReleaseDescriptor {
  if (Buffer.byteLength(JSON.stringify(input)) > BUNDLE_LIMITS.descriptorBytes || !descriptorValidator(input)) throw new InstallerError('manifest-invalid', 'Invalid or unqualified release descriptor');
  const value = structuredClone(input);
  parseReleaseManifest(value.manifest, expected);
  for (const asset of [value.payload, value.bootstrap, value.native]) httpsUrl(asset.url);
  if (value.payload.bytes === 0 || value.payload.sha256 !== value.manifest.payloadSha256) throw new InstallerError('manifest-invalid', 'Payload identities differ');
  assertRelativeFile(value.runtimeArchive.path);
  if (value.manifest.runtime.sha256 !== runtimeArchive(expected.target).sha256 || value.runtimeArchive.sha256 !== value.manifest.runtime.sha256) throw new InstallerError('runtime-invalid', 'Runtime differs from pinned official target');
  function freeze(record: unknown): void { if (record && typeof record === 'object') { for (const item of Object.values(record)) freeze(item); Object.freeze(record); } }
  freeze(value); return value;
}
export function parseInventory(input: unknown): PayloadInventory {
  if (!inventoryValidator(input)) throw new InstallerError('archive-unsafe', 'Invalid payload inventory');
  const value = input, paths = new Set<string>();
  for (const file of value.files) {
    assertRelativeFile(file.path); const folded = file.path.normalize('NFC').toLowerCase();
    if (paths.has(folded) || file.path === 'inventory.json' || file.path === '.release.json') throw new InstallerError('archive-unsafe', 'Duplicate, reserved or colliding inventory path');
    paths.add(folded);
  }
  return value;
}
