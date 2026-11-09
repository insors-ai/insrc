import { Type } from '@sinclair/typebox';
import type { Static, TProperties } from '@sinclair/typebox';

export const MAX_PROGRESS_SNAPSHOT_BYTES = 8 * 1024;
export const MAX_PROGRESS_MILESTONES = 32;

export const progressObject = <T extends TProperties>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });

export const ProgressId = Type.String({ minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' });
export const ProgressSequence = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
export const ProgressTime = Type.Integer({ minimum: 0, maximum: 8_640_000_000_000_000 });
export const ProgressLabel = Type.String({ minLength: 1, maxLength: 256, pattern: '^[^\\x00-\\x1f\\x7f]+$' });
const optionalId = Type.Optional(ProgressId);
const nullableTime = Type.Union([ProgressTime, Type.Null()]);

export const TaskRefSchema = progressObject({
  projectId: ProgressId,
  invocationId: ProgressId,
  taskId: ProgressId,
  attempt: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
});
export type TaskRef = Static<typeof TaskRefSchema>;

export const TaskOriginSchema = progressObject({
  extensionChatId: optionalId,
  daemonSessionId: optionalId,
  nativeSessionId: optionalId,
  turnId: optionalId,
});
export type TaskOrigin = Static<typeof TaskOriginSchema>;

export const TaskOwnerFenceSchema = progressObject({
  ownerId: ProgressId,
  ownerEpoch: ProgressId,
  ownerSequence: ProgressSequence,
});
export type TaskOwnerFence = Static<typeof TaskOwnerFenceSchema>;

export const ProgressKindSchema = Type.Union([
  Type.Literal('workflow'), Type.Literal('analysis'), Type.Literal('design-review'),
  Type.Literal('code-review'), Type.Literal('test'),
]);
export type ProgressKind = Static<typeof ProgressKindSchema>;

export const TaskStateSchema = Type.Union([
  Type.Literal('queued'), Type.Literal('running'), Type.Literal('waiting'), Type.Literal('paused'),
  Type.Literal('completed'), Type.Literal('failed'), Type.Literal('cancelled'),
  Type.Literal('interrupted'), Type.Literal('unknown'),
]);
export type TaskState = Static<typeof TaskStateSchema>;

export function isTerminalTaskState(state: TaskState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

export const MeasuredCountSchema = progressObject({
  unit: ProgressId,
  completed: ProgressSequence,
  total: Type.Union([ProgressSequence, Type.Null()]),
});
export type MeasuredCount = Static<typeof MeasuredCountSchema>;

export const MeasurementSchema = progressObject({
  kind: ProgressKindSchema,
  measuredAt: ProgressTime,
  meaningfulRevision: ProgressSequence,
  lastMeaningfulAt: nullableTime,
  phase: ProgressLabel,
  activeUnit: Type.Union([ProgressLabel, Type.Null()]),
  counts: Type.Array(MeasuredCountSchema, { maxItems: 16 }),
  milestones: Type.Array(ProgressLabel, { maxItems: MAX_PROGRESS_MILESTONES }),
  controls: Type.Array(Type.Literal('cancel'), { maxItems: 1 }),
  details: Type.Unknown(),
});

export type Measurement<D> = Readonly<Omit<Static<typeof MeasurementSchema>, 'details'> & { details: D }>;
type TimedMeasurement<D> = Omit<Measurement<D>, 'measuredAt' | 'lastMeaningfulAt'> & Readonly<{
  measuredAt: string;
  lastMeaningfulAt: string | null;
}>;
export type DelegateMeasurement<D> = TimedMeasurement<D> & Readonly<{ task: TaskRef; owner: TaskOwnerFence }>;
export type DeliveredMeasurement<D> = TimedMeasurement<D> & Readonly<{ task: TaskRef }>;

export interface TaskProgressDelegate<D extends { readonly kind: ProgressKind }> {
  progress(task: TaskRef, signal?: AbortSignal): Promise<DelegateMeasurement<D> | null>;
  /** Local executor liveness check. Returns its next owner sequence or null. */
  ownerActivity?(task: TaskRef, signal: AbortSignal): Promise<number | null>;
  /** Ask the verified executor to stop. A receipt does not certify termination. */
  cancel?(task: TaskRef, requestId: string): Promise<void>;
}

export interface ProgressSnapshot<D> {
  readonly task: TaskRef;
  readonly cursor: string;
  readonly state: TaskState;
  readonly freshness: 'live' | 'stale' | 'unavailable';
  readonly measurement: DeliveredMeasurement<D> | null;
  readonly lastOwnerActivityAt: string | null;
  readonly workerHealth: 'alive' | 'lost' | 'unknown';
  readonly cancellation: 'none' | 'pending';
  readonly resultRef?: string | undefined;
}

export interface ObservationReply<D> {
  readonly snapshot: ProgressSnapshot<D>;
  readonly disposition: 'changed' | 'unchanged' | 'resync';
  readonly schedule: 'native' | 'scheduled' | 'suspended' | 'stopped';
  readonly nextPollNotBefore?: string | undefined;
}
