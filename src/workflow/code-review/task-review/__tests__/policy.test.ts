/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './publication-fixture.js';
import { prepareReviewPacket } from '../packet.js';
import { directAssignments, assessTaskResult, taskReferences } from '../assessment.js';
import { assignmentPrompt, codeTaskCommands } from '../policy.js';
import { TaskReviewCoordinator } from '../coordinator.js';
import { publishTaskCheckpoint } from '../publication.js';
import type { TaskReviewResult } from '../contracts.js';
import type { LLMProvider } from '../../../../shared/types.js';

// These are evidence/adapter fixtures, not claims that a model or each language runner was executed.
const languages = [
 { name:'Python', path:'total.py', before:'def total(price, quantity): return price * quantity\n', after:'def total(price, quantity): return price + quantity\n', test:'test_total.py', assertion:'assert total(10, 3) == 30\n', command:'python -m pytest test_total.py' },
 { name:'JavaScript', path:'total.js', before:'export const total = (price, quantity) => price * quantity;\n', after:'export const total = (price, quantity) => price + quantity;\n', test:'total.test.js', assertion:'assert.equal(total(10, 3), 30);\n', command:'node --test total.test.js' },
 { name:'TypeScript', path:'total.ts', before:'export const total = (price: number, quantity: number) => price * quantity;\n', after:'export const total = (price: number, quantity: number) => price + quantity;\n', test:'total.test.ts', assertion:'assert.equal(total(10, 3), 30);\n', command:'npx tsx --test total.test.ts' },
 { name:'Go', path:'total.go', before:'func total(price, quantity int) int { return price * quantity }\n', after:'func total(price, quantity int) int { return price + quantity }\n', test:'total_test.go', assertion:'if total(10, 3) != 30 { t.Fatal("incorrect total") }\n', command:'go test ./...' },
 { name:'JVM', path:'Total.java', before:'int total(int price, int quantity) { return price * quantity; }\n', after:'int total(int price, int quantity) { return price + quantity; }\n', test:'TotalTest.java', assertion:'assertEquals(30, total(10, 3));\n', command:'mvn test' },
] as const;
async function languageFixture(language:typeof languages[number], after:string=language.after) {
 const f=await fixture();
 f.put(language.path,language.before);f.put(language.test,language.assertion);
 f.put('unrelated-secret.txt','CREDENTIAL_CANARY_NOT_REVIEW_CONTEXT');
 f.git('add',language.path,language.test,'unrelated-secret.txt');f.git('commit','-qm','language baseline');const parent=f.git('rev-parse','HEAD');
 f.put(language.path,after);f.git('add',language.path);f.git('commit','-qm','body-only regression');const commit=f.git('rev-parse','HEAD');
 f.packet.reviewSet=[{commit,parent,files:[{path:language.path,segments:[{after:[1,1]}]}]}];
  f.packet.reviewRevision = f.packet.reviewSet[0]!.commit;
 f.packet.tests=[{file:language.test,cases:['total computes product'],command:language.command,result:'pass',executionDetails:'Builder report only; execution revision not independently established',evidenceReferences:[`${parent}:${language.test}`]}];
 const prepared=await prepareReviewPacket(f.packet,f.deps.sources),assignment=directAssignments(prepared)![0]!,refs=await taskReferences(f.deps.sources,prepared,assignment);
 const result:TaskReviewResult={...structuredClone(f.result),inspectedReferences:[`${commit}:${language.path}`],testCoverage:{assessment:'verified',explanation:'Inspected the committed assertion of product behavior; no independent execution claimed.',evidenceReferences:[`${commit}:${language.test}`]},advice:[],executedTests:[]};
 return {...f,prepared,assignment,refs,result,commit,parent};
}

test('review evidence policy: body-only logic, missing graph/run evidence and unused test-helper coverage',async()=>{
 const f=await languageFixture(languages[1]);
 try{
  const finding={severity:'HIGH' as const,location:'total.js:1',message:'Addition replaced multiplication',rationale:'For price 10 and quantity 3, the selected body returns 13 instead of the required 30.',evidenceReferences:[`${f.commit}:total.js`]};
  const demonstrated=await assessTaskResult(f.deps.sources,f.assignment,{...f.result,findings:[finding]},f.refs);
  assert.equal(demonstrated.status,'changes_requested');assert.equal(demonstrated.findings[0]!.severity,'HIGH');assert.deepEqual(demonstrated.executedTests,[]);
  for(const reason of ['No graph edge is available','No execution record was captured','Passing file contains only an unused helper calling the target','Reported passing tests ran against a different revision','Target verification route is unsupported']){
   const unknown=await assessTaskResult(f.deps.sources,f.assignment,{...f.result,testCoverage:{...f.result.testCoverage,assessment:reason.includes('unsupported')?'unsupported':'unverified',explanation:reason},limitations:[reason]},f.refs);
   assert.equal(unknown.status,'incomplete');assert.deepEqual(unknown.findings,[]);assert.deepEqual(unknown.executedTests,[]);assert.ok(unknown.limitations.includes(reason));
  }
  const partial=await assessTaskResult(f.deps.sources,f.assignment,{...f.result,findings:[finding],limitations:['One required branch remains unverified']},f.refs);
  assert.equal(partial.status,'incomplete');assert.deepEqual(partial.findings,[finding],'supported defects survive incomplete verification');
  await assert.rejects(assessTaskResult(f.deps.sources,f.assignment,{...f.result,findings:[{...finding,location:'unrelated-secret.txt:1'}]},f.refs),/outside the submitted/);
  await assert.rejects(assessTaskResult(f.deps.sources,f.assignment,{...f.result,inspectedReferences:[`${f.commit}:missing.js`]},f.refs),/Unresolved/);
 }finally{f.cleanup();}
});

test('review quality policy: target-language conventions, encapsulation/readability/naming and approved/native framework fallback',async()=>{
 for(const language of languages){
  const f=await languageFixture(language);
  try{
   const prompt=assignmentPrompt(f.prepared,f.assignment,f.refs,f.repo),commands=codeTaskCommands(f.prepared);
   assert.ok(commands.includes(language.command));assert.equal(commands.includes('npx tsc --noEmit'),false);assert.equal(prompt.includes('CREDENTIAL_CANARY'),false);assert.ok(prompt.includes(JSON.stringify(language.after.trim()).slice(1,-1)), 'selected implementation is embedded');
   for(const required of ['state ownership','encapsulation','excessive verbosity','cryptic code','several relevant naming examples','public/serialized names','Native language constructs and approved frameworks','Revision-mismatched'])assert.ok(prompt.includes(required));
   const advice=['Consider a clearer internal name after comparing neighboring modules; preserve wire names','Native constructs are adequate; an optional framework is not a requirement','Both repeated boilerplate and cryptic compression deserve optional clarity advice'];
   const optional=await assessTaskResult(f.deps.sources,f.assignment,{...f.result,advice},f.refs);
   assert.equal(optional.status,'passed');assert.deepEqual(optional.findings,[]);assert.deepEqual(optional.advice,advice);
   f.prepared.packet.tests[0]!.command='unsupported-runner verify';assert.equal(codeTaskCommands(f.prepared).includes('unsupported-runner verify'),false);
  }finally{f.cleanup();}
 }
 const boundary=await languageFixture(languages[1],'const items = []; export const getItems = () => items;\n');
 try {
  const assessed=await assessTaskResult(boundary.deps.sources,boundary.assignment,{...boundary.result,findings:[{severity:'MED',location:'total.js:1',message:'Getter exposes the mutable internal array',rationale:'The returned array aliases module-owned storage, allowing callers to bypass the intended ownership boundary.',evidenceReferences:[`${boundary.commit}:total.js`]}]},boundary.refs);
  assert.equal(assessed.status,'changes_requested');assert.equal(assessed.findings[0]!.severity,'MED');
 }finally{boundary.cleanup();}

});

test('review policy parity: common prompt/result classification across supported routes without coding/build-validation changes',async()=>{
 for(const language of languages){
  const f=await languageFixture(language),owner={id:`controller-${language.name}`,signal:new AbortController().signal};
  const assessment={...f.result,testCoverage:{...f.result.testCoverage,assessment:'partial' as const,explanation:'Unused helper plus passing file does not establish asserted execution'},limitations:['Execution revision cannot be established'],advice:['Native constructs are valid']};
  let nativePrompt='';
  const coordinator=new TaskReviewCoordinator({sources:f.deps.sources,provider:()=>({capabilities:{reviewActivity:true},runReviewSession:async(prompt:string)=>{nativePrompt=prompt;return structuredClone(assessment);}} as unknown as LLMProvider),publish:(project,id,epicHash)=>publishTaskCheckpoint(project,epicHash,id,f.deps)});
  try{
   const ack=await coordinator.start(f.repo,'policy-daemon',1,f.packet);await coordinator.settled(f.repo,'policy-daemon');
   const frame=await coordinator.startController(f.repo,'policy-controller',1,f.packet,owner);
   assert.equal(frame.kind,'task');assert.equal(frame.prompt,nativePrompt,'actual adapters receive the same policy/input');
   const done=await coordinator.controllerResult(f.repo,'policy-controller',1,assessment,owner,{taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence});assert.equal(done.status,'incomplete',JSON.stringify(f.read(frame.path)));
   const daemon=f.read(ack.path).attempts[0]!['review-response'].tasks;
   assert.deepEqual(daemon,f.read(frame.path).attempts[0]!['review-response'].tasks);
   assert.equal(daemon[0]!.status,'incomplete');assert.deepEqual(daemon[0]!.findings,[]);
   const cr=f.readRecord(`${f.repo}/.insrc/artifacts/CR-1234567890abcdef-s1.json`);
   assert.deepEqual(cr.body.reviews.map(r=>r.reviewer),['daemon','controller']);
  }finally{f.cleanup();}
 }
});
