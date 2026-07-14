import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ManifestDep {
  name:     string;
  version?: string;
}

/**
 * Parse dependency declarations from any manifest file found in repoRoot.
 * Checks for the existing language manifests (package.json, go.mod,
 * pyproject.toml, requirements.txt) plus the JVM toolchain manifests
 * added in plans/jvm-languages.md §3 (Maven pom.xml, Gradle build.gradle
 * + build.gradle.kts, SBT build.sbt, Mill build.sc).
 *
 * Returns an empty array if none are found. Never throws -- best-effort
 * extraction; analyzers tolerate partial dep lists.
 */
export function parseManifest(repoRoot: string): ManifestDep[] {
  try {
    const pkgJson = join(repoRoot, 'package.json');
    if (existsSync(pkgJson)) return parsePackageJson(pkgJson);

    const goMod = join(repoRoot, 'go.mod');
    if (existsSync(goMod)) return parseGoMod(goMod);

    const pyproject = join(repoRoot, 'pyproject.toml');
    if (existsSync(pyproject)) return parsePyproject(pyproject);

    const requirements = join(repoRoot, 'requirements.txt');
    if (existsSync(requirements)) return parseRequirements(requirements);

    // JVM manifests (plans/jvm-languages.md §3). Maven first since it's
    // the de-facto standard; then Gradle (kts before groovy because
    // newer projects prefer kts); then SBT / Mill for Scala.
    const pom = join(repoRoot, 'pom.xml');
    if (existsSync(pom)) return parsePom(pom);

    const gradleKts = join(repoRoot, 'build.gradle.kts');
    if (existsSync(gradleKts)) return parseGradle(gradleKts);

    const gradleGroovy = join(repoRoot, 'build.gradle');
    if (existsSync(gradleGroovy)) return parseGradle(gradleGroovy);

    const sbt = join(repoRoot, 'build.sbt');
    if (existsSync(sbt)) return parseSbt(sbt);

    const mill = join(repoRoot, 'build.sc');
    if (existsSync(mill)) return parseMill(mill);
  } catch {
    // Ignore parse errors — best effort
  }
  return [];
}

// ---------------------------------------------------------------------------
// Format-specific parsers
// ---------------------------------------------------------------------------

function parsePackageJson(path: string): ManifestDep[] {
  const raw  = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const deps: ManifestDep[] = [];

  for (const section of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const block = raw[section];
    if (block && typeof block === 'object') {
      for (const [name, version] of Object.entries(block)) {
        if (typeof version === 'string') deps.push({ name, version });
        else deps.push({ name });
      }
    }
  }
  return deps;
}

function parseGoMod(path: string): ManifestDep[] {
  const lines = readFileSync(path, 'utf8').split('\n');
  const deps:  ManifestDep[] = [];
  let   inRequire = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (line === 'require (') { inRequire = true;  continue; }
    if (line === ')')         { inRequire = false; continue; }

    if (inRequire || line.startsWith('require ')) {
      // Either inside a require block or single-line: require module version
      const text   = inRequire ? line : line.replace(/^require\s+/, '');
      const parts  = text.split(/\s+/);
      const name   = parts[0];
      const ver    = parts[1];
      if (name && !name.startsWith('//')) {
        if (ver !== undefined) deps.push({ name, version: ver });
        else deps.push({ name });
      }
    }
  }
  return deps;
}

function parsePyproject(path: string): ManifestDep[] {
  const content = readFileSync(path, 'utf8');
  const deps:    ManifestDep[] = [];

  // PEP 621: [project] dependencies = ["pkg>=1.0", ...]
  const pep621 = content.match(/\[project\][\s\S]*?^dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (pep621?.[1]) {
    for (const match of pep621[1].matchAll(/"([A-Za-z0-9_.-]+)/g)) {
      if (match[1]) deps.push({ name: match[1] });
    }
    return deps;
  }

  // Poetry: [tool.poetry.dependencies] name = "version"
  const poetryBlock = content.match(
    /\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\n\[|\Z)/,
  );
  if (poetryBlock?.[1]) {
    for (const line of poetryBlock[1].split('\n')) {
      const m = line.match(/^([A-Za-z0-9_.-]+)\s*=/);
      if (m?.[1] && m[1] !== 'python') {
        deps.push({ name: m[1] });
      }
    }
  }
  return deps;
}

function parseRequirements(path: string): ManifestDep[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('-'))
    .map(l => {
      const [nameVer] = l.split(/\s+/);
      const m = nameVer?.match(/^([A-Za-z0-9_.-]+)/);
      return m?.[1] ? { name: m[1] } : null;
    })
    .filter((d): d is ManifestDep => d !== null);
}

// ---------------------------------------------------------------------------
// JVM manifest parsers (Java + Scala)
// See plans/jvm-languages.md §3.
// ---------------------------------------------------------------------------

/**
 * Maven pom.xml. Walks `<dependency>` elements (ignores
 * `<dependencyManagement>`-only declarations). Substitutes
 * `${prop}`-style placeholders against same-pom `<properties>`
 * entries; multi-pom inheritance / parent BOM resolution deferred.
 *
 * Output format: `name = "<groupId>:<artifactId>"`,
 *                `version = "<version>"`.
 */
function parsePom(path: string): ManifestDep[] {
  const text = readFileSync(path, 'utf8');
  const deps: ManifestDep[] = [];

  // Collect top-level <properties> entries for ${var} substitution.
  const props = new Map<string, string>();
  const propsBlock = text.match(/<properties>([\s\S]*?)<\/properties>/);
  if (propsBlock?.[1] !== undefined) {
    for (const m of propsBlock[1].matchAll(/<([A-Za-z0-9_.-]+)>([^<]+)<\/\1>/g)) {
      const key = m[1]; const val = m[2];
      if (typeof key === 'string' && typeof val === 'string') {
        props.set(key, val.trim());
      }
    }
  }

  // Identify the <dependencyManagement> region so we can exclude its
  // dependencies from the runtime list.
  const depMgmtRanges: [number, number][] = [];
  for (const m of text.matchAll(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g)) {
    if (typeof m.index === 'number') {
      depMgmtRanges.push([m.index, m.index + m[0].length]);
    }
  }
  const insideDepMgmt = (idx: number): boolean =>
    depMgmtRanges.some(([s, e]) => idx >= s && idx <= e);

  for (const m of text.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    if (typeof m.index !== 'number' || insideDepMgmt(m.index)) { continue; }
    const inner = m[1] ?? '';
    const groupId    = inner.match(/<groupId>([^<]+)<\/groupId>/)?.[1]?.trim();
    const artifactId = inner.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]?.trim();
    const version    = inner.match(/<version>([^<]+)<\/version>/)?.[1]?.trim();
    if (typeof groupId !== 'string' || typeof artifactId !== 'string') { continue; }
    const name = `${expand(groupId, props)}:${expand(artifactId, props)}`;
    if (typeof version === 'string') {
      deps.push({ name, version: expand(version, props) });
    } else {
      deps.push({ name });
    }
  }
  return deps;
}

function expand(text: string, props: Map<string, string>): string {
  return text.replace(/\$\{([A-Za-z0-9_.-]+)\}/g, (_, key: string) => {
    return props.get(key) ?? `\${${key}}`;
  });
}

/**
 * Extract the braced body of a top-level `<keyword> { ... }` block,
 * walking braces to handle nested closures correctly. Returns null
 * when the keyword isn't found or the block is unterminated.
 */
function extractBracedBlock(text: string, keyword: string): string | null {
  const re = new RegExp(`\\b${keyword}\\s*\\{`, 'g');
  const m = re.exec(text);
  if (m === null) { return null; }
  let depth = 1;
  const start = m.index + m[0].length;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') { depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0) { return text.slice(start, i); }
    }
  }
  return null;
}

/**
 * Gradle build script (build.gradle Groovy DSL or build.gradle.kts
 * Kotlin DSL). Captures `<config> "group:artifact:version"` triples
 * inside a `dependencies { ... }` block, where `<config>` is one of
 * the standard configurations (implementation, api, testImplementation,
 * compileOnly, runtimeOnly, etc.).
 *
 * Variable substitution + `subprojects {}` blocks + version catalogs
 * (`libs.versions.toml`) are deferred to v2 -- v1 reports a
 * documented best-effort. Triples involving `${var}` substitution
 * are recorded as-is (no substitution attempted).
 */
function parseGradle(path: string): ManifestDep[] {
  const text = readFileSync(path, 'utf8');
  const deps: ManifestDep[] = [];

  // Find `dependencies {` at the top level, then walk braces to find
  // the matching close. Robust against nested closures inside the
  // block (e.g. `implementation('a:b') { exclude(...) }`).
  const block = extractBracedBlock(text, 'dependencies');
  if (block === null) { return deps; }

  const CONFIG_RE = /\b(?:implementation|api|testImplementation|testRuntimeOnly|testCompileOnly|compileOnly|compileOnlyApi|runtimeOnly|annotationProcessor|kapt|ksp|androidTestImplementation|debugImplementation|releaseImplementation)\b/;
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//') || !CONFIG_RE.test(line)) { continue; }
    // Match both Groovy single-quote + Kotlin double-quote string
    // literals: `'group:artifact:version'` or `"group:artifact:version"`.
    const stringMatch = line.match(/['"]([^'"]+)['"]/);
    if (stringMatch?.[1] === undefined) { continue; }
    const triple = stringMatch[1];
    // Ignore ${var}-only strings + relative project refs.
    if (triple.startsWith('project(') || triple.startsWith(':')) { continue; }
    const parts = triple.split(':');
    const group = parts[0]; const artifact = parts[1]; const version = parts[2];
    if (typeof group !== 'string' || typeof artifact !== 'string') { continue; }
    const name = `${group}:${artifact}`;
    if (typeof version === 'string' && version !== '') {
      deps.push({ name, version });
    } else {
      deps.push({ name });
    }
  }
  return deps;
}

/**
 * SBT build.sbt. Captures `libraryDependencies +=` and
 * `libraryDependencies ++= Seq(...)` declarations.
 *
 * Two operators:
 *   `%`  -- Java-style, exact artifact name
 *   `%%` -- Scala-style, appends the Scala binary version suffix
 *           (e.g. `_2.13` / `_3`). The suffix isn't applied here --
 *           the analyzer's later cross-build resolution handles it
 *           when the build's Scala version is known.
 */
function parseSbt(path: string): ManifestDep[] {
  const text = readFileSync(path, 'utf8');
  const deps: ManifestDep[] = [];

  // Match every `"group" %% "artifact" % "version"` triple anywhere
  // in the file. Permissive about whitespace and operator variation.
  const TRIPLE_RE = /"([^"]+)"\s*(%%?)\s*"([^"]+)"\s*%\s*"([^"]+)"/g;
  for (const m of text.matchAll(TRIPLE_RE)) {
    const group = m[1]; const op = m[2]; const artifact = m[3]; const version = m[4];
    if (typeof group !== 'string' || typeof artifact !== 'string'
      || typeof version !== 'string') { continue; }
    const name = op === '%%' ? `${group}:${artifact}_<scala>` : `${group}:${artifact}`;
    deps.push({ name, version });
  }
  return deps;
}

/**
 * Mill build.sc. Mill uses the `ivy"group::artifact:version"`
 * literal syntax. Like SBT, `::` between group and artifact applies
 * the Scala binary version suffix. The suffix isn't applied here
 * (cross-build resolution handles it later).
 */
function parseMill(path: string): ManifestDep[] {
  const text = readFileSync(path, 'utf8');
  const deps: ManifestDep[] = [];

  // ivy"group:artifact:version" or ivy"group::artifact:version".
  const IVY_RE = /ivy"([^":]+)(::?)([^":]+):([^"]+)"/g;
  for (const m of text.matchAll(IVY_RE)) {
    const group = m[1]; const sep = m[2]; const artifact = m[3]; const version = m[4];
    if (typeof group !== 'string' || typeof artifact !== 'string'
      || typeof version !== 'string') { continue; }
    const name = sep === '::' ? `${group}:${artifact}_<scala>` : `${group}:${artifact}`;
    deps.push({ name, version });
  }
  return deps;
}
