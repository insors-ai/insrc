import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ArtifactIds } from '../../../artifact-ids.js';
import { emptyLifecycle } from '../../../artifact-core/decode.js';
import { resolveArtifactMdPath } from '../../../path-scheme.js';
import type { ArtifactKind } from '../../../path-scheme.js';
import { artifactJsonPath } from '../../../storage.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import { designCheckpointPath } from '../checkpoint.js';
import { setTimeout as pause } from 'node:timers/promises';
import type { LLMProvider, ActivityReviewSessionOpts } from '../../../../shared/types.js';
import type { DesignUnitAssignment } from '../contracts.js';
import { DESIGN_LIMITS } from '../contracts.js';
import { prepareDesignSubject, assertDesignSubjectUnchanged } from '../subject.js';

const hash='aaaaaaaaaaaaaaaa',other='bbbbbbbbbbbbbbbb',time='2026-11-03T00:00:00.000Z';
function fixture(t: {after: (fn:()=>void)=>void}) {
 const repo=mkdtempSync(join(tmpdir(),'design-subject-'));t.after(()=>rmSync(repo,{recursive:true,force:true}));
 function put(kind: 'DEF'|'HLD'|'LLD'|'ISSUE'|'SPEC', body: Record<string,unknown>={summary:'Scope'}, meta: Record<string,unknown>={}, h=hash) {
  const id=ArtifactIds.make({kind,epicHash:h,...(kind==='LLD'?{story:'s1'}:{})});
  const standalone=meta['standalone']===true||kind==='ISSUE'||kind==='SPEC';
  const m={workflow:kind==='DEF'?'define':kind==='HLD'?'design.epic':kind==='LLD'?'design.story':kind==='ISSUE'?'issue':'brainstorm',
   [kind==='ISSUE'?'issueHash':kind==='SPEC'?'specHash':'epicHash']:h,
   ...(kind==='LLD'?{storyId:'s1'}:{}),epicCreatedAt:time,createdAt:time,epicSlug:'context',authoredBy:'controller',
   lifecycle:{...emptyLifecycle(1),status:'approved'},...meta};
  const json=artifactJsonPath(repo,id),md=resolveArtifactMdPath(repo,{epicHash:h,epicCreatedAt:time,...(kind==='LLD'?{story:'s1'}:{})},kind as ArtifactKind,standalone?'standalone':'epic','context');
  mkdirSync(dirname(json),{recursive:true});mkdirSync(dirname(md),{recursive:true});
  writeFileSync(json,JSON.stringify({meta:m,body,citations:[{id:'c1',kind:'stakeholder',ref:'Scope'}]}));
  writeFileSync(md,`<!-- insrc:artifact ${id} -->\n# ${kind}\n\n## Summary\nScope\n\n## Document-only concern\nImportant requirement\n`);
  return {id,json,md};
 }
 return {repo,put};
}

test('workflow matrix resolves Epic designs, standalone LLD and ISSUE LLD without future artifacts',t=>{
 const f=fixture(t);const def=f.put('DEF',{problem:'A problem',stories:[{id:'s1',title:'Story'}]});
 assert.equal(prepareDesignSubject(f.repo,def.json).subject.workflow.requiredReferences.length,0);
 const hld=f.put('HLD');assert.deepEqual(prepareDesignSubject(f.repo,hld.md).subject.workflow.requiredReferences.map(r=>r.role),['definition']);
 const lld=f.put('LLD',{}, {standalone:false});
 const epic=prepareDesignSubject(f.repo,lld.json);assert.equal(epic.subject.workflow.kind,'epic');
 assert.deepEqual(epic.subject.workflow.requiredReferences.map(r=>r.role),['definition','hld']);
 assert.ok(epic.inventory.units.some(u=>u.selector.startsWith('document:line:')));
 const standalone=fixture(t);const root=standalone.put('LLD',{summary:'Feature scope'},{standalone:true});
 const s=prepareDesignSubject(standalone.repo,root.json);assert.equal(s.subject.workflow.kind,'standalone');assert.equal(s.subject.workflow.requiredReferences.length,0);
 assert.ok(s.subject.workflow.notApplicableRoles.includes('HLD'));
 // Older LLDs can lack the placement flag; canonical LLD root still supplies placement.
 const raw=JSON.parse(readFileSync(root.json,'utf8'));delete raw.meta.standalone;writeFileSync(root.json,JSON.stringify(raw));
 assert.equal(prepareDesignSubject(standalone.repo,root.json).subject.workflow.kind,'standalone');
 const issue=fixture(t);issue.put('ISSUE',{reproduction:'Fails',rootCause:'Cause',fixIntent:'Fix'},{standalone:true,magnitude:'sized'});
 const fix=issue.put('LLD',{summary:'Fix scope'},{standalone:true,sizeClass:'bugfix'});
 const i=prepareDesignSubject(issue.repo,fix.md);assert.equal(i.subject.workflow.kind,'issue');
 assert.deepEqual(i.subject.workflow.requiredReferences.map(r=>r.role),['originating_issue']);
 assert.ok(i.subject.workflow.notApplicableRoles.includes('HLD'));
 for(const kind of ['ISSUE','SPEC'] as const) {
  const p=fixture(t).put(kind);
  assert.throws(()=>prepareDesignSubject(dirname(dirname(dirname(p.json))),p.json),{code:'design_review_not_applicable'});
 }
});

test('workflow requirements do not downgrade broken Epics or turn correction links into ancestors',t=>{
 const f=fixture(t);f.put('DEF',{stories:[{id:'s1'}]});const lld=f.put('LLD',{summary:'Story'},{standalone:false});
 assert.throws(()=>prepareDesignSubject(f.repo,lld.json),{code:'invalid_context'});
 const issue=fixture(t);issue.put('ISSUE',{fixIntent:'Fix'},{standalone:true,magnitude:'sized',parentRef:{epicHash:other,storyId:'s1'}});
 const fix=issue.put('LLD',{summary:'Fix'},{standalone:true,envelope:{references:[{entityId:`HLD-${other}`,type:'HLD',relation:'corrects'}]}});
 assert.equal(prepareDesignSubject(issue.repo,fix.json).subject.workflow.kind,'issue');
 const missing=fixture(t);const root=missing.put('LLD',{summary:'Scope'},{standalone:true,seededFromSpec:other});
 assert.throws(()=>prepareDesignSubject(missing.repo,root.json),{code:'invalid_context'});
 missing.put('SPEC',{intent:'Scope'},{},other);assert.equal(prepareDesignSubject(missing.repo,root.json).subject.workflow.requiredReferences[0]?.role,'seed_spec');
 const orphan=fixture(t);const bad=orphan.put('LLD',{summary:'Fix'},{standalone:true,sizeClass:'bugfix'});
 assert.throws(()=>prepareDesignSubject(orphan.repo,bad.json),{code:'invalid_context'});
});

test('subject identity, containment and party are validated and only subject changes invalidate',t=>{
 const f=fixture(t);const root=f.put('LLD',{summary:'Scope',functionalDefinition:{requirements:[{id:'FR1'}]}},{standalone:true});
 const prepared=prepareDesignSubject(f.repo,root.json);assert.equal(prepared.subject.reviewer,'daemon');
 assert.ok(prepared.inventory.units.some(u=>u.kind==='requirement'));
 writeFileSync(join(f.repo,'source.ts'),'external change');assert.doesNotThrow(()=>assertDesignSubjectUnchanged(prepared.subject,prepared.baseline));
 writeFileSync(root.md,readFileSync(root.md,'utf8')+'Edited');assert.throws(()=>assertDesignSubjectUnchanged(prepared.subject,prepared.baseline),{code:'artifact_changed'});
 writeFileSync(root.md,'<!-- insrc:artifact DEF-bbbbbbbbbbbbbbbb -->');assert.throws(()=>prepareDesignSubject(f.repo,root.md),{code:'invalid_context'});
 assert.throws(()=>prepareDesignSubject(f.repo,'/etc/passwd'),{code:'invalid_context'});
 const outside=join(f.repo,'docs','escape.md');symlinkSync('/etc/passwd',outside);assert.throws(()=>prepareDesignSubject(f.repo,outside),{code:'invalid_context'});
 const unknown=fixture(t);const x=unknown.put('LLD',{summary:'Scope'},{standalone:true,authoredBy:'unknown'});
 assert.throws(()=>prepareDesignSubject(unknown.repo,x.json),{code:'invalid_context'});
 const wrong=fixture(t);const y=wrong.put('LLD',{summary:'Scope'},{standalone:true,epicHash:other});
 assert.throws(()=>prepareDesignSubject(wrong.repo,y.json),{code:'invalid_context'});
 const big=fixture(t);const z=big.put('LLD',{summary:'Scope'},{standalone:true});writeFileSync(z.md,'x'.repeat(DESIGN_LIMITS.subjectBytes+1));
 assert.throws(()=>prepareDesignSubject(big.repo,z.json),{code:'invalid_context'});
});


test('native and controller correction reviews preserve Epic standalone and ISSUE workflow requirements',async t=>{
 for(const kind of ['epic','standalone','issue'] as const)for(const author of ['controller','daemon'] as const){
  const f=fixture(t);
  if(kind==='epic'){f.put('DEF',{problem:'Scope',stories:[{id:'s1',title:'Story'}]});f.put('HLD');}
  if(kind==='issue')f.put('ISSUE',{reproduction:'Fails',rootCause:'Cause',fixIntent:'Fix'},{standalone:true,magnitude:'sized'});
  const root=f.put('LLD',{summary:'Workflow-specific review scope'},{standalone:kind!=='epic',authoredBy:author,...(kind==='issue'?{sizeClass:'bugfix'}:{})}),path=designCheckpointPath(f.repo,'review-1');
  let nativeCalls=0;
  function output(unit:'planning'|'impact'|'chunk',chunkId?:string){
   const cp=JSON.parse(readFileSync(path,'utf8')),a=cp.attempts.at(-1),units=a.inventory.units.map((u:{id:string})=>u.id);
   const plan={chunks:[{id:'content',title:'Workflow concern',selectors:units,concerns:['Correctness'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Complete current scope',finalConsistencyChunkId:'final',coverage:units.map((unitId:string)=>({unitId,chunkIds:['content']}))};
   if(unit==='planning')return plan;
   if(unit==='impact')return{plan,impact:{baselineAttempt:1,mode:'full',changes:['Document corrected'],directChunkIds:['content'],indirectChunkIds:[],rationale:'Explicit full scope for changed grouping',uncertainReason:'Retain no uncertain coverage',chunkMapping:[{priorIds:['content'],currentIds:['content'],explanation:'Reassess whole concern'}],retainedCoverage:[],carriedFindingIds:[],consistencyChunkIds:['final']}};
   return{chunkId,status:'passed',summary:'Deterministic workflow qualification, no hosted model',findings:[],inspectedReferences:[...units,root.md,path],limitations:[],advice:[],...(a.number>1&&chunkId==='final'?{findingDecisions:[]}:{})};
  }
  const provider={capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:ActivityReviewSessionOpts)=>{nativeCalls++;assert.equal(author,'controller');const match=prompt.match(/Chunk assignment: (.+)\n/),chunk=match?JSON.parse(match[1]):undefined,value=output(chunk?'chunk':prompt.includes('Impact preparation for attempt')?'impact':'planning',chunk?.id);await opts.onCandidate(value);return value;}} as unknown as LLMProvider;
  const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fake workflow fixture'})}),abort=new AbortController(),owner={id:'trusted',signal:abort.signal};
  for(const attempt of [1,2]){
   if(attempt===2)writeFileSync(root.md,readFileSync(root.md,'utf8')+'\nCorrected document');
   await c.start({phase:'start',repo:f.repo,reviewId:'review-1',attempt,artifactPath:root.json},author==='daemon'?{owner}:{});
   let completed=false;
   for(let i=0;i<500;i++){
    const progress=await c.progress(f.repo,'review-1',attempt);if(progress.status==='passed'){completed=true;break;}assert.ok(['pending','running'].includes(progress.status),JSON.stringify(progress));
    if(author==='daemon'){
     const frame=await c.exchange({phase:'assignment',repo:f.repo,reviewId:'review-1',attempt},owner) as {assignment:DesignUnitAssignment|null},a=frame.assignment;
     if(a){const value=output(a.kind,a.chunkId);await c.exchange({phase:a.kind==='chunk'?'result':a.kind==='impact'?'impact':'plan',repo:f.repo,reviewId:'review-1',attempt,executionId:a.executionId,sequence:1,...(a.kind==='chunk'?{result:value}:a.kind==='impact'?value as object:{plan:value})},owner);}
    }
    await pause(5);
   }
   assert.equal(completed,true);const cp=JSON.parse(readFileSync(path,'utf8'));assert.equal(cp.subject.workflow.kind,kind);assert.deepEqual(cp.subject.workflow.requiredReferences.map((r:{role:string})=>r.role),kind==='epic'?['definition','hld']:kind==='issue'?['originating_issue']:[]);
  }
  assert.equal(nativeCalls,author==='controller'?6:0);abort.abort();
 }
});
