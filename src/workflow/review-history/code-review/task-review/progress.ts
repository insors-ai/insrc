/** Read-only historical review compatibility. No live review execution. */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
const count = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const timestamp = Type.Union([Type.String({ minLength: 20, maxLength: 30, pattern: '^\\d{4}-\\d{2}-\\d{2}T.*Z$' }), Type.Null()]);
export const ProgressSchema = Type.Object({
    schemaVersion: Type.Literal(1), executionId: Type.String({ minLength: 1, maxLength: 128 }), sequence: count,
    phase: Type.Union((['scope_preparation', 'task_review', 'tool_running', 'test_execution', 'feedback_persistence', 'cr_publication', 'complete', 'interrupted', 'error'] as const).map(value => Type.Literal(value))),
    task: Type.Union([Type.Object({ id: Type.String({ minLength: 1, maxLength: 256 }), name: Type.String({ maxLength: 256 }), position: count, total: count }, { additionalProperties: false }), Type.Null()]),
    completedTasks: count, reviewElapsedMs: count, taskElapsedMs: Type.Union([count, Type.Null()]),
    observedAt: timestamp, lastMeaningfulActivityAt: timestamp,
    processState: Type.Union([Type.Literal('alive'), Type.Literal('exited'), Type.Literal('unknown')]), lastProcessObservedAt: timestamp,
    activeToolCount: Type.Integer({ minimum: 0, maximum: 128 }),
}, { additionalProperties: false });
export type ReviewProgress = Static<typeof ProgressSchema>;
