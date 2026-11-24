/** Isolated dev source preparation; no controller, daemon or application tools. */
import { Ajv } from 'ajv';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { createRun } from '../../scripts/test-harness/context.mjs';
import type { BuildRun } from '../../scripts/test-harness/context.mjs';
import { withRun } from '../../scripts/test-harness/process.mjs';
import type { CommandScope } from '../../scripts/test-harness/process.mjs';
import { inputFingerprint, withWriter } from '../../scripts/test-harness/build.mjs';
import { InstallerError, MAX_CONTROL_BYTES } from './contracts.js';
import type { Delivery, HookReference, InstallationLocation, RuntimeIdentity, Target } from './contracts.js';
import { canonicalJson, digest } from './release-descriptor.js';
import { createDevSourceOffer, devHashSchema, devNonceSchema, devObjectSchema, devPreparationPaths, devTokenSchema,
  parseDevDelivery, parseDevHooks, parseDevPreparation, parseDevRecord, parseDevReleaseReceipt, parseDevSourceOffer } from './dev.js';
import type { DevPreparationRecord, DevReleaseReceipt, DevSourceOffer } from './dev.js';
import { readVerifiedDevSourceResult } from './dev-worker.js';
import { normalizeHome } from './location.js';
import { readBoundedFile } from './safe-zip.js';

const OUTPUT_LIMIT = 4 * 1024 * 1024;
export interface DevGit {
  (args: string[], cwd?: string, allowedCodes?: number[]): Promise<{ code: number; text: string }>;
}
/** Public consent binds the installation, predecessor and exact resolved source,
 * not the later receipt/inventory digest. The manager re-resolves under its lease
 * before calling the acceptance guard; the worker consumes only its saved result. */
export function devUpgradeOfferId(location: InstallationLocation, predecessorId: string | undefined, input: DevSourceOffer): string {
  const offer = parseDevSourceOffer(input);
  return digest(canonicalJson({ location, current: predecessorId, delivery: offer.delivery, source: offer.sourceSha256 }));
}
export function acceptResolvedDevSource(location: InstallationLocation, predecessorId: string | undefined,
  input: DevSourceOffer, acceptedOfferId: string): DevSourceOffer {
  const offer = parseDevSourceOffer(input);
  if (acceptedOfferId !== devUpgradeOfferId(location, predecessorId, offer)) throw new InstallerError('offer-stale', 'Upgrade acceptance differs from the exact current source offer');
  return offer;
}
/** Preserve ordinary credential delegation; clear inherited repository redirection
 * and trace settings before Git can touch a selected or new checkout. */
export function devGitEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...input };
  const redirected = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_EXEC_PATH', 'GIT_TEMPLATE_DIR', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT']);
  for (const key of Object.keys(env)) if (redirected.has(key.toUpperCase()) || /^GIT_CONFIG_(KEY|VALUE)_\d+$/i.test(key) || /^GIT_TRACE/i.test(key) || /^GIT_CURL_VERBOSE$/i.test(key)) delete env[key];
  env['GIT_TERMINAL_PROMPT'] = '0'; env['GIT_OPTIONAL_LOCKS'] = '0'; env['GIT_ALLOW_PROTOCOL'] = 'file:https:ssh';
  return env;
}
export function ownedDevGit(run: BuildRun, scope: CommandScope, signal?: AbortSignal): DevGit {
  const emptyHooks = join(run.workspace, 'no-git-hooks');
  run.assertOwner(); mkdirSync(emptyHooks, { recursive: true, mode: 0o700 });
  if (!lstatSync(emptyHooks).isDirectory() || lstatSync(emptyHooks).isSymbolicLink() || readdirSync(emptyHooks).length) throw new InstallerError('source-invalid', 'Owned Git hook directory is not empty');
  return async (args, cwd = run.root, allowedCodes = [0]) => {
    signal?.throwIfAborted(); run.assertOwner();
    const cancel = () => scope.stop(); signal?.addEventListener('abort', cancel, { once: true });
    try {
      const result = await scope.start('git', ['--no-optional-locks', '-c', `core.hooksPath=${emptyHooks}`, '-c', 'core.fsmonitor=false',
        '-c', 'advice.detachedHead=false', ...args], { cwd, env: devGitEnvironment(run.environment()), outputLimitBytes: OUTPUT_LIMIT });
      signal?.throwIfAborted(); run.assertOwner();
      if (result.code === null || !allowedCodes.includes(result.code) || result.timedOut || result.interrupted || result.launchError) throw new InstallerError('source-fetch-failed', 'Owned Git command failed; inspect the bounded private command log');
      return { code: result.code, text: (await readBoundedFile(result.log, OUTPUT_LIMIT)).toString('utf8') };
    } finally { signal?.removeEventListener('abort', cancel); }
  };
}

/** Discovery allocates only an OS-temporary coordinator, never installation state. */
export async function resolveDevSource(deliveryInput: Delivery, target: Target, runtime: RuntimeIdentity, options: { signal?: AbortSignal; environment?: NodeJS.ProcessEnv } = {}): Promise<DevSourceOffer> {
  const delivery = parseDevDelivery(deliveryInput), root = mkdtempSync(join(tmpdir(), 'insrc-dev-source-check-'));
  let run: BuildRun | undefined;
  try {
    const base = createRun(root, { mode: 'build', budgets: { fileMs: 30_000, runMs: 40_000 } });
    run = { ...base, environment: () => ({ ...(options.environment ?? process.env), INSRC_TEST_RUN_ID: base.runId, INSRC_TEST_ROOT: base.root, INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
    return await withRun(run, async scope => {
      const git = ownedDevGit(run!, scope, options.signal), ref = `refs/heads/${delivery.branch}`;
      const response = await git(['ls-remote', '--heads', '--refs', '--', delivery.repository, ref]);
      const lines = response.text.trim().split('\n');
      if (lines.length !== 1) throw new InstallerError('source-fetch-failed', 'Selected branch has no unique commit');
      const parts = lines[0]!.split('\t'), commit = parts[0];
      if (!commit || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit) || parts.length !== 2 || parts[1] !== ref) throw new InstallerError('source-fetch-failed', 'Selected branch has no exact commit');
      return createDevSourceOffer({ kind: 'dev-source', delivery, sourceCommit: commit, target, runtime, recipeVersion: 'dev-v1' });
    });
  } finally {
    // Unknown ownership keeps its own temporary evidence; no recursive cleanup on
    // an unconfirmed run, including a child-start failure before cleanup exists.
    if (!run || (!existsSync(run.active) && JSON.parse(readFileSync(join(run.workspace, 'cleanup.json'), 'utf8')).confirmedClosed === true)) rmSync(root, { recursive: true });
  }
}

function realTree(path: string): void {
  let current = path;
  while (true) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new InstallerError('source-dirty', 'Selected source has missing or linked parents; retain it for inspection');
    const parent = join(current, '..');
    if (parent === current) break;
    current = parent;
  }
}
export async function inspectLocalDevSource(delivery: Extract<Delivery, { mode: 'dev' }>, git: DevGit): Promise<void> {
  if (!isAbsolute(delivery.repository)) return;
  try {
    realTree(delivery.repository);
    const bare = (await git(['rev-parse', '--is-bare-repository'], delivery.repository)).text.trim();
    if (bare === 'true') return;
    const dirty = await git(['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'], delivery.repository);
    if (dirty.text) throw new InstallerError('source-dirty', 'Configured local source has changes or conflicts; commit or preserve them before upgrade');
  } catch (cause) {
    if (cause instanceof InstallerError && cause.code === 'source-dirty') throw cause;
    throw new InstallerError('source-dirty', 'Configured local source is missing or cannot be inspected; retain it for inspection', { cause });
  }
}
const identityValidator = new Ajv({ strict: true }).compile<{
  schemaVersion: 1; installationId: string; operationId: string; attemptId: string; workerNonce: string; sourceSha256: string; coordinatorRunId: string;
}>(devObjectSchema({ schemaVersion: { const: 1 }, installationId: devTokenSchema, operationId: devTokenSchema,
  attemptId: devTokenSchema, workerNonce: devNonceSchema, sourceSha256: devHashSchema, coordinatorRunId: devTokenSchema }));
/** Consumes an independently verified selected receipt. No payload or selected
 * checkout is modified, and ignored build outputs are not source-input drift. */
export async function inspectManagedDevCheckout(location: InstallationLocation, receiptInput: DevReleaseReceipt, git: DevGit): Promise<void> {
  const receipt = parseDevReleaseReceipt(receiptInput), home = normalizeHome(location.home, receipt.sourceOffer.target.os);
  const checkout = join(home, receipt.checkoutRelativePath);
  try {
    realTree(checkout);
    realTree(join(checkout, '.insrc/tmp/dev-preparation'));
    const identity = parseDevRecord(identityValidator, JSON.parse((await readBoundedFile(join(checkout, '.insrc/tmp/dev-preparation/identity.json'), MAX_CONTROL_BYTES)).toString('utf8')));
    if (identity.installationId !== location.installationId || identity.sourceSha256 !== receipt.sourceOffer.sourceSha256
      || receipt.checkoutRelativePath !== devPreparationPaths(identity.operationId, identity.attemptId).checkoutRelativePath) throw new Error('foreign preparation');
    const { sourceSha256: _sourceDigest, ...identityFields } = identity;
    const record = parseDevPreparation({ ...identityFields, sourceOffer: receipt.sourceOffer,
      ...devPreparationPaths(identity.operationId, identity.attemptId), stage: 'building' });
    if ((await readVerifiedDevSourceResult(home, record)).outcome !== 'prepared') throw new Error('unprepared source');
    const origin = (await git(['config', '--get', 'remote.origin.url'], checkout)).text.trim();
    if (parseDevDelivery({ ...receipt.sourceOffer.delivery, repository: origin }).repository !== receipt.sourceOffer.delivery.repository
      || (await git(['rev-parse', '--verify', 'HEAD'], checkout)).text.trim() !== receipt.sourceOffer.sourceCommit
      || (await git(['rev-parse', '--abbrev-ref', 'HEAD'], checkout)).text.trim() !== 'HEAD') throw new Error('changed origin or HEAD');
    if ((await git(['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'], checkout)).text) throw new Error('dirty or conflicting checkout');
  } catch (cause) { throw new InstallerError('source-dirty', 'Selected managed checkout is missing, changed or foreign; retain it and resolve source changes before upgrade', { cause }); }
}

export interface DevGitPreparation { inputFingerprint: string; migrations: HookReference[]; compatiblePredecessors: string[] }
export async function prepareDevGit(run: BuildRun, scope: CommandScope, input: DevPreparationRecord, options: {
  location: InstallationLocation; predecessor?: DevReleaseReceipt; signal?: AbortSignal;
}): Promise<DevGitPreparation> {
  const record = parseDevPreparation(input), offer = parseDevSourceOffer(record.sourceOffer), home = normalizeHome(options.location.home, offer.target.os);
  if (options.location.installationId !== record.installationId || run.root !== join(home, record.checkoutRelativePath) || run.runId !== record.coordinatorRunId) throw new InstallerError('identity-mismatch', 'Git preparation belongs to another owned attempt');
  run.assertOwner(); realTree(run.root);
  return withWriter(run, scope, async () => {
  const git = ownedDevGit(run, scope, options.signal);
  await inspectLocalDevSource(offer.delivery, git);
  let predecessor: DevReleaseReceipt | undefined;
  if (options.predecessor) {
    predecessor = parseDevReleaseReceipt(options.predecessor);
    const prior = predecessor.sourceOffer;
    if (record.predecessorId !== predecessor.manifest.releaseId || canonicalJson(prior.delivery) !== canonicalJson(offer.delivery)
      || canonicalJson(prior.target) !== canonicalJson(offer.target) || canonicalJson(prior.runtime) !== canonicalJson(offer.runtime)
      || prior.recipeVersion !== offer.recipeVersion || predecessor.manifest.protocolVersion !== 1) throw new InstallerError('source-incompatible', 'Predecessor source, target, protocol or recipe differs');
    await inspectManagedDevCheckout(options.location, predecessor, git);
  } else if (record.predecessorId !== undefined) throw new InstallerError('source-incompatible', 'A verified dev predecessor receipt is required');
  if (readdirSync(run.root).some(name => name !== '.insrc')) throw new InstallerError('source-dirty', 'New attempt checkout is not pristine; retain its files');
  const noHooks = join(run.workspace, 'no-git-hooks');
  await git(['init', '--quiet', `--template=${noHooks}`, `--object-format=${offer.sourceCommit.length === 64 ? 'sha256' : 'sha1'}`]);
  await git(['remote', 'add', 'origin', offer.delivery.repository]);
  await git(['fetch', '--quiet', '--no-tags', '--no-recurse-submodules', 'origin', `+refs/heads/${offer.delivery.branch}:refs/insrc/accepted`]);
  if ((await git(['rev-parse', '--verify', `${offer.sourceCommit}^{commit}`])).text.trim() !== offer.sourceCommit) throw new InstallerError('source-fetch-failed', 'Accepted commit is unavailable; do not substitute the new branch tip');
  const tree = (await git(['ls-tree', '-r', '-z', '--full-tree', offer.sourceCommit])).text;
  for (const entry of tree.split('\0').filter(Boolean)) {
    const path = entry.slice(entry.indexOf('\t') + 1).normalize('NFC').toLowerCase();
    if (path === '.insrc/tmp' || path.startsWith('.insrc/tmp/') || (path === '.insrc' && entry.startsWith('120000 '))) throw new InstallerError('source-invalid', 'Source tree overlaps owned preparation metadata');
  }
  if (predecessor) {
    const ancestry = await git(['merge-base', '--is-ancestor', predecessor.sourceOffer.sourceCommit, offer.sourceCommit], run.root, [0, 1]);
    if (ancestry.code !== 0) throw new InstallerError('source-incompatible', 'Selected source history is not a supported forward upgrade');
  }
  await git(['checkout', '--quiet', '--detach', offer.sourceCommit]);
  if ((await git(['rev-parse', '--verify', 'HEAD'])).text.trim() !== offer.sourceCommit) throw new InstallerError('identity-mismatch', 'Checkout differs from the accepted commit');
  const pkg: unknown = JSON.parse((await git(['show', `${offer.sourceCommit}:package.json`])).text);
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new InstallerError('source-invalid', 'Accepted package metadata must be an object');
  return { inputFingerprint: inputFingerprint(run.root), migrations: parseDevHooks((pkg as Record<string, unknown>)['insrcInstaller']),
    compatiblePredecessors: predecessor ? [predecessor.manifest.releaseId] : [] };
  });
}
