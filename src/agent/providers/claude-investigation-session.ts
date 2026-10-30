/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { join, dirname } from 'node:path';
import type { StructuredSchema } from '../../shared/types.js';
import { scopedReviewToolCatalog } from '../../shared/review-investigation-catalog.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';
import { CLAUDE_V2_ADAPTER } from '../../shared/review-isolation-evidence.js';
import { runNativeInvestigationSession,nativeReviewMcpConfiguration,nativeInvestigationEnvironment,INVESTIGATION_SYSTEM_PROMPT } from './native-investigation-session.js';
import type { NativeInvestigationInvocation,NativeInvestigationAdapter } from './native-investigation-session.js';
export { nativeReviewMcpConfiguration,nativeInvestigationEnvironment,INVESTIGATION_SYSTEM_PROMPT } from './native-investigation-session.js';
export const CLAUDE_INVESTIGATION_ADAPTER=CLAUDE_V2_ADAPTER;
export const CLAUDE_INVESTIGATION_SETTINGS = Object.freeze({
 enabledPlugins: Object.freeze({'cc-plugin-agents-md@builtin':false,'cc-plugin-telemetry@builtin':false,'cc-plugin-plugin-authoring@builtin':false}),
 disableAllHooks:true, autoMemoryEnabled:false, claudeMdExcludes:Object.freeze(['**']),
});
export function claudeInvestigationArgs(schema:StructuredSchema,modelArgs:readonly string[],cwd:string,indexed:boolean):string[]{
 const allowed=scopedReviewToolCatalog(indexed).map(t=>`mcp__insrc-scoped-review__${t.name}`).join(',');
 // Safe mode disables even explicitly configured MCP servers, including our bridge.
 // Keep launch restrictions explicit; qualification still requires runtime evidence.
 return ['--print','--output-format','stream-json','--verbose','--include-hook-events','--json-schema',JSON.stringify(schema),'--setting-sources','',
  '--settings',join(cwd,'investigation-settings.json'),'--strict-mcp-config','--mcp-config',join(cwd,'investigation-mcp.json'),
  '--restricted','--no-chrome','--debug-file',join(cwd,'investigation-debug.log'),
  '--tools','','--allowedTools',allowed,'--disable-slash-commands','--permission-mode','dontAsk','--permission-prompts','none',
  '--no-session-persistence','--system-prompt',INVESTIGATION_SYSTEM_PROMPT,...modelArgs];
}
export const claudeInvestigationLaunchDigest=(args:readonly string[],cwd:string)=>digestValue({adapter:CLAUDE_INVESTIGATION_ADAPTER,args,cwd,environment:nativeInvestigationEnvironment(),auth:'existing-cli-oauth'});
export const CLAUDE_PROBE_CONTROL_SCHEMA: StructuredSchema = Object.freeze({type:'object',properties:{control:{type:'boolean'}},required:['control'],additionalProperties:false});
export const CLAUDE_PROBE_CONTROL_CATALOG = JSON.stringify([{name:'mcp__inert-probe__canary_unscoped',description:'Harmless isolation marker',inputSchema:{type:'object',properties:{}}}]);
/** Fixed probe-only template. Never a configurable wire argument surface. */
export function claudeInvestigationControlArgs(modelArgs:readonly string[],cwd:string,indexed:boolean):string[]{
 const args=claudeInvestigationArgs(CLAUDE_PROBE_CONTROL_SCHEMA,modelArgs,cwd,indexed).filter(a=>a!=='--restricted'),root=dirname(cwd);
 for(const [flag,value] of [['--settings',join(root,'canary-control-settings.json')],['--mcp-config',join(root,'synthetic-config','synthetic-mcp.json')],
  ['--setting-sources','project,local'],['--allowedTools','mcp__inert-probe__canary_unscoped'],['--debug-file',join(root,'native-control-debug.log')]] as const){
  const i=args.indexOf(flag);if(i<0)throw Error('Control template flag missing');args[i+1]=value;
 }
 return [...args,'--plugin-dir',join(root,'synthetic-config','plugin-canary')];
}
const adapter:NativeInvestigationAdapter={kind:'claude',version:CLAUDE_INVESTIGATION_ADAPTER,args:claudeInvestigationArgs,launchDigest:claudeInvestigationLaunchDigest,
 configuration:(cwd,indexed)=>({[join(cwd,'investigation-settings.json')]:CLAUDE_INVESTIGATION_SETTINGS,[join(cwd,'investigation-mcp.json')]:nativeReviewMcpConfiguration(cwd,indexed)})};
export { adapter as claudeInvestigationAdapter };
export type ClaudeInvestigationInvocation=Omit<NativeInvestigationInvocation,'adapter'>;
export const runClaudeInvestigationSession=(input:ClaudeInvestigationInvocation)=>runNativeInvestigationSession({...input,adapter});
