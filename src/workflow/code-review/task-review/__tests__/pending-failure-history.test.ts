import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,rm } from 'node:fs/promises';
import { fixture,hash } from './publication-fixture.js';
import { channel,eventually,provider,serve } from './controller-fixture.js';
import { checkpointPath,saveCheckpoint,updateStoredCodeCheckpoint } from '../checkpoint.js';
import { validateTaskBody } from '../record.js';
import { readTaskReviewHistory } from '../history.js';
import { approveArtifactByJsonPath } from '../../../gates.js';
import { lifecycleFor } from '../../../../daemon/lifecycle-registry.js';
import { cleanupApprovedTaskReviews,readTaskReviewProgress } from '../../../../daemon/task-review-rpc.js';
import { withoutReviewResourceGuard } from '../../../review/resource-audit.js';

test('pending-publication qualified failure survives new attempt publication approval cleanup and permanent reads',async()=>{
 const f=await fixture(true),id='failed-publication',path=checkpointPath(f.repo,id),cp=f.checkpoint(id),failed=cp.attempts[0]!;
 failed.header.status='failed';failed['review-response'].tasks=[];failed['review-response'].error='Original native failure';failed['review-response'].summary='Original failed attempt summary';
 await saveCheckpoint(path,cp);
 await updateStoredCodeCheckpoint(path,saved=>({...saved!,schemaVersion:2,attempts:saved!.attempts.map(a=>({...a,resourceGuard:{daemonInstance:'prior-daemon',openLeases:[]}}))}));
 const before=JSON.parse(await readFile(path,'utf8')).attempts[0];
 await rm(checkpointPath(f.repo,'publication'));
 let calls=0;
 const host=await serve(f.repo,()=>provider(async prompt=>{calls++;return prompt.startsWith('Derive task attribution')?{summary:'Reassess after failed execution',tasks:[{taskId:'t1',changeIndexes:[0],testIndexes:[0],action:'reassess',reason:'Prior failed attempt has no complete assessment'}]}:f.result;}));
 const client=await channel(host.path);
 try{
  const failedBytes=await readFile(path,'utf8');
  await assert.rejects(client.call('codeReview.task.publish',{repo:f.repo,epicHash:hash,reviewId:id,attempt:1}),/Failed review requires the next attempt/);
  assert.equal(await readFile(path,'utf8'),failedBytes,'publication cannot clear or replace failed feedback');
  await client.call('codeReview.task.start',{repo:f.repo,epicHash:hash,reviewId:id,attempt:2,packet:f.packet});
  try{await eventually(()=>f.read(path).attempts.at(-1)?.['review-response']?.crPublication==='complete');}
  catch(error){const last=JSON.parse(await readFile(path,'utf8')).attempts.at(-1);throw Error(JSON.stringify({header:last.header,error:last.error,response:last['review-response']}),{cause:error});}
  const saved=f.read(path);assert.deepEqual(withoutReviewResourceGuard(saved.attempts[0]!),withoutReviewResourceGuard(before));
  const body=await readTaskReviewHistory(f.repo,hash,'s1');assert.equal(body.status,'passed');assert.equal(body.reviews.length,2);
  assert.deepEqual(body.reviews[0]!.failedAttempt,withoutReviewResourceGuard(before));
  const tampered=structuredClone(body);tampered.reviews[0]!.tasks=[];tampered.reviews[0]!.summary='Cleared original error';assert.throws(()=>validateTaskBody(tampered),/feedback changed/);
  await eventually(()=>host.reviews.registry.cachedProgress({project:f.repo,family:'code',reviewId:id})?.phase==='complete');
  const approved=await approveArtifactByJsonPath(`${f.repo}/.insrc/artifacts/BUILD-${hash}-s1.json`,{lifecycle:lifecycleFor(f.repo).service,afterBuildApproval:()=>cleanupApprovedTaskReviews({repo:f.repo,epicHash:hash,storyId:'s1'})});
  assert.deepEqual(approved.cleanup?.errors,[]);assert.ok(approved.cleanup?.deleted.includes(path));
  assert.deepEqual(await readTaskReviewHistory(f.repo,hash,'s1'),body);
  const historical=await readTaskReviewProgress({repo:f.repo,epicHash:hash,storyId:'s1',reviewId:id,attempt:1}) as {status:string;hasError:boolean;totalTasks:number};
  assert.equal(historical.status,'failed');assert.equal(historical.hasError,true);assert.equal(historical.totalTasks,1);
  assert.equal(calls,2,'only the explicit new attempt may call its reviewer');
 }finally{client.close();await host.server.close();f.cleanup();}
});
