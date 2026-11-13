/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
const text=Type.String({minLength:1,maxLength:256}),count=Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER});
/** Bounded display/observation data only; never findings, commands or authority. */
export const ReviewWorkerStatusSchema=Type.Object({
 project:Type.String({minLength:1,maxLength:4096}),family:Type.Union([Type.Literal('code'),Type.Literal('design')]),
 reviewId:text,attempt:Type.Integer({minimum:1,maximum:Number.MAX_SAFE_INTEGER}),
 status:Type.Union((['pending','running','passed','changes_requested','incomplete','failed','interrupted','paused','invalidated'] as const).map(s=>Type.Literal(s))),
 phase:text,completed:count,total:count,observedAt:text,freshness:Type.Union([Type.Literal('live'),Type.Literal('stale')]),
 admission:Type.Optional(Type.Object({validation:Type.Literal('unverified'),state:Type.Union((['pending','validating','failed','interrupted'] as const).map(s=>Type.Literal(s))),stage:text,
 error:Type.Optional(Type.Object({code:text,summary:Type.String({minLength:1,maxLength:2048})},{additionalProperties:false}))},{additionalProperties:false})),
 task:Type.Optional(Type.Union([Type.Null(),Type.Object({id:text,name:Type.String({maxLength:256}),position:count,total:count},{additionalProperties:false})])),
 executionId:Type.Optional(text),
},{additionalProperties:false});
export type ReviewWorkerStatus=Static<typeof ReviewWorkerStatusSchema>;
export function isReviewWorkerStatus(value:unknown):value is ReviewWorkerStatus{return Value.Check(ReviewWorkerStatusSchema,value)&&Number.isFinite(Date.parse(value.observedAt))&&value.completed<=value.total;}
export function reviewProgressLabel(value:ReviewWorkerStatus):string{
 if(value.admission)return value.admission.state==='failed'?`Technical admission failure: ${value.admission.error?.summary??'Review preparation failed'}`:value.admission.state==='interrupted'?'Review preparation interrupted':'Preparing review';
 if(value.status==='failed')return 'Review failed';
 if(value.status==='interrupted')return 'Review interrupted';
 if(value.status==='paused')return 'Review paused';
 if(value.status==='invalidated')return 'Reviewed artifact changed';
 if(['passed','changes_requested','incomplete'].includes(value.status))return `Review ${value.status.replaceAll('_',' ')}`;
 if(value.total===0)return 'Preparing review';
 return `Reviewing: ${value.completed}/${value.total}`;
}
