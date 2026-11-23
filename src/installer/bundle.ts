import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { InstallerError, PRIVATE_NODE_VERSION } from './contracts.js';
import type { Delivery, Target, ReleaseManifest } from './contracts.js';
import { parseInstaller } from './schemas.js';
import { assertToken, assertLocalControlRoot } from './location.js';
import { controlBinding } from './native.js';
import { ControllerStore } from './controller-store.js';
import { BUNDLE_LIMITS, canonicalJson, digest, parseReleaseDescriptor } from './release-descriptor.js';
import type { PayloadInventory, ReleaseDescriptor } from './release-descriptor.js';
import { downloadJson, downloadVerifiedAsset } from './download.js';
import type { DownloadTransport } from './download.js';
import { extractSafeZip, readBoundedFile, verifyPublishedPayload } from './safe-zip.js';
import type { ExtractionLimits } from './safe-zip.js';
export interface PreparedCandidate {
  releaseId: string; directory: string; manifest: ReleaseManifest; descriptorSha256: string; payloadSha256: string; inventorySha256: string;
}
export interface PrepareOptions {
  target: Target; predecessorId?: string | undefined; signal?: AbortSignal | undefined;
  transport?: DownloadTransport | undefined; limits?: Partial<ExtractionLimits> | undefined;
  /** Internal trusted runtime root, not a wire request option. Bootstrap/installed
   * manager normally derives it from its verified absolute private executable. */
  runtimeDirectory?: string | undefined;
}
function local(directory: string): void { assertLocalControlRoot(directory, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined); }
async function exists(path: string): Promise<boolean> { try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }
async function fileDigest(file: string, expectedBytes: number, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(file)) { signal?.throwIfAborted(); const data = chunk as Buffer; bytes += data.length; if (bytes > expectedBytes) throw new InstallerError('runtime-invalid', 'Runtime file grew'); hash.update(data); }
  if (bytes !== expectedBytes) throw new InstallerError('runtime-invalid', 'Runtime file size differs'); return hash.digest('hex');
}
async function verifyRuntime(inventory: PayloadInventory, descriptor: ReleaseDescriptor, trustedRoot: string, signal?: AbortSignal): Promise<void> {
  const expected = new Map(inventory.files.filter(file => file.path.startsWith('tools/node/')).map(file => [file.path.slice(11), file]));
  let count = 0;
  async function visit(directory: string, prefix = ''): Promise<void> {
    for (const name of await readdir(directory)) {
      signal?.throwIfAborted();
      if (++count > BUNDLE_LIMITS.entries) throw new InstallerError('runtime-invalid', 'Trusted runtime exceeds bound');
      const path = join(directory, name), relative = prefix ? `${prefix}/${name}` : name, stat = await lstat(path);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new InstallerError('runtime-invalid', 'Trusted runtime has a special file');
      if (stat.isDirectory()) { await visit(path, relative); continue; }
      const record = expected.get(relative);
      if (!record || record.bytes !== stat.size || await fileDigest(path, record.bytes, signal) !== record.sha256) throw new InstallerError('runtime-invalid', 'Candidate runtime differs from verified bootstrap distribution');
      expected.delete(relative);
    }
  }
  await visit(trustedRoot); if (expected.size) throw new InstallerError('runtime-invalid', 'Candidate runtime has extra files');
  const npm = descriptor.manifest.target.os === 'win32' ? 'node_modules/npm/package.json' : 'lib/node_modules/npm/package.json';
  const manifest = JSON.parse((await readBoundedFile(join(trustedRoot, npm), 128 * 1024)).toString('utf8')) as { version?: string };
  if (manifest.version !== '10.9.4') throw new InstallerError('runtime-invalid', 'Verified runtime npm differs');
}
function currentRuntime(target: Target): string {
  if (process.version !== `v${PRIVATE_NODE_VERSION}` || process.platform !== target.os || process.arch !== target.arch) throw new InstallerError('runtime-invalid', 'Candidate preparation requires its exact verified private runtime');
  return target.os === 'win32' ? dirname(process.execPath) : dirname(dirname(process.execPath));
}
async function flushTree(directory: string): Promise<void> {
  if (process.platform === 'win32') return; // Native exclusive write-through publication owns Windows namespace durability.
  for (const name of await readdir(directory)) { const path = join(directory, name); if ((await lstat(path)).isDirectory()) await flushTree(path); }
  const fd = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY); try { await fd.sync(); } finally { await fd.close(); }
}
/** No selection/daemon/migration/application-data mutation occurs here. */
export async function prepareBundle(store: ControllerStore, input: unknown, options: PrepareOptions): Promise<PreparedCandidate> {
  store.assertHeld(); options.signal?.throwIfAborted();
  const current = store.inspect();
  if (current.kind === 'corrupt') throw new InstallerError('controller-corrupt', current.reason);
  const predecessor = current.kind === 'present' ? current.snapshot.installation.activeReleaseId : undefined;
  if (options.predecessorId !== undefined && options.predecessorId !== predecessor) throw new InstallerError('predecessor-mismatch', 'Controller predecessor differs from caller');
  const descriptor = parseReleaseDescriptor(input, { target: options.target, predecessorId: predecessor });
  const releaseId = descriptor.manifest.releaseId; assertToken(releaseId);
  const descriptorBytes = canonicalJson(descriptor), descriptorSha256 = digest(descriptorBytes), destination = join(store.location.home, 'releases', releaseId);
  const candidate = (directory: string): PreparedCandidate => Object.freeze({ releaseId, directory, manifest: descriptor.manifest, descriptorSha256, payloadSha256: descriptor.payload.sha256, inventorySha256: descriptor.inventorySha256 });
  const runtime = options.runtimeDirectory ?? currentRuntime(options.target); local(runtime); local(join(store.location.home, 'releases'));
  if (await exists(destination)) {
    local(destination);
    const receipt = await readBoundedFile(join(destination, '.release.json'), BUNDLE_LIMITS.descriptorBytes);
    if (receipt.toString('utf8') !== descriptorBytes) throw new InstallerError('candidate-conflict', 'Release identity already names different immutable bytes');
    const inventory = await verifyPublishedPayload(destination, descriptor, options.signal); await verifyRuntime(inventory, descriptor, runtime, options.signal); store.assertHeld(); options.signal?.throwIfAborted(); return candidate(destination);
  }
  const stagingRoot = join(store.location.home, 'install/staging'); local(stagingRoot);
  await mkdir(stagingRoot, { recursive: true, mode: 0o700 }); controlBinding().protect(stagingRoot);
  const stage = await mkdtemp(join(stagingRoot, `candidate-${randomUUID()}-`));
  try {
    const archive = join(stage, 'payload.zip'), payload = join(stage, 'payload'); await mkdir(payload, { mode: 0o700 });
    await downloadVerifiedAsset(descriptor.payload, archive, { signal: options.signal, transport: options.transport }); store.assertHeld();
    const inventory = await extractSafeZip(archive, payload, descriptor, { signal: options.signal, limits: options.limits });
    await verifyRuntime(inventory, descriptor, runtime, options.signal); options.signal?.throwIfAborted(); store.assertHeld();
    await writeFile(join(payload, '.release.json'), descriptorBytes, { flag: 'wx', mode: 0o600 });
    const receipt = await open(join(payload, '.release.json'), 'r+'); try { await receipt.sync(); } finally { await receipt.close(); }
    await flushTree(payload); store.assertHeld(); options.signal?.throwIfAborted();
    return candidate(store.publishCandidate(payload, releaseId));
  } finally { await rm(stage, { recursive: true, force: true }); }
}
/** Public GitHub release discovery only; no implicit source/dev fallback. */
export async function resolveBundleDelivery(delivery: Delivery, target: Target, options: { signal?: AbortSignal | undefined; transport?: DownloadTransport | undefined } = {}): Promise<unknown> {
  if (delivery.mode !== 'bundle' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(delivery.repository)) throw new InstallerError('delivery-invalid', 'Expected an explicit GitHub bundle delivery');
  parseInstaller('delivery', delivery); parseInstaller('target', target);
  assertToken(delivery.channel);
  const tag = delivery.channel === 'stable' ? 'latest' : `tags/${encodeURIComponent(delivery.channel)}`;
  const release = await downloadJson(`https://api.github.com/repos/${delivery.repository}/releases/${tag}`, options) as { draft?: unknown; assets?: unknown };
  if (!release || release.draft !== false || !Array.isArray(release.assets) || release.assets.length > 512) throw new InstallerError('manifest-invalid', 'Invalid GitHub release metadata');
  const suffix = `-${target.os}-${target.arch}.release.json`;
  const assets = release.assets.filter((asset: unknown): asset is { name: string; browser_download_url: string } => !!asset && typeof asset === 'object' && 'name' in asset && typeof asset.name === 'string' && asset.name.endsWith(suffix) && 'browser_download_url' in asset && typeof asset.browser_download_url === 'string');
  if (assets.length !== 1) throw new InstallerError('target-unavailable', 'No unique release descriptor for target');
  return downloadJson(assets[0]!.browser_download_url, options);
}
