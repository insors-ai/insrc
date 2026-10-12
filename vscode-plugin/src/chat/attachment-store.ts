/**
 * Story E2026101259da3204:S001 — the files a chat message carries.
 *
 * A vscode-free, deps-injected module. A pasted image or a picked document is COPIED into the
 * session's own directory (<root>/<sessionFileName(id)>/), named `<n>-<safe name>`; that file
 * name is the attachment's id. The directory is the only path handed to the CLI as readable,
 * so a document is never referenced in place. Refusals (too large, not an image, not a regular
 * file) throw {@link AttachmentRefused}, whose message is the sentence shown to the user.
 */

import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { errCode } from './async-util.js';
import { sessionFileName } from './session-output.js';

/** The largest pasted image or picked file a message may carry. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** How many attachments one message may carry. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
/** The image types a paste may carry. */
export const PASTE_IMAGE_MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export interface AttachmentRef {
  /** The stored file's name in the session's directory. */
  readonly id: string;
  /** The name the user knows the file by. */
  readonly name: string;
  readonly kind: 'image' | 'file';
  readonly size: number;
  /** Absolute path of the stored copy. */
  readonly path: string;
}

/** The fs surface the store uses. */
export interface AttachmentFs {
  mkdir(path: string): Promise<void>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  /** undefined when the path does not exist. */
  stat(path: string): Promise<{ readonly size: number; readonly isFile: boolean; readonly mtimeMs: number } | undefined>;
  /** Removes a file or a whole directory; succeeds when it is already gone. */
  rm(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
}

export const nodeAttachmentFs: AttachmentFs = {
  mkdir: async (p) => {
    await mkdir(p, { recursive: true });
  },
  writeFile: (p, data) => writeFile(p, data),
  copyFile: (from, to) => copyFile(from, to),
  stat: async (p) => {
    try {
      const s = await stat(p);
      return { size: s.size, isFile: s.isFile(), mtimeMs: s.mtimeMs };
    } catch (e) {
      if (errCode(e) === 'ENOENT') return undefined;
      throw e;
    }
  },
  rm: (p) => rm(p, { recursive: true, force: true }),
  readdir: (p) => readdir(p),
};

/** An attachment the store will not take; `message` is the sentence shown to the user. */
export class AttachmentRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentRefused';
  }
}

export interface AttachmentStoreDeps {
  readonly root: string;
  readonly fs?: AttachmentFs | undefined;
  readonly logger?: { warn(msg: string): void } | undefined;
  readonly now?: (() => number) | undefined;
}

export interface AttachmentStore {
  /** The directory holding a session's attachments (it may not exist yet). */
  dirOf(sessionId: string): string;
  addBytes(sessionId: string, input: { readonly name: string; readonly mime: string; readonly bytes: Uint8Array }): Promise<AttachmentRef>;
  addFile(sessionId: string, sourcePath: string): Promise<AttachmentRef>;
  remove(sessionId: string, attachmentId: string): Promise<void>;
  /** Deletes a session's attachments (its session was removed). */
  removeSession(sessionId: string): Promise<void>;
  /** Deletes the directories of sessions not in `keep` whose every file is older than `olderThanMs`. */
  sweep(opts: { readonly olderThanMs: number; readonly keep: ReadonlySet<string> }): Promise<void>;
}

const MIME_EXT: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const IMAGE_EXTS: ReadonlySet<string> = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const MAX_NAME = 100;
/** The shape of an id the store issued: a number, a dash, a safe name. */
const ID_SHAPE = /^\d+-[A-Za-z0-9._-]+$/;

const limitText = `${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`;

/** A name's A-Za-z0-9._- characters only, so it can never hold a path separator. */
const safeName = (name: string): string => {
  const kept = name.replace(/[^A-Za-z0-9._-]/g, '').slice(-MAX_NAME);
  return kept === '' ? 'file' : kept;
};

export function createAttachmentStore(deps: AttachmentStoreDeps): AttachmentStore {
  const fs = deps.fs ?? nodeAttachmentFs;
  const now = deps.now ?? Date.now;
  const log = deps.logger ?? { warn: () => {} };
  const dirOf = (sessionId: string): string => join(deps.root, sessionFileName(sessionId));
  /** The last number issued per session directory. */
  const issued = new Map<string, number>();

  /** The next free `<n>-<safe name>` in a session's directory, which exists when this resolves. */
  const nextPath = async (sessionId: string, name: string): Promise<{ id: string; path: string }> => {
    const dir = dirOf(sessionId);
    await fs.mkdir(dir);
    let highest = 0;
    if (!issued.has(dir)) {
      for (const f of await fs.readdir(dir)) {
        const n = Number.parseInt(f, 10);
        if (Number.isFinite(n) && n > highest) highest = n;
      }
    }
    // No await between reading and setting the counter, so two adds never share a number.
    const n = Math.max(issued.get(dir) ?? 0, highest) + 1;
    issued.set(dir, n);
    const id = `${n}-${safeName(name)}`;
    return { id, path: join(dir, id) };
  };

  /** Runs a write; a failure removes whatever part of the file was written. */
  const writing = async (path: string, write: () => Promise<void>): Promise<void> => {
    try {
      await write();
    } catch (e) {
      try {
        await fs.rm(path);
      } catch (rmErr) {
        log.warn(`[chat-attachments] could not remove partial file ${path}: ${String(rmErr)}`);
      }
      throw e;
    }
  };

  return {
    dirOf,

    async addBytes(sessionId, input): Promise<AttachmentRef> {
      const ext = MIME_EXT[input.mime];
      if (ext === undefined || !PASTE_IMAGE_MIMES.includes(input.mime)) {
        throw new AttachmentRefused('The pasted item is not a supported image (PNG, JPEG, GIF or WebP).');
      }
      const name = input.name.trim() === '' ? `pasted-image.${ext}` : input.name;
      if (input.bytes.length === 0) throw new AttachmentRefused(`${name} is empty.`);
      if (input.bytes.length > MAX_ATTACHMENT_BYTES) throw new AttachmentRefused(`${name} is larger than the ${limitText} limit.`);
      const { id, path } = await nextPath(sessionId, name);
      await writing(path, () => fs.writeFile(path, input.bytes));
      return { id, name, kind: 'image', size: input.bytes.length, path };
    },

    async addFile(sessionId, sourcePath): Promise<AttachmentRef> {
      const name = basename(sourcePath);
      let source: Awaited<ReturnType<AttachmentFs['stat']>>;
      try {
        source = await fs.stat(sourcePath);
      } catch (e) {
        log.warn(`[chat-attachments] could not read ${sourcePath}: ${String(e)}`);
        source = undefined;
      }
      if (source === undefined || !source.isFile) throw new AttachmentRefused(`${name} is not a readable file.`);
      if (source.size > MAX_ATTACHMENT_BYTES) throw new AttachmentRefused(`${name} is larger than the ${limitText} limit.`);
      const { id, path } = await nextPath(sessionId, name);
      await writing(path, () => fs.copyFile(sourcePath, path));
      const kind = IMAGE_EXTS.has(extname(name).toLowerCase()) ? 'image' : 'file';
      return { id, name, kind, size: source.size, path };
    },

    async remove(sessionId, attachmentId): Promise<void> {
      // Only a name this store could have issued; never a path built from a caller's string.
      if (typeof attachmentId !== 'string' || !ID_SHAPE.test(attachmentId)) return;
      await fs.rm(join(dirOf(sessionId), attachmentId));
    },

    async removeSession(sessionId): Promise<void> {
      const dir = dirOf(sessionId);
      issued.delete(dir);
      await fs.rm(dir);
    },

    async sweep(opts): Promise<void> {
      let names: string[];
      try {
        names = await fs.readdir(deps.root);
      } catch (e) {
        if (errCode(e) === 'ENOENT') return;
        throw e;
      }
      const keep = new Set([...opts.keep].map(sessionFileName));
      const cutoff = now() - opts.olderThanMs;
      for (const name of names) {
        if (keep.has(name)) continue;
        const dir = join(deps.root, name);
        const self = await fs.stat(dir);
        if (self === undefined || self.isFile) continue;
        const times: number[] = [self.mtimeMs];
        for (const f of await fs.readdir(dir)) times.push((await fs.stat(join(dir, f)))?.mtimeMs ?? 0);
        if (times.some((t) => t > cutoff)) continue; // written recently: maybe another window's chat
        issued.delete(dir);
        await fs.rm(dir);
      }
    },
  };
}
