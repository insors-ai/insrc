/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { join } from 'node:path';
import type { StructuredSchema } from '../../shared/types.js';
import { scopedReviewToolCatalog } from '../../shared/review-investigation-catalog.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';
import { runNativeInvestigationSession,nativeReviewMcpConfiguration,nativeInvestigationEnvironment,INVESTIGATION_SYSTEM_PROMPT } from './native-investigation-session.js';
import type { NativeInvestigationInvocation,NativeInvestigationAdapter } from './native-investigation-session.js';
export { nativeReviewMcpConfiguration,nativeInvestigationEnvironment,INVESTIGATION_SYSTEM_PROMPT } from './native-investigation-session.js';
export const CLAUDE_INVESTIGATION_ADAPTER='claude-scoped-v1';
export function claudeInvestigationArgs(schema:StructuredSchema,modelArgs:readonly string[],cwd:string,indexed:boolean):string[]{
 const allowed=scopedReviewToolCatalog(indexed).map(t=>`mcp__insrc-scoped-review__${t.name}`).join(',');
 return ['--print','--output-format','json','--json-schema',JSON.stringify(schema),'--safe-mode','--setting-sources','',
  '--settings',join(cwd,'investigation-settings.json'),'--strict-mcp-config','--mcp-config',join(cwd,'investigation-mcp.json'),
  '--tools','','--allowedTools',allowed,'--disable-slash-commands','--permission-mode','dontAsk','--permission-prompts','none',
  '--no-session-persistence','--system-prompt',INVESTIGATION_SYSTEM_PROMPT,...modelArgs];
}
export const claudeInvestigationLaunchDigest=(args:readonly string[],cwd:string)=>digestValue({adapter:CLAUDE_INVESTIGATION_ADAPTER,args,cwd,environment:nativeInvestigationEnvironment(),auth:'existing-cli-oauth'});
const adapter:NativeInvestigationAdapter={kind:'claude',version:CLAUDE_INVESTIGATION_ADAPTER,args:claudeInvestigationArgs,launchDigest:claudeInvestigationLaunchDigest,
 configuration:(cwd,indexed)=>({[join(cwd,'investigation-settings.json')]:{},[join(cwd,'investigation-mcp.json')]:nativeReviewMcpConfiguration(cwd,indexed)})};
export type ClaudeInvestigationInvocation=Omit<NativeInvestigationInvocation,'adapter'>;
export const runClaudeInvestigationSession=(input:ClaudeInvestigationInvocation)=>runNativeInvestigationSession({...input,adapter});
