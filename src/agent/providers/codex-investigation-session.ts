/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants,openSync,closeSync,writeFileSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { StructuredSchema } from '../../shared/types.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';
import { codexStrictSchema } from './structured-output.js';
import { runNativeInvestigationSession,nativeReviewMcpConfiguration,nativeInvestigationEnvironment,INVESTIGATION_SYSTEM_PROMPT } from './native-investigation-session.js';
import type { NativeInvestigationInvocation,NativeInvestigationAdapter } from './native-investigation-session.js';

export const CODEX_INVESTIGATION_ADAPTER='codex-scoped-v1';
/** Candidate flags are not qualification. The independently observed effective catalogue must still match exactly. */
export const CODEX_INVESTIGATION_DISABLED_FEATURES=Object.freeze(['shell_tool','unified_exec','shell_snapshot','hooks','plugins','remote_plugin','plugin_sharing',
 'multi_agent','multi_agent_v2','runtime_agent_instances','browser_use','browser_use_external','browser_use_full_cdp_access','browser_annotation_api',
 'computer_use','image_generation','view_image','in_app_browser','enable_mcp_apps','skill_search','skill_mcp_dependency_install','standalone_web_search','tool_call_mcp_elicitation']);
export const codexInvestigationSchemaPath=(cwd:string)=>join(cwd,'investigation-schema.json');
export function codexInvestigationArgs(_schema:StructuredSchema,modelArgs:readonly string[],cwd:string,indexed:boolean):string[]{
 const servers=nativeReviewMcpConfiguration(cwd,indexed).mcpServers;
 const table=`{${Object.entries(servers).map(([name,s])=>`${JSON.stringify(name)}={command=${JSON.stringify(s.command)},args=${JSON.stringify(s.args)},tool_timeout_sec=300}`).join(',')}}`;
 return ['exec','--ignore-user-config','--ignore-rules','--strict-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--json','--color','never',
  '--output-schema',codexInvestigationSchemaPath(cwd),'-C',cwd,'-c','approval_policy="never"','-c','project_doc_max_bytes=0','-c','web_search="disabled"',
  '-c',`developer_instructions=${JSON.stringify(INVESTIGATION_SYSTEM_PROMPT)}`,'-c',`mcp_servers=${table}`,
  ...CODEX_INVESTIGATION_DISABLED_FEATURES.flatMap(name=>['--disable',name]),...modelArgs];
}
export const codexInvestigationLaunchDigest=(args:readonly string[],cwd:string,schema:StructuredSchema)=>digestValue({adapter:CODEX_INVESTIGATION_ADAPTER,args,cwd,
 environment:nativeInvestigationEnvironment(),wireSchema:JSON.stringify(codexStrictSchema(schema)),auth:'existing-cli-oauth'});
const adapter:NativeInvestigationAdapter={kind:'codex',version:CODEX_INVESTIGATION_ADAPTER,args:codexInvestigationArgs,launchDigest:codexInvestigationLaunchDigest,
 configuration:(cwd,indexed)=>({[join(cwd,'investigation-mcp.json')]:nativeReviewMcpConfiguration(cwd,indexed)}),
 prepareLaunch:(cwd,schema)=>{const path=codexInvestigationSchemaPath(cwd),fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,JSON.stringify(codexStrictSchema(schema)));}catch(cause){try{unlinkSync(path);}catch{/* Retain a private failed temporary if cleanup is unavailable. */}throw cause;}finally{closeSync(fd);}return ()=>unlinkSync(path);}
};
export type CodexInvestigationInvocation=Omit<NativeInvestigationInvocation,'adapter'>;
export { adapter as codexInvestigationAdapter };
export const runCodexInvestigationSession=(input:CodexInvestigationInvocation)=>runNativeInvestigationSession({...input,adapter});
