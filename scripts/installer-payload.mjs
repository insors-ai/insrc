/** Publisher filesystem closure; never used by consumers. */
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
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
  const files = new Map(), stack = new Set(), entries = [], linked = new Map();
  const unchanged = (before, after) => after.isFile() && ['dev', 'ino', 'nlink', 'mode', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs'].every(key => before[key] === after[key]);
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
      if (!stat.isFile()) throw new Error('Payload special file is forbidden');
      validPath(target);
      const identity = lstatSync(actual, { bigint: true });
      if (!identity.isFile() || ['dev', 'ino', 'uid', 'gid', 'nlink', 'size', 'mode'].some(key => identity[key] !== BigInt(stat[key]))) throw new Error('Payload source changed during traversal');
      if (stat.nlink !== 1) {
        const key = `${identity.dev}:${identity.ino}`, group = linked.get(key);
        if (group && !unchanged(group.identity, identity)) throw new Error('Hardlinked payload source changed during collection');
        if (group) group.paths.add(actual);
        else linked.set(key, { identity, paths: new Set([actual]) });
      }
      entries.push({ source, actual, target, stat, identity });
    }
  }
  visit(directory, prefix);
  // Linux node-gyp links Release/obj.target outputs to their final names.
  // Snapshot only complete inode groups in this collected tree. Repeated
  // symlink visits never account for another physical alias; an uncollected
  // alias (including one outside the source root) remains forbidden.
  for (const group of linked.values()) if (group.identity.nlink !== BigInt(group.paths.size)) throw new Error('Payload hardlink has unaccounted source aliases');
  for (const { source, actual, target, stat, identity } of entries) {
    admitFile?.(actual, target, stat);
    if (assertContained(root, source) !== actual || assertContained(root, actual) !== actual) throw new Error('Payload source path changed before reading');
    let bytes;
    const fd = openSync(actual, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (!unchanged(identity, fstatSync(fd, { bigint: true }))) throw new Error('Payload source changed before reading');
      bytes = readFileSync(fd);
      if (!unchanged(identity, fstatSync(fd, { bigint: true })) || !unchanged(identity, lstatSync(actual, { bigint: true }))
        || assertContained(root, source) !== actual || assertContained(root, actual) !== actual) throw new Error('Payload source changed during reading');
    } finally {
      try { closeSync(fd); }
      catch (cause) { throw Object.assign(new Error('Publisher source descriptor closure is unconfirmed', { cause }), { code: 'resource-close-uncertain' }); }
    }
    files.set(target, { bytes, mode: (stat.mode & 0o111) ? 0o755 : 0o644, source: actual });
  }
  for (const group of linked.values()) for (const actual of group.paths) {
    assertContained(root, actual);
    if (!unchanged(group.identity, lstatSync(actual, { bigint: true }))) throw new Error('Hardlinked payload source changed after reading');
  }
  return files;
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
        packageFiles = collectTree(root, join(actual, 'package.json'), `${destination}/package.json`, { admitFile });
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
