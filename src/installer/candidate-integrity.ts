/** Private application authority. No field on a receipt/candidate/wire can mint it. */
import { lstat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { join } from 'node:path';
import type { PreparedCandidate } from './bundle.js';
import type { InstallationLocation } from './contracts.js';
import { InstallerError } from './contracts.js';
import { assertToken } from './location.js';
import { parseInstaller } from './schemas.js';
import { canonicalJson, digest } from './release-descriptor.js';
import type { PayloadInventory } from './release-descriptor.js';
import { assertVerifiedPayloadInventory, verifyPayloadInventory, verifyPublishedPayload } from './safe-zip.js';
import { readInstalledReceipt } from './installed-receipt.js';
import { readInstalledInventory } from './installed-control.js';
import { closedRuntimeOperation } from './runtime-acquire.js';
import { operationTimeBudgets } from './operation-time-budgets.mjs';

declare const operationBrand: unique symbol;
export interface CandidateIntegrityOperation { readonly [operationBrand]: true }
interface Operation {
  home: string; installationId: string; operationId: string; assertCurrent(): void;
  signals: Set<AbortSignal>; failed: boolean;
  candidates: WeakMap<PreparedCandidate, { identity: string; root: Stats }>;
}
const operations = new WeakMap<CandidateIntegrityOperation, Operation>();
const conflict = (message: string) => new InstallerError('candidate-conflict', message);

/** Called by trusted owning code, never reconstructed from operation metadata. */
export function createCandidateIntegrityOperation(location: InstallationLocation, operationId: string, assertCurrent: () => void, signal?: AbortSignal): CandidateIntegrityOperation {
  const checked = parseInstaller('location', location); assertToken(operationId); signal?.throwIfAborted(); assertCurrent();
  const operation = Object.freeze({}) as CandidateIntegrityOperation;
  operations.set(operation, { home: checked.home, installationId: checked.installationId, operationId, assertCurrent, signals: new Set(signal ? [signal] : []), failed: false, candidates: new WeakMap() });
  return operation;
}
export function invalidateCandidateIntegrity(operation?: CandidateIntegrityOperation): void {
  const state = operation && operations.get(operation); if (state) { state.failed = true; state.candidates = new WeakMap(); }
}
function current(operation: CandidateIntegrityOperation | undefined, location: InstallationLocation): Operation | undefined {
  const state = operation && operations.get(operation);
  if (!state) return undefined;
  if (state.failed || state.home !== location.home || state.installationId !== location.installationId) throw conflict('Application verification operation is failed or belongs to another installation');
  try { for (const signal of state.signals) signal.throwIfAborted(); state.assertCurrent(); }
  catch (cause) { invalidateCandidateIntegrity(operation); throw cause; }
  return state;
}
/** Producer cancellation joins the owning operation, even when its factory had
 * no signal. Verification-only timeout signals are never registered here. */
export function bindCandidateIntegritySignal(operation: CandidateIntegrityOperation | undefined, location: InstallationLocation, signal?: AbortSignal): void {
  const state = current(operation, location); if (state && signal) state.signals.add(signal); current(operation, location);
}
function identity(candidate: PreparedCandidate, location: InstallationLocation): string {
  assertToken(candidate.releaseId);
  if (candidate.directory !== join(location.home, 'releases', candidate.releaseId)) throw conflict('Application candidate is outside its immutable installation location');
  return canonicalJson(candidate);
}
async function metadata(candidate: PreparedCandidate, location: InstallationLocation, signal?: AbortSignal) {
  identity(candidate, location); signal?.throwIfAborted();
  const installed = await readInstalledReceipt(candidate.directory, candidate.manifest.target);
  const record = installed.mode === 'bundle' ? installed.descriptor : installed.receipt;
  const expected: PreparedCandidate = { directory: candidate.directory, releaseId: installed.manifest.releaseId, manifest: installed.manifest,
    descriptorSha256: digest(canonicalJson(record)), payloadSha256: installed.manifest.payloadSha256, inventorySha256: record.inventorySha256 };
  if (canonicalJson(expected) !== canonicalJson(candidate)) throw conflict('Application candidate differs from its immutable receipt');
  const inventory = await readInstalledInventory(candidate.directory, record.inventorySha256, signal);
  return { installed, inventory };
}
/** Transfer an actual closed full-check result across same-inode publication.
 * T7 can supply the inventory checked by its qualified parent finalizer. */
export async function rememberCandidateIntegrity(candidate: PreparedCandidate, location: InstallationLocation, inventory: PayloadInventory, operation?: CandidateIntegrityOperation, external?: AbortSignal): Promise<void> {
  try {
    const state = current(operation, location), deadline = AbortSignal.timeout(operationTimeBudgets().manager.fileMs);
    const signal = AbortSignal.any([deadline, ...(external ? [external] : []), ...(state?.signals ?? [])]);
    await closedRuntimeOperation((async () => {
      await assertVerifiedPayloadInventory(inventory, candidate.directory, operation);
      const actual = await metadata(candidate, location, signal);
      if (canonicalJson(inventory) !== canonicalJson(actual.inventory)) throw conflict('Verified application inventory differs from its published receipt');
      const root = await lstat(candidate.directory);
      await assertVerifiedPayloadInventory(inventory, candidate.directory, operation); current(operation, location); signal.throwIfAborted();
      if (state) state.candidates.set(candidate, { identity: identity(candidate, location), root });
    })(), signal);
  } catch (cause) { invalidateCandidateIntegrity(operation); throw cause; }
}
/** Full activation/recovery check once per trusted live operation. Plain data or
 * missing context performs a fresh check; bounded control opening is separate. */
export async function verifyCandidateIntegrity(candidate: PreparedCandidate, location: InstallationLocation, operation?: CandidateIntegrityOperation): Promise<void> {
  try {
    const state = current(operation, location), cached = state?.candidates.get(candidate);
    if (cached) {
      if (cached.identity !== identity(candidate, location)) throw conflict('Verified application candidate identity changed');
      const root = await lstat(candidate.directory);
      if (!root.isDirectory() || root.isSymbolicLink() || root.dev !== cached.root.dev || root.ino !== cached.root.ino || root.uid !== cached.root.uid) throw conflict('Verified application root was replaced');
      current(operation, location); return;
    }
    const deadline = AbortSignal.timeout(operationTimeBudgets().manager.fileMs);
    const signal = state ? AbortSignal.any([deadline, ...state.signals]) : deadline;
    await closedRuntimeOperation((async () => {
      const actual = await metadata(candidate, location, signal);
      let inventory: PayloadInventory;
      if (actual.installed.mode === 'bundle') inventory = await verifyPublishedPayload(candidate.directory, actual.installed.descriptor, signal, operation);
      else {
        inventory = actual.inventory;
        await verifyPayloadInventory(candidate.directory, inventory, { receipt: '.dev-release.json', signal, operation });
      }
      current(operation, location);
      await rememberCandidateIntegrity(candidate, location, inventory, operation, signal);
    })(), signal);
  } catch (cause) { invalidateCandidateIntegrity(operation); throw cause; }
}
