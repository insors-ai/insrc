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
