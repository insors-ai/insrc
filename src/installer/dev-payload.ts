/** Local dev payload preparation. No controller publication or daemon capability. */
import { closeSync, constants, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import type { BuildRun } from '../../scripts/test-harness/context.mjs';
import type { CommandScope } from '../../scripts/test-harness/process.mjs';
import { fingerprint, inputFingerprint, withWriter } from '../../scripts/test-harness/build.mjs';
import { InstallerError } from './contracts.js';
import type { InstallationLocation, Target } from './contracts.js';
import { parseDevPreparation, parseDevReleaseReceipt } from './dev.js';
import type { DevPreparationRecord, DevReleaseReceipt } from './dev.js';
import { prepareDevGit } from './dev-git.js';
import type { DevGitPreparation } from './dev-git.js';
import { checkDevPrerequisites, installDevDependencies, loadDevBuildHelpers, ownedDevBuildEnvironment, verifyDevToolchain } from './dev-toolchain.js';
import type { DevWorkerWork } from './dev-worker.js';
import { devWorkerPaths } from './dev-worker.js';
import { assertLocalControlRoot } from './location.js';
import { controlBinding } from './native.js';
import { privateRuntimePaths } from './runtime-policy.js';
import { BUNDLE_LIMITS, canonicalJson, digest, parseApplicationInventory } from './release-descriptor.js';
import type { InventoryFile, PayloadInventory } from './release-descriptor.js';
import { readBoundedFile, verifyPayloadInventory } from './safe-zip.js';
import { flushDirectoryTree, flushParents } from './durability.js';

type PayloadFiles = Map<string, { bytes: Buffer; mode: number; source?: string }>;
interface PackagingHelpers {
  bundleControlEntrypoint(run: BuildRun, scope: CommandScope, entry: string, output: string, target: Target): Promise<unknown>;
  collectProductionPayload(root: string, options: { excludedInputs: string[] }): PayloadFiles;
  assertApplicationSources(files: PayloadFiles, options: { sourceRoot: string; excludedInputs: string[]; generatedInputs: string[]; requireSource: boolean }): void;
  probePayload(run: BuildRun, scope: CommandScope, directory: string, target: Target, context: { location: InstallationLocation; identity: DevReleaseReceipt['manifest']['runtime'] }): Promise<void>;
}
function local(directory: string): void {
  assertLocalControlRoot(directory, process.platform === 'win32' ? path => controlBinding().localVolume(path) : undefined);
}
function acceptedFile(root: string, name: string): string {
  const file = join(root, name); let path = file;
  while (path !== root) {
    if (lstatSync(path).isSymbolicLink()) throw new InstallerError('source-build-failed', 'Accepted helper or control input is linked');
    path = dirname(path);
  }
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1) throw new InstallerError('source-build-failed', 'Accepted helper or control input is not a regular private file');
  return file;
}
async function packaging(run: BuildRun): Promise<{ helpers: PackagingHelpers; inventoryFor(files: PayloadFiles): InventoryFile[] }> {
  run.assertOwner();
  const helpers = await import(pathToFileURL(acceptedFile(run.root, 'scripts/package-installer.mjs')).href) as PackagingHelpers;
  const inventory = await import(pathToFileURL(acceptedFile(run.root, 'scripts/installer-payload.mjs')).href) as { inventoryFor(files: PayloadFiles): InventoryFile[] };
  for (const name of ['bundleControlEntrypoint', 'collectProductionPayload', 'probePayload', 'assertApplicationSources'] as const) {
    if (typeof helpers[name] !== 'function') throw new InstallerError('source-build-failed', 'Accepted checkout lacks complete packaging helpers');
  }
  if (typeof inventory.inventoryFor !== 'function') throw new InstallerError('source-build-failed', 'Accepted checkout lacks inventory helper');
  return { helpers, inventoryFor: inventory.inventoryFor };
}
function writeOwned(file: string, bytes: Buffer | string, mode: number): void {
  const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try { writeFileSync(fd, bytes); if (process.platform !== 'win32') fchmodSync(fd, mode); fsyncSync(fd); }
  finally { closeSync(fd); }
}
function requireEntries(receipt: DevReleaseReceipt, inventory: PayloadInventory): void {
  const files = new Map(inventory.files.map(file => [file.path, file]));
  const manifest = receipt.manifest;
  for (const entry of ['bootstrap.mjs', 'manager.mjs', 'native/control.node', 'package.json', 'out/installer/native/control.node',
    'out/installer/terminal-entry.js', 'out/installer/manager-entry.js', 'out/bin/insrc-mcp.js', manifest.daemonEntry, manifest.tuiEntry,
    ...manifest.migrations.map(hook => hook.module)]) {
    if (!files.get(entry)?.bytes) throw new InstallerError('candidate-conflict', 'Dev payload lacks a complete control/runtime/application entry');
  }
  if (manifest.managerEntry !== 'manager.mjs' || inventory.files.some(file => file.path === '.dev-release.json')) throw new InstallerError('candidate-conflict', 'Dev receipt/control membership differs');
}

/** Read-only full tree proof for a stage or immutable release. Does not fetch,
 * run build tools, execute hooks or load application/native services. */
export async function verifyDevPayload(directory: string, target: Target, location: InstallationLocation, options: {
  expectedReceipt?: DevReleaseReceipt; signal?: AbortSignal;
} = {}): Promise<{ receipt: DevReleaseReceipt; inventory: PayloadInventory }> {
  options.signal?.throwIfAborted(); local(directory);
  const raw = await readBoundedFile(join(directory, '.dev-release.json'), BUNDLE_LIMITS.descriptorBytes);
  const receipt = parseDevReleaseReceipt(JSON.parse(raw.toString('utf8')));
  if (raw.toString('utf8') !== canonicalJson(receipt) || canonicalJson(receipt.manifest.target) !== canonicalJson(target)
    || (options.expectedReceipt && canonicalJson(receipt) !== canonicalJson(parseDevReleaseReceipt(options.expectedReceipt)))) throw new InstallerError('candidate-conflict', 'Dev receipt differs from the expected immutable source/payload');
  const bytes = await readBoundedFile(join(directory, 'inventory.json'), BUNDLE_LIMITS.inventoryBytes);
  const inventory = parseApplicationInventory(JSON.parse(bytes.toString('utf8')));
  if (bytes.toString('utf8') !== canonicalJson(inventory) || digest(bytes) !== receipt.inventorySha256
    || inventory.files.reduce((total, file) => total + file.bytes, bytes.length + raw.length) > BUNDLE_LIMITS.expanded) throw new InstallerError('candidate-conflict', 'Dev inventory digest or bounds differ');
  requireEntries(receipt, inventory);
  await verifyPayloadInventory(directory, inventory, { receipt: '.dev-release.json', signal: options.signal });
  await privateRuntimePaths(location, receipt.manifest.runtime, { signal: options.signal });
  return { receipt, inventory };
}

async function assemble(run: BuildRun, scope: CommandScope, record: DevPreparationRecord, stage: string,
  location: InstallationLocation, source: DevGitPreparation, signal: AbortSignal, runtimeDirectory: string): Promise<{ inventorySha256: string }> {
  const { helpers, inventoryFor } = await packaging(run), offer = record.sourceOffer;
  const scratch = join(run.workspace, 'dev-payload'); mkdirSync(scratch, { mode: 0o700 });
  const bootstrap = join(scratch, 'bootstrap.mjs'), manager = join(scratch, 'manager.mjs');
  await helpers.bundleControlEntrypoint(run, scope, acceptedFile(run.root, 'out/installer/terminal-entry.js'), bootstrap, offer.target);
  await helpers.bundleControlEntrypoint(run, scope, acceptedFile(run.root, 'out/installer/manager-entry.js'), manager, offer.target);
  signal.throwIfAborted(); run.assertOwner();
  const files = helpers.collectProductionPayload(run.root, { excludedInputs: [runtimeDirectory] });
  if (!(files instanceof Map)) throw new InstallerError('source-build-failed', 'Accepted payload helper returned no production closure');
  for (const name of ['bootstrap.mjs', 'manager.mjs', 'native/control.node', 'inventory.json', '.dev-release.json', '.release.json']) {
    if (files.has(name)) throw new InstallerError('candidate-conflict', 'Production closure overlaps reserved dev metadata/control files');
  }
  files.set('bootstrap.mjs', { bytes: readFileSync(acceptedFile(scratch, 'bootstrap.mjs')), mode: 0o644, source: bootstrap });
  files.set('manager.mjs', { bytes: readFileSync(acceptedFile(scratch, 'manager.mjs')), mode: 0o644, source: manager });
  files.set('native/control.node', { bytes: readFileSync(acceptedFile(run.root, 'out/installer/native/control.node')), mode: 0o755, source: acceptedFile(run.root, 'out/installer/native/control.node') });
  let inventory: PayloadInventory;
  try {
    helpers.assertApplicationSources(files, { sourceRoot: run.root, excludedInputs: [runtimeDirectory], generatedInputs: [bootstrap, manager], requireSource: true });
    inventory = parseApplicationInventory({ schemaVersion: 1, files: inventoryFor(files) });
  }
  catch (cause) { throw new InstallerError('archive-unsafe', 'Collected dev payload violates bounded portable inventory rules', { cause }); }
  const inventoryBytes = canonicalJson(inventory);
  const inventorySha256 = digest(inventoryBytes);
  const receipt = parseDevReleaseReceipt({ schemaVersion: 2, mode: 'dev', sourceOffer: offer, inventorySha256, checkoutRelativePath: record.checkoutRelativePath,
    manifest: { schemaVersion: 1, releaseId: offer.releaseId, sourceCommit: offer.sourceCommit, target: offer.target, runtime: offer.runtime,
      payloadSha256: inventorySha256, daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js', protocolVersion: 1,
      compatiblePredecessors: source.compatiblePredecessors, migrations: source.migrations } });
  const receiptBytes = canonicalJson(receipt);
  requireEntries(receipt, inventory);
  if (Buffer.byteLength(inventoryBytes) > BUNDLE_LIMITS.inventoryBytes
    || inventory.files.reduce((total, file) => total + file.bytes, Buffer.byteLength(inventoryBytes) + Buffer.byteLength(receiptBytes)) > BUNDLE_LIMITS.expanded) throw new InstallerError('archive-unsafe', 'Dev payload exceeds inventory/expanded bounds');
  local(stage); mkdirSync(dirname(stage), { recursive: true, mode: 0o700 }); local(dirname(stage));
  controlBinding().protect(dirname(stage));
  try { mkdirSync(stage, { mode: 0o700 }); }
  catch (cause) { throw new InstallerError('candidate-conflict', 'Private dev stage already exists; retain it for inspection', { cause }); }
  controlBinding().protect(stage);
  let written = 0;
  for (const file of inventory.files) {
    // Let terminal EOF/cancellation reach the worker during large synchronous
    // file copies rather than waiting until all payload files have been staged.
    if (++written % 64 === 0) await setImmediate(undefined, { signal });
    signal.throwIfAborted(); run.assertOwner();
    const value = files.get(file.path);
    if (!value || value.bytes.length !== file.bytes || digest(value.bytes) !== file.sha256 || value.mode !== file.mode) throw new InstallerError('candidate-conflict', 'Collected payload changed before staging');
    const path = join(stage, file.path); mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeOwned(path, value.bytes, file.mode);
  }
  // Small app-only payloads may not reach the periodic copy-loop yield. Deliver
  // pending terminal cancellation before writing their completion metadata too.
  await setImmediate(undefined, { signal }); signal.throwIfAborted();
  writeOwned(join(stage, 'inventory.json'), inventoryBytes, 0o644);
  writeOwned(join(stage, '.dev-release.json'), receiptBytes, 0o600);
  // Probe only the freshly staged target payload; this is local build evidence,
  // never signed/qualified publication or actual installation qualification.
  await helpers.probePayload(run, scope, stage, offer.target, { location, identity: offer.runtime });
  await verifyDevPayload(stage, offer.target, location, { expectedReceipt: receipt, signal });
  await flushDirectoryTree(stage, signal);
  flushParents(dirname(stage), location.home);
  return { inventorySha256 };
}

/** Source helpers stay in the accepted checkout; runtime trust comes from the shared resolver. */
export function createDevPreparationWork(location: InstallationLocation, input: DevPreparationRecord, options: {
  predecessor?: DevReleaseReceipt;
} = {}): DevWorkerWork {
  const record = parseDevPreparation(input);
  return async (base, scope, signal, stage) => {
    const paths = devWorkerPaths(location.home, record);
    if (location.installationId !== record.installationId || base.root !== paths.checkout || stage !== paths.stage
      || base.runId !== record.coordinatorRunId || relative(paths.home, base.root).startsWith('..')) throw new InstallerError('identity-mismatch', 'Payload workload belongs to another private attempt');
    const toolchain = await verifyDevToolchain(location, record.sourceOffer.runtime, { signal });
    const source = await prepareDevGit(base, scope, record, { location, ...(options.predecessor ? { predecessor: options.predecessor } : {}), signal });
    const environment = ownedDevBuildEnvironment(base, toolchain, base.environment());
    const run: BuildRun = { ...base, environment: () => environment };
    await withWriter(run, scope, async () => {
      // Record the effective requested policy before npm can fail; never capture
      // inherited credentials or configuration as diagnostic evidence.
      writeOwned(join(run.workspace, 'dev-build-policy.json'), canonicalJson({ schemaVersion: 1, nodeVersion: '22.22.1', npmVersion: '10.9.4', cuda: environment['ONNXRUNTIME_NODE_INSTALL_CUDA'] }), 0o600);
    });
    await checkDevPrerequisites(run, scope, toolchain, environment); signal.throwIfAborted();
    await installDevDependencies(run, scope, toolchain, environment); signal.throwIfAborted();
    if (inputFingerprint(run.root) !== source.inputFingerprint) throw new InstallerError('source-build-failed', 'Dependency installation changed accepted build inputs');
    const build = await loadDevBuildHelpers(run);
    await build.prepareBuild(run, scope, { npmCli: toolchain.npmCli }); signal.throwIfAborted(); run.assertOwner();
    const prepared = JSON.parse((await readBoundedFile(join(run.workspace, 'prepared.json'), BUNDLE_LIMITS.descriptorBytes)).toString('utf8')) as Record<string, unknown>;
    const inputDigest = inputFingerprint(run.root), outputDigest = fingerprint(run.root, ['out', 'packages/project-memory/dist']);
    if (inputDigest !== source.inputFingerprint || prepared['runId'] !== run.runId || prepared['canonicalRoot'] !== run.root
      || prepared['runtimeExecutable'] !== realpathSync(toolchain.node) || prepared['buildExitCode'] !== 0
      || prepared['inputFingerprint'] !== inputDigest || prepared['outputFingerprint'] !== outputDigest) throw new InstallerError('source-build-failed', 'Canonical build evidence differs from accepted source/output');
    return build.withWriter(run, scope, async () => {
      const result = await assemble(run, scope, record, stage, location, source, signal, toolchain.directory);
      if (inputFingerprint(run.root) !== inputDigest || fingerprint(run.root, ['out', 'packages/project-memory/dist']) !== outputDigest) throw new InstallerError('source-build-failed', 'Build inputs or compiled outputs changed during packaging');
      signal.throwIfAborted(); run.assertOwner(); return result;
    });
  };
}
