import { z } from 'zod';
import { structural } from '../structural-schema.js';
import { PacketSchema, TaskResultSchema } from '../../workflow/code-review/task-review/contracts.js';
import { ReassessmentSchema, AttributionSchema } from '../../workflow/code-review/task-review/assessment.js';
import { DiagnosticSnapshotSchema } from '../../workflow/code-review/task-review/diagnostic-schema.js';

export const CODE_REVIEW_PHASES = ['start','resume','progress','publish','assignment','scope','activity','result'] as const;
const activity=z.object({sessionId:z.string().min(1),sequence:z.number().int().positive(),kind:z.enum(['session_started','model_output','tool_started','tool_completed','feedback_submitted','heartbeat']),toolId:z.string().optional()}).strict();
export const CODE_REVIEW_INPUT = {
 phase:z.enum(CODE_REVIEW_PHASES),repo:z.string().optional(),epicHash:z.string().regex(/^[a-f0-9]{16}$/),reviewId:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),attempt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
 packet:structural(PacketSchema).optional(),scope:z.union([structural(AttributionSchema),structural(ReassessmentSchema)]).optional(),result:structural(TaskResultSchema).optional(),
 taskId:z.string().optional(),executionId:z.string().optional(),sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
 event:z.union([activity,z.object({kind:z.literal('diagnostic'),phase:z.enum(['attribution','assessment']),diagnostic:structural(DiagnosticSnapshotSchema)}).strict()]).optional(),
};
