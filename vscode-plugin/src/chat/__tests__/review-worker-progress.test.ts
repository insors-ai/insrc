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

test('preparation DTO preserves nullable totals and separate cancellation states',()=>{
 const progress:ReviewWorkerStatus={project:'/repo',family:'code',reviewId:'review-1',attempt:1,status:'pending',phase:'scope_preparation',completed:0,total:0,observedAt:'2026-11-14T00:00:00.000Z',freshness:'live',preparation:{stage:'fetch_sources',logicalCompleted:2,physicalCompleted:1,cacheHits:1,bytes:123,total:null,elapsedMs:250}};
 assert.equal(isReviewWorkerStatus(progress),true);assert.equal(reviewProgressLabel(progress),'Preparing review: fetch sources (2)');
 assert.equal(reviewProgressLabel({...progress,preparation:{...progress.preparation!,total:5}}),'Preparing review: fetch sources (2/5)');
 for(const [operationState,label] of [['cancelling','Cancelling review'],['stopped','Review stopped'],['resource_fenced','Review stopped; resource clearance required']] as const)assert.equal(reviewProgressLabel({...progress,operationState}),label);
 assert.equal(isReviewWorkerStatus({...progress,operationState:'cancelled'}),false);
 assert.equal(isReviewWorkerStatus({...progress,preparation:{...progress.preparation!,total:1}}),false);
 assert.equal(progress.status,'pending','cancellation presentation does not manufacture an assessment verdict');
});
