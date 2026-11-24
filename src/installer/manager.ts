import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { InstallerError } from './contracts.js';
import type { ControllerSnapshot, DependencyDecision, Delivery, InstallationLocation, ManagerEvent, ManagerRequest, MigrationContext, OperationRecord, Target, UpgradeOffer } from './contracts.js';
import { ControllerStore, inspectController } from './controller-store.js';
import type { ControllerInspection } from './controller-store.js';
import { parseInstaller, parseManagerRequest, parseReleaseManifest } from './schemas.js';
import { canonicalJson, digest } from './release-descriptor.js';
import type { PreparedCandidate } from './bundle.js';
import type { DeliveryPort, LaunchAdmission, ManagerPeers, MigrationEvidence, ReadyEvidence, ShutdownCompletion, ShutdownRequest } from './peer-contracts.js';
import { assertTerminalAdmission } from './terminal-admission.js';
import type { TerminalAdmission } from './terminal-admission.js';
import { forwardImmediate, openOperationControl } from './operation-control.js';

function fail(code: string, message: string): never { throw new InstallerError(code, message); }
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
interface Active {
  store: ControllerStore; snapshot: ControllerSnapshot; request: ManagerRequest; ownerNonce: string;
  candidate?: PreparedCandidate | undefined; admission?: LaunchAdmission | undefined; shutdown?: ShutdownRequest | undefined;
  previousResult?: OperationRecord | undefined; started: boolean; disrupted: boolean; interruptedPhase?: OperationRecord['phase'] | undefined; immediate?: Promise<void> | undefined;
}
export class InstallerManager {
  #active: Active | undefined;
  constructor(readonly location: InstallationLocation, readonly target: Target, readonly peers: ManagerPeers, readonly progress: (event: ManagerEvent) => void = () => {}) {
    parseInstaller('location', location); parseInstaller('target', target);
    this.location = structuredClone(location); Object.freeze(this.location.daemonEndpoint); Object.freeze(this.location);
    this.target = Object.freeze(structuredClone(target));
  }
  inspect(): ControllerInspection { return inspectController(this.location); }
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
  async checkUpgrade(): Promise<UpgradeOffer | undefined> {
    const current = this.inspect(); if (current.kind !== 'present') fail(current.kind === 'corrupt' ? 'controller-corrupt' : 'install-required', current.kind === 'corrupt' ? current.reason : 'Installation is missing');
    const offer = await this.#delivery(current.snapshot.installation.delivery).resolve(current.snapshot.installation.delivery);
    parseReleaseManifest(offer.manifest, { target: this.target });
    if (!hash(offer.descriptorSha256)) fail('manifest-invalid', 'Offer lacks exact descriptor identity');
    if (offer.manifest.releaseId === current.snapshot.installation.activeReleaseId) return undefined;
    parseReleaseManifest(offer.manifest, { target: this.target, predecessorId: current.snapshot.installation.activeReleaseId });
    return parseInstaller('upgradeOffer', { offerId: digest(canonicalJson({ location: this.location, current: current.snapshot.installation.activeReleaseId, delivery: current.snapshot.installation.delivery, descriptor: offer.descriptorSha256 })), installationId: this.location.installationId, currentReleaseId: current.snapshot.installation.activeReleaseId, candidateReleaseId: offer.manifest.releaseId, delivery: current.snapshot.installation.delivery });
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
    const observed = await this.peers.lifecycle!.observe(this.location); active.store.assertHeld();
    if (this.#absent(active, observed)) return;
    if (observed.state !== 'present' || observed.identity.installationId !== this.location.installationId || observed.identity.releaseId !== active.snapshot.installation.activeReleaseId || observed.identity.protocolVersion !== 1 || observed.identity.state === 'migration-blocked' || canonicalJson(observed.endpoint) !== canonicalJson(this.location.daemonEndpoint)) { active.disrupted = true; fail('shutdown-uncertain', 'Incumbent identity or ownership is uncertain'); }
    const nonce = randomBytes(32).toString('hex');
    const request: ShutdownRequest = { operationId: active.request.operationId, expectedInstanceId: observed.identity.instanceId, mode, completionNonce: nonce, completionEndpoint: this.location.daemonEndpoint.kind === 'unix' ? join(this.location.home, 's' + randomBytes(7).toString('base64url').slice(0, 10)) : this.location.daemonEndpoint.address + '-' + nonce.slice(0, 16) };
    active.store.writeOperationData(active.request.operationId, 'shutdown', request); active.shutdown = request;
    this.#update(active, 'quiescing'); active.disrupted = true;
    const control = await openOperationControl(this.location, active.store, request.operationId, active.ownerNonce, input => this.requestImmediate(input));
    try {
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
      active = { store, snapshot: initial, request, ownerNonce: randomBytes(32).toString('hex'), previousResult: initial.lastResult, started: false, disrupted: recovering,
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
      let report = parseInstaller('dependencyReport', await this.peers.dependencies!.inspect(this.location));
      checkCancellation();
      if (decision) { parseInstaller('dependencyDecision', decision); if (!['install', 'upgrade'].includes(request.action) || report.ollamaInstallOffer?.id !== decision.offerId) fail('dependency-offer-stale', 'Dependency consent does not match the terminal offer'); report = parseInstaller('dependencyReport', await this.peers.dependencies!.decide(this.location, decision)); }
      checkCancellation();
      if (!report.runtimeReady || report.blockers.length) fail('dependency-blocked', report.blockers.join('; ') || 'Private runtime is unavailable');
      let migrate = request.action === 'upgrade' || request.action === 'install';
      if (request.action === 'retry-migration') {
        const stored = store.readOperationData(request.operationId, 'candidate') as { releaseId?: unknown; descriptorSha256?: unknown; payloadSha256?: unknown; inventorySha256?: unknown } | undefined;
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
      } else {
        let offer;
        if (migrate) {
          offer = await delivery.resolve(initial.installation.delivery); parseReleaseManifest(offer.manifest, { target: this.target, predecessorId: initial.installation.activeReleaseId });
          if (!hash(offer.descriptorSha256)) fail('manifest-invalid', 'Missing descriptor identity');
          const offerId = digest(canonicalJson({ location: this.location, current: initial.installation.activeReleaseId, delivery: initial.installation.delivery, descriptor: offer.descriptorSha256 }));
          if (request.action === 'upgrade' && request.acceptedOfferId !== offerId) fail('offer-stale', 'Upgrade acceptance differs from the exact current offer');
        }
        checkCancellation();
        if (inspected.kind === 'missing') store.commit(initial, null);
        store.writeOperationData(request.operationId, 'intent', request);
        this.#update(active, 'preparing', { predecessorId: initial.installation.activeReleaseId });
        active.candidate = offer ? await delivery.prepare({ location: store.location, assertHeld: () => store.assertHeld(), inspect: () => store.inspect(), publishCandidate: (directory, releaseId) => store.publishCandidate(directory, releaseId) }, offer) : await delivery.open(this.location, initial.installation.activeReleaseId ?? fail('install-required', 'No selected release'));
        await this.#verify(active, active.candidate);
        checkCancellation();
        if (offer && (active.candidate.releaseId !== offer.manifest.releaseId || active.candidate.descriptorSha256 !== offer.descriptorSha256)) fail('candidate-conflict', 'Prepared candidate differs from accepted offer');
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
        const detail = error instanceof Error ? error.message.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 3500) || 'Operation failed' : 'Operation failed', code = error instanceof InstallerError ? error.code : 'operation-failed';
        const failed: OperationRecord = { ...active.snapshot.operation, operationId: request.operationId, phase: active.disrupted ? 'blocked' : 'preparing', errorCode: code, message: detail };
        if (active.disrupted) {
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
