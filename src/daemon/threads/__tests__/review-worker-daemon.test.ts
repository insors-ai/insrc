import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,chmod,rename,rm,readlink,access } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture,hash } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { designFixture } from '../../../workflow/review/design-review/__tests__/fixtures.js';
import { startDaemon } from '../../../mcp/__tests__/helpers/mcp-e2e.js';
import type { RunningDaemon } from '../../../mcp/__tests__/helpers/mcp-e2e.js';
import { LocalPeer,until,pause } from './helpers/review-clearance-fixture.js';
import { inspectReviewResources } from '../../../workflow/review/resource-recovery.js';
import { updateStoredCodeCheckpoint } from '../../../workflow/code-review/task-review/checkpoint.js';
import { updateStoredDesignCheckpoint } from '../../../workflow/review/design-review/checkpoint.js';

async function ended(pid:number):Promise<boolean>{try{return /\) Z /.test(await readFile(`/proc/${pid}/stat`,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return true;throw error;}}

test('full daemon entrypoint retains both-family crash fences and failed-attempt recovery through public routes',async t=>{
 const code=await fixture();let cleanDesign=()=>{};const design=designFixture({after:fn=>{cleanDesign=fn;}});
 await rm(join(code.repo,'.insrc/tmp/code-review/publication.json'));
 const home=await mkdtemp('/tmp/irw-'),root=join(home,'.insrc'),bin=join(home,'bin');await mkdir(root);await mkdir(bin);
 await writeFile(join(design.repo,'.insrc/schema.json'),'{"version":2}');
 await writeFile(join(root,'config.json'),JSON.stringify({daemon:{threads:{enabled:false}},models:{local:{host:'http://127.0.0.1:9'},tiers:{core:{runner:'cli-claude',model:'sonnet',effort:'medium'},mid:{runner:'cli-claude',model:'sonnet',effort:'medium'}}}}));
 for(const repo of [code.repo,design.repo])await writeFile(join(repo,'.fixture-result.json'),JSON.stringify({result:code.result,selectors:design.prepared.inventory.units.map(u=>u.id),document:design.md}));
 // The actual daemon creates its unmodified workers and providers. Only the
 // external executable is synthetic; it reads the real schema and checkpoint.
 const executable=`#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>prompt+=s);process.stdin.on('end',()=>{
 const repo=process.cwd(),data=JSON.parse(fs.readFileSync(path.join(repo,'.fixture-result.json'),'utf8')),id=fs.readFileSync(path.join(repo,'.fixture-review'),'utf8'),family=id.startsWith('full-design')?'design':'code';
 const cpPath=path.join(repo,'.insrc/tmp',family+'-review',id+'.json'),cp=JSON.parse(fs.readFileSync(cpPath,'utf8')),a=cp.attempts.at(-1);
 if(a.phase==='admission'||!a.resourceGuard?.openLeases.length)process.exit(91);
 fs.appendFileSync(path.join(repo,'full-spawns.jsonl'),JSON.stringify({pid:process.pid,reviewId:id,leases:a.resourceGuard.openLeases})+'\\n');
 process.stdout.write(JSON.stringify({type:'system',subtype:'init',session_id:'full-'+process.pid})+'\\n');
 if(!fs.existsSync(path.join(repo,'hold-'+id))){
  const args=process.argv.slice(2),schema=JSON.parse(args[args.indexOf('--json-schema')+1]);let result=data.result;
  if(schema.properties?.tasks)result={...(a.header?.attempt>1?{summary:'Reassess failed predecessor'}:{}),tasks:[{taskId:'t1',changeIndexes:[0],testIndexes:[0],...(a.header?.attempt>1?{action:'reassess',reason:'Previous attempt did not complete'}:{})}]};
  if(family==='design'){
   const chunk=prompt.match(/Chunk assignment: (.+)\\n/),selectors=data.selectors;
   result=chunk?{chunkId:JSON.parse(chunk[1]).id,status:'passed',summary:'Native full daemon fixture',findings:[],inspectedReferences:[...selectors,data.document,cpPath],limitations:[],advice:[]}:{chunks:[{id:'content',title:'Content',selectors,concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Complete fixture scope',finalConsistencyChunkId:'final',coverage:selectors.map(unitId=>({unitId,chunkIds:['content']}))};
  }
  process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'out',name:'StructuredOutput',input:result}]}})+'\\n');
 }
 setInterval(()=>{},1000);
});`;
 await writeFile(join(bin,'claude'),executable);await chmod(join(bin,'claude'),0o755);
 let daemon:RunningDaemon|undefined;const peers:LocalPeer[]=[],children=new Map<number,string>();
 const stop=async()=>{for(const p of peers)p.close();await daemon?.stop();daemon=undefined;};
 t.after(async()=>{await stop();for(const [pid,repo] of children)try{if(await readlink(`/proc/${pid}/cwd`)===repo)process.kill(-pid,'SIGKILL');}catch{}cleanDesign();code.cleanup();await rm(home,{recursive:true,force:true});});
 const start=async()=>{daemon=await startDaemon(home,{env:{PATH:bin+':'+process.env['PATH']}});const p=await LocalPeer.connect(daemon.sock);peers.push(p);return p;};
 let peer=await start();for(const repo of [code.repo,design.repo])await peer.call('repo.add',{path:repo});
 const cleanupCases:Array<{family:'code'|'design';repo:string;method:string;request:{repo:string;reviewId:string;attempt:number};crashId:string;artifactPath:string}>=[];
 const spawns=async(repo:string)=>{try{return(await readFile(join(repo,'full-spawns.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s) as {pid:number;reviewId:string;leases:Array<{operationId:string}>});}catch{return[];}};
 for(const family of ['code','design'] as const){
  const repo=family==='code'?code.repo:design.repo,method=family==='code'?'codeReview.task':'designReview',id=`full-${family}-failed`;
  const base={repo,reviewId:id,attempt:1,...(family==='code'?{epicHash:hash}:{})};
  await writeFile(join(repo,'.fixture-review'),id);
  const document=await readFile(design.md,'utf8');if(family==='design')await rm(design.md);
  const bad=family==='code'?{packet:{...code.packet,reviewSet:code.packet.reviewSet.map(c=>({...c,files:[{path:'not-selected.js',segments:[{after:[1,1]}]}]}))}}:{artifactPath:design.json};
  const ack=await peer.call(method+'.start',{...base,...bad});
  let progress:any;await until(async()=>{progress=await peer.call(method+'.progress',base);return progress.status==='failed';});
  const path=ack.path??ack.checkpointPath,old=JSON.parse(await readFile(path,'utf8')).attempts[0];
  const resume={...base,...(family==='code'?{operation:'resume'}:{phase:'recover',operation:'resume',actionId:'failed-resume'})};
  await assert.rejects(peer.call(method+(family==='code'?'.start':'.recover'),resume),/Failed review requires the next attempt/);
  if(family==='design')await writeFile(design.md,document);
  const next={...base,attempt:2,...(family==='code'?{packet:code.packet}:{artifactPath:design.json})};
  await until(async()=>{try{await peer.call(method+'.start',next);return true;}catch(error){if(!/fenced|reclaimed|closed/.test(String(error)))throw error;return false;}});
  await until(async()=>{const p=await peer.call(method+'.progress',{...base,attempt:2});if(p.status==='failed')throw Error(JSON.stringify(p));return p.status==='passed';});
  assert.deepEqual(JSON.parse(await readFile(path,'utf8')).attempts[0],old,'failed input and feedback are immutable across explicit new attempts');
  await stop();
  // Model a closure acknowledgment lost on an older retained attempt. The
  // current successful successor is deliberately resource-closed; public
  // recovery must inspect the entire history, not only that successor.
  const lease={operationId:`retained-first-${family}`,workerIncarnation:'ended-fixture-owner',kind:'cli',openedAt:new Date().toISOString()};
  if(family==='code')await updateStoredCodeCheckpoint(path,cp=>({...cp!,schemaVersion:2,attempts:cp!.attempts.map((a,i)=>i?a:{...a,resourceGuard:{daemonInstance:'ended-fixture-daemon',openLeases:[lease]}})}));
  else await updateStoredDesignCheckpoint(repo,id,cp=>({...cp!,schemaVersion:2,attempts:cp!.attempts.map((a,i)=>i?a:{...a,resourceGuard:{daemonInstance:'ended-fixture-daemon',openLeases:[lease]}})}));
  peer=await start();
  const retainedResume={...resume,attempt:2},retainedRoute=method+(family==='code'?'.start':'.recover');
  assert.equal((await peer.call(retainedRoute,retainedResume)).status,'resource_recovery_required');
  const beforeRetained=(await spawns(repo)).length;peer.subscribe();await pause();
  const clearRetained=peer.call(retainedRoute,{...retainedResume,resourceRecovery:{reason:'Verified older fixture owner ended',leaseIds:[lease.operationId]}}),retainedApproval=await peer.request();
  await peer.call('approval.answer',{requestId:retainedApproval.requestId,decision:'approve'});assert.equal((await clearRetained).status,'cleared');
  assert.equal((await spawns(repo)).length,beforeRetained,'historical clearance is model-free');
  assert.equal((await peer.call(retainedRoute,{...retainedResume,resourceRecovery:{reason:'Retained receipt replay'}})).status,'already-clear');
  await stop();peer=await start();
  const crashId=`full-${family}-crash`,key={project:repo,family,reviewId:crashId},request={...base,reviewId:crashId};
  await writeFile(join(repo,'.fixture-review'),crashId);await writeFile(join(repo,'hold-'+crashId),'fixture child barrier');
  await peer.call(method+'.start',{...request,...(family==='code'?{packet:code.packet}:{artifactPath:design.json})});
  await until(async()=> (await spawns(repo)).some(s=>s.reviewId===crashId));
  const child=(await spawns(repo)).find(s=>s.reviewId===crashId)!;children.set(child.pid,repo);
  const before=await inspectReviewResources(key);assert.ok(before.remaining);
  const killed=daemon!;process.kill(killed.pid,'SIGKILL');await until(()=>ended(killed.pid));daemon=undefined;peer.close();
  assert.equal(await readlink(`/proc/${child.pid}/cwd`),repo);
  // Exact fixture guard quarantine follows verified death of its original
  // daemon. No user guard/socket/process is inspected or changed.
  const guard=join(root,'daemon.run-files.guard');const ownerText=await readFile(join(guard,'owner.json'),'utf8').catch(error=>{if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;});
  if(ownerText){assert.equal(JSON.parse(ownerText).pid,killed.pid);await rename(guard,guard+`.quarantine-${family}`);}
  else assert.equal(await access(guard).then(()=>true,()=>false),false,'no unverifiable guard may be reclaimed');
  peer=await start();
  const recover={...request,...(family==='code'?{operation:'resume'}:{phase:'recover',operation:'resume',actionId:'full-explicit-resume'})},route=method+(family==='code'?'.start':'.recover');
  assert.equal((await peer.call(route,recover)).status,'resource_recovery_required');
  await assert.rejects(peer.call(route,{...recover,resourceRecovery:{reason:'Wrong review lease set',leaseIds:['foreign-operation']}}),/exact set/);
  await assert.rejects(peer.call(route,{...recover,reviewId:'different-review',resourceRecovery:{reason:'Foreign review operations',leaseIds:child.leases.map(l=>l.operationId)}}),/locator|checkpoint|Stored|Canonical/);
  const otherId=`full-code-unrelated-${family}`,other={repo:code.repo,epicHash:hash,reviewId:otherId,attempt:1};
  await writeFile(join(code.repo,'.fixture-review'),otherId);await peer.call('codeReview.task.start',{...other,packet:code.packet});
  let otherProgress:any;
  try{await until(async()=>{otherProgress=await peer.call('codeReview.task.progress',other);if(['failed','incomplete'].includes(otherProgress.status))throw Error(JSON.stringify(otherProgress));return otherProgress.status==='passed';});}
  catch(error){throw Error(`Unrelated full daemon review: ${JSON.stringify(otherProgress)}`,{cause:error});}
  assert.equal((await spawns(repo)).filter(s=>s.reviewId===crashId).length,1);
  process.kill(-child.pid,'SIGKILL');await until(()=>ended(child.pid));children.delete(child.pid);
  assert.equal((await peer.call(route,recover)).status,'resource_recovery_required');
  peer.subscribe();await pause();const clearing=peer.call(route,{...recover,resourceRecovery:{reason:'Observed exact fixture native child exit',leaseIds:child.leases.map(l=>l.operationId)}}),approval=await peer.request();
  await peer.call('approval.answer',{requestId:approval.requestId,decision:'approve'});assert.equal((await clearing).status,'cleared');
  assert.equal((await peer.call('approval.answer',{requestId:approval.requestId,decision:'approve'})).accepted,false,'stale broker answers never grant new clearance');
  assert.equal((await spawns(repo)).filter(s=>s.reviewId===crashId).length,1);
  assert.equal((await peer.call(route,{...recover,resourceRecovery:{reason:'Replay lost clearance reply'}})).status,'already-clear');
  await assert.rejects(peer.call(route,{...recover,resourceRecovery:{reason:'Stale selection',leaseIds:child.leases.map(l=>l.operationId),approvalReceipt:approval}}),/caller approval receipts/);
  await rm(join(repo,'hold-'+crashId));await writeFile(join(repo,'.fixture-review'),crashId);await peer.call(route,recover);
  await until(async()=>{const p=await peer.call(method+'.progress',request);if(p.status==='failed')throw Error(JSON.stringify(p));return p.status==='passed';});
  const callsAfterReview=(await spawns(repo)).length;
  const publish=family==='code'?()=>peer.call(method+'.publish',request):()=>peer.call(method+'.recover',{...request,phase:'recover',operation:'retry_publication',actionId:'full-publication-replay'});
  await publish();await publish();
  if(family==='design')await until(async()=>{const p=await peer.call(method+'.progress',request);if(p.publication?.error)throw Error(JSON.stringify(p));return p.publication?.state==='complete'&&p.publication.actions?.some((a:{actionId:string})=>a.actionId==='full-publication-replay');});
  assert.equal((await spawns(repo)).length,callsAfterReview,'publication replay cannot call a provider');
  cleanupCases.push({family,repo,method,request,crashId,artifactPath:family==='code'?join(repo,`.insrc/artifacts/BUILD-${hash}-s1.json`):design.json});
  await stop();peer=await start();
 }
 // Approve only after all submissions. A built Story is deliberately not a
 // mutable publication target for a later unrelated fixture review.
 for(const {family,repo,method,request,crashId,artifactPath} of cleanupCases){
  const callsAfterReview=(await spawns(repo)).length;
  // This isolated fixture simulates the ordinary user approval RPC; its real
  // post-approval consumer must publish/preserve history before deleting CPs.
  const approved=await peer.call('workflow.approve',{repo,artifactPath,overrideReview:'Isolated lifecycle qualification fixture, not user work'});
  assert.equal(approved.approved?.length,1,JSON.stringify(approved));
  const cpPath=join(repo,'.insrc/tmp',`${family}-review`,crashId+'.json');
  assert.equal(await access(cpPath).then(()=>true,()=>false),false,`real ${family} post-approval cleanup: ${JSON.stringify(approved)}`);
  const permanent=await peer.call(method+'.progress',{...request,...(family==='code'?{storyId:'s1'}:{artifactPath:design.json})});
  assert.equal(permanent.status,'passed');
  await peer.call('workflow.approve',{repo,artifactPath,overrideReview:'Idempotent isolated fixture replay'});
  assert.equal((await spawns(repo)).length,callsAfterReview,'approval/cleanup replay remains model-free');
 }
});
