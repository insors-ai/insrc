import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { createReviewBudgetPolicy, ReviewBudgetError } from '../budget.js';
import { createReviewJob } from '../job.js';
import { runReviewJob } from '../driver.js';
import { atom, toyAdapter, toySnapshot } from './toy-adapter.js';
import type { LLMProvider, StructuredSchema } from '../../../shared/types.js';
import type { ReviewAdapter } from '../types.js';
import type { ReviewCallEvent } from '../call-events.js';
import { reviewTimeoutMessage } from '../../../shared/review-failure.js';
import { appendReviewRunEvent } from '../../code-review/run-events.js';
import { controllerObservedEvent } from '../controller.js';
import { requestBudget } from '../measurement.js';

test('throwing lifecycle observers cannot change results or replace the exact budget error', async () => {
 const snapshot=toySnapshot([atom(1)]), adapter=toyAdapter(snapshot) as ReviewAdapter<unknown>;
 const profile=new CliProvider({kind:'codex',model:'fixture'}).getReviewBudgetProfile('structured');
 const policy=createReviewBudgetPolicy(profile,'structured');
 const job=createReviewJob(adapter,'daemon',snapshot,384000,{budgetPolicy:policy});
 const provider={getReviewBudgetProfile:()=>profile,completeStructured:async(_m:unknown,schema:StructuredSchema)=>({callId:(schema as {properties:{callId:{const:string}}}).properties.callId.const,answer:{seen:['a1']}})} as unknown as LLMProvider;
 assert.deepEqual((await runReviewJob(job,adapter,provider,{onCallEvent:()=>{throw new Error('observer');}}) as {seen:string[]}).seen,['a1']);
 const error=new ReviewBudgetError('dispatch-budget-exceeded',job.pending[0]!.budget);
 await assert.rejects(()=>runReviewJob(job,adapter,{...provider,completeStructured:async()=>{throw error;}} as LLMProvider,{onCallEvent:()=>{throw new Error('observer');}}),e=>e===error);
 const event=controllerObservedEvent(job,job.pending[0]!,{frameStartedAt:100,frameAttemptMs:600000},'success',450);
 assert.equal(event.durationMs,350); assert.equal(event.timing.currentBudgetChunkCount,1); assert.equal(event.timing.totalBudgetMs,600000);
});

test('run outcomes remain append-only canonical evidence without converting other timeout categories to job timeouts',()=>{
 const repo=mkdtempSync(join(tmpdir(),'review-run-events-'));
 try {
  const snapshot=toySnapshot([atom(1)]),adapter=toyAdapter(snapshot) as ReviewAdapter<unknown>;
  const profile=new CliProvider({kind:'codex',model:'fixture'}).getReviewBudgetProfile('structured');
  const job=createReviewJob(adapter,'daemon',snapshot,384000,{budgetPolicy:createReviewBudgetPolicy(profile,'structured')});
  const event=controllerObservedEvent(job,job.pending[0]!,{},'start',100);
  appendReviewRunEvent(repo,'cr-fixture',event);appendReviewRunEvent(repo,'cr-fixture',{...event,event:'failure'});
  assert.deepEqual(readFileSync(join(repo,'.insrc/review-runs/cr-fixture.jsonl'),'utf8').trim().split('\n').map(line=>(JSON.parse(line) as ReviewCallEvent).event),['start','failure']);
  assert.throws(()=>appendReviewRunEvent(repo,'../../outside',event));
  for(const timeoutKind of ['review-attempt','review-stage','external-review-transport']) assert.equal(reviewTimeoutMessage({timeoutKind,timing:{logicalWorkUnits:5,jobBudgetMs:3000000}}),timeoutKind);
 } finally {rmSync(repo,{recursive:true,force:true});}
});

test('review session validation rejects unsupported original blocks before flattening',()=>{
 const profile={...new CliProvider({kind:'codex',model:'fixture'}).getReviewBudgetProfile('reviewer-session'),providerId:'fixture-ollama',promptDialect:'ollama-chat-v1' as const};
 const policy=createReviewBudgetPolicy(profile,'reviewer-session');
 assert.throws(()=>requestBudget(policy,[{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/png',data:'private'}}]}] as never,{type:'object'},'dispatch'),e=>e instanceof ReviewBudgetError && e.code==='native-budget-unqualified');
});
