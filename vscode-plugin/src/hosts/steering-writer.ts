/**
 * Story E20260921ad0d45c9:S003 / t1 — the reversible steering writer (sc5, k4).
 *
 * A pure marker-delimited upsert/remove over the injected HostFileSystem — the
 * TS port of the daemon's proven `src/daemon/steering-inject.ts` mechanic and the
 * JetBrains MarkerSection. Content OUTSIDE the markers is preserved verbatim;
 * malformed (open-without-close) or duplicate markers leave the text untouched
 * rather than guess. The block is written ONLY between the insrc:steering markers.
 */
import { HostFileAccessError, type HostFileSystem } from './fs.js';

/** The canonical insrc steering markers — identical to the daemon + JetBrains. */
export const STEERING_MARKER_START = '<!-- insrc:steering:start -->';
export const STEERING_MARKER_END = '<!-- insrc:steering:end -->';

export interface SteeringBlock {
  beginMarker: string;
  endMarker: string;
  body: string;
}

export interface SteeringWriter {
  /**
   * Insert or replace the marked section, preserving surrounding content;
   * idempotent no-op when the block is already current; a guarded no-op (left
   * untouched) on malformed/duplicate markers.
   * @throws HostFileAccessError if the file cannot be read/written.
   */
  upsert(steeringPath: string, block: SteeringBlock): void;
  /**
   * Remove the marked section, restoring the file to its pre-insrc content; a
   * no-op when absent or on malformed/duplicate markers.
   * @throws HostFileAccessError if the file cannot be read/written.
   */
  remove(steeringPath: string, markers?: { beginMarker: string; endMarker: string }): void;
}

interface Computation {
  /** New full text to write, or `null` when nothing should be written. */
  content: string | null;
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/** Render a block as its marker-bounded section: begin, body, end on their own lines. */
function render(block: SteeringBlock): string {
  return `${block.beginMarker}\n${block.body}\n${block.endMarker}`;
}

/** Pure upsert — the marker logic + never-clobber invariant (fully testable). */
export function computeUpsert(existing: string | undefined, block: SteeringBlock): Computation {
  const section = render(block);

  // Absent file → create with only the marked section.
  if (existing === undefined) {
    return { content: `${section}\n` };
  }

  const opens = countOccurrences(existing, block.beginMarker);
  const closes = countOccurrences(existing, block.endMarker);

  // No marker yet → append the marked section, preserving existing content.
  if (opens === 0 && closes === 0) {
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    return { content: `${existing}${sep}${section}\n` };
  }

  // Guard: ambiguous / malformed markers → never guess, never clobber.
  if (opens > 1 || closes > 1) {
    return { content: null };
  }
  const startIdx = existing.indexOf(block.beginMarker);
  const endIdx = existing.indexOf(block.endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { content: null };
  }

  // Replace ONLY the region between (and including) the markers.
  const before = existing.slice(0, startIdx);
  const after = existing.slice(endIdx + block.endMarker.length);
  const next = before + section + after;
  return { content: next === existing ? null : next };
}

/** Pure removal — restores the pre-insrc content; guards malformed/duplicate markers. */
export function computeRemoval(existing: string | undefined, beginMarker: string, endMarker: string): Computation {
  if (existing === undefined) return { content: null };

  const opens = countOccurrences(existing, beginMarker);
  const closes = countOccurrences(existing, endMarker);

  // No block present → no-op.
  if (opens === 0 && closes === 0) return { content: null };

  // Guard: ambiguous / malformed markers → never guess, never clobber.
  if (opens > 1 || closes > 1) return { content: null };
  const startIdx = existing.indexOf(beginMarker);
  const endIdx = existing.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return { content: null };

  const before = existing.slice(0, startIdx);
  let after = existing.slice(endIdx + endMarker.length);
  // Strip the single trailing newline the writer appends after the end marker.
  if (after.startsWith('\n')) after = after.slice(1);
  // Strip the single separator newline the writer inserts before the begin marker
  // (append path leaves "…\n\n<block>"), leaving the prior trailing newline intact.
  const restored = before.endsWith('\n\n') ? before.slice(0, -1) + after : before + after;

  return { content: restored === existing ? null : restored };
}

/** Build the reversible steering writer over the injected HostFileSystem. */
export function createSteeringWriter(fs: HostFileSystem): SteeringWriter {
  const readOrThrow = (path: string): string | undefined => {
    try {
      return fs.read(path);
    } catch (err) {
      throw new HostFileAccessError(`insrc: cannot read host steering file ${path}`, { cause: err });
    }
  };
  const writeOrThrow = (path: string, content: string): void => {
    try {
      fs.write(path, content);
    } catch (err) {
      throw new HostFileAccessError(`insrc: cannot write host steering file ${path}`, { cause: err });
    }
  };

  return {
    upsert(steeringPath, block): void {
      const { content } = computeUpsert(readOrThrow(steeringPath), block);
      if (content === null) return; // idempotent / guarded no-op
      writeOrThrow(steeringPath, content);
    },
    remove(steeringPath, markers): void {
      const begin = markers?.beginMarker ?? STEERING_MARKER_START;
      const end = markers?.endMarker ?? STEERING_MARKER_END;
      const { content } = computeRemoval(readOrThrow(steeringPath), begin, end);
      if (content === null) return; // nothing to remove / guarded no-op
      writeOrThrow(steeringPath, content);
    },
  };
}
