/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,chmodSync,rmSync,realpathSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCodexInvestigationSession,codexInvestigationArgs,codexInvestigationLaunchDigest,CODEX_INVESTIGATION_DISABLED_FEATURES } from '../codex-investigation-session.js';
import { codexStrictSchema } from '../structured-output.js';
import { createInvestigationPolicy } from '../../../workflow/code-review/investigation/continuation-policy.js';
import { CliProvider } from '../cli-provider.js';
import { tmpdir } from 'node:os';
import { runClaudeInvestigationSession,nativeReviewMcpConfiguration,claudeInvestigationArgs,claudeInvestigationLaunchDigest,nativeInvestigationEnvironment } from '../claude-investigation-session.js';
import { qualifyInvestigationAdapter,createQualifiedInvestigationBinding,investigationFileDigest,drainInvestigationInvocation,ISOLATION_DENIAL_PROBES } from '../investigation-session.js';
import type { NativeIsolationEvidence } from '../investigation-session.js';
import { scopedReviewCatalogDigest,scopedReviewToolCatalog } from '../../../shared/review-investigation-catalog.js';
import { InvestigationReplySchema } from '../../../shared/review-investigation.js';
import { recoveryFixture } from '../../../workflow/code-review/investigation/__tests__/recovery-fixtures.js';
import { runRecoveredContinuation } from '../../../workflow/code-review/investigation/recovery-session.js';
import { digestValue } from '../../../workflow/code-review/investigation/identity.js';
import { runInProcessGroup } from '../../../shared/process-group.js';

const actor=`import {readFileSync,writeFileSync} from 'node:fs';
import {createConnection} from 'node:net';
const args=process.argv.slice(2),cwd=process.cwd();let stdin='';for await(const c of process.stdin)stdin+=c;
const frame=JSON.parse(stdin.split('\\n\\n').at(-1)),turn=frame.turn;
const codex=args[0]==='exec';const mcp=JSON.parse(readFileSync(codex?cwd+'/investigation-mcp.json':args[args.indexOf('--mcp-config')+1],'utf8'));
const path=mcp.mcpServers['insrc-scoped-review'].args.find(x=>x.endsWith('investigation-binding.json'));
const config=JSON.parse(readFileSync(path,'utf8')),{expiresAt,...binding}=config.binding;
writeFileSync(new URL('./called.json',import.meta.url),JSON.stringify({args,cwd,env:{HOME:process.env.HOME,NODE_OPTIONS:process.env.NODE_OPTIONS,ANTHROPIC_API_KEY:process.env.ANTHROPIC_API_KEY}}));
async function call(operation,data){return await new Promise((yes,no)=>{const s=createConnection(config.socket);let text='';s.setEncoding('utf8');s.on('error',no);s.on('connect',()=>s.write(JSON.stringify({...binding,operation,...data})+'\\n'));s.on('data',c=>{text+=c;const i=text.indexOf('\\n');if(i<0)return;const r=JSON.parse(text.slice(0,i));s.destroy();if(r.ok)yes(r.result);else no(Error('refused'));});});}
const progress=(blockId,expectedSequence)=>({runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,progressId:turn.attemptId+'-'+blockId,expectedSequence,blockId,disposition:'unverified',evidenceIds:[],notes:'Fixture inspected scope; more evidence required',coverageUpdates:[],findings:[],outstandingWork:[]});
const first=await call('progress',{progress:progress('block-1',0)});await call('progress',{progress:progress('block-1',0)});
const mode=readFileSync(new URL('./mode.txt',import.meta.url),'utf8');if(mode==='cancel'||mode==='stall')await new Promise(r=>setTimeout(r,10000));
const second=await call('progress',{progress:progress('block-2',1)});
const reply={runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,acceptedBlockReceiptIds:[first.progressId,second.progressId],lastAcceptedSequence:2,inspectedEvidenceIds:[],coverageUpdates:[],findings:[],next:{kind:'pause',remainingWork:[],reason:'Fixture requires more evidence'}};
await call('reply',{reply});const final=mode==='bad-final'?{...reply,generation:turn.generation+1}:reply;process.stdout.write(codex?JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(final)}})+'\\n':JSON.stringify({structured_output:final,is_error:false}));
`;
export async function exerciseNativeInvestigationSessions(kind:'claude'|'codex'){
 for(const mode of ['complete','cancel','stall','bad-final'] as const){
  const f=recoveryFixture(),cwd=mkdtempSync(join(tmpdir(),'rv-cli-'));try{
   const codex=kind==='codex',profile={...f.context.policy.budget.profile,schemaDialect:codex?'codex-strict-v1' as const:'json-v1' as const};
   f.provider.getReviewBudgetProfile=()=>profile;const policy=createInvestigationPolicy(f.provider);
   const context={...f.context,policy,backend:{...f.context.backend,qualification:{...f.context.backend.qualification,profileDigest:digestValue(profile)}}};
   const manifest={...f.manifest,policy,policyDigest:policy.digest},baseTurn={...f.turn,policyDigest:policy.digest};
   const run=codex?runCodexInvestigationSession:runClaudeInvestigationSession,buildArgs=codex?codexInvestigationArgs:claudeInvestigationArgs,version=kind+'-scoped-v1';
   const bin=join(f.repo,`fake-${kind}.mjs`);writeFileSync(bin,`#!${process.execPath}\n${actor}`);chmodSync(bin,0o700);writeFileSync(join(f.repo,'mode.txt'),mode);
   const schema=JSON.parse(JSON.stringify(InvestigationReplySchema)),modelArgs:string[]=[],args=buildArgs(schema,modelArgs,cwd,false),mcp=nativeReviewMcpConfiguration(cwd,false);
   if(codex){assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('--ignore-rules'));assert.ok(args.includes('--strict-config'));for(const name of CODEX_INVESTIGATION_DISABLED_FEATURES)assert.ok(args.includes(name));
    const table=args.find(a=>a.startsWith('mcp_servers='))!;const parsed=JSON.parse(execFileSync('python3',['-c','import tomllib,json,sys; print(json.dumps(tomllib.loads(sys.stdin.read())))'],{input:table,encoding:'utf8'}));assert.deepEqual(parsed.mcp_servers['insrc-scoped-review'].args,mcp.mcpServers['insrc-scoped-review'].args);
   }else{assert.ok(args.includes('--safe-mode'));assert.ok(!args.includes('--bare'));assert.ok(args.includes('--strict-mcp-config'));assert.equal(args[args.indexOf('--tools')+1],'');}
   const settings=join(cwd,'investigation-settings.json'),mcpFile=join(cwd,'investigation-mcp.json');if(!codex)writeFileSync(settings,'{}',{mode:0o600});writeFileSync(mcpFile,JSON.stringify(mcp),{mode:0o600});
   const file=(path:string)=>({path:realpathSync(path),digest:investigationFileDigest(realpathSync(path))});
   const command=mcp.mcpServers['insrc-scoped-review'],entry=command.args.find(p=>p.endsWith('/insrc-review-bridge.ts')||p.endsWith('/insrc-review-bridge.js'))!;
   const identity={kind,adapterVersion:version,binaryVersion:'scripted-fixture',binary:file(bin),runtimeFiles:[file(command.command),file(entry)],profileDigest:digestValue(profile),catalogDigest:scopedReviewCatalogDigest(false),launchDigest:codex?codexInvestigationLaunchDigest(args,cwd,schema):claudeInvestigationLaunchDigest(args,cwd)};
   const effective={cwd,configFiles:[...(!codex?[file(settings)]:[]),file(mcpFile)],builtinTools:[],inheritedConfigSources:[],mcpServers:['insrc-scoped-review'],plugins:[],hooks:[],repositoryInstructions:[],credentialCopies:[],auth:'existing-cli-oauth' as const,catalog:JSON.parse(JSON.stringify(scopedReviewToolCatalog(false))) as unknown[]};
   const evidence:NativeIsolationEvidence={version:1,identity,effective,validUntil:Date.now()+60000,trace:{effectiveDigest:digestValue(effective),events:[...ISOLATION_DENIAL_PROBES.map(capability=>({kind:'denied' as const,capability})),{kind:'block-ack',sequence:1},{kind:'block-ack',sequence:2},{kind:'cancel-requested'},{kind:'process-exited',cancelled:true}]}};
   const q=await qualifyInvestigationAdapter(`fixture:${kind}-isolation`,identity,f.repo,false,{origin:'scripted-fixture',read:async()=>evidence},[version]);assert.equal(q.origin,'scripted-fixture');
   const broad={...effective,builtinTools:['exec_command'],mcpServers:['insrc-scoped-review','inherited-insrc']};
   await assert.rejects(()=>qualifyInvestigationAdapter(`fixture:${kind}-readonly-is-not-isolation`,identity,f.repo,false,{origin:'scripted-fixture',read:async()=>({...evidence,effective:broad,trace:{...evidence.trace,effectiveDigest:digestValue(broad)}})},[version]),/Inherited configuration/);
   await f.store.prepare(manifest);const lease=await f.store.claim(300000),outer=new AbortController();let nativeFailure:unknown,calls=0,issuedBinding:ReturnType<typeof createQualifiedInvestigationBinding>|undefined;
   await runRecoveredContinuation(f.store,lease,baseTurn,{...context,schema,signal:outer.signal,backend:{...context.backend,execute:async(turn,tools,signal)=>{
    const wrapped={...tools,progress:async(p:Parameters<typeof tools.progress>[0])=>{const ack=await tools.progress(p);if(mode==='cancel')setTimeout(()=>outer.abort(),20);return ack;}};
    const binding=createQualifiedInvestigationBinding(q,turn,wrapped,{processEpoch:f.options.processEpoch,assertProcessOwner:()=>{},assertCurrent:()=>f.store.assertLease(f.store.replay(),lease.leaseId,lease.generation),state:()=>f.store.replay().state});
    issuedBinding=binding;
    const base={binding,prompt:'Review the supplied packet',schema,opts:{cwd:f.repo,deadlineMs:300000,stallMs:mode==='stall'?1000:300000,internalRetry:false,signal,reviewBudget:tools.execution.budget},binaryPath:bin,modelArgs,profile,evidenceScope:'scripted-fixture' as const,
     invoke:async(argv:readonly string[],prompt:string,exec:{cwd:string;binaryPath:string;timeoutMs:number;stallMs:number;signal:AbortSignal;env:NodeJS.ProcessEnv})=>{calls++;if(codex)assert.equal(readFileSync(argv[argv.indexOf('--output-schema')+1]!,'utf8'),JSON.stringify(codexStrictSchema(schema)));const result=await runInProcessGroup(exec.binaryPath,argv,{cwd:exec.cwd,env:exec.env,stdin:prompt,timeoutMs:exec.timeoutMs,stall:{ms:exec.stallMs,started:()=>false,silence:true},signal:exec.signal});if(result.aborted)throw new DOMException('cancelled','AbortError');if(result.stalled)throw Error('fixture stall watchdog');assert.equal(result.exitCode,0,result.stderr);return codex?JSON.parse(JSON.parse(result.stdout.trim().split('\n').at(-1)!).item.text):JSON.parse(result.stdout).structured_output;}};
    await assert.rejects(()=>run({...base,prompt:'x'.repeat(1000000)}),{code:'budget-refused'});assert.equal(calls,0);
    await assert.rejects(()=>run({...base,evidenceScope:'installed-probe'}),/fixtures do not certify/);assert.equal(calls,0);
    await assert.rejects(()=>new CliProvider({kind,binPath:bin}).runReviewSession('must not run',schema,{...base.opts,investigationBinding:binding}),/fixtures do not certify/);assert.equal(existsSync(join(f.repo,'called.json')),false);
    try{return await run(base);}catch(cause){nativeFailure=cause;throw cause;}
   }}});
   // S3's cancellation wait returns promptly; await the actual fixture provider's teardown before asserting/cleanup.
   if(issuedBinding)await drainInvestigationInvocation(issuedBinding);
   if(mode==='complete'&&nativeFailure)throw nativeFailure;
   assert.equal(calls,1);assert.equal(f.store.status().blockCheckpoints.length,mode==='complete'||mode==='bad-final'?2:1);assert.equal(f.store.status().attempts.length,1);
   if(mode!=='complete')assert.ok(nativeFailure);if(mode==='bad-final')assert.match(String(nativeFailure),/does not match accepted/);
   assert.equal(existsSync(join(cwd,'investigation-binding.json')),false);if(codex)assert.equal(existsSync(join(cwd,'investigation-schema.json')),false);
   const called=JSON.parse(readFileSync(join(f.repo,'called.json'),'utf8'));assert.equal(called.cwd,cwd);assert.equal(called.env.HOME,process.env.HOME);assert.equal(called.env.NODE_OPTIONS,undefined);assert.equal(called.env.ANTHROPIC_API_KEY,undefined);
  }finally{f.cleanup();rmSync(cwd,{recursive:true,force:true});}
 }
 const env=nativeInvestigationEnvironment({HOME:'/existing-auth-home',PATH:'/bin',NODE_OPTIONS:'--require evil',ANTHROPIC_API_KEY:'not-copied',CLAUDE_PLUGIN_ROOT:'/untrusted'});assert.deepEqual(env,{TERM:'dumb',HOME:'/existing-auth-home',PATH:'/bin'});
 assert.equal(nativeInvestigationEnvironment({CLAUDE_CONFIG_DIR:'/existing-cli-auth'}).CLAUDE_CONFIG_DIR,'/existing-cli-auth');
 assert.equal(nativeInvestigationEnvironment({CODEX_HOME:'/existing-codex-auth'}).CODEX_HOME,'/existing-codex-auth');
}
