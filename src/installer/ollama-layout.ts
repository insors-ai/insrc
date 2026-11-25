/** Private S3 layout/inventory rules; S1 release ZIP acceptance is unchanged. */
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { dirname, join } from 'node:path';
import { InstallerError } from './contracts.js';
import { assertRelativeFile } from './location.js';
import { parseOllamaPolicy } from './ollama-policy.js';
import type { OllamaPolicy } from './ollama-policy.js';
import type { InventoryFile } from './release-descriptor.js';
import type { OllamaExtracted } from './ollama-tar.js';
import { controlBinding } from './native.js';
import { closeOwnedFile } from './owned-file.js';

export const archiveUnsafe = (message: string) => new InstallerError('archive-unsafe', message);
const fold = (path: string) => path.normalize('NFC').toLowerCase();
export function ollamaMemberPath(path: string): void {
  assertRelativeFile(path);
  if (path.split('/').length > 64 || ['inventory.json', '.ollama-receipt.json', '.release.json', '.dev-release.json'].includes(path)) throw archiveUnsafe('Reserved or excessive dependency path');
}
export async function privateOllamaDirectory(path: string, empty = false): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (typeof process.getuid === 'function' && info.uid !== process.getuid())
    || (process.platform !== 'win32' && (info.mode & 0o077)) || (empty && (await readdir(path)).length)) throw archiveUnsafe('Expected private owned dependency directory');
  if (process.platform === 'win32' && !controlBinding().safePath(path, true, true)) throw archiveUnsafe('Dependency directory is not private or is a reparse point');
  for (let current = dirname(path); ; current = dirname(current)) {
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform === 'win32' && !controlBinding().safePath(current, true, false))) throw archiveUnsafe('Linked dependency ancestor');
    if (dirname(current) === current) break;
  }
}
export async function ollamaParents(root: string, path: string, directory = false, signal?: AbortSignal): Promise<void> {
  let current = root; const parts = path.split('/');
  for (const part of directory ? parts : parts.slice(0, -1)) {
    signal?.throwIfAborted(); current = join(current, part);
    try { await mkdir(current, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const info = await lstat(current); if (!info.isDirectory() || info.isSymbolicLink() || (process.platform === 'win32' && !controlBinding().safePath(current, true, true))) throw archiveUnsafe('Non-directory dependency parent');
  }
}
export class OllamaArchivePaths {
  readonly components = new Map<string, { path: string; directory: boolean }>();
  readonly seen = new Set<string>();
  constructor(readonly maximum: number) {}
  add(path: string, directory: boolean): void {
    ollamaMemberPath(path); const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const name = parts.slice(0, i + 1).join('/'), key = fold(name), isDirectory = i < parts.length - 1 || directory;
      const before = this.components.get(key);
      if (before && (before.path !== name || before.directory !== isDirectory)) throw archiveUnsafe('Colliding dependency path components');
      this.components.set(key, { path: name, directory: isDirectory });
      if (this.components.size > this.maximum * 2) throw archiveUnsafe('Dependency path component limit exceeded');
    }
    const key = fold(path);
    if (this.seen.has(key) || this.seen.size >= this.maximum) throw archiveUnsafe('Duplicate/colliding or excessive dependency member');
    this.seen.add(key);
  }
}
async function hashFile(root: string, file: InventoryFile, signal?: AbortSignal): Promise<void> {
  ollamaMemberPath(file.path); const path = join(root, file.path), initial = await lstat(path);
  if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1 || initial.size !== file.bytes) throw archiveUnsafe('Dependency file differs from inventory');
  if (process.platform === 'win32' && !controlBinding().safePath(path, false, false)) throw archiveUnsafe('Dependency file is a reparse point');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== file.bytes || stat.ino !== initial.ino || stat.dev !== initial.dev
      || (process.platform !== 'win32' && ((stat.mode & 0o111) ? 0o755 : 0o644) !== file.mode)) throw archiveUnsafe('Dependency file changed during verification');
    // One bounded buffer, reused for the full digest. Larger reads avoid tens
    // of thousands of async file calls when reconciling official multi-GB trees.
    const hash = createHash('sha256'), buffer = Buffer.alloc(Math.min(1024 * 1024, Math.max(1, file.bytes))); let bytes = 0;
    while (true) {
      signal?.throwIfAborted(); const result = await handle.read(buffer, 0, buffer.length, null); if (!result.bytesRead) break;
      bytes += result.bytesRead; if (bytes > file.bytes) throw archiveUnsafe('Dependency file grew'); hash.update(buffer.subarray(0, result.bytesRead));
    }
    if (bytes !== file.bytes || hash.digest('hex') !== file.sha256) throw archiveUnsafe('Dependency file digest differs');
  } finally { await closeOwnedFile(handle); }
}
/** Complete tree verification under S3 limits, also used by immutable retries. */
export async function verifyOllamaTree(root: string, files: InventoryFile[], policyInput: OllamaPolicy,
  signal?: AbortSignal, options: { records?: boolean; layout?: boolean } = {}): Promise<void> {
  const policy = parseOllamaPolicy(policyInput); await privateOllamaDirectory(root);
  const paths = new OllamaArchivePaths(policy.limits.files), expected = new Map<string, InventoryFile>(); let total = 0, entries = 0;
  for (const file of files) {
    if (expected.size % 1024 === 0) { await yieldTurn(); signal?.throwIfAborted(); }
    paths.add(file.path, false);
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > policy.limits.fileBytes || ![0o644, 0o755].includes(file.mode)
      || !/^[a-f0-9]{64}$/.test(file.sha256) || (total += file.bytes) > policy.limits.expandedBytes) throw archiveUnsafe('Invalid dependency inventory bounds');
    expected.set(file.path, file);
  }
  const actual = new OllamaArchivePaths(policy.limits.files * 2);
  const visit = async (directory: string, prefix = ''): Promise<void> => {
    for (const name of await readdir(directory)) {
      signal?.throwIfAborted(); const path = prefix ? `${prefix}/${name}` : name, full = join(directory, name), info = await lstat(full);
      assertRelativeFile(path);
      if (++entries > policy.limits.files * 2 + 2 || path.split('/').length > 64 || info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) throw archiveUnsafe('Special or excessive dependency tree entry');
      if (info.isDirectory()) { if (process.platform === 'win32' && !controlBinding().safePath(full, true, true)) throw archiveUnsafe('Dependency directory is a reparse point'); actual.add(path, true); await visit(full, path); continue; }
      if (options.records && ['inventory.json', '.ollama-receipt.json'].includes(path)) {
        if (info.nlink !== 1 || (process.platform === 'win32' && !controlBinding().safePath(full, false, false))) throw archiveUnsafe('Linked dependency record'); continue;
      }
      actual.add(path, false);
      const file = expected.get(path); if (!file) throw archiveUnsafe('Unrecorded dependency file');
      await hashFile(root, file, signal); expected.delete(path);
    }
  };
  await visit(root); if (expected.size) throw archiveUnsafe('Required dependency files are missing');
  if (options.layout === false) return;
  const members = new Map(files.map(file => [file.path, file]));
  for (const path of policy.layout.requiredFiles) if (!members.has(path)) throw archiveUnsafe(`Required dependency layout member missing: ${path}`);
  const executable = members.get(policy.layout.executable)!;
  if (policy.target.os !== 'win32' && executable.mode !== 0o755) throw archiveUnsafe('Dependency CLI is not executable');
  await verifyOllamaExecutable(join(root, executable.path), policy);
  for (const path of policy.layout.requiredFiles) {
    if (/\.(?:dll|dylib)$|\.so(?:\.[0-9.]+)?$/i.test(path)
      || /(?:^|\/)([^/]+)\.framework\/(?:Versions\/[^/]+\/)?\1$/.test(path)) {
      await verifyOllamaExecutable(join(root, path), policy, true); signal?.throwIfAborted();
    }
  }
}

/** Inspect target binary headers; do not execute setup, GUI or foreign code. */
async function verifyOllamaExecutable(path: string, policy: OllamaPolicy, library = false): Promise<void> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    const read = async (offset: number, count: number) => {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset + count > stat.size) throw archiveUnsafe('Truncated dependency executable');
      const data = Buffer.alloc(count); let got = 0;
      while (got < count) { const part = await file.read(data, got, count - got, offset + got); if (!part.bytesRead) throw archiveUnsafe('Truncated executable header'); got += part.bytesRead; }
      return data;
    };
    const header = await read(0, 64), arm = policy.target.arch === 'arm64'; let valid = false;
    if (policy.target.os === 'linux') valid = header.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) && header[4] === 2 && header[5] === 1 && (library ? header.readUInt16LE(16) === 3 : [2, 3].includes(header.readUInt16LE(16))) && header.readUInt16LE(18) === (arm ? 183 : 62);
    if (policy.target.os === 'win32' && header.toString('ascii', 0, 2) === 'MZ') {
      const offset = header.readUInt32LE(60);
      if (offset >= 64 && offset <= 1024 * 1024) {
        const pe = await read(offset, 26), flags = pe.readUInt16LE(22);
        valid = pe.readUInt32LE() === 0x4550 && pe.readUInt16LE(4) === (arm ? 0xaa64 : 0x8664)
          && !!(flags & 2) && !!(flags & 0x2000) === library && pe.readUInt16LE(20) >= 112
          && offset + 24 + pe.readUInt16LE(20) <= stat.size && pe.readUInt16LE(24) === 0x20b;
      }
    }
    if (policy.target.os === 'darwin') {
      const cpu = arm ? 0x0100000c : 0x01000007;
      valid = header.readUInt32LE() === 0xfeedfacf && header.readUInt32LE(4) === cpu && (library ? [6, 8].includes(header.readUInt32LE(12)) : header.readUInt32LE(12) === 2);
      const magic = header.readUInt32BE();
      if (magic === 0xcafebabe || magic === 0xcafebabf) {
        const count = header.readUInt32BE(4), width = magic === 0xcafebabe ? 20 : 32;
        if (!count || count > 16) throw archiveUnsafe('Invalid universal binary slice count');
        const table = await read(8, count * width);
        for (let index = 0; index < count; index++) {
          const entry = table.subarray(index * width, (index + 1) * width);
          if (entry.readUInt32BE() !== cpu) continue;
          const offset = width === 20 ? BigInt(entry.readUInt32BE(8)) : entry.readBigUInt64BE(8);
          const size = width === 20 ? BigInt(entry.readUInt32BE(12)) : entry.readBigUInt64BE(16);
          if (offset < BigInt(8 + table.length) || size < 64n || offset + size > BigInt(stat.size)) throw archiveUnsafe('Invalid universal executable slice');
          const slice = await read(Number(offset), 64); valid = slice.readUInt32LE() === 0xfeedfacf && slice.readUInt32LE(4) === cpu && (library ? [6, 8].includes(slice.readUInt32LE(12)) : slice.readUInt32LE(12) === 2);
        }
      }
    }
    if (!valid) throw archiveUnsafe(`Dependency ${library ? 'library' : 'executable'} does not match target binary layout`);
  } finally { await closeOwnedFile(file); }
}

/** Resolve a bounded virtual file tree first, then copy regular bytes only. */
export async function materializeOllamaAliases(root: string, input: OllamaExtracted, policyInput: OllamaPolicy,
  signal?: AbortSignal): Promise<InventoryFile[]> {
  const policy = parseOllamaPolicy(policyInput); await privateOllamaDirectory(root);
  if (input.files.length + input.aliases.length > policy.limits.files) throw archiveUnsafe('Excessive archive file/alias count');
  await verifyOllamaTree(root, input.files, policy, signal, { layout: false });
  const aliases = new Map(input.aliases.map(alias => [alias.path, alias])), allowed = new Map(policy.layout.aliases.map(alias => [alias.path, alias]));
  if (aliases.size !== input.aliases.length || aliases.size !== allowed.size) throw archiveUnsafe('Archive alias membership is not qualified');
  for (const alias of aliases.values()) {
    ollamaMemberPath(alias.path); ollamaMemberPath(alias.target); const rule = allowed.get(alias.path);
    if (!rule || rule.target !== alias.target || (alias.kind === 'file' && rule.kind !== 'file')) throw archiveUnsafe('Unqualified archive alias target');
  }
  const files = new Map(input.files.map(file => [file.path, { record: file, source: file.path }]));
  const paths = new OllamaArchivePaths(policy.limits.files); let total = 0;
  for (const file of input.files) { paths.add(file.path, false); total += file.bytes; }
  const required = new Set(policy.layout.requiredFiles), resolved = new Set<string>();
  const resolve = async (name: string, visiting: Set<string>): Promise<void> => {
    signal?.throwIfAborted(); if (resolved.has(name)) return;
    if (visiting.has(name) || visiting.size >= 32) throw archiveUnsafe('Cyclic or excessive archive alias chain');
    const rule = allowed.get(name)!; const next = new Set([...visiting, name]);
    const targetParts = rule.target.split('/');
    for (let i = 1; i <= targetParts.length; i++) {
      const prefix = targetParts.slice(0, i).join('/'); if (aliases.has(prefix)) await resolve(prefix, next);
    }
    if (rule.kind === 'file') {
      const target = files.get(rule.target); if (!target) throw archiveUnsafe('Archive alias target is not a regular file');
      add({ ...target.record, path: name }, target.source);
    } else {
      // Directory aliases must describe their entire copied file closure explicitly.
      for (const alias of aliases.keys()) if (alias.startsWith(`${rule.target}/`)) await resolve(alias, next);
      const members: Array<[string, { record: InventoryFile; source: string }]> = []; let scanned = 0;
      for (const entry of files) {
        if (++scanned % 1024 === 0) { await yieldTurn(); signal?.throwIfAborted(); }
        if (entry[0].startsWith(`${rule.target}/`)) {
          if (members.length >= required.size) throw archiveUnsafe('Directory alias closure exceeds qualified layout'); members.push(entry);
        }
      }
      if (!members.length) throw archiveUnsafe('Archive directory alias has no qualified regular closure');
      for (const [path, target] of members) {
        const destination = name + path.slice(rule.target.length);
        if (!required.has(destination)) throw archiveUnsafe('Directory alias closure is not fully qualified');
        add({ ...target.record, path: destination }, target.source);
      }
    }
    resolved.add(name);
  };
  const add = (record: InventoryFile, source: string): void => {
    paths.add(record.path, false); total += record.bytes;
    if (total > policy.limits.expandedBytes) throw archiveUnsafe('Materialized aliases exceed expansion policy');
    files.set(record.path, { record, source });
  };
  for (const name of aliases.keys()) await resolve(name, new Set());
  // A file may not be nested under a pending alias or alias a source directory.
  const aliasNames = new Set([...aliases.keys()].map(fold)); let checked = 0;
  for (const file of input.files) {
    if (++checked % 1024 === 0) { await yieldTurn(); signal?.throwIfAborted(); }
    const parts = fold(file.path).split('/');
    for (let i = 1; i < parts.length; i++) if (aliasNames.has(parts.slice(0, i).join('/'))) throw archiveUnsafe('Archive alias is a file parent');
  }
  for (const [path, value] of files) {
    if (path === value.source) continue; signal?.throwIfAborted();
    await ollamaParents(root, path, false, signal);
    const source = await open(join(root, value.source), constants.O_RDONLY | constants.O_NOFOLLOW);
    let output: Awaited<ReturnType<typeof open>> | undefined;
    try {
      const info = await source.stat(); if (!info.isFile() || info.nlink !== 1 || info.size !== value.record.bytes) throw archiveUnsafe('Alias source changed');
      signal?.throwIfAborted(); output = await open(join(root, path), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, value.record.mode);
      const buffer = Buffer.alloc(65536); let total = 0;
      while (true) {
        signal?.throwIfAborted(); const part = await source.read(buffer, 0, buffer.length, null); if (!part.bytesRead) break;
        if ((total += part.bytesRead) > value.record.bytes) throw archiveUnsafe('Alias source grew');
        let offset = 0; while (offset < part.bytesRead) { signal?.throwIfAborted(); const result = await output.write(buffer, offset, part.bytesRead - offset); if (!result.bytesWritten) throw archiveUnsafe('Short alias write'); offset += result.bytesWritten; }
      }
      if (total !== value.record.bytes) throw archiveUnsafe('Alias source truncated');
    } finally { try { await closeOwnedFile(output); } finally { await closeOwnedFile(source); } }
  }
  const result = [...files.values()].map(value => value.record).sort((a, b) => a.path.localeCompare(b.path));
  await verifyOllamaTree(root, result, policy, signal); return result;
}
