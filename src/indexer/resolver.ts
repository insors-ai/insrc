import { existsSync, readdirSync } from 'node:fs';
import { basename, resolve, dirname, extname, join, relative, sep } from 'node:path';
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

  // Every resolved relation names its repository (Epic c2ba6fa6 s1), so the
  // store counts one it cannot write against this repository. Everything this
  // resolver decides is read from the file's own text -- the parser's own
  // resolutions, a call to a function of the same file, a relative import of a
  // file on disk -- so it is 'extracted' (s7).
  const withRepo = (rel: Relation): Relation => ({ ...rel, meta: { ...rel.meta, repo }, evidence: 'extracted' });

  return relations.map(rel => {
    if (rel.resolved) return withRepo(rel);

    // CALLS: resolve by matching callee name to local entities
    if (rel.kind === 'CALLS') {
      const targetId = localByName.get(rel.to);
      if (targetId && targetId !== rel.from) {
        return withRepo({ ...rel, to: targetId, resolved: true });
      }
      return rel; // keep unresolved — may resolve in cross-file pass
    }

    if (rel.kind !== 'IMPORTS') return rel;          // INHERITS/IMPLEMENTS: defer
    if (!rel.meta?.['isRelative']) return rel;       // external module: already handled by parser

    const specifier = rel.to;
    const absPath   = resolveImportPath(filePath, specifier, repo, language);

    // No file on disk for the specifier: kept pending, classed so it does not
    // count as awaiting a target that could ever be stored.
    if (!absPath) return { ...rel, meta: { ...rel.meta, class: 'no-candidate', reason: 'target-file-missing' } };

    // The target's path rides along: a row kept awaiting the file id is classed by it (s1/t8).
    const targetId = makeEntityId(repo, absPath, 'file', absPath);
    return withRepo({ ...rel, to: targetId, resolved: true, meta: { ...rel.meta, targetFile: absPath } });
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
export function resolveImportPath(
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

  // Rust module paths (s9): `self::x` (a `mod x;`), `crate::a::B`, `super::c`.
  if (language === 'rust' && /^(crate|self|super)::/.test(clean)) {
    return resolveRustModulePath(fromFile, clean, repo);
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

/**
 * Whether `path` is on disk under exactly this name, every directory below
 * `root` included: macOS's default file system ignores case, a module path
 * does not (`Config/mod.rs` is not `config/mod.rs`).
 */
function existsExact(path: string, root: string): boolean {
  if (!existsSync(path)) return false;
  try {
    for (let p = path; p.length > root.length && p !== dirname(p); p = dirname(p)) {
      if (!readdirSync(dirname(p)).includes(basename(p))) return false;
    }
    return true;
  } catch { return false; }
}

/** Where the files of `fromFile`'s crate hang from, and whether `fromFile` is that crate's root file. */
function rustCrateOf(fromFile: string, repo: string): { dir: string; isRoot: boolean } | null {
  let cargo: string | null = null;
  for (let dir = dirname(fromFile); dir.startsWith(repo); dir = dirname(dir)) {
    if (existsSync(join(dir, 'Cargo.toml'))) { cargo = dir; break; }
    if (dir === dirname(dir)) break;
  }
  if (cargo === null) return null;
  const rel = relative(cargo, fromFile).split(sep);
  // build.rs; a file directly in tests/, examples/, benches/ or src/bin/; or <that>/<name>/main.rs is a crate of its own.
  if (rel.length === 1) return { dir: cargo, isRoot: rel[0] === 'build.rs' };
  const top = rel[0] === 'src' && rel[1] === 'bin' ? 2 : (['tests', 'examples', 'benches'].includes(rel[0]!) ? 1 : 0);
  if (top > 0) {
    const topDir = join(cargo, ...rel.slice(0, top));
    if (rel.length === top + 1) return { dir: topDir, isRoot: true };
    const sub = join(topDir, rel[top]!);
    if (existsExact(join(sub, 'main.rs'), cargo)) return { dir: sub, isRoot: rel.length === top + 2 && rel[top + 1] === 'main.rs' };
    return { dir: topDir, isRoot: false };
  }
  const src = join(cargo, 'src');
  return { dir: src, isRoot: dirname(fromFile) === src && ['lib.rs', 'main.rs'].includes(basename(fromFile)) };
}

/**
 * The file a Rust module path names (Epic c2ba6fa6 s9). The path is read from
 * a base directory -- the crate's directory for `crate::` (src/, or its own
 * for a crate under src/bin/, tests/, examples/ or benches/), the declaring
 * module's directory for `self::`, one level up per `super::` -- and the
 * longest prefix of its segments that is a module file wins, `a/b.rs` before
 * `a/b/mod.rs` (so `mod util;` is util.rs over util/mod.rs). A file counts
 * only under its exact name. When no segment is a module file the path names
 * an item of the base module itself: for `crate::` and `super::` that
 * module's file is returned; for `self::` (or `crate::` from the crate root)
 * it is the importing file, so there is nothing to link.
 */
function resolveRustModulePath(fromFile: string, path: string, repo: string): string | null {
  const parts = path.split('::');
  const crate = rustCrateOf(fromFile, repo);
  const stem = basename(fromFile, '.rs');
  // A crate root's and a mod.rs's child modules sit beside it; any other module's in a directory named after it.
  const selfDir = crate?.isRoot === true || ['main', 'lib', 'mod'].includes(stem) ? dirname(fromFile) : join(dirname(fromFile), stem);
  let base: string;
  let i = 0;
  if (parts[0] === 'crate') {
    if (crate === null) return null;
    base = crate.dir; i = 1;
  } else {
    base = selfDir;
    for (; parts[i] === 'self' || parts[i] === 'super'; i++) if (parts[i] === 'super') base = dirname(base);
  }
  const segs = parts.slice(i);
  if (!base.startsWith(repo)) return null;

  // The longest module file wins; when that is the importing file, the path
  // names one of its own items and there is nothing to link.
  const found = (candidates: string[]): string | undefined => candidates.find(c => c.startsWith(repo) && existsExact(c, repo));
  for (let k = segs.length; k >= 1; k--) {
    const mod = join(base, ...segs.slice(0, k));
    const hit = found([`${mod}.rs`, join(mod, 'mod.rs')]);
    if (hit !== undefined) return hit === fromFile ? null : hit;
  }
  if (base === selfDir && !parts.includes('super') && parts[0] !== 'crate') return null;
  if (parts[0] === 'crate' && crate?.isRoot === true) return null;
  const root = found([`${base}.rs`, join(base, 'mod.rs'), join(base, 'lib.rs'), join(base, 'main.rs')]);
  return root === undefined || root === fromFile ? null : root;
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
  // c / cpp (s9): an #include names its file exactly, extension included, so
  // the one candidate is the path itself -- the default below.
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

/** The language an extension names, where the index reads it as code (Epic c2ba6fa6 s9). */
export function languageOfExtension(ext: string): Language | undefined {
  return EXT_TO_LANG[ext.toLowerCase()];
}

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
  // Epic c2ba6fa6 s9 (.h is read by the C++ reader: C and C++ are one family)
  '.rs':    'rust',
  '.cs':    'csharp',
  '.c':     'c',
  '.h':     'cpp', '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp', '.hxx': 'cpp',
};
