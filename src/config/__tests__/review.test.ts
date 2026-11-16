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
