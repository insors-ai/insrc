import { existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import type { Entity, Relation, Language } from '../shared/types.js';
import { makeEntityId } from './parser/base.js';

/**
 * Resolve unresolved relations in a ParseResult.
 *
 * For relative IMPORTS:
 *   - Compute the absolute path of the imported file
 *   - Try the per-language extension candidate map
 *   - If the file exists on disk, mark the relation resolved with the File entity ID
 *
 * For CALLS with raw function/method names:
 *   - Match against entities parsed from the same file
 *   - If a unique match is found, resolve to the entity ID
 *
 * For INHERITS / IMPLEMENTS with raw class/interface names:
 *   - Left unresolved for the cross-file resolver pass.
 *   - See plans/cross-file-references.md.
 *
 * Does not touch the database — purely path-based, synchronous.
 *
 * KNOWN LIMITATION -- dynamic dispatch creates no CALLS edges.
 *
 *   Tree-sitter is a syntactic parser; it does not perform type
 *   inference. When the receiver of a method call is a union, an
 *   Optional, or a value reached through a runtime probe
 *   (`hasattr(obj, 'm') and obj.m()`, `getattr(obj, name)()`,
 *   `dispatch_table[k](...)`, etc.), the resolver cannot choose
 *   between candidate `m` methods on the union's members and
 *   conservatively emits NO edge.
 *
 *   Real example (surfaced by an end-to-end smoke test of the
 *   insrc_entity_callers MCP tool against insors-extraction's v2
 *   branch, 2026-06-14):
 *
 *     # insors/core/model/invoice/regions/regional_grn_factory.py:168-176
 *     def validate_region_compliance(cls, region: str,
 *           grn: Union[INGRN, EUGRN, UKGRN, USGRN, GRN]) -> Dict[str, Any]:
 *         if hasattr(grn, 'validate_receiving_compliance'):
 *             return grn.validate_receiving_compliance()
 *         return {"compliant": True, "issues": [], "warnings": []}
 *
 *   Effect: `insrc_entity_callers` for any of the four regional
 *   `validate_receiving_compliance` methods returns [] -- the static
 *   graph has no CALLS edge from `validate_region_compliance` to any
 *   of them, even though every real invocation in the codebase
 *   funnels through this dispatcher.
 *
 *   For now this is documented behavior. Future passes could:
 *     (a) emit heuristic edges to every member of a union type when
 *         the method name matches a declared member,
 *     (b) narrow unions through `hasattr` / `isinstance` guards
 *         using pure-syntactic analysis,
 *     (c) integrate a real Python type checker (mypy, pyright) for
 *         full receiver-type resolution.
 *
 *   None of these are in scope today; callers of `insrc_entity_callers`
 *   on dynamically-dispatched targets should expect empty results and
 *   fall back to grep / file search.
 */
export function resolveRelations(
  relations: Relation[],
  filePath:  string,
  repo:      string,
  entities?: Entity[],
): Relation[] {
  // Build a name→id lookup from entities in this file (for CALLS resolution)
  const localByName = new Map<string, string>();
  const ambiguous = new Set<string>();
  if (entities) {
    for (const e of entities) {
      if (e.file !== filePath) continue;
      if (e.kind === 'file' || e.kind === 'module') continue;
      if (ambiguous.has(e.name)) continue;
      if (localByName.has(e.name)) {
        // Ambiguous: multiple entities with same name in this file
        localByName.delete(e.name);
        ambiguous.add(e.name);
      } else {
        localByName.set(e.name, e.id);
      }
    }
  }

  const language = detectLanguage(filePath, entities);

  return relations.map(rel => {
    if (rel.resolved) return rel;

    // CALLS: resolve by matching callee name to local entities
    if (rel.kind === 'CALLS') {
      const targetId = localByName.get(rel.to);
      if (targetId && targetId !== rel.from) {
        return { ...rel, to: targetId, resolved: true };
      }
      return rel; // keep unresolved — may resolve in cross-file pass
    }

    if (rel.kind !== 'IMPORTS') return rel;          // INHERITS/IMPLEMENTS: defer
    if (!rel.meta?.['isRelative']) return rel;       // external module: already handled by parser

    const specifier = rel.to;
    const absPath   = resolveImportPath(filePath, specifier, repo, language);

    if (!absPath) return rel; // can't resolve — keep unresolved

    const targetId = makeEntityId(repo, absPath, 'file', absPath);
    return { ...rel, to: targetId, resolved: true };
  });
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a relative import specifier to an absolute file path using the
 * per-language extension candidate map.
 * Returns null if the file cannot be found.
 */
function resolveImportPath(
  fromFile:  string,
  specifier: string,
  repo:      string,
  language:  Language,
): string | null {
  const fromDir = dirname(fromFile);

  // Strip query strings / hashes (rare but possible)
  const clean = specifier.split('?')[0]?.split('#')[0] ?? specifier;

  // Python relative imports use dot-prefix semantics, not path-prefix:
  //   `.foo`     -> <fromDir>/foo.py | <fromDir>/foo/__init__.py
  //   `..pkg`    -> <parent>/pkg.py  | <parent>/pkg/__init__.py
  //   `.`        -> <fromDir>/__init__.py
  //   `..`       -> <parent>/__init__.py
  // The generic path-resolve flow can't model these (it would treat
  // `.foo` as a hidden filename in fromDir).
  if (language === 'python' && clean.startsWith('.')) {
    return resolvePythonRelativeImport(fromDir, clean, repo);
  }

  const candidates = buildCandidates(resolve(fromDir, clean), language);

  for (const candidate of candidates) {
    // Must be inside the repo to avoid leaking outside the graph scope
    if (!candidate.startsWith(repo)) continue;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve a Python relative-import specifier (dot-prefixed) to a file
 * path. Walks up `numDots - 1` parent directories from `fromDir`, then
 * probes for `<name>.py` or `<name>/__init__.py` (or just `__init__.py`
 * when the specifier has no name part).
 */
function resolvePythonRelativeImport(
  fromDir:   string,
  specifier: string,
  repo:      string,
): string | null {
  // Count leading dots; the remainder (after dots) is the dotted module name.
  let numDots = 0;
  while (numDots < specifier.length && specifier[numDots] === '.') {
    numDots++;
  }
  const remaining = specifier.slice(numDots);

  // 1 dot = same dir, 2 = parent, 3 = grandparent, ...
  let baseDir = fromDir;
  for (let i = 1; i < numDots; i++) {
    baseDir = dirname(baseDir);
  }

  const candidates: string[] = [];
  if (remaining === '') {
    // `from . import x` / `from .. import x` -- target is the package's
    // own __init__.py.
    candidates.push(resolve(baseDir, '__init__.py'));
  } else {
    const segments = remaining.split('.');
    const stem = resolve(baseDir, ...segments);
    candidates.push(stem + '.py');
    candidates.push(resolve(stem, '__init__.py'));
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith(repo)) continue;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-language extension candidate map
//
// Outer key: source-file language. Inner key: extension on the import
// specifier (or '' for an extensionless specifier). Value: the list of
// candidate suffixes to probe in order. A leading '/' on an entry means
// "append to the bare path" (used for index/__init__-style targets).
//
// Phase 0 ships the skeleton with TS/JS populated (current behaviour).
// Phase 1 fills in Python; later phases add the other languages.
// See plans/cross-file-references.md §0.5 / §1.
// ---------------------------------------------------------------------------

type ExtensionCandidates = Readonly<Record<string, readonly string[]>>;

const TS_CANDIDATES: ExtensionCandidates = {
  '.js':  ['.ts', '.tsx', '.js', '.jsx'],
  '.jsx': ['.jsx', '.tsx', '.js', '.ts'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
  '':     ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'],
};

const EXTENSION_MAP: Readonly<Partial<Record<Language, ExtensionCandidates>>> = {
  typescript: TS_CANDIDATES,
  javascript: TS_CANDIDATES,
  // python: filled in Phase 1
  // go / java / scala: filled in their respective phases (cross-file pass
  // handles JVM package-style imports rather than relative-path probing).
};

function buildCandidates(base: string, language: Language): string[] {
  const map = EXTENSION_MAP[language];
  if (!map) return [base];

  const ext  = extname(base);
  const stem = base.slice(0, base.length - ext.length);
  const alts = map[ext] ?? [ext];

  const candidates: string[] = alts.map(a =>
    a.startsWith('/') ? stem + a : stem + a,
  );

  // Also try bare path → index variants if we started with an extension
  if (ext) {
    const bare = map[''] ?? [];
    candidates.push(...bare.map(a => a.startsWith('/') ? base + a : base + a));
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Language detection — derive from a parsed file entity when available,
// otherwise fall back to extension-based mapping.
// ---------------------------------------------------------------------------

function detectLanguage(filePath: string, entities?: Entity[]): Language {
  if (entities) {
    const fileEntity = entities.find(e => e.kind === 'file' && e.file === filePath);
    if (fileEntity) return fileEntity.language;
  }
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext] ?? 'config';
}

const EXT_TO_LANG: Readonly<Record<string, Language>> = {
  '.ts':    'typescript', '.tsx': 'typescript',
  '.mts':   'typescript', '.cts': 'typescript',
  '.js':    'javascript', '.jsx': 'javascript',
  '.mjs':   'javascript', '.cjs': 'javascript',
  '.py':    'python',
  '.go':    'go',
  '.java':  'java',
  '.scala': 'scala', '.sc': 'scala',
};
