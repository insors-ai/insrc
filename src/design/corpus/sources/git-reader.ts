/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** I/O entry. Never export this module from either pure corpus barrel. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { CORPUS_LIMITS } from '../canonical.js';
import type { ValidationIssue, ValidationResult } from '../contracts.js';
import { decodeSourceRequest } from './eligibility.js';
import type { AcquiredBlob } from './eligibility.js';
import { compareText, failure, problem } from './validation-primitives.js';

export class SourceReaderError extends Error {
  constructor(readonly code: ValidationIssue['code'], message: string) { super(message); }
}
export interface BinaryGitOptions {
  readonly cwd: string;
  readonly stdoutLimit: number;
  readonly stderrLimit: number;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal | undefined;
}
export type BinaryGitRunner = (args: readonly string[], input: Uint8Array, options: BinaryGitOptions) => Promise<Uint8Array>;
export function gitEnvironment(): NodeJS.ProcessEnv {
  // Do not inherit GIT_CONFIG_*, alternate object stores, replacement refs or command overrides.
  return { PATH: process.env['PATH'], ...(process.env['SystemRoot'] ? { SystemRoot: process.env['SystemRoot'] } : {}),
    LC_ALL: 'C', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
}
export const GIT_READ_ARGS = ['--no-replace-objects', '--literal-pathspecs', '-c', 'protocol.allow=never',
  '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-c', 'core.attributesFile=/dev/null'] as const;
export const createGitRunner = (spawnProcess: typeof spawn = spawn): BinaryGitRunner => (args, input, options) => new Promise((resolve, reject) => {
  if (![options.stdoutLimit, options.stderrLimit, options.timeoutMs].every(v => Number.isSafeInteger(v) && v > 0)
    || options.stdoutLimit > CORPUS_LIMITS.packageBytes + 192 || options.stderrLimit > 65536 || options.timeoutMs > 30000) {
    reject(new SourceReaderError('limit.exceeded', 'Invalid Git process bounds.')); return;
  }
  if (options.signal?.aborted) { reject(new SourceReaderError('inventory.invalid', 'Source acquisition cancelled.')); return; }
  const child = spawnProcess('git', [...GIT_READ_ARGS, ...args], { cwd: options.cwd, env: gitEnvironment(), shell: false,
    stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  const chunks: Buffer[] = []; let stdoutBytes = 0, stderrBytes = 0, settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => stop(new SourceReaderError('inventory.invalid', 'Source acquisition cancelled.'));
  const settle = (error?: SourceReaderError) => {
    if (settled) return;
    settled = true; if (timer) clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
    if (error) reject(error); else resolve(new Uint8Array(Buffer.concat(chunks, stdoutBytes)));
    chunks.length = 0;
  };
  const stop = (error: SourceReaderError) => {
    if (settled) return;
    // Settle even when spawn failed before a PID or when no close event can arrive.
    settle(error);
    try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
    catch { try { child.kill('SIGKILL'); } catch { /* No process was created. */ } }
    child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
  };
  child.stdout.on('data', (chunk: Buffer) => {
    if (settled) return;
    stdoutBytes += chunk.length;
    if (stdoutBytes > options.stdoutLimit) stop(new SourceReaderError('limit.exceeded', 'Git output exceeds byte limit.'));
    else chunks.push(Buffer.from(chunk));
  });
  child.stderr.on('data', (chunk: Buffer) => {
    if (settled) return;
    stderrBytes += chunk.length;
    if (stderrBytes > options.stderrLimit) stop(new SourceReaderError('limit.exceeded', 'Git diagnostics exceed byte limit.'));
  });
  child.on('error', () => stop(new SourceReaderError('inventory.invalid', 'Cannot acquire local Git objects.')));
  child.stdout.on('error', () => stop(new SourceReaderError('inventory.invalid', 'Git output stream failed.')));
  child.stderr.on('error', () => stop(new SourceReaderError('inventory.invalid', 'Git diagnostics stream failed.')));
  child.stdin.on('error', () => stop(new SourceReaderError('inventory.invalid', 'Git input stream failed.')));
  child.on('close', code => settle(code === 0 ? undefined : new SourceReaderError('reference.missing', 'Local Git object is unavailable.')));
  timer = setTimeout(() => stop(new SourceReaderError('limit.exceeded', 'Source acquisition timed out.')), options.timeoutMs);
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) { abort(); return; }
  child.stdin.end(input);
});
export const runGitBinary = createGitRunner();
export interface ReaderLimits { files: number; bytes: number; metadataBytes: number; timeoutMs: number; stderrBytes: number; requestTimeoutMs: number; }
export const READER_LIMITS: Readonly<ReaderLimits> = Object.freeze({ files: CORPUS_LIMITS.files, bytes: CORPUS_LIMITS.packageBytes,
  metadataBytes: CORPUS_LIMITS.packageBytes, timeoutMs: 30000, stderrBytes: 65536, requestTimeoutMs: 300000 });
export interface ReaderOptions {
  /** May only lower hard limits. A controlled test/maintainer seam, never a policy bypass. */
  readonly limits?: Partial<ReaderLimits> | undefined;
  readonly run?: BinaryGitRunner | undefined;
  readonly signal?: AbortSignal | undefined;
}
/** Verify Git's own object identity in addition to framing; replacement content cannot pass. */
function decodeObject(response: Uint8Array, oid: string, expected: 'commit' | 'tree' | 'blob'): Uint8Array {
  const data = Buffer.from(response), newline = data.indexOf(10);
  if (newline < 0 || newline > 160) throw new SourceReaderError('inventory.invalid', 'Malformed Git object header.');
  const header = data.subarray(0, newline).toString('ascii');
  if (header === `${oid} missing`) throw new SourceReaderError('reference.missing', 'Pinned Git object is missing.');
  const match = /^([a-f0-9]+) (commit|tree|blob|tag) (0|[1-9]\d*)$/.exec(header);
  const size = Number(match?.[3]);
  if (!match || match[1] !== oid || match[2] !== expected || !Number.isSafeInteger(size)
    || size > CORPUS_LIMITS.packageBytes || data.length !== newline + 1 + size + 1 || data.at(-1) !== 10) {
    throw new SourceReaderError('inventory.invalid', 'Unexpected Git object type, size or framing.');
  }
  const bytes = data.subarray(newline + 1, newline + 1 + size);
  const actual = createHash(oid.length === 40 ? 'sha1' : 'sha256').update(`${expected} ${size}\0`).update(bytes).digest('hex');
  if (actual !== oid) throw new SourceReaderError('digest.mismatch', 'Git object bytes do not match their identity.');
  return new Uint8Array(bytes);
}
function treeEntry(tree: Uint8Array, name: string, oidBytes: number): { mode: string; oid: string } {
  const data = Buffer.from(tree), target = Buffer.from(name); let cursor = 0;
  let found: { mode: string; oid: string } | undefined;
  while (cursor < data.length) {
    const space = data.indexOf(32, cursor), nul = data.indexOf(0, space + 1);
    if (space < cursor || nul <= space || nul + 1 + oidBytes > data.length) throw new SourceReaderError('inventory.invalid', 'Malformed Git tree framing.');
    if (data.subarray(space + 1, nul).equals(target)) {
      if (found) throw new SourceReaderError('inventory.invalid', 'Ambiguous Git tree path.');
      found = { mode: data.subarray(cursor, space).toString('ascii'), oid: data.subarray(nul + 1, nul + 1 + oidBytes).toString('hex') };
    }
    cursor = nul + 1 + oidBytes;
  }
  if (!found) throw new SourceReaderError('reference.missing', 'Pinned Git path is missing.');
  return found;
}
/** Reads only object database bytes. The caller supplies the complete selected/evidence path set. */
export async function readPinnedSources(localRepository: string, requestInput: unknown, options: ReaderOptions = {}): Promise<ValidationResult<AcquiredBlob[]>> {
  const decoded = decodeSourceRequest(requestInput); if (!decoded.ok) return decoded;
  if (typeof localRepository !== 'string' || !isAbsolute(localRepository)) return failure([problem('path.invalid', '/localRepository', 'Expected absolute local repository path.')]);
  const request = decoded.value, run = options.run ?? runGitBinary;
  const limits = { ...READER_LIMITS, ...options.limits };
  for (const key of Object.keys(READER_LIMITS) as (keyof typeof READER_LIMITS)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > READER_LIMITS[key]) {
      return failure([problem('limit.exceeded', '/limits', 'Reader limits may only lower positive hard bounds.')]);
    }
  }
  if (request.paths.length > limits.files || request.paths.some(path => Buffer.byteLength(path) > 16384 || path.split('/').length > CORPUS_LIMITS.depth)) {
    return failure([problem('limit.exceeded', '/paths', 'Selected path count, length or depth exceeds limits.')]);
  }
  const cancellation = new AbortController();
  const onAbort = () => cancellation.abort(new SourceReaderError('inventory.invalid', 'Source acquisition cancelled.'));
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  const deadline = setTimeout(() => cancellation.abort(new SourceReaderError('limit.exceeded', 'Source request deadline exceeded.')), limits.requestTimeoutMs);
  const signal = cancellation.signal;
  let total = 0, metadataBytes = 0;
  const metadata = new Map<string, Uint8Array>();
  const get = async (oid: string, kind: 'commit' | 'tree' | 'blob'): Promise<Uint8Array> => {
    if (signal.aborted) throw signal.reason;
    const cached = metadata.get(oid); if (kind !== 'blob' && cached) return cached;
    const remaining = kind === 'blob' ? limits.bytes - total : limits.metadataBytes - metadataBytes;
    const response = await new Promise<Uint8Array>((resolve, reject) => {
      const abortRead = () => { signal.removeEventListener('abort', abortRead); reject(signal.reason); };
      signal.addEventListener('abort', abortRead, { once: true });
      if (signal.aborted) { signal.removeEventListener('abort', abortRead); reject(signal.reason); return; }
      Promise.resolve().then(() => run(['cat-file', '--batch'], Buffer.from(`${oid}\n`), { cwd: localRepository,
        stdoutLimit: remaining + 192, stderrLimit: limits.stderrBytes, timeoutMs: limits.timeoutMs, signal }))
        .then(resolve, reject).finally(() => signal.removeEventListener('abort', abortRead));
    });
    if (response.byteLength > remaining + 192) throw new SourceReaderError('limit.exceeded', 'Git response exceeds remaining budget.');
    const bytes = decodeObject(response, oid, kind);
    if (bytes.byteLength > remaining) throw new SourceReaderError('limit.exceeded', 'Acquired objects exceed remaining budget.');
    if (kind === 'blob') total += bytes.byteLength;
    else { metadataBytes += bytes.byteLength; metadata.set(oid, bytes); }
    return bytes;
  };
  try {
    const commit = await get(request.revision, 'commit');
    const header = Buffer.from(commit.subarray(0, 80)).toString('ascii');
    const root = new RegExp(`^tree ([a-f0-9]{${request.revision.length}})\\n`).exec(header)?.[1];
    if (!root) throw new SourceReaderError('inventory.invalid', 'Pinned commit has no valid root tree.');
    const blobs: AcquiredBlob[] = [];
    for (const path of [...request.paths].sort(compareText)) {
      const segments = path.split('/'); let treeOid = root;
      for (const [i, segment] of segments.entries()) {
        const entry = treeEntry(await get(treeOid, 'tree'), segment, request.revision.length / 2);
        if (i < segments.length - 1) {
          if (entry.mode !== '40000') throw new SourceReaderError('inventory.invalid', 'Selected parent is not a tree.');
          treeOid = entry.oid;
        } else {
          if (!['100644', '100755'].includes(entry.mode)) throw new SourceReaderError('inventory.invalid', 'Only regular Git blobs may be selected.');
          const bytes = await get(entry.oid, 'blob');
          blobs.push({ path, bytes });
        }
      }
    }
    return { ok: true, value: blobs };
  } catch (error) {
    const reason: unknown = signal.aborted ? signal.reason : error;
    return failure([reason instanceof SourceReaderError ? problem(reason.code, '/acquisition', reason.message)
      : problem('inventory.invalid', '/acquisition', 'Local source acquisition failed.')]);
  } finally { clearTimeout(deadline); options.signal?.removeEventListener('abort', onAbort); }
}
