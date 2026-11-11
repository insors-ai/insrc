import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocsReviewClient } from '../docs-review-client.js';
import { isReviewWorkerStatus,reviewProgressLabel } from '../../../../src/shared/review-worker-progress.js';
import type { ReviewWorkerStatus } from '../../../../src/shared/review-worker-progress.js';
import type { IpcClient } from '../../../../src/shared/ipc-client.js';

test('admission DTOs render preparing or failure without empty success',async()=>{
 const progress:ReviewWorkerStatus={project:'/repo',family:'code',reviewId:'review-1',attempt:2,status:'pending',phase:'scope_preparation',completed:0,total:0,task:null,executionId:'pinned-execution',observedAt:'2026-11-11T00:00:00.000Z',freshness:'live',admission:{validation:'unverified',state:'pending',stage:'scope_preparation'}};
 const client={rpc:async()=>({artifactId:'LLD-x-s1',kind:'LLD',renderedMarkdown:'# Body',openQuestions:[],approvable:true,docPath:'docs/LLD.md',contentVersion:'version',reviewer:{name:'fixture'},state:'pending',reviewProgress:progress})} as unknown as IpcClient;
 const content=await createDocsReviewClient(client,{repo:()=>'/repo'}).content('docs/LLD.md');
 assert.equal(content.reviewProgress,progress);assert.ok(isReviewWorkerStatus(progress));assert.equal(reviewProgressLabel(progress),'Preparing review');
 assert.equal(content.reviewProgress!.total,0);assert.equal(content.reviewProgress!.task,null);assert.equal(content.reviewProgress!.executionId,'pinned-execution');
 const failed={...progress,status:'failed' as const,admission:{...progress.admission!,state:'failed' as const,error:{code:'qualification_failed',summary:'Pinned source could not be read'}}};
 assert.equal(reviewProgressLabel(failed),'Technical admission failure: Pinned source could not be read');
 const completed={...progress,status:'passed' as const,completed:1,total:1};delete completed.admission;
 assert.equal(reviewProgressLabel(completed),'Review passed');
 const planning={...completed,status:'running' as const,family:'design' as const,phase:'planning',completed:0,total:0};assert.equal(reviewProgressLabel(planning),'Preparing review');
 assert.equal(isReviewWorkerStatus({...progress,total:-1}),false);
});
