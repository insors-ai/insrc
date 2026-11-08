import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, readdirSync, symlinkSync, unlinkSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { impactFixture } from './impact-fixtures.js';
import { cleanupDesignArtifact } from '../cleanup.js';
import { recordDesignAdmission } from '../approval.js';
import { publishDesignReview } from '../publication.js';
import { saveDesignCheckpoint } from '../checkpoint.js';
import { createRepoLifecycle } from '../../../artifact-core/repo-lifecycle.js';
import { nextLifecycle } from '../../../artifact-core/lifecycle.js';
import { claimDesignArtifact, releaseDesignArtifact, withDesignArtifactFence } from '../fence.js';
const actor={id:'person:test',kind:'person' as const,properties:{}};
async function fixture(t:Parameters<typeof impactFixture>[0],approve=true,prefix=false){
 const f=impactFixture(t);f.checkpoint.attempts=[f.baseline];
 if(prefix){const old=structuredClone(f.baseline);old.status='failed';delete old.report;delete old.plan;old.completedChunks=[];old.failure={code:'execution_failed',summary:'Preserve original failure'};f.baseline.number=2;f.baseline.report!.attempt=2;f.checkpoint.attempts=[old,f.baseline];}
 await recordDesignAdmission(f.checkpoint);
 f.baseline.publication=await publishDesignReview(f.checkpoint);await saveDesignCheckpoint(f.repo,f.checkpoint);const lc=createRepoLifecycle(f.repo);
 if(approve)await lc.store.updateAndLog(f.id,actor,head=>({next:{...head,lifecycle:nextLifecycle(head,'approve',actor,new Date().toISOString())},options:{operation:'approve'}}));
 return {...f,lc,bytes:readFileSync(f.path),root:dirname(f.path)};
}
test('approval deletes only fully preserved private claims and fresh history remains readable',async t=>{
 const f=await fixture(t,false),approved=await f.lc.service.apply(f.id,'approve',actor);
 assert.deepEqual(approved.cleanup!.deleted,[f.path]);assert.equal(existsSync(f.path),false);
 assert.equal((await f.lc.history.log(f.id)).filter(e=>e.operation==='review').length,1);
 const again=await cleanupDesignArtifact(f.repo,f.id);assert.deepEqual(again,{deleted:[],retained:[],errors:[]});
});
test('public replacements after claim and at deletion remain untouched and retain replay ownership',async t=>{
 for(const stage of ['afterClaim','beforeDelete'] as const){
  const f=await fixture(t);let released=false;
  const result=await cleanupDesignArtifact(f.repo,f.id,{onDeleted:()=>{released=true;},boundary:(at,path)=>{if(at===stage)writeFileSync(path,'replacement');}});
  assert.deepEqual(result.deleted,[f.path]);assert.equal(readFileSync(f.path,'utf8'),'replacement');assert.equal(released,false);
 }
});
test('replacement immediately before claim is quarantined and restored without loss',async t=>{
 const f=await fixture(t);const result=await cleanupDesignArtifact(f.repo,f.id,{boundary:(stage,path)=>{if(stage==='beforeClaim'){unlinkSync(path);writeFileSync(path,'new unverified bytes');}}});
 assert.deepEqual(result.deleted,[]);assert.equal(readFileSync(f.path,'utf8'),'new unverified bytes');
 const quarantine=result.retained.find(p=>p.endsWith('checkpoint.json'))!;assert.equal(readFileSync(quarantine,'utf8'),'new unverified bytes');
 assert.match(result.errors.join('\n'),/changed|replaced/);
});
test('crashes after claim and before deletion recover exact claims without touching replacements',async t=>{
 for(const stage of ['afterClaim','beforeDelete'] as const){
  const f=await fixture(t);let thrown=false;
  const first=await cleanupDesignArtifact(f.repo,f.id,{boundary:at=>{if(at===stage){thrown=true;throw Error('simulated termination');}}});
  assert.ok(thrown);assert.equal(first.deleted.length,0);
  assert.equal(existsSync(f.path),false);writeFileSync(f.path,'replacement during restart');
  const recovered=await cleanupDesignArtifact(f.repo,f.id);assert.deepEqual(recovered.deleted,[f.path]);assert.equal(readFileSync(f.path,'utf8'),'replacement during restart');
 }
});
test('unverified claims never clobber a replacement during no-clobber restore',async t=>{
 const f=await fixture(t);const result=await cleanupDesignArtifact(f.repo,f.id,{boundary:(stage,path,claimed)=>{if(stage==='afterClaim'){writeFileSync(claimed,'unverified claim');writeFileSync(path,'public replacement');}}});
 assert.equal(readFileSync(f.path,'utf8'),'public replacement');assert.equal(result.deleted.length,0);
 assert.equal(readFileSync(result.retained.find(p=>p.endsWith('checkpoint.json'))!,'utf8'),'unverified claim');
 const repeated=await cleanupDesignArtifact(f.repo,f.id);assert.ok(repeated.retained.some(p=>p.endsWith('checkpoint.json')));
});
test('foreign corrupt symlink unpreserved and unfinished override checkpoints are retained',async t=>{
 for(const kind of ['foreign','corrupt','symlink','unpreserved','unfinished'] as const){
  const f=await fixture(t);
  if(kind==='foreign'){const raw=JSON.parse(f.bytes.toString());raw.artifactId='LLD-bbbbbbbbbbbbbbbb-s1';writeFileSync(f.path,JSON.stringify(raw));}
  if(kind==='corrupt')writeFileSync(f.path,'{');
  if(kind==='symlink'){renameSync(f.path,join(f.root,'saved'));symlinkSync(join(f.root,'saved'),f.path);}
  if(kind==='unpreserved'){const raw=JSON.parse(f.bytes.toString());raw.attempts[0].completedChunks[0].summary='Unpreserved feedback';raw.attempts[0].report.chunks[0].summary='Unpreserved feedback';writeFileSync(f.path,JSON.stringify(raw));}
  if(kind==='unfinished'){const raw=JSON.parse(f.bytes.toString());raw.attempts[0].status='paused';writeFileSync(f.path,JSON.stringify(raw));}
  const result=await cleanupDesignArtifact(f.repo,f.id);assert.deepEqual(result.deleted,[]);assert.ok(existsSync(f.path));assert.ok(result.retained.includes(f.path),kind);assert.equal(readdirSync(f.root).some(n=>n.startsWith('.cleanup-')),false);
 }
});
test('active and busy artifacts retain promptly while independent artifacts clean up',async t=>{
 const f=await fixture(t),g=await fixture(t);claimDesignArtifact(f.repo,f.id,'active');
 try{const held=await cleanupDesignArtifact(f.repo,f.id);assert.equal(held.deleted.length,0);assert.match(held.errors.join(),/active/);assert.equal((await cleanupDesignArtifact(g.repo,g.id)).deleted.length,1);}
 finally{releaseDesignArtifact(f.repo,f.id,'active');}
 await withDesignArtifactFence(f.repo,f.id,async()=>{const held=await cleanupDesignArtifact(f.repo,f.id);assert.equal(held.deleted.length,0);assert.match(held.errors.join(),/busy/);});
 let released=false;assert.equal((await cleanupDesignArtifact(f.repo,f.id,{onDeleted:()=>{released=true;}})).deleted.length,1);assert.equal(released,true);
});

test('cleanup verifies older failed attempt history as well as the final publication',async t=>{
 const f=await fixture(t,true,true);assert.equal((await cleanupDesignArtifact(f.repo,f.id)).deleted.length,1);
 const g=await fixture(t,true,true),raw=JSON.parse(g.bytes.toString());raw.attempts[0].failure.summary='Changed earlier failure';writeFileSync(g.path,JSON.stringify(raw));
 const held=await cleanupDesignArtifact(g.repo,g.id);assert.equal(held.deleted.length,0);assert.ok(held.retained.includes(g.path));assert.ok(existsSync(g.path));
});
test('explicit override approval retains unfinished checkpoint state truthfully',async t=>{
 const f=await fixture(t,false),raw=JSON.parse(f.bytes.toString());raw.attempts[0].status='paused';writeFileSync(f.path,JSON.stringify(raw));
 const result=await f.lc.service.apply(f.id,'approve',actor,{override:{reason:'Retain unfinished review for follow-up'}});
 assert.equal(result.lifecycle.status,'approved');assert.equal(result.cleanup!.deleted.length,0);assert.ok(result.cleanup!.retained.includes(f.path));assert.equal(JSON.parse(readFileSync(f.path,'utf8')).attempts[0].status,'paused');
});
