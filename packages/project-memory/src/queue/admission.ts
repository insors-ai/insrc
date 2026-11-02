import { isAbsolute } from 'node:path';
import { MemoryError } from '../errors.js';
import type { HostPolicy, Json, MemoryCommand, OperationReceipt, OperationRequest, ProjectBinding } from '../types.js';
import { boundedString, IngressBudget, snapshotCommand, snapshotJson, validateScope } from './codec.js';
import type { Reservation } from './codec.js';
import { FileQueue } from './file-queue.js';

/** No default policy: callers must supply the host's project/namespace authority. */
export class QueueAdmission {
  readonly #queue: FileQueue;
  readonly #policy: HostPolicy;
  readonly #budget: IngressBudget;
  constructor(queue: FileQueue, policy: HostPolicy) {
    this.#queue = queue; this.#policy = policy; this.#budget = new IngressBudget(queue.limits);
  }
  /** Also used by status reads later; binding never changes durable event data. */
  async bind(projectId: string, sessionId?: string): Promise<ProjectBinding> {
    try {
      const raw = await this.#policy.bind(projectId, sessionId);
      const snapshot = snapshotJson(raw, 65_536).value as unknown as ProjectBinding;
      if (Object.keys(snapshot).sort().join(',') !== 'projectId,root,scopeEpoch' || snapshot.projectId !== projectId || !boundedString(snapshot.scopeEpoch, 256) || typeof snapshot.root !== 'string' || !isAbsolute(snapshot.root) || snapshot.root.includes('\0')) throw Error('invalid binding');
      return snapshot;
    } catch (error) { throw policyFailure(error); }
  }
  operation(request: OperationRequest): Promise<OperationReceipt> {
    let lease: Reservation | undefined;
    try {
      lease = this.#budget.reserve();
      const value = snapshotJson(request, 16_384, lease).value as unknown as OperationRequest;
      if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'operationId,scope' || typeof value.operationId !== 'string' || !/^[a-f0-9]{64}$/.test(value.operationId)) throw new MemoryError('INVALID_REQUEST', 'Invalid memory operation query.');
      validateScope(value.scope);
      const reservation = lease;
      return this.#queue.enqueue(async () => {
        const binding = await this.bind(value.scope.projectId, value.scope.sessionId);
        return this.#queue.operationWithinLane(value.scope, value.operationId, binding.scopeEpoch);
      }).finally(() => reservation.release());
    } catch (error) { lease?.release(); return Promise.reject(error); }
  }
  replay() { return this.#queue.replay(); }
  append(command: MemoryCommand): Promise<OperationReceipt> {
    let lease: Reservation | undefined;
    try {
      lease = this.#budget.reserve();
      // Synchronous and before enqueue: a later caller mutation cannot race policy.
      const original = snapshotCommand(command, this.#queue.limits.maxEventBytes, lease);
      const reservation = lease;
      const result = this.#queue.enqueue(async () => {
        const binding = await this.bind(original.command.scope.projectId, original.command.scope.sessionId);
        let output: Json;
        try { output = await this.#policy.admit(binding, original.command as unknown as Json); }
        catch (error) { throw policyFailure(error); }
        const admitted = snapshotCommand(output, this.#queue.limits.maxEventBytes, reservation);
        if (!sameEnvelope(admitted.command, original.command)) throw new MemoryError('POLICY_DENIED', 'Policy cannot change command identity or scope.');
        return this.#queue.persist(admitted, binding.scopeEpoch);
      });
      return result.finally(() => reservation.release());
    } catch (error) { lease?.release(); return Promise.reject(error); }
  }
}
function sameEnvelope(a: MemoryCommand, b: MemoryCommand): boolean {
  return a.version === b.version && a.kind === b.kind && a.expectedRevision === b.expectedRevision
    && (['projectId', 'sessionId', 'branch', 'environment'] as const).every(key => a.scope[key] === b.scope[key])
    && (['producerId', 'eventId', 'sessionId', 'turnId', 'sourceVersion'] as const).every(key => a.source[key] === b.source[key]);
}
function policyFailure(error: unknown): MemoryError {
  if (error instanceof MemoryError && (error.code === 'UNBOUND_PROJECT' || error.code === 'POLICY_DENIED')) return new MemoryError(error.code, 'Project policy refused this memory request.');
  return new MemoryError('NOT_READY', 'Project policy is unavailable.', true);
}
