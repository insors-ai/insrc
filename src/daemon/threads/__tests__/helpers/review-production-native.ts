import { workerData } from 'node:worker_threads';
import { writeFile,access } from 'node:fs/promises';
import { join } from 'node:path';
import { installReviewNativeSpawnGuard } from '../../../../shared/review-native-guard.js';
import type { LLMProvider,ReviewSessionOpts,StructuredSchema } from '../../../../shared/types.js';
import type { ReviewWorkerInit } from '../../review-worker-contract.js';
installReviewNativeSpawnGuard();
const {runReviewWorker}=await import('../../review-worker-runtime.js');
const {RegistryReviewSources}=await import('../../../../workflow/code-review/task-review/sources.js');
const {CliProvider}=await import('../../../../agent/providers/cli-provider.js');
const {reviewNativeTransport,runReviewNativeProcess,withReviewNativeTransport}=await import('../../../../shared/review-process-bridge.js');
const {claudeReviewSessionArgs}=await import('../../../../agent/providers/cli-provider.js');
const {prepareDesignSubject}=await import('../../../../workflow/review/design-review/subject.js');
const {designCheckpointPath,loadStoredDesignCheckpoint}=await import('../../../../workflow/review/design-review/checkpoint.js');
const {publishDesignReview}=await import('../../../../workflow/review/design-review/publication.js');
const {publishTaskCheckpoint}=await import('../../../../workflow/code-review/task-review/publication.js');
const {saveWorkerCodeCheckpoint}=await import('../../../../workflow/code-review/task-review/worker-checkpoint.js');
const {roundWriterFor}=await import('../../../lifecycle-registry.js');
const init=workerData as ReviewWorkerInit,repo=init.review.key.project,id=init.review.key.reviewId;
const sources=new RegistryReviewSources({repoPath:repo,sessionId:'native-production-fixture',requestId:0,send:()=>{}});
const cli=new CliProvider({kind:'claude',model:'fixture',effort:'medium'});
let sequence=0;
const provider={capabilities:cli.capabilities,runReviewSession:async(prompt:string,schema:StructuredSchema,opts:ReviewSessionOpts)=>{
 const transport=reviewNativeTransport()!;
 if(id.startsWith('boundary-')&&await access(join(repo,'hold-'+id)).then(()=>true,()=>false)){
  const binary=await transport.resolveBinary('claude'),reservation=await transport.reserve({kind:'cli',command:binary,args:claudeReviewSessionArgs(schema,[]),cwd:repo});
  if(id.startsWith('boundary-save-'))await transport.saveOpenIntent(reservation);
  await writeFile(join(repo,'stage-'+id),JSON.stringify({operationId:reservation.operationId,stage:id.startsWith('boundary-save-')?'saved':'reserved'}));
  await new Promise(()=>{}); // Test kills only this registered worker.
 }
 if(id.startsWith('denied-')){
  const binary=await transport.resolveBinary('claude');
  await runReviewNativeProcess(transport,binary,['--dangerously-skip-permissions'],{cwd:repo,stdin:'{}',timeoutMs:1000});
  throw new Error('Denied fixture operation cannot produce an assessment');
 }
 let value:unknown;
 if(init.review.key.family==='code')value=prompt.startsWith('Derive task attribution')?{...(init.review.attempt>1?{summary:'Reassess after interrupted fixture'}:{}),tasks:[{taskId:'t1',changeIndexes:[0],testIndexes:[0],...(init.review.attempt>1?{action:'reassess',reason:'Previous execution did not finish'}:{})}]}:workerData.fixtureResult;
 else{
  const prepared=prepareDesignSubject(repo,init.review.route!.artifactPath!),selectors=prepared.inventory.units.map(u=>u.id);
  // Exercise the existing typed Git adapter as well as the CLI bridge for
  // design owners; the reference is pinned in fixture data, never HEAD.
  if(workerData.fixtureGit)await sources.file(workerData.fixtureGit.commit,workerData.fixtureGit.path);
  const raw=prompt.match(/Chunk assignment: (.+)\n/)?.[1],chunk=raw?JSON.parse(raw) as {id:string}:undefined;
  value=chunk?{chunkId:chunk.id,status:'passed',summary:'Fixture native assessment',findings:[],inspectedReferences:[...selectors,prepared.subject.documentPath,designCheckpointPath(repo,id)],limitations:[],advice:[]}:{chunks:[{id:'content',title:'Coherent content',selectors,concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Complete scope followed by consistency',finalConsistencyChunkId:'final',coverage:selectors.map(unitId=>({unitId,chunkIds:['content']}))};
 }
 const reply=join(repo,`.native-${id}-${++sequence}.json`);await writeFile(reply,JSON.stringify(value));
 const checkpointPath=join(repo,'.insrc/tmp',init.review.key.family==='code'?'code-review':'design-review',`${id}.json`);
 let active=0,maxActive=0,maxFrameBytes=0,totalBytes=0,frames=0;
 try{return await withReviewNativeTransport({
  resolveBinary:c=>transport.resolveBinary(c),reserve:c=>transport.reserve(c),saveOpenIntent:r=>transport.saveOpenIntent(r),waitStarted:r=>transport.waitStarted(r),write:(r,b,e)=>transport.write(r,b,e),cancel:r=>transport.cancel(r),saveClosedIntent:r=>transport.saveClosedIntent(r),
  start:(r,receipt,consume)=>transport.start(r,receipt,async output=>{active++;maxActive=Math.max(maxActive,active);maxFrameBytes=Math.max(maxFrameBytes,output.bytes.byteLength);totalBytes+=output.bytes.byteLength;frames++;await new Promise(resolve=>setTimeout(resolve,2));try{await consume(output);}finally{active--;}}),
 },()=>cli.runReviewSession(JSON.stringify({reply,reviewId:id,checkpointPath}),schema,opts));}
 finally{await writeFile(join(repo,`byte-proof-${id}.json`),JSON.stringify({maxActive,maxFrameBytes,totalBytes,frames}));}
}} as unknown as LLMProvider;
await runReviewWorker(init,init.review.key.family==='code'?{code:{sources,provider:()=>provider,publish:(project,reviewId,hash)=>publishTaskCheckpoint(project,hash,reviewId,{sources,through:roundWriterFor(project),save:saveWorkerCodeCheckpoint})}}:{design:{provider:()=>({provider,model:'fixture'}),publish:async cp=>publishDesignReview((await loadStoredDesignCheckpoint(cp.project,cp.reviewId))!)}});
