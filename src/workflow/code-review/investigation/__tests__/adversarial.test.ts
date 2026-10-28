/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, subjectFixture } from './fixtures.js';
import { ReviewGitReader, readCommitPacket } from '../git-packets.js';
import { prepareReviewSubject, assertReviewSubjectFresh } from '../subject.js';
import { readReviewSource, sourceReference } from '../source.js';
import { identifySubject } from '../identity.js';
import { SUBJECT_LIMITS } from '../types.js';

test('Cross-module adversarial scope and legacy/corpus regression fixtures',async()=>{
 const f=await subjectFixture();try{
  f.setProof({...f.proof,exclusive:true,blockIds:[]});
  const subject=await prepareReviewSubject(f.request,f.deps);assert.equal(subject.packets[0]?.blocks.length,2);
  const baseline=await readCommitPacket(new ReviewGitReader(f.dir),f.commitId,f.parentId);
  f.git('config','diff.interHunkContext','20');
  assert.deepEqual(await readCommitPacket(new ReviewGitReader(f.dir),f.commitId,f.parentId),baseline);
  f.git('config','diff.interHunkContext','0');
  const before=f.git('rev-parse','HEAD');f.write('a.txt','one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n');const reverted=f.commit();
  const first=await readCommitPacket(new ReviewGitReader(f.dir),before,f.parentId), second=await readCommitPacket(new ReviewGitReader(f.dir),reverted,before);
  assert.equal(first.blocks.length,2);assert.equal(second.blocks.length,2);assert.notEqual(first.blocks[0]?.blockId,second.blocks[0]?.blockId);
  await assertReviewSubjectFresh(subject,f.deps);
  await assert.rejects(()=>prepareReviewSubject({...f.request,selections:[]},f.deps),{code:'invalid-input'});
  await assert.rejects(()=>prepareReviewSubject({...f.request,selections:[{...f.request.selections[0]!,blockIds:[]}]},f.deps),{code:'ambiguous-attribution'});
  await assert.rejects(()=>prepareReviewSubject({...f.request,selections:[{...f.request.selections[0]!,commitId:'HEAD'}]},f.deps),{code:'invalid-object'});
  await assert.rejects(()=>readCommitPacket(new ReviewGitReader(f.dir,async()=>new Uint8Array(SUBJECT_LIMITS.gitBytes+1)),before,f.parentId),{code:'resource-limit'});
  await assert.rejects(()=>readCommitPacket(new ReviewGitReader(f.dir,async()=>{throw Error('unavailable');}),before,f.parentId),{code:'invalid-object'});
 }finally{f.close();}
});
test('explicit merge parent, pinned binary and symlink context boundaries',async()=>{
 const f=fixture();try{
  f.write('main','base\n');const base=f.commit();f.git('checkout','-qb','side');f.write('side','side\n');const side=f.commit();
  f.git('checkout','-q','-');f.write('main','changed\n');const own=f.commit();f.git('merge','--no-ff','-qm','merge','side');const merge=f.git('rev-parse','HEAD');
  const fromOwn=await readCommitPacket(new ReviewGitReader(f.dir),merge,own);const fromSide=await readCommitPacket(new ReviewGitReader(f.dir),merge,side);
  assert.deepEqual(fromOwn.blocks.map(b=>b.newPath),['side']);assert.deepEqual(fromSide.blocks.map(b=>b.newPath),['main']);
  await assert.rejects(()=>readCommitPacket(new ReviewGitReader(f.dir),merge,base),{code:'invalid-object'});
  symlinkSync('/etc/passwd',join(f.dir,'link'));f.write('binary',new Uint8Array([0,1]));const pinned=f.commit();
  const reader=new ReviewGitReader(f.dir),context=await reader.commit(pinned);
  const subject=identifySubject({version:1,repoId:'repo',rootArtifactId:'root',storyId:'s1',build:{artifactId:'build',revision:1,sourceCommit:pinned},contracts:[],tasks:[],taskBasis:'approved-upstream',packets:[],contextTree:context.tree,ambiguities:[]});
  const deps={repoPath:f.dir,readWork:async()=>{throw Error('not needed');},readAttestation:async()=>{throw Error('not needed');},assertFresh:async()=>{}};
  const binary=await readReviewSource(subject,sourceReference({kind:'context',path:'binary',start:1,end:1}),{},deps);assert.equal(binary.completeness,'unavailable');assert.equal(binary.text,null);assert.ok(binary.sourceDigest);
  await assert.rejects(()=>readReviewSource(subject,sourceReference({kind:'context',path:'link',start:1,end:1}),{},deps),{code:'unsupported-change'});
 }finally{f.close();}
});
