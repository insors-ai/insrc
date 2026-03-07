import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ManifestDep {
  name:     string;
  version?: string;
}

/**
 * Parse dependency declarations from any manifest file found in repoRoot.
 * Checks for package.json, go.mod, pyproject.toml, and requirements.txt.
 * Returns an empty array if none are found. Never throws.
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
