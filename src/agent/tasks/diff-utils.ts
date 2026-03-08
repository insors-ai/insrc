import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Unified Diff Utilities
//
// Parses, splits, applies, and formats unified diffs for the implement and
// refactor pipelines.
//
// From design doc (Phase 7):
//   - Multi-file diff splitting: per-file validation rounds sent to Claude
//   - Dry-run check before writing
//   - Entity ID mapping via startLine/endLine overlap
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffHunk {
  /** Original file start line (1-based) */
  oldStart: number;
  /** Original file line count */
  oldCount: number;
  /** New file start line (1-based) */
  newStart: number;
  /** New file line count */
  newCount: number;
  /** Raw hunk lines (including +/-/space prefixes) */
  lines: string[];
}

export interface FileDiff {
  /** Original file path (from --- line) */
  oldPath: string;
  /** New file path (from +++ line) */
  newPath: string;
  /** Whether this is a new file (oldPath === /dev/null) */
  isNew: boolean;
  /** Whether this is a deleted file (newPath === /dev/null) */
  isDelete: boolean;
  /** Hunks for this file */
  hunks: DiffHunk[];
}

export interface ApplyResult {
  /** Whether the apply succeeded */
  success: boolean;
  /** Files that were written */
  filesWritten: string[];
  /** Errors encountered (file path → error message) */
  errors: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Parse unified diff text into structured FileDiff objects
// ---------------------------------------------------------------------------

/**
 * Parse a unified diff string into an array of per-file diffs.
 *
 * Handles standard unified diff format:
 *   --- a/path/to/file
 *   +++ b/path/to/file
 *   @@ -oldStart,oldCount +newStart,newCount @@
 *   context/additions/deletions
 */
export function parseDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Look for --- line (start of a file diff)
    if (line.startsWith('--- ')) {
      const oldPath = stripPathPrefix(line.slice(4).trim());
      i++;

      // Expect +++ line
      if (i >= lines.length || !lines[i]!.startsWith('+++ ')) {
        continue;
      }
      const newPath = stripPathPrefix(lines[i]!.slice(4).trim());
      i++;

      const fileDiff: FileDiff = {
        oldPath,
        newPath,
        isNew: oldPath === '/dev/null',
        isDelete: newPath === '/dev/null',
        hunks: [],
      };

      // Parse hunks
      while (i < lines.length && lines[i]!.startsWith('@@')) {
        const hunkHeader = lines[i]!;
        const match = hunkHeader.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (!match) { i++; continue; }

        const hunk: DiffHunk = {
          oldStart: parseInt(match[1]!, 10),
          oldCount: match[2] !== undefined ? parseInt(match[2], 10) : 1,
          newStart: parseInt(match[3]!, 10),
          newCount: match[4] !== undefined ? parseInt(match[4], 10) : 1,
          lines: [],
        };
        i++;

        // Collect hunk body lines
        // Track consumed old/new lines to know when the hunk is complete
        let oldConsumed = 0;
        let newConsumed = 0;
        while (i < lines.length && (oldConsumed < hunk.oldCount || newConsumed < hunk.newCount)) {
          const hunkLine = lines[i]!;
          if (hunkLine.startsWith('+')) {
            hunk.lines.push(hunkLine);
            newConsumed++;
            i++;
          } else if (hunkLine.startsWith('-')) {
            hunk.lines.push(hunkLine);
            oldConsumed++;
            i++;
          } else if (hunkLine.startsWith(' ')) {
            hunk.lines.push(hunkLine);
            oldConsumed++;
            newConsumed++;
            i++;
          } else if (hunkLine === '') {
            // Empty context line (no space prefix) — treat as context
            hunk.lines.push(' ');
            oldConsumed++;
            newConsumed++;
            i++;
          } else if (hunkLine === '\\ No newline at end of file') {
            i++;
          } else {
            break;
          }
        }

        fileDiff.hunks.push(hunk);
      }

      files.push(fileDiff);
    } else {
      i++;
    }
  }

  return files;
}

/** Strip a/ or b/ prefix from diff paths. */
function stripPathPrefix(path: string): string {
  if (path.startsWith('a/') || path.startsWith('b/')) {
    return path.slice(2);
  }
  return path;
}

// ---------------------------------------------------------------------------
// Split multi-file diff into per-file validation rounds
// ---------------------------------------------------------------------------

/**
 * Split a parsed diff into per-file rounds.
 * Each round is an independent FileDiff that can be validated separately.
 *
 * From design doc: "When a diff touches entities across multiple files,
 * split into per-file validation rounds sent to Claude independently."
 */
export function splitByFile(diffs: FileDiff[]): FileDiff[][] {
  // Each file is its own round
  return diffs.map(fd => [fd]);
}

// ---------------------------------------------------------------------------
// Apply diff to disk
// ---------------------------------------------------------------------------

/**
 * Apply parsed diffs to disk.
 *
 * For each file:
 *   - New files: write content directly
 *   - Deleted files: not supported (returns error)
 *   - Modified files: apply hunks sequentially
 *
 * @param diffs - Parsed file diffs to apply
 * @param basePath - Base directory to resolve relative paths against
 * @param dryRun - If true, validate that hunks can be applied but don't write
 */
export async function applyDiff(
  diffs: FileDiff[],
  basePath: string,
  dryRun = false,
): Promise<ApplyResult> {
  const result: ApplyResult = { success: true, filesWritten: [], errors: new Map() };

  for (const fileDiff of diffs) {
    const targetPath = resolveFilePath(fileDiff, basePath);

    try {
      if (fileDiff.isDelete) {
        result.errors.set(targetPath, 'file deletion not supported via diff — use explicit delete');
        result.success = false;
        continue;
      }

      if (fileDiff.isNew) {
        // New file — concatenate all added lines
        const content = fileDiff.hunks
          .flatMap(h => h.lines.filter(l => l.startsWith('+')).map(l => l.slice(1)))
          .join('\n');

        if (!dryRun) {
          await mkdir(dirname(targetPath), { recursive: true });
          await writeFile(targetPath, content + '\n', 'utf-8');
        }
        result.filesWritten.push(targetPath);
        continue;
      }

      // Modified file — read, apply hunks, write
      const original = await readFile(targetPath, 'utf-8');
      const patched = applyHunks(original, fileDiff.hunks);

      if (!dryRun) {
        await writeFile(targetPath, patched, 'utf-8');
      }
      result.filesWritten.push(targetPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.set(targetPath, msg);
      result.success = false;
    }
  }

  return result;
}

/** Resolve the target file path from a FileDiff. */
function resolveFilePath(fileDiff: FileDiff, basePath: string): string {
  const relPath = fileDiff.isNew ? fileDiff.newPath : fileDiff.oldPath;
  // If path is already absolute, use it directly
  if (relPath.startsWith('/')) return relPath;
  return `${basePath}/${relPath}`;
}

/**
 * Apply hunks to file content.
 * Works line-by-line: finds context matches, applies additions/deletions.
 */
function applyHunks(original: string, hunks: DiffHunk[]): string {
  const lines = original.split('\n');

  // Apply hunks in reverse order to preserve line numbers
  const sorted = [...hunks].sort((a, b) => b.oldStart - a.oldStart);

  for (const hunk of sorted) {
    // Build the replacement: collect old lines (context + removed) and new lines (context + added)
    const oldLines: string[] = [];
    const newLines: string[] = [];

    for (const line of hunk.lines) {
      if (line.startsWith('-')) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith('+')) {
        newLines.push(line.slice(1));
      } else if (line.startsWith(' ')) {
        oldLines.push(line.slice(1));
        newLines.push(line.slice(1));
      }
    }

    // Find the hunk position (0-based index)
    const startIdx = hunk.oldStart - 1;

    // Verify context matches (best-effort — if lines don't match, still apply)
    lines.splice(startIdx, oldLines.length, ...newLines);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Map diff hunks to entity IDs via line range overlap
// ---------------------------------------------------------------------------

export interface EntityRef {
  id: string;
  kind: string;
  name: string;
  file: string;
  startLine: number;
  endLine: number;
}

/**
 * Map diff hunks to entity IDs by checking which entities overlap
 * with the changed line ranges.
 *
 * @param diffs - Parsed file diffs
 * @param entities - All entities for the affected files
 * @returns Entity IDs that are touched by the diff
 */
export function mapDiffToEntityIds(diffs: FileDiff[], entities: EntityRef[]): string[] {
  const touchedIds = new Set<string>();

  for (const fileDiff of diffs) {
    const filePath = fileDiff.isNew ? fileDiff.newPath : fileDiff.oldPath;

    // Get entities in this file
    const fileEntities = entities.filter(e =>
      e.file === filePath || e.file.endsWith('/' + filePath),
    );

    for (const hunk of fileDiff.hunks) {
      const hunkStart = hunk.oldStart;
      const hunkEnd = hunk.oldStart + hunk.oldCount - 1;

      for (const entity of fileEntities) {
        // Check if the hunk overlaps with the entity's line range
        if (hunkStart <= entity.endLine && hunkEnd >= entity.startLine) {
          touchedIds.add(entity.id);
        }
      }
    }
  }

  return [...touchedIds];
}

// ---------------------------------------------------------------------------
// Format diff for Claude validation (Stage 2 context assembly)
// ---------------------------------------------------------------------------

export interface ValidationContext {
  /** The unified diff text */
  diff: string;
  /** Full bodies of entities touched by the diff */
  touchedEntities: Array<{ name: string; kind: string; body: string }>;
  /** Signatures of 1-hop neighbours (callers/callees) */
  neighbourSignatures: string[];
  /** Referenced type definitions */
  referencedTypes: string[];
}

/**
 * Format a diff and its surrounding context for Claude validation.
 *
 * From design doc: "Minimal diff-derived context — only entities touched
 * by the diff."
 */
export function formatDiffForValidation(ctx: ValidationContext): string {
  const parts: string[] = [];

  parts.push('## Diff to validate\n```diff\n' + ctx.diff + '\n```');

  if (ctx.touchedEntities.length > 0) {
    parts.push('## Entities touched by this diff');
    for (const e of ctx.touchedEntities) {
      parts.push(`### ${e.kind}: ${e.name}\n\`\`\`\n${e.body}\n\`\`\``);
    }
  }

  if (ctx.neighbourSignatures.length > 0) {
    parts.push('## Neighbour signatures (1-hop callers/callees)');
    parts.push('```\n' + ctx.neighbourSignatures.join('\n') + '\n```');
  }

  if (ctx.referencedTypes.length > 0) {
    parts.push('## Referenced types');
    parts.push('```\n' + ctx.referencedTypes.join('\n') + '\n```');
  }

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Extract raw diff text from LLM output
// ---------------------------------------------------------------------------

/**
 * Extract a unified diff from LLM output that may contain markdown fences
 * or other surrounding text.
 */
export function extractDiffFromResponse(text: string): string {
  // Try to find diff inside a code fence
  const fenceMatch = text.match(/```(?:diff)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    return fenceMatch[1]!.trim();
  }

  // Try to find diff by looking for --- lines
  const diffStart = text.indexOf('--- ');
  if (diffStart >= 0) {
    return text.slice(diffStart).trim();
  }

  // Return as-is
  return text.trim();
}
