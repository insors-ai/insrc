import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { MeasuredCountSchema, ProgressSequence, progressObject } from '../../shared/task-progress.js';
import type { ProgressKind } from '../../shared/task-progress.js';
import { validateExecutorDetails } from './executor-measurements.js';
import type { ExecutorDetails } from './executor-measurements.js';

const target = Type.String({ minLength: 1, maxLength: 2048, pattern: '^[^\\x00-\\x1f\\x7f]+$' });
const nullableCount = Type.Union([MeasuredCountSchema, Type.Null()]);
const nullableNumber = Type.Union([ProgressSequence, Type.Null()]);

export const DesignReviewDetailsSchema = progressObject({
  kind: Type.Literal('design-review'),
  target,
  checks: nullableCount,
  freshChunks: nullableCount,
  retainedChunks: nullableNumber,
  retries: nullableNumber,
});
export const CodeReviewDetailsSchema = progressObject({
  kind: Type.Literal('code-review'),
  target,
  initial: nullableCount,
  followUp: nullableCount,
  retries: nullableNumber,
  publication: Type.Union([
    Type.Literal('pending'), Type.Literal('complete'), Type.Literal('failed'), Type.Literal('unknown'),
  ]),
});
export type DesignReviewDetails = Static<typeof DesignReviewDetailsSchema>;
export type CodeReviewDetails = Static<typeof CodeReviewDetailsSchema>;
export type ReviewDetails = DesignReviewDetails | CodeReviewDetails;

export function validateReviewDetails(kind: ProgressKind, value: unknown): value is ReviewDetails {
  if (kind === 'design-review') return Value.Check(DesignReviewDetailsSchema, value);
  if (kind === 'code-review') return Value.Check(CodeReviewDetailsSchema, value);
  return false;
}

/** Read-only validation of historical task rows alongside ordinary executor details. */
export type AllTaskDetails = ExecutorDetails | ReviewDetails;
export function validateAllDetails(kind: ProgressKind, value: unknown): value is AllTaskDetails {
  return validateExecutorDetails(kind, value) || validateReviewDetails(kind, value);
}

