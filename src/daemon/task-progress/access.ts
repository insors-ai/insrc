import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ProgressKind, TaskRef } from '../../shared/task-progress.js';
import type { TrustedRpcContext } from '../request-context.js';
import { createProgressAuthority } from './coordinator.js';
import type { ProgressCoordinator, ProducerAuthorization } from './coordinator.js';
import type { ProgressRecord } from './record.js';
import type { ProgressStore } from './store.js';
import { ProgressStorageError } from './store.js';

type Details = { readonly kind: ProgressKind };
type Purpose = 'conversation' | 'history';
type Permission = 'observe' | 'details' | 'cancel' | 'fallback';
const maxLiveBindings = 1024;
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const originIdleMs = 24 * 60 * 60 * 1000;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;

interface Origin {
  readonly projectId: string;
  readonly id: string;
  readonly digest: string;
  expiresAt: number;
  revoked: boolean;
  tail: Promise<void>;
}
interface Binding {
  readonly connection: string;
  readonly task: TaskRef;
  readonly purpose: Purpose;
  readonly digest: string;
}

function digest(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
function matches(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
function unavailable(): Error {
  return new Error('task-unavailable');
}
function connection(context: TrustedRpcContext | undefined): string {
  if (context === undefined || context.connectionSignal?.aborted ||
      context.connectionSession !== undefined || context.connectionExecution?.mode === 'session-memory') throw unavailable();
  return context.connectionIdentity;
}

function serializeOrigin<T>(origin: Origin, work: () => Promise<T>): Promise<T> {
  const result = origin.tail.then(work);
  origin.tail = result.then(() => undefined, () => undefined);
  return result;
}

export function progressProjectId(canonicalPath: string): string {
  return digest(canonicalPath);
}

/** Authority and live bindings are confined to the daemon's socket-owning thread. */
export class ProgressAccess<D extends Details> {
  private readonly origins = new Map<string, Origin>();
  private readonly boundOrigins = new Map<string, Set<string>>();
  private readonly observers = new Map<string, Binding>();

  constructor(
    private readonly store: ProgressStore<D>,
    private readonly coordinator: ProgressCoordinator<D>,
    private readonly mint: ReturnType<typeof createProgressAuthority>['mint'],
    private readonly projects: () => Promise<ReadonlySet<string>>,
    private readonly now: () => number = Date.now,
  ) {}

  private async project(path: string): Promise<string> {
    if (!(await this.projects()).has(path)) throw unavailable();
    return progressProjectId(path);
  }

  private async registered(projectId: string): Promise<boolean> {
    for (const path of await this.projects()) if (progressProjectId(path) === projectId) return true;
    return false;
  }

  private prune(): void {
    const now = this.now();
    for (const [id, origin] of this.origins) {
      if (origin.expiresAt > now || origin.revoked) continue;
      this.origins.delete(id);
      for (const [connectionId, bindings] of this.boundOrigins) {
        bindings.delete(id);
        if (bindings.size === 0) this.boundOrigins.delete(connectionId);
      }
    }
  }

  private bind(connectionId: string, origin: Origin): void {
    const bound = this.boundOrigins.get(connectionId) ?? new Set<string>();
    if (!bound.has(origin.id) && [...this.boundOrigins.values()].reduce((n, ids) => n + ids.size, 0) >= maxLiveBindings) {
      throw new Error('progress-capacity');
    }
    bound.add(origin.id);
    this.boundOrigins.set(connectionId, bound);
    origin.expiresAt = this.now() + originIdleMs;
  }

  async openOrigin(path: string, context: TrustedRpcContext | undefined): Promise<{ originId: string; capability: string }> {
    const connectionId = connection(context);
    const projectId = await this.project(path);
    connection(context);
    this.prune();
    if (this.origins.size >= maxLiveBindings) throw new Error('progress-capacity');
    const capability = randomBytes(32).toString('base64url');
    const origin = { projectId, id: randomUUID(), digest: digest(capability), expiresAt: this.now() + originIdleMs, revoked: false, tail: Promise.resolve() };
    this.bind(connectionId, origin);
    this.origins.set(origin.id, origin);
    return { originId: origin.id, capability };
  }

  async bindOrigin(path: string, id: string, capability: string, context: TrustedRpcContext | undefined): Promise<void> {
    const connectionId = connection(context);
    const projectId = await this.project(path);
    connection(context);
    if (!secretPattern.test(capability)) throw unavailable();
    const expected = digest(capability);
    this.prune();
    let origin = this.origins.get(id);
    if (origin === undefined) {
      const now = this.now();
      const retained = this.store.list().find(record => record.task.projectId === projectId &&
        record.origin.extensionChatId === id && record.originDigest !== undefined &&
        record.grants?.conversation !== undefined && record.grants.conversation.expiresAt > now &&
        matches(record.originDigest, expected));
      if (retained === undefined) throw unavailable();
      if (this.origins.size >= maxLiveBindings) throw new Error('progress-capacity');
      origin = { projectId, id, digest: expected, expiresAt: now + originIdleMs, revoked: false, tail: Promise.resolve() };
      this.bind(connectionId, origin);
      this.origins.set(id, origin);
      return;
    }
    if (origin.revoked || origin.projectId !== projectId || !matches(origin.digest, expected)) throw unavailable();
    this.bind(connectionId, origin);
  }

  /** Called by a trusted executor entry point. There is no IPC method to mint this port. */
  async launch(path: string, originId: string, ownerId: string, context: TrustedRpcContext): Promise<{
    authorization: ProducerAuthorization;
    grants: (task: TaskRef) => Promise<{ conversation: string; history: string }>;
  }> {
    const connectionId = connection(context);
    const projectId = await this.project(path);
    const origin = this.origins.get(originId);
    if (origin === undefined || origin.projectId !== projectId || origin.revoked || origin.expiresAt <= this.now() ||
        this.boundOrigins.get(connectionId)?.has(originId) !== true) throw unavailable();
    connection(context);
    const invocationId = randomUUID();
    const authorization = this.mint({ action: 'launch', projectId, invocationId, ownerId, origin: { extensionChatId: originId } });
    return {
      authorization,
      grants: task => serializeOrigin(origin, async () => {
        connection(context);
        if (origin.revoked || task.projectId !== projectId || task.invocationId !== invocationId ||
            !(await this.registered(projectId))) throw unavailable();
        await this.store.settle();
        const record = this.store.get(task);
        if (origin.revoked || record === undefined || record.origin.extensionChatId !== originId || record.grants !== undefined) throw unavailable();
        const expiresAt = this.now() + retentionMs;
        const conversation = randomBytes(32).toString('base64url');
        const history = randomBytes(32).toString('base64url');
        await this.store.commit({ ...record, revision: record.revision + 1, originDigest: origin.digest,
          grants: { conversation: { digest: digest(conversation), expiresAt }, history: { digest: digest(history), expiresAt } },
        }, record.revision);
        connection(context);
        if (origin.revoked) throw unavailable();
        return { conversation, history };
      }),
    };
  }

  async attach(task: TaskRef, capability: string, purpose: Purpose, context: TrustedRpcContext | undefined): Promise<string> {
    const connectionId = connection(context);
    if (!secretPattern.test(capability)) throw unavailable();
    const binding: Binding = { connection: connectionId, task, purpose, digest: digest(capability) };
    await this.check(binding, 'observe');
    connection(context);
    if (this.observers.size >= maxLiveBindings) throw new Error('progress-capacity');
    const id = randomUUID();
    this.observers.set(id, binding);
    return id;
  }

  async authorize(id: string, permission: Permission, context: TrustedRpcContext | undefined): Promise<TaskRef> {
    const binding = this.observers.get(id);
    if (binding === undefined || binding.connection !== connection(context)) throw unavailable();
    await this.check(binding, permission);
    connection(context);
    if (this.observers.get(id) !== binding) throw unavailable();
    return { ...binding.task };
  }

  async read(id: string, context: TrustedRpcContext | undefined) {
    const task = await this.authorize(id, 'observe', context);
    const binding = this.observers.get(id)!;
    const snapshot = this.coordinator.read(task);
    if (snapshot === undefined) throw unavailable();
    // The scoped result identifier may be resolved only by the owner of the actual result surface.
    if (binding.purpose === 'history' && snapshot.measurement !== null) {
      return { ...snapshot, measurement: { ...snapshot.measurement, controls: [] as const } };
    }
    return snapshot;
  }

  detach(id: string, context: TrustedRpcContext | undefined): void {
    const binding = this.observers.get(id);
    if (binding === undefined || binding.connection !== connection(context)) throw unavailable();
    this.observers.delete(id);
    this.coordinator.notify(binding.task);
  }

  disconnect(context: TrustedRpcContext): void {
    this.boundOrigins.delete(context.connectionIdentity);
    for (const [id, binding] of this.observers) {
      if (binding.connection !== context.connectionIdentity) continue;
      this.observers.delete(id);
      this.coordinator.notify(binding.task);
    }
  }

  async revokeOrigin(id: string, context: TrustedRpcContext | undefined): Promise<void> {
    const origin = this.origins.get(id);
    if (origin === undefined || this.boundOrigins.get(connection(context))?.has(id) !== true) throw unavailable();
    origin.revoked = true;
    await serializeOrigin(origin, async () => {
      await this.store.settle();
      for (const record of this.store.list()) {
        if (record.task.projectId !== origin.projectId || record.origin.extensionChatId !== id || record.grants?.conversation === undefined) continue;
        await this.revoke(record);
      }
      this.origins.delete(id);
      for (const [connectionId, bindings] of this.boundOrigins) {
        bindings.delete(id);
        if (bindings.size === 0) this.boundOrigins.delete(connectionId);
      }
    });
  }

  private async revoke(original: ProgressRecord<D>): Promise<void> {
    let record = original;
    for (;;) {
      const { originDigest, grants, ...base } = record;
      try {
        await this.store.commit({ ...base, revision: record.revision + 1,
          ...(grants?.history === undefined ? {} : { grants: { history: grants.history } }),
        }, record.revision);
        this.coordinator.notify(record.task);
        return;
      } catch (error) {
        if (!(error instanceof ProgressStorageError) || error.reason !== 'stale') throw error;
        const current = this.store.get(record.task);
        if (current === undefined || current.grants?.conversation === undefined) return;
        record = current;
      }
    }
  }

  private async check(binding: Binding, permission: Permission): Promise<void> {
    if (!(await this.registered(binding.task.projectId))) throw unavailable();
    const record = this.store.get(binding.task);
    const grant = record?.grants?.[binding.purpose];
    if (grant === undefined || grant.expiresAt <= this.now() || !matches(grant.digest, binding.digest) ||
        (binding.purpose === 'conversation' && this.origins.get(record?.origin.extensionChatId ?? '')?.revoked === true) ||
        (binding.purpose === 'history' && permission !== 'observe' && permission !== 'details')) throw unavailable();
  }
}
