import { randomUUID } from 'node:crypto';
import { MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { isAbsolute, resolve } from 'node:path';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { ProgressId, ProgressSequence, progressObject } from '../../shared/task-progress.js';
import type { DelegateMeasurement, TaskOwnerFence, TaskProgressDelegate, TaskRef } from '../../shared/task-progress.js';
import type { TrustedRpcContext } from '../request-context.js';
import type { ForwardRequest } from '../server.js';
import type { OwnerEvidence, ProducerPort } from './coordinator.js';
import { validateExecutorDetails } from './executor-measurements.js';
import type { AnalysisDetails, ExecutorDetails, WorkflowDetails, registerExecutorProducers } from './executor-measurements.js';
import type { ProgressRuntime } from './rpc.js';

export type ExecutorProgressKind = ExecutorDetails['kind'];
export function executorProgressKind(method: string): ExecutorProgressKind | undefined {
  if (method === 'workflow.run' || method === 'workflow.run.start') return 'workflow';
  return method === 'analyze.run.start' ? 'analysis' : undefined;
}

/** Extract only the file-system identity that can be checked against the registry. */
export function analysisProgressPath(scope: unknown): string | undefined {
  if (scope === null || typeof scope !== 'object') return undefined;
  const { kind, value } = scope as { kind?: unknown; value?: unknown };
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\0')) return undefined;
  let path = value;
  switch (kind) {
    case 'repo': case 'module': case 'file': case 'manifest-dir': case 'workspace':
      break;
    case 'symbol': {
      const separator = value.lastIndexOf('#');
      if (separator <= 0 || separator === value.length - 1) return undefined;
      path = value.slice(0, separator);
      break;
    }
    default: return undefined;
  }
  return isAbsolute(path) ? resolve(path) : undefined;
}
type ExecutorRuntime = ProgressRuntime<ExecutorDetails> & { producers: ReturnType<typeof registerExecutorProducers> };
const TERMINAL = Type.Union([Type.Literal('completed'), Type.Literal('failed'), Type.Literal('cancelled')]);
type Terminal = Static<typeof TERMINAL>;
const EventSchema = Type.Union([
  progressObject({ type: Type.Literal('start') }),
  progressObject({ type: Type.Literal('sample'), sequence: ProgressSequence, details: Type.Unknown() }),
  progressObject({ type: Type.Literal('scope'), path: Type.Union([Type.String({ minLength: 1, maxLength: 4096 }), Type.Null()]) }),
  progressObject({
    type: Type.Literal('terminal'), sequence: ProgressSequence, state: TERMINAL,
    resultRef: Type.Optional(ProgressId), details: Type.Optional(Type.Unknown()),
  }),
  progressObject({ type: Type.Literal('alive'), probe: ProgressSequence }),
]);
const CommandSchema = Type.Union([
  progressObject({ type: Type.Literal('ack'), sequence: ProgressSequence }),
  progressObject({ type: Type.Literal('probe'), probe: ProgressSequence }),
]);
type Event = Static<typeof EventSchema>;
type Command = Static<typeof CommandSchema>;
type TerminalEvent = Extract<Event, { type: 'terminal' }>;

function send(port: MessagePort, message: Event | Command): void {
  try { port.postMessage(message); } catch { port.close(); }
}

/** The execution owner holds one unsent sample while the previous sample is in transit. */
export function beginExecutorProgress(port: MessagePort | undefined) {
  if (port === undefined) return undefined;
  let sequence = 0;
  let awaiting: number | undefined;
  let latest: ExecutorDetails | undefined;
  let ended = false;
  let scopeConfirmed = false;
  const flush = () => {
    if (latest === undefined || awaiting !== undefined || ended) return;
    awaiting = ++sequence;
    send(port, { type: 'sample', sequence, details: latest });
    latest = undefined;
  };
  port.on('message', (command: unknown) => {
    if (ended || !Value.Check(CommandSchema, command)) return;
    if (command.type === 'probe') send(port, { type: 'alive', probe: command.probe });
    if (command.type === 'ack' && command.sequence === awaiting) {
      awaiting = undefined;
      flush();
    }
  });
  port.once('close', () => { ended = true; latest = undefined; });
  port.unref();
  send(port, { type: 'start' });
  return {
    confirmScope(path: string | undefined): void {
      if (ended || scopeConfirmed) return;
      scopeConfirmed = true;
      send(port, { type: 'scope', path: path ?? null });
    },
    sample(details: ExecutorDetails | null): void {
      if (details === null || ended) return;
      latest = details;
      flush();
    },
    settle(state: Terminal, resultRef?: string): void {
      if (ended) return;
      ended = true;
      send(port, { type: 'terminal', sequence: ++sequence, state,
        ...(Value.Check(ProgressId, resultRef) ? { resultRef } : {}),
        ...(latest === undefined ? {} : { details: latest }) });
      latest = undefined;
    },
  };
}

type AcceptedOwner = {
  readonly task: TaskRef;
  readonly fence: TaskOwnerFence;
  readonly signal: (sequence: number) => Promise<void>;
  readonly settle: (evidence: OwnerEvidence) => Promise<'recorded' | 'replay' | 'rejected'>;
};

export class ExecutorProgressRelay {
  private reservations = 0;

  constructor(
    private readonly runtime: () => Promise<ExecutorRuntime>,
    private readonly admissionMs = 10_000,
    private readonly limit = 256,
  ) {}

  forward(next: ForwardRequest): ForwardRequest {
    return (request, deliver) => {
      const kind = executorProgressKind(request.method);
      const context = request.trustedContext;
      const params = request.params as { repo?: unknown; scopeRef?: unknown } | null;
      const repo = kind === 'analysis' ? analysisProgressPath(params?.scopeRef) : params?.repo;
      if (kind === undefined || context === undefined || typeof repo !== 'string') return next(request, deliver);
      const port = this.reserve(kind, repo, context);
      return next(port === undefined ? request
        : { ...request, trustedContext: { ...context, executorProgressPort: port } }, deliver);
    };
  }

  /** A dedicated transferred port binds events to the exact dispatched request and worker. */
  reserve(kind: ExecutorProgressKind, repo: string, context: TrustedRpcContext): MessagePort | undefined {
    if (this.reservations >= this.limit || context.connectionSignal?.aborted ||
        context.connectionSession !== undefined || context.connectionExecution?.mode === 'session-memory') return undefined;
    const { port1, port2 } = new MessageChannel();
    this.reservations++;
    this.receive(port1, kind, repo, context);
    port2.unref();
    return port2;
  }

  private receive(port: MessagePort, kind: ExecutorProgressKind, repo: string, context: TrustedRpcContext): void {
    const ownerId = randomUUID();
    let started = false;
    let closed = false;
    let released = false;
    let expired = false;
    let accepted: AcceptedOwner | undefined;
    let sequence = 0;
    let lastEvent = 0;
    let latest: ExecutorDetails | undefined;
    let final: TerminalEvent | undefined;
    let snapshot: DelegateMeasurement<ExecutorDetails> | null = null;
    let pumping = false;
    let probeNumber = 0;
    let waiting: { id: number; resolve: (sequence: number | null) => void } | undefined;
    let scope: 'unconfirmed' | 'pending' | 'verified' | 'rejected' = 'unconfirmed';

    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      this.reservations--;
      port.close();
    };
    const timer = setTimeout(() => {
      expired = true;
      closed = true;
      release();
    }, this.admissionMs);
    timer.unref();

    const probe = (_task: TaskRef, signal: AbortSignal): Promise<number | null> => {
      if (closed || final !== undefined || signal.aborted || waiting !== undefined) return Promise.resolve(null);
      return new Promise(resolve => {
        const id = ++probeNumber;
        const finish = (value: number | null) => {
          if (waiting?.id !== id) return;
          waiting = undefined;
          signal.removeEventListener('abort', abort);
          resolve(value);
        };
        const abort = () => finish(null);
        waiting = { id, resolve: finish };
        signal.addEventListener('abort', abort, { once: true });
        send(port, { type: 'probe', probe: id });
      });
    };

    const pump = async (): Promise<void> => {
      const owner = accepted;
      if (owner === undefined || pumping || (released && !expired)) return;
      pumping = true;
      try {
        while (latest !== undefined && !expired && (scope === 'unconfirmed' || scope === 'verified')) {
          const details = latest;
          latest = undefined;
          const at = new Date().toISOString();
          const revision = ++sequence;
          // Rebuild the trusted envelope from the admitted task and its fence.
          snapshot = {
            task: owner.task, kind, measuredAt: at, meaningfulRevision: revision, lastMeaningfulAt: at,
            owner: { ...owner.fence, ownerSequence: revision },
            phase: details.stageId, activeUnit: details.activeUnit, details, milestones: [], controls: [],
            counts: [details.stagePosition, details.production].filter(count => count !== null),
          };
          await owner.signal(revision).catch(() => {});
        }
        if (scope === 'pending') return;
        if (scope === 'rejected') { final = undefined; closed = true; }
        if (final !== undefined || closed) {
          const evidence: OwnerEvidence = final === undefined
            ? { sequence: ++sequence, state: 'interrupted' }
            : { sequence: ++sequence, state: final.state,
              ...(final.resultRef !== undefined ? { resultRef: final.resultRef } : {}) };
          await owner.settle(evidence).catch(() => owner.settle(evidence)).catch(() => {});
          release();
        }
      } finally {
        pumping = false;
      }
    };
    const schedule = () => { void pump().catch(release); };

    const admit = async () => {
      const runtime = await this.runtime();
      if (released) return;
      const project = kind === 'analysis' ? await runtime.access.projectForScope(repo) : repo;
      if (released || project === undefined) { release(); return; }
      const launch = await runtime.access.launchBound(project, ownerId, context);
      if (released) return;
      const delegate = <D extends ExecutorDetails>(matches: (value: ExecutorDetails) => value is D): TaskProgressDelegate<D> => ({
        progress: async task => snapshot !== null && matches(snapshot.details) &&
          snapshot.task.projectId === task.projectId && snapshot.task.invocationId === task.invocationId &&
          snapshot.task.taskId === task.taskId && snapshot.task.attempt === task.attempt
          ? { ...snapshot, details: snapshot.details } : null,
        ownerActivity: probe,
      });
      const bind = async (
        producer: Pick<ProducerPort<ExecutorDetails>, 'recordLifecycle' | 'signalMeasurement'>,
        registration: ReturnType<ProducerPort<ExecutorDetails>['register']>,
      ) => {
        const admission = await registration;
        if (admission.kind !== 'admitted') { release(); return; }
        const { task, owner, fence } = admission;
        accepted = { task, fence, signal: revision => producer.signalMeasurement(owner, revision),
          settle: evidence => producer.recordLifecycle(owner, evidence) };
        clearTimeout(timer);
        if (!expired && !closed && final === undefined) {
          await accepted.settle({ sequence: ++sequence, state: 'running' }).catch(() => {});
        }
        schedule();
      };
      if (kind === 'workflow') {
        const producer = runtime.producers.workflow;
        await bind(producer, producer.register(launch.authorization, ownerId,
          delegate((details): details is WorkflowDetails => details.kind === 'workflow')));
      } else {
        const producer = runtime.producers.analysis;
        await bind(producer, producer.register(launch.authorization, ownerId,
          delegate((details): details is AnalysisDetails => details.kind === 'analysis')));
      }
    };

    port.on('message', (event: unknown) => {
      if (released || closed || !Value.Check(EventSchema, event)) return;
      if (event.type === 'start') {
        if (started) return;
        started = true;
        void admit().catch(release);
        return;
      }
      if (!started || final !== undefined) return;
      if (event.type === 'alive') {
        if (waiting?.id === event.probe) waiting.resolve(++sequence);
        return;
      }
      if (event.type === 'scope') {
        if (kind !== 'analysis' || scope !== 'unconfirmed') return;
        scope = 'pending';
        const finish = (verified: boolean) => {
          if (scope !== 'pending') return;
          clearTimeout(timeout);
          scope = verified ? 'verified' : 'rejected';
          schedule();
        };
        const timeout = setTimeout(() => finish(false), this.admissionMs);
        timeout.unref();
        const path = event.path;
        if (path === null) finish(false);
        else void this.runtime().then(async current => {
          const requested = await current.access.projectForScope(repo);
          return requested !== undefined && requested === await current.access.projectForScope(path);
        }).then(finish, () => finish(false));
        return;
      }
      if (event.sequence <= lastEvent) return;
      if (event.type === 'sample') {
        if (!validateExecutorDetails(kind, event.details)) return;
        if (event.details.kind === 'analysis' && event.details.stageId !== 'classify' && scope === 'unconfirmed') return;
        latest = event.details;
        send(port, { type: 'ack', sequence: event.sequence });
      } else {
        if (kind === 'analysis' && event.state === 'completed' && scope === 'unconfirmed') {
          closed = true;
          schedule();
          return;
        }
        final = event;
        if (validateExecutorDetails(kind, event.details) &&
            (event.details.kind !== 'analysis' || event.details.stageId === 'classify' || scope !== 'unconfirmed')) latest = event.details;
        waiting?.resolve(null);
      }
      lastEvent = event.sequence;
      schedule();
    });
    port.once('close', () => {
      closed = true;
      waiting?.resolve(null);
      if (!started) release();
      else schedule();
    });
    port.unref();
  }
}
