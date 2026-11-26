/** Publisher filesystem closure; never used by consumers. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import pathApi, { dirname, join, relative, resolve, sep } from 'node:path';
const portable = path => path.split(sep).join('/');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function isContainedPath(root, actual, paths = pathApi) {
  const rel = paths.relative(paths.resolve(root), paths.resolve(actual));
  return !paths.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${paths.sep}`);
}
export function assertContained(root, path) {
  const realRoot = realpathSync(root), actual = realpathSync(path), rel = relative(realRoot, actual);
  if (!isContainedPath(realRoot, actual) || resolve(actual) === resolve(realRoot) && resolve(path) !== resolve(root)) throw new Error(`Payload path escapes source root: ${path}`);
  return actual;
}
function validPath(path) {
  if (!path || /[\\:\x00-\x1f<>"|?*]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error(`Unsafe payload path: ${path}`);
}
export function collectTree(root, directory, prefix, { skipNodeModules = false, admitFile } = {}) {
  const files = new Map(), stack = new Set();
  function visit(source, target) {
    const actual = assertContained(root, source), stat = lstatSync(actual);
    if (stat.isDirectory()) {
      if (stack.has(actual)) throw new Error('Payload link cycle');
      stack.add(actual);
      for (const name of readdirSync(actual).sort()) {
        if (skipNodeModules && name === 'node_modules') continue;
        visit(join(actual, name), target ? `${target}/${name}` : name);
      }
      stack.delete(actual);
    } else {
      if (!stat.isFile() || stat.nlink !== 1) throw new Error('Payload special or hardlinked file is forbidden');
      validPath(target);
      admitFile?.(actual, target, stat);
      files.set(target, { bytes: readFileSync(actual), mode: (stat.mode & 0o111) ? 0o755 : 0o644, source: actual });
    }
  }
  visit(directory, prefix); return files;
}
/** Resolve actual installed production/optional/peer closure, retaining nested
 * versions and native sibling packages. Only in-root workspace links may expand. */
export function productionClosure(root, { admitFile } = {}) {
  root = realpathSync(root);
  const result = new Map(), visited = new Set();
  const workspacePaths = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).workspaces ?? []).map(path => resolve(root, path));
  function locate(name, issuer) {
    if (!/^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)) throw new Error('Invalid dependency name');
    let directory = issuer;
    while (true) {
      const candidate = join(directory, 'node_modules', name);
      if (existsSync(join(candidate, 'package.json'))) return candidate;
      if (directory === root) break;
      const parent = dirname(directory); if (parent === directory || relative(root, parent).startsWith('..')) break; directory = parent;
    }
    return undefined;
  }
  function dependencies(directory, packagePath, issuerDestination = '') {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    const optional = pkg.optionalDependencies ?? {};
    for (const name of new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(optional), ...Object.keys(pkg.peerDependencies ?? {})])) {
      const source = locate(name, directory);
      if (!source) {
        if (name in optional || pkg.peerDependenciesMeta?.[name]?.optional) continue;
        throw new Error(`Missing production dependency ${name} required by ${packagePath}`);
      }
      const actual = assertContained(root, source);
      const insideIssuer = relative(directory, source);
      const destination = portable(insideIssuer !== '..' && !insideIssuer.startsWith(`..${sep}`) ? join(issuerDestination, insideIssuer) : relative(root, source));
      if (visited.has(destination)) continue; visited.add(destination);
      let packageFiles;
      if (lstatSync(source).isSymbolicLink()) {
        if (!workspacePaths.includes(actual)) throw new Error('Dependency link is not a declared in-root workspace');
        const manifest = JSON.parse(readFileSync(join(actual, 'package.json'), 'utf8'));
        if (!Array.isArray(manifest.files)) throw new Error('Workspace must declare production files');
        admitFile?.(join(actual, 'package.json'), `${destination}/package.json`, lstatSync(join(actual, 'package.json')));
        packageFiles = new Map([[`${destination}/package.json`, { bytes: readFileSync(join(actual, 'package.json')), mode: 0o644, source: join(actual, 'package.json') }]]);
        for (const file of manifest.files) {
          validPath(file);
          for (const [name, value] of collectTree(root, join(actual, file), `${destination}/${file}`, { skipNodeModules: true, admitFile })) packageFiles.set(name, value);
        }
      } else packageFiles = collectTree(root, actual, destination, { skipNodeModules: true, admitFile });
      for (const [file, value] of packageFiles) {
        if (result.has(file)) throw new Error('Dependency payload collision'); result.set(file, value);
      }
      dependencies(actual, join(actual, 'package.json'), destination);
    }
  }
  dependencies(root, join(root, 'package.json')); return result;
}
export function inventoryFor(files) {
  const seen = new Set();
  return [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, file]) => {
    if (![0o644, 0o755].includes(file.mode) || !Buffer.isBuffer(file.bytes)) throw new Error('Invalid payload file record');
    validPath(path); const folded = path.normalize('NFC').toLowerCase();
    if (seen.has(folded)) throw new Error('Case-colliding inventory path'); seen.add(folded);
    return { path, bytes: file.bytes.length, sha256: sha256(file.bytes), mode: file.mode };
  });
}
export function validateEntrypoints(root, entries) {
  for (const path of entries) {
    validPath(path); const file = assertContained(root, join(root, path));
    if (!lstatSync(file).isFile()) throw new Error(`Missing production entrypoint: ${path}`);
  }
}
