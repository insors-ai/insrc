/**
 * Story E20261012ddc4ede1:S001 — which rows of a transcript make a page.
 *
 * A vscode-free module. The panel host sends the webview one window of a session's transcript
 * when a chat opens and one page per request after that, never the whole history. Both cuts use
 * the same rule: take PAGE_ROWS rows back from the end of the range, then move the start back to
 * the nearest user row within a further PAGE_ROWS rows, so a page begins at the start of a turn
 * where it can. With no user row in reach the plain cut stands. A page is therefore at most two
 * pages' worth of rows.
 *
 * Rows are identified by their absolute index in the transcript: rows are only ever appended, so
 * an index is stable for the life of a session.
 */
import type { DiffRow, TranscriptEntry } from './session-store.js';

/** Rows in a page. Fixed: not a setting. */
export const PAGE_ROWS = 100;

/** A run of consecutive transcript rows and the absolute index of the first one. */
export interface TranscriptPage {
  readonly firstIndex: number;
  readonly rows: readonly TranscriptEntry[];
}

/** Where the page ending just before `end` starts. */
function pageStart(transcript: readonly TranscriptEntry[], end: number, pageRows: number): number {
  const plain = Math.max(0, end - pageRows);
  if (plain === 0) return 0;
  const reach = Math.max(0, plain - pageRows);
  for (let i = plain; i >= reach; i--) {
    if (transcript[i]?.role === 'user') return i;
  }
  return plain;
}

/** The page shown when a chat opens: the rows up to the end of the transcript. */
export function latestWindow(transcript: readonly TranscriptEntry[], pageRows: number = PAGE_ROWS): TranscriptPage {
  return pageBefore(transcript, transcript.length, pageRows);
}

/**
 * The page that ends just before absolute index `before` (clamped to 0..length). At 0 there is
 * nothing older: no rows, firstIndex 0.
 */
export function pageBefore(transcript: readonly TranscriptEntry[], before: number, pageRows: number = PAGE_ROWS): TranscriptPage {
  const end = Math.min(Math.max(0, Math.trunc(before)), transcript.length);
  const firstIndex = pageStart(transcript, end, Math.max(1, Math.trunc(pageRows)));
  return { firstIndex, rows: latestDiffVersions(transcript, firstIndex, end) };
}

/**
 * Story E20261013b2e8109f:S001: the rows firstIndex..end with each diff section in its latest
 * version. A diff row that has a sid and no `replaces` is given with the content of the last row
 * anywhere later in the transcript whose `replaces` is that sid, keeping its own sid; a row that
 * has `replaces` is given as it is (it draws nothing). The match is on the id, never on position.
 */
function latestDiffVersions(transcript: readonly TranscriptEntry[], firstIndex: number, end: number): readonly TranscriptEntry[] {
  const page = transcript.slice(firstIndex, end);
  const wanted = new Set<string>();
  for (const row of page) {
    if (row.role === 'diff' && row.sid !== undefined && row.replaces === undefined) wanted.add(row.sid);
  }
  if (wanted.size === 0) return page;
  const latest = new Map<string, DiffRow>();
  for (let i = firstIndex; i < transcript.length; i++) {
    const row = transcript[i]!;
    if (row.role === 'diff' && row.replaces !== undefined && wanted.has(row.replaces)) latest.set(row.replaces, row);
  }
  if (latest.size === 0) return page;
  return page.map((row): TranscriptEntry => {
    if (row.role !== 'diff' || row.sid === undefined || row.replaces !== undefined) return row;
    const newer = latest.get(row.sid);
    if (newer === undefined) return row;
    const { replaces: _replaces, ...content } = newer;
    return { ...content, sid: row.sid };
  });
}
