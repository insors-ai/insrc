import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { z } from 'zod';
import { buildHandlerRuntime } from '../handler-runtime.js';
import { createStepCallHandler, stepToolTable } from '../steps/host.js';
import { CodeReviewConnections } from '../../mcp/code-review/handler.js';
import { DesignReviewConnections } from '../../mcp/design-review/handler.js';
import { CODE_REVIEW_INPUT, CODE_REVIEW_PHASES } from '../../mcp/code-review/schema.js';
import { DESIGN_REVIEW_INPUT, DESIGN_REVIEW_PHASES } from '../../mcp/design-review/schema.js';

const design = ['start','cancel','progress','assignment','plan','impact','activity','result','recover','failure'].map(p=>`designReview.${p}`);
const code = ['cleanup','cancel','progress','publish','start','activity','assignment','scope','result'].map(p=>`codeReview.task.${p}`);
const methods = [...design,...code,'codeReview.grounding','codeReview.freshness','codeReview.run','workflow.review','workflow.reviewArtifact','workflow.resolveFinding'];
const message = (code: boolean) => `${code ? 'Code' : 'Design'} review functionality is being rewritten.`;
const untouched = (): never => { throw new Error('Unavailable review reached a dependency'); };
function dependency(): never { return new Proxy({}, {get: untouched}) as never; }
function hash(value: unknown): string {
 const stable=JSON.stringify(value,(_key,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 return createHash('sha256').update(stable).digest('hex');
}

test('all preserved review operations and MCP phases return exact rewrite errors without review state', async () => {
 const runtime=buildHandlerRuntime({db:dependency(),configStore:dependency(),queue:dependency(),indexer:dependency(),startedAt:0,shutdown:untouched,attachedClients:()=>[],understandingService:()=>undefined});
 const registered=[...Object.keys(runtime.rpcHandlers),...Object.keys(runtime.streamHandlers)].filter(n=>n.startsWith('designReview.')||n.startsWith('codeReview.')||['workflow.review','workflow.reviewArtifact','workflow.resolveFinding'].includes(n));
 assert.deepEqual(registered.sort(),methods.sort());
 assert.equal(methods.length,25);
 assert.equal(typeof runtime.rpcHandlers['workflow.reviewDecision'],'function');
 const params=dependency();
 for(const method of methods){
  const unary=runtime.rpcHandlers[method];
  if(unary)await assert.rejects(async()=>unary(params),{message:message(method.startsWith('codeReview.'))});
  else await assert.rejects(async()=>runtime.streamHandlers[method]!(params,untouched,new AbortController().signal),{message:message(method.startsWith('codeReview.'))});
 }
 const table=stepToolTable();
 const host=createStepCallHandler(table,{registeredRepos:async()=>untouched()});
 for(const [name,phases,isCode] of [['insrc_review_step',DESIGN_REVIEW_PHASES,false],['insrc_code_review_step',CODE_REVIEW_PHASES,true]] as const){
  for(const phase of phases){
   const raw={phase,reviewId:'frozen-review',attempt:1,epicHash:'dae67bfc7da310cc'};
   await assert.rejects(async()=>table[name]!(raw,new AbortController().signal),{message:message(isCode)});
   const frames:unknown[]=[];
   await host({tool:name,args:params,context:{cwd:'/missing/repository'}},frame=>frames.push(frame),new AbortController().signal);
   assert.deepEqual(frames,[{id:0,stream:'error',data:{code:'step-failed',error:message(isCode),recoverable:false}}]);
  }
 }
 // Frozen before implementation: rebuilding the schemas cannot weaken the public contract.
 assert.equal(hash(z.toJSONSchema(z.object(DESIGN_REVIEW_INPUT))),'0242375ebb054fb9f543f29d3b506e96b2c05a2ab0992b3d8c86cbf470330c51');
 assert.equal(hash(z.toJSONSchema(z.object(CODE_REVIEW_INPUT))),'d72b392aea76c770f6bb02e242e6971c31aca4c742104622cb1dab2b44079712');
});

test('repeated unavailable MCP calls allocate no connections and preserve error envelopes', async () => {
 const deps={connect:untouched,resolveRepo:async()=>untouched()};
 for(const [owner,phases,isCode,shape] of [[new DesignReviewConnections(deps),DESIGN_REVIEW_PHASES,false,DESIGN_REVIEW_INPUT],[new CodeReviewConnections(deps),CODE_REVIEW_PHASES,true,CODE_REVIEW_INPUT]] as const){
  for(let repetition=0;repetition<3;repetition++)for(const phase of phases){
   const input={phase,reviewId:'frozen-review',attempt:1,...(isCode?{epicHash:'dae67bfc7da310cc'}:{})};
   assert.equal(z.object(shape).safeParse(input).success,true);
   const result=await owner.call(input,'codex');
   assert.equal(result.isError,true);
   const error=JSON.parse(result.content[0]!.text).error;
   assert.equal(error.message,message(isCode));
   assert.equal(error.code,'review-unavailable');
   assert.equal(error.retryable,false);
  }
  owner.close();
 }
});
