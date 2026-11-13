/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import { reviewWorkerCheckpoint } from './review-worker-contract.js';
import type { ReviewBootstrapInput } from './review-worker-contract.js';
import type { ReviewWorkerStatus } from '../../shared/review-worker-progress.js';
import { isReviewWorkerStatus } from '../../shared/review-worker-progress.js';
import { parseProgressView } from '../../workflow/code-review/task-review/progress-view.js';
import type { ReviewProgressView } from '../../workflow/code-review/task-review/progress-view.js';
import type { DesignObservation } from '../../workflow/review/design-review/progress.js';
import { DesignProgressSchema,DesignPublicationSchema,DesignReportSchema,DESIGN_LIMITS,decodeDesign } from '../../workflow/review/design-review/contracts.js';
/** Keep existing family DTOs. Design feedback pages are read separately from
 * the durable checkpoint; the cache carries progress only. */
const designObservationSchema=Type.Object({...DesignProgressSchema.properties,
 publication:Type.Optional(DesignPublicationSchema),source:Type.Optional(Type.Union([Type.Literal('history'),Type.Literal('checkpoint')])),
 guidance:Type.String({minLength:1,maxLength:DESIGN_LIMITS.text}),completedResults:Type.Array(Type.Unknown(),{maxItems:1}),nextCompletedChunk:Type.Integer({minimum:0,maximum:DESIGN_LIMITS.chunks}),
 report:Type.Optional(Type.Pick(DesignReportSchema,['reviewId','attempt','artifactId','status','counts','reviewer','reviewedContentIdentity'],{additionalProperties:false})),
 failure:Type.Optional(Type.Object({code:Type.String({minLength:1,maxLength:256}),summary:Type.String({minLength:1,maxLength:DESIGN_LIMITS.text}),field:Type.Optional(Type.String({minLength:1,maxLength:256}))},{additionalProperties:false})),
 admission:Type.Optional(Type.Object({validation:Type.Literal('unverified')},{additionalProperties:false})),
},{additionalProperties:false});
export type ReviewObservation=ReviewProgressView|DesignObservation;
export interface ReviewProgressPublication {readonly kind:'review-progress';readonly key:ReviewBootstrapInput['key'];readonly incarnation:string;readonly attempt:number;readonly sequence:number;readonly observation:ReviewObservation;readonly display:ReviewWorkerStatus;}
export function reviewProgressPublication(input:ReviewBootstrapInput,sequence:number,value:ReviewObservation):ReviewProgressPublication{
 const code=input.key.family==='code',c=code?parseProgressView(value):undefined;
 if(c&&(c.reviewId!==input.key.reviewId||c.attempt!==input.attempt))throw new Error('Foreign code progress identity');
 const d=code?undefined:decodeDesign(designObservationSchema,value) as DesignObservation;
 if(d&&(d.checkpointPath!==reviewWorkerCheckpoint(input.key)||d.report&&(d.report.reviewId!==input.key.reviewId||d.report.attempt!==input.attempt)))throw new Error('Foreign design progress identity');
 const admission=c?.admission??d?.admission,error=c?.admission?.error??d?.failure;
 const status=c?.status??d!.status;
 if(admission&&(!['pending','running','failed','interrupted'].includes(status)||c&&(c.totalTasks!==0||c.completedTasks!==0||c.progress?.task!==null)))throw new Error('Unverified admission cannot claim reviewed work or a passing result');
 const phase=c?.progress?.phase??(code?(c?.executionState==='active'&&c.crPublication==='pending'&&c.totalTasks>0&&c.completedTasks===c.totalTasks?'cr_publication':'scope_preparation'):d!.phase);
 const display:ReviewWorkerStatus={project:input.key.project,family:input.key.family,reviewId:input.key.reviewId,attempt:c?.attempt??input.attempt,status,phase,
 completed:c?.completedTasks??d!.completedChunks,total:c?.totalTasks??d!.totalChunks,observedAt:c?.progress?.observedAt??d?.observedAt??new Date().toISOString(),freshness:'live',
 ...(admission?{admission:{validation:'unverified' as const,state:status==='failed'?'failed' as const:status==='interrupted'?'interrupted' as const:status==='running'?'validating' as const:'pending' as const,stage:phase,...(error?{error:{code:error.code.slice(0,256),summary:error.summary.slice(0,2048)}}:{})}}:{}),
 ...(code?{task:c?.progress?.task??null,...(c?.progress?.executionId?{executionId:c.progress.executionId}:{})}:d?.executionId?{executionId:d.executionId}:{}),};
 if(!isReviewWorkerStatus(display))throw new Error('Invalid bounded worker progress');
 const observation:ReviewObservation=code?c!:{...d!,completedResults:[],nextCompletedChunk:0};
 return{kind:'review-progress',key:input.key,incarnation:input.incarnation,attempt:display.attempt,sequence,observation,display};
}
