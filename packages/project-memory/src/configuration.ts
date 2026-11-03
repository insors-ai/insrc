import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, stat, statfs } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { MemoryOptions } from './types.js';
import { assertPrivateFile } from './private-file.js';
import { MemoryError } from './errors.js';

export const LAYOUT_FILE = 'layout.json';
export const LAYOUT_PENDING = '.layout.pending';
export const OWNER_FILE = '.owner.lock';
export const LAYOUT_TEXT = '{"format":"insrc-project-memory","version":1}\n';
export interface RootIdentity { readonly path: string; readonly dev: bigint; readonly ino: bigint; }

export function errno(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
function invalid(message: string): never { throw new MemoryError('INVALID_REQUEST', message); }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }

/** Validation is deliberately pure; do not invoke supplied ports or inspect disk. */
export function validateOptions(input: unknown): MemoryOptions {
  try {
    if (!object(input)) invalid('Memory options are required.');
    const { dataDirectory, models, policy, logger, limits } = input;
    if (typeof dataDirectory !== 'string' || !dataDirectory.trim() || dataDirectory.includes('\0') || !isAbsolute(dataDirectory)) invalid('An explicit absolute memory directory is required.');
    if (!object(models) || typeof models.complete !== 'function' || typeof models.embed !== 'function' || typeof models.embeddingModel !== 'string' || !models.embeddingModel.trim() || !Number.isSafeInteger(models.embeddingDimension) || (models.embeddingDimension as number) < 1) invalid('Valid model interfaces and local embedding metadata are required.');
    if (!object(policy) || typeof policy.bind !== 'function' || typeof policy.admit !== 'function') invalid('A project policy is required.');
    if (!object(logger) || typeof logger.write !== 'function') invalid('A logger is required.');
    if (!object(limits)) invalid('Explicit memory limits are required.');
    const { maxEventBytes, maxPendingBytes, segmentBytes, modelTimeoutMs } = limits;
    if (![maxEventBytes, maxPendingBytes, segmentBytes, modelTimeoutMs].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n > 0)) invalid('Memory limits must be positive safe integers.');
    if ((maxEventBytes as number) > (segmentBytes as number) || (segmentBytes as number) > (maxPendingBytes as number) || (modelTimeoutMs as number) > 2_147_483_647) invalid('Memory limits are inconsistent.');
    // Snapshot scalar configuration; retain supplied port objects and their receiver.
    return Object.freeze({ dataDirectory, models, policy, logger, limits: Object.freeze({ maxEventBytes, maxPendingBytes, segmentBytes, modelTimeoutMs }) }) as unknown as MemoryOptions;
  } catch (error) {
    if (error instanceof MemoryError) throw error;
    invalid('Memory options could not be validated.');
  }
}

export function validateRuntime(platform: string = process.platform, version: string = process.versions.node): void {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!parts || Number(parts[1]) !== 22 || Number(parts[2]) < 22 || (Number(parts[2]) === 22 && Number(parts[3]) < 1)) invalid('Memory requires Node 22.22.1 or newer Node 22.');
  if (platform !== 'darwin' && platform !== 'linux') invalid('This memory host supports qualified macOS and Linux filesystems only.');
}

export function validateFilesystem(type: number, platform: string = process.platform): void {
  // Darwin statfs uses the qualified APFS VFS type number, not Linux magic values.
  // Linux ext-family magic is accepted only under the documented ext4 qualification.
  if (!((platform === 'darwin' && type === 26) || (platform === 'linux' && type === 0xef53))) invalid('An explicitly qualified local APFS or ext4 filesystem is required.');
}

/** Read-only preflight: missing roots are checked through their existing ancestor. */
async function validateNearestExistingFilesystem(path: string): Promise<void> {
  let ancestor = path;
  for (;;) {
    try { validateFilesystem((await statfs(ancestor)).type); return; }
    catch (error) {
      if (errno(error) !== 'ENOENT') throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
}

export async function assertRoot(root: RootIdentity): Promise<void> {
  const value = await lstat(root.path, { bigint: true });
  if (!value.isDirectory() || value.dev !== root.dev || value.ino !== root.ino || value.uid !== BigInt(process.getuid!()) || (value.mode & 0o077n) !== 0n) {
    throw new MemoryError('STORE_UNAVAILABLE', 'Memory directory identity or permissions changed.');
  }
}

async function metadata(path: string): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const value = await handle.stat();
    assertPrivateFile(value);
    if (value.size > 1024) invalid('Memory layout metadata is oversized.');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}

/** Read-only classification. Creation/recovery is forbidden until the guard owns it. */
export async function classifyLayout(root: RootIdentity): Promise<'new' | 'existing'> {
  await assertRoot(root);
  const names = await readdir(root.path);
  if (names.includes(LAYOUT_FILE)) {
    const text = await metadata(join(root.path, LAYOUT_FILE));
    if (text !== LAYOUT_TEXT) invalid('Memory layout version is unrecognized.');
    return 'existing';
  }
  if (names.some(name => name !== OWNER_FILE && name !== LAYOUT_PENDING)) invalid('A nonempty unrecognized memory directory cannot be adopted.');
  if (names.includes(LAYOUT_PENDING)) {
    const text = await metadata(join(root.path, LAYOUT_PENDING));
    if (!LAYOUT_TEXT.startsWith(text)) invalid('Interrupted layout metadata is unrecognized.');
  }
  return 'new';
}

export async function prepareRoot(options: MemoryOptions): Promise<RootIdentity> {
  validateRuntime();
  try {
    // Reject an unsupported creation target before mkdir. For a missing root,
    // this checks an ancestor, not the directory that will eventually be owned.
    await validateNearestExistingFilesystem(options.dataDirectory);
    await mkdir(options.dataDirectory, { recursive: true, mode: 0o700 });
    const path = await realpath(options.dataDirectory);
    // Re-read the actual canonical directory after creation/alias resolution.
    // Its filesystem must be qualified independently of the earlier ancestor;
    // never reuse a pre-mkdir type value as proof for this resolved target.
    validateFilesystem((await statfs(path)).type);
    const value = await stat(path, { bigint: true });
    const root = Object.freeze({ path, dev: value.dev, ino: value.ino });
    await assertRoot(root);
    await classifyLayout(root);
    return root;
  } catch (error) {
    if (error instanceof MemoryError) throw error;
    throw new MemoryError('STORE_UNAVAILABLE', 'Memory directory cannot be prepared.', true);
  }
}
