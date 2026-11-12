import { workerData } from 'node:worker_threads';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installReviewNativeSpawnGuard } from '../../../../shared/review-native-guard.js';
import type { LLMProvider,ReviewSessionOpts,StructuredSchema } from '../../../../shared/types.js';
import type { ReviewWorkerInit } from '../../review-worker-contract.js';
installReviewNativeSpawnGuard();
const {runReviewWorker}=await import('../../review-worker-runtime.js');
const {RegistryReviewSources}=await import('../../../../workflow/code-review/task-review/sources.js');
const {CliProvider}=await import('../../../../agent/providers/cli-provider.js');
const {reviewNativeTransport,runReviewNativeProcess}=await import('../../../../shared/review-process-bridge.js');
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
 if(id.startsWith('denied-')){
  const transport=reviewNativeTransport()!;
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
 return cli.runReviewSession(JSON.stringify({reply,reviewId:id,checkpointPath}),schema,opts);
}} as unknown as LLMProvider;
await runReviewWorker(init,init.review.key.family==='code'?{code:{sources,provider:()=>provider,publish:(project,reviewId,hash)=>publishTaskCheckpoint(project,hash,reviewId,{sources,through:roundWriterFor(project),save:saveWorkerCodeCheckpoint})}}:{design:{provider:()=>({provider,model:'fixture'}),publish:async cp=>publishDesignReview((await loadStoredDesignCheckpoint(cp.project,cp.reviewId))!)}});
