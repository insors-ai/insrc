/** Runtime-only read lane: no acquisition, controller ownership or application imports. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation, RuntimeIdentity } from './contracts.js';
import { assertLocalControlRoot, assertRelativeFile, normalizeHome } from './location.js';
import { controlBinding } from './native.js';
import { closeOwnedFile } from './owned-file.js';
import { parseInstaller } from './schemas.js';
import { runtimePolicy, runtimeProfile, runtimeStorePaths } from './runtime-policy.js';
import { RUNTIME_LIMITS, RUNTIME_PROFILE_VERSION, runtimeCompletionJson, runtimeInventoryJson } from './runtime-metadata.js';
import type { ResolvedPrivateRuntime, RuntimeInventoryFile, RuntimeProtection } from './runtime-metadata.js';

const invalid = (message: string): InstallerError => new InstallerError('runtime-invalid', message);
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
function unchanged(before: Stats, after: Stats): boolean {
  return before.dev === after.dev && before.ino === after.ino && before.mode === after.mode && before.nlink === after.nlink
    && before.uid === after.uid && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}
function owned(stat: Stats, directory: boolean, privateOwner: boolean): boolean {
  return (directory ? stat.isDirectory() : stat.isFile() && stat.nlink === 1) && !stat.isSymbolicLink()
    && (process.platform === 'win32' || (stat.uid === process.getuid?.() && (stat.mode & (privateOwner ? 0o077 : 0o022)) === 0 && (stat.mode & 0o7000) === 0));
}
async function admitted(path: string, directory: boolean, privateOwner: boolean, signal: AbortSignal): Promise<Stats> {
  signal.throwIfAborted(); const stat = await lstat(path); signal.throwIfAborted();
  if (!owned(stat, directory, privateOwner) || (process.platform === 'win32' && !controlBinding().safePath(path, directory, true))) {
    throw invalid('Runtime path must be an owned regular non-link file or directory');
  }
  return stat;
}
/** Inspect the same open file before/after bounded reading; never reopen by a stream path. */
async function readChecked(path: string, maximum: number, signal: AbortSignal,
  expected: RuntimeInventoryFile | undefined, capture: boolean, protection: RuntimeProtection): Promise<{ bytes?: Buffer; hash: string }> {
  const before = await admitted(path, false, !expected, signal);
  const mode = expected ? (protection === 'source-stage' ? expected.mode : expected.mode & ~0o222)
    : protection === 'source-stage' ? 0o600 : 0o400;
  if (before.size > maximum || (expected && before.size !== expected.bytes)) throw invalid('Runtime file size differs');
  if (process.platform !== 'win32' && (before.mode & 0o777) !== mode) throw invalid(`Runtime file mode differs from ${protection} protection`);
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const initial = await file.stat(); if (!unchanged(before, initial)) throw invalid('Runtime file changed before reading');
    const hash = createHash('sha256'), chunks: Buffer[] = [], buffer = Buffer.alloc(64 * 1024); let count = 0;
    while (true) {
      signal.throwIfAborted(); const result = await file.read(buffer, 0, buffer.length, null); signal.throwIfAborted();
      if (!result.bytesRead) break;
      count += result.bytesRead; if (count > before.size || count > maximum) throw invalid('Runtime file grew during verification');
      const bytes = buffer.subarray(0, result.bytesRead); hash.update(bytes);
      if (capture || !expected) chunks.push(Buffer.from(bytes));
    }
    const value = hash.digest('hex');
    if (count !== before.size || (expected && value !== expected.sha256) || !unchanged(initial, await file.stat())
      || !unchanged(before, await admitted(path, false, !expected, signal))) throw invalid('Runtime file changed or digest differs');
    return capture || !expected ? { bytes: Buffer.concat(chunks), hash: value } : { hash: value };
  } finally { await closeOwnedFile(file); }
}
export function verifyRuntimeInventory(bytes: Buffer, expected: ReturnType<typeof runtimeProfile>): RuntimeInventoryFile[] {
  if (digest(bytes) !== expected.inventorySha256) throw invalid('Runtime inventory differs from independent pinned profile');
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'files,schemaVersion') throw invalid('Invalid runtime inventory');
  const record = value as Record<string, unknown>;
  if (record['schemaVersion'] !== 1 || !Array.isArray(record['files']) || record['files'].length !== expected.entries || record['files'].length > RUNTIME_LIMITS.entries) throw invalid('Runtime inventory entry bound differs');
  const files: RuntimeInventoryFile[] = [], seen = new Set<string>(); let expanded = 0;
  for (const input of record['files'] as unknown[]) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'bytes,mode,path,sha256') throw invalid('Invalid runtime file record');
    const item = input as Record<string, unknown>;
    if (typeof item['path'] !== 'string' || typeof item['sha256'] !== 'string' || !/^[a-f0-9]{64}$/.test(item['sha256'])
      || !Number.isSafeInteger(item['bytes']) || (item['bytes'] as number) < 0 || (item['bytes'] as number) > RUNTIME_LIMITS.entryBytes
      || (item['mode'] !== 0o644 && item['mode'] !== 0o755)) throw invalid('Invalid runtime file fields');
    assertRelativeFile(item['path']); if (item['path'].split('/').length > 64) throw invalid('Runtime path depth exceeds bound');
    const key = item['path'].normalize('NFC').toLowerCase(); if (seen.has(key)) throw invalid('Runtime path aliases'); seen.add(key);
    expanded += item['bytes'] as number; if (expanded > RUNTIME_LIMITS.expandedBytes) throw invalid('Runtime expanded bound');
    files.push({ path: item['path'], bytes: item['bytes'] as number, mode: item['mode'], sha256: item['sha256'] });
  }
  if (expanded !== expected.expandedBytes || bytes.toString('utf8') !== runtimeInventoryJson(files)) throw invalid('Runtime inventory encoding or total differs');
  return files;
}

/** Internal content check only: arbitrary stages never receive launch paths. */
export async function verifyRuntimeEntry(root: string, identityInput: RuntimeIdentity, external?: AbortSignal,
  protection: RuntimeProtection = 'published'): Promise<void> {
  const deadline = AbortSignal.timeout(RUNTIME_LIMITS.verificationMs);
  const signal = external ? AbortSignal.any([deadline, external]) : deadline;
  signal.throwIfAborted();
  const identity = structuredClone(parseInstaller('runtime', identityInput)), target = identity.target;
  if (!['published', 'source-stage', 'permission-transition'].includes(protection)) throw invalid('Unknown runtime verification protection lane');
  runtimeStorePaths(root, identity);
  if (target.os !== process.platform || target.arch !== process.arch) throw invalid('Runtime verification requires the native target');
  assertLocalControlRoot(root, target.os === 'win32' ? path => controlBinding().localVolume(path) : undefined);
  const initial = await admitted(root, true, true, signal), profile = runtimeProfile(target);
  const directoryMode = protection === 'source-stage' ? 0o700 : 0o500;
  const rootMode = initial.mode & 0o777;
  if (target.os !== 'win32' && rootMode !== directoryMode
    && !(protection === 'permission-transition' && rootMode === 0o700)) throw invalid(`Runtime root mode differs from ${protection} protection`);
  const paths = { root, directory: join(root, 'distribution'), completion: join(root, 'completion.json'), inventory: join(root, 'inventory.json') };
  const rootEntries = await readdir(paths.root); signal.throwIfAborted();
  if (rootEntries.sort().join(',') !== 'completion.json,distribution,inventory.json') throw invalid('Runtime entry membership differs');
  const completion = (await readChecked(paths.completion, RUNTIME_LIMITS.completionBytes, signal, undefined, true, protection)).bytes!;
  const expectedCompletion = runtimeCompletionJson({ schemaVersion: 1, identity, profileVersion: RUNTIME_PROFILE_VERSION,
    inventorySha256: profile.inventorySha256, npmVersion: runtimePolicy.npmVersion, headersVersion: runtimePolicy.headersVersion });
  if (completion.toString('utf8') !== expectedCompletion) throw invalid('Runtime completion identity or canonical bytes differ');
  const bytes = (await readChecked(paths.inventory, RUNTIME_LIMITS.inventoryBytes, signal, undefined, true, protection)).bytes!;
  const files = verifyRuntimeInventory(bytes, profile), pending = new Map(files.map(file => [file.path, file]));
  const directories = new Set(['']);
  for (const file of files) {
    let path = dirname(file.path).split(sep).join('/');
    while (path !== '.') { directories.add(path); path = dirname(path).split(sep).join('/'); }
  }
  if (pending.get(identity.relativeExecutable)?.sha256 !== profile.nodeSha256) throw invalid('Executable profile digest differs');
  const npm = target.os === 'win32' ? 'node_modules/npm/package.json' : 'lib/node_modules/npm/package.json';
  let npmBytes: Buffer | undefined, headerBytes: Buffer | undefined, entries = 0;
  async function visit(directory: string, prefix = ''): Promise<void> {
    const initial = await admitted(directory, true, false, signal);
    if (target.os !== 'win32' && (initial.mode & 0o777) !== directoryMode) throw invalid(`Runtime directory mode differs from ${protection} protection`);
    for (const name of await readdir(directory)) {
      signal.throwIfAborted(); if (++entries > RUNTIME_LIMITS.entries * 2) throw invalid('Runtime tree entry bound');
      const path = join(directory, name), relativePath = prefix ? `${prefix}/${name}` : name;
      const stat = await lstat(path); signal.throwIfAborted();
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        if (!directories.delete(relativePath)) throw invalid('Unexpected runtime directory');
        await visit(path, relativePath); continue;
      }
      const expected = pending.get(relativePath); if (!expected) throw invalid('Unexpected runtime file');
      const capture = relativePath === npm || relativePath === 'include/node/node_version.h';
      if (capture && expected.bytes > 128 * 1024) throw invalid('Runtime version metadata bound');
      const data = await readChecked(path, RUNTIME_LIMITS.entryBytes, signal, expected, capture, protection);
      if (relativePath === npm) npmBytes = data.bytes;
      if (relativePath === 'include/node/node_version.h') headerBytes = data.bytes;
      pending.delete(relativePath);
    }
    if (!unchanged(initial, await admitted(directory, true, false, signal))) throw invalid('Runtime directory changed during verification');
  }
  await visit(paths.directory); directories.delete('');
  if (pending.size || directories.size || !npmBytes || !headerBytes) throw invalid('Runtime file set is incomplete');
  const npmVersion = (JSON.parse(npmBytes.toString('utf8')) as { version?: unknown }).version;
  const headerVersion = ['MAJOR', 'MINOR', 'PATCH'].map(key => new RegExp(`^#define NODE_${key}_VERSION\\s+(\\d+)`, 'm').exec(headerBytes!.toString('utf8'))?.[1]).join('.');
  if (npmVersion !== runtimePolicy.npmVersion || headerVersion !== runtimePolicy.headersVersion) throw invalid('Runtime npm or headers differ');
  if (!unchanged(initial, await admitted(root, true, true, signal))) throw invalid('Runtime entry changed during verification');
  signal.throwIfAborted();
}

/** Caller gets paths only after complete exact-tree verification. No durable cache. */
export async function resolveRuntimeStore(locationInput: InstallationLocation, identityInput: RuntimeIdentity,
  options: { signal?: AbortSignal | undefined } = {}): Promise<ResolvedPrivateRuntime> {
  const deadline = AbortSignal.timeout(RUNTIME_LIMITS.verificationMs);
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
  signal.throwIfAborted();
  let canonical: { home: string; root: string } | undefined;
  let diagnostic: string | undefined;
  try {
    const location = structuredClone(parseInstaller('location', locationInput));
    const identity = structuredClone(parseInstaller('runtime', identityInput)), target = identity.target;
    if (target.os !== process.platform || target.arch !== process.arch || location.home !== normalizeHome(location.home, target.os)
      || (target.os === 'win32') !== (location.daemonEndpoint.kind === 'named-pipe')) throw invalid('Runtime target or home is not canonical for this process');
    const paths = runtimeStorePaths(location.home, identity), profile = runtimeProfile(target);
    canonical = { home: location.home, root: paths.root };
    assertLocalControlRoot(location.home, target.os === 'win32' ? path => controlBinding().localVolume(path) : undefined);
    const roots = new Map<string, Stats>();
    let current = paths.root;
    while (true) {
      roots.set(current, await admitted(current, true, true, signal));
      if (current === location.home) break;
      const next = dirname(current); if (next === current) throw invalid('Runtime root escapes home'); current = next;
    }
    try { await verifyRuntimeEntry(paths.root, identity, signal); }
    catch (cause) {
      if (cause instanceof InstallerError && cause.code === 'resource-close-uncertain') throw cause;
      signal.throwIfAborted();
      // Classification returns diagnostics only. Neither weaker lane can grant
      // canonical launch paths, mutate an entry, or acquire controller ownership.
      if (target.os !== 'win32' && ((await lstat(paths.root)).mode & 0o777) === 0o700) {
        for (const lane of ['permission-transition', 'source-stage'] as const) {
          try { await verifyRuntimeEntry(paths.root, identity, signal, lane); }
          catch (failure) {
            if (failure instanceof InstallerError && failure.code === 'resource-close-uncertain') throw failure;
            signal.throwIfAborted(); continue;
          }
          diagnostic = lane === 'permission-transition'
            ? `Shared Node runtime publication is unfinished at "${paths.root}". Re-run the authenticated installer to verify and finish protecting the entry; no bytes will be replaced.`
            : `Shared Node runtime protection layout is unsupported at "${paths.root}". This unpublished development home must be rebuilt in a new isolated home; no conversion or repair was attempted.`;
          break;
        }
      }
      throw cause;
    }
    for (const [path, initial] of roots) if (!unchanged(initial, await admitted(path, true, true, signal))) throw invalid('Runtime root changed during verification');
    signal.throwIfAborted();
    Object.freeze(identity.target); Object.freeze(identity);
    return Object.freeze({ identity, directory: paths.directory, node: join(paths.directory, identity.relativeExecutable),
      npmCli: join(paths.directory, target.os === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js'),
      headers: paths.directory, ...(target.os === 'win32' ? { nodeLib: join(paths.directory, target.arch, 'node.lib') } : {}), inventorySha256: profile.inventorySha256 });
  } catch (cause) {
    if (cause instanceof InstallerError && cause.code === 'resource-close-uncertain') throw cause;
    if (signal.aborted) throw signal.reason;
    if (diagnostic) throw invalid(diagnostic);
    const reason = cause instanceof Error ? cause.message : 'Runtime verification failed';
    if (!canonical) throw invalid(reason);
    const quotedRoot = `'${canonical.root.replaceAll("'", "'\\''")}'`;
    throw invalid(`Shared Node runtime verification failed at "${canonical.root}": ${reason}. This runtime is shared by all releases; no repair was attempted. Manual recovery only: stop all Insrc consumers of "${canonical.home}". Do not delete anything. If the runtime-entry root is not owner-writable, first restore owner write on that root only: chmod u+w ${quotedRoot}. Preserve and move the entire entry outside the runtime store, then rerun the authenticated installer. This procedure is not protected by operation.lock; Insrc cannot confirm that every consumer has stopped. If unsure, leave the entry unchanged and request operator assistance.`);
  }
}
