/**
 * Story E20261013b2e8109f:S001 — the sections of a turn's git diff.
 *
 * Pure and vscode-free. Two things live here:
 *
 * - parsePatch turns the text of `git diff` between two trees into one {@link DiffSection} per
 *   `@@` section (hunk). The patch is the one git-baseline.ts asks for: `--no-renames`, `a/` and
 *   `b/` prefixes, `core.quotepath=false`.
 * - reconcileSections compares the sections of one check with those known from the checks before
 *   it in the same turn, and says which are new, which changed and which are gone. The old side of
 *   the diff is the turn-start snapshot and does not move during a turn, so a section is the same
 *   section as long as its old-line range overlaps.
 */

/** Diff lines kept per section; the rest are counted in {@link DiffSection.omitted}. */
export const MAX_SECTION_LINES = 400;
/** New sections shown per check; the rest are kept hidden and counted. */
export const MAX_NEW_SECTIONS_PER_CHECK = 20;
/** Diff lines a widget shows until it is opened. */
export const COLLAPSED_LINES = 8;

/** One section of one file's diff. */
export interface DiffSection {
  /** As git names it: relative to the folder the diff ran in, with forward slashes. */
  readonly path: string;
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  /** Added and removed lines of the whole section, also when `lines` is cut. */
  readonly added: number;
  readonly removed: number;
  /** The diff lines with their ' ', '+', '-' or '\' prefix, at most {@link MAX_SECTION_LINES}. */
  readonly lines: string[];
  /** How many diff lines were left out of `lines`. */
  readonly omitted?: number;
  /** A binary file: no lines. */
  readonly binary?: true;
  readonly fileState?: 'new' | 'deleted';
}

export type SectionOp =
  | { readonly op: 'add'; readonly id: number; readonly section: DiffSection }
  | { readonly op: 'update'; readonly id: number; readonly section: DiffSection }
  | { readonly op: 'withdraw'; readonly id: number };

/** A section a turn has seen. `shown` is false for one the per-check limit left out. */
export interface KnownSection {
  readonly id: number;
  readonly section: DiffSection;
  readonly shown: boolean;
}

export interface ReconcileResult {
  readonly ops: SectionOp[];
  readonly known: KnownSection[];
  readonly nextId: number;
  /** New sections this call left out, and the files they are in. */
  readonly overflow: { readonly sections: number; readonly files: number } | undefined;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Undo git's C-style quoting of a path (`"a/tab\there"`); `text` starts at the opening quote. */
function unquote(text: string): { value: string; end: number } | undefined {
  if (!text.startsWith('"')) return undefined;
  const bytes: number[] = [];
  let i = 1;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"') return { value: Buffer.from(bytes).toString('utf8'), end: i + 1 };
    if (ch !== '\\') {
      for (const b of Buffer.from(ch, 'utf8')) bytes.push(b);
      i++;
      continue;
    }
    const next = text[i + 1];
    if (next === undefined) return undefined;
    if (next >= '0' && next <= '7') {
      const oct = /^[0-7]{1,3}/.exec(text.slice(i + 1))![0];
      bytes.push(parseInt(oct, 8) & 0xff);
      i += 1 + oct.length;
      continue;
    }
    const simple: Record<string, number> = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '\\': 92, '"': 34 };
    const code = simple[next];
    if (code === undefined) return undefined;
    bytes.push(code);
    i += 2;
  }
  return undefined;
}

/** The path of a `--- a/…` or `+++ b/…` line's operand; undefined for /dev/null or an unreadable one. */
function sidePath(operand: string, prefix: 'a/' | 'b/'): string | undefined {
  let name = operand;
  if (name.startsWith('"')) {
    const q = unquote(name);
    if (q === undefined) return undefined;
    name = q.value;
  } else if (name.endsWith('\t')) {
    // git puts a tab after a name that holds a space
    name = name.slice(0, -1);
  }
  if (name === '/dev/null') return undefined;
  return name.startsWith(prefix) ? name.slice(prefix.length) : undefined;
}

/** The path of a `diff --git a/P b/P` line (both names are the same: the diff runs with --no-renames). */
function headerPath(rest: string): string | undefined {
  if (rest.startsWith('"')) {
    const q = unquote(rest);
    return q !== undefined && q.value.startsWith('a/') ? q.value.slice(2) : undefined;
  }
  // `a/P b/P`: two prefixes and one space around two copies of P.
  const len = (rest.length - 5) / 2;
  if (!Number.isInteger(len) || len < 1 || !rest.startsWith('a/')) return undefined;
  const p = rest.slice(2, 2 + len);
  return rest === `a/${p} b/${p}` ? p : undefined;
}

/**
 * The sections of a patch, in the patch's order. Never throws: a file part it cannot read is
 * skipped up to the next `diff --git` line, and the sections read before it are kept.
 */
export function parsePatch(patch: string): DiffSection[] {
  const out: DiffSection[] = [];
  const lines = patch.split('\n');
  let i = 0;

  const skipFile = (): void => {
    while (i < lines.length && !lines[i]!.startsWith('diff --git ')) i++;
  };

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.startsWith('diff --git ')) {
      i++;
      continue;
    }
    let path = headerPath(line.slice('diff --git '.length));
    let fileState: 'new' | 'deleted' | undefined;
    i++;

    // The file's header lines, up to its first section, its binary line or the next file.
    let bad = false;
    while (i < lines.length) {
      const h = lines[i]!;
      if (h.startsWith('diff --git ') || h.startsWith('@@ ')) break;
      if (h.startsWith('new file mode')) fileState = 'new';
      else if (h.startsWith('deleted file mode')) fileState = 'deleted';
      else if (h.startsWith('--- ')) {
        const p = sidePath(h.slice(4), 'a/');
        if (p !== undefined) path = p;
      } else if (h.startsWith('+++ ')) {
        const p = sidePath(h.slice(4), 'b/');
        if (p !== undefined) path = p;
      } else if (h.startsWith('Binary files ') || h === 'GIT binary patch') {
        if (path === undefined) {
          bad = true;
          break;
        }
        out.push({
          path, oldStart: 0, oldLines: 0, newStart: 0, newLines: 0, added: 0, removed: 0, lines: [], binary: true,
          ...(fileState !== undefined ? { fileState } : {}),
        });
        skipFile(); // a binary file has no sections
        break;
      }
      i++;
    }
    if (bad) {
      skipFile();
      continue;
    }

    // The file's sections.
    while (i < lines.length && lines[i]!.startsWith('@@ ')) {
      const m = HUNK_HEADER.exec(lines[i]!);
      if (m === null || path === undefined) {
        skipFile();
        break;
      }
      const oldStart = Number(m[1]);
      const oldLines = m[2] === undefined ? 1 : Number(m[2]);
      const newStart = Number(m[3]);
      const newLines = m[4] === undefined ? 1 : Number(m[4]);
      i++;
      let oldLeft = oldLines;
      let newLeft = newLines;
      let added = 0;
      let removed = 0;
      let total = 0;
      const kept: string[] = [];
      let broken = false;
      const keep = (l: string): void => {
        total++;
        if (kept.length < MAX_SECTION_LINES) kept.push(l);
      };
      while (i < lines.length && (oldLeft > 0 || newLeft > 0)) {
        const l = lines[i]!;
        const c = l.charAt(0);
        if (c === '+') {
          added++;
          newLeft--;
          keep(l);
        } else if (c === '-') {
          removed++;
          oldLeft--;
          keep(l);
        } else if (c === ' ' || l === '') {
          // an empty line is a context line whose single space was stripped
          oldLeft--;
          newLeft--;
          keep(l === '' ? ' ' : l);
        } else if (c === '\\') {
          keep(l);
        } else {
          broken = true;
          break;
        }
        i++;
      }
      if (broken || oldLeft !== 0 || newLeft !== 0) {
        skipFile();
        break;
      }
      // "\ No newline at end of file" after the section's last line
      while (i < lines.length && lines[i]!.startsWith('\\')) {
        keep(lines[i]!);
        i++;
      }
      out.push({
        path, oldStart, oldLines, newStart, newLines, added, removed, lines: kept,
        ...(total > kept.length ? { omitted: total - kept.length } : {}),
        ...(fileState !== undefined ? { fileState } : {}),
      });
    }
  }
  return out;
}

function range(s: DiffSection): [number, number] {
  return [s.oldStart, s.oldStart + Math.max(s.oldLines, 1) - 1];
}

function sameSection(a: DiffSection, b: DiffSection): boolean {
  if (a.binary === true || b.binary === true) return a.binary === b.binary;
  const [alo, ahi] = range(a);
  const [blo, bhi] = range(b);
  return alo <= bhi && blo <= ahi;
}

function equal(a: DiffSection, b: DiffSection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What one check changes. A next section takes the lowest-id known section of its path, not yet
 * taken, whose old-line range overlaps its own; a known section nothing takes is withdrawn; a next
 * section that takes none is new, and shown until `limit` new ones were shown in this call. A
 * hidden section never produces an operation.
 */
export function reconcileSections(
  known: readonly KnownSection[],
  next: readonly DiffSection[],
  nextId: number,
  limit: number = MAX_NEW_SECTIONS_PER_CHECK,
): ReconcileResult {
  const ops: SectionOp[] = [];
  const out: KnownSection[] = [];
  const taken = new Set<number>();
  const byId = [...known].sort((a, b) => a.id - b.id);
  let id = nextId;
  let shownNew = 0;
  let hiddenNew = 0;
  const hiddenFiles = new Set<string>();

  for (const section of next) {
    const match = byId.find((k) => !taken.has(k.id) && k.section.path === section.path && sameSection(k.section, section));
    if (match !== undefined) {
      taken.add(match.id);
      if (match.shown && !equal(match.section, section)) ops.push({ op: 'update', id: match.id, section });
      out.push({ id: match.id, section, shown: match.shown });
      continue;
    }
    if (shownNew < limit) {
      shownNew++;
      ops.push({ op: 'add', id, section });
      out.push({ id, section, shown: true });
    } else {
      hiddenNew++;
      hiddenFiles.add(section.path);
      out.push({ id, section, shown: false });
    }
    id++;
  }
  for (const k of byId) {
    if (!taken.has(k.id) && k.shown) ops.push({ op: 'withdraw', id: k.id });
  }
  return {
    ops,
    known: out,
    nextId: id,
    overflow: hiddenNew > 0 ? { sections: hiddenNew, files: hiddenFiles.size } : undefined,
  };
}
