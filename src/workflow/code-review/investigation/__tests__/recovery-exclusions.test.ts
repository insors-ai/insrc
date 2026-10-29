/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './fixtures.js';
import { ReviewGitReader, readCommitPacket } from '../git-packets.js';
import { hasIgnoredSegment } from '../../../../indexer/file-selection.js';
import { INVESTIGATION_RUNTIME_PATH, isInvestigationRuntimePath } from '../../../../shared/review-runtime-paths.js';
import { LEDGER_EXCLUDE_GLOBS } from '../../../runners/build/changed-files.js';
test('Runtime namespace excluded from Git scope, index and review manifests',async()=>{
 const f=fixture();try{
  f.write('a.txt','before\n');const parent=f.commit();
  mkdirSync(join(f.dir,INVESTIGATION_RUNTIME_PATH,'run-1'),{recursive:true});writeFileSync(join(f.dir,INVESTIGATION_RUNTIME_PATH,'run-1/events.jsonl'),'private\n');
  f.write('a.txt','after\n');const commit=f.commit();
  const packet=await readCommitPacket(new ReviewGitReader(f.dir),commit,parent);assert.ok(packet.blocks.length);assert.ok(packet.blocks.every(b=>b.newPath==='a.txt'));
  const path=INVESTIGATION_RUNTIME_PATH+'/run-1/events.jsonl';assert.ok(hasIgnoredSegment(join(f.dir,path),f.dir,new Set(['.insrc'])));
  assert.ok(LEDGER_EXCLUDE_GLOBS.includes(INVESTIGATION_RUNTIME_PATH+'/**'));
  assert.ok(isInvestigationRuntimePath(path));assert.equal(isInvestigationRuntimePath('.insrc/review-runs/diagnostic.jsonl'),false);assert.equal(isInvestigationRuntimePath('.insrc/artifacts/LLD.json'),false);assert.equal(isInvestigationRuntimePath('src/app.ts'),false);
 }finally{f.close();}
});
