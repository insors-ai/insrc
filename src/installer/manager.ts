import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { InstallerError } from './contracts.js';
import type { ControllerSnapshot, DependencyDecision, Delivery, InstallationLocation, ManagerEvent, ManagerRequest, MigrationContext, OperationRecord, Target, UpgradeOffer } from './contracts.js';
import { ControllerStore, inspectController, readPrivateControlRecord } from './controller-store.js';
import type { ControllerInspection } from './controller-store.js';
import { parseInstaller, parseManagerRequest, parseReleaseManifest } from './schemas.js';
import { canonicalJson, digest, parseReleaseDescriptor } from './release-descriptor.js';
import type { PreparedCandidate, PreparationLease } from './bundle.js';
import type { DeliveryPort, DependencyOperationContext, LaunchAdmission, ManagerPeers, MigrationEvidence, PreparedReleaseOffer, ReadyEvidence, ShutdownCompletion, ShutdownRequest } from './peer-contracts.js';
import { createDependencyOperationContext, createDependencyRetryContext, RETAINED_DEPENDENCY_NOTICE } from './dependency-context.js';
import { acceptResolvedDevSource, devUpgradeOfferId, parseDevDelivery, parseDevPreparation, parseDevReleaseReceipt, parseDevSourceOffer } from './dev.js';
import type { DevPreparationRecord, DevSourceOffer, PreparationContext } from './dev.js';
import { BUNDLE_LIMITS } from './release-descriptor.js';
import { readBoundedFile } from './safe-zip.js';
import { assertTerminalAdmission } from './terminal-admission.js';
import type { TerminalAdmission } from './terminal-admission.js';
import { forwardImmediate, openOperationControl } from './operation-control.js';
import { assertLocalControlRoot, assertToken } from './location.js';
import { controlBinding } from './native.js';

function fail(code: string, message: string): never { throw new InstallerError(code, message); }
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
interface Active {
  store: ControllerStore; snapshot: ControllerSnapshot; request: ManagerRequest; ownerNonce: string;
  checkCancellation(): void;
  candidate?: PreparedCandidate | undefined; admission?: LaunchAdmission | undefined; shutdown?: ShutdownRequest | undefined;
  previousResult?: OperationRecord | undefined; started: boolean; disrupted: boolean; interruptedPhase?: OperationRecord['phase'] | undefined; immediate?: Promise<void> | undefined;
  dependencyServiceAdmitted?: boolean | undefined;
}
export class InstallerManager {
  #active: Active | undefined;
  constructor(readonly location: InstallationLocation, readonly target: Target, readonly peers: ManagerPeers, readonly progress: (event: ManagerEvent) => void = () => {}) {
    parseInstaller('location', location); parseInstaller('target', target);
    this.location = structuredClone(location); Object.freeze(this.location.daemonEndpoint); Object.freeze(this.location);
    this.target = Object.freeze(structuredClone(target));
  }
  inspect(): ControllerInspection & { installRetryOperationId?: string | undefined } {
    const inspection = inspectController(this.location);
    if (inspection.kind !== 'present') return inspection;
    const id = inspection.snapshot.operation?.operationId ?? inspection.snapshot.lastResult?.operationId;
    if (!id) return inspection;
    try {
      this.#installRetryState(inspection.snapshot, id, name => {
        const directory = join(this.location.home, 'install/operations', id);
        assertLocalControlRoot(directory, this.target.os === 'win32' ? path => controlBinding().localVolume(path) : undefined);
        const file = join(directory, `${name}.json`);
        return existsSync(file) ? readPrivateControlRecord(file) : undefined;
      });
      return { ...inspection, installRetryOperationId: id };
    } catch { return inspection; } // Unknown/later work is never offered install cleanup.
  }
  #installPreparation(operationId: string) {
    return { schemaVersion: 1, installationId: this.location.installationId, home: this.location.home,
      operationId, originalAction: 'install', protocol: 'dependency-before-delivery-v1' };
  }
  #installCleanupComplete(operationId: string) {
    return { schemaVersion: 1, installationId: this.location.installationId, home: this.location.home, operationId, cleanupComplete: true };
  }
  #installRetryState(snapshot: ControllerSnapshot, operationId: string, read: (name: string) => unknown) {
    assertToken(operationId);
    if (snapshot.operation ? snapshot.operation.operationId !== operationId : snapshot.lastResult?.operationId !== operationId) fail('phase-conflict', 'Retry must name the exact interrupted install');
    if (snapshot.installation.activeReleaseId !== undefined || snapshot.operation?.candidateId !== undefined
      || snapshot.operation?.predecessorId !== undefined) fail('phase-conflict', 'Install cleanup cannot change a selected release or admitted candidate');
    const intent = parseInstaller('managerRequest', read('intent'));
    if (intent.action !== 'install' || intent.operationId !== operationId || intent.installationId !== this.location.installationId
      || Object.keys(intent).sort().join(',') !== 'action,installationId,operationId,protocolVersion') fail('phase-conflict', 'Cleanup requires the exact original terminal install intent');
    if (canonicalJson(read('install-preparation')) !== canonicalJson(this.#installPreparation(operationId))) fail('phase-conflict', 'Original install lacks proven dependency-before-delivery scope');
    for (const key of ['candidate', 'dev-preparation', 'delivery-preparation', 'shutdown', 'admission']) {
      if (read(key) !== undefined) fail('phase-conflict', `Install cleanup cannot reset admitted ${key} work`);
    }
    const complete = read('install-retry');
    if (complete !== undefined && canonicalJson(complete) !== canonicalJson(this.#installCleanupComplete(operationId))) fail('dependency-uncertain', 'Install cleanup completion belongs to another operation/home');
    if (!snapshot.operation) {
      if (!complete || snapshot.lastResult?.operationId !== operationId) fail('phase-conflict', 'No matching interrupted install exists');
      return { intent, complete: true };
    }
    if (snapshot.operation.operationId !== operationId) fail('phase-conflict', 'Another operation owns this installation');
    const interruption = snapshot.operation.phase === 'blocked' ? read('interruption') : undefined;
    if (snapshot.operation.phase === 'blocked' && canonicalJson(interruption) !== canonicalJson({ phase: 'preparing' })) fail('phase-conflict', 'Interrupted install phase is unconfirmed');
    const phase = snapshot.operation.phase === 'blocked' ? 'preparing' : snapshot.operation.phase;
    if (phase !== 'preparing') fail('phase-conflict', 'Later install work retains its existing recovery contract');
    return { intent, complete: false };
  }
  /** Explicit terminal retry cleans only dependency preparation. The caller
   * starts a NEW ordinary install after this method positively completes. */
  async retryInstall(admission: TerminalAdmission, operationId: string, signal?: AbortSignal): Promise<void> {
    assertTerminalAdmission(admission); assertToken(operationId);
    const checkCancellation = () => { if (signal?.aborted) fail('cancelled', 'Install retry cancelled before fresh installation'); };
    checkCancellation(); if (this.#active) fail('busy', 'Manager already owns an operation');
    const store = ControllerStore.acquire(this.location); let active: Active | undefined;
    try {
      const inspection = store.inspect();
      if (inspection.kind !== 'present') fail('phase-conflict', 'Install retry needs its original intact controller');
      const snapshot = inspection.snapshot, state = this.#installRetryState(snapshot, operationId, name => store.readOperationData(operationId, name));
      active = { store, snapshot, request: state.intent, checkCancellation, ownerNonce: randomBytes(32).toString('hex'),
        previousResult: snapshot.lastResult, started: false, disrupted: true, interruptedPhase: 'preparing' };
      this.#active = active;
      const current = () => { this.#assertCurrent(active!); checkCancellation(); };
      const dependency = this.#dependencyAttempt(active);
      if (dependency?.decision.choice === 'install') {
        const cleanup = this.peers.dependencies?.cleanupInstall;
        if (!cleanup) fail('capability-unavailable', 'Owned dependency install cleanup is unavailable');
        const context = createDependencyRetryContext(this.location, this.target.os, { operationId, attemptNonce: dependency.attemptNonce,
          signal, assertCurrent: current, progress: (stage, detail) => { current(); this.progress(this.#event(active!, { ...snapshot.operation!, operationId, phase: 'preparing', message: `${stage}: ${detail}` }, 'progress')); } });
        current(); await cleanup.call(this.peers.dependencies, this.location, context); current();
      }
      if (!this.peers.dependencies) fail('capability-unavailable', 'Dependency reconciliation is unavailable');
      const report = parseInstaller('dependencyReport', await this.peers.dependencies.inspect(this.location, { signal })); current();
      if (!report.runtimeReady || report.ollama === 'unavailable') fail('dependency-uncertain', report.blockers.join('; ') || 'Dependency closure/availability remains unconfirmed');
      const complete = this.#installCleanupComplete(operationId);
      const previous = store.readOperationData(operationId, 'install-retry');
      if (previous === undefined) store.writeOperationData(operationId, 'install-retry', complete);
      else if (canonicalJson(previous) !== canonicalJson(complete)) fail('dependency-uncertain', 'Install cleanup completion changed');
      current();
      if (!state.complete) this.#finish(active, { operationId, phase: 'stopped', message: 'Interrupted install cleanup completed; a fresh install may be started.' });
    } catch (cause) {
      if (active?.snapshot.operation) {
        store.writeOperationData(operationId, 'interruption', { phase: 'preparing' }, true);
        this.#update(active, 'blocked', { errorCode: 'dependency-uncertain', message: cause instanceof Error ? cause.message.slice(0, 3500) : 'Install cleanup is incomplete' });
      }
      throw cause;
    } finally { this.#active = undefined; store.close(); }
  }
  #delivery(delivery: Delivery): DeliveryPort {
    const port = (delivery.mode === 'bundle' ? this.peers.bundle : this.peers.dev) ?? fail('capability-unavailable', `${delivery.mode} preparation capability is unavailable`);
    for (const name of ['resolve', 'prepare', 'open', 'verify'] as const) if (typeof port[name] !== 'function') fail('capability-unavailable', `Required delivery capability ${name} is unavailable`);
    return port;
  }
  #ports(): void {
    if (!this.peers.dependencies || !this.peers.lifecycle || !this.peers.migrations) fail('capability-unavailable', 'Dependency, lifecycle/readiness and migration capabilities are required');
    for (const [port, methods] of [[this.peers.dependencies, ['inspect', 'decide']], [this.peers.lifecycle, ['observe', 'shutdown', 'waitShutdownCompletion', 'reconcileShutdown', 'launchMigration', 'readMigrationExitReceipt', 'migrationOwnership', 'activate', 'reconcileActivation']], [this.peers.migrations, ['waitForJournal', 'reconcileJournal', 'allowRetry', 'verifyInstalled']]] as const) {
      for (const method of methods) if (typeof (port as unknown as Record<string, unknown>)[method] !== 'function') fail('capability-unavailable', `Required capability ${method} is unavailable`);
    }
  }
  #offer(input: PreparedReleaseOffer, delivery: Delivery, predecessorId?: string): PreparedReleaseOffer {
    if (input.kind === 'dev-source' && delivery.mode === 'dev') {
      const offer = parseDevSourceOffer(input);
      if (canonicalJson(offer.delivery) !== canonicalJson(parseDevDelivery(delivery)) || canonicalJson(offer.target) !== canonicalJson(this.target)) fail('source-invalid', 'Source offer differs from the configured delivery/target');
      return offer;
    }
    if (input.kind !== 'bundle' || delivery.mode !== 'bundle') fail('delivery-invalid', 'Offer kind differs from configured delivery');
    const manifest = parseReleaseManifest(input.manifest, { target: this.target, predecessorId });
    if (!hash(input.descriptorSha256)) fail('manifest-invalid', 'Offer lacks exact descriptor identity');
    if (input.descriptor !== undefined) {
      const descriptor = parseReleaseDescriptor(input.descriptor, { target: this.target, predecessorId });
      if (digest(canonicalJson(descriptor)) !== input.descriptorSha256 || canonicalJson(descriptor.manifest) !== canonicalJson(manifest)) fail('offer-stale', 'Bundle descriptor differs from accepted identity');
      return { kind: 'bundle', manifest, descriptorSha256: input.descriptorSha256, descriptor };
    }
    return { kind: 'bundle', manifest, descriptorSha256: input.descriptorSha256 };
  }
  #offerId(offer: PreparedReleaseOffer, delivery: Delivery, predecessorId: string | undefined): string {
    return offer.kind === 'dev-source' ? devUpgradeOfferId(this.location, predecessorId, offer)
      : digest(canonicalJson({ location: this.location, current: predecessorId, delivery, descriptor: offer.descriptorSha256 }));
  }
  async checkUpgrade(): Promise<UpgradeOffer | undefined> {
    const current = this.inspect(); if (current.kind !== 'present') fail(current.kind === 'corrupt' ? 'controller-corrupt' : 'install-required', current.kind === 'corrupt' ? current.reason : 'Installation is missing');
    const configured = current.snapshot.installation.delivery, predecessorId = current.snapshot.installation.activeReleaseId;
    const offer = this.#offer(await this.#delivery(configured).resolve(configured), configured);
    const releaseId = offer.kind === 'bundle' ? offer.manifest.releaseId : offer.releaseId;
    if (releaseId === predecessorId) return undefined;
    if (offer.kind === 'bundle') parseReleaseManifest(offer.manifest, { target: this.target, predecessorId });
    return parseInstaller('upgradeOffer', { offerId: this.#offerId(offer, configured, predecessorId), installationId: this.location.installationId, currentReleaseId: predecessorId, candidateReleaseId: releaseId, delivery: configured });
  }
  async execute(input: unknown): Promise<ManagerEvent> {
    const request = parseManagerRequest(input);
    if (request.installationId !== this.location.installationId) fail('identity-mismatch', 'Request belongs to another installation');
    if (request.action === 'inspect' || request.action === 'check-upgrade') {
      const inspected = this.inspect();
      const offer = request.action === 'check-upgrade' ? await this.checkUpgrade() : undefined;
      const state: OperationRecord = { operationId: request.operationId, phase: inspected.kind === 'present' ? inspected.snapshot.operation?.phase ?? inspected.snapshot.lastResult?.phase ?? 'stopped' : inspected.kind === 'missing' ? 'stopped' : 'blocked', message: request.action === 'check-upgrade' ? canonicalJson({ offer: offer ?? null }) : canonicalJson(inspected.kind === 'present' ? { revision: inspected.snapshot.revision, installationId: this.location.installationId, activeReleaseId: inspected.snapshot.installation.activeReleaseId, operationId: inspected.snapshot.operation?.operationId } : inspected) };
      return parseInstaller('managerEvent', { protocolVersion: 1, operationId: request.operationId, kind: 'result', state, retryable: false });
    }
    if (request.action === 'stop' && request.shutdownMode === 'immediate') return this.escalateShutdown(request);
    return this.#mutate(request);
  }
  /** Immediate intent joins its existing owner; it is never a new mutation. */
  async escalateShutdown(input: unknown): Promise<ManagerEvent> {
    return this.#active ? this.requestImmediate(input) : forwardImmediate(this.location, input);
  }
  /** Separate capability-based API, never reached by ordinary manager input. */
  async install(admission: TerminalAdmission, operationId: string, delivery: Delivery, decision?: DependencyDecision, signal?: AbortSignal): Promise<ManagerEvent> {
    assertTerminalAdmission(admission); parseInstaller('delivery', delivery);
    const request: ManagerRequest = { protocolVersion: 1, operationId, installationId: this.location.installationId, action: 'install' };
    parseInstaller('managerRequest', request); return this.#mutate(request, delivery, decision, signal);
  }
  async upgradeFromTerminal(admission: TerminalAdmission, input: unknown, decision?: DependencyDecision, signal?: AbortSignal): Promise<ManagerEvent> {
    assertTerminalAdmission(admission); const request = parseManagerRequest(input);
    if (request.action !== 'upgrade' || request.installationId !== this.location.installationId) fail('identity-mismatch', 'Terminal upgrade targets another operation');
    return this.#mutate(request, undefined, decision, signal);
  }
  #assertCurrent(active: Active): void {
    active.store.assertHeld(); const inspected = active.store.inspect();
    if (inspected.kind !== 'present' || canonicalJson(inspected.snapshot) !== canonicalJson(active.snapshot)) fail('revision-conflict', 'Controller changed outside its sole operation owner');
  }
  #event(active: Active, state: OperationRecord, kind: 'progress' | 'result'): ManagerEvent {
    return parseInstaller('managerEvent', { protocolVersion: 1, operationId: active.request.operationId, kind, state, retryable: state.phase === 'blocked' || !!state.errorCode });
  }
  #update(active: Active, phase: OperationRecord['phase'], extra: Partial<OperationRecord> = {}): void {
    this.#assertCurrent(active);
    const operation: OperationRecord = { ...active.snapshot.operation, operationId: active.request.operationId, phase, ...extra };
    const next: ControllerSnapshot = { ...active.snapshot, revision: active.snapshot.revision + 1, installation: { ...active.snapshot.installation, operationId: operation.operationId }, operation };
    active.store.commit(next, active.snapshot.revision); active.snapshot = next; active.started = true; this.progress(this.#event(active, operation, 'progress'));
  }
  #finish(active: Active, state: OperationRecord, select = false, preserveResult = false): ManagerEvent {
    this.#assertCurrent(active);
    const next: ControllerSnapshot = { ...active.snapshot, revision: active.snapshot.revision + 1, installation: { ...active.snapshot.installation, operationId: undefined, ...(select ? { activeReleaseId: active.candidate!.releaseId } : {}) }, operation: undefined, lastResult: preserveResult ? active.previousResult : state };
    active.store.commit(next, active.snapshot.revision); active.snapshot = next; return this.#event(active, state, 'result');
  }
  async #verify(active: Active, candidate: PreparedCandidate): Promise<void> {
    parseReleaseManifest(candidate.manifest, { target: this.target, ...(candidate.releaseId !== active.snapshot.installation.activeReleaseId ? { predecessorId: active.snapshot.installation.activeReleaseId } : {}) });
    if (candidate.directory !== join(this.location.home, 'releases', candidate.releaseId) || candidate.releaseId !== candidate.manifest.releaseId || candidate.payloadSha256 !== candidate.manifest.payloadSha256 || !hash(candidate.descriptorSha256) || !hash(candidate.inventorySha256)) fail('candidate-conflict', 'Candidate identity or immutable location differs');
    await this.#delivery(active.snapshot.installation.delivery).verify(candidate, this.location); active.store.assertHeld();
  }
  #lease(active: Active, signal?: AbortSignal): PreparationLease {
    const assertHeld = () => {
      this.#assertCurrent(active);
      if (active.snapshot.operation?.phase !== 'preparing') fail('preparation-uncertain', 'Preparation publication requires its preparing owner');
      if (signal?.aborted) fail('cancelled', 'Preparation owner cancelled');
    };
    return { location: active.store.location, assertHeld, inspect: () => { assertHeld(); return active.store.inspect(); },
      ensureRuntime: (identity, options) => { assertHeld(); return active.store.ensureRuntime(identity, options); },
      publishCandidate: (directory, releaseId) => { assertHeld(); return active.store.publishCandidate(directory, releaseId); } };
  }
  #acceptedSource(active: Active): DevSourceOffer {
    try {
      const value = active.store.readOperationData(active.request.operationId, 'dev-source') as { schemaVersion?: unknown; sourceOffer?: unknown } | undefined;
      if (!value || value.schemaVersion !== 1 || Object.keys(value).sort().join(',') !== 'schemaVersion,sourceOffer') throw new Error('missing source');
      const offer = this.#offer(parseDevSourceOffer(value.sourceOffer), active.snapshot.installation.delivery);
      if (offer.kind !== 'dev-source') throw new Error('wrong source mode');
      return offer;
    } catch (cause) { throw new InstallerError('preparation-uncertain', 'Original accepted source cannot be recovered', { cause }); }
  }
  #dependencyAttempt(active: Active): { schemaVersion: 1; operationId: string; installationId: string; attemptNonce: string; decision: DependencyDecision } | undefined {
    const input = active.store.readOperationData(active.request.operationId, 'dependency');
    if (input === undefined) return undefined;
    const record = input as { schemaVersion: 1; operationId: string; installationId: string; attemptNonce: string; decision: DependencyDecision };
    try {
      if (!record || Object.keys(record).sort().join(',') !== 'attemptNonce,decision,installationId,operationId,schemaVersion'
        || record.schemaVersion !== 1 || record.operationId !== active.request.operationId || record.installationId !== this.location.installationId || !hash(record.attemptNonce)) throw new Error('binding differs');
      parseInstaller('dependencyDecision', record.decision); return record;
    } catch (cause) { throw new InstallerError('dependency-uncertain', 'Recorded dependency intent cannot be reconciled', { cause }); }
  }
  #dependencyContext(active: Active, decision: DependencyDecision, signal?: AbortSignal): DependencyOperationContext {
    const assertCurrent = () => {
      this.#assertCurrent(active); active.checkCancellation();
      if (active.snapshot.operation?.phase !== 'preparing') fail('dependency-uncertain', 'Dependency mutation requires its live preparing owner');
    };
    assertCurrent();
    if (this.#dependencyAttempt(active)) fail('dependency-uncertain', 'Recorded dependency work must be inspected without replay');
    const record = { schemaVersion: 1 as const, operationId: active.request.operationId, installationId: this.location.installationId, attemptNonce: randomBytes(32).toString('hex'), decision };
    active.store.writeOperationData(active.request.operationId, 'dependency', record);
    return createDependencyOperationContext(this.location, this.target.os, { operationId: record.operationId, attemptNonce: record.attemptNonce, signal, assertCurrent,
      progress: (stage, detail) => {
        if (stage === 'ollama-service-admitted') active.dependencyServiceAdmitted = true;
        assertCurrent(); this.progress(this.#event(active, { ...active.snapshot.operation!, message: `${stage}: ${detail}` }, 'progress'));
      } });
  }
  #acceptedOffer(active: Active): PreparedReleaseOffer {
    const value = active.store.readOperationData(active.request.operationId, 'release-offer') as { schemaVersion?: unknown; offer?: unknown; kind?: unknown; descriptor?: unknown; descriptorSha256?: unknown } | undefined;
    if (value?.schemaVersion === 2) {
      if (value.kind !== 'bundle' || Object.keys(value).sort().join(',') !== 'descriptor,descriptorSha256,kind,schemaVersion') fail('dependency-uncertain', 'Durable complete bundle descriptor is unavailable');
      const descriptor = parseReleaseDescriptor(value.descriptor, { target: this.target, predecessorId: active.snapshot.installation.activeReleaseId });
      return this.#offer({ kind: 'bundle', manifest: descriptor.manifest, descriptor, descriptorSha256: value.descriptorSha256 as string }, active.snapshot.installation.delivery, active.snapshot.installation.activeReleaseId);
    }
    if (!value || value.schemaVersion !== 1 || Object.keys(value).sort().join(',') !== 'offer,schemaVersion') fail('dependency-uncertain', 'Original release offer is unavailable after dependency interruption');
    return this.#offer(value.offer as PreparedReleaseOffer, active.snapshot.installation.delivery, active.snapshot.installation.activeReleaseId);
  }
  #admitInstallDelivery(active: Active): void {
    this.#assertCurrent(active); active.checkCancellation();
    const original = parseInstaller('managerRequest', active.store.readOperationData(active.request.operationId, 'intent'));
    if (original.action !== 'install') return;
    const value = { schemaVersion: 1, installationId: this.location.installationId, operationId: original.operationId, kind: 'delivery-preparation' };
    const prior = active.store.readOperationData(original.operationId, 'delivery-preparation');
    if (prior === undefined) active.store.writeOperationData(original.operationId, 'delivery-preparation', value);
    else if (canonicalJson(prior) !== canonicalJson(value)) fail('preparation-uncertain', 'Delivery preparation admission differs');
  }
  /** Typed metadata capability bound to this exact live manager lease/revision.
   * Peers never receive the controller writer or an arbitrary metadata filename. */
  #preparation(active: Active, source: DevSourceOffer | undefined, signal?: AbortSignal): PreparationContext {
    const acceptedSource = source ? parseDevSourceOffer(source) : undefined;
    const validate = (input: unknown): DevPreparationRecord => {
      if (!acceptedSource) fail('delivery-invalid', 'Bundle delivery has no dev checkpoint capability');
      const record = parseDevPreparation(input);
      if (record.installationId !== this.location.installationId || record.operationId !== active.request.operationId
        || canonicalJson(record.sourceOffer) !== canonicalJson(acceptedSource) || record.predecessorId !== active.snapshot.operation?.predecessorId
        || !record.coordinatorRunId || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(record.coordinatorRunId) || !record.resultRelativePath) fail('preparation-uncertain', 'Preparation checkpoint differs from the accepted manager operation');
      return record;
    };
    const read = (): DevPreparationRecord | undefined => {
      this.#assertCurrent(active);
      const value = active.store.readOperationData(active.request.operationId, 'dev-preparation');
      return value === undefined ? undefined : validate(value);
    };
    return { operationId: active.request.operationId, signal, readCheckpoint: read, checkpoint: input => {
      this.#assertCurrent(active);
      if (active.snapshot.operation?.phase !== 'preparing') fail('preparation-uncertain', 'Preparation metadata requires its live preparing owner');
      const record = validate(input), previous = read();
      const transitions: Record<DevPreparationRecord['stage'], DevPreparationRecord['stage'][]> = {
        accepted: ['accepted', 'building'], building: ['building', 'prepared', 'failed', 'cancelled'], prepared: ['prepared'], failed: ['failed'], cancelled: ['cancelled'],
      };
      const serialRetry = active.request.action === 'retry-migration' && previous && ['failed', 'cancelled'].includes(previous.stage) && record.stage === 'accepted'
        && record.attemptId !== previous.attemptId && record.workerNonce !== previous.workerNonce && record.coordinatorRunId !== previous.coordinatorRunId;
      if ((!previous && record.stage !== 'accepted') || (previous && !serialRetry && (canonicalJson({ ...previous, stage: record.stage }) !== canonicalJson(record)
        || !transitions[previous.stage].includes(record.stage)))) fail('preparation-uncertain', 'Preparation attempt identity or stage transition differs');
      if (signal?.aborted && !['failed', 'cancelled'].includes(record.stage)) fail('cancelled', 'Preparation owner cancelled');
      active.store.writeOperationData(active.request.operationId, 'dev-preparation', record, previous !== undefined);
    } };
  }
  async #acceptedCandidate(active: Active, offer: PreparedReleaseOffer): Promise<void> {
    const candidate = active.candidate!;
    if (offer.kind === 'bundle') {
      if (candidate.releaseId !== offer.manifest.releaseId || candidate.descriptorSha256 !== offer.descriptorSha256) fail('candidate-conflict', 'Prepared candidate differs from accepted bundle offer');
      return;
    }
    const accepted = active.store.readOperationData(active.request.operationId, 'dev-source') as { schemaVersion?: unknown; sourceOffer?: unknown } | undefined;
    if (!accepted || accepted.schemaVersion !== 1 || Object.keys(accepted).sort().join(',') !== 'schemaVersion,sourceOffer'
      || canonicalJson(parseDevSourceOffer(accepted.sourceOffer)) !== canonicalJson(offer)) fail('candidate-conflict', 'Dev offer changed after durable acceptance');
    const raw = await readBoundedFile(join(candidate.directory, '.dev-release.json'), BUNDLE_LIMITS.descriptorBytes);
    const receipt = parseDevReleaseReceipt(JSON.parse(raw.toString('utf8')));
    if (canonicalJson(receipt) !== raw.toString('utf8') || canonicalJson(receipt.sourceOffer) !== canonicalJson(offer)
      || canonicalJson(receipt.manifest) !== canonicalJson(candidate.manifest) || candidate.releaseId !== offer.releaseId
      || candidate.descriptorSha256 !== digest(raw)) fail('candidate-conflict', 'Prepared dev receipt differs from the exact accepted source');
    this.#assertCurrent(active);
  }
  #context(active: Active): MigrationContext { return { installationId: this.location.installationId, operationId: active.request.operationId, fromReleaseId: active.snapshot.operation?.predecessorId, toReleaseId: active.candidate!.releaseId, dataHome: this.location.home }; }
  #admit(active: Active, purpose: LaunchAdmission['purpose']): LaunchAdmission {
    this.#assertCurrent(active);
    const sessionId = randomUUID(), candidate = active.candidate!;
    const admission: LaunchAdmission = { schemaVersion: 1, purpose, installationId: this.location.installationId, operationId: active.request.operationId, candidateReleaseId: candidate.releaseId, candidateInventorySha256: candidate.inventorySha256, sessionId, childInstanceId: randomUUID(), completionNonce: randomBytes(32).toString('hex'), ownerNonce: active.ownerNonce, controllerRevision: active.snapshot.revision + 1, receiptPath: join(this.location.home, 'install/receipts', active.request.operationId, `${sessionId}.json`) };
    active.store.writeOperationData(active.request.operationId, 'admission', admission, true); active.admission = admission;
    this.#update(active, purpose === 'migration' ? 'migrating' : 'activating'); return admission;
  }
  assertLiveAdmission(admission: LaunchAdmission): void {
    const active = this.#active;
    if (!active || active.admission?.sessionId !== admission.sessionId || active.ownerNonce !== admission.ownerNonce || active.snapshot.operation?.operationId !== admission.operationId || !['migrating', 'activating'].includes(active.snapshot.operation.phase)) fail('admission-stale', 'Candidate lacks its matching live manager admission');
    this.#assertCurrent(active);
    if (canonicalJson(active.store.readOperationData(admission.operationId, 'admission')) !== canonicalJson(admission)) fail('admission-stale', 'Durable admission differs');
  }
  #checkAdmission(input: unknown, active: Active): LaunchAdmission {
    if (!input || typeof input !== 'object') return fail('recovery-uncertain', 'Missing durable launch admission');
    const value = input as LaunchAdmission, candidate = active.candidate!;
    for (const key of ['sessionId', 'childInstanceId', 'operationId', 'candidateReleaseId', 'installationId'] as const) if (typeof value[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value[key])) fail('recovery-uncertain', 'Malformed launch identity');
    const keys = ['schemaVersion','purpose','installationId','operationId','candidateReleaseId','candidateInventorySha256','sessionId','childInstanceId','completionNonce','ownerNonce','controllerRevision','receiptPath'].sort();
    if (Object.keys(value).sort().join(',') !== keys.join(',') || value.schemaVersion !== 1 || !['migration', 'activation'].includes(value.purpose) || !hash(value.ownerNonce) || !hash(value.completionNonce) || !Number.isSafeInteger(value.controllerRevision) || value.controllerRevision < 1 || value.controllerRevision > active.snapshot.revision || value.installationId !== this.location.installationId || value.operationId !== active.request.operationId || value.candidateReleaseId !== candidate.releaseId || value.candidateInventorySha256 !== candidate.inventorySha256 || value.receiptPath !== join(this.location.home, 'install/receipts', value.operationId, `${value.sessionId}.json`)) fail('recovery-uncertain', 'Launch admission identity differs');
    return value;
  }
  #journal(active: Active, admission: LaunchAdmission, proof: MigrationEvidence): void {
    const expected = active.candidate!.manifest.migrations;
    if (!proof || proof.validated !== true || proof.installationId !== admission.installationId || proof.operationId !== admission.operationId || proof.candidateReleaseId !== admission.candidateReleaseId || proof.candidateInventorySha256 !== admission.candidateInventorySha256 || proof.sessionId !== admission.sessionId || !Array.isArray(proof.hooks) || proof.hooks.length !== expected.length || expected.some((hook, i) => proof.hooks[i]?.id !== hook.id || proof.hooks[i]?.version !== hook.version || proof.hooks[i]?.passed !== true)) fail('migration-unvalidated', 'Applicable ordered hook tests and exact journal evidence are required');
  }
  async #migrationExit(active: Active, admission: LaunchAdmission, successful = true): Promise<boolean> {
    const identity = { installationId: admission.installationId, operationId: admission.operationId, candidateReleaseId: admission.candidateReleaseId, candidateInventorySha256: admission.candidateInventorySha256, sessionId: admission.sessionId, childInstanceId: admission.childInstanceId, completionNonce: admission.completionNonce };
    const receipt = await this.peers.lifecycle!.readMigrationExitReceipt(identity);
    if (!receipt || receipt.schemaVersion !== 1 || receipt.purpose !== 'migration' || (receipt.exitCode !== null && !Number.isSafeInteger(receipt.exitCode)) || (receipt.signal !== null && (typeof receipt.signal !== 'string' || !/^SIG[A-Z0-9]{1,24}$/.test(receipt.signal))) || (receipt.exitCode === null && receipt.signal === null) || (['installationId', 'operationId', 'candidateReleaseId', 'candidateInventorySha256', 'sessionId', 'childInstanceId', 'completionNonce'] as const).some(key => receipt[key] !== admission[key])) fail('migration-exit-evidence-invalid', 'Missing or mismatched natural-exit receipt');
    if (await this.peers.lifecycle!.migrationOwnership(identity) !== 'released') fail('recovery-uncertain', 'Previous data ownership is held or unknown');
    active.store.assertHeld();
    const ok = receipt.exitCode === 0 && receipt.signal === null;
    if (successful && !ok) fail('migration-failed', 'Migration child failed; explicit hook-policy recovery is required');
    return ok;
  }
  #ready(active: Active, admission: LaunchAdmission, proof: ReadyEvidence): void {
    if (!proof || proof.identity?.protocolVersion !== 1 || proof.identity.state !== 'ready' || proof.identity.instanceId !== admission.childInstanceId || proof.identity.installationId !== this.location.installationId || proof.identity.releaseId !== active.candidate!.releaseId || proof.sessionId !== admission.sessionId || proof.completionNonce !== admission.completionNonce || proof.candidateInventorySha256 !== admission.candidateInventorySha256 || canonicalJson(proof.endpoint) !== canonicalJson(this.location.daemonEndpoint)) fail('readiness-uncertain', 'Exact candidate readiness, endpoint and completion identity are required');
  }
  #completion(request: ShutdownRequest, completion: ShutdownCompletion | undefined): void {
    if (!completion || completion.operationId !== request.operationId || completion.instanceId !== request.expectedInstanceId || completion.completionNonce !== request.completionNonce || completion.resourceOwnershipReleased !== true) fail('shutdown-uncertain', 'Exact wrapper-observed exit and released resource ownership are required');
  }
  #absent(active: Active, observed: import('./peer-contracts.js').DaemonObservation): boolean {
    if (observed.state !== 'absent' || observed.resourceOwnershipReleased !== true) return false;
    if (!active.snapshot.installation.activeReleaseId) return observed.evidence?.kind === 'never-started';
    return observed.evidence?.kind === 'observed-exit' && observed.evidence.identity.installationId === this.location.installationId && observed.evidence.identity.releaseId === active.snapshot.installation.activeReleaseId && observed.evidence.identity.protocolVersion === 1;
  }
  async #reconcileShutdown(active: Active): Promise<boolean> {
    const shutdown = active.store.readOperationData(active.request.operationId, 'shutdown') as ShutdownRequest | undefined;
    if (shutdown === undefined) return false;
    if (!shutdown || Object.keys(shutdown).sort().join(',') !== 'completionEndpoint,completionNonce,expectedInstanceId,mode,operationId' || shutdown.operationId !== active.request.operationId || !hash(shutdown.completionNonce) || !['graceful', 'immediate'].includes(shutdown.mode) || typeof shutdown.expectedInstanceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(shutdown.expectedInstanceId) || typeof shutdown.completionEndpoint !== 'string' || (this.location.daemonEndpoint.kind === 'unix' ? !shutdown.completionEndpoint.startsWith(join(this.location.home, 's')) || !/^s[A-Za-z0-9_-]{10}$/.test(shutdown.completionEndpoint.slice(this.location.home.length + 1)) : shutdown.completionEndpoint !== this.location.daemonEndpoint.address + '-' + shutdown.completionNonce.slice(0, 16))) fail('recovery-uncertain', 'No exact interrupted instance evidence');
    active.shutdown = shutdown;
    this.#completion(shutdown, await this.peers.lifecycle!.reconcileShutdown(this.location, shutdown));
    active.store.assertHeld(); return true;
  }
  async #startObserved(active: Active): Promise<boolean> {
    const running = await this.peers.lifecycle!.observe(this.location); active.store.assertHeld();
    if (running.state === 'present' && running.identity.protocolVersion === 1 && running.identity.state === 'ready' && running.identity.installationId === this.location.installationId && running.identity.releaseId === active.candidate!.releaseId && canonicalJson(running.endpoint) === canonicalJson(this.location.daemonEndpoint)) return true;
    if (!this.#absent(active, running)) { active.disrupted = true; fail('readiness-uncertain', 'Existing daemon ownership is uncertain'); }
    return false;
  }
  async #quiesce(active: Active, mode: ShutdownRequest['mode'] = active.request.shutdownMode ?? 'graceful'): Promise<void> {
    active.checkCancellation();
    const observed = await this.peers.lifecycle!.observe(this.location); active.store.assertHeld();
    active.checkCancellation();
    if (this.#absent(active, observed)) return;
    if (observed.state !== 'present' || observed.identity.installationId !== this.location.installationId || observed.identity.releaseId !== active.snapshot.installation.activeReleaseId || observed.identity.protocolVersion !== 1 || observed.identity.state === 'migration-blocked' || canonicalJson(observed.endpoint) !== canonicalJson(this.location.daemonEndpoint)) { active.disrupted = true; fail('shutdown-uncertain', 'Incumbent identity or ownership is uncertain'); }
    const nonce = randomBytes(32).toString('hex');
    const request: ShutdownRequest = { operationId: active.request.operationId, expectedInstanceId: observed.identity.instanceId, mode, completionNonce: nonce, completionEndpoint: this.location.daemonEndpoint.kind === 'unix' ? join(this.location.home, 's' + randomBytes(7).toString('base64url').slice(0, 10)) : this.location.daemonEndpoint.address + '-' + nonce.slice(0, 16) };
    active.store.writeOperationData(active.request.operationId, 'shutdown', request); active.shutdown = request;
    this.#update(active, 'quiescing'); active.disrupted = true;
    const control = await openOperationControl(this.location, active.store, request.operationId, active.ownerNonce, input => this.requestImmediate(input));
    try {
      active.checkCancellation();
      const ack = await this.peers.lifecycle!.shutdown(this.location, request);
      if (ack?.accepted !== true || ack.operationId !== request.operationId || ack.instanceId !== request.expectedInstanceId || ack.mode !== request.mode) fail('shutdown-uncertain', 'Shutdown acknowledgement differs');
      this.#completion(request, await this.peers.lifecycle!.waitShutdownCompletion(this.location, request));
      await active.immediate; active.store.assertHeld();
    } finally { await control.close(); }
  }
  /** t7 forwards to this live owner; no second snapshot writer is exposed. */
  async requestImmediate(input: unknown): Promise<ManagerEvent> {
    const request = parseManagerRequest(input), active = this.#active;
    if (!active || !active.shutdown || active.snapshot.operation?.phase !== 'quiescing' || request.action !== 'stop' || request.shutdownMode !== 'immediate' || request.operationId !== active.request.operationId || request.installationId !== this.location.installationId) fail('escalation-unavailable', 'No matching live draining operation');
    this.#assertCurrent(active);
    active.immediate ??= (async () => { const sent = { ...active.shutdown!, mode: 'immediate' as const }; const ack = await this.peers.lifecycle!.shutdown(this.location, sent); if (ack?.accepted !== true || ack.operationId !== sent.operationId || ack.instanceId !== sent.expectedInstanceId || ack.mode !== 'immediate') fail('shutdown-uncertain', 'Immediate acknowledgement differs'); active.store.assertHeld(); })();
    await active.immediate; return this.#event(active, active.snapshot.operation!, 'progress');
  }
  async #mutate(request: ManagerRequest, installDelivery?: Delivery, decision?: DependencyDecision, signal?: AbortSignal): Promise<ManagerEvent> {
    const checkCancellation = () => { if (signal?.aborted) fail('cancelled', 'Installation cancelled at a safe boundary'); };
    checkCancellation(); if (this.#active) fail('busy', 'Manager already owns an operation');
    const store = ControllerStore.acquire(this.location);
    let active: Active | undefined;
    try {
      const inspected = store.inspect(); if (inspected.kind === 'corrupt') fail('controller-corrupt', inspected.reason);
      if (inspected.kind === 'missing' && request.action !== 'install') fail('install-required', 'Installation is missing');
      if (inspected.kind === 'present' && inspected.snapshot.installation.activeReleaseId && request.action === 'install') fail('already-installed', 'Installation already exists; use upgrade');
      let initial: ControllerSnapshot = inspected.kind === 'present' ? inspected.snapshot : { schemaVersion: 1, revision: 0, installation: { schemaVersion: 1, installationId: this.location.installationId, dataHome: this.location.home, delivery: installDelivery! } };
      if (request.action === 'install' && installDelivery && !initial.installation.activeReleaseId) initial = { ...initial, installation: { ...initial.installation, delivery: installDelivery } };
      const rawIntent = store.readOperationData(request.operationId, 'intent');
      const intent = rawIntent === undefined ? undefined : parseInstaller('managerRequest', rawIntent);
      if (intent && (intent.operationId !== request.operationId || intent.installationId !== this.location.installationId || !['install', 'upgrade', 'start', 'stop', 'restart'].includes(intent.action) || intent.installOllama !== undefined || (intent.action === 'upgrade' && !hash(intent.acceptedOfferId)))) fail('controller-corrupt', 'Stored operation intent is malformed or belongs to another operation');
      if (initial.lastResult?.operationId === request.operationId && !initial.operation && canonicalJson(intent) === canonicalJson(request)) return parseInstaller('managerEvent', { protocolVersion: 1, operationId: request.operationId, kind: 'result', state: initial.lastResult, retryable: false });
      if (initial.operation && request.action !== 'retry-migration') fail('phase-conflict', 'Unfinished operation requires explicit same-candidate recovery');
      if (request.action === 'retry-migration' && (!initial.operation || initial.operation.operationId !== request.operationId)) fail('phase-conflict', 'Recovery must name the interrupted operation');
      if (intent && request.action !== 'retry-migration') fail('operation-conflict', 'Operation identity was already used');
      const recovering = request.action === 'retry-migration';
      if (recovering && !intent) fail('recovery-uncertain', 'Recovery requires the original operation intent');
      const stopping = (recovering ? intent!.action : request.action) === 'stop';
      this.#ports();
      let interruptedPhase = initial.operation?.phase;
      if (recovering && interruptedPhase === 'blocked') {
        const interruption = store.readOperationData(request.operationId, 'interruption') as { phase?: OperationRecord['phase'] } | undefined;
        interruptedPhase = interruption && Object.keys(interruption).join(',') === 'phase' && ['preparing', 'quiescing', 'migrating', 'activating'].includes(interruption.phase ?? '') ? interruption.phase : undefined;
      }
      if (recovering && intent!.action === 'install' && interruptedPhase === 'preparing'
        && canonicalJson(store.readOperationData(request.operationId, 'install-preparation')) === canonicalJson(this.#installPreparation(request.operationId))
        && store.readOperationData(request.operationId, 'delivery-preparation') === undefined
        && store.readOperationData(request.operationId, 'candidate') === undefined) fail('install-retry-required', 'Use explicit Retry install in the shared terminal to complete cleanup before a fresh installation');
      active = { store, snapshot: initial, request, checkCancellation, ownerNonce: randomBytes(32).toString('hex'), previousResult: initial.lastResult, started: false, disrupted: recovering,
        interruptedPhase }; this.#active = active;
      if (stopping) {
        if (recovering) {
          if (!['preparing', 'quiescing'].includes(active.interruptedPhase ?? '')) fail('recovery-uncertain', 'Interrupted stop phase is uncertain');
          if (store.readOperationData(request.operationId, 'admission') !== undefined) fail('recovery-uncertain', 'Stop cannot own a launch admission');
          if (!await this.#reconcileShutdown(active)) {
            if (active.interruptedPhase !== 'preparing') fail('recovery-uncertain', 'Interrupted shutdown lacks exact completion evidence');
            await this.#quiesce(active, intent!.shutdownMode);
          }
        } else {
          store.writeOperationData(request.operationId, 'intent', request);
          this.#update(active, 'preparing', { predecessorId: initial.installation.activeReleaseId });
          await this.#quiesce(active);
        }
        return this.#finish(active, { ...active.snapshot.operation!, phase: 'stopped', errorCode: undefined, message: undefined });
      }
      const delivery = this.#delivery(initial.installation.delivery);
      let migrate = request.action === 'upgrade' || request.action === 'install';
      let offer: PreparedReleaseOffer | undefined;
      if (!recovering) {
        if (migrate) {
          offer = this.#offer(await delivery.resolve(initial.installation.delivery), initial.installation.delivery, initial.installation.activeReleaseId);
          if (request.action === 'upgrade') {
            if (offer.kind === 'dev-source') acceptResolvedDevSource(this.location, initial.installation.activeReleaseId, offer, request.acceptedOfferId!);
            else if (request.acceptedOfferId !== this.#offerId(offer, initial.installation.delivery, initial.installation.activeReleaseId)) fail('offer-stale', 'Upgrade acceptance differs from the exact current offer');
          }
        }
        checkCancellation(); store.assertHeld();
        if (inspected.kind === 'missing') store.commit(initial, null);
        store.writeOperationData(request.operationId, 'intent', request);
        if (request.action === 'install') store.writeOperationData(request.operationId, 'install-preparation', this.#installPreparation(request.operationId));
        this.#update(active, 'preparing', { predecessorId: initial.installation.activeReleaseId });
        if (offer) store.writeOperationData(request.operationId, 'release-offer', offer.kind === 'bundle' && offer.descriptor
          ? { schemaVersion: 2, kind: 'bundle', descriptorSha256: offer.descriptorSha256, descriptor: offer.descriptor }
          : { schemaVersion: 1, offer });
        if (offer?.kind === 'dev-source') store.writeOperationData(request.operationId, 'dev-source', { schemaVersion: 1, sourceOffer: offer });
      }
      const dependencyAttempt = this.#dependencyAttempt(active);
      this.#assertCurrent(active); checkCancellation();
      let report = parseInstaller('dependencyReport', await this.peers.dependencies!.inspect(this.location, { signal }));
      this.#assertCurrent(active); checkCancellation();
      if (decision) {
        parseInstaller('dependencyDecision', decision);
        if (!['install', 'upgrade'].includes(request.action) || report.ollamaInstallOffer?.id !== decision.offerId) fail('dependency-offer-stale', 'Dependency consent does not match the terminal offer');
        const context = decision.choice === 'install' ? this.#dependencyContext(active, decision, signal) : undefined;
        context?.assertCurrent();
        report = parseInstaller('dependencyReport', await this.peers.dependencies!.decide(this.location, decision, context));
        context?.assertCurrent();
      }
      this.#assertCurrent(active); checkCancellation();
      if (!report.runtimeReady || report.blockers.length) fail(recovering && dependencyAttempt ? 'dependency-uncertain' : 'dependency-blocked', report.blockers.join('; ') || 'Private runtime is unavailable');
      if (request.action === 'retry-migration') {
        const stored = store.readOperationData(request.operationId, 'candidate') as { releaseId?: unknown; descriptorSha256?: unknown; payloadSha256?: unknown; inventorySha256?: unknown } | undefined;
        if (stored === undefined && (initial.installation.delivery.mode === 'dev' || dependencyAttempt)) {
          if (active.interruptedPhase !== 'preparing' || !['install', 'upgrade'].includes(intent!.action)
            || active.snapshot.operation?.candidateId !== undefined || store.readOperationData(request.operationId, 'admission') !== undefined
            || store.readOperationData(request.operationId, 'shutdown') !== undefined
            || active.snapshot.operation?.predecessorId !== initial.installation.activeReleaseId) fail('preparation-uncertain', 'Recovery is not a pre-publication preparation');
          const accepted = initial.installation.delivery.mode === 'dev' ? this.#acceptedSource(active) : this.#acceptedOffer(active);
          if (intent!.action === 'upgrade' && intent!.acceptedOfferId !== this.#offerId(accepted, initial.installation.delivery, initial.installation.activeReleaseId)) fail('preparation-uncertain', 'Original release consent differs from the interrupted operation');
          // No candidate, shutdown or launch admission existed: data/lifecycle
          // disruption has not begun. Unknown preparation still blocks below.
          this.#update(active, 'preparing', { errorCode: undefined, message: undefined });
          const source = accepted.kind === 'dev-source' ? accepted : undefined;
          const preparation = this.#preparation(active, source, signal);
          this.#admitInstallDelivery(active);
          if (source && (store.readOperationData(request.operationId, 'dev-preparation') !== undefined || !dependencyAttempt)) {
            if (!delivery.resumePreparation) fail('preparation-uncertain', 'Dev preparation recovery is unavailable');
            active.candidate = await delivery.resumePreparation(this.#lease(active, signal), preparation);
          } else active.candidate = await delivery.prepare(this.#lease(active, signal), accepted, preparation);
          await this.#verify(active, active.candidate); checkCancellation();
          await this.#acceptedCandidate(active, accepted);
          store.writeOperationData(request.operationId, 'candidate', { releaseId: active.candidate.releaseId, descriptorSha256: active.candidate.descriptorSha256, payloadSha256: active.candidate.payloadSha256, inventorySha256: active.candidate.inventorySha256 });
          this.#update(active, 'preparing', { candidateId: active.candidate.releaseId });
          active.disrupted = false;
          await this.#quiesce(active, intent!.shutdownMode);
          migrate = true;
        } else {
          if (!stored || Object.keys(stored).sort().join(',') !== 'descriptorSha256,inventorySha256,payloadSha256,releaseId' || typeof stored.releaseId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(stored.releaseId)) fail('recovery-uncertain', 'Missing candidate identity');
          active.candidate = await delivery.open(this.location, stored.releaseId); await this.#verify(active, active.candidate);
          if (stored.releaseId !== active.candidate.releaseId || ['descriptorSha256', 'payloadSha256', 'inventorySha256'].some(key => (stored as Record<string, unknown>)[key] !== (active!.candidate as unknown as Record<string, unknown>)[key]) || active.snapshot.operation?.candidateId !== active.candidate.releaseId) fail('candidate-conflict', 'Recovery candidate differs');
          const admissionData = store.readOperationData(request.operationId, 'admission');
          if (admissionData !== undefined) {
            const admission = this.#checkAdmission(admissionData, active);
            if (admission.purpose === 'activation') { const ready = await this.peers.lifecycle!.reconcileActivation(active.candidate, admission); if (!ready) fail('recovery-uncertain', 'Candidate activation is uncertain'); if (!await this.peers.migrations!.verifyInstalled(active.candidate, this.#context(active))) fail('migration-unvalidated', 'Recovered activation lacks migration validation'); this.#ready(active, admission, ready); return this.#finish(active, { ...active.snapshot.operation!, phase: 'ready', errorCode: undefined, message: undefined }, true); }
            const exitedSuccessfully = await this.#migrationExit(active, admission, false);
            const journal = await this.peers.migrations!.reconcileJournal(active.candidate, admission);
            if (!journal || journal.installationId !== admission.installationId || journal.operationId !== admission.operationId || journal.candidateReleaseId !== admission.candidateReleaseId || journal.candidateInventorySha256 !== admission.candidateInventorySha256 || journal.sessionId !== admission.sessionId) fail('recovery-uncertain', 'Journal belongs to another admitted runner');
            if (exitedSuccessfully && journal.validated) { this.#journal(active, admission, journal); migrate = false; }
            else if (await this.peers.migrations!.allowRetry(active.candidate, admission) === true) migrate = true;
            else fail('migration-unvalidated', 'Hook policy did not authorize retry');
          } else {
            if (!['preparing', 'quiescing'].includes(active.interruptedPhase ?? '')) fail('recovery-uncertain', 'Interrupted launch admission is missing');
            if (!await this.#reconcileShutdown(active)) {
              if (active.interruptedPhase !== 'preparing') fail('recovery-uncertain', 'Interrupted launch phase lacks exact ownership evidence');
              if (intent!.action === 'start') {
                if (await this.#startObserved(active)) return this.#finish(active, { ...active.snapshot.operation!, phase: 'ready', errorCode: undefined, message: undefined });
              } else await this.#quiesce(active, intent!.shutdownMode);
            }
            migrate = intent!.action === 'install' || intent!.action === 'upgrade';
          }
        }
      } else {
        checkCancellation();
        if (offer) this.#admitInstallDelivery(active);
        active.candidate = offer ? await delivery.prepare(this.#lease(active, signal), offer, this.#preparation(active, offer.kind === 'dev-source' ? offer : undefined, signal)) : await delivery.open(this.location, initial.installation.activeReleaseId ?? fail('install-required', 'No selected release'));
        await this.#verify(active, active.candidate);
        checkCancellation();
        if (offer) await this.#acceptedCandidate(active, offer);
        store.writeOperationData(request.operationId, 'candidate', { releaseId: active.candidate.releaseId, descriptorSha256: active.candidate.descriptorSha256, payloadSha256: active.candidate.payloadSha256, inventorySha256: active.candidate.inventorySha256 });
        this.#update(active, 'preparing', { candidateId: active.candidate.releaseId });
        if (request.action !== 'start') await this.#quiesce(active);
        else if (await this.#startObserved(active)) return this.#finish(active, { ...active.snapshot.operation!, phase: 'ready' });
      }
      checkCancellation();
      if (migrate) {
        await this.#verify(active, active.candidate!);
        checkCancellation();
        const admission = this.#admit(active, 'migration'); active.disrupted = true;
        await this.peers.lifecycle!.launchMigration(active.candidate!, admission, () => this.assertLiveAdmission(admission));
        const journal = await this.peers.migrations!.waitForJournal(active.candidate!, admission);
        await this.#migrationExit(active, admission); this.#journal(active, admission, journal);
      } else if (!await this.peers.migrations!.verifyInstalled(active.candidate!, this.#context(active))) fail('migration-unvalidated', 'Installed migration state is unvalidated');
      await this.#verify(active, active.candidate!);
      checkCancellation();
      const activation = this.#admit(active, 'activation'); active.disrupted = true;
      const ready = await this.peers.lifecycle!.activate(active.candidate!, activation, () => this.assertLiveAdmission(activation)); this.#ready(active, activation, ready);
      return this.#finish(active, { ...active.snapshot.operation!, phase: 'ready', errorCode: undefined, message: undefined }, true);
    } catch (error) {
      if (active?.started || (active && request.action === 'retry-migration')) {
        const base = error instanceof Error ? error.message.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 3000) || 'Operation failed' : 'Operation failed';
        const detail = active.dependencyServiceAdmitted && !base.includes(RETAINED_DEPENDENCY_NOTICE) ? `${base} ${RETAINED_DEPENDENCY_NOTICE}` : base;
        const code = error instanceof InstallerError ? error.code : 'operation-failed';
        const blocked = active.disrupted || code === 'preparation-uncertain' || code === 'dependency-uncertain';
        const failed: OperationRecord = { ...active.snapshot.operation, operationId: request.operationId, phase: blocked ? 'blocked' : 'preparing', errorCode: code, message: detail };
        if (blocked) {
          // Preserve the interrupted phase before publishing blocked; later retries
          // cannot mistake a lost launch admission for pre-launch preparation.
          const phase = active.snapshot.operation?.phase === 'blocked' ? active.interruptedPhase : active.snapshot.operation?.phase;
          this.#assertCurrent(active);
          if (phase) active.store.writeOperationData(request.operationId, 'interruption', { phase }, true);
          this.#update(active, 'blocked', failed); return this.#event(active, active.snapshot.operation!, 'result');
        }
        return this.#finish(active, failed, false, true);
      }
      throw error;
    } finally { this.#active = undefined; store.close(); }
  }
}
