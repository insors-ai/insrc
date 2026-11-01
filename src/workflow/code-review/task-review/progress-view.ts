/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { ProgressSchema } from './progress.js';
import { decodeReview } from './contracts.js';
const count=Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER});
export const ProgressViewSchema=Type.Object({
 reviewId:Type.String({minLength:1,maxLength:128}),attempt:Type.Integer({minimum:1,maximum:Number.MAX_SAFE_INTEGER}),
 status:Type.Union((['pending','running','passed','changes_requested','incomplete','failed'] as const).map(v=>Type.Literal(v))),
 crPublication:Type.Union([Type.Literal('pending'),Type.Literal('complete')]),
 completedTasks:count,totalTasks:count,interrupted:Type.Boolean(),hasError:Type.Boolean(),
 freshness:Type.Union([Type.Literal('live'),Type.Literal('stale'),Type.Literal('unknown')]),
 progress:Type.Union([ProgressSchema,Type.Null()]),
 warning:Type.Optional(Type.Literal('progress_persistence_failed')),
},{additionalProperties:false});
export type ReviewProgressView=Static<typeof ProgressViewSchema>;
export const parseProgressView=(value:unknown):ReviewProgressView=>decodeReview(ProgressViewSchema,value);
