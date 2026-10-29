#!/usr/bin/env node
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import {isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {mkdtempSync,writeFileSync} from 'node:fs';

export const PROBE_PREREQUISITES=Object.freeze([
 'independent-installed-probe-attestation-and-trust-anchor','approved-mode-specific-probe-record',
 'independently-approved-oracle-and-evaluation','approved-readiness-record','approved-predecessor-AMD',
 'approved-commit-parent-block-scope-and-complete-BUILD','explicit-test-opt-in','actual-production-acceptance-and-activation-signoff',
]);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** IPC only. No DB, provider, signing, configuration or approval operations. */
export async function runProbeOperator(argv,rpc){
 const [operation,...args]=argv,options={};
 if(!['start','status','cancel','export','prerequisites'].includes(operation))throw Error('Use start/status/cancel/export/prerequisites');
 for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];
  if(!['--repo','--mode','--request-id','--probe-id'].includes(key)||!value||Object.hasOwn(options,key))throw Error('Invalid or duplicate operator option');
  options[key]=value;
 }
 if(!options['--repo']||!isAbsolute(options['--repo']))throw Error('An absolute registered --repo is required');
 if(operation==='prerequisites'){
  if(Object.keys(options).length!==1)throw Error('prerequisites takes only --repo');
  const capabilities=await rpc('codeReview.investigation.capabilities',{});
  return {version:1,kind:'probe-operator-prerequisites',readOnly:true,activationReady:false,
   verification:'not-established-by-this-client',required:PROBE_PREREQUISITES,capabilities};
 }
 const command={version:1,operation,repo:options['--repo']};
 if(operation==='start'){
  if(!uuid.test(options['--request-id']??'')||!['source-only','indexed-impact'].includes(options['--mode'])||options['--probe-id'])throw Error('start requires --request-id UUID and explicit --mode');
  command.requestId=options['--request-id'];command.sourceMode=options['--mode'];
  // This program has no model conversation. The one-token host reserve is an
  // explicit wire estimate; the daemon separately pins the native model budget.
  command.reviewBudget={version:1,hostContextReserveTokens:1,profile:{profileVersion:1,providerId:'probe-operator',transport:'controller',transportVersion:'1',
   schemaDialect:'controller-json-v1',promptDialect:'controller-frame-v1',qualification:'controller-reserved',declaredToolsJson:'[]',
   nativeReserveTokens:0,transportReserveTokens:1024,completionReserveTokens:1024,inspectionReserveTokens:0}};
 }else{
  if(!uuid.test(options['--probe-id']??'')||options['--mode']||options['--request-id'])throw Error('Operation requires --probe-id UUID');
  command.probeId=options['--probe-id'];
 }
 const result=await rpc('codeReview.investigation.probe',command);
 if(result?.next==='error')throw Error('Probe operation refused; no review or fallback was invoked');
 return result;
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const {rpc}=await import('../out/shared/ipc-client.js');
  const result=await runProbeOperator(process.argv.slice(2),(method,params)=>rpc(method,params,undefined,{timeoutMs:15000}));
  if(process.argv[2]==='export'&&result.report){
   const directory=mkdtempSync(join(tmpdir(),'insrc-probe-export-')),path=join(directory,'observations.json');
   writeFileSync(path,JSON.stringify(result.report,null,2)+'\n',{mode:0o600,flag:'wx'});
   process.stdout.write(JSON.stringify({version:1,next:'exported',path,status:result.status,activationReady:false})+'\n');
  }else process.stdout.write(JSON.stringify(result)+'\n');
 }catch{process.stderr.write('Probe operator failed. Check arguments, daemon support and diagnostic status; no automatic retry was made.\n');process.exitCode=1;}
}
