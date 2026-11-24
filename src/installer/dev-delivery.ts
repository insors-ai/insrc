/** Dev delivery consumes manager-owned metadata/publication capabilities only. */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRun } from '../../scripts/test-harness/context.mjs';
import type { BuildRun } from '../../scripts/test-harness/context.mjs';
import { withRun } from '../../scripts/test-harness/process.mjs';
import type { CommandScope } from '../../scripts/test-harness/process.mjs';
import { InstallerError, MAX_CONTROL_BYTES, PRIVATE_NODE_VERSION } from './contracts.js';
import type { InstallationLocation, RuntimeIdentity, Target } from './contracts.js';
import type { PreparedCandidate, PreparationLease } from './bundle.js';
import { devCandidateFromReceipt, devPreparationPaths, parseDevDelivery, parseDevHooks, parseDevPreparation, parseDevSourceOffer } from './dev.js';
import type { DevPreparationRecord, DevReleaseReceipt, DevSourceOffer, PreparationContext } from './dev.js';
import { inspectLocalDevSource, inspectManagedDevCheckout, ownedDevGit, resolveDevSource } from './dev-git.js';
import { devWorkerPaths, launchDevWorker, readVerifiedDevResult } from './dev-worker.js';
import { devBuildEnvironment, verifyDevToolchain } from './dev-toolchain.js';
import { verifyDevPayload } from './dev-payload.js';
import { assertToken } from './location.js';
import { canonicalJson } from './release-descriptor.js';
import { runtimeArchive } from './runtime-policy.js';
import { parseInstaller, parseReleaseManifest } from './schemas.js';
import { readBoundedFile } from './safe-zip.js';
import type { DeliveryPort } from './peer-contracts.js';

export interface DevDeliveryOptions {
  /** Internal verified bootstrap trust and executable; never wire settings. */
  runtimeDirectory: string; workerEntrypoint: string;
  environment?: (() => NodeJS.ProcessEnv) | undefined;
}
function uncertain(message: string, cause?: unknown): InstallerError { return new InstallerError('preparation-uncertain', message, { cause }); }
async function ownedScope<T>(environment: NodeJS.ProcessEnv, work: (run: BuildRun, scope: CommandScope) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-dev-manager-'));
  let base: BuildRun;
  try { base = createRun(root, { mode: 'build' }); }
  catch (cause) { rmSync(root, { recursive: true }); throw cause; }
  const run: BuildRun = { ...base, environment: () => ({ ...environment, INSRC_TEST_RUN_ID: base.runId, INSRC_TEST_ROOT: base.root, INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
  let result: T | undefined, failure: unknown;
  try { result = await withRun(run, scope => work(run, scope)); } catch (cause) { failure = cause; }
  // Parent actor ownership is independent of the child worker's own proof.
  // Missing/unknown parent cleanup keeps evidence and blocks every publication.
  try {
    const cleanup = JSON.parse(readFileSync(join(run.workspace, 'cleanup.json'), 'utf8')) as { confirmedClosed?: boolean; closureMode?: string };
    if (existsSync(run.active) || cleanup.confirmedClosed !== true || cleanup.closureMode !== 'owned-groups') throw new Error('unclosed manager actors');
  } catch (cause) { throw uncertain('Manager preparation actor cleanup is unconfirmed', cause); }
  rmSync(root, { recursive: true });
  if (failure) throw failure;
  return result as T;
}

export async function openPreparedDev(location: InstallationLocation, releaseId: string, target: Target, runtimeDirectory: string): Promise<PreparedCandidate> {
  parseInstaller('location', location); assertToken(releaseId);
  const directory = join(location.home, 'releases', releaseId), { receipt, inventory } = await verifyDevPayload(directory, target, runtimeDirectory);
  return Object.freeze(devCandidateFromReceipt(directory, receipt, inventory));
}
async function finalStage(store: PreparationLease, record: DevPreparationRecord, target: Target, runtimeDirectory: string, context: PreparationContext): Promise<PreparedCandidate> {
  store.assertHeld(); context.signal?.throwIfAborted();
  const result = await readVerifiedDevResult(store.location.home, record);
  if (result.outcome !== 'prepared') throw new InstallerError(result.outcome === 'cancelled' ? 'source-cancelled' : 'source-build-failed', 'Private source preparation did not complete; inspect its retained diagnostic');
  const paths = devWorkerPaths(store.location.home, record);
  const { receipt } = await verifyDevPayload(paths.stage, target, runtimeDirectory, { ...(context.signal ? { signal: context.signal } : {}) });
  const pkg = JSON.parse((await readBoundedFile(join(paths.checkout, 'package.json'), MAX_CONTROL_BYTES)).toString('utf8')) as { insrcInstaller?: unknown };
  if (canonicalJson(receipt.sourceOffer) !== canonicalJson(record.sourceOffer) || receipt.checkoutRelativePath !== record.checkoutRelativePath
    || receipt.inventorySha256 !== result.inventorySha256 || canonicalJson(receipt.manifest.migrations) !== canonicalJson(parseDevHooks(pkg.insrcInstaller))
    || canonicalJson(receipt.manifest.compatiblePredecessors) !== canonicalJson(record.predecessorId ? [record.predecessorId] : [])
    || receipt.manifest.daemonEntry !== 'out/daemon/index.js' || receipt.manifest.tuiEntry !== 'out/cli/index.js') throw new InstallerError('candidate-conflict', 'Final receipt differs from closed accepted-source preparation');
  // Recheck the positive closure/source/output evidence after reading the stage.
  await readVerifiedDevResult(store.location.home, record);
  store.assertHeld(); context.signal?.throwIfAborted();
  context.checkpoint({ ...record, stage: 'prepared' });
  const destination = join(store.location.home, 'releases', record.sourceOffer.releaseId);
  if (existsSync(destination)) {
    try {
      await verifyDevPayload(destination, target, runtimeDirectory, { expectedReceipt: receipt, ...(context.signal ? { signal: context.signal } : {}) });
    } catch (cause) { throw new InstallerError('candidate-conflict', 'Immutable dev release ID already has different or invalid bytes', { cause }); }
  } else {
    context.signal?.throwIfAborted(); store.assertHeld(); store.publishCandidate(paths.stage, receipt.manifest.releaseId);
  }
  return openPreparedDev(store.location, receipt.manifest.releaseId, target, runtimeDirectory);
}

export function devDelivery(target: Target, options: DevDeliveryOptions): DeliveryPort {
  const runtime: RuntimeIdentity = { version: PRIVATE_NODE_VERSION, target, sha256: runtimeArchive(target).sha256,
    relativeExecutable: target.os === 'win32' ? 'node.exe' : 'bin/node' };
  const inherited = () => options.environment?.() ?? process.env;
  return {
    resolve: delivery => resolveDevSource(delivery, target, runtime, { environment: inherited() }),
    async prepare(store, input, context) {
      store.assertHeld(); context.signal?.throwIfAborted();
      if (input.kind !== 'dev-source') throw new InstallerError('delivery-invalid', 'Dev preparation requires an accepted dev source offer');
      const offer: DevSourceOffer = parseDevSourceOffer(input), inspected = store.inspect();
      if (inspected.kind !== 'present' || inspected.snapshot.operation?.operationId !== context.operationId || inspected.snapshot.operation.phase !== 'preparing'
        || canonicalJson(parseDevDelivery(inspected.snapshot.installation.delivery)) !== canonicalJson(offer.delivery) || canonicalJson(target) !== canonicalJson(offer.target)) throw uncertain('Preparation lacks the matching manager operation');
      if (context.readCheckpoint()) throw uncertain('An existing attempt requires explicit reconciliation');
      const predecessorId = inspected.snapshot.installation.activeReleaseId;
      let predecessor: DevReleaseReceipt | undefined;
      if (predecessorId) {
        // No implicit bundle/legacy adoption. Selected source preflight is done
        // by the fresh worker, or below when reusing an existing payload.
        predecessor = (await verifyDevPayload(join(store.location.home, 'releases', predecessorId), target, options.runtimeDirectory)).receipt;
        const prior = predecessor.sourceOffer;
        if (canonicalJson(prior.delivery) !== canonicalJson(offer.delivery) || canonicalJson(prior.target) !== canonicalJson(offer.target)
          || canonicalJson(prior.runtime) !== canonicalJson(offer.runtime) || prior.recipeVersion !== offer.recipeVersion) throw new InstallerError('source-incompatible', 'Selected dev provenance differs from the accepted source recipe');
      }
      const toolchain = verifyDevToolchain(options.runtimeDirectory, target), environment = devBuildEnvironment(toolchain, inherited());
      const destination = join(store.location.home, 'releases', offer.releaseId);
      if (existsSync(destination)) {
        let receipt: DevReleaseReceipt;
        try { receipt = (await verifyDevPayload(destination, target, options.runtimeDirectory)).receipt; }
        catch (cause) { throw new InstallerError('candidate-conflict', 'Existing immutable dev release is invalid; retain it for inspection', { cause }); }
        if (canonicalJson(receipt.sourceOffer) !== canonicalJson(offer)) throw new InstallerError('candidate-conflict', 'Existing dev release ID names another source');
        parseReleaseManifest(receipt.manifest, { target, ...(offer.releaseId !== predecessorId ? { predecessorId } : {}) });
        await ownedScope(environment, async (run, scope) => {
          const git = ownedDevGit(run, scope, context.signal);
          await inspectLocalDevSource(offer.delivery, git);
          if (predecessor) await inspectManagedDevCheckout(store.location, predecessor, git);
          await inspectManagedDevCheckout(store.location, receipt, git);
        });
        store.assertHeld(); context.signal?.throwIfAborted();
        return openPreparedDev(store.location, offer.releaseId, target, options.runtimeDirectory);
      }
      const attemptId = randomUUID(), operationId = context.operationId;
      const record = parseDevPreparation({ schemaVersion: 1, installationId: store.location.installationId, operationId, sourceOffer: offer,
        ...(predecessorId ? { predecessorId } : {}), attemptId, workerNonce: randomBytes(32).toString('hex'), ...devPreparationPaths(operationId, attemptId),
        coordinatorRunId: randomUUID(), stage: 'accepted' });
      context.checkpoint(record); // Durable acceptance precedes every worker admission.
      context.checkpoint({ ...record, stage: 'building' });
      const result = await ownedScope(environment, (_run, scope) => launchDevWorker(scope, store.location, record, {
        entrypoint: options.workerEntrypoint, environment, ...(context.signal ? { signal: context.signal } : {}),
      }));
      if (result.outcome !== 'prepared') {
        context.checkpoint({ ...record, stage: result.outcome });
        throw new InstallerError(result.outcome === 'cancelled' ? 'source-cancelled' : 'source-build-failed', 'Private source preparation failed; inspect its retained diagnostic');
      }
      return finalStage(store, record, target, options.runtimeDirectory, context);
    },
    open: (location, releaseId) => openPreparedDev(location, releaseId, target, options.runtimeDirectory),
    async verify(candidate, location) {
      const verified = await openPreparedDev(location, candidate.releaseId, target, options.runtimeDirectory);
      if (canonicalJson(verified) !== canonicalJson(candidate)) throw new InstallerError('candidate-conflict', 'Dev candidate differs from its stored immutable receipt/payload');
    },
  };
}
