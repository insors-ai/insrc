/**
 * Deterministic readers of what acli prints. No model call: each reads a fixed JSON shape or a small fixed text form and
 * returns undefined when the text is not that shape, so a caller never guesses an answer.
 */

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

export interface BatchEntry { readonly id: string; readonly message: string }
export interface BatchReading { readonly ok: boolean; readonly succeeded: BatchEntry[]; readonly failed: BatchEntry[] }

/**
 * The `--json` output of transition, assign, edit, clone, archive, unarchive, delete and comment create:
 * {results:[{status,message,id}],totalCount,successCount}. acli exits 0 even when every result is a FAILURE, so ok needs a
 * non-empty list, every status SUCCESS, and totalCount and successCount that both agree with the list.
 */
export function readBatch(stdout: string): BatchReading | undefined {
  let doc: unknown;
  try { doc = JSON.parse(stdout); } catch { return undefined; }
  if (typeof doc !== 'object' || doc === null) { return undefined; }
  const { results, totalCount, successCount } = doc as { results?: unknown; totalCount?: unknown; successCount?: unknown };
  if (!Array.isArray(results) || typeof totalCount !== 'number' || typeof successCount !== 'number') { return undefined; }
  const succeeded: BatchEntry[] = [];
  const failed: BatchEntry[] = [];
  for (const r of results) {
    if (typeof r !== 'object' || r === null) { return undefined; }
    const { status, message, id } = r as { status?: unknown; message?: unknown; id?: unknown };
    if (typeof status !== 'string' || typeof message !== 'string' || typeof id !== 'string') { return undefined; }
    (status === 'SUCCESS' ? succeeded : failed).push({ id, message });
  }
  const ok = results.length > 0 && failed.length === 0 && totalCount === results.length && successCount === totalCount;
  return { ok, succeeded, failed };
}

/** The key of the new work item in a clone's success message ('... successfully cloned as https://site/browse/IN-3'); the result id is the source key. */
export function readClonedKey(message: string): string | undefined {
  return /cloned as \S*\/browse\/([A-Z][A-Z0-9_]*-\d+)/.exec(message)?.[1];
}

/** The integer of 'Number of work items in the search: N' (a leading check mark is allowed). */
export function readCount(stdout: string): number | undefined {
  const m = /Number of work items in the search:\s*(\d+)\b/.exec(stripAnsi(stdout));
  return m?.[1] === undefined ? undefined : Number(m[1]);
}

const BORDER = /^[┌├└┬┼┴┐┤┘─\s]+$/;

/**
 * `comment visibility --group` (a box table under 'Available Groups (N total):') or `--role --project K` ('- Name' lines under
 * 'Available Roles:'). A group answer needs N to equal the parsed rows, and 0 is the only empty one; a role answer needs at
 * least one '- Name' line. A missing heading, a line that is not part of the form, or a count that differs gives undefined.
 */
export function readVisibility(stdout: string, kind: 'group'): { groups: { name: string; id: string }[] } | undefined;
export function readVisibility(stdout: string, kind: 'role'): { roles: string[] } | undefined;
export function readVisibility(stdout: string, kind: 'group' | 'role'): { groups: { name: string; id: string }[] } | { roles: string[] } | undefined;
export function readVisibility(stdout: string, kind: 'group' | 'role'): { groups: { name: string; id: string }[] } | { roles: string[] } | undefined {
  const lines = stripAnsi(stdout).split('\n').map(l => l.replace(/\s+$/, ''));
  if (kind === 'role') {
    const at = lines.findIndex(l => /Available Roles:\s*$/.test(l));
    if (at < 0) { return undefined; }
    const roles: string[] = [];
    for (const l of lines.slice(at + 1)) {
      if (l.trim() === '') { continue; }
      const m = /^- (\S.*)$/.exec(l);
      if (m?.[1] === undefined) { return undefined; }
      roles.push(m[1]);
    }
    return roles.length > 0 ? { roles } : undefined;
  }
  const at = lines.findIndex(l => /Available Groups \(\d+ total\):\s*$/.test(l));
  if (at < 0) { return undefined; }
  const total = Number(/\((\d+) total\)/.exec(lines[at] ?? '')?.[1]);
  const groups: { name: string; id: string }[] = [];
  let header = true;
  for (const l of lines.slice(at + 1)) {
    if (l.trim() === '' || BORDER.test(l)) { continue; }
    if (!l.startsWith('│')) { return undefined; }
    const cells = l.split('│').slice(1, -1).map(c => c.trim());
    if (cells.length !== 2 || cells[0] === '' || cells[1] === '') { return undefined; }
    if (header) { header = false; if (cells[0] !== 'Group Name' || cells[1] !== 'Group ID') { return undefined; } continue; }
    groups.push({ name: cells[0] as string, id: cells[1] as string });
  }
  return groups.length === total ? { groups } : undefined;
}

export interface AuthStatus { signedIn: boolean; site?: string; email?: string; authType?: string }

/** `acli jira auth status`: '✓ Authenticated' with Site, Email and Authentication Type lines, or an 'unauthorized' error. */
export function parseAuthStatus(text: string): AuthStatus {
  const t = stripAnsi(text);
  const line = (label: string): string | undefined => new RegExp(`^\\s*${label}:\\s*(\\S.*?)\\s*$`, 'm').exec(t)?.[1];
  const signedIn = /\bAuthenticated\b/.test(t) && !/unauthorized/i.test(t);
  const site = line('Site');
  const email = line('Email');
  const authType = line('Authentication Type');
  return { signedIn, ...(site !== undefined ? { site } : {}), ...(email !== undefined ? { email } : {}), ...(authType !== undefined ? { authType } : {}) };
}
