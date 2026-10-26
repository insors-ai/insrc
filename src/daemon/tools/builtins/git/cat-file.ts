/**
 * git_cat_file -- read git objects (read-only, no approval).
 *
 * Three questions about one rev (does it exist, what type and size) and one that reads many: the bytes of any number of
 * revs through `git cat-file --batch`, with the revs on stdin. Bytes are never decoded on the way: the answer carries
 * them as UTF-8 text or, losslessly for binary, as base64, and each object's framing is checked (its size equals the
 * bytes read) so the caller can recompute the hash.
 *
 * By default the command runs isolated: a fresh environment and the read-only arguments of git-isolation.ts, so a
 * replacement ref, an inherited GIT_CONFIG_*, an alternate object store, a hook, fsmonitor, an attributes file or a lazy
 * fetch cannot change or widen what is read. A cancelled signal kills the process.
 */

import { Type } from '@sinclair/typebox';
import { runShellBytes } from '../../shell-helper.js';
import type { ToolDeps, ToolInput, ToolResult, Tool } from '../../types.js';
import { assertSafeArg, fail, ranToExit, rejectInput, spawnFail, str, withFailure } from './helpers.js';
import { GitCatFileDataSchema } from './schemas.js';
import type { GitCatFileData } from './schemas.js';

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;      // per object
const DEFAULT_STDOUT_LIMIT = 32 * 1024 * 1024;  // for the whole call
const DEFAULT_STDERR_LIMIT = 64 * 1024;
const MAX_TIMEOUT_MS = 30_000;                  // the fixed limit; timeoutMs can only lower it

export const gitCatFileTool: Tool = {
  id: 'git_cat_file',
  description: 'Read git objects: whether a rev exists, its type and size, or the bytes of one or many revs (utf8 or lossless base64). Runs isolated from the environment by default.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String({ description: 'Repository root. Defaults to process cwd.' })),
    rev: Type.Optional(Type.String({ description: 'One rev: a sha, a branch, HEAD, or rev:path.' })),
    revs: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { minItems: 1, description: 'Several revs, read in one process (git cat-file --batch). Not with rev.' })),
    path: Type.Optional(Type.String({ description: 'A path inside each rev: the object read is <rev>:<path>.' })),
    exists: Type.Optional(Type.Boolean({ description: 'Answer only whether the rev names an object (needs rev).' })),
    type: Type.Optional(Type.Boolean({ description: 'Answer the object type and size (needs rev).' })),
    size: Type.Optional(Type.Boolean({ description: 'Answer the object type and size (needs rev).' })),
    encoding: Type.Optional(Type.String({ enum: ['utf8', 'base64'], description: 'How object bytes are returned. Default utf8; base64 is lossless for binary.' })),
    maxBytes: Type.Optional(Type.Number({ description: `Largest object accepted, per object (default ${DEFAULT_MAX_BYTES}). A larger one is a failure.`, minimum: 1 })),
    stdoutLimit: Type.Optional(Type.Number({ description: `Byte budget of everything git prints, for the whole call (default ${DEFAULT_STDOUT_LIMIT}). Past it the read is cut and fails.`, minimum: 1 })),
    stderrLimit: Type.Optional(Type.Number({ description: `Byte budget of git's diagnostics (default ${DEFAULT_STDERR_LIMIT}). Past it the process is killed and the call fails.`, minimum: 1 })),
    isolated: Type.Optional(Type.Boolean({ description: 'Run in a fresh environment with the read-only arguments (default true).' })),
    timeoutMs: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TIMEOUT_MS, description: `A shorter limit for this read, in milliseconds (1 to ${MAX_TIMEOUT_MS}; it can only lower the fixed ${MAX_TIMEOUT_MS} ms limit).` })),
  }, { additionalProperties: false }),
  outputSchema: GitCatFileDataSchema,

  async execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const one = str(input, 'rev');
    const many = Array.isArray(input['revs']) ? (input['revs'] as unknown[]).map(String) : undefined;
    if ((one === undefined) === (many === undefined)) { return rejectInput('git_cat_file', 'give rev or revs, not both and not neither'); }
    const path = str(input, 'path');
    const exists = input['exists'] === true;
    const typeSize = input['type'] === true || input['size'] === true;
    if ((exists || typeSize) && one === undefined) { return rejectInput('git_cat_file', 'exists, type and size need a single rev'); }

    const revs = (many ?? [one!]).map(r => (path !== undefined ? `${r}:${path}` : r));
    for (const r of many ?? [one!]) { assertSafeArg(r, 'ref'); }
    if (path !== undefined) { assertSafeArg(path, 'path'); }
    // the revs go one per line on stdin, so a line break could smuggle in another one
    if (revs.some(r => /[\r\n]/.test(r))) { return rejectInput('git_cat_file', 'a rev cannot hold a line break'); }

    const encoding = str(input, 'encoding') === 'base64' ? 'base64' : 'utf8';
    const maxBytes = typeof input['maxBytes'] === 'number' ? Math.floor(input['maxBytes']) : DEFAULT_MAX_BYTES;
    const stdoutLimit = typeof input['stdoutLimit'] === 'number' ? Math.floor(input['stdoutLimit']) : DEFAULT_STDOUT_LIMIT;
    const stderrLimit = typeof input['stderrLimit'] === 'number' ? Math.floor(input['stderrLimit']) : DEFAULT_STDERR_LIMIT;
    const mode = exists || typeSize ? '--batch-check' : '--batch';
    const requested = input['timeoutMs'];
    if (requested !== undefined && (typeof requested !== 'number' || !Number.isInteger(requested) || requested < 1 || requested > MAX_TIMEOUT_MS)) {
      return rejectInput('git_cat_file', `timeoutMs must be an integer from 1 to ${MAX_TIMEOUT_MS}`);
    }
    const timeoutMs = typeof requested === 'number' ? requested : MAX_TIMEOUT_MS;

    const res = await runShellBytes(['git', 'cat-file', mode], {
      cwd, timeoutMs, stdin: `${revs.join('\n')}\n`, isolate: input['isolated'] !== false,
      stdoutLimit, stderrLimit, ...(deps?.signal ? { signal: deps.signal } : {}),
    });
    if (res.spawnError) { return spawnFail('git_cat_file', res.stderr); }
    if (res.aborted) { return withFailure({ output: '[git_cat_file] failed: cancelled', format: 'text', success: false, error: 'cancelled' }, 'rejected'); }
    if (res.stderrOverflow) { return rejectInput('git_cat_file', 'git diagnostics exceed byte limit'); }
    if (res.stdinError !== undefined && res.code === 0) { return rejectInput('git_cat_file', `could not send the revs to git: ${res.stdinError}`); }
    // a read past its budget exits cleanly but is cut: that is a failure of its own, never a partial answer
    if (res.stdoutTruncated && res.code === 0 && !res.timedOut) { return rejectInput('git_cat_file', `git output exceeds the byte limit (${stdoutLimit}); the read was cut`); }
    if (!ranToExit(res) || res.code !== 0) {
      return fail('git_cat_file', { ...res, stdout: '' });
    }

    const out = Buffer.from(res.stdout);
    let data: GitCatFileData;
    try {
      data = mode === '--batch-check' ? checkAnswer(out, revs[0]!, exists) : { objects: readObjects(out, revs, maxBytes, encoding) };
    } catch (err) {
      if (!(err instanceof CatFileError)) { throw err; }
      return withFailure({ output: `[git_cat_file] failed: ${err.message}`, format: 'text', success: false, error: err.message }, 'rejected', out.subarray(0, 4000).toString('latin1'));
    }
    return { output: summary(data), format: 'text', success: true, data };
  },
};

class CatFileError extends Error {}

/** `cat-file --batch-check` for one rev: "<sha> <type> <size>" or "<rev> missing". */
function checkAnswer(out: Buffer, rev: string, existsOnly: boolean): GitCatFileData {
  const line = out.toString('utf8').replace(/\n$/, '');
  if (/ missing$/.test(line)) {
    if (existsOnly) { return { exists: false }; }
    throw new CatFileError(`${rev} names no object`);
  }
  const m = /^[0-9a-f]{40}(?:[0-9a-f]{24})? (\w+) (\d+)$/.exec(line);
  if (!m) { throw new CatFileError(`unknown cat-file answer: ${JSON.stringify(line.slice(0, 120))}`); }
  return existsOnly ? { exists: true } : { type: m[1]!, size: Number(m[2]) };
}

/** `cat-file --batch`: per rev "<sha> <type> <size>\n<bytes>\n" or "<rev> missing\n"; every frame is checked. */
function readObjects(out: Buffer, revs: readonly string[], maxBytes: number, encoding: 'utf8' | 'base64'): { rev: string; exists: boolean; sha?: string; type?: string; size?: number; content?: string; contentBase64?: string }[] {
  const objects = [];
  let pos = 0;
  for (const rev of revs) {
    const nl = out.indexOf(10, pos);
    if (nl < 0) { throw new CatFileError(`the answer for ${rev} is cut`); }
    const header = out.toString('latin1', pos, nl);
    if (header.endsWith(' missing')) { objects.push({ rev, exists: false }); pos = nl + 1; continue; }
    const m = /^([0-9a-f]{40}(?:[0-9a-f]{24})?) (\w+) (\d+)$/.exec(header);
    if (!m) { throw new CatFileError(`unknown cat-file header for ${rev}: ${JSON.stringify(header.slice(0, 120))}`); }
    const size = Number(m[3]);
    if (size > maxBytes) { throw new CatFileError(`${rev} is ${size} bytes, over maxBytes ${maxBytes}`); }
    const start = nl + 1;
    const end = start + size;
    if (end >= out.length) { throw new CatFileError(`the bytes of ${rev} are cut: expected ${size} and a line break after them`); }
    if (out[end] !== 10) { throw new CatFileError(`the framing of ${rev} is wrong: ${size} bytes are not followed by a line break`); }
    const bytes = out.subarray(start, end);
    objects.push({
      rev, exists: true, sha: m[1]!, type: m[2]!, size,
      ...(encoding === 'base64' ? { contentBase64: bytes.toString('base64') } : { content: decodeUtf8(rev, bytes) }),
    });
    pos = end + 1;
  }
  if (pos !== out.length) { throw new CatFileError('git printed more than was asked for'); }
  return objects;
}

function decodeUtf8(rev: string, bytes: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new CatFileError(`${rev} is not valid UTF-8; ask for encoding base64`); }
}

function summary(d: GitCatFileData): string {
  if ('objects' in d) { return d.objects.map(o => (o.exists ? `${o.rev}: ${o.type} ${o.size} bytes` : `${o.rev}: missing`)).join('\n'); }
  if ('exists' in d) { return d.exists ? 'exists' : 'missing'; }
  return `${d.type} ${d.size} bytes`;
}
