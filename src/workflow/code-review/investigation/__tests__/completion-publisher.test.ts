/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicationFixture } from './completion-fixtures.js';
import { createRepoLifecycle } from '../../../artifact-core/repo-lifecycle.js';
import { prepareCompletionPublication } from '../completion-publication.js';
import { publishCompletionCandidate } from '../completion-publisher.js';
import { SubjectPreparationError } from '../types.js';
import type { CompletionPublisherDeps } from '../completion-publisher.js';
const actor={id:'insrc:daemon',kind:'agent' as const,properties:{}};

test('Canonical artifact queue creates or updates only the frozen expected revision',async()=>{
 const f=await publicationFixture();try{
  const lifecycle=createRepoLifecycle(f.repo),canonical=lifecycle.store;
  const deps:CompletionPublisherDeps={canonical,actor,current:async()=>({context:f.context,buildRecord:f.input.buildRecord})};
  const id='CR-c32aa60534232f36-s1';
  const existing=await canonical.mutateContentAndLog(id,actor,async()=>({payload:{body:{kind:'code-review',prior:true},citations:[]},metadata:{},assertCurrent:()=>{}}));
  const p=await prepareCompletionPublication(f.store,f.leaseId,1,{...f.input,expectedRevision:existing.revision,expectedHeadDigest:existing.digest});
  const first=await publishCompletionCandidate(f.store,f.leaseId,1,p.intentRef,f.context,deps);
  assert.equal(first.kind,'published');if(first.kind!=='published')return;
  assert.equal(first.value.revision,2);assert.equal(first.value.head.meta['reviewedBy'],'daemon');
  const retry=await publishCompletionCandidate(f.store,f.leaseId,1,null,f.context,deps);
  assert.equal(retry.kind,'published');if(retry.kind!=='published')return;
  assert.equal(retry.value.revision,2);assert.equal((await lifecycle.history.log(p.intent.artifactId)).length,2);
  // Explicit prior-revision mutation uses this same queue; neither create nor update bypasses journaling.
  const before=await canonical.readHeadSnapshot(p.intent.artifactId);assert.ok(before);
  const changed=await canonical.mutateContentAndLog(p.intent.artifactId,actor,async(head)=>{
   assert.equal(head?.revision,2);assert.equal(head.digest,before.digest);
   return {payload:{body:{...head.head.body,verdict:'warn'},citations:[]},metadata:{},assertCurrent:()=>{}};
  });
  assert.equal(changed.revision,3);
  await assert.rejects(()=>publishCompletionCandidate(f.store,f.leaseId,1,null,f.context,deps),/conflict/);
  assert.equal((await canonical.readHeadSnapshot(p.intent.artifactId))?.revision,3);
 }finally{f.cleanup();}
});
test('Owner freshness and canonical identity checks refuse concurrent or edited heads',async()=>{
 const f=await publicationFixture();try{
  const lifecycle=createRepoLifecycle(f.repo),canonical=lifecycle.store;
  const deps:CompletionPublisherDeps={canonical,actor,current:async()=>({context:f.context,buildRecord:f.input.buildRecord})};
  const p=await prepareCompletionPublication(f.store,f.leaseId,1,f.input);
  // Ownership is rechecked at the boundary, before a canonical write.
  await assert.rejects(()=>publishCompletionCandidate(f.store,'foreign',1,p.intentRef,f.context,deps),{code:'ownership-lost'});
  const stale={...deps,current:async()=>({context:{...f.context,assertFresh:async()=>{throw new SubjectPreparationError('stale-contract','LLD changed at CAS');}},buildRecord:f.input.buildRecord})};
  await assert.rejects(()=>publishCompletionCandidate(f.store,f.leaseId,1,p.intentRef,f.context,stale),{code:'stale'});
  assert.equal(await canonical.readHeadSnapshot(p.intent.artifactId),null);
  // Two independent completion requests converge through the sc4 and canonical queues.
  const results=await Promise.all([publishCompletionCandidate(f.store,f.leaseId,1,null,f.context,deps),publishCompletionCandidate(f.store,f.leaseId,1,null,f.context,deps)]);
  assert.ok(results.every(r=>r.kind==='published'&&r.value.revision===1));
  assert.equal((await lifecycle.history.log(p.intent.artifactId)).length,1);
  const path=join(f.repo,'.insrc','artifacts',`${p.intent.artifactId}.json`),raw=JSON.parse(readFileSync(path,'utf8')) as {body:Record<string,unknown>};
  raw.body['verdict']='warn';writeFileSync(path,JSON.stringify(raw));
  const edited=readFileSync(path,'utf8');
  await assert.rejects(()=>publishCompletionCandidate(f.store,f.leaseId,1,null,f.context,deps),/conflict/);
  assert.equal(readFileSync(path,'utf8'),edited);
 }finally{f.cleanup();}
});
