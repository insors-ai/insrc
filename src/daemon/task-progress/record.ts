import { createHash } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  MAX_PROGRESS_MILESTONES, MAX_PROGRESS_SNAPSHOT_BYTES, MeasurementSchema, ProgressId, ProgressKindSchema,
  ProgressSequence, ProgressTime, TaskOriginSchema, TaskOwnerFenceSchema, TaskRefSchema,
  TaskStateSchema, isTerminalTaskState, progressObject,
} from '../../shared/task-progress.js';
import type { Measurement, ProgressKind, TaskRef } from '../../shared/task-progress.js';

export const MAX_PROGRESS_RECORD_BYTES = 64 * 1024;

const RecordSchema = progressObject({
  version: Type.Literal(1),
  task: TaskRefSchema,
  origin: TaskOriginSchema,
  producerKind: Type.Optional(ProgressKindSchema),

  owner: Type.Union([TaskOwnerFenceSchema, Type.Null()]),
  revision: ProgressSequence,
  state: TaskStateSchema,
  retention: Type.Union([Type.Literal('active'), Type.Literal('terminal'), Type.Literal('expired')]),
  updatedAt: ProgressTime,
  lastOwnerActivityAt: Type.Union([ProgressTime, Type.Null()]),
  activityReleased: Type.Optional(Type.Boolean()),
  recoveryDeadline: Type.Union([ProgressTime, Type.Null()]),
  measurement: Type.Union([MeasurementSchema, Type.Null()]),
  measurementStale: Type.Optional(Type.Boolean()),
  priorAttempts: Type.Array(progressObject({
    attempt: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    state: TaskStateSchema,
    updatedAt: ProgressTime,
  }), { maxItems: MAX_PROGRESS_MILESTONES }),
  resultRef: Type.Optional(ProgressId),
  originDigest: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })),
  grants: Type.Optional(progressObject({
    conversation: Type.Optional(progressObject({
      digest: Type.String({ pattern: '^[a-f0-9]{64}$' }), expiresAt: ProgressTime,
    })),
    history: Type.Optional(progressObject({
      digest: Type.String({ pattern: '^[a-f0-9]{64}$' }), expiresAt: ProgressTime,
    })),
  })),
});

export type ProgressRecord<D> = Readonly<Omit<Static<typeof RecordSchema>, 'measurement'> & {
  measurement: Measurement<D> | null;
}>;
export type DetailValidator<D> = (kind: ProgressKind, details: unknown) => details is D;

export function progressTaskKey(task: Pick<TaskRef, 'projectId' | 'invocationId' | 'taskId'>): string {
  return createHash('sha256').update(JSON.stringify([task.projectId, task.invocationId, task.taskId])).digest('hex');
}

export function validProgressMeasurement<D>(value: unknown, validateDetails: DetailValidator<D>): value is Measurement<D> {
  if (!Value.Check(MeasurementSchema, value)) return false;
  return validateDetails(value.kind, value.details) &&
    new Set(value.counts.map(count => count.unit)).size === value.counts.length &&
    value.counts.every(count => count.total === null || count.completed <= count.total) &&
    (value.lastMeaningfulAt === null || value.lastMeaningfulAt <= value.measuredAt) &&
    Buffer.byteLength(JSON.stringify(value)) <= MAX_PROGRESS_SNAPSHOT_BYTES;
}

export function decodeProgressRecord<D>(bytes: string, validateDetails: DetailValidator<D>): ProgressRecord<D> {
  if (Buffer.byteLength(bytes) > MAX_PROGRESS_RECORD_BYTES) throw new Error('progress record exceeds size limit');
  const value: unknown = JSON.parse(bytes);
  if (!Value.Check(RecordSchema, value)) throw new Error('invalid progress record');
  const { measurement, retention, state, owner, priorAttempts, task } = value;
  if ((isTerminalTaskState(state) && retention !== 'terminal') ||
      (retention === 'terminal' && !isTerminalTaskState(state) && state !== 'interrupted') ||
      (retention === 'expired' && state !== 'unknown') ||
      (retention !== 'active' && owner !== null) ||
      (value.resultRef !== undefined && retention !== 'terminal')) {
    throw new Error('invalid progress retention state');
  }
  let previousAttempt = 0;
  for (const prior of priorAttempts) {
    if (prior.attempt <= previousAttempt || prior.attempt >= task.attempt) throw new Error('invalid prior progress attempt');
    previousAttempt = prior.attempt;
  }
  if (measurement !== null && (!validProgressMeasurement(measurement, validateDetails) ||
      measurement.milestones.length + priorAttempts.length > MAX_PROGRESS_MILESTONES)) {
    throw new Error('invalid or oversized progress measurement');
  }
  return value as ProgressRecord<D>;
}
