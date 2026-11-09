import { createHash } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  MAX_PROGRESS_MILESTONES, MAX_PROGRESS_SNAPSHOT_BYTES, MeasurementSchema, ProgressId,
  ProgressSequence, ProgressTime, TaskOriginSchema, TaskOwnerFenceSchema, TaskRefSchema,
  TaskStateSchema, isTerminalTaskState, progressObject,
} from '../../shared/task-progress.js';
import type { Measurement, ProgressKind, TaskRef } from '../../shared/task-progress.js';

export const MAX_PROGRESS_RECORD_BYTES = 64 * 1024;

const RecordSchema = progressObject({
  version: Type.Literal(1),
  task: TaskRefSchema,
  origin: TaskOriginSchema,
  owner: Type.Union([TaskOwnerFenceSchema, Type.Null()]),
  revision: ProgressSequence,
  state: TaskStateSchema,
  retention: Type.Union([Type.Literal('active'), Type.Literal('terminal'), Type.Literal('expired')]),
  updatedAt: ProgressTime,
  lastOwnerActivityAt: Type.Union([ProgressTime, Type.Null()]),
  recoveryDeadline: Type.Union([ProgressTime, Type.Null()]),
  measurement: Type.Union([MeasurementSchema, Type.Null()]),
  priorAttempts: Type.Array(progressObject({
    attempt: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    state: TaskStateSchema,
    updatedAt: ProgressTime,
  }), { maxItems: MAX_PROGRESS_MILESTONES }),
  resultRef: Type.Optional(ProgressId),
});

export type ProgressRecord<D> = Readonly<Omit<Static<typeof RecordSchema>, 'measurement'> & {
  measurement: Measurement<D> | null;
}>;
export type DetailValidator<D> = (kind: ProgressKind, details: unknown) => details is D;

export function progressTaskKey(task: Pick<TaskRef, 'projectId' | 'invocationId' | 'taskId'>): string {
  return createHash('sha256').update(JSON.stringify([task.projectId, task.invocationId, task.taskId])).digest('hex');
}

export function decodeProgressRecord<D>(bytes: string, validateDetails: DetailValidator<D>): ProgressRecord<D> {
  if (Buffer.byteLength(bytes) > MAX_PROGRESS_RECORD_BYTES) throw new Error('progress record exceeds size limit');
  const value: unknown = JSON.parse(bytes);
  if (!Value.Check(RecordSchema, value)) throw new Error('invalid progress record');
  const { measurement, retention, state, owner, priorAttempts, task } = value;
  if ((retention === 'terminal') !== isTerminalTaskState(state) ||
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
  if (measurement !== null) {
    const units = new Set(measurement.counts.map(count => count.unit));
    if (!validateDetails(measurement.kind, measurement.details) ||
        units.size !== measurement.counts.length ||
        measurement.counts.some(count => count.total !== null && count.completed > count.total) ||
        (measurement.lastMeaningfulAt !== null && measurement.lastMeaningfulAt > measurement.measuredAt) ||
        Buffer.byteLength(JSON.stringify(measurement)) > MAX_PROGRESS_SNAPSHOT_BYTES ||
        measurement.milestones.length + priorAttempts.length > MAX_PROGRESS_MILESTONES) {
      throw new Error('invalid or oversized progress measurement');
    }
  }
  return value as ProgressRecord<D>;
}
