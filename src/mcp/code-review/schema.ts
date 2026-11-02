import { z } from 'zod';
import type { TSchema } from '@sinclair/typebox';
import { PacketSchema, TaskResultSchema } from '../../workflow/code-review/task-review/contracts.js';
import { ReassessmentSchema, AttributionSchema } from '../../workflow/code-review/task-review/assessment.js';
import { DiagnosticSnapshotSchema } from '../../workflow/code-review/task-review/diagnostic-schema.js';

/** Advertise the same bounded structural schemas the task host enforces. */
function structural(schema: TSchema): z.ZodTypeAny {
 let output: z.ZodTypeAny;
 if (schema.const !== undefined) output = z.literal(schema.const);
 else if (schema.anyOf) output = z.union(schema.anyOf.map((entry: TSchema) => structural(entry)) as [z.ZodTypeAny,z.ZodTypeAny,...z.ZodTypeAny[]]);
 else if (schema.type === 'object') {
  const required = new Set(schema.required ?? []);
  const fields = Object.fromEntries(Object.entries(schema.properties as Record<string,TSchema>).map(([name,child]) => [name, required.has(name) ? structural(child) : structural(child).optional()]));
  output = schema.additionalProperties === false ? z.object(fields).strict() : z.object(fields);
 } else if (schema.type === 'array') {
  if (Array.isArray(schema.items)) output = z.tuple(schema.items.map((entry: TSchema) => structural(entry)) as [z.ZodTypeAny,...z.ZodTypeAny[]]);
  else { let array = z.array(structural(schema.items)); if (schema.minItems !== undefined) array = array.min(schema.minItems); if (schema.maxItems !== undefined) array = array.max(schema.maxItems); output = array; }
 } else if (schema.type === 'string') {
  let text = z.string(); if(schema.minLength!==undefined)text=text.min(schema.minLength);if(schema.maxLength!==undefined)text=text.max(schema.maxLength);if(schema.pattern)text=text.regex(new RegExp(schema.pattern));output=text;
 } else if (schema.type === 'integer' || schema.type === 'number') {
  let number=z.number();if(schema.type==='integer')number=number.int();if(schema.minimum!==undefined)number=number.min(schema.minimum);if(schema.maximum!==undefined)number=number.max(schema.maximum);output=number;
 } else if(schema.type==='boolean')output=z.boolean();
 else if(schema.type==='null')output=z.null();
 else throw new Error('Unsupported task review structural schema');
 return schema.description ? output.describe(schema.description) : output;
}
export const CODE_REVIEW_PHASES = ['start','resume','progress','publish','assignment','scope','activity','result'] as const;
const activity=z.object({sessionId:z.string().min(1),sequence:z.number().int().positive(),kind:z.enum(['session_started','model_output','tool_started','tool_completed','feedback_submitted','heartbeat']),toolId:z.string().optional()}).strict();
export const CODE_REVIEW_INPUT = {
 phase:z.enum(CODE_REVIEW_PHASES),repo:z.string().optional(),epicHash:z.string().regex(/^[a-f0-9]{16}$/),reviewId:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/),attempt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
 packet:structural(PacketSchema).optional(),scope:z.union([structural(AttributionSchema),structural(ReassessmentSchema)]).optional(),result:structural(TaskResultSchema).optional(),
 taskId:z.string().optional(),executionId:z.string().optional(),sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
 event:z.union([activity,z.object({kind:z.literal('diagnostic'),phase:z.enum(['attribution','assessment']),diagnostic:structural(DiagnosticSnapshotSchema)}).strict()]).optional(),
};
