import { existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import type { Relation } from '../shared/types.js';
import { makeEntityId } from './parser/base.js';

/**
 * Resolve unresolved relations in a ParseResult.
 *
 * For relative IMPORTS (e.g. `../../shared/types.js`):
 *   - Compute the absolute path of the imported file
 *   - Try TypeScript/JavaScript extension variants
 *   - If the file exists on disk, mark the relation resolved with the File entity ID
 *
 * For INHERITS / IMPLEMENTS with raw class/interface names:
 *   - Left unresolved for a future cross-file pass (Phase 5)
 *
 * Does not touch the database — purely path-based, synchronous.
 */
export function resolveRelations(
  relations: Relation[],
  filePath:  string,
  repo:      string,
): Relation[] {
  return relations.map(rel => {
    if (rel.resolved) return rel;
    if (rel.kind !== 'IMPORTS') return rel;          // INHERITS/IMPLEMENTS: defer
    if (!rel.meta?.['isRelative']) return rel;       // external module: already handled by parser

    const specifier = rel.to;
    const absPath   = resolveImportPath(filePath, specifier, repo);

    if (!absPath) return rel; // can't resolve — keep unresolved

    const targetId = makeEntityId(repo, absPath, 'file', absPath);
    return { ...rel, to: targetId, resolved: true };
  });
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a relative import specifier to an absolute file path.
 * Handles TypeScript's convention of writing `.js` imports that map to `.ts` files.
 * Returns null if the file cannot be found.
 */
function resolveImportPath(
  fromFile:  string,
  specifier: string,
  repo:      string,
): string | null {
  const fromDir = dirname(fromFile);

  // Strip query strings / hashes (rare but possible)
  const clean = specifier.split('?')[0]?.split('#')[0] ?? specifier;

  // Candidate paths to probe (TypeScript remaps .js → .ts at build time)
  const candidates = buildCandidates(resolve(fromDir, clean));

  for (const candidate of candidates) {
    // Must be inside the repo to avoid leaking outside the graph scope
    if (!candidate.startsWith(repo)) continue;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const TS_EXTENSION_MAP: Record<string, string[]> = {
  '.js':  ['.ts', '.tsx', '.js', '.jsx'],
  '.jsx': ['.jsx', '.tsx', '.js', '.ts'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
  '':     ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'],
};

function buildCandidates(base: string): string[] {
  const ext   = extname(base);
  const stem  = base.slice(0, base.length - ext.length);
  const alts  = TS_EXTENSION_MAP[ext] ?? [ext];

  const candidates: string[] = alts.map(a =>
    a.startsWith('/') ? stem + a : stem + a,
  );

  // Also try bare path (no extension) → index variants
  if (ext) {
    const bare = TS_EXTENSION_MAP[''] ?? [];
    candidates.push(...bare.map(a => a.startsWith('/') ? base + a : base + a));
  }

  return candidates;
}
