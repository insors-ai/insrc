import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, opendir, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { decodeProgressRecord, MAX_PROGRESS_RECORD_BYTES, progressTaskKey, validProgressMeasurement } from './record.js';
import type { DetailValidator, ProgressRecord } from './record.js';
import type { Measurement, TaskOwnerFence, TaskRef } from '../../shared/task-progress.js';

const recordName = /^[a-f0-9]{64}\.json$/;
const scratchName = /^[a-f0-9]{64}\.json\.[a-f0-9-]{36}\.(tmp|invalid)$/;
const recordReservation = 2 * MAX_PROGRESS_RECORD_BYTES;
const defaultIO = { open, rename };
type StoreIO = typeof defaultIO;

export interface ProgressStoreLimits {
  readonly activePerProject: number;
  readonly inactivePerProject: number;
  readonly globalBytes: number;
  readonly quarantineRecords: number;
}

const defaultLimits: ProgressStoreLimits = {
  activePerProject: 128,
  inactivePerProject: 1024,
  globalBytes: 128 * 1024 * 1024,
  quarantineRecords: 4,
};

export class ProgressStorageError extends Error {
  constructor(readonly reason: 'capacity' | 'stale' | 'unavailable', cause?: unknown) {
    super(`Progress storage ${reason}`, { cause });
    this.name = 'ProgressStorageError';
  }
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

async function unlinkIfPresent(path: string): Promise<void> {
  try { await unlink(path); } catch (error) { if (!missing(error)) throw error; }
}

/** One daemon writer. Each mutation settles before the next quota decision. */
export class ProgressStore<D> {
  private readonly records = new Map<string, ProgressRecord<D>>();
  private readonly unsettled = new Map<string, ((record: ProgressRecord<D> | undefined) => void) | undefined>();
  private tail = Promise.resolve();
  private quarantined = 0;

  private constructor(
    private readonly directory: string,
    private readonly validateDetails: DetailValidator<D>,
    private readonly limits: ProgressStoreLimits,
    private readonly io: StoreIO,
  ) {}

  static async open<D>(
    directory: string,
    validateDetails: DetailValidator<D>,
    limits: ProgressStoreLimits = defaultLimits,
    io: StoreIO = defaultIO,
  ): Promise<ProgressStore<D>> {
    if (!isAbsolute(directory) || Object.values(limits).some(n => !Number.isSafeInteger(n) || n < 0) ||
        limits.inactivePerProject === 0 || limits.globalBytes < limits.quarantineRecords * MAX_PROGRESS_RECORD_BYTES) {
      throw new ProgressStorageError('unavailable');
    }
    let created = false;
    try {
      await mkdir(directory, { mode: 0o700 });
      created = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const stat = await lstat(directory);
    if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700 ||
        (process.getuid !== undefined && stat.uid !== process.getuid())) {
      throw new ProgressStorageError('unavailable');
    }
    const store = new ProgressStore(directory, validateDetails, limits, io);
    if (created) await store.flushDirectory(dirname(directory));
    await store.recover();
    return store;
  }

  get(task: ProgressRecord<D>['task']): ProgressRecord<D> | undefined {
    const key = progressTaskKey(task);
    if (this.unsettled.has(key)) throw new ProgressStorageError('unavailable');
    const record = this.records.get(key);
    return record?.task.attempt === task.attempt ? structuredClone(record) : undefined;
  }

  list(): readonly ProgressRecord<D>[] {
    if (this.unsettled.size > 0) throw new ProgressStorageError('unavailable');
    return [...this.records.values()].map(record => structuredClone(record));
  }

  settle(): Promise<void> {
    return this.serialize(() => this.reconcile());
  }

  acceptsMeasurement(value: unknown): value is Measurement<D> {
    return validProgressMeasurement(value, this.validateDetails);
  }

  /** The caller verifies survival. Replace only the exact durable fence it inspected. */
  async revalidateOwner(task: TaskRef, expected: TaskOwnerFence, ownerEpoch: string, now: number): Promise<ProgressRecord<D>> {
    const record = this.get(task);
    const owner = record?.owner;
    if (record === undefined || record.retention !== 'active' || owner == null ||
        owner.ownerId !== expected.ownerId || owner.ownerEpoch !== expected.ownerEpoch ||
        owner.ownerSequence !== expected.ownerSequence || ownerEpoch === owner.ownerEpoch ||
        (record.recoveryDeadline !== null && now >= record.recoveryDeadline)) {
      throw new ProgressStorageError('stale');
    }
    const next: ProgressRecord<D> = {
      ...record, revision: record.revision + 1, updatedAt: now, recoveryDeadline: null,
      owner: { ownerId: owner.ownerId, ownerEpoch, ownerSequence: 0 }, lastOwnerActivityAt: now,
    };
    await this.commit(next, record.revision);
    return next;
  }

  /** A compare-and-replace prevents delayed writes. Recovery reports only the exact adopted write. */
  commit(record: ProgressRecord<D>, expectedRevision: number | null, onRecovered?: () => void): Promise<void> {
    let bytes: string;
    let candidate: ProgressRecord<D>;
    try {
      bytes = JSON.stringify(record) + '\n';
      candidate = decodeProgressRecord(bytes, this.validateDetails);
    } catch (error) {
      return Promise.reject(new ProgressStorageError('unavailable', error));
    }
    return this.serialize(async () => {
      const key = progressTaskKey(candidate.task);
      await this.reconcile();
      const prior = this.records.get(key);
      if ((prior?.revision ?? null) !== expectedRevision ||
          candidate.revision !== (expectedRevision === null ? 0 : expectedRevision + 1) ||
          (prior !== undefined && candidate.task.attempt < prior.task.attempt)) {
        throw new ProgressStorageError('stale');
      }
      await this.reserve(key, candidate);
      try {
        await this.write(key, bytes);
      } catch (error) {
        this.unsettled.set(key, onRecovered === undefined ? undefined : recovered => {
          if (isDeepStrictEqual(recovered, candidate)) onRecovered();
        });
        throw new ProgressStorageError('unavailable', error);
      }
      this.records.set(key, candidate);
    });
  }

  remove(task: TaskRef, revision: number): Promise<void> {
    return this.serialize(async () => {
      await this.reconcile();
      if (this.get(task)?.revision !== revision) throw new ProgressStorageError('stale');
      await this.deleteKey(progressTaskKey(task));
    });
  }

  private async deleteKey(key: string): Promise<void> {
    try {
      await unlinkIfPresent(this.path(key));
      await this.flushDirectory();
    } catch (error) {
      this.unsettled.set(key, undefined);
      throw new ProgressStorageError('unavailable', error);
    }
    this.records.delete(key);
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work);
    this.tail = next.then(() => undefined, () => undefined);
    return next;
  }

  private path(key: string): string {
    return join(this.directory, `${key}.json`);
  }

  private get recordCapacity(): number {
    const budget = this.limits.globalBytes - this.limits.quarantineRecords * MAX_PROGRESS_RECORD_BYTES;
    return Math.floor(budget / recordReservation);
  }

  private async reserve(key: string, candidate: ProgressRecord<D>): Promise<void> {
    const project = candidate.task.projectId;
    const others = [...this.records].filter(([otherKey]) => otherKey !== key);
    const active = others.filter(([, record]) => record.task.projectId === project && record.retention === 'active').length;
    const inactive = others.filter(([, record]) => record.task.projectId === project && record.retention !== 'active').length;
    if (candidate.retention === 'active' && active >= this.limits.activePerProject) {
      throw new ProgressStorageError('capacity');
    }
    const victims = others.filter(([, record]) => record.retention !== 'active')
      .sort(([leftKey, left], [rightKey, right]) => left.updatedAt - right.updatedAt || leftKey.localeCompare(rightKey));
    const neededForProject = Math.max(0, inactive + Number(candidate.retention !== 'active') - this.limits.inactivePerProject);
    const projectVictims = victims.filter(([, record]) => record.task.projectId === project).slice(0, neededForProject);
    const neededGlobally = Math.max(0, others.length + 1 - this.recordCapacity);
    if (projectVictims.length < neededForProject || victims.length < neededGlobally) {
      throw new ProgressStorageError('capacity');
    }
    const evictions = new Set(projectVictims.map(([victim]) => victim));
    for (const [victim] of victims) {
      if (evictions.size >= neededGlobally) break;
      evictions.add(victim);
    }
    for (const victim of evictions) await this.deleteKey(victim);
  }

  private async recover(): Promise<void> {
    const entries = await opendir(this.directory);
    for await (const entry of entries) {
      const path = join(this.directory, entry.name);
      if (scratchName.test(entry.name)) {
        await unlinkIfPresent(path);
        continue;
      }
      if (!recordName.test(entry.name)) continue;
      const key = entry.name.slice(0, -5);
      let record: ProgressRecord<D> | undefined;
      try {
        record = await this.read(key);
      } catch (error) {
        // I/O errors are not corruption and must not destroy recoverable data.
        if (!(error instanceof InvalidProgressRecord)) throw error;
        await this.quarantine(path);
        continue;
      }
      if (record === undefined) continue;
      if (this.records.size >= this.recordCapacity) throw new ProgressStorageError('capacity');
      this.records.set(key, record);
    }
    const byProject = new Map<string, { active: number; inactive: number }>();
    for (const record of this.records.values()) {
      const counts = byProject.get(record.task.projectId) ?? { active: 0, inactive: 0 };
      if (record.retention === 'active') counts.active++;
      else counts.inactive++;
      if (counts.active > this.limits.activePerProject || counts.inactive > this.limits.inactivePerProject) {
        throw new ProgressStorageError('capacity');
      }
      byProject.set(record.task.projectId, counts);
    }
    await this.flushDirectory();
  }

  private async quarantine(path: string): Promise<void> {
    const stat = await lstat(path);
    if (stat.isFile() && stat.size <= MAX_PROGRESS_RECORD_BYTES &&
        (stat.mode & 0o777) === 0o600 && this.quarantined < this.limits.quarantineRecords) {
      await this.io.rename(path, `${path}.${randomUUID()}.invalid`);
      this.quarantined++;
    } else {
      await unlinkIfPresent(path);
    }
  }

  private async reconcile(): Promise<void> {
    if (this.unsettled.size === 0) return;
    try {
      await this.flushDirectory();
      for (const [key, recovered] of this.unsettled) {
        const record = await this.read(key);
        if (record === undefined) this.records.delete(key);
        else this.records.set(key, record);
        this.unsettled.delete(key);
        recovered?.(record);
      }
    } catch (error) {
      throw new ProgressStorageError('unavailable', error);
    }
  }

  private async read(key: string): Promise<ProgressRecord<D> | undefined> {
    let file;
    try {
      file = await this.io.open(this.path(key), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    } catch (error) {
      if (missing(error)) return undefined;
      if ((error as NodeJS.ErrnoException).code === 'ELOOP') throw new InvalidProgressRecord();
      throw error;
    }
    try {
      const stat = await file.stat();
      if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > MAX_PROGRESS_RECORD_BYTES ||
          (process.getuid !== undefined && stat.uid !== process.getuid())) throw new InvalidProgressRecord();
      const buffer = Buffer.alloc(stat.size + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      if (offset !== stat.size) throw new InvalidProgressRecord();
      try {
        const record = decodeProgressRecord(buffer.subarray(0, offset).toString('utf8'), this.validateDetails);
        if (progressTaskKey(record.task) !== key) throw new InvalidProgressRecord();
        return record;
      } catch {
        throw new InvalidProgressRecord();
      }
    } finally {
      await file.close();
    }
  }

  private async write(key: string, bytes: string): Promise<void> {
    const target = this.path(key);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const file = await this.io.open(temporary, 'wx', 0o600);
    try {
      try {
        await file.writeFile(bytes, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await this.io.rename(temporary, target);
      await this.flushDirectory();
    } finally {
      await unlinkIfPresent(temporary);
    }
  }

  private async flushDirectory(path = this.directory): Promise<void> {
    const directory = await this.io.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
}

class InvalidProgressRecord extends Error {}
