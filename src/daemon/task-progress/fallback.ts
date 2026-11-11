import { randomUUID } from 'node:crypto';
import type { ObservationReply, ProgressSnapshot, TaskRef } from '../../shared/task-progress.js';
import { progressTaskKey } from './record.js';

export const FALLBACK_CADENCE_MS = 60_000;
const HOLDER_LEASE_MS = 120_000;

export interface FallbackLease {
  readonly leaseId: string;
  readonly generation: number;
  readonly expiresAt: string;
}

type Holder = { readonly binding: string; readonly id: string; readonly generation: number; deadline: number };
type Slot = { readonly number: number; readonly deadline: number; readonly controller: AbortController };
type Schedule<D> = {
  readonly task: TaskRef;
  readonly anchor: number;
  generation: number;
  watermark: number;
  holder?: Holder | undefined;
  terminalHolder?: Holder | undefined;
  slot?: Slot | undefined;
  cache?: { generation: number; snapshot: ProgressSnapshot<D> } | undefined;
};

type Clock = { now(): number; monotonic(): number; timeout(ms: number, callback: () => void): () => void };
const systemClock: Clock = {
  now: Date.now, monotonic: () => performance.now(),
  timeout(ms, callback) {
    const timer = setTimeout(callback, ms);
    timer.unref();
    return () => clearTimeout(timer);
  },
};

interface FallbackSources<D> {
  read(task: TaskRef): ProgressSnapshot<D> | undefined;
  hasLiveOwner(task: TaskRef): boolean;
  isTerminal(task: TaskRef): boolean;
  disposition(task: TaskRef, prior: string | undefined, current: string): ObservationReply<D>['disposition'];
  refresh(task: TaskRef, signal: AbortSignal): Promise<void>;
}

/** Only the daemon-side adapter can call this scheduler, after scoped observer authorization. */
export class FallbackScheduler<D> {
  private readonly schedules = new Map<string, Schedule<D>>();

  constructor(private readonly source: FallbackSources<D>, private readonly clock: Clock = systemClock) {}

  claim(task: TaskRef, binding: string): { lease: FallbackLease; observation: ObservationReply<D> } {
    const snapshot = this.source.read(task);
    if (snapshot === undefined) throw new Error('task-unavailable');
    if (this.source.isTerminal(task) || !this.source.hasLiveOwner(task)) throw new Error('schedule-suspended');
    const key = progressTaskKey(task);
    const now = this.clock.monotonic();
    let schedule = this.schedules.get(key);
    if (schedule?.task.attempt !== task.attempt) {
      if (schedule !== undefined) this.revoke(schedule);
      schedule = { task, anchor: now, generation: 0, watermark: 0 };
      this.schedules.set(key, schedule);
    }
    this.expire(schedule);
    if (schedule.holder !== undefined && schedule.holder.binding !== binding) throw new Error('lease-held');
    schedule.holder ??= { binding, id: randomUUID(), generation: ++schedule.generation, deadline: now + HOLDER_LEASE_MS };
    return { lease: this.lease(schedule.holder), observation: this.reply(snapshot, undefined, schedule) };
  }

  renew(task: TaskRef, binding: string, lease: FallbackLease): FallbackLease {
    const [, holder] = this.owned(task, binding, lease);
    if (!this.source.hasLiveOwner(task)) throw new Error('schedule-suspended');
    holder.deadline = this.clock.monotonic() + HOLDER_LEASE_MS;
    return this.lease(holder);
  }

  release(task: TaskRef, binding: string, lease: FallbackLease): void {
    this.revoke(this.owned(task, binding, lease)[0]);
  }

  detach(binding: string): void {
    for (const schedule of this.schedules.values()) {
      if (schedule.holder?.binding === binding) this.revoke(schedule);
      if (schedule.terminalHolder?.binding === binding) schedule.terminalHolder = undefined;
    }
  }

  sweep(): void {
    for (const [key, schedule] of this.schedules) {
      this.expire(schedule);
      if (this.source.read(schedule.task) === undefined) this.schedules.delete(key);
    }
  }

  async poll(task: TaskRef, binding: string, lease: FallbackLease, cursor: string | undefined,
    reauthorize: () => Promise<void>): Promise<ObservationReply<D>> {
    if (this.source.isTerminal(task)) {
      const schedule = this.schedules.get(progressTaskKey(task));
      if (schedule?.task.attempt !== task.attempt) throw new Error('stale-lease');
      this.expire(schedule);
      const holder = schedule.terminalHolder;
      const snapshot = this.source.read(task);
      if (holder === undefined || !this.matches(holder, binding, lease) || snapshot === undefined) throw new Error('stale-lease');
      return this.reply(snapshot, cursor);
    }
    const [schedule, holder] = this.owned(task, binding, lease);
    if (!this.source.hasLiveOwner(task)) throw new Error('schedule-suspended');
    const now = this.clock.monotonic();
    const number = Math.floor((now - schedule.anchor) / FALLBACK_CADENCE_MS);
    if (schedule.slot !== undefined) throw new Error('slot-in-flight');
    if (number <= schedule.watermark) {
      if (schedule.cache?.generation === holder.generation) return this.reply(schedule.cache.snapshot, cursor, schedule);
      throw new Error('too-early');
    }
    const deadline = Math.min(holder.deadline, schedule.anchor + (number + 1) * FALLBACK_CADENCE_MS);
    const slot = { number, deadline, controller: new AbortController() };
    schedule.watermark = number;
    schedule.cache = undefined;
    schedule.slot = slot;
    let cancelDeadline = () => {};
    const elapsed = new Promise<never>((_, reject) => {
      cancelDeadline = this.clock.timeout(deadline - now, () => {
        slot.controller.abort();
        reject(new Error('stale-lease'));
      });
    });
    try {
      await Promise.race([this.source.refresh(task, slot.controller.signal), elapsed]);
      await reauthorize();
      if (schedule.holder !== holder || schedule.slot !== slot || slot.controller.signal.aborted ||
          holder.deadline <= this.clock.monotonic() || deadline <= this.clock.monotonic()) throw new Error('stale-lease');
      const snapshot = this.source.read(task);
      if (snapshot === undefined) throw new Error('stale-lease');
      if (this.source.isTerminal(task)) {
        schedule.terminalHolder = holder;
        this.revoke(schedule);
        return this.reply(snapshot, cursor);
      }
      if (!this.source.hasLiveOwner(task)) throw new Error('stale-lease');
      schedule.cache = { generation: holder.generation, snapshot };
      return this.reply(snapshot, cursor, schedule);
    } finally {
      cancelDeadline();
      if (schedule.slot === slot) schedule.slot = undefined;
    }
  }

  private owned(task: TaskRef, binding: string, lease: FallbackLease): [Schedule<D>, Holder] {
    const schedule = this.schedules.get(progressTaskKey(task));
    if (schedule === undefined || schedule.task.attempt !== task.attempt) throw new Error('stale-lease');
    this.expire(schedule);
    const holder = schedule.holder;
    if (holder === undefined || !this.matches(holder, binding, lease)) throw new Error('stale-lease');
    return [schedule, holder];
  }

  private expire(schedule: Schedule<D>): void {
    const now = this.clock.monotonic();
    if (schedule.terminalHolder !== undefined && schedule.terminalHolder.deadline <= now) schedule.terminalHolder = undefined;
    if (schedule.holder !== undefined && (schedule.holder.deadline <= now || this.source.isTerminal(schedule.task))) {
      if (schedule.holder.deadline > now) schedule.terminalHolder = schedule.holder;
      this.revoke(schedule);
    }
    if (schedule.slot !== undefined && schedule.slot.deadline <= now) {
      schedule.slot.controller.abort();
      schedule.slot = undefined;
    }
  }

  private matches(holder: Holder, binding: string, lease: FallbackLease): boolean {
    return holder.binding === binding && holder.id === lease.leaseId && holder.generation === lease.generation;
  }

  private revoke(schedule: Schedule<D>): void {
    schedule.holder = undefined;
    schedule.cache = undefined;
    schedule.slot?.controller.abort();
  }

  private lease(holder: Holder): FallbackLease {
    return { leaseId: holder.id, generation: holder.generation, expiresAt: this.wallAt(holder.deadline) };
  }

  private wallAt(instant: number): string {
    return new Date(this.clock.now() + Math.max(0, instant - this.clock.monotonic())).toISOString();
  }

  private reply(snapshot: ProgressSnapshot<D>, cursor: string | undefined, schedule?: Schedule<D>): ObservationReply<D> {
    return {
      snapshot: structuredClone(snapshot), schedule: schedule === undefined ? 'stopped' : 'scheduled',
      disposition: this.source.disposition(snapshot.task, cursor, snapshot.cursor),
      ...(schedule === undefined ? {} : { nextPollNotBefore: this.wallAt(schedule.anchor + (schedule.watermark + 1) * FALLBACK_CADENCE_MS) }),
    };
  }
}
