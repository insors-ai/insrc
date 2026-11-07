/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { reviewJsonLimit, DEFAULT_REVIEW_JSON_BYTES } from '../review.js';
import { CONFIG_CATALOG } from '../config-catalog.js';

test('review JSON limit is configurable discoverable live and rejects invalid values',()=>{
 const dir=mkdtempSync(join(tmpdir(),'review-config-')),file=join(dir,'config.json');try{
  assert.equal(reviewJsonLimit(file),4*1024*1024);assert.equal(CONFIG_CATALOG.find(r=>r.path==='review.maxJsonBytes')?.default,DEFAULT_REVIEW_JSON_BYTES);
  for(const bytes of [1024,8*1024*1024,64*1024*1024]){writeFileSync(file,JSON.stringify({review:{maxJsonBytes:bytes}}));assert.equal(reviewJsonLimit(file),bytes);}
  for(const value of [0,-1,1.5,'8388608',null,Number.MAX_SAFE_INTEGER+1]){writeFileSync(file,JSON.stringify({review:{maxJsonBytes:value}}));assert.throws(()=>reviewJsonLimit(file),/positive safe integer/);}
  writeFileSync(file,'{');assert.throws(()=>reviewJsonLimit(file),SyntaxError);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('configured review JSON limit reaches decoders checkpoint writers readers projection and CR store',()=>{
 const dir=mkdtempSync(join(tmpdir(),'review-limit-runtime-'));try{
  mkdirSync(join(dir,'.insrc'));writeFileSync(join(dir,'.insrc/config.json'),JSON.stringify({review:{maxJsonBytes:8*1024*1024}}));
  const script=`
   import assert from 'node:assert/strict';
   import {writeFileSync,statSync}from'node:fs';
   import {Type}from'@sinclair/typebox';
   import {decodeReview,reviewJsonLimit}from'./src/workflow/code-review/task-review/contracts.ts';
   import {ProjectionBudget}from'./src/workflow/code-review/task-review/projection.ts';
   import {PATHS}from'./src/shared/paths.ts';
   const isolatedConfig=process.argv[1];assert.equal(PATHS.config,isolatedConfig);assert.ok(isolatedConfig.startsWith('/tmp/review-limit-runtime-'));
   assert.equal(reviewJsonLimit(),8*1024*1024);
   const text='x'.repeat(5*1024*1024);assert.equal(decodeReview(Type.String(),text).length,text.length);
   new ProjectionBudget().snapshot(text);
   const {fixture,hash}=await import('./src/workflow/code-review/task-review/__tests__/publication-fixture.ts');
   const {saveCheckpoint,loadCheckpoint,checkpointPath}=await import('./src/workflow/code-review/task-review/checkpoint.ts');
   const {publishTaskCheckpoint}=await import('./src/workflow/code-review/task-review/publication.ts');
   const f=await fixture();
   try{
    const cp=f.checkpoint();cp.attempts[0]['review-response'].tasks[0].advice=Array.from({length:80},()=> 'x'.repeat(65536));
    const path=checkpointPath(f.repo,'publication');await saveCheckpoint(path,cp);assert.ok(statSync(path).size>4*1024*1024);assert.equal((await loadCheckpoint(path)).attempts.length,1);
    const published=await publishTaskCheckpoint(f.repo,hash,'publication',f.deps);assert.ok(statSync(published.jsonPath).size>4*1024*1024);
    writeFileSync(isolatedConfig,JSON.stringify({review:{maxJsonBytes:4*1024*1024}}));
    await assert.rejects(loadCheckpoint(path),/bounded checkpoint/);
   }finally{f.cleanup();}

   writeFileSync(isolatedConfig,JSON.stringify({review:{maxJsonBytes:4*1024*1024}}));
   assert.throws(()=>decodeReview(Type.String(),text),/bounded JSON/);
   assert.throws(()=>new ProjectionBudget().snapshot(text),/projection_limit/);
  `;
  execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',script,join(dir,'.insrc/config.json')],{cwd:process.cwd(),env:{...process.env,HOME:dir},stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
