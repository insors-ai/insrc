import test from 'node:test';
import assert from 'node:assert/strict';
import { cp,mkdtemp,rm,symlink,writeFile,mkdir,chmod,readFile,access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join,resolve } from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import ts from 'typescript';
import { fixture,hash } from '../../../workflow/code-review/task-review/__tests__/publication-fixture.js';
import { designFixture } from '../../../workflow/review/design-review/__tests__/fixtures.js';
import { LocalPeer,until } from './helpers/review-clearance-fixture.js';

test('compiled worker entrypoints and both review families start from an isolated built package',async t=>{
 const root=await mkdtemp('/tmp/irwp-'),out=join(root,'out'),code=await fixture();let cleanDesign=()=>{};const design=designFixture({after:fn=>{cleanDesign=fn;}});
 await cp(resolve('out'),out,{recursive:true});await symlink(resolve('node_modules'),join(root,'node_modules'),'dir');await writeFile(join(root,'package.json'),'{"type":"module"}');
 // The release build deliberately excludes tests. Compile only the reusable
 // harness separately into the disposable package; the child has no loader,
 // TypeScript files or source tree. All production imports are the built JS.
 const helpers=join(out,'daemon/threads/__tests__/helpers');await mkdir(helpers,{recursive:true});
 for(const name of ['review-production-daemon','review-production-native','review-worker-rpc']){
  const source=await readFile(`src/daemon/threads/__tests__/helpers/${name}.ts`,'utf8');
  await writeFile(join(helpers,name+'.js'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
 }
 assert.equal(await access(join(root,'src')).then(()=>true,()=>false),false);
 for(const entry of ['daemon/threads/review-worker.js','daemon/threads/review-resource-worker.js','daemon/threads/review-cleanup-discovery.js','daemon/threads/review-worker-native.js','workflow/review/design-review/contracts.js','workflow/code-review/task-review/contracts.js'])await access(join(out,entry));
 await access(join(out,'bin/insrc-process-broker'),constants.X_OK);await access(join(out,'bin/insrc-shutdown-watchdog.js'));
 await writeFile(join(design.repo,'.insrc/schema.json'),'{"version":2}');
 const bin=join(root,'bin');await mkdir(bin);
 const executable=`#!${process.execPath}
import fs from 'node:fs';import path from 'node:path';let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{const p=JSON.parse(input),a=JSON.parse(fs.readFileSync(p.checkpointPath,'utf8')).attempts.at(-1);if(a.phase==='admission'||!a.resourceGuard?.openLeases.length)process.exit(91);fs.appendFileSync(path.join(process.cwd(),'package-cli.jsonl'),JSON.stringify({reviewId:p.reviewId,pid:process.pid})+'\\n');process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'out',name:'StructuredOutput',input:JSON.parse(fs.readFileSync(p.reply,'utf8'))}]}})+'\\n');setInterval(()=>{},1000);});`;
 await writeFile(join(bin,'claude'),executable);await chmod(join(bin,'claude'),0o755);
 const socket=join(root,'review.sock'),config=join(root,'config.json');await writeFile(config,JSON.stringify({repos:[code.repo,design.repo],socket,bin,results:{[code.repo]:code.result},git:{}}));
 const child=fork(join(out,'daemon/threads/__tests__/helpers/review-production-daemon.js'),[config],{cwd:root,execArgv:[],stdio:['ignore','ignore','pipe','ipc']});let diagnostic='';child.stderr!.on('data',s=>{diagnostic=(diagnostic+String(s)).slice(-8000);});
 const peers:LocalPeer[]=[];t.after(async()=>{for(const p of peers)p.close();if(child.exitCode===null&&child.signalCode===null){const exit=once(child,'exit');child.send('stop');const timer=setTimeout(()=>child.kill('SIGKILL'),10000);await exit;clearTimeout(timer);}cleanDesign();code.cleanup();await rm(root,{recursive:true,force:true});});
 await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error(diagnostic);}),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Compiled fixture bootstrap: '+diagnostic)),15000).unref())]);
 const peer=await LocalPeer.connect(socket);peers.push(peer);
 for(const family of ['code','design'] as const){
  const request={repo:family==='code'?code.repo:design.repo,family,epicHash:hash,artifactPath:design.json,packet:code.packet,reviewId:`entry-${family}`};
  const description=await peer.call('fixture.bootstrap',request);
  assert.ok(description.threadId>0);assert.equal(description.coordinator,family==='code'?'TaskReviewCoordinator':'DesignReviewCoordinator');assert.equal(description.nativeBound,true);assert.equal(description.storeOwnerDeclared,true);
  await peer.call('fixture.terminate',request);
 }
 const codeBase={repo:code.repo,epicHash:hash,reviewId:'package-code',attempt:1},designBase={repo:design.repo,reviewId:'package-design',attempt:1};
 await peer.call('taskReview.start',{...codeBase,packet:code.packet});await peer.call('designReview.start',{...designBase,artifactPath:design.json});
 for(const [method,request] of [['taskReview',codeBase],['designReview',designBase]] as const){
  await until(async()=>{const p=await peer.call(method+'.progress',request);if(p.status==='failed')throw Error(JSON.stringify(p));return p.status==='passed';});
 }
 const a=await peer.call('fixture.describe',codeBase),b=await peer.call('fixture.describe',designBase);assert.notEqual(a.threadId,b.threadId);
 const count=async()=> (await Promise.all([code.repo,design.repo].map(repo=>readFile(join(repo,'package-cli.jsonl'),'utf8')))).join('').trim().split('\n').length;
 const calls=await count();assert.ok(calls>=4);
 await peer.call('fixture.terminate',codeBase);await peer.call('fixture.terminate',designBase);
 // The compiled host must also accept independently authored controller
 // feedback; the daemon provider must remain unused on these routes.
 code.build.meta.authoredBy='daemon';code.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,code.build);
 const raw=JSON.parse(await readFile(design.json,'utf8'));raw.meta.authoredBy='daemon';await writeFile(design.json,JSON.stringify(raw));
 const cc={...codeBase,reviewId:'package-controller-code'},dd={...designBase,reviewId:'package-controller-design'};
 assert.equal((await peer.call('taskReview.start',{...cc,packet:code.packet,timingProtocol:'activity-v1'})).reviewer,'controller');
 let frame:any;await until(async()=>{frame=await peer.call('taskReview.assignment',cc);return frame.kind==='task';});
 assert.equal((await peer.call('taskReview.result',{...cc,taskId:frame.taskId,executionId:frame.executionId,sequence:frame.nextSequence,result:code.result})).kind,'done');
 assert.equal((await peer.call('designReview.start',{...dd,artifactPath:design.json})).reviewer,'controller');
 await until(async()=>{frame=(await peer.call('designReview.assignment',dd)).assignment;return!!frame;});
 const selectors=design.prepared.inventory.units.map(u=>u.id),plan={chunks:[{id:'content',title:'Content',selectors,concerns:['Requirements'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'Complete compiled scope',finalConsistencyChunkId:'final',coverage:selectors.map(unitId=>({unitId,chunkIds:['content']}))};
 await peer.call('designReview.plan',{...dd,executionId:frame.executionId,sequence:1,plan});
 for(const chunkId of ['content','final']){await until(async()=>{frame=(await peer.call('designReview.assignment',dd)).assignment;return!!frame;});await peer.call('designReview.result',{...dd,executionId:frame.executionId,sequence:1,result:{chunkId,status:'passed',summary:'Compiled controller assessment',findings:[],inspectedReferences:[...selectors,design.md,`${design.repo}/.insrc/tmp/design-review/${dd.reviewId}.json`],limitations:[],advice:[]}});}
 await until(async()=> (await peer.call('designReview.progress',dd)).status==='passed');assert.equal(await count(),calls);
});

test('release instructions retain explicit recovery local trust and post-approval smoke ordering',async()=>{
 const daemon=await readFile('docs/daemon.md','utf8'),workflow=await readFile('docs/workflow.md','utf8');
 const section=daemon.slice(daemon.indexOf('### Dedicated review workers and recovery'));
 assert.match(section,/automated local client/);assert.match(section,/Callers cannot\s+supply approval receipts/);assert.match(section,/separate explicit\s+recovery or new attempt/);assert.match(section,/64 MiB source\/projection/);
 const ordered=['1. Finish source','2. Complete the independent whole-story code review','3. Obtain human BUILD approval','4. Coordinate active reviews','5. Only then push/publish','6. Restart the daemon and reconnect MCP','7. Run a controlled deployed smoke'];
 let before=-1;for(const step of ordered){const at=section.indexOf(step);assert.ok(at>before,`Missing/reordered release step: ${step}`);before=at;}
 assert.match(workflow,/daemon\.md#dedicated-review-workers-and-recovery/);assert.match(workflow,/no new trust keys or activation flags/);assert.match(workflow,/TU1's separate 64 MiB/);
});
