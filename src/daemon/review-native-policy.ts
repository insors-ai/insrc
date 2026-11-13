/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { access,realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter,isAbsolute,join } from 'node:path';
import type { ReviewNativeCommand,ReviewIntentReceipt } from '../shared/review-native.js';
import type { ReviewKey } from '../shared/review-resources.js';
import { REVIEW_GIT_PREFIX } from './tools/review-git-command.js';
import { gitEnvironment } from './tools/git-isolation.js';
import { gitCatFileTool } from './tools/builtins/git/cat-file.js';
import { gitMergeBaseTool } from './tools/builtins/git/merge-base.js';
import { gitDiffTool } from './tools/builtins/git/diff.js';
import { gitPathHistoryTool } from './tools/builtins/git/path-history.js';
import { PATH_HISTORY_FORMAT } from './tools/builtins/git/parsers.js';
import { getTool } from './tools/registry.js';
import { isDefinitionOf } from './tools/provenance.js';
import { buildApprovalRequest,resolveApprovalClass,shouldAsk } from './tools/approval-policy.js';
import { readCommonApprovalMode } from '../shared/common-approval.js';
import { getApprovalGate } from './approval.js';
import type { Tool,ToolInput } from './tools/types.js';
import { REVIEW_SESSION_READ_TOOLS,REVIEW_SESSION_ANALYZE_TOOLS } from '../agent/providers/cli-provider.js';

const names=['git','claude','codex','vibe','vibe-app-server'] as const;
/** Host-only PATH lookup: no worker-local `which` subprocess. */
export async function resolveReviewBinary({command}:{readonly command:string}):Promise<string>{
 if(!names.includes(command as typeof names[number]))throw new Error('Unsupported review executable');
 for(const dir of (process.env['PATH']??'').split(delimiter)){
  if(!dir||!isAbsolute(dir))continue;
  const candidate=join(dir,command);try{await access(candidate,constants.X_OK);return await realpath(candidate);}catch{}
 }
 throw new Error(`Review executable unavailable: ${command}`);
}
const oid=(s:string|undefined)=>!!s&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s);
function path(s:string):boolean{return!!s&&!s.startsWith('/')&&!/[\\\0\r\n]/.test(s)&&!s.split('/').some(p=>p==='..'||p==='');}
const object=(s:string)=>oid(s)||!!/^(?:[a-f0-9]{40}|[a-f0-9]{64}):/.test(s)&&path(s.slice(s.indexOf(':')+1));
function sourceTool(command:ReviewNativeCommand):{tool:Tool;input:ToolInput}{
 if(!REVIEW_GIT_PREFIX.every((a,i)=>command.args[i]===a))throw new Error('Review Git isolation is missing');
 const expected=Object.fromEntries(Object.entries(gitEnvironment()).filter(([,v])=>v!==undefined));
 if(JSON.stringify(Object.entries(command.env??{}).sort())!==JSON.stringify(Object.entries(expected).sort()))throw new Error('Review Git environment is not isolated');
 const [verb,...args]=command.args.slice(REVIEW_GIT_PREFIX.length),cwd=command.cwd;
 if(verb==='cat-file'&&args.length===1&&['--batch','--batch-check'].includes(args[0]!))return{tool:gitCatFileTool,input:{cwd,rev:'<streamed object query>',isolated:true}};
 if(verb==='merge-base'&&args.length===3&&args[0]==='--is-ancestor'&&oid(args[1])&&oid(args[2]))return{tool:gitMergeBaseTool,input:{cwd,a:args[1],b:args[2],isAncestor:true}};
 if(verb==='diff'){
  const boundary=args.indexOf('--'),front=boundary<0?args:args.slice(0,boundary),paths=boundary<0?[]:args.slice(boundary+1);
  const flags=new Set(['--no-ext-diff','--no-textconv','--no-color','--numstat','-z','-U0']);
  const refs=front.filter(a=>!flags.has(a));
  if(!front.includes('--no-ext-diff')||!front.includes('--no-textconv')||paths.some(p=>!path(p)))throw new Error('Unsupported review diff arguments');
  const range=refs.length===1?refs[0]!.split('..'):[];
  if(!(range.length===2&&range.every(oid))&&!(refs.length===2&&refs.every(object)))throw new Error('Review diff must use pinned objects');
  return{tool:gitDiffTool,input:{cwd,from:range[0]??refs[0],to:range[1]??refs[1],paths,objectPair:refs.length===2,context:0}};
 }
 if(verb==='log'){
  const prefix=['--no-textconv','--no-ext-diff','-z',`--format=${PATH_HISTORY_FORMAT}`];
  // Normalization adds the two safety flags in reverse insertion order.
  if(prefix.every((v,i)=>args[i]===v)&&args.length===8&&args[4]==='--full-history'&&args[5]!.split('..').length===2&&args[5]!.split('..').every(oid)&&args[6]==='--'&&path(args[7]!))return{tool:gitPathHistoryTool,input:{cwd,rev:args[5],path:args[7],fullHistory:true}};
 }
 throw new Error('Unsupported review source command');
}
function readonlyCli(kind:'claude'|'codex',args:readonly string[],key:ReviewKey):void{
 const pairs=new Map<string,string>(),booleans=new Set(kind==='claude'?['--print','--verbose','--include-partial-messages']:['--json']);
 let start=0;if(kind==='codex'){if(args[0]!=='exec')throw new Error('Readonly Codex exec required');start=1;}
 const allowed=new Set(kind==='claude'?['--output-format','--json-schema','--tools','--allowedTools','--model','--effort']:['--output-schema','--sandbox','-C','--model','-c']);
 for(let i=start;i<args.length;i++){
  const flag=args[i]!;if(booleans.has(flag))continue;
  if(!allowed.has(flag)||pairs.has(flag)||i+1>=args.length)throw new Error('Unsupported review CLI arguments');
  pairs.set(flag,args[++i]!);
 }
 if(kind==='codex'){
  if(!args.includes('--json')||pairs.get('--sandbox')!=='read-only'||pairs.get('-C')!==key.project||!isAbsolute(pairs.get('--output-schema')??''))throw new Error('Readonly Codex review profile required');
  if(pairs.has('-c')&&!/^model_reasoning_effort=[a-z]+$/.test(pairs.get('-c')!))throw new Error('Unsupported review Codex configuration');
 }else{
  const tools=(pairs.get('--tools')??'').split(','),allowedTools=(pairs.get('--allowedTools')??'').split(',');
  if(!args.includes('--print')||!['json','stream-json'].includes(pairs.get('--output-format')??'')||!pairs.has('--json-schema')||REVIEW_SESSION_READ_TOOLS.some(t=>!tools.includes(t))||tools.some(t=>!REVIEW_SESSION_READ_TOOLS.includes(t)&&!(t==='Bash'&&key.family==='code')))throw new Error('Readonly Claude review profile required');
  if(allowedTools.some(t=>![...REVIEW_SESSION_READ_TOOLS,...REVIEW_SESSION_ANALYZE_TOOLS].includes(t)&&!(key.family==='code'&&/^Bash\([A-Za-z0-9_./:@=+ -]+\)$/.test(t))))throw new Error('Unsupported review Claude tool grant');
 }
}
/** Permission is derived from actual argv, the host's registered definitions,
 * and the private durable-intent receipt, never a caller's reviewer claim. */
export async function authorizeReviewNative(key:ReviewKey,command:ReviewNativeCommand,reviewer:'daemon'|'controller',signal:AbortSignal,receipt:ReviewIntentReceipt|undefined):Promise<void>{
 if(signal.aborted||await realpath(command.cwd)!==key.project)throw new Error('Review native scope is unavailable');
 if(command.kind==='tool'){
  const binary=await resolveReviewBinary({command:'git'});if(command.command!=='git'&&command.command!==binary)throw new Error('Unsupported native review tool');
  const {tool,input}=sourceTool(command),registered=getTool(tool.id);
  if(!registered||!isDefinitionOf(registered,tool))throw new Error('Review tool provenance is unavailable');
  const cls=resolveApprovalClass(registered,input);
  if(cls!=='none'&&shouldAsk(cls,{},readCommonApprovalMode())){
   const request=await buildApprovalRequest({tool:registered,cls,input,deps:{repoPath:key.project}}),answer=await getApprovalGate().ask(request,signal);
   if(typeof answer==='string'||answer.requestId!==request.requestId||answer.decision!=='approve')throw new Error('Review native permission denied');
  }
  return;
 }
 if(command.kind!=='cli'||reviewer!=='daemon'||receipt?.sourceValidation!=='qualified')throw new Error('Qualified independent reviewer required for native inference');
 // Vibe's app-server receives its readonly session configuration over stdin;
 // CliProvider verifies the effective runtime tool policy before turn/start.
 let vibe:string|undefined;try{vibe=await resolveReviewBinary({command:'vibe-app-server'});}catch{}
 if(command.command===vibe){if(command.args.length!==0||!command.keepStdinOpen)throw new Error('Unsupported Vibe app-server arguments');return;}
 for(const kind of ['claude','codex'] as const){let binary:string;try{binary=await resolveReviewBinary({command:kind});}catch{continue;}if(command.command===binary){readonlyCli(kind,command.args,key);return;}}
 throw new Error('Unsupported review CLI executable');
}
