/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync, symlinkSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { RecoveryJournal } from '../recovery-journal.js';
import type { RecoveryFault } from '../recovery-journal.js';
import { recoveryDirectory } from './recovery-fixtures.js';
const subjectDigest='a'.repeat(64),policyDigest='b'.repeat(64);
test('Private run paths, canonical immutable values and symlink escape refusal', async()=>{
 const f=recoveryDirectory();try{
  const j=new RecoveryJournal(f.repo,'run-1',{assertProcessOwner:()=>{}});
  assert.equal(statSync(j.directory).mode&0o777,0o700);
  const stored=await j.exclusive(()=>j.stage({z:1,a:'text'}));assert.deepEqual(j.read(stored.reference),{a:'text',z:1});
  assert.equal(statSync(join(j.directory,'blobs',stored.digest)).mode&0o777,0o600);
  assert.equal(j.stage({a:'text',z:1}).reference,stored.reference);
  assert.throws(()=>j.read('other/'+stored.digest));assert.throws(()=>j.read('run-1/../../escape'));
  assert.throws(()=>new RecoveryJournal(f.repo,'../escape',{assertProcessOwner:()=>{}}));
  const other=new RecoveryJournal(f.repo,'run-2',{assertProcessOwner:()=>{}});assert.throws(()=>other.read(stored.reference));
  const blob=join(j.directory,'blobs',stored.digest);rmSync(blob);writeFileSync(join(f.repo,'outside'),'sensitive');symlinkSync(join(f.repo,'outside'),blob);assert.throws(()=>j.read(stored.reference));
  mkdirSync(join(f.repo,'external'));symlinkSync(join(f.repo,'external'),join(f.repo,'.insrc/review-runs/investigation-v1','escape'));assert.throws(()=>new RecoveryJournal(f.repo,'escape',{assertProcessOwner:()=>{}}));
 }finally{f.cleanup();}
});
test('Blob-before-event durability and append sync fault matrix',async()=>{
 const f=recoveryDirectory();try{
  let fault:RecoveryFault|null=null;const points:RecoveryFault[]=[];let owned=true;
  const j=new RecoveryJournal(f.repo,'run-1',{assertProcessOwner:()=>{if(!owned)throw Error('lost process guard');},fault:p=>{points.push(p);if(p===fault)throw Error('injected');}});
  const value=j.stage({purpose:'block'});assert.deepEqual(points,['blob-file-synced','blob-installed','blob-directory-synced']);
  const event={eventId:'event-1',subjectDigest,policyDigest,generation:1,kind:'block' as const,payloadRef:value.reference};
  fault='event-written';assert.throws(()=>j.append(event),{code:'uncertain-append'});
  // A complete frame can survive an uncertain sync result: replay, rather than submit another event.
  assert.equal(j.events().length,1);fault=null;assert.equal(j.append(event).ordinal,1);
  assert.throws(()=>j.append({...event,generation:2}));
  fault='event-synced';assert.throws(()=>j.append({...event,eventId:'event-2',kind:'lease'}),{code:'uncertain-append'});fault=null;
  assert.equal(j.events().length,2);assert.equal(j.events()[1]!.kind,'lease');
  const path=join(j.directory,'events.jsonl');appendFileSync(path,'{"torn":');assert.throws(()=>j.events(),{code:'uncertain-append'});
  await j.exclusive(()=>{assert.equal(j.events(true).length,2);});assert.ok(readFileSync(path,'utf8').endsWith('\n'));
  appendFileSync(path,'{}\n');assert.throws(()=>j.events(true),{code:'corrupt'});
  owned=false;assert.throws(()=>j.stage({x:1}));
  // Independent handles still serialize a root and do not interleave writes.
  const k=new RecoveryJournal(f.repo,'serialized',{assertProcessOwner:()=>{}}),l=new RecoveryJournal(f.repo,'serialized',{assertProcessOwner:()=>{}});const order:number[]=[];
  let release!:()=>void;const blocked=new Promise<void>(r=>{release=r;});
  const first=k.exclusive(async()=>{order.push(1);await blocked;order.push(2);});const second=l.exclusive(()=>{order.push(3);});await new Promise(r=>setImmediate(r));assert.deepEqual(order,[1]);release();await first;await second;assert.deepEqual(order,[1,2,3]);
 }finally{f.cleanup();}
});
