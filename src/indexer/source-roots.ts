/**
 * Per-language source-root detection for the cross-file resolver pass.
 * See plans/cross-file-references.md §2.
 *
 * Reads the repo's manifests + filesystem and reports where source code
 * lives by language. The cross-file pass uses this to map a Java/Scala
 * `import com.example.Foo` to `<root>/com/example/Foo.java`, a Python
 * `from foo.bar import x` to `<root>/foo/bar.py`, etc.
 *
 * Best-effort: missing manifests fall back to per-language conventions.
 * Returns empty lists / null for languages with no detected roots.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, isAbsolute, resolve as resolvePath } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceRoots {
  /** Directories under which `package com.x.y;` -> `com/x/y/Foo.java`. */
  readonly java:       readonly string[];
  /** Same shape as Java; Scala 2.13 / Scala 3 cross-build dirs included. */
  readonly scala:      readonly string[];
  /** Directories that contain top-level Python packages. */
  readonly python:     readonly string[];
  /** go.mod info -- needed to strip the import-path prefix. */
  readonly go:         GoSourceInfo | null;
  /** tsconfig baseUrl + paths map. */
  readonly typescript: TsSourceInfo | null;
  /** Mirrors the TS slot when a jsconfig.json or tsconfig.json applies to JS too. */
  readonly javascript: TsSourceInfo | null;
}

export interface GoSourceInfo {
  readonly repoRoot:   string;
  /** From `module github.com/foo/bar` in go.mod. */
  readonly modulePath: string;
}

export interface TsSourceInfo {
  /** Absolute path of compilerOptions.baseUrl (defaults to tsconfig dir). */
  readonly baseUrl: string;
  /** compilerOptions.paths -- pattern -> list of target globs. */
  readonly paths:   ReadonlyMap<string, readonly string[]>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectSourceRoots(repoRoot: string): SourceRoots {
  return {
    java:       detectJavaRoots(repoRoot),
    scala:      detectScalaRoots(repoRoot),
    python:     detectPythonRoots(repoRoot),
    go:         detectGoRoot(repoRoot),
    typescript: detectTsRoot(repoRoot),
    javascript: detectJsRoot(repoRoot),
  };
}

// ---------------------------------------------------------------------------
// Java -- pom.xml / build.gradle{,.kts}; convention `src/main/java`
// ---------------------------------------------------------------------------

function detectJavaRoots(repoRoot: string): readonly string[] {
  return detectJvmRoots(repoRoot, 'java');
}

function detectScalaRoots(repoRoot: string): readonly string[] {
  // SBT cross-build dirs sit alongside `src/main/scala`. Probe each.
  const baseRoots = detectJvmRoots(repoRoot, 'scala');
  const expanded = new Set<string>(baseRoots);
  for (const root of baseRoots) {
    const parent = root.endsWith('/scala') ? root.slice(0, -'/scala'.length) : null;
    if (parent === null) continue;
    for (const variant of ['scala-2.13', 'scala-3', 'scala-2.12', 'scala-2']) {
      const candidate = join(parent, variant);
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        expanded.add(candidate);
      }
    }
  }
  return Array.from(expanded);
}

/**
 * Shared Java + Scala detection: walks pom.xml `<modules>` recursively,
 * reads gradle source dirs, and falls back to the convention
 * `src/main/<lang>` when no manifest applies.
 */
function detectJvmRoots(repoRoot: string, lang: 'java' | 'scala'): readonly string[] {
  const roots = new Set<string>();
  const visited = new Set<string>();

  const visit = (dir: string): void => {
    if (visited.has(dir)) return;
    visited.add(dir);

    const pom = join(dir, 'pom.xml');
    if (existsSync(pom)) {
      const text = safeRead(pom);
      const sourceDir = parsePomSourceDirectory(text) ?? `src/main/${lang}`;
      const abs = resolvePath(dir, sourceDir);
      if (existsSync(abs)) roots.add(abs);

      // <modules>...<module>child</module>...</modules> -- recurse
      for (const child of parsePomModules(text)) {
        const childDir = resolvePath(dir, child);
        visit(childDir);
      }
      return;
    }

    const gradle = ['build.gradle.kts', 'build.gradle']
      .map(n => join(dir, n))
      .find(p => existsSync(p));
    if (gradle !== undefined) {
      const text = safeRead(gradle);
      const customDirs = parseGradleSrcDirs(text, lang);
      if (customDirs.length > 0) {
        for (const d of customDirs) {
          const abs = resolvePath(dir, d);
          if (existsSync(abs)) roots.add(abs);
        }
      } else {
        const conv = join(dir, 'src/main', lang);
        if (existsSync(conv)) roots.add(conv);
      }
      return;
    }

    const sbt = join(dir, 'build.sbt');
    if (existsSync(sbt)) {
      // SBT defaults match the Maven layout; pick those up.
      const conv = join(dir, 'src/main', lang);
      if (existsSync(conv)) roots.add(conv);
      return;
    }

    const mill = join(dir, 'build.sc');
    if (existsSync(mill)) {
      const conv = join(dir, 'src/main', lang);
      if (existsSync(conv)) roots.add(conv);
      return;
    }

    // No manifest -- pure convention fallback.
    const conv = join(dir, 'src/main', lang);
    if (existsSync(conv)) roots.add(conv);
  };

  visit(repoRoot);
  return Array.from(roots);
}

function parsePomSourceDirectory(text: string): string | null {
  const m = text.match(/<sourceDirectory>([^<]+)<\/sourceDirectory>/);
  return m?.[1]?.trim() ?? null;
}

function parsePomModules(text: string): readonly string[] {
  const block = text.match(/<modules>([\s\S]*?)<\/modules>/);
  if (!block?.[1]) return [];
  const children: string[] = [];
  for (const m of block[1].matchAll(/<module>([^<]+)<\/module>/g)) {
    const name = m[1]?.trim();
    if (name && name !== '') children.push(name);
  }
  return children;
}

/**
 * Best-effort parse of source dirs from Gradle Groovy or Kotlin DSL.
 * Two shapes worth catching:
 *
 *   1. dotted property:    `<lang>.srcDirs = ['custom/src']`
 *                          `<lang>.srcDirs("custom/src")`
 *   2. nested block:       `<lang> { srcDirs("a", "b") }`
 *                          (typical Kotlin DSL inside `sourceSets { main { java { ... } } }`)
 *
 * Anything fancier (variable substitution, plus-equals appends to non-
 * trivial expressions) is documented best-effort.
 */
function parseGradleSrcDirs(text: string, lang: 'java' | 'scala'): readonly string[] {
  const dirs: string[] = [];
  const consume = (rhs: string): void => {
    for (const sm of rhs.matchAll(/['"]([^'"]+)['"]/g)) {
      const v = sm[1];
      if (v && v !== '') dirs.push(v);
    }
  };

  // Form 1: `<lang>.srcDirs ...`
  const dotted = new RegExp(`\\b${lang}\\.srcDirs?\\s*(?:=|\\+=|\\()\\s*([^\\n]+)`, 'g');
  for (const m of text.matchAll(dotted)) {
    consume(m[1] ?? '');
  }

  // Form 2: `<lang> { ... srcDirs(...) ... }` -- extract the lang block
  // body, then scan it for srcDirs calls.
  const block = extractBracedBlock(text, lang);
  if (block !== null) {
    const inner = new RegExp(`\\bsrcDirs?\\s*(?:=|\\+=|\\()\\s*([^\\n]+)`, 'g');
    for (const m of block.matchAll(inner)) {
      consume(m[1] ?? '');
    }
  }

  return dirs;
}

/**
 * Find `<keyword> { ... }` and return the body. Walks brace depth so
 * nested closures don't confuse the close-match. Returns null when the
 * keyword isn't present.
 *
 * Mirrors the helper in `indexer/manifest.ts`; kept inline so this
 * module has no dependency on manifest parsing.
 */
function extractBracedBlock(text: string, keyword: string): string | null {
  const re = new RegExp(`\\b${keyword}\\s*\\{`, 'g');
  const m = re.exec(text);
  if (m === null) return null;
  let depth = 1;
  const start = m.index + m[0].length;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Python -- probe for __init__.py and `src/` layout
// ---------------------------------------------------------------------------

const PY_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.venv', 'venv', '.env', '.tox', '.eggs', '.mypy_cache', '.pytest_cache',
  'target', 'site-packages',
]);

/**
 * Python source roots are the *parents* of top-level packages -- i.e. the
 * directories you'd add to PYTHONPATH so `import foo.bar` works.
 *
 * Strategy: scan up to MAX_DEPTH levels under repoRoot looking for the
 * shallowest `__init__.py` files; the parent of each such file is a
 * candidate root. Always include `repoRoot` and `repoRoot/src` (when
 * present) as fallback roots.
 */
function detectPythonRoots(repoRoot: string): readonly string[] {
  const roots = new Set<string>();
  const MAX_DEPTH = 4;

  const visit = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    if (entries.includes('__init__.py')) {
      // Found a package -- its parent is a source root. Stop descending
      // into packages within packages (they're not extra roots).
      const parent = resolvePath(dir, '..');
      if (existsSync(parent)) roots.add(parent);
      return;
    }
    for (const name of entries) {
      if (PY_IGNORE.has(name)) continue;
      if (name.startsWith('.') && depth > 0) continue;
      const child = join(dir, name);
      try {
        if (statSync(child).isDirectory()) visit(child, depth + 1);
      } catch { /* ignore */ }
    }
  };
  visit(repoRoot, 0);

  // Always include repoRoot + src/ fallbacks even when __init__.py wasn't
  // found (PEP 420 namespace packages don't carry an __init__.py).
  roots.add(repoRoot);
  const srcDir = join(repoRoot, 'src');
  if (existsSync(srcDir) && statSync(srcDir).isDirectory()) {
    roots.add(srcDir);
  }

  return Array.from(roots);
}

// ---------------------------------------------------------------------------
// Go -- read go.mod's `module` directive
// ---------------------------------------------------------------------------

function detectGoRoot(repoRoot: string): GoSourceInfo | null {
  const goMod = join(repoRoot, 'go.mod');
  if (!existsSync(goMod)) return null;
  const text = safeRead(goMod);
  // First non-empty `module <path>` line.
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('module ')) continue;
    const modulePath = line.slice('module '.length).trim();
    if (modulePath !== '') {
      return { repoRoot, modulePath };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript -- read tsconfig.json or jsconfig.json
// ---------------------------------------------------------------------------

function detectTsRoot(repoRoot: string): TsSourceInfo | null {
  const candidates = ['tsconfig.json', 'tsconfig.base.json'];
  for (const name of candidates) {
    const path = join(repoRoot, name);
    if (existsSync(path)) {
      const info = readTsConfig(path);
      if (info !== null) return info;
    }
  }
  return null;
}

function detectJsRoot(repoRoot: string): TsSourceInfo | null {
  const jsconfig = join(repoRoot, 'jsconfig.json');
  if (existsSync(jsconfig)) {
    const info = readTsConfig(jsconfig);
    if (info !== null) return info;
  }
  // Fall back to the TS config -- TS's `allowJs` makes the same baseUrl /
  // paths apply to .js files too.
  return detectTsRoot(repoRoot);
}

function readTsConfig(path: string): TsSourceInfo | null {
  const text = safeRead(path);
  if (text === '') return null;
  let parsed: { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
  try {
    parsed = JSON.parse(stripJsonComments(text));
  } catch {
    return null;
  }
  const opts = parsed.compilerOptions ?? {};
  const dir = isAbsolute(path) ? resolvePath(path, '..') : resolvePath(path, '..');
  const baseUrl = opts.baseUrl !== undefined && opts.baseUrl !== ''
    ? resolvePath(dir, opts.baseUrl)
    : dir;
  const paths = new Map<string, readonly string[]>();
  for (const [pattern, targets] of Object.entries(opts.paths ?? {})) {
    if (Array.isArray(targets)) {
      paths.set(pattern, targets.slice());
    }
  }
  return { baseUrl, paths };
}

/**
 * Strip `//` and block comments from JSON text -- tsconfig.json files
 * commonly use them and the standard `JSON.parse` rejects them.
 */
function stripJsonComments(text: string): string {
  // Order matters: block comments first, then line comments.
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlock.replace(/(^|[^:"\\])\/\/[^\n]*/g, (_match, prefix: string) => prefix);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeRead(path: string): string {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}
