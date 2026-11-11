import { workerData } from 'node:worker_threads';
import type { ActivityReviewSessionOpts,LLMProvider } from '../../../../../shared/types.js';
import type { ReviewWorkerInit } from '../../../../../daemon/threads/review-worker-contract.js';
import { installReviewNativeSpawnGuard } from '../../../../../shared/review-native-guard.js';
installReviewNativeSpawnGuard();
const {runReviewWorker}=await import('../../../../../daemon/threads/review-worker-runtime.js');
const {prepareDesignSubject}=await import('../../subject.js');
const {loadStoredDesignCheckpoint,designCheckpointPath}=await import('../../checkpoint.js');
const {loadWorkerDesignCheckpoint}=await import('../../worker-checkpoint.js');
const {isDesignAdmission}=await import('../../contracts.js');
const init=workerData as ReviewWorkerInit,barrier=new Int32Array(workerData.fixtureBarrier as SharedArrayBuffer);
let prepared:ReturnType<typeof prepareDesignSubject>;
await runReviewWorker(init,{design:{
 load:async(project,id)=>{
  if(Atomics.load(barrier,3)===1){Atomics.store(barrier,4,1);while(Atomics.load(barrier,3)===1)Atomics.wait(barrier,3,1,1000);}
  return loadWorkerDesignCheckpoint(project,id);
 },
 publish:async cp=>({reviewId:cp.reviewId,attempt:cp.attempts.at(-1)!.number,state:'complete',artifactHistoryEntryId:'fixture-publication',reportReference:'fixture-report'}),
 subjectMonitor:{pollMs:5},
 prepare:(project,path)=>{
  Atomics.store(barrier,0,1);
  while(Atomics.load(barrier,1)===0)Atomics.wait(barrier,1,0,1000);
  prepared=prepareDesignSubject(project,path);return prepared;
 },
 provider:()=>({model:'deterministic-worker-fixture',provider:{capabilities:{reviewActivity:true},runReviewSession:async(prompt:string,_schema:unknown,opts:ActivityReviewSessionOpts)=>{
  Atomics.add(barrier,2,1);
  const cp=await loadStoredDesignCheckpoint(init.review.key.project,init.review.key.reviewId);
  if(!cp||isDesignAdmission(cp.attempts.at(-1)!))throw new Error('Provider dispatched before qualified save');
  const raw=prompt.match(/Chunk assignment: (.+)\n/)?.[1],chunk=raw?JSON.parse(raw) as {id:string}:undefined;
  const plan={chunks:[{id:'content',title:'Coherent scope',selectors:prepared.inventory.units.map(u=>u.id),concerns:['Requirements and responsibility'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Whole artifact consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All current units, then consistency',finalConsistencyChunkId:'final',coverage:prepared.inventory.units.map(u=>({unitId:u.id,chunkIds:['content']}))};
  const value=chunk?{chunkId:chunk.id,status:'passed',summary:'Deterministic fixture assessment',findings:[],inspectedReferences:[...prepared.inventory.units.map(u=>u.id),prepared.subject.documentPath,designCheckpointPath(init.review.key.project,init.review.key.reviewId)],limitations:[],advice:[]}:plan;
  await opts.onActivity({sessionId:`fixture-${Atomics.load(barrier,2)}`,sequence:1,kind:'session_started'});
  const accepted=await opts.onCandidate(value);if(!accepted.accepted)throw new Error('Fixture candidate rejected');return value;
 }} as unknown as LLMProvider}),
}});
