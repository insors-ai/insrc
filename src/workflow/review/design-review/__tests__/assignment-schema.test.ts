import test from 'node:test';
import assert from 'node:assert/strict';
import { allowsDesignFindingDecisions, designChunkResultSchema, DesignResultSchema, decodeDesign } from '../contracts.js';
import { designChunkPrompt } from '../policy.js';
import { assessDesignResult } from '../results.js';
import { impactFixture } from './impact-fixtures.js';
import { codexStrictSchema, validateCodexReply } from '../../../../agent/providers/structured-schema.js';

test('live chunk schemas and trailing prompt schemas expose decisions only on the designated impact final',t=>{
 const f=impactFixture(t),impact={...f.current,plan:f.plan,impact:f.impact};
 for(const attempt of [undefined,{...f.current,plan:f.plan},impact])for(const chunk of f.plan.chunks){
  const allowed=attempt===impact&&chunk.id==='final';
  assert.equal(allowsDesignFindingDecisions(chunk,attempt),allowed);
  const schema=designChunkResultSchema(chunk,attempt),prompt=designChunkPrompt(f.prepared.subject,chunk,f.path,attempt);
  assert.equal(Object.hasOwn(schema.properties,'findingDecisions'),allowed);
  assert.equal(schema.additionalProperties,false);
  assert.deepEqual(JSON.parse(prompt.split('Output schema (structural reference):\n')[1]!),JSON.parse(JSON.stringify(schema)));
  if(!allowed)assert.match(prompt,/Do not include findingDecisions/);
  else assert.match(prompt,/supply findingDecisions for every origin/);
  assert.equal(Object.hasOwn(codexStrictSchema(schema).properties as object,'findingDecisions'),allowed);
 }
 const forged={...f.plan.chunks[1]!,purpose:'consistency' as const};
 assert.equal(allowsDesignFindingDecisions(forged,impact),false);
 assert.ok(Object.hasOwn(DesignResultSchema.properties,'findingDecisions'));
});

test('ordinary chunk schemas reject absent-permission fields even when empty or null while valid results still pass',t=>{
 const f=impactFixture(t),attempt={...f.current,plan:f.plan,impact:f.impact},chunk=f.plan.chunks[1]!;
 const result={chunkId:chunk.id,status:'passed',summary:'Reviewed assignment',findings:[],inspectedReferences:chunk.selectors,limitations:[],advice:[]};
 for(const findingDecisions of [[],null,[{source:{attempt:1,chunkId:'keep',findingId:'known'},action:'carry',rationale:'Known concern',evidenceReferences:[f.md]}]]){
  const value={...result,findingDecisions};
  assert.throws(()=>decodeDesign(designChunkResultSchema(chunk,attempt),value),{code:'invalid_schema'});
  assert.equal(validateCodexReply(designChunkResultSchema(chunk,attempt),value).ok,false);
  assert.throws(()=>assessDesignResult(value,chunk,[],[],{attempt,history:f.history}),{code:'invalid_schema'});
 }
 assert.equal(assessDesignResult(result,chunk,[],[],{attempt,history:f.history}).status,'passed');
});

test('impact final schema retains nullable transport decoding and historical final decisions without mutating broad schemas',t=>{
 const f=impactFixture(t),attempt={...f.current,plan:f.plan,impact:f.impact},chunk=f.plan.chunks[2]!;
 const schema=designChunkResultSchema(chunk,attempt),snapshot=JSON.stringify(DesignResultSchema);
 const result={chunkId:chunk.id,status:'passed',summary:'Final consistency checked',findings:[],inspectedReferences:[f.md,f.path],limitations:[],advice:[],findingDecisions:[]};
 assert.doesNotThrow(()=>decodeDesign(DesignResultSchema,result));
 assert.equal(assessDesignResult(result,chunk,[],[],{attempt,history:f.history}).status,'passed');
 assert.throws(()=>assessDesignResult(result,chunk,[]),{code:'invalid_schema'});
 const raw={...result,findingDecisions:null},normalized=validateCodexReply<Record<string,unknown>>(schema,raw);
 assert.equal(normalized.ok,true);if(normalized.ok)assert.equal(Object.hasOwn(normalized.value,'findingDecisions'),false);
 assert.equal(raw.findingDecisions,null);assert.equal(JSON.stringify(DesignResultSchema),snapshot);
});
