/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { subjectFixture } from './fixtures.js';
import { prepareReviewSubject } from '../subject.js';
import { readReviewSource, sourceReference } from '../source.js';

test('Bounded immutable source navigation and reference isolation fixtures',async()=>{
 const f=await subjectFixture();try{
  const subject=await prepareReviewSubject(f.request,f.deps),oid=subject.packets[0]!.blocks[0]!.newBlob!;
  f.write('a.txt','untrusted working tree\n');
  const ref=sourceReference({kind:'blob',oid,start:1,end:2});
  const r=await readReviewSource(subject,ref,{},f.deps);assert.equal(r.text,'ONE\ntwo\n');assert.equal(r.completeness,'complete');
  const partial=await readReviewSource(subject,sourceReference({kind:'context',path:'a.txt',start:1,end:10}),{lines:2},f.deps);
  assert.equal(partial.text,'ONE\ntwo\n');assert.equal(partial.completeness,'partial');assert.deepEqual(partial.lines,[1,2]);
  assert.ok(partial.limitations.length);assert.equal(subject.packets[0]?.blocks.length,1);
  const tooSmall=await readReviewSource(subject,ref,{bytes:1},f.deps);assert.equal(tooSmall.completeness,'partial');assert.equal(tooSmall.text,'');
  await assert.rejects(()=>readReviewSource(subject,sourceReference({kind:'context',path:'../escape',start:1,end:1}),{},f.deps),{code:'invalid-input'});
  await assert.rejects(()=>readReviewSource(subject,sourceReference({kind:'blob',oid:f.commitId,start:1,end:1}),{},f.deps),{code:'invalid-input'});
  await assert.rejects(()=>readReviewSource(subject,ref,{lines:1000},f.deps),{code:'invalid-input'});
  const artifact=await readReviewSource(subject,sourceReference({kind:'artifact',artifactId:'LLD-root-s1',start:1,end:1}),{},f.deps);assert.equal(artifact.text,'approved text');
  f.setInputs({...f.inputs,upstream:[{...f.inputs.upstream[0]!,revision:2,approvedRevision:2}]});
  await assert.rejects(()=>readReviewSource(subject,sourceReference({kind:'artifact',artifactId:'LLD-root-s1',start:1,end:1}),{},f.deps),{code:'stale-contract'});
  f.setInputs(f.inputs);f.write('foreign','new\n');symlinkSync('/etc/passwd',join(f.dir,'link'));f.commit();
  await assert.rejects(()=>readReviewSource(subject,sourceReference({kind:'context',path:'foreign',start:1,end:1}),{},f.deps),{code:'invalid-object'});
  await assert.rejects(()=>readReviewSource({...subject,contextTree:'a'.repeat(40)},ref,{},f.deps),{code:'stale-contract'});
 }finally{f.close();}
});
