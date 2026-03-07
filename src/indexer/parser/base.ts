import type { Entity, Relation, Language } from '../../shared/types.js';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Stable entity ID generation
// ---------------------------------------------------------------------------

/**
 * Produces a deterministic 32-char hex ID for an entity.
 * The ID is stable across re-indexes as long as repo/file/kind/name are the same.
 */
export function makeEntityId(
  repo: string,
  file: string,
  kind: string,
  name: string,
): string {
  return createHash('sha256')
    .update(`${repo}\x00${file}\x00${kind}\x00${name}`)
    .digest('hex')
    .slice(0, 32);
}

// ---------------------------------------------------------------------------
// Parser output types
// ---------------------------------------------------------------------------

/**
 * Raw result from a parser pass — entities and unresolved relations.
 * Relations at this stage may have `resolved: false` and `to` set to the
 * raw import specifier or symbol name; the Resolver converts them to entity IDs.
 */
export interface ParseResult {
  entities:  Entity[];
  relations: Relation[];
}

// ---------------------------------------------------------------------------
// Parser interface
// ---------------------------------------------------------------------------

export interface CodeParser {
  /** File extensions this parser handles, e.g. ['.ts', '.tsx', '.js', '.jsx'] */
  readonly extensions: string[];
  /** Language tag for all entities produced by this parser */
  readonly language: Language;
  /**
   * Parse source text from a single file and return all entities + raw relations.
   *
   * @param filePath  Absolute path to the file on disk
   * @param source    Full source text of the file
   * @param repo      Absolute path to the repo root
   */
  parse(filePath: string, source: string, repo: string): ParseResult;
}
