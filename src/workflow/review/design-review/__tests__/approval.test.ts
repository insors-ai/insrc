import { dirname } from 'node:path';
import { artifactJsonPath } from '../../../storage.js';
import { resolveArtifactMdPath } from '../../../path-scheme.js';
import { prepareDesignSubject } from '../subject.js';
import { emptyLifecycle } from '../../../artifact-core/decode.js';
import { handleWorkflowApprove } from '../../../../daemon/workflow-approve.js';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { impactFixture } from './impact-fixtures.js';
import { recordDesignAdmission } from '../approval.js';
import { publishDesignReview } from '../publication.js';
import { saveDesignCheckpoint } from '../checkpoint.js';
import { createRepoLifecycle } from '../../../artifact-core/repo-lifecycle.js';
import { approveArtifactByJsonPath } from '../../../gates.js';
import { claimDesignArtifact, releaseDesignArtifact, withDesignArtifactFence } from '../fence.js';
import { consolidateDesignReview } from '../results.js';
const actor={id:'human:test',kind:'person' as const,properties:{}};
async function ready(t:Parameters<typeof impactFixture>[0],severity?:'MED'|'LOW',route?:'DEF'|'HLD'|'LLD'|'issue'){
 const f=impactFixture(t);execFileSync('git',['init','-q',f.repo]);f.checkpoint.attempts=[f.baseline];
 if(route){
  const original=JSON.parse(readFileSync(f.json,'utf8')),hash='aaaaaaaaaaaaaaaa',time=original.meta.createdAt;
  function put(kind:'DEF'|'HLD'|'LLD'|'ISSUE',approved:boolean){
   const id=`${kind}-${hash}${kind==='LLD'?'-s1':''}`,json=artifactJsonPath(f.repo,id),md=resolveArtifactMdPath(f.repo,{epicHash:hash,epicCreatedAt:time,...(kind==='LLD'?{story:'s1'}:{})},kind,route==='issue'?'standalone':'epic','fixture');
   const raw={...original,meta:{...original.meta,standalone:route==='issue',...(kind==='ISSUE'?{issueHash:hash,magnitude:'sized'}:{}),...(approved?{lifecycle:{...emptyLifecycle(1),status:'approved'}}:{})},body:{...original.body,...(kind==='DEF'?{stories:[{id:'s1'}]}:{})}};
   if(kind!=='LLD')delete raw.meta.storyId;
   mkdirSync(dirname(md),{recursive:true});writeFileSync(json,JSON.stringify(raw));writeFileSync(md,`<!-- insrc:artifact ${id} -->\n# ${kind}\nScope\n`);return{id,json,md};
  }
  if(route==='issue')put('ISSUE',true);else if(route!=='DEF')put('DEF',true);
  if(route==='LLD')put('HLD',true);
  const target=put(route==='issue'?'LLD':route,false);Object.assign(f,target);
  f.prepared=prepareDesignSubject(f.repo,f.json);f.checkpoint.subject=f.prepared.subject;f.checkpoint.artifactId=f.id;f.checkpoint.submitted.artifactPath=f.json;
  f.baseline.baseline=f.prepared.baseline;f.baseline.inventory=f.prepared.inventory;
  const selectors=f.prepared.inventory.units.map(u=>u.id);f.plan.chunks[0]!.selectors=selectors;f.plan.chunks[1]!.selectors=selectors;f.plan.coverage=selectors.map(unitId=>({unitId,chunkIds:['keep','edit']}));f.baseline.plan=f.plan;
  for(const r of f.baseline.completedChunks)r.inspectedReferences=[...selectors,f.md,f.path];
 }

 if(severity){f.baseline.completedChunks[0]!.findings=[{id:'concern',severity,location:'/summary',message:'Concern',evidenceReferences:[f.md]}];f.baseline.completedChunks[0]!.status=severity==='MED'?'changes_requested':'passed';}
 f.baseline.report=consolidateDesignReview('review-1',1,f.prepared.subject,f.baseline.baseline.contentIdentity,f.plan,f.baseline.completedChunks);f.baseline.status=f.baseline.report.status;
 await recordDesignAdmission(f.checkpoint);f.baseline.publication=await publishDesignReview(f.checkpoint);await saveDesignCheckpoint(f.repo,f.checkpoint);
 return {...f,lc:createRepoLifecycle(f.repo)};
}
test('normal and direct design approval share permanent independent evidence and preserve idempotent approval',async t=>{
 const f=await ready(t,'LOW'),before=await f.lc.service.inspect(f.id);
 await approveArtifactByJsonPath(f.json,{lifecycle:f.lc.service,actor});
 const first=await f.lc.service.inspect(f.id);assert.equal(first!.status,'approved');assert.deepEqual(first!.lifecycle.review,before!.lifecycle.review);
 const log=await f.lc.history.log(f.id);const again=await f.lc.service.apply(f.id,'approve',actor,{override:{reason:'Do not replace original'}});
 assert.equal(again.recorded,false);assert.deepEqual((await f.lc.service.inspect(f.id))!.lifecycle.approval,first!.lifecycle.approval);assert.equal((await f.lc.history.log(f.id)).length,log.length);
 const g=await ready(t);await g.lc.service.apply(g.id,'approve',actor);assert.equal((await g.lc.service.inspect(g.id))!.status,'approved');
});
test('MED overrides retain the original blocked review and repeated normal approval remains idempotent',async t=>{
 const f=await ready(t,'MED'),before=(await f.lc.service.inspect(f.id))!.lifecycle.review;
 await assert.rejects(f.lc.service.apply(f.id,'approve',actor),/review is changes_requested/);
 await approveArtifactByJsonPath(f.json,{lifecycle:f.lc.service,actor,overrideReview:'Accepted remaining concern'});
 assert.deepEqual((await f.lc.service.inspect(f.id))!.lifecycle.review,before);
 await approveArtifactByJsonPath(f.json,{lifecycle:f.lc.service,actor});
 assert.deepEqual((await f.lc.service.inspect(f.id))!.lifecycle.review,before);
});
test('document changes, missing evidence and a later failed review admission cannot approve an older pass',async t=>{
 const f=await ready(t);appendFileSync(f.md,'\nChanged');await assert.rejects(f.lc.service.apply(f.id,'approve',actor),/document or workflow context changed/);
 const g=await ready(t);const later=structuredClone(g.checkpoint);later.reviewId='later-review';later.attempts[0]!.status='failed';await recordDesignAdmission(later);
 await assert.rejects(createRepoLifecycle(g.repo).service.apply(g.id,'approve',actor),/later or untracked/);
 const h=impactFixture(t);await assert.rejects(createRepoLifecycle(h.repo).service.apply(h.id,'approve',actor),/no permanent/);
});
test('active reviewer ownership excludes approval and approval fence excludes new review ownership',async t=>{
 const f=await ready(t);claimDesignArtifact(f.repo,f.id,'owner');
 try{await assert.rejects(f.lc.service.apply(f.id,'approve',actor),/review is active/);}finally{releaseDesignArtifact(f.repo,f.id,'owner');}
 await withDesignArtifactFence(f.repo,f.id,async()=>{assert.throws(()=>claimDesignArtifact(f.repo,f.id,'other'),/busy/);});
 await f.lc.service.apply(f.id,'approve',actor);
});

test('unfinished checkpoint states and missing referenced history fail closed without altering the head',async t=>{
 for(const status of ['paused','failed','invalidated','incomplete'] as const){
  const f=await ready(t);f.baseline.status=status;await saveDesignCheckpoint(f.repo,f.checkpoint);
  const before=readFileSync(f.json,'utf8');await assert.rejects(f.lc.service.apply(f.id,'approve',actor));assert.equal(readFileSync(f.json,'utf8'),before);
 }
 const f=await ready(t);writeFileSync(f.json.replace(/\.json$/,'.log.jsonl'),'');await assert.rejects(f.lc.service.apply(f.id,'approve',actor));
});

test('ordinary daemon and direct lifecycle approvals honor actual epic standalone and issue ancestors',async t=>{
 for(const route of ['DEF','HLD','LLD','issue',undefined] as const){
  const f=await ready(t,undefined,route);
  const result=await handleWorkflowApprove({repo:f.repo,artifactPath:f.json,actor},{lifecycleFor:()=>f.lc.service});
  assert.ok(!('error' in result));assert.equal(result.approved.length,1,JSON.stringify(result));assert.equal((await f.lc.service.inspect(f.id))!.status,'approved');
 }
});

test('changed authorship and workflow provenance cannot reuse independent evidence',async t=>{
 const f=await ready(t);const raw=JSON.parse(readFileSync(f.json,'utf8'));raw.meta.authoredBy='daemon';writeFileSync(f.json,JSON.stringify(raw));await assert.rejects(f.lc.service.apply(f.id,'approve',actor),/independently bound/);
 const g=await ready(t);const other=JSON.parse(readFileSync(g.json,'utf8'));other.meta.seededFromSpec='bbbbbbbbbbbbbbbb';writeFileSync(g.json,JSON.stringify(other));await assert.rejects(g.lc.service.apply(g.id,'approve',actor));
});
