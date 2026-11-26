/** Release builder. No source build/npm/compiler is shipped to consumers. */
import { copyFileSync, createReadStream, createWriteStream, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, renameSync, existsSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { isBuiltin } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import policy from '../src/installer/runtime-policy.json' with { type: 'json' };
import { collectTree, productionClosure, inventoryFor, sha256, validateEntrypoints, isContainedPath } from './installer-payload.mjs';
import { renderInstallerBootstrap } from './render-installer-bootstrap.mjs';
import { packageControlBinding } from './package-installer-control.mjs';
import { createRun } from './test-harness/context.mjs';
import { prepareBuild, BUILD_INPUTS } from './test-harness/build.mjs';
import { withRun } from './test-harness/process.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ENTRIES = ['out/daemon/index.js', 'out/installer/manager-entry.js', 'out/installer/terminal-entry.js', 'out/cli/index.js'];
const FORBIDDEN = /(?:^|\/)(?:src|out)\/(?:db|indexer|agent|daemon)\//;
export function assertManagerBoundary(metafile) {
  const packages = new Set(['yauzl', 'pend', 'ajv', 'fast-deep-equal', 'fast-uri', 'json-schema-traverse', 'require-from-string', 'fzstd', 'xxhash-wasm']);
  for (const name of Object.keys(metafile.inputs)) {
    const normalized = name.replaceAll('\\', '/');
    if (FORBIDDEN.test(normalized)) throw new Error(`Installer imports application runtime: ${name}`);
    for (const match of normalized.matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g)) if (!packages.has(match[1])) throw new Error(`Installer imports forbidden package: ${match[1]}`);
  }
  for (const output of Object.values(metafile.outputs)) for (const dependency of output.imports ?? []) {
    if (dependency.external && !isBuiltin(dependency.path)) throw new Error(`Installer requires unbundled dependency: ${dependency.path}`);
  }
}
export async function bundleControlEntrypoint(run, scope, entry, output, target) {
  run.assertOwner();
  const meta = `${output}.meta.json`;
  const binary = join(run.root, 'node_modules/@esbuild', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild');
  const result = await scope.start(binary, [entry, '--bundle', '--platform=node', '--format=esm', '--target=node22', `--outfile=${output}`, `--metafile=${meta}`, ...(target ? [`--define:__INSRC_INSTALLER_TARGET__=${JSON.stringify(target)}`] : []), '--banner:js=import {createRequire as __insrcCreateRequire} from "node:module"; const require=__insrcCreateRequire(import.meta.url);'], { cwd: run.root, env: run.environment(), budgetMs: run.budgets.buildMs });
  if (result.code !== 0 || result.timedOut || result.interrupted || result.launchError) throw new Error('Control bootstrap bundle failed');
  const metadata = JSON.parse(readFileSync(meta, 'utf8')); assertManagerBoundary(metadata); rmSync(meta); return metadata;
}
async function zipFiles(files, output) {
  const zip = new ZipFile();
  const pending = pipeline(zip.outputStream, createWriteStream(output, { flags: 'wx', mode: 0o600 }));
  for (const [path, value] of [...files].sort(([a], [b]) => a.localeCompare(b))) zip.addBuffer(value.bytes, path, { mode: 0o100000 | value.mode, mtime: new Date('2026-01-01T00:00:00Z'), compress: !path.endsWith('.tar.gz') && !path.endsWith('.zip') });
  zip.end(); await pending;
}
/** Low-level fixture-capable assembler. A fixture descriptor is explicitly NOT a
 * qualified consumer release; production entry below never accepts fixture input. */
async function assembleRelease({ files, directory, manifest, baseUrl, bootstrap, native, sourceRoot, excludedInputs = [], generatedInputs = [], fixture = false }) {
  if (!/^https:\/\//.test(baseUrl) || /[\r\n\0]/.test(baseUrl)) throw new Error('HTTPS release base URL required');
  const { parseReleaseManifest } = await import('../out/installer/schemas.js');
  const { parseApplicationInventory, BUNDLE_LIMITS } = await import('../out/installer/release-descriptor.js');
  if (files.has('inventory.json')) throw new Error('Inventory cannot contain its own bytes');
  assertApplicationSources(files, { sourceRoot, excludedInputs, generatedInputs, requireSource: !fixture });
  if (manifest.runtime.sha256 !== policy.archives[`${manifest.target.os}-${manifest.target.arch}`]) throw new Error('Runtime identity differs from official target policy');
  for (const entry of [manifest.daemonEntry, manifest.managerEntry, manifest.tuiEntry, ...manifest.migrations.map(hook => hook.module)]) if (!files.has(entry)) throw new Error(`Release inventory lacks entrypoint: ${entry}`);
  for (const [name, bytes] of [['bootstrap.mjs', bootstrap], ['native/control.node', native]]) {
    if (!files.get(name)?.bytes.equals(bytes)) throw new Error(`Control asset differs from payload: ${name}`);
  }
  const inventory = { schemaVersion: 1, files: inventoryFor(files) };
  const inventoryBytes = Buffer.from(JSON.stringify(inventory));
  parseApplicationInventory(inventory);
  if (inventoryBytes.length > BUNDLE_LIMITS.inventoryBytes || inventory.files.reduce((total, file) => total + file.bytes, inventoryBytes.length) > BUNDLE_LIMITS.expanded) throw new Error('Release exceeds consumer inventory/expanded bounds');
  const payloadFiles = new Map(files); payloadFiles.set('inventory.json', { bytes: inventoryBytes, mode: 0o644 });
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  const payload = join(directory, 'payload.zip'); await zipFiles(payloadFiles, payload);
  if (statSync(payload).size > BUNDLE_LIMITS.compressed) throw new Error('Release exceeds consumer compressed bound');
  const digest = sha256(readFileSync(payload));
  const completeManifest = { ...manifest, payloadSha256: digest }; parseReleaseManifest(completeManifest);
  const prefix = `insrc-${manifest.releaseId}-${manifest.target.os}-${manifest.target.arch}`;
  const descriptor = { schemaVersion: 2, publication: fixture ? 'fixture' : 'qualified', manifest: completeManifest, inventorySha256: sha256(inventoryBytes), payload: { url: `${baseUrl}/${prefix}.zip`, bytes: statSync(payload).size, sha256: digest }, bootstrap: { url: `${baseUrl}/${prefix}.bootstrap.mjs`, bytes: bootstrap.length, sha256: sha256(bootstrap) }, native: { url: `${baseUrl}/${prefix}.control.node`, bytes: native.length, sha256: sha256(native) } };
  writeFileSync(join(directory, 'bootstrap.mjs'), bootstrap, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(directory, 'control.node'), native, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(directory, 'release.json'), JSON.stringify(descriptor, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const target = `${manifest.target.os}-${manifest.target.arch}`;
  const assets = { [target]: { target: manifest.target, bootstrap: descriptor.bootstrap, native: descriptor.native } };
  const script = manifest.target.os === 'win32' ? 'install.ps1' : 'install.sh';
  const scriptBytes = renderInstallerBootstrap(manifest.target.os === 'win32' ? 'powershell' : 'posix', assets);
  writeFileSync(join(directory, script), scriptBytes, { flag: 'wx', mode: 0o700 });
  writeFileSync(join(directory, 'installer-assets.json'), JSON.stringify({ schemaVersion: 1, publication: descriptor.publication, scriptVersion: manifest.releaseId, sourceCommit: manifest.sourceCommit, assets: { [script]: { sha256: sha256(scriptBytes), bytes: Buffer.byteLength(scriptBytes) } } }) + '\n', { flag: 'wx', mode: 0o600 });
  const githubAssets = [];
  for (const [source, published] of [['payload.zip', `${prefix}.zip`], ['release.json', `${prefix}.release.json`], ['bootstrap.mjs', `${prefix}.bootstrap.mjs`], ['control.node', `${prefix}.control.node`], [script, `${prefix}.${script}`], ['installer-assets.json', `${prefix}.installer-assets.json`]]) {
    copyFileSync(join(directory, source), join(directory, published)); githubAssets.push(published);
  }
  writeFileSync(join(directory, 'github-assets.json'), JSON.stringify({ publication: descriptor.publication, files: githubAssets }) + '\n', { flag: 'wx', mode: 0o600 });
  return descriptor;
}
export const assembleFixtureRelease = options => assembleRelease({ ...options, fixture: true });
/** Actual source provenance survives destination-key renaming. Unknown compressed
 * content is not classified by a filename; policy pins and excluded inputs apply. */
export function assertApplicationSources(files, { sourceRoot, excludedInputs = [], generatedInputs = [], requireSource = false } = {}) {
  const excluded = excludedInputs.map(input => realpathSync(input)), generated = generatedInputs.map(input => realpathSync(input));
  const root = sourceRoot ? realpathSync(sourceRoot) : undefined;
  for (const [name, value] of files) {
    if (requireSource && !value.source) throw new Error(`Application contribution lacks source provenance: ${name}`);
    if (!value.source) continue;
    const source = realpathSync(value.source);
    if (excluded.some(input => isContainedPath(input, source))) throw new Error(`Runtime distribution source cannot contribute to application payload: ${name}`);
    if (root && !isContainedPath(root, source) && !generated.includes(source)) throw new Error(`Application source is outside its allowed roots: ${name}`);
  }
}
export function collectProductionPayload(root, { excludedInputs = [] } = {}) {
  validateEntrypoints(root, ENTRIES);
  const excluded = excludedInputs.map(input => realpathSync(input));
  const admitFile = (source, target, stat) => {
    if (stat.size > 1024 ** 3) throw new Error('Application source file exceeds payload entry bound');
    if (excluded.some(input => isContainedPath(input, source))) throw new Error('Runtime distribution source is excluded from application collection');
  };
  const files = collectTree(root, join(root, 'out'), 'out', { admitFile });
  for (const [name, value] of productionClosure(root, { admitFile })) files.set(name, value);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  files.set('package.json', { bytes: Buffer.from(JSON.stringify({ name: pkg.name, version: pkg.version, type: 'module', dependencies: pkg.dependencies })), mode: 0o644, source: join(root, 'package.json') });
  assertApplicationSources(files, { sourceRoot: root, excludedInputs, requireSource: true });
  return files;
}
/** Publisher tooling is external to app files, using the same verified store. */
export async function preparePublisherRuntime(run, archive, home, target) {
  run.assertOwner();
  const { ControllerStore } = await import('../out/installer/controller-store.js');
  const { resolveInstallationLocation } = await import('../out/installer/location.js');
  const { controlBinding } = await import('../out/installer/native.js');
  const { runtimeArchive } = await import('../out/installer/runtime-policy.js');
  const { httpsDownloadTransport } = await import('../out/installer/download.js');
  const official = runtimeArchive(target);
  const temporary = home === undefined;
  home = temporary ? mkdtempSync(join(realpathSync(tmpdir()), 'ipr-')) : join(realpathSync(dirname(resolve(home))), basename(home));
  if (temporary && process.platform === 'win32') controlBinding().protect(home);
  const identity = { version: policy.nodeVersion, target, sha256: official.sha256, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' };
  const location = resolveInstallationLocation('publisher-runtime', { home, ...(process.platform === 'win32' ? { userSid: controlBinding().userSid() } : {}) });
  let store;
  try {
    store = ControllerStore.acquire(location);
    await store.ensureRuntime(identity, { transport: async (url, signal) => {
      if (!archive || url.href !== official.url) return httpsDownloadTransport(url, signal);
      const body = createReadStream(archive);
      return { status: 200, body, closed: new Promise(resolve => body.once('close', resolve)) };
    } });
  } catch (cause) {
    store?.close(); store = undefined;
    if (cause?.code === 'resource-close-uncertain') throw new Error(`Publisher runtime closure is uncertain; retained ${home}`, { cause });
    if (temporary) rmSync(home, { recursive: true });
    throw cause;
  } finally { store?.close(); }
  return Object.freeze({ location, identity, cleanup() { if (temporary) rmSync(home, { recursive: true }); } });
}
export async function probePayload(run, scope, directory, target, context) {
  if (!context?.location || !context?.identity) throw new Error('External verified runtime context is required for publisher probes');
  const { privateRuntimePaths, privateRuntimeEnvironment } = await import('../out/installer/runtime-policy.js');
  const runtime = await privateRuntimePaths(context.location, context.identity);
  if (['os', 'arch', 'baseline'].some(key => runtime.identity.target[key] !== target[key])) throw new Error('Publisher runtime target differs');
  const program = `const{createRequire}=require('node:module');const r=createRequire(process.cwd()+'/package.json');if(process.version!=='v22.22.1'||process.platform!==${JSON.stringify(target.os)}||process.arch!==${JSON.stringify(target.arch)})throw Error('runtime target');for(const n of ['lmdb','@lancedb/lancedb','@duckdb/node-api','tree-sitter','onnxruntime-node','@parcel/watcher'])r(n);const c=r('./native/control.node');const h=c.acquire(process.cwd()+'/probe.lock');if(!c.held(h))throw Error('lock');c.close(h);`;
  const probe = await scope.start(runtime.node, ['-e', program], { cwd: directory, env: privateRuntimeEnvironment(run.environment()), budgetMs: run.budgets.fileMs });
  rmSync(join(directory, 'probe.lock'), { force: true });
  if (probe.code !== 0 || probe.timedOut || probe.interrupted || probe.launchError) throw new Error(`Target native/runtime payload probe failed: ${probe.log}`);
}
export async function assertCommittedSource(run, scope, sourceCommit) {
  run.assertOwner();
  const git = await scope.start('git', ['rev-parse', 'HEAD'], { budgetMs: run.budgets.fileMs });
  if (git.code !== 0 || readFileSync(git.log, 'utf8').trim() !== sourceCommit) throw new Error('Release source revision differs from checkout');
  // Exactly the coordinator input set, including compiler config and header pins.
  const status = await scope.start('git', ['status', '--porcelain', '--untracked-files=all', '--', ...BUILD_INPUTS], { budgetMs: run.budgets.fileMs });
  if (status.code !== 0 || readFileSync(status.log, 'utf8').trim()) throw new Error('Release source inputs are uncommitted');
}
/** Production build must be called only under canonical writer ownership. */
export async function packageInstaller(run, scope, config) {
  run.assertOwner();
  if (!['preparing', 'mutating'].includes(run.record.phase)) throw new Error('Publisher requires writer phase');
  const root = run.root;
  // Reject missing real entries before target qualification or large copying.
  validateEntrypoints(root, ENTRIES);
  const { target, qualification, runtimeArchive, sourceCommit, releaseId, baseUrl, outputDirectory, compatiblePredecessors = [], migrations = [] } = config;
  const archiveKey = `${target.os}-${target.arch}`, archiveSha = policy.archives[archiveKey];
  if (!archiveSha) throw new Error('Runtime target does not match official policy');
  if (target.os !== process.platform || target.arch !== process.arch) throw new Error('Cross-target production publication is unqualified');
  const binding = join(root, 'out/installer/native/control.node'), nativeBytes = readFileSync(binding);
  const { requireNativeQualification } = await import('../out/installer/native-qualification.js');
  requireNativeQualification(target, sha256(nativeBytes), qualification);
  await assertCommittedSource(run, scope, sourceCommit);
  let parent = resolve(outputDirectory);
  for (const input of ['out', 'src', 'scripts', 'packages', 'node_modules']) if (isContainedPath(join(root, input), parent)) throw new Error('Release output cannot be inside source inputs');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  parent = realpathSync(parent);
  for (const input of ['out', 'src', 'scripts', 'packages', 'node_modules']) if (isContainedPath(join(root, input), parent)) throw new Error('Release output cannot alias source inputs');
  const stage = join(parent, `.release-${randomUUID()}`); mkdirSync(stage, { mode: 0o700 });
  let runtimeContext, retain = false;
  try {
    const bootstrapFile = join(stage, 'bootstrap.mjs'), managerFile = join(stage, 'manager.mjs');
    await bundleControlEntrypoint(run, scope, join(root, 'out/installer/terminal-entry.js'), bootstrapFile, target);
    await bundleControlEntrypoint(run, scope, join(root, 'out/installer/manager-entry.js'), managerFile, target);
    runtimeContext = await preparePublisherRuntime(run, runtimeArchive, undefined, target);
    const excludedInputs = [runtimeContext.location.home, runtimeArchive].filter(Boolean);
    const bootstrapBytes = readFileSync(bootstrapFile), files = collectProductionPayload(root, { excludedInputs });
    files.set('bootstrap.mjs', { bytes: bootstrapBytes, mode: 0o644, source: bootstrapFile }); files.set('manager.mjs', { bytes: readFileSync(managerFile), mode: 0o644, source: managerFile });
    files.set('native/control.node', { bytes: nativeBytes, mode: 0o755, source: binding });
    const probeRoot = join(stage, 'probe'); mkdirSync(probeRoot);
    for (const [name, value] of files) { const file = join(probeRoot, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value.bytes, { mode: value.mode }); }
    await probePayload(run, scope, probeRoot, target, runtimeContext);
    packageControlBinding({ source: binding, destination: join(stage, 'qualified-native'), target, evidence: qualification, run });
    const manifest = { schemaVersion: 1, releaseId, sourceCommit, target, runtime: { version: policy.nodeVersion, target, sha256: archiveSha, relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' }, daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js', protocolVersion: 1, compatiblePredecessors, migrations };
    const releaseRoot = join(stage, 'release');
    const descriptor = await assembleRelease({ files, directory: releaseRoot, manifest, baseUrl, bootstrap: bootstrapBytes, native: nativeBytes, sourceRoot: root, excludedInputs, generatedInputs: [bootstrapFile, managerFile] });
    const final = join(parent, `${releaseId}-${archiveKey}`);
    if (existsSync(final)) throw new Error('Immutable release already exists');
    renameSync(releaseRoot, final); return { directory: final, descriptor };
  } catch (error) {
    retain = error?.code === 'resource-close-uncertain' || error?.cause?.code === 'resource-close-uncertain' || !!scope.cancellationErrors?.length || !!scope.evidenceErrors?.length;
    throw error;
  } finally { if (!retain) { runtimeContext?.cleanup(); rmSync(stage, { recursive: true, force: true }); } }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const run = createRun(ROOT, { mode: 'build' });
  await withRun(run, async scope => { await prepareBuild(run, scope); const result = await packageInstaller(run, scope, config); process.stdout.write(`${result.directory}\n`); });
}
