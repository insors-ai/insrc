import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { InstallerError } from './contracts.js';
import type { DependencyReport, InstallationLocation } from './contracts.js';
import type { DependencyOperationContext } from './peer-contracts.js';
import type { DependencyInspection } from './dependencies.js';
import { requireDependencyOperation, RETAINED_DEPENDENCY_NOTICE } from './dependency-context.js';
import { parseInstaller } from './schemas.js';
import { canonicalJson, digest } from './release-descriptor.js';
import { privateRuntimeEnvironment } from './runtime-policy.js';
import { dependencyAttemptIdentity, ollamaPolicySha256 } from './ollama-policy.js';
import type { OllamaPolicy } from './ollama-policy.js';
import { closedOllamaAttempts, verifyPreparedOllama } from './ollama-prepare.js';
import type { PreparedOllama } from './ollama-prepare.js';
import { acceptedOllamaPolicy, closurePath, dependencyPath, dependencyUncertain, ensureDependencyDirectory, parseOllamaAttempt, parseOllamaClosure, readDependencyRecord, writeDependencyRecord } from './ollama-records.js';
import { controlBinding } from './native.js';
import { parseServiceDiagnostic, parseServiceFact, parseServiceFrame, serviceAdmission, serviceDiagnostic, serviceFact, serviceJson, servicePaths, SERVICE_FRAME_LIMIT } from './ollama-service-records.js';
import type { OllamaServiceFact, OllamaServiceFrame } from './ollama-service-records.js';
import { ollamaCloseUncertain, retainUncertainOllamaHandle } from './ollama-cleanup.js';

export interface OllamaServiceOptions {
  workerEntrypoint: string;
  recheck(signal: AbortSignal): Promise<DependencyInspection>;
  readinessMs?: number | undefined; cleanupMs?: number | undefined;
  /** Trusted retained-process fixture; never selected by a manager request. */
  launch?: ((frame: OllamaServiceFrame, record: string) => Promise<{ started: boolean }>) | undefined;
  /** Trusted observer for owned production-launch tests; never wire input. */
  workerStarted?: ((child: ChildProcess) => void) | undefined;
}
export const OLLAMA_READINESS_MS = 30000;
export const OLLAMA_RETAINED_NOTICE = RETAINED_DEPENDENCY_NOTICE;
function unavailable(report: DependencyReport, detail: string): DependencyReport {
  return parseInstaller('dependencyReport', { ...report, ollama: 'unavailable', ollamaInstallOffer: undefined,
    recommendations: report.recommendations.filter(item => !item.startsWith('Start Ollama manually')).slice(0, 30),
    blockers: [...report.blockers.slice(0, 30), detail] });
}
async function fact(location: InstallationLocation, path: string, frame: OllamaServiceFrame): Promise<OllamaServiceFact | undefined> {
  return existsSync(path) ? parseServiceFact(frame.admission, serviceJson(await readDependencyRecord(location, path))) : undefined;
}
async function serviceState(frame: OllamaServiceFrame, record: string, report: DependencyReport, signal: AbortSignal): Promise<DependencyReport> {
  const paths = servicePaths(record);
  const admission = serviceJson(await readDependencyRecord(frame.location, paths.admission)); signal.throwIfAborted();
  if (canonicalJson(admission) !== canonicalJson(frame.admission)) throw dependencyUncertain('Service intent differs from the accepted immutable frame');
  const launch = await fact(frame.location, paths.launch, frame); signal.throwIfAborted();
  const running = await fact(frame.location, paths.running, frame); signal.throwIfAborted();
  const exit = await fact(frame.location, paths.exit, frame); signal.throwIfAborted();
  const result = await fact(frame.location, paths.result, frame); signal.throwIfAborted();
  const logError = await fact(frame.location, paths.logError, frame); signal.throwIfAborted();
  const diagnostic = existsSync(paths.diagnostic) ? parseServiceDiagnostic(frame.admission, serviceJson(await readDependencyRecord(frame.location, paths.diagnostic))) : undefined; signal.throwIfAborted();
  if ((launch && launch.state !== 'launch-admitted') || (running && !launch) || (exit?.state === 'closed' && !launch)
    || (running && running.state !== 'spawned') || (exit && !['closed', 'not-started'].includes(exit.state))
    || (running && exit?.state === 'not-started') || (result && !['ready', 'unverified', 'not-started'].includes(result.state))
    || (logError && logError.state !== 'unverified')
    || (exit?.state === 'closed' && (!Object.hasOwn(exit, 'code') || !Object.hasOwn(exit, 'signal')))) throw dependencyUncertain('Retained service lifecycle evidence is contradictory');
  if (!running && !exit && result?.state !== 'not-started') return unavailable(report, 'Accepted Ollama service launch is unconfirmed; inspect its private attempt evidence before retrying.');
  if (report.ollama === 'ready') return { ...report, recommendations: [...report.recommendations.slice(0, 29), 'Existing Ollama availability is reused; endpoint process ownership is unproven.',
    ...(logError ? ['Private Ollama logs are unavailable; inspect the recorded logging failure.'] : [])] };
  if (exit || result?.state === 'not-started') return diagnostic ? { ...report, recommendations: [...report.recommendations.slice(0, 30), `Ollama supervisor ${diagnostic.stage} failure (${diagnostic.code}); inspect ${paths.diagnostic}.`] } : report;
  return unavailable(report, 'An Ollama service start was accepted but availability is unverified; inspect its private logs and retry inspection.');
}

/** Fresh inspection never downloads, starts, stops or rewrites service state. */
export async function reconcileOllamaDependencies(location: InstallationLocation, policy: OllamaPolicy | undefined,
  inspection: DependencyInspection, signal: AbortSignal): Promise<DependencyInspection> {
  try {
    const attempts = await closedOllamaAttempts(location, signal, undefined, async (attempt, record) => {
      // Availability may consume positively bound retained facts without
      // rewriting a dead parent's finite marker. This grants no cleanup/start.
      const paths = servicePaths(record);
      if (!existsSync(paths.admission)) return false;
      const frame = parseServiceFrame(serviceJson(await readDependencyRecord(location, paths.frame, SERVICE_FRAME_LIMIT))); signal.throwIfAborted();
      if (canonicalJson(frame.location) !== canonicalJson(location) || canonicalJson(frame.attempt) !== canonicalJson(attempt)) throw dependencyUncertain('Retained service belongs to another attempt');
      await serviceState(frame, record, inspection.report, signal);
      const running = await fact(location, paths.running, frame), exit = await fact(location, paths.exit, frame), result = await fact(location, paths.result, frame);
      return !!(running || exit || result?.state === 'not-started');
    }); signal.throwIfAborted(); let report = inspection.report;
    for (const attempt of attempts) {
      signal.throwIfAborted(); const record = dependencyPath(location, attempt.identity.recordRelativePath), paths = servicePaths(record);
      const closure = parseOllamaClosure(attempt.identity, serviceJson(await readDependencyRecord(location, closurePath(record)))); signal.throwIfAborted();
      if (existsSync(paths.admission)) {
        const frame = parseServiceFrame(serviceJson(await readDependencyRecord(location, paths.frame, SERVICE_FRAME_LIMIT))); signal.throwIfAborted();
        if (canonicalJson(frame.location) !== canonicalJson(location) || canonicalJson(frame.attempt) !== canonicalJson(attempt)) throw dependencyUncertain('Interrupted service belongs to a different attempt');
        const verified = await verifyPreparedOllama(location, frame.policy, dependencyPath(location, attempt.identity.payloadRelativePath), signal); signal.throwIfAborted();
        if (closure.outcome !== 'prepared' || verified.inventorySha256 !== closure.inventorySha256
          || verified.inventorySha256 !== frame.admission.inventorySha256) throw dependencyUncertain('Interrupted service inventory differs from its accepted preparation or admission');
        report = await serviceState(frame, record, report, signal);
      } else {
        // Closed abandoned preparations without a published tree grant no start.
        const payload = dependencyPath(location, attempt.identity.payloadRelativePath);
        if (existsSync(payload)) {
          const accepted = acceptedOllamaPolicy(attempt, policy);
          const verified = await verifyPreparedOllama(location, accepted, payload, signal); signal.throwIfAborted();
          if (closure.outcome !== 'prepared' || verified.inventorySha256 !== closure.inventorySha256) throw dependencyUncertain('Published interrupted preparation differs from its durable inventory closure');
        }
      }
    }
    signal.throwIfAborted(); return { ...inspection, report, ...(report.ollama === 'unavailable' ? { offer: undefined } : {}) };
  } catch (cause) {
    signal.throwIfAborted(); return { report: unavailable(inspection.report, `Dependency attempt reconciliation is unavailable (${cause instanceof InstallerError ? cause.code : 'evidence-invalid'}).`) };
  }
}

function checkWorkerEntrypoint(entrypoint: string): void {
  if (!isAbsolute(entrypoint)) throw dependencyUncertain('Service supervisor must be an absolute control entrypoint');
  const info = lstatSync(entrypoint); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw dependencyUncertain('Service supervisor control file is unsafe');
}
function launchWorker(frame: OllamaServiceFrame, record: string, entrypoint: string, observed?: (child: ChildProcess) => void): Promise<{ started: boolean }> {
  checkWorkerEntrypoint(entrypoint);
  return new Promise(resolve => {
    const child = spawn(process.execPath, [entrypoint, '--ollama-service-worker', frame.location.home, frame.location.installationId,
      relative(frame.location.home, record).replaceAll('\\', '/')], {
      cwd: frame.location.home, env: privateRuntimeEnvironment(process.env), detached: true, windowsHide: true, stdio: 'ignore',
    });
    let started = false;
    child.once('spawn', () => { started = true; child.unref(); observed?.(child); resolve({ started: true }); });
    child.on('error', () => {}); child.once('close', () => { if (!started) resolve({ started: false }); });
  });
}

/** Finite verification/probes remain bounded; only the explicit durable service
 * admission is retained. Cancellation never promises to roll it back. */
export async function startOllamaService(location: InstallationLocation, prepared: PreparedOllama, contextInput: DependencyOperationContext,
  options: OllamaServiceOptions): Promise<DependencyReport> {
  const context = requireDependencyOperation(location, contextInput), identity = dependencyAttemptIdentity(location, prepared.policy, prepared.offer, context);
  if (canonicalJson(identity) !== canonicalJson(prepared.identity)) throw dependencyUncertain('Prepared service belongs to another operation');
  const readinessMs = options.readinessMs ?? OLLAMA_READINESS_MS, cleanupMs = options.cleanupMs ?? 5000;
  if (!Number.isInteger(readinessMs) || readinessMs < 1 || readinessMs > OLLAMA_READINESS_MS || !Number.isInteger(cleanupMs) || cleanupMs < 1 || cleanupMs > 5000) throw dependencyUncertain('Invalid service handoff budget');
  const deadline = new AbortController(), signal = AbortSignal.any([deadline.signal, ...(context.signal ? [context.signal] : [])]);
  let timer = setTimeout(() => deadline.abort(), Math.max(1, Math.min(20 * 60 * 1000, prepared.preparationDeadline - performance.now())));
  let ownerLoss: unknown;
  const checkOwner = () => {
    try { context.assertCurrent(); }
    catch (cause) { if (!context.signal?.aborted) ownerLoss ??= cause; deadline.abort(); throw cause; }
  };
  const owner = setInterval(() => { try { checkOwner(); } catch { /* Pending work drains below. */ } }, 100); owner.unref();
  let readinessEndsAt: number | undefined;
  const current = () => { checkOwner(); if (performance.now() >= Math.min(readinessEndsAt ?? Infinity, prepared.preparationDeadline)) deadline.abort(); signal.throwIfAborted(); };
  // Production rechecks own their three-second probe budget and confirm closure.
  // A transient probe timeout must not cancel the whole readiness window.
  const probe = () => options.recheck(signal);
  const record = dependencyPath(location, identity.recordRelativePath), paths = servicePaths(record);
  const handoffNonce = randomBytes(16).toString('hex'), handoffFile = record.replace(/\.json$/, `.handoff-${handoffNonce}.json`);
  const handoff = { schemaVersion: 1, identitySha256: digest(canonicalJson(identity)), nonce: handoffNonce, actor: 'finite-service-handoff' };
  let handoffAdmitted = false, keepHandle = false;
  let admitted = false, launchInvoked = false, handle: object | undefined, last: DependencyReport | undefined, frame: OllamaServiceFrame | undefined;
  const notStarted = (cause: unknown) => {
    if (!admitted || !frame || !handle) throw dependencyUncertain('Not-started reporting lacks its bound admission');
    if (!existsSync(paths.result)) writeDependencyRecord(location, handle, paths.result, serviceFact(frame.admission, 'not-started'));
    if (!existsSync(paths.diagnostic)) writeDependencyRecord(location, handle, paths.diagnostic, serviceDiagnostic(frame.admission, 'pre-spawn', cause));
  };
  const work = async () => {
    current();
    try { handle = controlBinding().acquire(`${record}.lock`); }
    catch (cause) { throw dependencyUncertain('Another finite service handoff has not closed', cause); }
    current(); writeDependencyRecord(location, handle, handoffFile, handoff); handoffAdmitted = true;
    current(); await closedOllamaAttempts(location, signal, handoffFile); current();
    const attempt = parseOllamaAttempt(location, prepared.policy, serviceJson(await readDependencyRecord(location, record))); current();
    const verified = await verifyPreparedOllama(location, prepared.policy, prepared.directory, signal); current();
    if (verified.inventorySha256 !== prepared.inventorySha256) throw dependencyUncertain('Service payload changed after preparation');
    let check = await probe(); current(); last = check.report;
    if (!check.report.runtimeReady || check.endpoint !== prepared.policy.endpoint) throw new InstallerError('dependency-offer-stale', 'Service policy/runtime or endpoint changed');
    if (existsSync(paths.admission)) {
      frame = parseServiceFrame(serviceJson(await readDependencyRecord(location, paths.frame, SERVICE_FRAME_LIMIT))); current();
      if (canonicalJson(frame.location) !== canonicalJson(location) || canonicalJson(frame.attempt) !== canonicalJson(attempt)
        || frame.admission.inventorySha256 !== prepared.inventorySha256 || frame.admission.policySha256 !== identity.policySha256) throw dependencyUncertain('Existing service frame belongs to another accepted attempt');
      return serviceState(frame, record, check.report, signal);
    }
    if (check.report.ollama === 'ready') return check.report;
    if (check.report.ollama !== 'installed-not-running' || check.executable !== join(prepared.directory, prepared.policy.layout.executable)) throw new InstallerError('dependency-offer-stale', 'The accepted private binary is no longer the stopped local dependency');
    if (!options.launch) checkWorkerEntrypoint(options.workerEntrypoint);
    ensureDependencyDirectory(location, prepared.policy.modelsRelativePath, current);
    ensureDependencyDirectory(location, `${dirname(prepared.policy.modelsRelativePath).replaceAll('\\', '/')}/tmp`, current);
    ensureDependencyDirectory(location, prepared.policy.logsRelativePath, current);
    const admission = serviceAdmission(attempt, prepared.inventorySha256, randomBytes(32).toString('hex'));
    frame = parseServiceFrame({ schemaVersion: 1, location, policy: prepared.policy, attempt, admission });
    current(); writeDependencyRecord(location, handle, paths.frame, frame, SERVICE_FRAME_LIMIT);
    current(); writeDependencyRecord(location, handle, paths.admission, admission); admitted = true;
    context.progress('ollama-service-admitted', OLLAMA_RETAINED_NOTICE);
    readinessEndsAt = Math.min(prepared.preparationDeadline, performance.now() + readinessMs);
    clearTimeout(timer); timer = setTimeout(() => deadline.abort(), Math.max(1, readinessEndsAt - performance.now()));
    current(); let supervisorStarted = false, launched: { started: boolean };
    launchInvoked = true;
    try { launched = await (options.launch ?? ((input, file) => launchWorker(input, file, options.workerEntrypoint, child => {
      supervisorStarted = true; options.workerStarted?.(child);
    })))(frame, record); }
    catch (cause) {
      if (!options.launch && !supervisorStarted) {
        notStarted(cause);
      }
      throw cause;
    }
    if (!launched.started) {
      // Record positive launch failure before checking cancellation/owner loss.
      // Neither can turn known not-started evidence into an ambiguous launch.
      notStarted(new InstallerError('service-supervisor-not-started', 'Ollama supervisor did not start'));
      current(); return unavailable(check.report, 'Ollama supervisor did not start; inspect the private installation and retry inspection.');
    }
    current();
    while (true) {
      check = await probe(); current(); last = check.report;
      const state = await serviceState(frame, record, check.report, signal); current();
      if (state.ollama === 'ready') { writeDependencyRecord(location, handle, paths.result, serviceFact(admission, 'ready')); current(); return state; }
      if (existsSync(paths.exit)) { writeDependencyRecord(location, handle, paths.result, serviceFact(admission, 'unverified')); current(); return state; }
      await delay(100, undefined, { signal }); current();
    }
  };
  const pending = work().then(value => ({ value }), error => ({ error }));
  let abort!: () => void;
  try {
    const interrupted = new Promise<undefined>(resolve => { abort = () => resolve(undefined); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
    let result = await Promise.race([pending, interrupted]);
    if (!result) {
      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      try { result = await Promise.race([pending, new Promise<undefined>(resolve => { drainTimer = setTimeout(() => resolve(undefined), cleanupMs); })]); }
      finally { if (drainTimer) clearTimeout(drainTimer); }
    }
    if (!result) {
      keepHandle = true;
      void pending.then(closed => {
        if ('error' in closed && ollamaCloseUncertain(closed.error)) { if (handle) retainUncertainOllamaHandle(handle); return; }
        if (handoffAdmitted && handle) writeDependencyRecord(location, handle, closurePath(handoffFile), { ...handoff, closed: true });
        if (handle) controlBinding().close(handle);
      }).catch(() => { if (handle) retainUncertainOllamaHandle(handle); });
      throw dependencyUncertain(`Service handoff finite probes did not positively close; retain handoff evidence.${admitted ? ' ' + OLLAMA_RETAINED_NOTICE : ''}`);
    }
    if (!('error' in result && ollamaCloseUncertain(result.error)) && handoffAdmitted && handle)
      writeDependencyRecord(location, handle, closurePath(handoffFile), { ...handoff, closed: true });
    if ('error' in result) {
      if (ollamaCloseUncertain(result.error)) { keepHandle = true; if (handle) retainUncertainOllamaHandle(handle); throw dependencyUncertain(`Service handoff resource closure is unconfirmed.${admitted ? ' ' + OLLAMA_RETAINED_NOTICE : ''}`, result.error); }
      if (admitted && !launchInvoked) notStarted(result.error);
      if (signal.aborted && admitted && frame && handle && !existsSync(paths.result)) writeDependencyRecord(location, handle, paths.result, serviceFact(frame.admission, 'unverified'));
      if (context.signal?.aborted) throw new InstallerError('cancelled', admitted ? 'Ollama start was accepted and may remain running or unverified; installer continuation was cancelled' : 'Installation cancelled before Ollama service admission');
      if (ownerLoss) throw new InstallerError('dependency-owner-lost', `Installation owner was lost; service handoff stopped.${admitted ? ' ' + OLLAMA_RETAINED_NOTICE : ''}`, { cause: ownerLoss });
      if (deadline.signal.aborted && admitted && last) return unavailable(last, `${performance.now() >= prepared.preparationDeadline ? 'Overall preparation deadline expired' : 'Ollama readiness deadline expired'}; inspect private logs and retry inspection. ${OLLAMA_RETAINED_NOTICE}`);
      if (deadline.signal.aborted) throw new InstallerError('dependency-blocked', 'Private Ollama verification exceeded its remaining preparation budget; inspect the attempt before retrying');
      if (admitted) throw new InstallerError(result.error instanceof InstallerError ? result.error.code : 'dependency-start-failed', `${result.error instanceof Error ? result.error.message : 'Ollama startup failed'} ${OLLAMA_RETAINED_NOTICE}`, { cause: result.error });
      throw result.error;
    }
    return parseInstaller('dependencyReport', result.value);
  } catch (cause) {
    if (handle && ollamaCloseUncertain(cause)) { keepHandle = true; retainUncertainOllamaHandle(handle); }
    throw cause;
  } finally { signal.removeEventListener('abort', abort); clearTimeout(timer); clearInterval(owner); deadline.abort(); if (handle && !keepHandle) controlBinding().close(handle); }
}
