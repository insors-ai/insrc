/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import type { NativeAdapterIdentity } from './investigation-session.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';

/** Reviewed native execution roots. Reporting, workflow documents and semantic
 * grouping are not native capability configuration. No runtime code is executed
 * to discover this closure. TypeScript is already installed for this backend's build. */
export const INVESTIGATION_BOUNDARY_ROOTS = [
 'src/bin/insrc-review-bridge.ts', 'src/agent/providers/native-investigation-session.ts',
 'src/agent/providers/claude-investigation-session.ts', 'src/agent/providers/investigation-session.ts',
 'src/agent/providers/native-investigation-probe.ts', 'src/agent/providers/claude-investigation-qualification.ts',
 'src/agent/providers/native-investigation-installation.ts', 'src/agent/providers/investigation-boundary.ts',
 'src/shared/process-group.ts', 'src/daemon/review-investigation-bridge.ts',
 'src/daemon/review-investigation-probe-export.ts', 'src/daemon/review-investigation-probe-fixtures.ts',
 'src/daemon/review-investigation-gateway.ts', 'src/daemon/review-investigation-probe.ts',
 'src/daemon/review-investigation-adoption.ts', 'src/daemon/review-investigation-compact-adoption.ts'
] as const;
/** Explicit host ports, not an unknown dependency escape hatch. The private
 * facade returns data into the existing authoritative domain validators; its
 * grouping changes cannot broaden the child's registered capabilities. The CLI
 * invocation seam is pinned, while its unrelated chat/config dependencies stay
 * host application code. Current host-negative checks remain mandatory. */
const HOST_PORTS: Readonly<Record<string, 'exclude' | 'pin'>> = {
 'src/daemon/review-investigation-compact.ts': 'exclude',
 'src/agent/providers/cli-provider.ts': 'pin',
 // These authority entrypoints are pinned in full. Their registry, canonical
 // artifact and recovery ports are host application code, not native tools.
 'src/daemon/review-investigation-gateway.ts': 'pin',
 'src/daemon/review-investigation-probe.ts': 'pin',
 'src/daemon/review-investigation-probe-export.ts': 'pin',
 'src/daemon/review-investigation-adoption.ts': 'pin',
 'src/daemon/review-investigation-compact-adoption.ts': 'pin'
};
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
/** Private cwd is an invocation slot, not a new capability policy. Renewing a
 * matching probe must not require another default-activation approval. */
export function compactExecutionBoundaryDigest(identity:NativeAdapterIdentity,args:readonly string[],cwd:string,configuration:Readonly<Record<string,unknown>>,environment:NodeJS.ProcessEnv):string{
 const normalize=(value:unknown):unknown=>typeof value==='string'?value.replaceAll(cwd,'<isolated-cwd>'):Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k.replaceAll(cwd,'<isolated-cwd>'),normalize(v)])):value;
 const {executionBoundaryDigest:_,launchDigest:__,...stable}=identity;
 return digestValue(normalize({identity:stable,args,configuration,environment}));
}

export function investigationBoundaryManifest(root = fileURLToPath(new URL('../../../', import.meta.url))) {
 root = realpathSync(root);
 const compiled = !import.meta.url.endsWith('.ts'), files = new Map<string, string>(), packages = new Set<string>(), absentPackages = new Set<string>();
 let bytes = 0, count = 0;
 const add = (path: string) => {
  if (files.has(path)) return;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path || ++count > 20000 || (bytes += stat.size) > 256 * 1024 * 1024) throw Error('Unknown or unbounded review execution dependency');
  files.set(path, sha(readFileSync(path)));
 };
 const packageImage = (specifier: string, importer: string, optional = false) => {
  const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!;
  const require = createRequire(importer); let entry: string;
  try { entry = require.resolve(specifier); } catch {
   // Some dependency packages export only subpaths. Pin their complete image,
   // resolving the same Node lookup directories without evaluating an entry.
   const metadata = require.resolve.paths(name)?.map(path => join(path, name, 'package.json')).find(path => {
    try { return JSON.parse(readFileSync(path, 'utf8')).name === name; } catch { return false; }
   });
   if (!metadata) { if(optional){absentPackages.add(`${importer}:${name}`);return;} throw Error(`Unresolved review execution package: ${specifier}`); } entry = metadata;
  }
  let path = dirname(realpathSync(entry));
  for (;;) {
   try {
    const metadata = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as { name?: string; dependencies?: Record<string, string>;optionalDependencies?:Record<string,string>;peerDependencies?:Record<string,string> };
    if (metadata.name === name) {
     if (packages.has(path)) return; packages.add(path);
     const walk = (directory: string) => { for (const item of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, item.name);
      if (item.isSymbolicLink()) throw Error('Symlink in review execution package');
      if (item.isDirectory()) walk(file); else add(file);
     } }; walk(path);
     for (const dependency of Object.keys(metadata.dependencies ?? {}).sort()) packageImage(dependency, join(path, 'package.json'));
     for (const dependency of [...new Set([...Object.keys(metadata.optionalDependencies??{}),...Object.keys(metadata.peerDependencies??{})])].sort())packageImage(dependency,join(path,'package.json'),true);
     return;
    }
   } catch (cause) { if (!(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT')) throw cause; }
   const parent = dirname(path); if (parent === path) throw Error('Unknown review execution package layout'); path = parent;
  }
 };
 const visited = new Set<string>();
 const visit = (file: string) => {
  if (visited.has(file)) return; visited.add(file);
  const sourcePath = relative(root, file).replace(/^out\//, 'src/').replace(/\.js$/, '.ts');
  if (HOST_PORTS[sourcePath] === 'exclude') return;
  add(file); if (HOST_PORTS[sourcePath] === 'pin') return;
  const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const dependency = (name: string) => {
   if (isBuiltin(name)) return;
   if (name.startsWith('.')) {
    const path = resolve(dirname(file), compiled ? name : name.replace(/\.js$/, '.ts'));
    if (relative(root, path).startsWith('..')) throw Error('Review execution import escapes installation'); visit(path);
   } else if (!name.startsWith('/') && !name.includes(':')) packageImage(name, file);
   else throw Error('Unknown review execution import');
  };
  const scan = (node: ts.Node): void => {
   if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (clause?.isTypeOnly || clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length>0&&clause.namedBindings.elements.every(e => e.isTypeOnly)) return;
    if (!ts.isStringLiteral(node.moduleSpecifier)) throw Error('Unknown review execution import'); dependency(node.moduleSpecifier.text); return;
   }
   if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
    if (node.isTypeOnly) return;
    if (!ts.isStringLiteral(node.moduleSpecifier)) throw Error('Unknown review execution export'); dependency(node.moduleSpecifier.text); return;
   }
   if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
    const argument = node.arguments[0]; if (!argument || !ts.isStringLiteral(argument)) throw Error('Dynamic review execution import is not bounded'); dependency(argument.text);
   }
   ts.forEachChild(node, scan);
  }; scan(tree);
 };
 for (const path of INVESTIGATION_BOUNDARY_ROOTS) visit(join(root, compiled ? path.replace(/^src\//, 'out/').replace(/\.ts$/, '.js') : path));
 // Pins dependency metadata and native process-broker image bytes as well as JS.
 add(join(root, 'package-lock.json'));
 for (const name of ['insrc-process-broker', 'insrc-shutdown-watchdog.js']) add(join(root, 'out/bin', name));
 const entries = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([path, digest]) => ({ path, digest }));
 const absent=[...absentPackages].sort();
 return { version: 1 as const, files: entries, absentPackages:absent, hostPorts: HOST_PORTS, digest: sha(JSON.stringify({ files: entries, absentPackages:absent,hostPorts: HOST_PORTS })) };
}
