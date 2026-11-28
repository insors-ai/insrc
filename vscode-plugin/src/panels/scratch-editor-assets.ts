/** Scratch-owned portable images. Native document saves remain normal VS Code
 * saves; these explicitly created asset files use exclusive no-follow writes. */
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PASTE_IMAGE_MIMES } from '../chat/attachment-store.js';
import { SCRATCH_IMAGE_BYTES } from './scratch-editor-protocol.js';

const extensions: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
export function scratchImageType(bytes: Uint8Array): string | undefined {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return undefined;
}
export async function readScratchImage(path: string): Promise<{ bytes: Uint8Array; mediaType: string }> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > SCRATCH_IMAGE_BYTES) throw new Error('Choose a regular PNG, JPEG, GIF or WebP image of at most 10 MiB.');
    const buffer = Buffer.alloc(SCRATCH_IMAGE_BYTES + 1); let length = 0;
    for (;;) { const { bytesRead } = await file.read(buffer, length, buffer.length - length, null); length += bytesRead; if (length > SCRATCH_IMAGE_BYTES) throw new Error('Image exceeds 10 MiB.'); if (!bytesRead) break; }
    const bytes = buffer.subarray(0, length), mediaType = scratchImageType(bytes);
    if (!mediaType) throw new Error('Unsupported image content.');
    return { bytes, mediaType };
  } finally { await file.close(); }
}
async function checkedDirectory(path: string): Promise<{ dev: number; ino: number }> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== resolve(path)) throw new Error('Scratchpad asset directory must be a real local directory.');
  return stat;
}
export async function storeScratchImage(documentPath: string, bytes: Uint8Array, mediaType: string, id = randomUUID): Promise<{ href: string; path: string }> {
  if (!PASTE_IMAGE_MIMES.includes(mediaType) || !bytes.length || bytes.length > SCRATCH_IMAGE_BYTES || scratchImageType(bytes) !== mediaType) throw new Error('Choose a matching PNG, JPEG, GIF or WebP image of at most 10 MiB.');
  const root = dirname(documentPath), assets = join(root, 'assets');
  const rootBefore = await checkedDirectory(root);
  try { await mkdir(assets, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  const before = await checkedDirectory(assets);
  const unchanged = async (): Promise<void> => {
    const [a, r] = await Promise.all([checkedDirectory(assets), checkedDirectory(root)]);
    if (a.dev !== before.dev || a.ino !== before.ino || r.dev !== rootBefore.dev || r.ino !== rootBefore.ino) throw new Error('Scratchpad asset directory changed; no reference was inserted.');
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const name = id(); if (!/^[A-Za-z0-9_-]{1,128}$/.test(name)) throw new Error('Invalid asset identity.');
    const href = `assets/${name}.${extensions[mediaType]!}`, path = join(root, href);
    await unchanged();
    let file;
    try { file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue; throw e; }
    try {
      await file.writeFile(bytes); await file.sync(); await unchanged();
      // Match recovery storage: Windows does not expose directory fsync here.
      if (process.platform !== 'win32') { const directory = await open(assets, constants.O_RDONLY); try { await directory.sync(); } finally { await directory.close(); } }
      return { href, path };
    } catch (e) {
      // Never unlink through a directory whose identity changed.
      try { await unchanged(); const owned = await file.stat(), named = await lstat(path); if (owned.ino === named.ino && owned.dev === named.dev) await unlink(path); } catch { /* retain an unreferenced file rather than delete an unknown path */ }
      throw e;
    } finally { await file.close(); }
  }
  throw new Error('Could not allocate an exclusive image name; retry.');
}
export async function resolveScratchImage(documentPath: string, href: string): Promise<string> {
  if (!/^assets\/[A-Za-z0-9_-]{1,128}\.(png|jpg|gif|webp)$/.test(href)) throw new Error('Only scratchpad-owned image paths may be displayed.');
  const root = dirname(documentPath); await checkedDirectory(root); await checkedDirectory(join(root, 'assets'));
  const path = join(root, href); await readScratchImage(path); return path;
}
/** Only explicit host-picked workspace files may become ordinary links. */
export async function scratchWorkspaceLink(documentPath: string, picked: string, workspaceRoot: string): Promise<string> {
  const actual = await realpath(picked), workspace = await realpath(workspaceRoot), rel = relative(workspace, actual);
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(rel) === rel || !(await lstat(actual)).isFile()) throw new Error('Choose a file inside an open workspace.');
  return relative(dirname(documentPath), actual).split(sep).map(segment => encodeURIComponent(segment)).join('/');
}
