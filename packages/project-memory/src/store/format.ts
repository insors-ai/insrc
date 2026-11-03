import { constants } from 'node:fs';
import { open, lstat, readdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import type { DirectoryOwnership } from '../ownership.js';
import { assertPrivateFile } from '../private-file.js';
import { errno, LAYOUT_FILE, LAYOUT_PENDING, LAYOUT_TEXT, OWNER_FILE } from '../configuration.js';
import { MemoryError } from '../errors.js';
import { snapshotJson } from '../queue/codec.js';
import { shape } from '../queue/shape.js';
import { requireProfile } from './embedding-profile.js';
import type { EmbeddingProfile } from './types.js';

export const STORE_FORMAT = 'store-format.json';
export const STORE_PENDING = 'store-format.next';
export const STORE_DIRECTORY = 'memory.lance';
export interface StoreFormat {
  readonly format: 'insrc-project-memory-store'; readonly version: 1; readonly storeId: string;
  readonly embeddingModel: string; readonly embeddingDimension: number; readonly normalizationVersion: string;
  readonly state: 'initializing' | 'ready';
}
function unavailable(): never { throw new MemoryError('NOT_READY', 'Memory store initialization evidence is unavailable or unsafe.'); }
export function formatText(marker: StoreFormat): string { return snapshotJson(marker, 4096).text + '\n'; }
/** Bounded descriptor reads, including under concurrent file growth. */
async function readPrivate(path: string, owner: DirectoryOwnership): Promise<string> {
  await owner.assertOwned();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    assertPrivateFile(await file.stat());
    const descriptor = await file.stat({ bigint: true }), current = await lstat(path, { bigint: true });
    if (descriptor.dev !== current.dev || descriptor.ino !== current.ino) unavailable();
    const bytes = Buffer.alloc(4097); let offset = 0;
    while (offset < bytes.length) { const result = await file.read(bytes, offset, bytes.length - offset, offset); if (!result.bytesRead) break; offset += result.bytesRead; }
    if (offset > 4096) unavailable();
    await owner.assertOwned();
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, offset));
  } finally { await file.close(); }
}
export function parseFormat(text: string, profile: EmbeddingProfile): StoreFormat {
  let data: unknown; try { data = JSON.parse(text); } catch { unavailable(); }
  const value = snapshotJson(data, 4096).value;
  shape(unavailable, value, ['format', 'version', 'storeId', 'embeddingModel', 'embeddingDimension', 'normalizationVersion', 'state']);
  if (value.format !== 'insrc-project-memory-store' || value.version !== 1) throw new MemoryError('UNSUPPORTED_VERSION', 'Unsupported memory store format.');
  if (typeof value.storeId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.storeId) || !['initializing', 'ready'].includes(value.state as string)) unavailable();
  requireProfile({ model: value.embeddingModel, dimension: value.embeddingDimension, normalizationVersion: value.normalizationVersion }, profile);
  if (snapshotJson(value, 4096).text + '\n' !== text) unavailable();
  return value as unknown as StoreFormat;
}
async function syncDirectory(owner: DirectoryOwnership): Promise<void> {
  await owner.assertOwned();
  const before = await lstat(owner.directory, { bigint: true });
  const file = await open(owner.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const held = await file.stat({ bigint: true });
    if (before.dev !== held.dev || before.ino !== held.ino) unavailable();
    await file.sync(); await owner.assertOwned();
  } finally { await file.close(); }
}
export async function writeFormat(owner: DirectoryOwnership, marker: StoreFormat): Promise<void> {
  await owner.assertOwned();
  const target = join(owner.directory, STORE_PENDING);
  // Only a recognized same-instance interrupted write may be replaced.
  try {
    const previous = await readPrivate(target, owner);
    if (![formatText({ ...marker, state: 'initializing' }), formatText({ ...marker, state: 'ready' })].some(text => text.startsWith(previous))) unavailable();
  } catch (error) { if (errno(error) !== 'ENOENT') throw error; }
  const file = await open(target, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
  try {
    assertPrivateFile(await file.stat());
    const held = await file.stat({ bigint: true }), current = await lstat(target, { bigint: true });
    if (held.dev !== current.dev || held.ino !== current.ino) unavailable();
    await file.truncate(0);
    const bytes = Buffer.from(formatText(marker)); let offset = 0;
    while (offset < bytes.length) { const result = await file.write(bytes, offset, bytes.length - offset, offset); if (!result.bytesWritten) unavailable(); offset += result.bytesWritten; }
    await file.sync();
  } finally { await file.close(); }
  await owner.assertOwned();
  await rename(target, join(owner.directory, STORE_FORMAT));
  await syncDirectory(owner);
}
/** Read-only classification first: never adopt queue-only or unknown contents. */
export async function loadFormat(owner: DirectoryOwnership, profile: EmbeddingProfile): Promise<StoreFormat> {
  await owner.assertOwned();
  const names = await readdir(owner.directory);
  const allowed = new Set([LAYOUT_FILE, LAYOUT_PENDING, OWNER_FILE, STORE_FORMAT, STORE_PENDING, STORE_DIRECTORY, 'queue']);
  if (names.some(name => !allowed.has(name))) unavailable();
  if (names.includes(LAYOUT_PENDING) && !LAYOUT_TEXT.startsWith(await readPrivate(join(owner.directory, LAYOUT_PENDING), owner))) unavailable();
  if (names.includes(STORE_FORMAT)) {
    const marker = parseFormat(await readPrivate(join(owner.directory, STORE_FORMAT), owner), profile);
    if (marker.state === 'initializing' && names.includes('queue')) unavailable();
    if (names.includes(STORE_PENDING)) {
      const pending = await readPrivate(join(owner.directory, STORE_PENDING), owner);
      if (![formatText({ ...marker, state: 'initializing' }), formatText({ ...marker, state: 'ready' })].some(text => text.startsWith(pending))) unavailable();
    }
    return marker;
  }
  if (names.includes('queue') || names.includes(STORE_DIRECTORY)) unavailable();
  if (names.includes(STORE_PENDING)) {
    const marker = parseFormat(await readPrivate(join(owner.directory, STORE_PENDING), owner), profile);
    if (marker.state !== 'initializing') unavailable();
    await writeFormat(owner, marker); return marker;
  }
  const marker: StoreFormat = Object.freeze({ format: 'insrc-project-memory-store', version: 1, storeId: randomUUID(), embeddingModel: profile.model, embeddingDimension: profile.dimension, normalizationVersion: profile.normalizationVersion, state: 'initializing' });
  await writeFormat(owner, marker); return marker;
}
