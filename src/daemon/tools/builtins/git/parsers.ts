/**
 * Deterministic parsers for the structured output of git: status v2 -z, for-each-ref with a fixed format, ls-tree -z,
 * ls-files -z, rev-list, log with a fixed format and show-ref. No parser calls a model.
 *
 * Each parser works on a complete stdout. It throws a ParseError when a record is not one it understands, and
 * parseOutput turns that into a failed result (kind 'rejected', the raw text in failure.original); parseOutput also
 * refuses stdout that was cut (ShellResult.stdoutTruncated), so a cut read is never turned into a partial list.
 */

import type { ToolResult } from '../../types.js';
import { withFailure } from './helpers.js';
import type { GitLogCommit } from './log.js';
import type { GitStatusData, GitStatusEntry } from './status.js';

export class ParseError extends Error {}

export type Parsed<T> = { ok: true; value: T } | { ok: false; failure: ToolResult };

/** Parse a command's stdout; a cut read or a record that does not parse is a failed result carrying the raw text. */
export function parseOutput<T>(
  label: string,
  r: { stdout: string; stdoutTruncated: boolean },
  parse: (raw: string) => T,
): Parsed<T> {
  if (r.stdoutTruncated) {
    return { ok: false, failure: failed(label, 'git output was cut at the byte limit', r.stdout) };
  }
  try {
    return { ok: true, value: parse(r.stdout) };
  } catch (err) {
    if (!(err instanceof ParseError)) { throw err; }
    return { ok: false, failure: failed(label, `could not parse git output: ${err.message}`, r.stdout) };
  }
}

function failed(label: string, msg: string, original: string): ToolResult {
  return withFailure({ output: `[${label}] failed: ${msg}`, format: 'text', success: false, error: msg }, 'rejected', original);
}

const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const FS = '\x1f';

// ---------------------------------------------------------------------------
// status --porcelain=v2 --branch --null
// ---------------------------------------------------------------------------

/** https://git-scm.com/docs/git-status#_porcelain_format_version_2 */
export function parseStatusV2(raw: string): GitStatusData {
  const data: GitStatusData = {
    clean: true, branch: '(detached)', staged: [], unstaged: [], untracked: [], conflicts: [],
  };
  // Entries are null-terminated; rename / copy entries are two-part: "2 <XY> ... <path>\0<origPath>\0".
  if (raw !== '' && !raw.endsWith('\0')) { throw new ParseError('the last status record is not NUL-terminated'); }
  const parts = raw.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (!line) { continue; }

    if (line.startsWith('# ')) {
      if (line.startsWith('# branch.head ')) { data.branch = line.slice('# branch.head '.length).trim(); }
      else if (line.startsWith('# branch.upstream ')) { data.upstream = line.slice('# branch.upstream '.length).trim(); }
      else if (line.startsWith('# branch.ab ')) {
        const match = line.slice('# branch.ab '.length).trim().match(/^\+(\d+)\s+-(\d+)$/);
        if (!match) { throw new ParseError(`malformed branch.ab header: ${JSON.stringify(line)}`); }
        data.ahead = Number(match[1]); data.behind = Number(match[2]);
      }
      continue; // other headers (branch.oid, stash) are not surfaced
    }

    const tokens = line.split(' ');
    const xy = tokens[1] ?? '';
    switch (line[0]) {
      case '1': { // "1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
        needFields(line, tokens, 9, xy, [3, 4, 5], [6, 7]);
        pushEntry(data, xy, pathOf(line, tokens, 8), undefined);
        break;
      }
      case '2': { // "2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>" then the original path
        needFields(line, tokens, 10, xy, [3, 4, 5], [6, 7]);
        if (!/^[RC]\d+$/.test(tokens[8]!)) { throw new ParseError(`malformed rename score: ${JSON.stringify(line)}`); }
        const origPath = parts[++i];
        if (!origPath) { throw new ParseError(`rename entry without its original path: ${JSON.stringify(line)}`); }
        pushEntry(data, xy, pathOf(line, tokens, 9), origPath);
        break;
      }
      case 'u': { // "u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>"
        needFields(line, tokens, 11, xy, [3, 4, 5, 6], [7, 8, 9]);
        data.conflicts.push({ path: pathOf(line, tokens, 10), code: xy });
        data.clean = false;
        break;
      }
      case '?': { // "? <path>"
        if (line[1] !== ' ' || line.length < 3) { throw new ParseError(`malformed untracked entry: ${JSON.stringify(line)}`); }
        data.untracked.push(line.slice(2));
        data.clean = false;
        break;
      }
      case '!': { // "! <path>": ignored paths are not surfaced
        if (line[1] !== ' ' || line.length < 3) { throw new ParseError(`malformed ignored entry: ${JSON.stringify(line)}`); }
        break;
      }
      default: throw new ParseError(`unknown status record: ${JSON.stringify(line)}`);
    }
  }
  return data;
}

function pathOf(line: string, tokens: string[], from: number): string {
  const path = tokens.slice(from).join(' ');
  if (path === '') { throw new ParseError(`status entry without a path: ${JSON.stringify(line)}`); }
  return path;
}

/** The fixed fields of a changed, renamed or unmerged entry: the XY codes, the submodule state, the modes and the object names. */
function needFields(line: string, tokens: string[], min: number, xy: string, modes: number[], shas: number[]): void {
  const ok = line[1] === ' ' && tokens.length >= min && /^[.MTADRCU]{2}$/.test(xy)
    && /^[NS][C.][M.][U.]$/.test(tokens[2] ?? '')
    && modes.every(i => /^\d{6}$/.test(tokens[i] ?? ''))
    && shas.every(i => SHA.test(tokens[i] ?? ''));
  if (!ok) { throw new ParseError(`malformed status entry: ${JSON.stringify(line)}`); }
}

function pushEntry(data: GitStatusData, xy: string, path: string, origPath: string | undefined): void {
  const entry = (code: string): GitStatusEntry => ({ path, code, ...(origPath ? { origPath } : {}) });
  const staged = xy[0] ?? '.';
  const unstaged = xy[1] ?? '.';
  if (staged !== '.') { data.staged.push(entry(staged)); data.clean = false; }
  if (unstaged !== '.') { data.unstaged.push(entry(unstaged)); data.clean = false; }
}

// ---------------------------------------------------------------------------
// ls-files -z, ls-tree -z, rev-list, show-ref
// ---------------------------------------------------------------------------

/** A NUL-terminated list of paths (ls-files -z, ls-tree -z --name-only). */
export function parseNulList(raw: string): string[] {
  if (raw === '') { return []; }
  if (!raw.endsWith('\0')) { throw new ParseError('the last path is not NUL-terminated'); }
  const items = raw.slice(0, -1).split('\0');
  if (items.some(p => p === '')) { throw new ParseError('an empty path'); }
  return items;
}

export interface GitTreeEntry { mode: string; type: 'blob' | 'tree' | 'commit'; sha: string; path: string }

/** ls-tree -z: "<mode> SP <type> SP <sha> TAB <path> NUL". */
export function parseLsTree(raw: string): GitTreeEntry[] {
  if (raw === '') { return []; }
  if (!raw.endsWith('\0')) { throw new ParseError('the last tree entry is not NUL-terminated'); }
  return raw.slice(0, -1).split('\0').map(rec => {
    const m = /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40}(?:[0-9a-f]{24})?)\t([\s\S]+)$/.exec(rec);
    if (!m) { throw new ParseError(`unknown tree entry: ${JSON.stringify(rec)}`); }
    return { mode: m[1]!, type: m[2] as GitTreeEntry['type'], sha: m[3]!, path: m[4]! };
  });
}

/** rev-list: one full object name per line. */
export function parseRevList(raw: string): string[] {
  if (raw === '') { return []; }
  if (!raw.endsWith('\n')) { throw new ParseError('the last line is not newline-terminated'); }
  return raw.slice(0, -1).split('\n').map(line => {
    if (!SHA.test(line)) { throw new ParseError(`not an object name: ${JSON.stringify(line)}`); }
    return line;
  });
}

export interface GitRef { sha: string; name: string }

/** show-ref: "<sha> SP <refname>" per line. */
export function parseShowRef(raw: string): GitRef[] {
  if (raw === '') { return []; }
  if (!raw.endsWith('\n')) { throw new ParseError('the last line is not newline-terminated'); }
  return raw.slice(0, -1).split('\n').map(line => {
    const m = /^([0-9a-f]{40}(?:[0-9a-f]{24})?) (\S+)$/.exec(line);
    if (!m) { throw new ParseError(`unknown show-ref record: ${JSON.stringify(line)}`); }
    return { sha: m[1]!, name: m[2]! };
  });
}

// ---------------------------------------------------------------------------
// for-each-ref with a fixed format
// ---------------------------------------------------------------------------

/** The --format for the given fields: each value is followed by a unit separator and each ref by a NUL. */
export function forEachRefFormat(fields: readonly string[]): string {
  return fields.map(f => `%(${f})`).join('%1f') + '%00';
}

/** Output of for-each-ref run with forEachRefFormat(fields): git ends every record with a newline after our NUL. */
export function parseForEachRef(raw: string, fields: readonly string[]): Record<string, string>[] {
  if (raw === '') { return []; }
  if (!raw.endsWith('\0\n')) { throw new ParseError('the last ref is not terminated'); }
  return raw.slice(0, -2).split('\0\n').map(rec => {
    const values = rec.split(FS);
    if (values.length !== fields.length) {
      throw new ParseError(`expected ${fields.length} fields, got ${values.length}: ${JSON.stringify(rec)}`);
    }
    fields.forEach((f, i) => {
      // object names are checked; a peeled name (*objectname) is empty for a ref that is not a tag
      if (OBJECT_FIELDS.has(f) && !(values[i] === '' && f.startsWith('*')) && !SHA.test(values[i]!)) {
        throw new ParseError(`${f} is not an object name: ${JSON.stringify(values[i])}`);
      }
    });
    return Object.fromEntries(fields.map((f, i) => [f, values[i]!]));
  });
}

const OBJECT_FIELDS = new Set(['objectname', '*objectname', 'tree']);

// ---------------------------------------------------------------------------
// log with a fixed format
// ---------------------------------------------------------------------------

/** The --pretty format git_log runs: seven unit-separated fields; `git log -z` puts a NUL between commits. */
export const LOG_FORMAT = `%H${FS}%h${FS}%an${FS}%ae${FS}%aI${FS}%s${FS}%b`;

/** Output of `git log -z --pretty=format:LOG_FORMAT`. */
export function parseLogRecords(raw: string): GitLogCommit[] {
  if (raw === '') { return []; }
  return raw.replace(/\0$/, '').split('\0').map(chunk => {
    const f = chunk.split(FS);
    if (f.length !== 7 || !SHA.test(f[0]!)) { throw new ParseError(`unknown log record: ${JSON.stringify(chunk.slice(0, 120))}`); }
    return {
      sha: f[0]!, shortSha: f[1]!, author: f[2]!, authorEmail: f[3]!, date: f[4]!, subject: f[5]!, body: f[6]!.trimEnd(),
    };
  });
}
