import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { Value } from '@sinclair/typebox/value';
import { buildInsrcMcpServerWithRegistry } from '../server.js';
import { handleInsrcSchema } from '../schema/handler.js';
import { CODE_REVIEW_INPUT } from '../code-review/schema.js';
import { DESIGN_REVIEW_INPUT } from '../design-review/schema.js';
import { ReviewCancellationRequestSchema, ReviewCancellationReceiptSchema } from '../../shared/review-preparation.js';
import { MAIN_DAEMON_TASK_REVIEW_METHODS, MAIN_DAEMON_DESIGN_REVIEW_METHODS } from '../../daemon/threads/method-class.js';
import { handleTaskReviewStep } from '../../daemon/steps/task-review-step.js';

test('both registered MCP review schemas expose main-owned cancellation with pointed bounded input',async()=>{
 const built=buildInsrcMcpServerWithRegistry();
 try{
  for(const tool of ['insrc_code_review_step','insrc_review_step']){
   const result=handleInsrcSchema({tool,phase:'cancel'},built.schemaRegistry);assert.ok(!('error'in result));assert.ok(result.validPhases?.includes('cancel'));
   const text=JSON.stringify(result.schema);assert.match(text,/reason/);
  }
  const common={phase:'cancel',repo:'/repo',reviewId:'review-1',attempt:1,reason:'User stopped this review'};
  assert.equal(z.object(CODE_REVIEW_INPUT).strict().safeParse({...common,epicHash:'a'.repeat(16)}).success,true);
  assert.equal(z.object(DESIGN_REVIEW_INPUT).strict().safeParse(common).success,true);
  assert.equal(Value.Check(ReviewCancellationRequestSchema,common),true);
  for(const patch of [{reason:''},{reason:'x'.repeat(2049)},{actionId:'client-supplied-action'},{attempt:0},{pid:123},{resourceRecovery:{}}])assert.equal(Value.Check(ReviewCancellationRequestSchema,{...common,...patch}),false);
  assert.ok(MAIN_DAEMON_TASK_REVIEW_METHODS.has('codeReview.task.cancel'));assert.ok(MAIN_DAEMON_DESIGN_REVIEW_METHODS.has('designReview.cancel'));
  await assert.rejects(handleTaskReviewStep({...common,epicHash:'a'.repeat(16),packet:{}}),/Unexpected field/);
  const receipt={key:{project:'/repo',family:'design',reviewId:'review-1'},attempt:1,actionId:'cancel-1',requestedAt:'2026-11-14T00:00:00.000Z',operationState:'stopped'};
  assert.equal(Value.Check(ReviewCancellationReceiptSchema,receipt),true);assert.equal(Value.Check(ReviewCancellationReceiptSchema,{...receipt,operationState:'passed'}),false);
 }finally{await built.server.close();}
});
