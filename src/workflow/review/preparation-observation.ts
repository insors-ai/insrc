/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { ProgressSchema } from '../code-review/task-review/progress.js';
import { DesignProgressSchema, DesignAttemptSchema, DesignAdmissionAttemptSchema } from './design-review/contracts.js';
const current = Type.Required(Type.Pick(DesignAttemptSchema, ['current'])).properties.current;
export const PreparationObservationSchema = Type.Union([
 Type.Object({ family: Type.Literal('code'), attempt: Type.Integer({ minimum: 1 }), progress: ProgressSchema,
  activeTaskId: Type.Union([Type.String({ minLength: 1, maxLength: 256 }), Type.Null()]) }, { additionalProperties: false }),
 Type.Object({ family: Type.Literal('design'), attempt: Type.Integer({ minimum: 1 }),
  progress: Type.Union([DesignProgressSchema, DesignAdmissionAttemptSchema.properties.progress]),
  current: Type.Union([current, Type.Null()]) }, { additionalProperties: false }),
]);
export type PreparationObservation = Static<typeof PreparationObservationSchema>;
export const PREPARATION_OBSERVATION_MAX_BYTES = 64 * 1024;
